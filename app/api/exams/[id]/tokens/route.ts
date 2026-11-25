import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createManualExamToken,
  generateAutoExamToken,
  revokeExamToken,
} from "@/services/token.service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["school_admin", "super_admin", "teacher"]);
  if (!auth.ok) return auth.response;

  const { id: examId } = await context.params;
  const admin = createSupabaseAdminClient();
  const { data: tokens, error } = await admin
    .from("exam_tokens")
    .select("id, exam_id, session_id, token_hint, generation_mode, usage_policy, max_uses, use_count, valid_from, valid_until, status, revoked_at, revoke_reason, created_at, exam_sessions(name, session_number)")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: tokens || [] });
}

const tokenMutationSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("auto"),
    session_id: z.string().uuid(),
    valid_from: z.string(),
    valid_until: z.string(),
    usage_policy: z.enum(["session_shared", "limited_uses"]).default("session_shared"),
    max_uses: z.number().int().positive().optional().nullable(),
    revoke_previous: z.boolean().default(true),
  }),
  z.object({
    mode: z.literal("manual"),
    session_id: z.string().uuid(),
    manual_token: z.string().min(6).max(16),
    valid_from: z.string(),
    valid_until: z.string(),
    usage_policy: z.enum(["session_shared", "limited_uses"]).default("session_shared"),
    max_uses: z.number().int().positive().optional().nullable(),
    revoke_previous: z.boolean().default(false),
  }),
  z.object({
    mode: z.literal("revoke"),
    token_id: z.string().uuid(),
    reason: z.string().min(3).max(300).default("Dicabut oleh Admin"),
  }),
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id: examId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = tokenMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Parameter token tidak valid" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, school_id")
    .eq("id", examId)
    .single();

  if (!exam) return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const p = parsed.data;
    if (p.mode === "auto") {
      const result = await generateAutoExamToken({
        schoolId: exam.school_id,
        examId,
        sessionId: p.session_id,
        validFrom: p.valid_from,
        validUntil: p.valid_until,
        usagePolicy: p.usage_policy,
        maxUses: p.max_uses,
        revokePrevious: p.revoke_previous,
        actorId: auth.ctx.userId,
        actorRole: auth.ctx.profile.role,
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (p.mode === "manual") {
      const result = await createManualExamToken({
        schoolId: exam.school_id,
        examId,
        sessionId: p.session_id,
        manualToken: p.manual_token,
        validFrom: p.valid_from,
        validUntil: p.valid_until,
        usagePolicy: p.usage_policy,
        maxUses: p.max_uses,
        revokePrevious: p.revoke_previous,
        actorId: auth.ctx.userId,
        actorRole: auth.ctx.profile.role,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const revoked = await revokeExamToken({
      tokenId: p.token_id,
      schoolId: exam.school_id,
      reason: p.reason,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
    });
    return NextResponse.json({ tokenRecord: revoked });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
