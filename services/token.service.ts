import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import {
  generateSecureExamToken,
  hashExamToken,
  maskTokenHint,
  normalizeExamToken,
  validateTokenFormat,
} from "@/lib/security/token";
import { recordAuditLog } from "@/lib/security/audit";
import type { UserRole } from "@/types/database";

export async function generateAutoExamToken(params: {
  schoolId: string;
  examId: string;
  sessionId: string;
  validFrom: string;
  validUntil: string;
  usagePolicy: "session_shared" | "limited_uses";
  maxUses?: number | null;
  revokePrevious?: boolean;
  actorId: string;
  actorRole: UserRole;
}) {
  const admin = createSupabaseAdminClient();
  const env = getServerEnv();

  if (new Date(params.validUntil) <= new Date(params.validFrom)) {
    throw new Error("Waktu kedaluwarsa token harus lebih besar dari waktu mulai.");
  }

  if (params.revokePrevious !== false) {
    await admin
      .from("exam_tokens")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: params.actorId,
        revoke_reason: "Digantikan oleh regenerasi token baru",
      })
      .eq("exam_id", params.examId)
      .eq("session_id", params.sessionId)
      .eq("status", "active");
  }

  // Generate CSPRNG token and ensure no hash collision
  let rawToken = "";
  let tokenHash = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    rawToken = generateSecureExamToken(8);
    tokenHash = hashExamToken(rawToken, env.tokenHashPepper);
    const { data: existing } = await admin
      .from("exam_tokens")
      .select("id")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!existing) break;
  }

  const tokenHint = maskTokenHint(rawToken);

  const { data: inserted, error } = await admin
    .from("exam_tokens")
    .insert({
      school_id: params.schoolId,
      exam_id: params.examId,
      session_id: params.sessionId,
      token_hash: tokenHash,
      token_hint: tokenHint,
      generation_mode: "auto",
      usage_policy: params.usagePolicy,
      max_uses: params.usagePolicy === "limited_uses" ? params.maxUses ?? 100 : null,
      valid_from: params.validFrom,
      valid_until: params.validUntil,
      status: "active",
      created_by: params.actorId,
      updated_by: params.actorId,
    })
    .select("id, exam_id, session_id, token_hint, generation_mode, usage_policy, max_uses, use_count, valid_from, valid_until, status, created_at")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Gagal menyimpan token ujian.");
  }

  await recordAuditLog({
    schoolId: params.schoolId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "EXAM_TOKEN_GENERATED",
    entityType: "exam_tokens",
    entityId: inserted.id,
    metadata: {
      exam_id: params.examId,
      session_id: params.sessionId,
      token_hint: tokenHint,
      generation_mode: "auto",
      usage_policy: params.usagePolicy,
    },
  });

  // Plaintext token is returned ONCE right after creation and never stored/queried again
  return {
    tokenRecord: inserted,
    plaintextToken: rawToken,
  };
}

export async function createManualExamToken(params: {
  schoolId: string;
  examId: string;
  sessionId: string;
  manualToken: string;
  validFrom: string;
  validUntil: string;
  usagePolicy: "session_shared" | "limited_uses";
  maxUses?: number | null;
  revokePrevious?: boolean;
  actorId: string;
  actorRole: UserRole;
}) {
  const format = validateTokenFormat(params.manualToken);
  if (!format.valid) {
    throw new Error(format.error);
  }
  if (new Date(params.validUntil) <= new Date(params.validFrom)) {
    throw new Error("Waktu kedaluwarsa token harus lebih besar dari waktu mulai.");
  }

  const admin = createSupabaseAdminClient();
  const env = getServerEnv();
  const tokenHash = hashExamToken(format.normalized, env.tokenHashPepper);

  const { data: duplicate } = await admin
    .from("exam_tokens")
    .select("id")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (duplicate) {
    throw new Error("Token tersebut sudah terdaftar. Gunakan kombinasi token lain.");
  }

  if (params.revokePrevious) {
    await admin
      .from("exam_tokens")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: params.actorId,
        revoke_reason: "Digantikan oleh input token manual baru",
      })
      .eq("exam_id", params.examId)
      .eq("session_id", params.sessionId)
      .eq("status", "active");
  }

  const tokenHint = maskTokenHint(format.normalized);

  const { data: inserted, error } = await admin
    .from("exam_tokens")
    .insert({
      school_id: params.schoolId,
      exam_id: params.examId,
      session_id: params.sessionId,
      token_hash: tokenHash,
      token_hint: tokenHint,
      generation_mode: "manual",
      usage_policy: params.usagePolicy,
      max_uses: params.usagePolicy === "limited_uses" ? params.maxUses ?? 100 : null,
      valid_from: params.validFrom,
      valid_until: params.validUntil,
      status: "active",
      created_by: params.actorId,
      updated_by: params.actorId,
    })
    .select("id, exam_id, session_id, token_hint, generation_mode, usage_policy, max_uses, use_count, valid_from, valid_until, status, created_at")
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Gagal menyimpan token manual.");
  }

  await recordAuditLog({
    schoolId: params.schoolId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "EXAM_TOKEN_CREATED_MANUAL",
    entityType: "exam_tokens",
    entityId: inserted.id,
    metadata: {
      exam_id: params.examId,
      session_id: params.sessionId,
      token_hint: tokenHint,
      generation_mode: "manual",
    },
  });

  return {
    tokenRecord: inserted,
    plaintextToken: normalizeExamToken(params.manualToken),
  };
}

export async function revokeExamToken(params: {
  tokenId: string;
  schoolId: string;
  reason: string;
  actorId: string;
  actorRole: UserRole;
}) {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("exam_tokens")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: params.actorId,
      revoke_reason: params.reason,
      updated_by: params.actorId,
    })
    .eq("id", params.tokenId)
    .eq("school_id", params.schoolId)
    .select("id, exam_id, session_id, token_hint, status")
    .single();

  if (error || !data) {
    throw new Error("Token tidak ditemukan atau gagal dicabut.");
  }

  await recordAuditLog({
    schoolId: params.schoolId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: "EXAM_TOKEN_REVOKED",
    entityType: "exam_tokens",
    entityId: data.id,
    metadata: {
      exam_id: data.exam_id,
      session_id: data.session_id,
      token_hint: data.token_hint,
      reason: params.reason,
    },
  });

  return data;
}
