import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AttemptStatus } from "@/types/database";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const auth = await requireRoleApi(["supervisor", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { examId } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("id, school_id, title, total_questions, duration_minutes, status, face_verification_enabled, subjects(name)")
    .eq("id", examId)
    .single();

  if (!exam) {
    return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  }

  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Akses ditolak lintas sekolah" }, { status: 403 });
  }

  if (auth.ctx.profile.role === "supervisor") {
    const { data: assignment } = await admin
      .from("exam_supervisors")
      .select("id, can_extend_time, can_terminate_attempt, can_approve_resume")
      .eq("exam_id", examId)
      .eq("supervisor_id", auth.ctx.userId)
      .eq("status", "assigned")
      .maybeSingle();

    if (!assignment) {
      return NextResponse.json(
        { error: "Anda tidak ditugaskan untuk mengawasi ujian ini." },
        { status: 403 }
      );
    }
  }

  const statusFilter = request.nextUrl.searchParams.get("status");
  const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const detailAttemptId = request.nextUrl.searchParams.get("attemptId");

  const [{ data: enrollments }, { data: attempts }, { data: answerCounts }] =
    await Promise.all([
      admin
        .from("exam_session_students")
        .select("student_id, session_id, exam_sessions(name, session_number), students(id, nis, classes(name), profiles!students_profile_id_fkey(full_name, username))")
        .eq("exam_id", examId)
        .eq("status", "enrolled"),
      admin
        .from("exam_attempts")
        .select("*")
        .eq("exam_id", examId)
        .order("attempt_number", { ascending: false }),
      admin
        .from("student_answers")
        .select("attempt_id")
        .eq("exam_id", examId)
        .eq("is_answered", true),
    ]);

  const answeredPerAttempt = new Map<string, number>();
  for (const row of answerCounts || []) {
    answeredPerAttempt.set(row.attempt_id, (answeredPerAttempt.get(row.attempt_id) || 0) + 1);
  }

  interface AttemptRow {
    id: string;
    student_id: string;
    status: AttemptStatus;
    connection_status: "online" | "offline" | "reconnecting";
    last_heartbeat_at: string | null;
    risk_level: string;
    risk_score: number;
    warning_count: number;
    violation_count: number;
    face_verification_status: string;
    started_at: string | null;
    deadline_at: string | null;
    last_saved_at: string | null;
  }
  interface EnrollmentMonitoringRow {
    student_id: string;
    session_id: string;
    exam_sessions?: { name?: string } | null;
    students?: {
      nis?: string;
      classes?: { name?: string } | null;
      profiles?: { full_name?: string; username?: string } | null;
    } | null;
  }

  const latestAttemptByStudent = new Map<string, AttemptRow>();
  for (const att of (attempts || []) as AttemptRow[]) {
    if (!latestAttemptByStudent.has(att.student_id)) {
      latestAttemptByStudent.set(att.student_id, att);
    }
  }

  const now = Date.now();
  const participants = ((enrollments || []) as EnrollmentMonitoringRow[]).map((enr) => {
    const att = latestAttemptByStudent.get(enr.student_id);
    let effectiveStatus: AttemptStatus = att ? att.status : "NOT_STARTED";
    let connStatus: "online" | "offline" | "reconnecting" = att?.connection_status || "offline";

    // Detect stale heartbeat (> 45s) as DISCONNECTED visually while preserving DB status
    if (
      att &&
      !["SUBMITTED", "TERMINATED", "PAUSED", "LOCKED", "PENDING_SUPERVISOR_APPROVAL", "NOT_STARTED"].includes(att.status) &&
      att.last_heartbeat_at &&
      now - new Date(att.last_heartbeat_at).getTime() > 45_000
    ) {
      connStatus = "offline";
      if (effectiveStatus === "NORMAL" || effectiveStatus === "RESUMED") {
        effectiveStatus = "DISCONNECTED";
      }
    }

    return {
      attempt_id: att?.id || null,
      student_id: enr.student_id,
      student_name: enr.students?.profiles?.full_name || "Siswa",
      username: enr.students?.profiles?.username || "",
      nis: enr.students?.nis || "",
      class_name: enr.students?.classes?.name || "-",
      session_id: enr.session_id,
      session_name: enr.exam_sessions?.name || "Sesi",
      status: effectiveStatus,
      risk_level: att?.risk_level || "LOW",
      risk_score: att?.risk_score || 0,
      warning_count: att?.warning_count || 0,
      violation_count: att?.violation_count || 0,
      connection_status: connStatus,
      face_verification_status: att?.face_verification_status || "not_required",
      started_at: att?.started_at || null,
      deadline_at: att?.deadline_at || null,
      last_heartbeat_at: att?.last_heartbeat_at || null,
      last_saved_at: att?.last_saved_at || null,
      answered_count: att ? answeredPerAttempt.get(att.id) || 0 : 0,
      total_questions: exam.total_questions || 0,
    };
  });

  // Compute all 10 live monitoring metrics from BAGIAN 13
  const summary = {
    totalRegistered: participants.length,
    loggedIn: participants.filter((p) => p.status !== "NOT_STARTED").length,
    inProgress: participants.filter((p) =>
      ["NORMAL", "WARNING", "NEEDS_REVIEW", "RESUMED", "APPROVED_TO_RESUME"].includes(p.status)
    ).length,
    submitted: participants.filter((p) => p.status === "SUBMITTED").length,
    disconnected: participants.filter((p) => p.status === "DISCONNECTED" || p.connection_status === "offline").length,
    warned: participants.filter((p) => p.status === "WARNING" || p.warning_count > 0).length,
    needsReview: participants.filter((p) => p.status === "NEEDS_REVIEW").length,
    paused: participants.filter((p) => p.status === "PAUSED" || p.status === "LOCKED").length,
    pendingApproval: participants.filter((p) => p.status === "PENDING_SUPERVISOR_APPROVAL").length,
    resumed: participants.filter((p) => p.status === "RESUMED").length,
  };

  let filtered = participants;
  if (statusFilter && statusFilter !== "ALL") {
    filtered = filtered.filter((p) => p.status === statusFilter);
  }
  if (search) {
    filtered = filtered.filter(
      (p) =>
        p.student_name.toLowerCase().includes(search) ||
        p.nis.toLowerCase().includes(search) ||
        (p.class_name || "").toLowerCase().includes(search)
    );
  }

  let detail = null;
  if (detailAttemptId) {
    const [{ data: securityEvents }, { data: supervisorActions }, { data: faceRecords }] =
      await Promise.all([
        admin
          .from("exam_security_events")
          .select("*")
          .eq("attempt_id", detailAttemptId)
          .order("server_timestamp", { ascending: false })
          .limit(50),
        admin
          .from("supervisor_actions")
          .select("*, profiles!supervisor_actions_supervisor_id_fkey(full_name)")
          .eq("attempt_id", detailAttemptId)
          .order("server_timestamp", { ascending: false })
          .limit(50),
        admin
          .from("face_verification_records")
          .select("*")
          .eq("attempt_id", detailAttemptId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    detail = {
      securityEvents: securityEvents || [],
      supervisorActions: supervisorActions || [],
      faceRecords: faceRecords || [],
    };
  }

  return NextResponse.json({
    exam,
    summary,
    participants: filtered,
    detail,
    serverNow: new Date().toISOString(),
  });
}
