import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

const manageAssignmentSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("enroll_students"),
    session_id: z.string().uuid(),
    student_ids: z.array(z.string().uuid()).min(1),
  }),
  z.object({
    action: z.literal("enroll_class"),
    session_id: z.string().uuid(),
    class_id: z.string().uuid(),
  }),
  z.object({
    action: z.literal("assign_supervisor"),
    session_id: z.string().uuid().optional().nullable(),
    supervisor_id: z.string().uuid(),
    can_extend_time: z.boolean().default(true),
    can_terminate_attempt: z.boolean().default(true),
    can_approve_resume: z.boolean().default(true),
  }),
  z.object({
    action: z.literal("grant_retake"),
    student_id: z.string().uuid(),
    extra_attempts: z.number().int().min(1).max(5).default(1),
  }),
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["school_admin", "teacher", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id: examId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = manageAssignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Input tidak valid" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, school_id")
    .eq("id", examId)
    .single();

  if (!exam) return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = parsed.data;

  if (payload.action === "enroll_students") {
    const rows = payload.student_ids.map((studentId) => ({
      school_id: exam.school_id,
      exam_id: examId,
      session_id: payload.session_id,
      student_id: studentId,
      status: "enrolled",
      created_by: auth.ctx.userId,
    }));
    const { error } = await admin
      .from("exam_session_students")
      .upsert(rows, { onConflict: "exam_id,student_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, enrolledCount: rows.length });
  }

  if (payload.action === "enroll_class") {
    const { data: students } = await admin
      .from("students")
      .select("id")
      .eq("school_id", exam.school_id)
      .eq("class_id", payload.class_id)
      .eq("status", "active");

    const rows = (students || []).map((s) => ({
      school_id: exam.school_id,
      exam_id: examId,
      session_id: payload.session_id,
      student_id: s.id,
      status: "enrolled",
      created_by: auth.ctx.userId,
    }));

    if (rows.length === 0) {
      return NextResponse.json({ error: "Tidak ada siswa aktif di kelas tersebut" }, { status: 400 });
    }

    const { error } = await admin
      .from("exam_session_students")
      .upsert(rows, { onConflict: "exam_id,student_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, enrolledCount: rows.length });
  }

  if (payload.action === "assign_supervisor") {
    const { data, error } = await admin
      .from("exam_supervisors")
      .upsert(
        {
          school_id: exam.school_id,
          exam_id: examId,
          session_id: payload.session_id || null,
          supervisor_id: payload.supervisor_id,
          can_extend_time: payload.can_extend_time,
          can_terminate_attempt: payload.can_terminate_attempt,
          can_approve_resume: payload.can_approve_resume,
          status: "assigned",
          created_by: auth.ctx.userId,
        },
        { onConflict: "exam_id,session_id,supervisor_id" }
      )
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ supervisor: data });
  }

  if (payload.action === "grant_retake") {
    const { data: current } = await admin
      .from("exam_session_students")
      .select("id, extra_attempts_granted")
      .eq("exam_id", examId)
      .eq("student_id", payload.student_id)
      .single();

    if (!current) {
      return NextResponse.json({ error: "Peserta tidak ditemukan" }, { status: 404 });
    }

    await admin
      .from("exam_session_students")
      .update({
        retake_allowed: true,
        extra_attempts_granted: (current.extra_attempts_granted || 0) + payload.extra_attempts,
        updated_by: auth.ctx.userId,
      })
      .eq("id", current.id);

    await recordAuditLog({
      schoolId: exam.school_id,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
      action: "RETAKE_GRANTED",
      entityType: "exam_session_students",
      entityId: current.id,
      metadata: { student_id: payload.student_id, extra_attempts: payload.extra_attempts },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Aksi tidak didukung" }, { status: 400 });
}
