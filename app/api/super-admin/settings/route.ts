import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET() {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const [{ data: settings }, { data: auditLogs }, { data: backupRecords }] =
    await Promise.all([
      admin.from("system_settings").select("*").order("key"),
      admin
        .from("audit_logs")
        .select("id, school_id, actor_id, actor_role, action, entity_type, entity_id, metadata, server_timestamp")
        .order("server_timestamp", { ascending: false })
        .limit(100),
      admin
        .from("backup_records")
        .select("*")
        .order("executed_at", { ascending: false })
        .limit(30),
    ]);

  return NextResponse.json({
    settings: settings || [],
    auditLogs: auditLogs || [],
    backupRecords: backupRecords || [],
  });
}

const updateSettingSchema = z.object({
  type: z.enum(["setting", "backup_record"]),
  key: z.string().min(2).max(96).optional(),
  value: z.record(z.unknown()).optional(),
  backup_scope: z.enum(["database", "storage", "full_dr_drill"]).optional(),
  status: z.enum(["scheduled", "completed", "verified", "failed"]).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = updateSettingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (parsed.data.type === "setting" && parsed.data.key && parsed.data.value) {
    const { data, error } = await admin
      .from("system_settings")
      .upsert({
        key: parsed.data.key,
        value: parsed.data.value,
        updated_by: auth.ctx.userId,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await recordAuditLog({
      actorId: auth.ctx.userId,
      actorRole: "super_admin",
      action: "SYSTEM_SETTING_UPDATED",
      entityType: "system_settings",
      entityId: parsed.data.key,
    });

    return NextResponse.json({ setting: data });
  }

  if (parsed.data.type === "backup_record" && parsed.data.backup_scope && parsed.data.status) {
    const { data, error } = await admin
      .from("backup_records")
      .insert({
        backup_scope: parsed.data.backup_scope,
        status: parsed.data.status,
        notes: parsed.data.notes || null,
        verified_by: auth.ctx.userId,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await recordAuditLog({
      actorId: auth.ctx.userId,
      actorRole: "super_admin",
      action: "BACKUP_RECORD_LOGGED",
      entityType: "backup_records",
      entityId: data.id,
      metadata: { scope: parsed.data.backup_scope, status: parsed.data.status },
    });

    return NextResponse.json({ backupRecord: data }, { status: 201 });
  }

  return NextResponse.json({ error: "Operasi tidak dikenal" }, { status: 400 });
}
