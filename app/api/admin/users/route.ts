import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "super_admin", "teacher"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const roleFilter = request.nextUrl.searchParams.get("role");
  const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const admin = createSupabaseAdminClient();

  const [
    { data: students },
    { data: teachers },
    { data: supervisors },
    { data: teacherSubjects },
  ] = await Promise.all([
    admin
      .from("students")
      .select("id, nis, nisn, class_id, status, gender, classes(name, code), profiles!students_profile_id_fkey(id, username, full_name, is_active, status, last_login_at, must_change_password)")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false }),
    admin
      .from("teachers")
      .select("id, nip, nuptk, specialization, status, profiles!teachers_profile_id_fkey(id, username, full_name, display_email, is_active, status, last_login_at)")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("id, username, full_name, display_email, phone, is_active, status, last_login_at, created_at")
      .eq("school_id", schoolId)
      .eq("role", "supervisor")
      .order("created_at", { ascending: false }),
    admin
      .from("teacher_subjects")
      .select("id, teacher_id, subject_id, class_id, subjects(name, code), classes(name)")
      .eq("school_id", schoolId),
  ]);

  const filterBySearch = <T extends object>(rows: T[], nameExtractor: (r: T) => string) =>
    search ? rows.filter((r) => nameExtractor(r).toLowerCase().includes(search)) : rows;

  interface JoinedStudentRow {
    nis: string;
    nisn: string | null;
    profiles?: { full_name?: string; username?: string } | Array<{ full_name?: string; username?: string }> | null;
  }
  interface JoinedTeacherRow {
    nip: string | null;
    profiles?: { full_name?: string; username?: string } | Array<{ full_name?: string; username?: string }> | null;
  }
  interface SupervisorProfileRow {
    full_name: string;
    username: string;
  }

  const pickProfile = (p: JoinedStudentRow["profiles"]) =>
    Array.isArray(p) ? p[0] : p;

  return NextResponse.json({
    students:
      roleFilter && roleFilter !== "student"
        ? []
        : filterBySearch(
            (students || []) as JoinedStudentRow[],
            (s) =>
              `${s.nis} ${s.nisn || ""} ${pickProfile(s.profiles)?.full_name || ""} ${pickProfile(s.profiles)?.username || ""}`
          ),
    teachers:
      roleFilter && roleFilter !== "teacher"
        ? []
        : filterBySearch(
            (teachers || []) as JoinedTeacherRow[],
            (t) =>
              `${t.nip || ""} ${pickProfile(t.profiles)?.full_name || ""} ${pickProfile(t.profiles)?.username || ""}`
          ),
    supervisors:
      roleFilter && roleFilter !== "supervisor"
        ? []
        : filterBySearch(
            (supervisors || []) as SupervisorProfileRow[],
            (p) => `${p.full_name} ${p.username}`
          ),
    teacherSubjects: teacherSubjects || [],
  });
}

const createUserSchema = z.object({
  role: z.enum(["student", "teacher", "supervisor"]),
  username: z.string().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  full_name: z.string().min(2).max(120),
  password: z.string().min(8).max(128).optional(),
  display_email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(32).optional().nullable(),
  // Student fields
  nis: z.string().max(32).optional(),
  nisn: z.string().max(32).optional().nullable(),
  class_id: z.string().uuid().optional().nullable(),
  gender: z.enum(["L", "P", "other"]).optional(),
  // Teacher fields
  nip: z.string().max(32).optional().nullable(),
  specialization: z.string().max(120).optional().nullable(),
  subject_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "Admin harus terikat ke sekolah" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Input pengguna tidak valid" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const username = parsed.data.username.trim().toLowerCase();
  const tempPassword =
    parsed.data.password || `Cbt#${crypto.randomBytes(6).toString("base64url")}`;
  const authEmail =
    parsed.data.display_email ||
    `${username}.${crypto.randomBytes(3).toString("hex")}@auth.cbtsmartexam.internal`;

  const { data: createdAuth, error: authErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: parsed.data.role,
      school_id: schoolId,
      username,
    },
  });

  if (authErr || !createdAuth.user) {
    return NextResponse.json(
      { error: authErr?.message || "Gagal membuat user autentikasi" },
      { status: 400 }
    );
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: createdAuth.user.id,
    school_id: schoolId,
    role: parsed.data.role,
    username,
    auth_email: authEmail,
    full_name: parsed.data.full_name,
    display_email: parsed.data.display_email || null,
    phone: parsed.data.phone || null,
    status: "active",
    is_active: true,
    must_change_password: !parsed.data.password,
    created_by: auth.ctx.userId,
    updated_by: auth.ctx.userId,
  });

  if (profErr) {
    await admin.auth.admin.deleteUser(createdAuth.user.id);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  if (parsed.data.role === "student") {
    const nis = parsed.data.nis?.trim() || username.toUpperCase();
    const { error: stuErr } = await admin.from("students").insert({
      school_id: schoolId,
      profile_id: createdAuth.user.id,
      class_id: parsed.data.class_id || null,
      nis,
      nisn: parsed.data.nisn || null,
      gender: parsed.data.gender || "L",
      created_by: auth.ctx.userId,
      updated_by: auth.ctx.userId,
    });
    if (stuErr) {
      await admin.auth.admin.deleteUser(createdAuth.user.id);
      return NextResponse.json({ error: stuErr.message }, { status: 400 });
    }
  } else if (parsed.data.role === "teacher") {
    const { data: teacher, error: tErr } = await admin
      .from("teachers")
      .insert({
        school_id: schoolId,
        profile_id: createdAuth.user.id,
        nip: parsed.data.nip || null,
        specialization: parsed.data.specialization || null,
        created_by: auth.ctx.userId,
        updated_by: auth.ctx.userId,
      })
      .select("id")
      .single();

    if (tErr || !teacher) {
      await admin.auth.admin.deleteUser(createdAuth.user.id);
      return NextResponse.json({ error: tErr?.message || "Gagal membuat guru" }, { status: 400 });
    }

    if (parsed.data.subject_ids?.length) {
      await admin.from("teacher_subjects").insert(
        parsed.data.subject_ids.map((subjectId) => ({
          school_id: schoolId,
          teacher_id: teacher.id,
          subject_id: subjectId,
          created_by: auth.ctx.userId,
        }))
      );
    }
  }

  await recordAuditLog({
    schoolId,
    actorId: auth.ctx.userId,
    actorRole: auth.ctx.profile.role,
    action: "SCHOOL_USER_CREATED",
    entityType: "profiles",
    entityId: createdAuth.user.id,
    metadata: { role: parsed.data.role, username },
  });

  return NextResponse.json(
    {
      userId: createdAuth.user.id,
      username,
      temporaryPassword: parsed.data.password ? undefined : tempPassword,
    },
    { status: 201 }
  );
}

const patchUserSchema = z.object({
  action: z.enum(["toggle_active", "reset_password", "assign_teacher_subject"]),
  profileId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  teacherId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  classId: z.string().uuid().optional().nullable(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  const body = await request.json().catch(() => null);
  const parsed = patchUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (parsed.data.action === "toggle_active" && parsed.data.profileId) {
    const nextActive = Boolean(parsed.data.isActive);
    const { error } = await admin
      .from("profiles")
      .update({
        is_active: nextActive,
        status: nextActive ? "active" : "inactive",
        updated_by: auth.ctx.userId,
      })
      .eq("id", parsed.data.profileId)
      .eq("school_id", schoolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await recordAuditLog({
      schoolId,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
      action: nextActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      entityType: "profiles",
      entityId: parsed.data.profileId,
    });

    return NextResponse.json({ ok: true });
  }

  if (parsed.data.action === "reset_password" && parsed.data.profileId) {
    // Verify user belongs to this school and is not super_admin
    const { data: target } = await admin
      .from("profiles")
      .select("id, school_id, role, username")
      .eq("id", parsed.data.profileId)
      .single();

    if (!target || target.school_id !== schoolId || target.role === "super_admin") {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    const tempPassword = `Cbt#${crypto.randomBytes(6).toString("base64url")}`;
    const { error: resetErr } = await admin.auth.admin.updateUserById(target.id, {
      password: tempPassword,
    });

    if (resetErr) {
      return NextResponse.json({ error: resetErr.message }, { status: 500 });
    }

    await Promise.all([
      admin
        .from("profiles")
        .update({
          must_change_password: true,
          password_changed_at: new Date().toISOString(),
          updated_by: auth.ctx.userId,
        })
        .eq("id", target.id),
      admin
        .from("user_sessions")
        .update({
          is_active: false,
          revoked_at: new Date().toISOString(),
          revoked_by: auth.ctx.userId,
          revoke_reason: "Reset password oleh Admin Sekolah",
        })
        .eq("user_id", target.id)
        .eq("is_active", true),
      recordAuditLog({
        schoolId,
        actorId: auth.ctx.userId,
        actorRole: auth.ctx.profile.role,
        action: "USER_PASSWORD_RESET_BY_ADMIN",
        entityType: "profiles",
        entityId: target.id,
        metadata: { target_username: target.username }, // NEVER log tempPassword!
      }),
    ]);

    // Returned ONCE in modal, never stored/displayed again
    return NextResponse.json({
      ok: true,
      temporaryPassword: tempPassword,
      username: target.username,
    });
  }

  if (
    parsed.data.action === "assign_teacher_subject" &&
    parsed.data.teacherId &&
    parsed.data.subjectId
  ) {
    const { data, error } = await admin
      .from("teacher_subjects")
      .upsert(
        {
          school_id: schoolId,
          teacher_id: parsed.data.teacherId,
          subject_id: parsed.data.subjectId,
          class_id: parsed.data.classId || null,
          status: "active",
          created_by: auth.ctx.userId,
        },
        { onConflict: "school_id,teacher_id,subject_id,class_id" }
      )
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ assignment: data });
  }

  return NextResponse.json({ error: "Aksi tidak valid" }, { status: 400 });
}
