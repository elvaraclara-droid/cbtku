import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getSanitizedExamPayload,
  submitStudentAttempt,
} from "@/services/exam-attempt.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const { attemptId } = await context.params;
  try {
    const payload = await getSanitizedExamPayload(attemptId, auth.ctx.userId);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 403 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  // Server-authoritative heartbeat & status sync
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const { attemptId } = await context.params;
  const admin = createSupabaseAdminClient();
  const now = new Date();

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

  // Check if session token was revoked by newer login (multi-session detection)
  const currentCookieToken = request.cookies.get("cbt_session_token_id")?.value;
  let sessionRevoked = false;
  if (currentCookieToken) {
    const { data: sessionRow } = await admin
      .from("user_sessions")
      .select("is_active")
      .eq("session_token_id", currentCookieToken)
      .maybeSingle();
    if (sessionRow && !sessionRow.is_active) {
      sessionRevoked = true;
    }
  }

  // Server deadline enforcement: auto-submit when time expires (only if not paused)
  const isPaused = ["PAUSED", "LOCKED", "PENDING_SUPERVISOR_APPROVAL"].includes(
    attempt.status
  );
  if (
    !isPaused &&
    !["SUBMITTED", "TERMINATED"].includes(attempt.status) &&
    attempt.deadline_at &&
    now >= new Date(attempt.deadline_at)
  ) {
    await submitStudentAttempt({
      attemptId: attempt.id,
      studentProfileId: auth.ctx.userId,
      reason: "Waktu ujian berakhir (ditutup otomatis oleh server)",
      autoSubmittedByTimeout: true,
    });
    return NextResponse.json({
      attemptStatus: "SUBMITTED",
      serverNow: now.toISOString(),
      remainingSeconds: 0,
      autoSubmitted: true,
      sessionRevoked,
    });
  }

  if (!["SUBMITTED", "TERMINATED"].includes(attempt.status)) {
    await admin
      .from("exam_attempts")
      .update({
        connection_status: "online",
        last_heartbeat_at: now.toISOString(),
        server_timestamp: now.toISOString(),
      })
      .eq("id", attempt.id);
  }

  const [{ data: announcements }] = await Promise.all([
    admin
      .from("exam_announcements")
      .select("id, severity, title, message, server_timestamp")
      .eq("exam_id", attempt.exam_id)
      .eq("is_active", true)
      .or(`target_attempt_id.is.null,target_attempt_id.eq.${attempt.id}`)
      .order("server_timestamp", { ascending: false })
      .limit(5),
  ]);

  const deadlineMs = attempt.deadline_at
    ? new Date(attempt.deadline_at).getTime()
    : now.getTime();
  const remainingSeconds = isPaused
    ? Math.max(0, Math.floor((deadlineMs - new Date(attempt.paused_at || now).getTime()) / 1000))
    : Math.max(0, Math.floor((deadlineMs - now.getTime()) / 1000));

  return NextResponse.json({
    attemptStatus: attempt.status,
    deadlineAt: attempt.deadline_at,
    serverNow: now.toISOString(),
    remainingSeconds,
    sessionRevoked,
    announcements: announcements || [],
  });
}
