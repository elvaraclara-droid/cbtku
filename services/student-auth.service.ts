import "server-only";
import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { hashExamToken, validateTokenFormat } from "@/lib/security/token";
import {
  checkRateLimit,
  clearRateLimit,
  recordRateLimitFailure,
} from "@/lib/security/rate-limiter";
import { recordAuditLog } from "@/lib/security/audit";

export interface StudentLoginValidationResult {
  ok: boolean;
  statusCode: number;
  error?: string;
  data?: {
    userId: string;
    studentId: string;
    examId: string;
    sessionId: string;
    tokenId: string;
    sessionTokenId: string;
    mustChangePassword: boolean;
    faceVerificationEnabled: boolean;
  };
}

/**
 * Validates all 10 mandatory backend requirements for Student Exam Login:
 * 1. Username valid
 * 2. Password valid (verified via Supabase Auth, never plaintext comparison)
 * 3. Account active
 * 4. Token valid (hashed comparison)
 * 5. Token matches exam & not expired/revoked
 * 6. Token matches session
 * 7. Student enrolled in exam & session
 * 8. Exam schedule allows access
 * 9. No active account restriction
 * 10. No conflicting attempt under exam policy
 */
export async function authenticateStudentWithExamToken(params: {
  username: string;
  password: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<StudentLoginValidationResult> {
  const admin = createSupabaseAdminClient();
  const env = getServerEnv();
  const normalizedUsername = params.username.trim().toLowerCase();

  // Rate limit by username (never solely by shared school IP!)
  const userRateKey = `student_login:user:${normalizedUsername}`;
  const rateDecision = await checkRateLimit(userRateKey, 5, 15, 15);
  if (!rateDecision.allowed) {
    return {
      ok: false,
      statusCode: 429,
      error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${rateDecision.retryAfterSeconds} detik atau hubungi Admin Sekolah.`,
    };
  }

  const tokenValidation = validateTokenFormat(params.token);
  if (!tokenValidation.valid) {
    await recordRateLimitFailure(userRateKey, 5, 15, 15);
    return {
      ok: false,
      statusCode: 400,
      error: tokenValidation.error || "Format token ujian tidak valid.",
    };
  }

  // 1. Lookup username -> auth_email on server only
  const { data: profile } = await admin
    .from("profiles")
    .select("id, school_id, role, username, auth_email, full_name, status, is_active, must_change_password")
    .ilike("username", normalizedUsername)
    .maybeSingle();

  if (!profile || profile.role !== "student") {
    await recordRateLimitFailure(userRateKey, 5, 15, 15);
    await recordAuditLog({
      action: "STUDENT_LOGIN_FAILED_USERNAME",
      entityType: "profiles",
      metadata: { username: normalizedUsername },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    return {
      ok: false,
      statusCode: 401,
      error: "Username, password, atau token ujian tidak valid.",
    };
  }

  // 3 & 9. Check active profile & account restriction
  if (!profile.is_active || profile.status !== "active") {
    return {
      ok: false,
      statusCode: 403,
      error: "Akun siswa sedang dinonaktifkan atau dibatasi. Hubungi Admin Sekolah.",
    };
  }

  // 2. Verify password via Supabase Auth (never compare passwords manually)
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: profile.auth_email,
    password: params.password,
  });

  if (authErr || !authData.user) {
    const nextRate = await recordRateLimitFailure(userRateKey, 5, 15, 15);
    await recordAuditLog({
      schoolId: profile.school_id,
      actorId: profile.id,
      actorRole: "student",
      action: "STUDENT_LOGIN_FAILED_PASSWORD",
      entityType: "profiles",
      entityId: profile.id,
      metadata: { remaining_attempts: nextRate.remainingAttempts },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    return {
      ok: false,
      statusCode: 401,
      error: "Username, password, atau token ujian tidak valid.",
    };
  }

  // Load student record
  const { data: student } = await admin
    .from("students")
    .select("id, school_id, status")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!student || student.status !== "active") {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Status kepesertaan siswa tidak aktif.",
    };
  }

  // 4, 5, 6. Validate hashed exam token
  const tokenRateKey = `student_token:${student.id}`;
  const tokenRate = await checkRateLimit(tokenRateKey, 8, 10, 10);
  if (!tokenRate.allowed) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 429,
      error: `Percobaan token melebihi batas. Tunggu ${tokenRate.retryAfterSeconds} detik.`,
    };
  }

  const tokenHash = hashExamToken(tokenValidation.normalized, env.tokenHashPepper);
  const { data: tokenRow } = await admin
    .from("exam_tokens")
    .select("id, school_id, exam_id, session_id, usage_policy, max_uses, use_count, valid_from, valid_until, status")
    .eq("token_hash", tokenHash)
    .eq("school_id", student.school_id)
    .maybeSingle();

  const now = new Date();
  if (!tokenRow || tokenRow.status !== "active") {
    await recordRateLimitFailure(tokenRateKey, 8, 10, 10);
    await supabase.auth.signOut();
    await recordAuditLog({
      schoolId: student.school_id,
      actorId: profile.id,
      actorRole: "student",
      action: "STUDENT_TOKEN_FAILED",
      entityType: "exam_tokens",
      metadata: { reason: tokenRow ? `status_${tokenRow.status}` : "not_found" },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
    return {
      ok: false,
      statusCode: 403,
      error: "Token ujian tidak valid atau sudah dicabut.",
    };
  }

  if (now < new Date(tokenRow.valid_from) || now > new Date(tokenRow.valid_until)) {
    await recordRateLimitFailure(tokenRateKey, 8, 10, 10);
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Token ujian belum aktif atau sudah kedaluwarsa.",
    };
  }

  if (
    tokenRow.usage_policy === "limited_uses" &&
    tokenRow.max_uses !== null &&
    tokenRow.use_count >= tokenRow.max_uses
  ) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Kuota penggunaan token pada sesi ini telah mencapai batas.",
    };
  }

  // 7. Validate student enrollment in this exact exam and session
  const { data: enrollment } = await admin
    .from("exam_session_students")
    .select("id, status, retake_allowed, extra_attempts_granted")
    .eq("exam_id", tokenRow.exam_id)
    .eq("session_id", tokenRow.session_id)
    .eq("student_id", student.id)
    .maybeSingle();

  if (!enrollment || enrollment.status !== "enrolled") {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Anda tidak terdaftar sebagai peserta pada sesi ujian untuk token ini.",
    };
  }

  // 8. Validate exam & session schedule
  const [{ data: exam }, { data: examSession }] = await Promise.all([
    admin
      .from("exams")
      .select("id, title, status, starts_at, ends_at, max_attempts, face_verification_enabled, anti_cheat_config")
      .eq("id", tokenRow.exam_id)
      .single(),
    admin
      .from("exam_sessions")
      .select("id, status, starts_at, ends_at")
      .eq("id", tokenRow.session_id)
      .single(),
  ]);

  if (!exam || !examSession) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 404,
      error: "Data ujian atau sesi ujian tidak ditemukan.",
    };
  }

  if (!["scheduled", "active"].includes(exam.status) || !["scheduled", "active"].includes(examSession.status)) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: `Ujian atau sesi saat ini berstatus "${exam.status}" dan belum mengizinkan akses.`,
    };
  }

  if (now < new Date(examSession.starts_at) || now > new Date(examSession.ends_at)) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Di luar jadwal waktu sesi ujian yang ditentukan.",
    };
  }

  // 10. Check existing attempts vs max attempts / multi-session policy
  const { data: attempts } = await admin
    .from("exam_attempts")
    .select("id, status, attempt_number")
    .eq("exam_id", exam.id)
    .eq("student_id", student.id)
    .order("attempt_number", { ascending: false });

  const totalAllowedAttempts = exam.max_attempts + (enrollment.extra_attempts_granted || 0);
  const latestAttempt = attempts?.[0];
  const activeAttempt = attempts?.find(
    (a) => !["SUBMITTED", "TERMINATED"].includes(a.status)
  );

  if (!activeAttempt && (attempts?.length || 0) >= totalAllowedAttempts && !enrollment.retake_allowed) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Anda telah menyelesaikan batas percobaan untuk ujian ini.",
    };
  }

  if (latestAttempt?.status === "TERMINATED" && !enrollment.retake_allowed) {
    await supabase.auth.signOut();
    return {
      ok: false,
      statusCode: 403,
      error: "Ujian Anda sebelumnya telah dihentikan oleh Pengawas.",
    };
  }

  // Check multi-session policy for active sessions
  const antiCheat = (exam.anti_cheat_config || {}) as Record<string, unknown>;
  const allowMultiSession = Boolean(antiCheat.allow_multiple_sessions);
  const sessionTokenId = crypto.randomUUID();

  if (!allowMultiSession) {
    const { data: existingSessions } = await admin
      .from("user_sessions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("is_active", true);

    if (existingSessions && existingSessions.length > 0 && activeAttempt) {
      // Log multi-session alert without prematurely auto-failing the student
      await admin.from("exam_security_events").insert({
        school_id: student.school_id,
        exam_id: exam.id,
        session_id: examSession.id,
        attempt_id: activeAttempt.id,
        user_id: profile.id,
        student_id: student.id,
        event_type: "MULTI_SESSION_DETECTED",
        risk_level: "HIGH",
        risk_points: 4,
        metadata: {
          previous_active_sessions: existingSessions.length,
          new_user_agent: params.userAgent,
        },
      });
    }

    // Revoke previous active sessions cleanly so only current session stays valid
    await admin
      .from("user_sessions")
      .update({
        is_active: false,
        revoked_at: now.toISOString(),
        revoke_reason: "Digantikan login perangkat baru",
      })
      .eq("user_id", profile.id)
      .eq("is_active", true);
  }

  await admin.from("user_sessions").insert({
    school_id: student.school_id,
    user_id: profile.id,
    session_token_id: sessionTokenId,
    user_agent: params.userAgent,
    ip_address: params.ipAddress,
    is_active: true,
    expires_at: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
  });

  // Update token use count & profile last_login
  await Promise.all([
    clearRateLimit(userRateKey),
    clearRateLimit(tokenRateKey),
    admin
      .from("exam_tokens")
      .update({ use_count: tokenRow.use_count + 1 })
      .eq("id", tokenRow.id),
    admin
      .from("profiles")
      .update({ last_login_at: now.toISOString() })
      .eq("id", profile.id),
    recordAuditLog({
      schoolId: student.school_id,
      actorId: profile.id,
      actorRole: "student",
      action: "STUDENT_LOGIN_SUCCESS",
      entityType: "exam_sessions",
      entityId: examSession.id,
      metadata: {
        exam_id: exam.id,
        token_id: tokenRow.id,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    }),
  ]);

  return {
    ok: true,
    statusCode: 200,
    data: {
      userId: profile.id,
      studentId: student.id,
      examId: exam.id,
      sessionId: examSession.id,
      tokenId: tokenRow.id,
      sessionTokenId,
      mustChangePassword: profile.must_change_password,
      faceVerificationEnabled: exam.face_verification_enabled,
    },
  };
}
