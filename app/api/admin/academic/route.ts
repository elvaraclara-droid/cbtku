import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "teacher", "supervisor", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId =
    auth.ctx.profile.school_id ||
    request.nextUrl.searchParams.get("schoolId");

  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [
    { data: school },
    { data: settings },
    { data: academicYears },
    { data: semesters },
    { data: classes },
    { data: subjects },
  ] = await Promise.all([
    admin.from("schools").select("*").eq("id", schoolId).single(),
    admin.from("school_settings").select("*").eq("school_id", schoolId).maybeSingle(),
    admin.from("academic_years").select("*").eq("school_id", schoolId).order("start_date", { ascending: false }),
    admin.from("semesters").select("*").eq("school_id", schoolId).order("start_date", { ascending: false }),
    admin.from("classes").select("*").eq("school_id", schoolId).order("grade_level").order("name"),
    admin.from("subjects").select("*").eq("school_id", schoolId).order("name"),
  ]);

  return NextResponse.json({
    school,
    settings,
    academicYears: academicYears || [],
    semesters: semesters || [],
    classes: classes || [],
    subjects: subjects || [],
  });
}

const academicActionSchema = z.object({
  entity: z.enum(["academic_year", "semester", "class", "subject", "school_settings", "school_profile"]),
  payload: z.record(z.unknown()),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "Admin harus terikat ke sekolah" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = academicActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { entity, payload } = parsed.data;

  if (entity === "academic_year") {
    const schema = z.object({
      name: z.string().min(4).max(32),
      start_date: z.string(),
      end_date: z.string(),
      is_active: z.boolean().default(false),
    });
    const v = schema.parse(payload);
    if (v.is_active) {
      await admin.from("academic_years").update({ is_active: false }).eq("school_id", schoolId);
    }
    const { data, error } = await admin
      .from("academic_years")
      .insert({ ...v, school_id: schoolId, created_by: auth.ctx.userId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  if (entity === "semester") {
    const schema = z.object({
      academic_year_id: z.string().uuid(),
      name: z.string().min(2).max(32),
      semester_number: z.number().int().min(1).max(2),
      start_date: z.string(),
      end_date: z.string(),
      is_active: z.boolean().default(false),
    });
    const v = schema.parse(payload);
    if (v.is_active) {
      await admin.from("semesters").update({ is_active: false }).eq("school_id", schoolId);
    }
    const { data, error } = await admin
      .from("semesters")
      .insert({ ...v, school_id: schoolId, created_by: auth.ctx.userId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  if (entity === "class") {
    const schema = z.object({
      code: z.string().min(2).max(32),
      name: z.string().min(2).max(120),
      grade_level: z.string().min(1).max(16),
      major: z.string().max(64).optional().nullable(),
      academic_year_id: z.string().uuid().optional().nullable(),
    });
    const v = schema.parse(payload);
    const { data, error } = await admin
      .from("classes")
      .insert({ ...v, code: v.code.toUpperCase(), school_id: schoolId, created_by: auth.ctx.userId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  if (entity === "subject") {
    const schema = z.object({
      code: z.string().min(2).max(32),
      name: z.string().min(2).max(120),
      grade_level: z.string().max(16).optional().nullable(),
      description: z.string().max(500).optional().nullable(),
    });
    const v = schema.parse(payload);
    const { data, error } = await admin
      .from("subjects")
      .insert({ ...v, code: v.code.toUpperCase(), school_id: schoolId, created_by: auth.ctx.userId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  if (entity === "school_settings") {
    const { data, error } = await admin
      .from("school_settings")
      .upsert(
        {
          ...payload,
          school_id: schoolId,
          updated_by: auth.ctx.userId,
        },
        { onConflict: "school_id" }
      )
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await recordAuditLog({
      schoolId,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
      action: "SCHOOL_SETTINGS_UPDATED",
      entityType: "school_settings",
      entityId: schoolId,
    });
    return NextResponse.json({ item: data });
  }

  if (entity === "school_profile") {
    const schema = z.object({
      name: z.string().min(3).max(160),
      npsn: z.string().max(20).optional().nullable(),
      education_level: z.string().max(32).optional(),
      address: z.string().max(500).optional().nullable(),
      city: z.string().max(120).optional().nullable(),
      province: z.string().max(120).optional().nullable(),
      phone: z.string().max(32).optional().nullable(),
      email: z.string().email().optional().nullable().or(z.literal("")),
    });
    const v = schema.parse(payload);
    const { data, error } = await admin
      .from("schools")
      .update({ ...v, email: v.email || null, updated_by: auth.ctx.userId })
      .eq("id", schoolId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
  }

  return NextResponse.json({ error: "Entitas tidak didukung" }, { status: 400 });
}
