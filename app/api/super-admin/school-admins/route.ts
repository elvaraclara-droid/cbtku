import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET() {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, school_id, role, username, full_name, display_email, phone, status, is_active, last_login_at, created_at, schools(name, code)")
    .eq("role", "school_admin")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ schoolAdmins: data || [] });
}

const createSchoolAdminSchema = z.object({
  school_id: z.string().uuid(),
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  full_name: z.string().min(2).max(120),
  display_email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(32).optional().nullable(),
  password: z.string().min(8).max(128).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createSchoolAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Data Admin Sekolah tidak valid" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const username = parsed.data.username.trim().toLowerCase();
  const tempPassword =
    parsed.data.password || `Cbt#${crypto.randomBytes(6).toString("base64url")}`;
  const internalAuthEmail =
    parsed.data.display_email ||
    `${username}.${crypto.randomBytes(3).toString("hex")}@auth.cbtsmartexam.internal`;

  const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
    email: internalAuthEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: "school_admin",
      school_id: parsed.data.school_id,
      username,
    },
  });

  if (authErr || !createdAuth.user) {
    return NextResponse.json(
      { error: authErr?.message || "Gagal membuat akun auth Admin Sekolah" },
      { status: 400 }
    );
  }

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .insert({
      id: createdAuth.user.id,
      school_id: parsed.data.school_id,
      role: "school_admin",
      username,
      auth_email: internalAuthEmail,
      full_name: parsed.data.full_name,
      display_email: parsed.data.display_email || null,
      phone: parsed.data.phone || null,
      status: "active",
      is_active: true,
      must_change_password: !parsed.data.password,
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select("id, school_id, role, username, full_name, display_email, status, is_active, created_at")
    .single();

  if (profErr) {
    await admin.auth.admin.deleteUser(createdAuth.user.id);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  await recordAuditLog({
    schoolId: parsed.data.school_id,
    actorId: auth.ctx.userId,
    actorRole: "super_admin",
    action: "SCHOOL_ADMIN_CREATED",
    entityType: "profiles",
    entityId: profile.id,
    metadata: { username },
  });

  return NextResponse.json(
    {
      schoolAdmin: profile,
      temporaryPassword: parsed.data.password ? undefined : tempPassword,
    },
    { status: 201 }
  );
}
