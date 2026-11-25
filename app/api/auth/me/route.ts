import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await getAuthenticatedContext();
  if (!ctx) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  let school = null;
  if (ctx.profile.school_id) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("schools")
      .select("id, code, name, education_level")
      .eq("id", ctx.profile.school_id)
      .maybeSingle();
    school = data;
  }

  return NextResponse.json({
    authenticated: true,
    profile: ctx.profile,
    school,
  });
}
