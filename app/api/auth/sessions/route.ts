import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_sessions")
    .select("id, session_token_id, browser_name, os_name, user_agent, ip_address, is_active, last_seen_at, expires_at, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data || [] });
}

const revokeSchema = z.object({
  sessionId: z.string().uuid().optional(),
  revokeAllOthers: z.boolean().optional(),
  targetUserId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Admin revoking another user's sessions within scope
  if (parsed.data.targetUserId && parsed.data.targetUserId !== ctx.userId) {
    if (!["super_admin", "school_admin"].includes(ctx.profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (ctx.profile.role === "school_admin") {
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("school_id")
        .eq("id", parsed.data.targetUserId)
        .single();
      if (!targetProfile || targetProfile.school_id !== ctx.profile.school_id) {
        return NextResponse.json({ error: "Forbidden lintas sekolah" }, { status: 403 });
      }
    }

    await admin
      .from("user_sessions")
      .update({
        is_active: false,
        revoked_at: nowIso,
        revoked_by: ctx.userId,
        revoke_reason: "Dihentikan oleh Administrator",
      })
      .eq("user_id", parsed.data.targetUserId)
      .eq("is_active", true);

    await recordAuditLog({
      schoolId: ctx.profile.school_id,
      actorId: ctx.userId,
      actorRole: ctx.profile.role,
      action: "ADMIN_REVOKED_USER_SESSIONS",
      entityType: "user_sessions",
      entityId: parsed.data.targetUserId,
    });

    return NextResponse.json({ ok: true });
  }

  if (parsed.data.sessionId) {
    await admin
      .from("user_sessions")
      .update({
        is_active: false,
        revoked_at: nowIso,
        revoked_by: ctx.userId,
        revoke_reason: "Diakhiri pengguna",
      })
      .eq("id", parsed.data.sessionId)
      .eq("user_id", ctx.userId);
  } else if (parsed.data.revokeAllOthers) {
    const currentTokenId = request.cookies.get("cbt_session_token_id")?.value;
    let query = admin
      .from("user_sessions")
      .update({
        is_active: false,
        revoked_at: nowIso,
        revoked_by: ctx.userId,
        revoke_reason: "Pengguna mengakhiri perangkat lain",
      })
      .eq("user_id", ctx.userId)
      .eq("is_active", true);
    if (currentTokenId) {
      query = query.neq("session_token_id", currentTokenId);
    }
    await query;
  }

  return NextResponse.json({ ok: true });
}
