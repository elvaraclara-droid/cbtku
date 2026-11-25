import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  evaluateSecurityRisk,
  type SecurityEventType,
} from "@/lib/security/risk-engine";
import type { AntiCheatConfig, AttemptStatus } from "@/types/database";

const eventSchema = z.object({
  eventType: z.enum([
    "FULLSCREEN_EXIT",
    "TAB_SWITCH",
    "WINDOW_BLUR",
    "COPY_ATTEMPT",
    "CUT_ATTEMPT",
    "PASTE_ATTEMPT",
    "CONTEXT_MENU",
    "SHORTCUT_DETECTED",
    "MULTI_SESSION_DETECTED",
    "DISCONNECTED",
    "RECONNECTED",
    "FACE_CHECK_FAILED",
  ]),
  durationSeconds: z.number().int().min(0).max(86400).default(0),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const { attemptId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload event tidak valid" }, { status: 400 });
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
    .select("*")
    .eq("id", attemptId)
    .eq("student_id", student.id)
    .single();

  if (!attempt) {
    return NextResponse.json({ error: "Attempt tidak ditemukan" }, { status: 404 });
  }

  if (["SUBMITTED", "TERMINATED"].includes(attempt.status)) {
    return NextResponse.json({ ok: true, attemptStatus: attempt.status });
  }

  const { data: exam } = await admin
    .from("exams")
    .select("anti_cheat_config")
    .eq("id", attempt.exam_id)
    .single();

  const config = (exam?.anti_cheat_config || {}) as Partial<AntiCheatConfig>;
  const evaluation = evaluateSecurityRisk({
    currentRiskScore: attempt.risk_score || 0,
    currentViolationCount: attempt.violation_count || 0,
    currentStatus: attempt.status as AttemptStatus,
    eventType: parsed.data.eventType as SecurityEventType,
    config,
  });

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = request.headers.get("user-agent") || null;

  await admin.from("exam_security_events").insert({
    school_id: attempt.school_id,
    exam_id: attempt.exam_id,
    session_id: attempt.session_id,
    attempt_id: attempt.id,
    user_id: auth.ctx.userId,
    student_id: attempt.student_id,
    event_type: parsed.data.eventType,
    risk_level: evaluation.eventRiskLevel,
    risk_points: evaluation.eventPoints,
    duration_seconds: parsed.data.durationSeconds,
    occurrence_count: evaluation.newViolationCount,
    metadata: {
      ...(parsed.data.metadata || {}),
      ip_address: ipAddress,
      user_agent: userAgent,
    },
  });

  const attemptUpdates: Record<string, unknown> = {
    risk_score: evaluation.newRiskScore,
    violation_count: evaluation.newViolationCount,
    risk_level: evaluation.newRiskLevel,
    server_timestamp: new Date().toISOString(),
  };

  if (parsed.data.eventType === "DISCONNECTED") {
    attemptUpdates.connection_status = "offline";
  } else if (parsed.data.eventType === "RECONNECTED") {
    attemptUpdates.connection_status = "online";
  }

  if (evaluation.nextStatus) {
    attemptUpdates.status = evaluation.nextStatus;
    if (evaluation.nextStatus === "PENDING_SUPERVISOR_APPROVAL") {
      attemptUpdates.paused_at = new Date().toISOString();
    }
  }

  const { data: updatedAttempt } = await admin
    .from("exam_attempts")
    .update(attemptUpdates)
    .eq("id", attempt.id)
    .select("status, risk_level, risk_score, violation_count")
    .single();

  return NextResponse.json({
    ok: true,
    attemptStatus: updatedAttempt?.status || attempt.status,
    riskLevel: updatedAttempt?.risk_level || evaluation.newRiskLevel,
    violationCount: updatedAttempt?.violation_count || evaluation.newViolationCount,
    requiresSupervisorApproval: evaluation.requiresSupervisorApproval,
  });
}
