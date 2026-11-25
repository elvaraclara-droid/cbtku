import { NextResponse } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  let query = admin
    .from("audit_logs")
    .select("id, school_id, actor_id, actor_role, action, entity_type, entity_id, metadata, server_timestamp")
    .order("server_timestamp", { ascending: false })
    .limit(150);

  if (auth.ctx.profile.role === "school_admin" && auth.ctx.profile.school_id) {
    query = query.eq("school_id", auth.ctx.profile.school_id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ auditLogs: data || [] });
}
