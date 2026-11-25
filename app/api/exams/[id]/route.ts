import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["school_admin", "teacher", "supervisor", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("*, subjects(name, code), classes(name)")
    .eq("id", id)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  }

  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Akses ditolak lintas sekolah" }, { status: 403 });
  }

  const [{ data: sessions }, { data: enrollments }, { data: supervisors }, { data: tokens }] =
    await Promise.all([
      admin.from("exam_sessions").select("*").eq("exam_id", id).order("session_number"),
      admin
        .from("exam_session_students")
        .select("id, session_id, student_id, seat_number, retake_allowed, extra_attempts_granted, status, students(nis, nisn, classes(name), profiles!students_profile_id_fkey(full_name, username))")
        .eq("exam_id", id),
      admin
        .from("exam_supervisors")
        .select("id, session_id, supervisor_id, can_extend_time, can_terminate_attempt, can_approve_resume, status, profiles!exam_supervisors_supervisor_id_fkey(full_name, username)")
        .eq("exam_id", id),
      admin
        .from("exam_tokens")
        .select("id, session_id, token_hint, generation_mode, usage_policy, max_uses, use_count, valid_from, valid_until, status, revoked_at, created_at")
        .eq("exam_id", id)
        .order("created_at", { ascending: false }),
    ]);

  return NextResponse.json({
    exam,
    sessions: sessions || [],
    enrollments: enrollments || [],
    supervisors: supervisors || [],
    tokens: tokens || [],
  });
}

const patchExamSchema = z.object({
  status: z.enum(["draft", "scheduled", "active", "paused", "completed", "cancelled", "archived"]).optional(),
  cancellation_reason: z.string().max(500).optional(),
  face_verification_enabled: z.boolean().optional(),
  results_published: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["school_admin", "teacher", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = patchExamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: exam } = await admin.from("exams").select("*").eq("id", id).single();
  if (!exam) return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });

  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  if (parsed.data.status === "cancelled" && !parsed.data.cancellation_reason) {
    return NextResponse.json(
      { error: "Alasan pembatalan ujian wajib diisi." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {
    updated_by: auth.ctx.userId,
  };
  if (parsed.data.status) {
    updates.status = parsed.data.status;
    if (parsed.data.cancellation_reason) {
      updates.cancellation_reason = parsed.data.cancellation_reason;
    }
    // Sync session statuses when activating/pausing/completing/cancelling exam
    if (["active", "paused", "completed", "cancelled"].includes(parsed.data.status)) {
      await admin
        .from("exam_sessions")
        .update({ status: parsed.data.status })
        .eq("exam_id", id);
    }
  }
  if (parsed.data.face_verification_enabled !== undefined) {
    updates.face_verification_enabled = parsed.data.face_verification_enabled;
  }

  const { data: updated, error } = await admin
    .from("exams")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await recordAuditLog({
    schoolId: exam.school_id,
    actorId: auth.ctx.userId,
    actorRole: auth.ctx.profile.role,
    action: "EXAM_UPDATED",
    entityType: "exams",
    entityId: id,
    metadata: updates,
  });

  return NextResponse.json({ exam: updated });
}
