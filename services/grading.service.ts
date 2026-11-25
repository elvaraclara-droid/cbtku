import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { gradeQuestionResponse } from "@/lib/grading/auto-grader";
import { recordAuditLog } from "@/lib/security/audit";
import type { McmaScoringMode, QuestionType, UserRole } from "@/types/database";

export async function gradeAttemptOnServer(attemptId: string) {
  const admin = createSupabaseAdminClient();

  const { data: attempt, error: attemptErr } = await admin
    .from("exam_attempts")
    .select("id, school_id, exam_id, session_id, student_id")
    .eq("id", attemptId)
    .single();

  if (attemptErr || !attempt) {
    throw new Error("Attempt tidak ditemukan untuk proses penilaian.");
  }

  const [{ data: exam }, { data: examQuestions }, { data: answers }] =
    await Promise.all([
      admin
        .from("exams")
        .select("id, passing_score, mcma_scoring_mode, allow_negative_score, show_result_immediately, results_published")
        .eq("id", attempt.exam_id)
        .single(),
      admin
        .from("exam_questions")
        .select("question_id, weight, question_order")
        .eq("exam_id", attempt.exam_id)
        .order("question_order", { ascending: true }),
      admin
        .from("student_answers")
        .select("id, question_id, selected_option_id, selected_option_ids, statement_answers, essay_answer")
        .eq("attempt_id", attempt.id),
    ]);

  if (!exam || !examQuestions) {
    throw new Error("Data soal ujian tidak ditemukan.");
  }

  const questionIds = examQuestions.map((eq) => eq.question_id);
  const [{ data: questions }, { data: options }, { data: statements }] =
    await Promise.all([
      admin
        .from("questions")
        .select("id, question_type, mcma_scoring_mode, allow_negative_score")
        .in("id", questionIds),
      admin
        .from("question_options")
        .select("id, question_id, is_correct")
        .in("question_id", questionIds),
      admin
        .from("question_statements")
        .select("id, question_id, is_true, weight")
        .in("question_id", questionIds),
    ]);

  const questionMap = new Map((questions || []).map((q) => [q.id, q]));
  const answerMap = new Map((answers || []).map((a) => [a.question_id, a]));

  let autoScore = 0;
  let manualScore = 0;
  let maxPossibleScore = 0;
  let hasPendingManual = false;

  for (const eq of examQuestions) {
    const q = questionMap.get(eq.question_id);
    if (!q) continue;

    const qOptions = (options || []).filter((o) => o.question_id === q.id);
    const qStatements = (statements || []).filter((s) => s.question_id === q.id);
    const ans = answerMap.get(q.id);

    const result = gradeQuestionResponse(
      {
        questionId: q.id,
        questionType: q.question_type as QuestionType,
        weight: Number(eq.weight),
        mcmaScoringMode: (exam.mcma_scoring_mode || q.mcma_scoring_mode) as McmaScoringMode,
        allowNegativeScore: Boolean(exam.allow_negative_score || q.allow_negative_score),
        options: qOptions,
        statements: qStatements.map((s) => ({
          id: s.id,
          is_true: s.is_true,
          weight: Number(s.weight),
        })),
      },
      ans
        ? {
            selectedOptionId: ans.selected_option_id,
            selectedOptionIds: ans.selected_option_ids || [],
            statementAnswers: (ans.statement_answers || {}) as Record<string, boolean>,
            essayAnswer: ans.essay_answer,
          }
        : null
    );

    maxPossibleScore += result.maxScore;

    if (result.gradingStatus === "pending_manual") {
      hasPendingManual = true;
    } else {
      autoScore += result.awardedScore;
    }

    if (ans) {
      const { data: detail } = await admin
        .from("answer_details")
        .upsert(
          {
            school_id: attempt.school_id,
            exam_id: attempt.exam_id,
            attempt_id: attempt.id,
            student_id: attempt.student_id,
            student_answer_id: ans.id,
            question_id: q.id,
            max_score: result.maxScore,
            awarded_score: result.awardedScore,
            is_correct: result.isCorrect,
            grading_status: result.gradingStatus,
            evaluation_breakdown: result.breakdown,
            server_timestamp: new Date().toISOString(),
          },
          { onConflict: "attempt_id,question_id" }
        )
        .select("id, awarded_score, grading_status")
        .single();

      if (result.gradingStatus === "pending_manual" && detail) {
        const { data: existingManual } = await admin
          .from("manual_grading")
          .select("id, status, awarded_score")
          .eq("attempt_id", attempt.id)
          .eq("question_id", q.id)
          .maybeSingle();

        if (existingManual?.status === "graded") {
          manualScore += Number(existingManual.awarded_score);
        } else {
          await admin.from("manual_grading").upsert(
            {
              school_id: attempt.school_id,
              exam_id: attempt.exam_id,
              attempt_id: attempt.id,
              student_id: attempt.student_id,
              question_id: q.id,
              answer_detail_id: detail.id,
              max_score: result.maxScore,
              awarded_score: 0,
              status: "pending",
            },
            { onConflict: "attempt_id,question_id" }
          );
        }
      }
    }
  }

  const totalScore = Math.round((autoScore + manualScore) * 100) / 100;
  const percentage =
    maxPossibleScore > 0
      ? Math.round(((totalScore / maxPossibleScore) * 100) * 100) / 100
      : 0;
  const isPassed = percentage >= Number(exam.passing_score);
  const gradingStatus = hasPendingManual ? "needs_manual" : "completed";
  const shouldPublish = Boolean(
    exam.results_published || (exam.show_result_immediately && !hasPendingManual)
  );

  const { data: examResult, error: resErr } = await admin
    .from("exam_results")
    .upsert(
      {
        school_id: attempt.school_id,
        exam_id: attempt.exam_id,
        session_id: attempt.session_id,
        student_id: attempt.student_id,
        attempt_id: attempt.id,
        auto_score: Math.round(autoScore * 100) / 100,
        manual_score: Math.round(manualScore * 100) / 100,
        total_score: totalScore,
        max_possible_score: Math.round(maxPossibleScore * 100) / 100,
        percentage,
        is_passed: isPassed,
        grading_status: gradingStatus,
        is_published: shouldPublish,
        published_at: shouldPublish ? new Date().toISOString() : null,
        server_timestamp: new Date().toISOString(),
      },
      { onConflict: "attempt_id" }
    )
    .select("*")
    .single();

  if (resErr) {
    throw new Error(resErr.message);
  }

  return examResult;
}

export async function applyManualGradeScore(params: {
  manualGradingId: string;
  awardedScore: number;
  graderNote: string;
  reason: string;
  actorId: string;
  actorRole: UserRole;
  schoolId: string;
}) {
  const admin = createSupabaseAdminClient();

  const { data: item, error: findErr } = await admin
    .from("manual_grading")
    .select("*")
    .eq("id", params.manualGradingId)
    .eq("school_id", params.schoolId)
    .single();

  if (findErr || !item) {
    throw new Error("Item penilaian manual tidak ditemukan.");
  }

  if (params.awardedScore < 0 || params.awardedScore > Number(item.max_score)) {
    throw new Error(`Skor harus berada antara 0 hingga ${item.max_score}.`);
  }

  const nowIso = new Date().toISOString();

  await admin
    .from("manual_grading")
    .update({
      awarded_score: params.awardedScore,
      grader_note: params.graderNote,
      status: "graded",
      graded_by: params.actorId,
      graded_at: nowIso,
    })
    .eq("id", item.id);

  if (item.answer_detail_id) {
    await admin
      .from("answer_details")
      .update({
        awarded_score: params.awardedScore,
        grading_status: "manual_graded",
        is_correct: params.awardedScore >= Number(item.max_score) * 0.5,
        updated_by: params.actorId,
      })
      .eq("id", item.answer_detail_id);
  }

  await admin.from("grading_history").insert({
    school_id: item.school_id,
    exam_id: item.exam_id,
    attempt_id: item.attempt_id,
    question_id: item.question_id,
    previous_score: item.awarded_score,
    new_score: params.awardedScore,
    reason: params.reason || params.graderNote || "Penilaian manual guru",
    changed_by: params.actorId,
  });

  // Recalculate attempt totals
  const [{ data: allManual }, { data: currentResult }, { data: exam }] = await Promise.all([
    admin
      .from("manual_grading")
      .select("awarded_score, status")
      .eq("attempt_id", item.attempt_id),
    admin
      .from("exam_results")
      .select("*")
      .eq("attempt_id", item.attempt_id)
      .single(),
    admin
      .from("exams")
      .select("passing_score")
      .eq("id", item.exam_id)
      .single(),
  ]);

  if (currentResult && exam) {
    const manualTotal = (allManual || []).reduce(
      (sum, m) => sum + Number(m.awarded_score || 0),
      0
    );
    const anyPending = (allManual || []).some((m) => m.status === "pending");
    const totalScore = Math.round((Number(currentResult.auto_score) + manualTotal) * 100) / 100;
    const maxScore = Number(currentResult.max_possible_score) || 100;
    const percentage = Math.round(((totalScore / maxScore) * 100) * 100) / 100;

    await admin
      .from("exam_results")
      .update({
        manual_score: Math.round(manualTotal * 100) / 100,
        total_score: totalScore,
        percentage,
        is_passed: percentage >= Number(exam.passing_score),
        grading_status: anyPending ? "needs_manual" : "completed",
        updated_by: params.actorId,
      })
      .eq("id", currentResult.id);
  }

  await recordAuditLog({
    schoolId: item.school_id,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "MANUAL_GRADE_UPDATED",
    entityType: "manual_grading",
    entityId: item.id,
    metadata: {
      attempt_id: item.attempt_id,
      previous_score: item.awarded_score,
      new_score: params.awardedScore,
    },
  });

  return { ok: true };
}
