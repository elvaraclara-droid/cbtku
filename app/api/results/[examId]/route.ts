import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  // NOTE: Supervisor is intentionally excluded from modifying/viewing grading sheets if unauthorized,
  // only teachers, school_admin, and super_admin manage results & item analysis.
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { examId } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("*, subjects(name, code)")
    .eq("id", examId)
    .single();

  if (!exam) return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const [{ data: results }, { data: manualQueue }, { data: answerDetails }, { data: examQuestions }] =
    await Promise.all([
      admin
        .from("exam_results")
        .select("*, students(nis, nisn, class_id, classes(name), profiles!students_profile_id_fkey(full_name, username))")
        .eq("exam_id", examId)
        .order("percentage", { ascending: false }),
      admin
        .from("manual_grading")
        .select("*, questions(stem_plain, essay_rubric), students(nis, profiles!students_profile_id_fkey(full_name))")
        .eq("exam_id", examId)
        .order("status"),
      admin
        .from("answer_details")
        .select("question_id, is_correct, awarded_score, max_score")
        .eq("exam_id", examId),
      admin
        .from("exam_questions")
        .select("question_id, question_order, weight, questions(stem_plain, question_type, difficulty)")
        .eq("exam_id", examId)
        .order("question_order"),
    ]);

  // Attach student essay text to manual queue items
  const manualList = manualQueue || [];
  if (manualList.length > 0) {
    const attemptIds = Array.from(new Set(manualList.map((m) => m.attempt_id)));
    const { data: essayAnswers } = await admin
      .from("student_answers")
      .select("attempt_id, question_id, essay_answer")
      .in("attempt_id", attemptIds);
    const ansLookup = new Map(
      (essayAnswers || []).map((a) => [`${a.attempt_id}:${a.question_id}`, a.essay_answer])
    );
    for (const item of manualList as Array<Record<string, unknown>>) {
      item.essay_answer = ansLookup.get(`${item.attempt_id}:${item.question_id}`) || "";
    }
  }

  const rows = results || [];
  const percentages = rows.map((r) => Number(r.percentage || 0));
  const stats = {
    participantCount: rows.length,
    passedCount: rows.filter((r) => r.is_passed).length,
    averagePercentage:
      percentages.length > 0
        ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 100) / 100
        : 0,
    highestPercentage: percentages.length > 0 ? Math.max(...percentages) : 0,
    lowestPercentage: percentages.length > 0 ? Math.min(...percentages) : 0,
  };

  interface ExamQuestionAnalysisRow {
    question_id: string;
    question_order: number;
    weight: number;
    questions?: { question_type?: string; difficulty?: string; stem_plain?: string } | null;
  }

  // Item analysis
  const itemAnalysis = ((examQuestions || []) as ExamQuestionAnalysisRow[]).map((eq) => {
    const details = (answerDetails || []).filter((d) => d.question_id === eq.question_id);
    const totalAttempts = details.length;
    const correctCount = details.filter((d) => d.is_correct === true).length;
    const avgScore =
      totalAttempts > 0
        ? Math.round(
            (details.reduce((s, d) => s + Number(d.awarded_score || 0), 0) / totalAttempts) *
              100
          ) / 100
        : 0;
    return {
      question_id: eq.question_id,
      question_order: eq.question_order,
      question_type: eq.questions?.question_type || "single_choice",
      difficulty: eq.questions?.difficulty || "medium",
      stem_plain: eq.questions?.stem_plain || "",
      max_weight: Number(eq.weight),
      total_responses: totalAttempts,
      correct_count: correctCount,
      correct_rate: totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 10000) / 100 : 0,
      average_score: avgScore,
    };
  });

  return NextResponse.json({
    exam,
    stats,
    results: rows,
    manualQueue: manualList,
    itemAnalysis,
  });
}
