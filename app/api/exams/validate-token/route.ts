import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { hashExamToken, validateTokenFormat } from "@/lib/security/token";
import {
  checkRateLimit,
  clearRateLimit,
  recordRateLimitFailure,
} from "@/lib/security/rate-limiter";

const validateSchema = z.object({
  examId: z.string().uuid(),
  sessionId: z.string().uuid(),
  token: z.string().min(6).max(24),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = validateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Format token tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: student } = await admin
    .from("students")
    .select("id, school_id")
    .eq("profile_id", auth.ctx.userId)
    .single();

  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  const rateKey = `validate_token:${student.id}`;
  const rate = await checkRateLimit(rateKey, 8, 10, 10);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Percobaan token melebihi batas. Tunggu ${rate.retryAfterSeconds} detik.` },
      { status: 429 }
    );
  }

  const fmt = validateTokenFormat(parsed.data.token);
  if (!fmt.valid) {
    await recordRateLimitFailure(rateKey, 8, 10, 10);
    return NextResponse.json({ error: fmt.error }, { status: 400 });
  }

  const env = getServerEnv();
  const tokenHash = hashExamToken(fmt.normalized, env.tokenHashPepper);
  const { data: tokenRow } = await admin
    .from("exam_tokens")
    .select("id, status, valid_from, valid_until, usage_policy, max_uses, use_count")
    .eq("exam_id", parsed.data.examId)
    .eq("session_id", parsed.data.sessionId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  const now = new Date();
  if (
    !tokenRow ||
    tokenRow.status !== "active" ||
    now < new Date(tokenRow.valid_from) ||
    now > new Date(tokenRow.valid_until)
  ) {
    await recordRateLimitFailure(rateKey, 8, 10, 10);
    return NextResponse.json(
      { error: "Token tidak valid, belum aktif, atau telah dicabut." },
      { status: 403 }
    );
  }

  if (
    tokenRow.usage_policy === "limited_uses" &&
    tokenRow.max_uses !== null &&
    tokenRow.use_count >= tokenRow.max_uses
  ) {
    return NextResponse.json({ error: "Kuota penggunaan token habis." }, { status: 403 });
  }

  await clearRateLimit(rateKey);
  return NextResponse.json({ valid: true, tokenId: tokenRow.id });
}
