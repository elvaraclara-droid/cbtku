import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET() {
  const auth = await requireRoleApi([
    "school_admin",
    "teacher",
    "supervisor",
    "student",
    "super_admin",
  ]);
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const role = auth.ctx.profile.role;
  const schoolId = auth.ctx.profile.school_id;

  if (role === "student") {
    const { data: student } = await admin
      .from("students")
      .select("id")
      .eq("profile_id", auth.ctx.userId)
      .single();
    if (!student) return NextResponse.json({ exams: [] });

    const { data: enrollments } = await admin
      .from("exam_session_students")
      .select("exam_id, session_id, status, retake_allowed, exam_sessions(id, name, session_number, starts_at, ends_at, status), exams(id, title, description, exam_date, starts_at, ends_at, duration_minutes, total_questions, status, face_verification_enabled, subjects(name, code))")
      .eq("student_id", student.id)
      .eq("status", "enrolled");

    const { data: attempts } = await admin
      .from("exam_attempts")
      .select("id, exam_id, session_id, attempt_number, status, started_at, deadline_at, submitted_at")
      .eq("student_id", student.id)
      .order("attempt_number", { ascending: false });

    const { data: results } = await admin
      .from("exam_results")
      .select("exam_id, attempt_id, total_score, max_possible_score, percentage, is_passed, is_published, published_at")
      .eq("student_id", student.id)
      .eq("is_published", true);

    return NextResponse.json({
      enrollments: enrollments || [],
      attempts: attempts || [],
      publishedResults: results || [],
    });
  }

  let query = admin
    .from("exams")
    .select("*, subjects(name, code), classes(name), exam_sessions(id, name, session_number, starts_at, ends_at, status, max_participants)")
    .order("exam_date", { ascending: false });

  if (schoolId && role !== "super_admin") {
    query = query.eq("school_id", schoolId);
  }

  if (role === "supervisor") {
    const { data: assigned } = await admin
      .from("exam_supervisors")
      .select("exam_id")
      .eq("supervisor_id", auth.ctx.userId)
      .eq("status", "assigned");
    const ids = (assigned || []).map((a) => a.exam_id);
    if (ids.length === 0) return NextResponse.json({ exams: [] });
    query = query.in("id", ids);
  }

  if (role === "teacher") {
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
      const subjectIds = (assigned || []).map((a) => a.subject_id);
      if (subjectIds.length > 0) {
        query = query.in("subject_id", subjectIds);
      } else {
        query = query.eq("created_by", auth.ctx.userId);
      }
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ exams: data || [] });
}

const createExamSchema = z.object({
  title: z.string().min(3).max(200),
  subject_id: z.string().uuid(),
  class_id: z.string().uuid().optional().nullable(),
  academic_year_id: z.string().uuid().optional().nullable(),
  semester_id: z.string().uuid().optional().nullable(),
  parent_exam_id: z.string().uuid().optional().nullable(),
  is_makeup: z.boolean().default(false),
  description: z.string().max(1000).optional().nullable(),
  exam_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  duration_minutes: z.number().int().min(1).max(600),
  passing_score: z.number().min(0).max(100).default(75),
  max_attempts: z.number().int().min(1).max(10).default(1),
  retake_policy: z.enum(["best_score", "latest_score", "approved_score"]).default("best_score"),
  shuffle_questions: z.boolean().default(true),
  shuffle_options: z.boolean().default(true),
  mcma_scoring_mode: z.enum(["exact_match", "partial_credit"]).default("partial_credit"),
  allow_negative_score: z.boolean().default(false),
  face_verification_enabled: z.boolean().default(false), // ALWAYS OFF BY DEFAULT
  show_result_immediately: z.boolean().default(false),
  anti_cheat_config: z
    .object({
      require_fullscreen: z.boolean().default(true),
      detect_tab_switch: z.boolean().default(true),
      block_copy_paste: z.boolean().default(true),
      detect_shortcuts: z.boolean().default(true),
      allow_multiple_sessions: z.boolean().default(false),
      warning_threshold: z.number().int().min(1).default(2),
      review_threshold: z.number().int().min(1).default(4),
      auto_pause_threshold: z.number().int().min(0).default(6),
      watermark_enabled: z.boolean().default(true),
    })
    .optional(),
  question_ids: z.array(z.string().uuid()).min(1),
  sessions: z
    .array(
      z.object({
        session_number: z.number().int().min(1),
        name: z.string().min(1),
        room_name: z.string().optional().nullable(),
        max_participants: z.number().int().min(1).max(1000).default(100),
        starts_at: z.string(),
        ends_at: z.string(),
      })
    )
    .min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "teacher", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createExamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Konfigurasi ujian tidak valid" },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const admin = createSupabaseAdminClient();

  if (new Date(data.ends_at) <= new Date(data.starts_at)) {
    return NextResponse.json(
      { error: "Waktu selesai ujian harus lebih besar dari waktu mulai." },
      { status: 400 }
    );
  }

  const { data: exam, error: examErr } = await admin
    .from("exams")
    .insert({
      school_id: schoolId,
      subject_id: data.subject_id,
      class_id: data.class_id || null,
      academic_year_id: data.academic_year_id || null,
      semester_id: data.semester_id || null,
      parent_exam_id: data.parent_exam_id || null,
      is_makeup: data.is_makeup,
      title: data.title,
      description: data.description || null,
      exam_date: data.exam_date,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      duration_minutes: data.duration_minutes,
      total_questions: data.question_ids.length,
      passing_score: data.passing_score,
      max_attempts: data.max_attempts,
      retake_policy: data.retake_policy,
      shuffle_questions: data.shuffle_questions,
      shuffle_options: data.shuffle_options,
      mcma_scoring_mode: data.mcma_scoring_mode,
      allow_negative_score: data.allow_negative_score,
      face_verification_enabled: data.face_verification_enabled,
      anti_cheat_config: data.anti_cheat_config || undefined,
      show_result_immediately: data.show_result_immediately,
      status: "scheduled",
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select("*")
    .single();

  if (examErr || !exam) {
    return NextResponse.json({ error: examErr?.message || "Gagal membuat ujian" }, { status: 400 });
  }

  // Fetch default weights of chosen questions
  const { data: qRows } = await admin
    .from("questions")
    .select("id, default_weight")
    .in("id", data.question_ids);
  const weightLookup = new Map((qRows || []).map((q) => [q.id, q.default_weight]));

  await admin.from("exam_questions").insert(
    data.question_ids.map((qId, idx) => ({
      school_id: schoolId,
      exam_id: exam.id,
      question_id: qId,
      question_order: idx + 1,
      weight: weightLookup.get(qId) ?? 1,
      created_by: auth.ctx.userId,
    }))
  );

  const { data: createdSessions, error: sessErr } = await admin
    .from("exam_sessions")
    .insert(
      data.sessions.map((s) => ({
        school_id: schoolId,
        exam_id: exam.id,
        session_number: s.session_number,
        name: s.name,
        room_name: s.room_name || null,
        max_participants: s.max_participants,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        status: "scheduled",
        created_by: auth.ctx.userId,
      }))
    )
    .select("*");

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 400 });
  }

  await recordAuditLog({
    schoolId,
    actorId: auth.ctx.userId,
    actorRole: auth.ctx.profile.role,
    action: "EXAM_CREATED",
    entityType: "exams",
    entityId: exam.id,
    metadata: {
      title: exam.title,
      total_questions: data.question_ids.length,
      session_count: data.sessions.length,
      face_verification_enabled: data.face_verification_enabled,
      is_makeup: data.is_makeup,
    },
  });

  return NextResponse.json({ exam, sessions: createdSessions || [] }, { status: 201 });
}
