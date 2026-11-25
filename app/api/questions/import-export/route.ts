import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeRichHtml, stripHtmlToPlainText } from "@/lib/security/html-sanitizer";

export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  const bankId = request.nextUrl.searchParams.get("bankId");
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("questions")
    .select("question_type, difficulty, topic, competency, stem_html, has_math, default_weight, mcma_scoring_mode, explanation_html, question_options(option_label, content_html, is_correct), question_statements(statement_html, is_true, weight)")
    .eq("school_id", schoolId)
    .eq("status", "active");

  if (bankId) query = query.eq("bank_id", bankId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), questions: data || [] }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="bank-soal-export.json"',
    },
  });
}

const importSchema = z.object({
  bank_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  questions: z.array(
    z.object({
      question_type: z.enum(["single_choice", "mcma", "true_false", "essay"]),
      difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
      topic: z.string().optional().nullable(),
      competency: z.string().optional().nullable(),
      stem_html: z.string().min(1),
      has_math: z.boolean().default(false),
      default_weight: z.number().positive().default(1),
      options: z
        .array(
          z.object({
            option_label: z.string(),
            content_html: z.string(),
            is_correct: z.boolean(),
          })
        )
        .optional(),
      statements: z
        .array(
          z.object({
            statement_html: z.string(),
            is_true: z.boolean(),
            weight: z.number().positive().default(1),
          })
        )
        .optional(),
    })
  ),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Format JSON import soal tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let importedCount = 0;

  for (const item of parsed.data.questions.slice(0, 200)) {
    const stem = sanitizeRichHtml(item.stem_html);
    const { data: q, error } = await admin
      .from("questions")
      .insert({
        school_id: schoolId,
        bank_id: parsed.data.bank_id,
        subject_id: parsed.data.subject_id,
        question_type: item.question_type,
        difficulty: item.difficulty,
        topic: item.topic || null,
        competency: item.competency || null,
        stem_html: stem,
        stem_plain: stripHtmlToPlainText(stem),
        has_math: item.has_math,
        default_weight: item.default_weight,
        created_by: auth.ctx.userId,
      })
      .select("id")
      .single();

    if (error || !q) continue;

    if (item.options?.length && ["single_choice", "mcma"].includes(item.question_type)) {
      await admin.from("question_options").insert(
        item.options.map((o, idx) => ({
          school_id: schoolId,
          question_id: q.id,
          option_label: o.option_label.toUpperCase(),
          content_html: sanitizeRichHtml(o.content_html),
          is_correct: o.is_correct,
          sort_order: idx,
          created_by: auth.ctx.userId,
        }))
      );
    }

    if (item.statements?.length && item.question_type === "true_false") {
      await admin.from("question_statements").insert(
        item.statements.map((s, idx) => ({
          school_id: schoolId,
          question_id: q.id,
          statement_html: sanitizeRichHtml(s.statement_html),
          is_true: s.is_true,
          weight: s.weight,
          sort_order: idx,
          created_by: auth.ctx.userId,
        }))
      );
    }
    importedCount++;
  }

  return NextResponse.json({ ok: true, importedCount });
}
