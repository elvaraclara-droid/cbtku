import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { sanitizeAuditMetadata } from "@/lib/security/audit-sanitizer";
import type { UserRole } from "@/types/database";

export { sanitizeAuditMetadata };

export interface AuditEntryInput {
  schoolId?: string | null;
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditLog(entry: AuditEntryInput): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;

  try {
    const admin = createSupabaseAdminClient();
    await admin.from("audit_logs").insert({
      school_id: entry.schoolId ?? null,
      actor_id: entry.actorId ?? null,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      metadata: sanitizeAuditMetadata(entry.metadata),
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    });
  } catch (err) {
    console.error("[AuditLog] Failed to record audit log:", err);
  }
}
