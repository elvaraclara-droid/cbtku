import "server-only";
import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";
import { gradeAttemptOnServer } from "@/services/grading.service";
import type {
  AttemptStatus,
  StudentExamQuestionDTO,
  StudentSavedAnswerState,
} from "@/types/database";

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function startOrResumeExamAttempt(params: {
  studentProfileId: string;
  examId: string;
  sessionId: string;
  tokenId?: string | null;
  sessionTokenId?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  const { data: student } = await admin
    .from("students")
    .select("id, school_id, status")
    .eq("profile_id", params.studentProfileId)
    .single();

  if (!student || student.status !== "active") {
    throw new Error("Profil siswa tidak aktif.");
  }

  const [{ data: exam }, { data: session }, { data: enrollment }] =
    await Promise.all([
      admin
        .from("exams")
        .select("*")
        .eq("id", params.examId)
        .eq("school_id", student.school_id)
        .single(),
      admin
        .from("exam_sessions")
        .select("*")
        .eq("id", params.sessionId)
        .eq("exam_id", params.examId)
        .single(),
      admin
        .from("exam_session_students")
        .select("*")
        .eq("exam_id", params.examId)
        .eq("session_id", params.sessionId)
        .eq("student_id", student.id)
        .maybeSingle(),
    ]);

  if (!exam || !session || !enrollment || enrollment.status !== "enrolled") {
    throw new Error("Siswa tidak terdaftar pada ujian dan sesi tersebut.");
  }

  // Check if there is an existing non-terminal attempt -> ALWAYS resume same attempt_id!
  const { data: existingAttempts } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("student_id", student.id)
    .order("attempt_number", { ascending: false });

  const openAttempt = (existingAttempts || []).find(
    (a) => !["SUBMITTED", "TERMINATED"].includes(a.status)
  );

  if (openAttempt) {
    // Check optional face verification gate if required and not yet verified
    if (
      exam.face_verification_enabled &&
      !["verified", "manual_approved"].includes(openAttempt.face_verification_status)
    ) {
      return {
        attempt: openAttempt,
        requiresFaceVerification: true,
        serverNow: now.toISOString(),
      };
    }

    // If paused/locked/pending approval, return as-is so student waits for supervisor approval!
    if (["PAUSED", "LOCKED", "PENDING_SUPERVISOR_APPROVAL"].includes(openAttempt.status)) {
      return {
        attempt: openAttempt,
        requiresFaceVerification: false,
        serverNow: now.toISOString(),
      };
    }

    // Transition NOT_STARTED / LOGGED_IN / DISCONNECTED / APPROVED_TO_RESUME -> active state
    const nextStatus: AttemptStatus =
      openAttempt.status === "APPROVED_TO_RESUME"
        ? "RESUMED"
        : openAttempt.status === "NOT_STARTED" ||
            openAttempt.status === "LOGGED_IN" ||
            openAttempt.status === "DISCONNECTED"
          ? "NORMAL"
          : (openAttempt.status as AttemptStatus);

    const { data: updatedAttempt } = await admin
      .from("exam_attempts")
      .update({
        status: nextStatus,
        connection_status: "online",
        last_heartbeat_at: now.toISOString(),
        active_session_token_id: params.sessionTokenId || openAttempt.active_session_token_id,
        server_timestamp: now.toISOString(),
      })
      .eq("id", openAttempt.id)
      .select("*")
      .single();

    return {
      attempt: updatedAttempt || openAttempt,
      requiresFaceVerification: false,
      serverNow: now.toISOString(),
    };
  }

  // Creating a new attempt: verify max_attempts
  const attemptCount = existingAttempts?.length || 0;
  const maxAllowed = exam.max_attempts + (enrollment.extra_attempts_granted || 0);
  if (attemptCount >= maxAllowed && !enrollment.retake_allowed) {
    throw new Error("Batas percobaan ujian telah tercapai.");
  }

  // Load exam questions to build deterministic stored sequence per attempt
  const { data: examQuestions } = await admin
    .from("exam_questions")
    .select("question_id, question_order")
    .eq("exam_id", exam.id)
    .order("question_order", { ascending: true });

  if (!examQuestions || examQuestions.length === 0) {
    throw new Error("Ujian belum memiliki soal.");
  }

  const orderedQuestionIds = exam.shuffle_questions
    ? shuffleArray(examQuestions.map((q) => q.question_id))
    : examQuestions.map((q) => q.question_id);

  // Build option order per question if shuffle_options = true
  const { data: allOptions } = await admin
    .from("question_options")
    .select("id, question_id, sort_order")
    .in("question_id", orderedQuestionIds)
    .order("sort_order", { ascending: true });

  const optionSequences: Record<string, string[]> = {};
  for (const qId of orderedQuestionIds) {
    const qOpts = (allOptions || []).filter((o) => o.question_id === qId).map((o) => o.id);
    optionSequences[qId] = exam.shuffle_options ? shuffleArray(qOpts) : qOpts;
  }

  const durationDeadline = new Date(now.getTime() + exam.duration_minutes * 60 * 1000);
  const sessionEnd = new Date(session.ends_at);
  const effectiveDeadline =
    durationDeadline < sessionEnd ? durationDeadline : sessionEnd;

  const initialStatus: AttemptStatus = exam.face_verification_enabled
    ? "LOGGED_IN"
    : "NORMAL";

  const { data: created, error: createErr } = await admin
    .from("exam_attempts")
    .insert({
      school_id: student.school_id,
      exam_id: exam.id,
      session_id: session.id,
      student_id: student.id,
      token_id: params.tokenId ?? null,
      attempt_number: attemptCount + 1,
      status: initialStatus,
      question_sequence: orderedQuestionIds,
      option_sequences: optionSequences,
      face_verification_status: exam.face_verification_enabled ? "pending" : "not_required",
      active_session_token_id: params.sessionTokenId ?? null,
      connection_status: "online",
      started_at: now.toISOString(),
      deadline_at: effectiveDeadline.toISOString(),
      last_heartbeat_at: now.toISOString(),
      server_timestamp: now.toISOString(),
      created_by: params.studentProfileId,
      updated_by: params.studentProfileId,
    })
    .select("*")
    .single();

  if (createErr || !created) {
    throw new Error(createErr?.message || "Gagal memulai sesi ujian.");
  }

  await admin.from("exam_activity_logs").insert({
    school_id: student.school_id,
    exam_id: exam.id,
    session_id: session.id,
    attempt_id: created.id,
    student_id: student.id,
    user_id: params.studentProfileId,
    activity_type: "ATTEMPT_STARTED",
    description: `Siswa memulai attempt #${created.attempt_number}`,
  });

  return {
    attempt: created,
    requiresFaceVerification: exam.face_verification_enabled,
    serverNow: now.toISOString(),
  };
}

/**
 * Loads sanitized exam payload for student UI.
 * SECURITY INVARIANT: Never selects or sends is_correct, is_true, or explanation_html!
 */
export async function getSanitizedExamPayload(
  attemptId: string,
  studentProfileId: string
) {
  const admin = createSupabaseAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("id, nis, nisn, class_id, profiles!students_profile_id_fkey(full_name)")
    .eq("profile_id", studentProfileId)
    .single();

  if (!student) {
    throw new Error("Data siswa tidak ditemukan.");
  }

  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("student_id", student.id)
    .single();

  if (!attempt) {
    throw new Error("Attempt ujian tidak ditemukan atau bukan milik Anda.");
  }

  const [{ data: exam }, { data: session }, { data: examQuestions }, { data: savedAnswers }] =
    await Promise.all([
      admin
        .from("exams")
        .select("id, title, description, duration_minutes, anti_cheat_config, face_verification_enabled, status, subject_id, subjects(name)")
        .eq("id", attempt.exam_id)
        .single(),
      admin
        .from("exam_sessions")
        .select("id, name, session_number, starts_at, ends_at")
        .eq("id", attempt.session_id)
        .single(),
      admin
        .from("exam_questions")
        .select("question_id, weight")
        .eq("exam_id", attempt.exam_id),
      admin
        .from("student_answers")
        .select("question_id, selected_option_id, selected_option_ids, statement_answers, essay_answer, is_flagged, is_answered, answer_version, server_timestamp")
        .eq("attempt_id", attempt.id),
    ]);

  if (!exam || !session) {
    throw new Error("Konfigurasi ujian tidak ditemukan.");
  }

  const sequence: string[] = Array.isArray(attempt.question_sequence)
    ? attempt.question_sequence
    : [];
  const optionSeqMap = (attempt.option_sequences || {}) as Record<string, string[]>;
  const weightMap = new Map(
    (examQuestions || []).map((eq) => [eq.question_id, Number(eq.weight)])
  );

  // Explicit column projection: NEVER select explanation_html, is_correct, or is_true!
  const [{ data: questions }, { data: options }, { data: statements }, { data: media }] =
    await Promise.all([
      admin
        .from("questions")
        .select("id, question_type, stem_html, has_math")
        .in("id", sequence),
      admin
        .from("question_options")
        .select("id, question_id, option_label, content_html, sort_order")
        .in("question_id", sequence)
        .order("sort_order", { ascending: true }),
      admin
        .from("question_statements")
        .select("id, question_id, statement_html, weight, sort_order")
        .in("question_id", sequence)
        .order("sort_order", { ascending: true }),
      admin
        .from("question_media")
        .select("id, question_id, media_type, bucket_name, storage_path, file_name, mime_type, caption")
        .in("question_id", sequence)
        .eq("status", "active"),
    ]);

  const questionLookup = new Map((questions || []).map((q) => [q.id, q]));

  // Sign private storage URLs (valid 60 minutes)
  const signedMediaMap = new Map<string, string>();
  for (const m of media || []) {
    const { data: signed } = await admin.storage
      .from(m.bucket_name)
      .createSignedUrl(m.storage_path, 3600);
    if (signed?.signedUrl) {
      signedMediaMap.set(m.id, signed.signedUrl);
    }
  }

  const sanitizedQuestions: StudentExamQuestionDTO[] = [];
  sequence.forEach((qId, idx) => {
    const q = questionLookup.get(qId);
    if (!q) return;

    const rawOpts = (options || []).filter((o) => o.question_id === qId);
    const orderedOptIds = optionSeqMap[qId] || rawOpts.map((o) => o.id);
    const optMap = new Map(rawOpts.map((o) => [o.id, o]));
    const letters = ["A", "B", "C", "D", "E", "F"];
    const orderedOpts = orderedOptIds
      .map((id, optIdx) => {
        const opt = optMap.get(id);
        if (!opt) return null;
        return {
          id: opt.id,
          option_label: letters[optIdx] || opt.option_label,
          content_html: opt.content_html,
        };
      })
      .filter((o): o is NonNullable<typeof o> => Boolean(o));

    const qStatements = (statements || [])
      .filter((s) => s.question_id === qId)
      .map((s) => ({
        id: s.id,
        statement_html: s.statement_html,
        weight: Number(s.weight),
      }));

    const qMedia = (media || [])
      .filter((m) => m.question_id === qId)
      .map((m) => ({
        id: m.id,
        media_type: m.media_type as "image" | "audio" | "video" | "attachment",
        signed_url: signedMediaMap.get(m.id) || "",
        file_name: m.file_name,
        mime_type: m.mime_type,
        caption: m.caption,
      }));

    sanitizedQuestions.push({
      question_id: q.id,
      order_index: idx + 1,
      question_type: q.question_type,
      stem_html: q.stem_html,
      has_math: q.has_math,
      weight: weightMap.get(q.id) ?? 1,
      options: orderedOpts,
      statements: qStatements,
      media: qMedia,
    });
  });

  const now = new Date();
  const deadlineMs = attempt.deadline_at ? new Date(attempt.deadline_at).getTime() : now.getTime();
  const remainingSeconds = Math.max(0, Math.floor((deadlineMs - now.getTime()) / 1000));

  return {
    attempt,
    exam,
    session,
    student,
    questions: sanitizedQuestions,
    savedAnswers: (savedAnswers || []) as StudentSavedAnswerState[],
    serverNow: now.toISOString(),
    remainingSeconds,
  };
}

export async function submitStudentAttempt(params: {
  attemptId: string;
  studentProfileId: string;
  reason?: string;
  autoSubmittedByTimeout?: boolean;
}) {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("profile_id", params.studentProfileId)
    .single();

  if (!student) {
    throw new Error("Data siswa tidak ditemukan.");
  }

  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("id", params.attemptId)
    .eq("student_id", student.id)
    .single();

  if (!attempt) {
    throw new Error("Attempt ujian tidak ditemukan.");
  }

  if (attempt.status === "SUBMITTED") {
    const { data: existingResult } = await admin
      .from("exam_results")
      .select("*")
      .eq("attempt_id", attempt.id)
      .maybeSingle();
    return { attempt, result: existingResult, alreadySubmitted: true };
  }

  if (attempt.status === "TERMINATED") {
    throw new Error("Ujian ini telah dihentikan oleh Pengawas dan tidak dapat dikirim.");
  }

  const { data: updatedAttempt, error: updErr } = await admin
    .from("exam_attempts")
    .update({
      status: "SUBMITTED",
      submitted_at: now.toISOString(),
      server_timestamp: now.toISOString(),
      updated_by: params.studentProfileId,
    })
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (updErr || !updatedAttempt) {
    throw new Error(updErr?.message || "Gagal menyelesaikan attempt.");
  }

  await admin
    .from("student_answers")
    .update({ status: "locked" })
    .eq("attempt_id", attempt.id);

  const result = await gradeAttemptOnServer(attempt.id);

  await Promise.all([
    admin.from("exam_activity_logs").insert({
      school_id: attempt.school_id,
      exam_id: attempt.exam_id,
      session_id: attempt.session_id,
      attempt_id: attempt.id,
      student_id: attempt.student_id,
      user_id: params.studentProfileId,
      activity_type: params.autoSubmittedByTimeout ? "EXAM_AUTO_SUBMITTED_TIMEOUT" : "EXAM_SUBMITTED",
      description: params.reason || "Siswa mengirim ujian",
    }),
    recordAuditLog({
      schoolId: attempt.school_id,
      actorId: params.studentProfileId,
      actorRole: "student",
      action: "EXAM_ATTEMPT_SUBMITTED",
      entityType: "exam_attempts",
      entityId: attempt.id,
      metadata: {
        exam_id: attempt.exam_id,
        auto_timeout: Boolean(params.autoSubmittedByTimeout),
      },
    }),
  ]);

  return { attempt: updatedAttempt, result, alreadySubmitted: false };
}
