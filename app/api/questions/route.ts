import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sanitizeRichHtml, stripHtmlToPlainText } from "@/lib/security/html-sanitizer";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const bankId = request.nextUrl.searchParams.get("bankId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");
  const qType = request.nextUrl.searchParams.get("type");
  const difficulty = request.nextUrl.searchParams.get("difficulty");
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";

  const admin = createSupabaseAdminClient();

  // If teacher, enforce assigned subjects scope
  let allowedSubjectIds: string[] | null = null;
  if (auth.ctx.profile.role === "teacher") {
    const { data: teacher } = await admin
      .from("teachers")
      .select("id")
      .eq("profile_id", auth.ctx.userId)
      .maybeSingle();
    if (teacher) {
      const { data: assigned } = await admin
        .from("teacher_subjects")
        .select("subject_id")
        .eq("teacher_id", teacher.id)
        .eq("status", "active");
      allowedSubjectIds = (assigned || []).map((a) => a.subject_id);
    }
  }

  let query = admin
    .from("questions")
    .select(
      "*, question_options(*), question_statements(*), question_media(*), question_categories(name), subjects(name, code), question_banks(title)"
    )
    .eq("school_id", schoolId)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(200);

  if (bankId) query = query.eq("bank_id", bankId);
  if (subjectId) query = query.eq("subject_id", subjectId);
  if (qType) query = query.eq("question_type", qType);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (allowedSubjectIds && allowedSubjectIds.length > 0) {
    query = query.in("subject_id", allowedSubjectIds);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  interface QuestionFilterRow {
    stem_plain?: string | null;
    topic?: string | null;
    competency?: string | null;
  }

  const filtered = q
    ? ((data || []) as QuestionFilterRow[]).filter(
        (item) =>
          (item.stem_plain || "").toLowerCase().includes(q) ||
          (item.topic || "").toLowerCase().includes(q) ||
          (item.competency || "").toLowerCase().includes(q)
      )
    : data || [];

  return NextResponse.json({ questions: filtered });
}

const createQuestionSchema = z.object({
  bank_id: z.string().uuid(),
  category_id: z.string().uuid().optional().nullable(),
  subject_id: z.string().uuid(),
  class_id: z.string().uuid().optional().nullable(),
  question_type: z.enum(["single_choice", "mcma", "true_false", "essay"]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  topic: z.string().max(160).optional().nullable(),
  competency: z.string().max(240).optional().nullable(),
  stem_html: z.string().min(1),
  has_math: z.boolean().default(false),
  default_weight: z.number().positive().max(100).default(1),
  mcma_scoring_mode: z.enum(["exact_match", "partial_credit"]).default("partial_credit"),
  allow_negative_score: z.boolean().default(false),
  explanation_html: z.string().optional().nullable(),
  essay_rubric: z.string().optional().nullable(),
  options: z
    .array(
      z.object({
        option_label: z.string().min(1).max(4),
        content_html: z.string().min(1),
        is_correct: z.boolean(),
      })
    )
    .optional(),
  statements: z
    .array(
      z.object({
        statement_html: z.string().min(1),
        is_true: z.boolean(),
        weight: z.number().positive().default(1),
      })
    )
    .optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Data soal tidak valid" },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const admin = createSupabaseAdminClient();

  if (auth.ctx.profile.role === "teacher") {
    const { data: teacher } = await admin
      .from("teachers")
      .select("id")
      .eq("profile_id", auth.ctx.userId)
      .maybeSingle();
    if (teacher) {
      const { data: assigned } = await admin
        .from("teacher_subjects")
        .select("id")
        .eq("teacher_id", teacher.id)
        .eq("subject_id", data.subject_id)
        .eq("status", "active")
        .maybeSingle();
      if (!assigned) {
        return NextResponse.json(
          { error: "Guru tidak memiliki kewenangan pada mata pelajaran ini." },
          { status: 403 }
        );
      }
    }
  }

  // Validate options/statements per question type
  if (data.question_type === "single_choice") {
    const opts = data.options || [];
    if (opts.length < 2 || opts.filter((o) => o.is_correct).length !== 1) {
      return NextResponse.json(
        { error: "Pilihan ganda tunggal wajib memiliki minimal 2 opsi dan tepat 1 jawaban benar." },
        { status: 400 }
      );
    }
  } else if (data.question_type === "mcma") {
    const opts = data.options || [];
    if (opts.length < 2 || opts.filter((o) => o.is_correct).length < 1) {
      return NextResponse.json(
        { error: "Soal MCMA wajib memiliki minimal 2 opsi dan minimal 1 jawaban benar." },
        { status: 400 }
      );
    }
  } else if (data.question_type === "true_false") {
    const stmts = data.statements || [];
    if (stmts.length < 1) {
      return NextResponse.json(
        { error: "Soal Benar/Salah wajib memiliki minimal 1 pernyataan." },
        { status: 400 }
      );
    }
  }

  const sanitizedStem = sanitizeRichHtml(data.stem_html);
  const plainStem = stripHtmlToPlainText(sanitizedStem);

  const { data: question, error: qErr } = await admin
    .from("questions")
    .insert({
      school_id: schoolId,
      bank_id: data.bank_id,
      category_id: data.category_id || null,
      subject_id: data.subject_id,
      class_id: data.class_id || null,
      question_type: data.question_type,
      difficulty: data.difficulty,
      topic: data.topic || null,
      competency: data.competency || null,
      stem_html: sanitizedStem,
      stem_plain: plainStem,
      has_math: data.has_math,
      default_weight: data.default_weight,
      mcma_scoring_mode: data.mcma_scoring_mode,
      allow_negative_score: data.allow_negative_score,
      explanation_html: data.explanation_html ? sanitizeRichHtml(data.explanation_html) : null,
      essay_rubric: data.essay_rubric || null,
      status: "active",
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select("*")
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: qErr?.message || "Gagal membuat soal" }, { status: 400 });
  }

  if (data.options?.length && ["single_choice", "mcma"].includes(data.question_type)) {
    await admin.from("question_options").insert(
      data.options.map((opt, idx) => ({
        school_id: schoolId,
        question_id: question.id,
        option_label: opt.option_label.toUpperCase(),
        content_html: sanitizeRichHtml(opt.content_html),
        is_correct: opt.is_correct,
        sort_order: idx,
        created_by: auth.ctx.userId,
      }))
    );
  }

  if (data.statements?.length && data.question_type === "true_false") {
    await admin.from("question_statements").insert(
      data.statements.map((stmt, idx) => ({
        school_id: schoolId,
        question_id: question.id,
        statement_html: sanitizeRichHtml(stmt.statement_html),
        is_true: stmt.is_true,
        weight: stmt.weight,
        sort_order: idx,
        created_by: auth.ctx.userId,
      }))
    );
  }

  await recordAuditLog({
    schoolId,
    actorId: auth.ctx.userId,
    actorRole: auth.ctx.profile.role,
    action: "QUESTION_CREATED",
    entityType: "questions",
    entityId: question.id,
    metadata: { question_type: data.question_type, bank_id: data.bank_id },
  });

  return NextResponse.json({ question }, { status: 201 });
}
