import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { evaluateOptionalFaceCheck } from "@/lib/face-verification/provider";

const faceSchema = z.object({
  imageBase64: z.string().min(100),
  width: z.number().int().min(1).max(4096),
  height: z.number().int().min(1).max(4096),
  brightnessScore: z.number().min(0).max(255),
  consentAccepted: z.boolean(),
  proceedWithSupervisorFallback: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const { attemptId } = await context.params;
  const admin = createSupabaseAdminClient();

  const { data: student } = await admin
    .from("students")
    .select("id, school_id")
    .eq("profile_id", auth.ctx.userId)
    .single();
  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  const { data: attempt } = await admin
    .from("exam_attempts")
    .select("id, exam_id, session_id, school_id, student_id")
    .eq("id", attemptId)
    .eq("student_id", student.id)
    .single();
  if (!attempt) {
    return NextResponse.json({ error: "Attempt tidak ditemukan" }, { status: 404 });
  }

  const { data: exam } = await admin
    .from("exams")
    .select("face_verification_enabled")
    .eq("id", attempt.exam_id)
    .single();

  // If face verification is OFF, do nothing and allow normal entry
  if (!exam?.face_verification_enabled) {
    return NextResponse.json({
      status: "not_required",
      canEnterExam: true,
      note: "Verifikasi wajah nonaktif pada ujian ini.",
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = faceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data foto verifikasi tidak valid" }, { status: 400 });
  }

  const evaluation = await evaluateOptionalFaceCheck({
    imageBase64: parsed.data.imageBase64,
    width: parsed.data.width,
    height: parsed.data.height,
    brightnessScore: parsed.data.brightnessScore,
    consentAccepted: parsed.data.consentAccepted,
  });

  // Upload snapshot ONLY to private student-uploads bucket with retention expiry
  let snapshotPath: string | null = null;
  if (parsed.data.consentAccepted && evaluation.qualityChecks.payloadSizeOk) {
    const cleanB64 = parsed.data.imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(cleanB64, "base64");
    snapshotPath = `${attempt.school_id}/${attempt.student_id}/${attempt.id}-${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await admin.storage
      .from("student-uploads")
      .upload(snapshotPath, buf, { contentType: "image/jpeg", upsert: false });
    if (upErr) snapshotPath = null;
  }

  const { data: settings } = await admin
    .from("school_settings")
    .select("face_data_retention_days")
    .eq("school_id", attempt.school_id)
    .maybeSingle();
  const retentionDays = settings?.face_data_retention_days || 30;
  const retentionExpiresAt = new Date(
    Date.now() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  await admin.from("face_verification_records").insert({
    school_id: attempt.school_id,
    exam_id: attempt.exam_id,
    session_id: attempt.session_id,
    attempt_id: attempt.id,
    student_id: attempt.student_id,
    status: evaluation.status,
    provider: evaluation.provider,
    quality_score: evaluation.qualityScore,
    quality_checks: evaluation.qualityChecks,
    snapshot_storage_path: snapshotPath,
    consent_accepted: parsed.data.consentAccepted,
    consent_accepted_at: parsed.data.consentAccepted ? new Date().toISOString() : null,
    retention_expires_at: retentionExpiresAt,
    verification_note: evaluation.note,
  });

  await admin
    .from("exam_attempts")
    .update({
      face_verification_status: evaluation.status,
      status:
        evaluation.status === "verified" || evaluation.status === "manual_pending"
          ? "NORMAL"
          : "LOGGED_IN",
    })
    .eq("id", attempt.id);

  // NOTE: Neither failure nor manual_pending marks cheating!
  return NextResponse.json({
    status: evaluation.status,
    qualityScore: evaluation.qualityScore,
    qualityChecks: evaluation.qualityChecks,
    note: evaluation.note,
    canEnterExam:
      evaluation.status === "verified" ||
      evaluation.status === "manual_pending" ||
      Boolean(parsed.data.proceedWithSupervisorFallback),
  });
}
