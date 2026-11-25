import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let bankQuery = admin
    .from("question_banks")
    .select("*, subjects(name, code), classes(name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

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
      const subjectIds = (assigned || []).map((a) => a.subject_id);
      if (subjectIds.length > 0) {
        bankQuery = bankQuery.in("subject_id", subjectIds);
      } else {
        bankQuery = bankQuery.eq("teacher_id", teacher.id);
      }
    }
  }

  const [{ data: banks }, { data: categories }] = await Promise.all([
    bankQuery,
    admin
      .from("question_categories")
      .select("*")
      .eq("school_id", schoolId)
      .order("name"),
  ]);

  return NextResponse.json({
    banks: banks || [],
    categories: categories || [],
  });
}

const createSchema = z.object({
  type: z.enum(["bank", "category"]),
  subject_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional().nullable(),
  title: z.string().min(2).max(160).optional(),
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  grade_level: z.string().max(16).optional().nullable(),
  is_shared: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (parsed.data.type === "category") {
    const { data, error } = await admin
      .from("question_categories")
      .insert({
        school_id: schoolId,
        subject_id: parsed.data.subject_id || null,
        name: parsed.data.name || parsed.data.title || "Kategori",
        description: parsed.data.description || null,
        created_by: auth.ctx.userId,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ category: data }, { status: 201 });
  }

  if (!parsed.data.subject_id || !parsed.data.title) {
    return NextResponse.json(
      { error: "Mata pelajaran dan judul bank soal wajib diisi" },
      { status: 400 }
    );
  }

  let teacherId: string | null = null;
  if (auth.ctx.profile.role === "teacher") {
    const { data: teacher } = await admin
      .from("teachers")
      .select("id")
      .eq("profile_id", auth.ctx.userId)
      .maybeSingle();
    teacherId = teacher?.id ?? null;

    if (teacherId) {
      const { data: allowed } = await admin
        .from("teacher_subjects")
        .select("id")
        .eq("teacher_id", teacherId)
        .eq("subject_id", parsed.data.subject_id)
        .eq("status", "active")
        .maybeSingle();
      if (!allowed) {
        return NextResponse.json(
          { error: "Anda tidak memiliki penugasan untuk mata pelajaran ini." },
          { status: 403 }
        );
      }
    }
  }

  const { data: bank, error } = await admin
    .from("question_banks")
    .insert({
      school_id: schoolId,
      subject_id: parsed.data.subject_id,
      class_id: parsed.data.class_id || null,
      teacher_id: teacherId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      grade_level: parsed.data.grade_level || null,
      is_shared: parsed.data.is_shared,
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ bank }, { status: 201 });
}
