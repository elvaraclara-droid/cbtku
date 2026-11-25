import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeRichHtml, stripHtmlToPlainText } from "@/lib/security/html-sanitizer";
import { recordAuditLog } from "@/lib/security/audit";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Duplicate question
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const schoolId = auth.ctx.profile.school_id;
  const admin = createSupabaseAdminClient();

  const { data: original } = await admin
    .from("questions")
    .select("*, question_options(*), question_statements(*)")
    .eq("id", id)
    .eq("school_id", schoolId)
    .single();

  if (!original) {
    return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });
  }

  const { data: clone, error } = await admin
    .from("questions")
    .insert({
      school_id: original.school_id,
      bank_id: original.bank_id,
      category_id: original.category_id,
      subject_id: original.subject_id,
      class_id: original.class_id,
      question_type: original.question_type,
      difficulty: original.difficulty,
      topic: original.topic,
      competency: original.competency,
      stem_html: `${original.stem_html} <p><em>(Salinan)</em></p>`,
      stem_plain: `${original.stem_plain || ""} (Salinan)`.trim(),
      has_math: original.has_math,
      default_weight: original.default_weight,
      mcma_scoring_mode: original.mcma_scoring_mode,
      allow_negative_score: original.allow_negative_score,
      explanation_html: original.explanation_html,
      essay_rubric: original.essay_rubric,
      status: "active",
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select("*")
    .single();

  if (error || !clone) {
    return NextResponse.json({ error: error?.message || "Gagal duplikasi" }, { status: 400 });
  }

  interface CloneOptionRow {
    option_label: string;
    content_html: string;
    is_correct: boolean;
    sort_order: number;
  }
  interface CloneStatementRow {
    statement_html: string;
    is_true: boolean;
    weight: number;
    sort_order: number;
  }

  if (original.question_options?.length) {
    await admin.from("question_options").insert(
      (original.question_options as CloneOptionRow[]).map((o) => ({
        school_id: original.school_id,
        question_id: clone.id,
        option_label: o.option_label,
        content_html: o.content_html,
        is_correct: o.is_correct,
        sort_order: o.sort_order,
        created_by: auth.ctx.userId,
      }))
    );
  }

  if (original.question_statements?.length) {
    await admin.from("question_statements").insert(
      (original.question_statements as CloneStatementRow[]).map((s) => ({
        school_id: original.school_id,
        question_id: clone.id,
        statement_html: s.statement_html,
        is_true: s.is_true,
        weight: s.weight,
        sort_order: s.sort_order,
        created_by: auth.ctx.userId,
      }))
    );
  }

  return NextResponse.json({ question: clone }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const schoolId = auth.ctx.profile.school_id;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Payload tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("questions")
    .select("id, school_id, created_by")
    .eq("id", id)
    .eq("school_id", schoolId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Soal tidak ditemukan" }, { status: 404 });
  }

  const sanitizedStem = body.stem_html ? sanitizeRichHtml(String(body.stem_html)) : undefined;
  const { data: updated, error } = await admin
    .from("questions")
    .update({
      difficulty: body.difficulty,
      topic: body.topic,
      competency: body.competency,
      default_weight: body.default_weight,
      has_math: body.has_math,
      stem_html: sanitizedStem,
      stem_plain: sanitizedStem ? stripHtmlToPlainText(sanitizedStem) : undefined,
      explanation_html:
        body.explanation_html !== undefined
          ? sanitizeRichHtml(String(body.explanation_html || ""))
          : undefined,
      updated_by: auth.ctx.userId,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ question: updated });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const schoolId = auth.ctx.profile.school_id;
  const admin = createSupabaseAdminClient();

  // Check if question is already used in active exam attempts -> archive instead of hard delete
  const { count } = await admin
    .from("exam_questions")
    .select("id", { head: true, count: "exact" })
    .eq("question_id", id);

  if ((count || 0) > 0) {
    await admin
      .from("questions")
      .update({ status: "archived", updated_by: auth.ctx.userId })
      .eq("id", id)
      .eq("school_id", schoolId);
  } else {
    await admin
      .from("questions")
      .delete()
      .eq("id", id)
      .eq("school_id", schoolId);
  }

  await recordAuditLog({
    schoolId,
    actorId: auth.ctx.userId,
    actorRole: auth.ctx.profile.role,
    action: "QUESTION_DELETED_OR_ARCHIVED",
    entityType: "questions",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
