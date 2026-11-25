import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

const publishSchema = z.object({
  publish: z.boolean(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { examId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: exam } = await admin
    .from("exams")
    .select("id, school_id")
    .eq("id", examId)
    .single();

  if (!exam) return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  await Promise.all([
    admin
      .from("exams")
      .update({
        results_published: parsed.data.publish,
        results_published_at: parsed.data.publish ? nowIso : null,
        results_published_by: parsed.data.publish ? auth.ctx.userId : null,
        updated_by: auth.ctx.userId,
      })
      .eq("id", examId),
    admin
      .from("exam_results")
      .update({
        is_published: parsed.data.publish,
        approved_by: auth.ctx.userId,
        approved_at: nowIso,
        published_by: parsed.data.publish ? auth.ctx.userId : null,
        published_at: parsed.data.publish ? nowIso : null,
      })
      .eq("exam_id", examId),
    recordAuditLog({
      schoolId: exam.school_id,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
      action: parsed.data.publish ? "EXAM_RESULTS_PUBLISHED" : "EXAM_RESULTS_UNPUBLISHED",
      entityType: "exams",
      entityId: examId,
    }),
  ]);

  return NextResponse.json({ ok: true, published: parsed.data.publish });
}
