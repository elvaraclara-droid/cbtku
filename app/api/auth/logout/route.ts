import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/security/audit";

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  const sessionTokenId = request.cookies.get("cbt_session_token_id")?.value;

  if (ctx) {
    const admin = createSupabaseAdminClient();
    if (sessionTokenId) {
      await admin
        .from("user_sessions")
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoke_reason: "Logout oleh pengguna",
        })
        .eq("user_id", ctx.userId)
        .eq("session_token_id", sessionTokenId);
    }

    await recordAuditLog({
      schoolId: ctx.profile.school_id,
      actorId: ctx.userId,
      actorRole: ctx.profile.role,
      action: "USER_LOGOUT",
      entityType: "profiles",
      entityId: ctx.userId,
    });
  }

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore if unconfigured
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete("cbt_session_token_id");
  return res;
}
