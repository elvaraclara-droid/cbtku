import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const singleAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid().nullable().optional(),
  selectedOptionIds: z.array(z.string().uuid()).optional(),
  statementAnswers: z.record(z.boolean()).optional(),
  essayAnswer: z.string().max(25000).nullable().optional(),
  isFlagged: z.boolean().default(false),
  isAnswered: z.boolean().default(false),
  answerVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(4).max(128),
  clientUpdatedAt: z.string().optional(),
});

const batchOrSingleSchema = z.union([
  singleAnswerSchema,
  z.object({
    items: z.array(singleAnswerSchema).min(1).max(200),
  }),
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const { attemptId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = batchOrSingleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Format payload jawaban tidak valid." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("profile_id", auth.ctx.userId)
    .single();

  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, school_id, exam_id, session_id, student_id, status, deadline_at")
    .eq("id", attemptId)
    .eq("student_id", student.id)
    .single();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt tidak ditemukan" }, { status: 404 });
  }

  if (
    ["SUBMITTED", "TERMINATED", "PAUSED", "LOCKED", "PENDING_SUPERVISOR_APPROVAL"].includes(
      attempt.status
    )
  ) {
    return NextResponse.json(
      { error: `Jawaban tidak dapat disimpan saat status ujian "${attempt.status}".` },
      { status: 409 }
    );
  }

  // Enforce server deadline with tiny 15s reconnect grace for in-flight offline flush
  const now = new Date();
  if (attempt.deadline_at && now.getTime() > new Date(attempt.deadline_at).getTime() + 15000) {
    return NextResponse.json(
      { error: "Batas waktu ujian telah berakhir di server." },
      { status: 409 }
    );
  }

  const items = "items" in parsed.data ? parsed.data.items : [parsed.data];
  const results = [];

  for (const item of items) {
    const { data, error } = await admin.rpc("save_student_answer_atomic", {
      p_school_id: attempt.school_id,
      p_exam_id: attempt.exam_id,
      p_session_id: attempt.session_id,
      p_student_id: attempt.student_id,
      p_attempt_id: attempt.id,
      p_question_id: item.questionId,
      p_selected_option_id: item.selectedOptionId ?? null,
      p_selected_option_ids: item.selectedOptionIds ?? [],
      p_statement_answers: item.statementAnswers ?? {},
      p_essay_answer: item.essayAnswer ?? null,
      p_is_flagged: item.isFlagged,
      p_is_answered: item.isAnswered,
      p_answer_version: item.answerVersion,
      p_idempotency_key: item.idempotencyKey,
      p_client_updated_at: item.clientUpdatedAt || now.toISOString(),
      p_actor_id: auth.ctx.userId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.conflict_detected) {
      await admin.from("exam_activity_logs").insert({
        school_id: attempt.school_id,
        exam_id: attempt.exam_id,
        session_id: attempt.session_id,
        attempt_id: attempt.id,
        student_id: attempt.student_id,
        user_id: auth.ctx.userId,
        activity_type: "ANSWER_VERSION_CONFLICT_RESOLVED",
        description: `Versi jawaban klien (${item.answerVersion}) lebih lama dari server (${row.persisted_version}); versi server dipertahankan.`,
        metadata: { question_id: item.questionId },
      });
    }
    results.push({ questionId: item.questionId, ...row });
  }

  return NextResponse.json({
    ok: true,
    serverTimestamp: now.toISOString(),
    results,
  });
}
