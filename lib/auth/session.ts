import "server-only";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabasePublicConfigured } from "@/lib/env";
import type { ProfileRecord, UserRole } from "@/types/database";

export interface AuthenticatedContext {
  userId: string;
  profile: ProfileRecord;
}

export async function getAuthenticatedContext(): Promise<AuthenticatedContext | null> {
  if (!isSupabasePublicConfigured()) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select(
        "id, school_id, role, username, full_name, display_email, phone, avatar_path, status, is_active, must_change_password, last_login_at, created_at, updated_at"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || !profile || !profile.is_active || profile.status !== "active") {
      return null;
    }

    return {
      userId: user.id,
      profile: profile as ProfileRecord,
    };
  } catch {
    return null;
  }
}

export async function requireRoleApi(allowedRoles: UserRole[]): Promise<
  | { ok: true; ctx: AuthenticatedContext }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sesi tidak valid atau telah berakhir. Silakan login kembali." },
        { status: 401 }
      ),
    };
  }

  if (!allowedRoles.includes(ctx.profile.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Anda tidak memiliki kewenangan mengakses resource ini." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, ctx };
}

export function getRoleHomePath(role: UserRole): string {
  switch (role) {
    case "super_admin":
      return "/super-admin";
    case "school_admin":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "supervisor":
      return "/supervisor";
    case "student":
      return "/student";
  }
}
