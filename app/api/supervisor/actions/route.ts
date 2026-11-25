import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { executeSupervisorAction } from "@/services/supervisor.service";

const supervisorActionSchema = z.object({
  attemptId: z.string().uuid(),
  actionType: z.enum([
    "WARNING_SENT",
    "EXAM_PAUSED",
    "RESUME_APPROVED",
    "TIME_EXTENDED",
    "EXAM_TERMINATED",
    "MANUAL_FACE_APPROVED",
    "MANUAL_FACE_REJECTED",
  ]),
  reason: z.string().min(3, "Alasan wajib diisi minimal 3 karakter").max(500),
  extraMinutes: z.number().int().min(1).max(120).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["supervisor", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = supervisorActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Input tindakan tidak valid" },
      { status: 400 }
    );
  }

  try {
    if (
      parsed.data.actionType === "MANUAL_FACE_APPROVED" ||
      parsed.data.actionType === "MANUAL_FACE_REJECTED"
    ) {
      const admin = createSupabaseAdminClient();
      const { data: attempt } = await admin
        .from("exam_attempts")
        .select("*")
        .eq("id", parsed.data.attemptId)
        .single();

      if (!attempt) {
        return NextResponse.json({ error: "Attempt tidak ditemukan" }, { status: 404 });
      }

      const approved = parsed.data.actionType === "MANUAL_FACE_APPROVED";
      const { data: updated } = await admin
        .from("exam_attempts")
        .update({
          face_verification_status: approved ? "manual_approved" : "rejected",
          status: approved ? "NORMAL" : "PAUSED",
          updated_by: auth.ctx.userId,
        })
        .eq("id", attempt.id)
        .select("*")
        .single();

      await admin.from("supervisor_actions").insert({
        school_id: attempt.school_id,
        exam_id: attempt.exam_id,
        session_id: attempt.session_id,
        attempt_id: attempt.id,
        student_id: attempt.student_id,
        supervisor_id: auth.ctx.userId,
        action_type: parsed.data.actionType,
        status_before: attempt.status,
        status_after: approved ? "NORMAL" : "PAUSED",
        reason: parsed.data.reason,
      });

      return NextResponse.json({ ok: true, attempt: updated });
    }

    const updated = await executeSupervisorAction({
      attemptId: parsed.data.attemptId,
      actionType: parsed.data.actionType,
      reason: parsed.data.reason,
      extraMinutes: parsed.data.extraMinutes,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
      actorSchoolId: auth.ctx.profile.school_id,
    });

    return NextResponse.json({ ok: true, attempt: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
