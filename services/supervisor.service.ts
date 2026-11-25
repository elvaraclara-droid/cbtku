import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";
import type { AttemptStatus, UserRole } from "@/types/database";

export type SupervisorActionCommand =
  | "WARNING_SENT"
  | "EXAM_PAUSED"
  | "RESUME_APPROVED"
  | "TIME_EXTENDED"
  | "EXAM_TERMINATED";

export async function executeSupervisorAction(params: {
  attemptId: string;
  actionType: SupervisorActionCommand;
  reason: string;
  extraMinutes?: number;
  actorId: string;
  actorRole: UserRole;
  actorSchoolId: string | null;
}) {
  const trimmedReason = params.reason.trim();
  if (trimmedReason.length < 3) {
    throw new Error("Alasan tindakan pengawas wajib diisi (minimal 3 karakter).");
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();

  const { data: attempt, error: attemptErr } = await admin
    .from("exam_attempts")
    .select("*")
    .eq("id", params.attemptId)
    .single();

  if (attemptErr || !attempt) {
    throw new Error("Attempt siswa tidak ditemukan.");
  }

  if (params.actorRole !== "super_admin" && params.actorSchoolId !== attempt.school_id) {
    throw new Error("Anda tidak memiliki akses ke sekolah peserta ini.");
  }

  // Verify supervisor assignment & granular permissions when role is supervisor
  if (params.actorRole === "supervisor") {
    const { data: assignment } = await admin
      .from("exam_supervisors")
      .select("id, can_extend_time, can_terminate_attempt, can_approve_resume")
      .eq("exam_id", attempt.exam_id)
      .eq("supervisor_id", params.actorId)
      .eq("status", "assigned")
      .maybeSingle();

    if (!assignment) {
      throw new Error("Anda tidak ditugaskan sebagai pengawas untuk ujian ini.");
    }
    if (params.actionType === "RESUME_APPROVED" && !assignment.can_approve_resume) {
      throw new Error("Anda tidak memiliki izin menyetujui kelanjutan ujian.");
    }
    if (params.actionType === "TIME_EXTENDED" && !assignment.can_extend_time) {
      throw new Error("Anda tidak memiliki izin menambah waktu ujian.");
    }
    if (params.actionType === "EXAM_TERMINATED" && !assignment.can_terminate_attempt) {
      throw new Error("Anda tidak memiliki izin mengakhiri ujian siswa.");
    }
  }

  if (attempt.status === "SUBMITTED" || attempt.status === "TERMINATED") {
    throw new Error(`Attempt sudah berstatus final (${attempt.status}).`);
  }

  const statusBefore = attempt.status as AttemptStatus;
  let statusAfter: AttemptStatus = statusBefore;
  const updatePayload: Record<string, unknown> = {
    server_timestamp: now.toISOString(),
    updated_by: params.actorId,
  };

  const previousDeadlineAt: string | null = attempt.deadline_at;
  let newDeadlineAt: string | null = attempt.deadline_at;
  let extraMinutesApplied = 0;

  switch (params.actionType) {
    case "WARNING_SENT": {
      statusAfter = statusBefore === "NORMAL" ? "WARNING" : statusBefore;
      updatePayload.status = statusAfter;
      updatePayload.warning_count = (attempt.warning_count || 0) + 1;

      await admin.from("exam_announcements").insert({
        school_id: attempt.school_id,
        exam_id: attempt.exam_id,
        session_id: attempt.session_id,
        target_attempt_id: attempt.id,
        severity: "warning",
        title: "Peringatan dari Pengawas Ujian",
        message: trimmedReason,
        created_by: params.actorId,
      });
      break;
    }

    case "EXAM_PAUSED": {
      statusAfter = "PAUSED";
      updatePayload.status = "PAUSED";
      updatePayload.paused_at = now.toISOString();
      break;
    }

    case "RESUME_APPROVED": {
      // Allowed from PAUSED, LOCKED, PENDING_SUPERVISOR_APPROVAL, NEEDS_REVIEW, WARNING
      if (
        ![
          "PAUSED",
          "LOCKED",
          "PENDING_SUPERVISOR_APPROVAL",
          "NEEDS_REVIEW",
          "WARNING",
        ].includes(statusBefore)
      ) {
        throw new Error(`Status ${statusBefore} tidak memerlukan persetujuan lanjutkan.`);
      }

      // Compute paused duration so server timer stays fair & accurate
      let pausedSecondsToAdd = 0;
      if (attempt.paused_at) {
        pausedSecondsToAdd = Math.max(
          0,
          Math.floor((now.getTime() - new Date(attempt.paused_at).getTime()) / 1000)
        );
      }

      statusAfter = "RESUMED";
      updatePayload.status = "RESUMED";
      updatePayload.paused_at = null;
      updatePayload.total_paused_seconds =
        (attempt.total_paused_seconds || 0) + pausedSecondsToAdd;

      await admin.from("exam_announcements").insert({
        school_id: attempt.school_id,
        exam_id: attempt.exam_id,
        session_id: attempt.session_id,
        target_attempt_id: attempt.id,
        severity: "info",
        title: "Izin Melanjutkan Ujian Disetujui",
        message: `Pengawas mengizinkan Anda melanjutkan ujian: ${trimmedReason}`,
        created_by: params.actorId,
      });
      break;
    }

    case "TIME_EXTENDED": {
      const mins = Number(params.extraMinutes || 0);
      if (!Number.isInteger(mins) || mins < 1 || mins > 120) {
        throw new Error("Tambahan waktu harus antara 1 hingga 120 menit.");
      }
      extraMinutesApplied = mins;
      const baseDeadline = attempt.deadline_at
        ? new Date(attempt.deadline_at)
        : now;
      const extended = new Date(
        Math.max(baseDeadline.getTime(), now.getTime()) + mins * 60 * 1000
      );
      newDeadlineAt = extended.toISOString();
      updatePayload.deadline_at = newDeadlineAt;
      updatePayload.extra_minutes_granted = (attempt.extra_minutes_granted || 0) + mins;

      await admin.from("exam_announcements").insert({
        school_id: attempt.school_id,
        exam_id: attempt.exam_id,
        session_id: attempt.session_id,
        target_attempt_id: attempt.id,
        severity: "info",
        title: `Tambahan Waktu +${mins} Menit`,
        message: trimmedReason,
        created_by: params.actorId,
      });
      break;
    }

    case "EXAM_TERMINATED": {
      statusAfter = "TERMINATED";
      updatePayload.status = "TERMINATED";
      updatePayload.terminated_at = now.toISOString();
      updatePayload.termination_reason = trimmedReason;
      break;
    }
  }

  // Update attempt WITHOUT touching student_answers!
  const { data: updatedAttempt, error: updErr } = await admin
    .from("exam_attempts")
    .update(updatePayload)
    .eq("id", attempt.id)
    .select("*")
    .single();

  if (updErr || !updatedAttempt) {
    throw new Error(updErr?.message || "Gagal memperbarui status attempt.");
  }

  // Record immutable supervisor action
  const { data: actionRecord } = await admin
    .from("supervisor_actions")
    .insert({
      school_id: attempt.school_id,
      exam_id: attempt.exam_id,
      session_id: attempt.session_id,
      attempt_id: attempt.id,
      student_id: attempt.student_id,
      supervisor_id: params.actorId,
      action_type: params.actionType,
      status_before: statusBefore,
      status_after: statusAfter,
      reason: trimmedReason,
      extra_minutes: extraMinutesApplied,
      metadata: {
        actor_role: params.actorRole,
      },
    })
    .select("id")
    .single();

  if (["RESUME_APPROVED", "TIME_EXTENDED", "EXAM_PAUSED", "EXAM_TERMINATED"].includes(params.actionType)) {
    await admin.from("supervisor_override_logs").insert({
      school_id: attempt.school_id,
      exam_id: attempt.exam_id,
      attempt_id: attempt.id,
      student_id: attempt.student_id,
      supervisor_id: params.actorId,
      supervisor_action_id: actionRecord?.id ?? null,
      override_type: params.actionType,
      previous_status: statusBefore,
      new_status: statusAfter,
      previous_deadline_at: previousDeadlineAt,
      new_deadline_at: newDeadlineAt,
      reason: trimmedReason,
    });
  }

  await recordAuditLog({
    schoolId: attempt.school_id,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: `SUPERVISOR_${params.actionType}`,
    entityType: "exam_attempts",
    entityId: attempt.id,
    metadata: {
      status_before: statusBefore,
      status_after: statusAfter,
      extra_minutes: extraMinutesApplied,
      reason: trimmedReason,
    },
  });

  return updatedAttempt;
}
