import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordAuditLog } from "@/lib/security/audit";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(4),
  newPassword: z
    .string()
    .min(8, "Password baru minimal 8 karakter")
    .max(128)
    .regex(/[A-Za-z]/, "Password harus mengandung huruf")
    .regex(/[0-9]/, "Password harus mengandung angka"),
  revokeOtherSessions: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Input tidak valid" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: fullProfile } = await admin
    .from("profiles")
    .select("auth_email")
    .eq("id", ctx.userId)
    .single();

  if (!fullProfile) {
    return NextResponse.json({ error: "Profil tidak ditemukan" }, { status: 404 });
  }

  // Re-verify current password before allowing password change
  const supabase = await createSupabaseServerClient();
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: fullProfile.auth_email,
    password: parsed.data.currentPassword,
  });

  if (verifyErr) {
    return NextResponse.json(
      { error: "Password saat ini tidak sesuai." },
      { status: 400 }
    );
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(ctx.userId, {
    password: parsed.data.newPassword,
  });

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await admin
    .from("profiles")
    .update({
      must_change_password: false,
      password_changed_at: new Date().toISOString(),
    })
    .eq("id", ctx.userId);

  if (parsed.data.revokeOtherSessions) {
    const currentTokenId = request.cookies.get("cbt_session_token_id")?.value;
    let query = admin
      .from("user_sessions")
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoke_reason: "Pengguna mengganti password dan mengakhiri sesi lain",
      })
      .eq("user_id", ctx.userId)
      .eq("is_active", true);

    if (currentTokenId) {
      query = query.neq("session_token_id", currentTokenId);
    }
    await query;
  }

  await recordAuditLog({
    schoolId: ctx.profile.school_id,
    actorId: ctx.userId,
    actorRole: ctx.profile.role,
    action: "PASSWORD_CHANGED",
    entityType: "profiles",
    entityId: ctx.userId,
    metadata: { revoked_other_sessions: parsed.data.revokeOtherSessions },
  });

  return NextResponse.json({ ok: true });
}
