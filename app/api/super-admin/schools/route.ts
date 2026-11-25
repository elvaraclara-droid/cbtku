import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET() {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const [
    { data: schools },
    { count: totalUsers },
    { count: totalStudents },
    { count: totalExams },
    { count: activeAttempts },
  ] = await Promise.all([
    admin.from("schools").select("*").order("created_at", { ascending: false }),
    admin.from("profiles").select("id", { head: true, count: "exact" }),
    admin.from("students").select("id", { head: true, count: "exact" }),
    admin.from("exams").select("id", { head: true, count: "exact" }),
    admin
      .from("exam_attempts")
      .select("id", { head: true, count: "exact" })
      .in("status", ["NORMAL", "WARNING", "NEEDS_REVIEW", "RESUMED"]),
  ]);

  return NextResponse.json({
    schools: schools || [],
    stats: {
      totalSchools: schools?.length || 0,
      totalUsers: totalUsers || 0,
      totalStudents: totalStudents || 0,
      totalExams: totalExams || 0,
      activeAttempts: activeAttempts || 0,
    },
  });
}

const createSchoolSchema = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9_-]+$/),
  npsn: z.string().max(20).optional().nullable(),
  name: z.string().min(3).max(160),
  education_level: z.string().min(2).max(32).default("SMA"),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  province: z.string().max(120).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createSchoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Data sekolah tidak valid" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: school, error } = await admin
    .from("schools")
    .insert({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      email: parsed.data.email || null,
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    })
    .select("*")
    .single();

  if (error || !school) {
    return NextResponse.json(
      { error: error?.message || "Gagal membuat sekolah" },
      { status: 400 }
    );
  }

  await admin.from("school_settings").insert({
    school_id: school.id,
    created_by: auth.ctx.userId,
    updated_by: auth.ctx.userId,
  });

  await recordAuditLog({
    schoolId: school.id,
    actorId: auth.ctx.userId,
    actorRole: "super_admin",
    action: "SCHOOL_CREATED",
    entityType: "schools",
    entityId: school.id,
    metadata: { code: school.code, name: school.name },
  });

  return NextResponse.json({ school }, { status: 201 });
}

const patchSchoolSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "inactive", "suspended"]),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireRoleApi(["super_admin"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("schools")
    .update({ status: parsed.data.status, updated_by: auth.ctx.userId })
    .eq("id", parsed.data.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await recordAuditLog({
    schoolId: parsed.data.id,
    actorId: auth.ctx.userId,
    actorRole: "super_admin",
    action: "SCHOOL_STATUS_UPDATED",
    entityType: "schools",
    entityId: parsed.data.id,
    metadata: { status: parsed.data.status },
  });

  return NextResponse.json({ school: data });
}
