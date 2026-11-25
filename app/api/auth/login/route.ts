import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/env";
import {
  checkRateLimit,
  clearRateLimit,
  recordRateLimitFailure,
} from "@/lib/security/rate-limiter";
import { recordAuditLog } from "@/lib/security/audit";
import { getRoleHomePath } from "@/lib/auth/session";
import type { UserRole } from "@/types/database";

const staffLoginSchema = z.object({
  identifier: z.string().min(2).max(120), // username or display_email
  password: z.string().min(6).max(128),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase belum terhubung. Lengkapi konfigurasi environment variables (.env.local) terlebih dahulu.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = staffLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Username/email dan password wajib diisi dengan benar." },
      { status: 400 }
    );
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = request.headers.get("user-agent") || null;

  const rateKey = `staff_login:${identifier}`;
  const rateCheck = await checkRateLimit(rateKey, 5, 15, 15);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${rateCheck.retryAfterSeconds} detik.`,
      },
      { status: 429 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, school_id, role, username, auth_email, full_name, status, is_active, must_change_password")
    .or(`username.ilike.${identifier},display_email.ilike.${identifier}`)
    .maybeSingle();

  if (!profile) {
    await recordRateLimitFailure(rateKey, 5, 15, 15);
    return NextResponse.json(
      { error: "Username/email atau password salah." },
      { status: 401 }
    );
  }

  if (profile.role === "student") {
    return NextResponse.json(
      {
        error:
          "Akun siswa wajib masuk melalui tab Login Ujian Siswa dengan Username, Password, dan Token Ujian.",
      },
      { status: 403 }
    );
  }

  if (!profile.is_active || profile.status !== "active") {
    return NextResponse.json(
      { error: "Akun Anda dinonaktifkan. Hubungi Administrator." },
      { status: 403 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: profile.auth_email,
    password: parsed.data.password,
  });

  if (authError || !authData.user) {
    await recordRateLimitFailure(rateKey, 5, 15, 15);
    await recordAuditLog({
      schoolId: profile.school_id,
      actorId: profile.id,
      actorRole: profile.role as UserRole,
      action: "STAFF_LOGIN_FAILED",
      entityType: "profiles",
      entityId: profile.id,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: "Username/email atau password salah." },
      { status: 401 }
    );
  }

  await clearRateLimit(rateKey);
  const now = new Date();
  const sessionTokenId = crypto.randomUUID();

  await Promise.all([
    admin.from("user_sessions").insert({
      school_id: profile.school_id,
      user_id: profile.id,
      session_token_id: sessionTokenId,
      user_agent: userAgent,
      ip_address: ipAddress,
      is_active: true,
      expires_at: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
    }),
    admin
      .from("profiles")
      .update({ last_login_at: now.toISOString() })
      .eq("id", profile.id),
    recordAuditLog({
      schoolId: profile.school_id,
      actorId: profile.id,
      actorRole: profile.role as UserRole,
      action: "STAFF_LOGIN_SUCCESS",
      entityType: "profiles",
      entityId: profile.id,
      ipAddress,
      userAgent,
    }),
  ]);

  return NextResponse.json({
    ok: true,
    role: profile.role,
    mustChangePassword: profile.must_change_password,
    redirectTo: getRoleHomePath(profile.role as UserRole),
  });
}
