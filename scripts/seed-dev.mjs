/**
 * Development / Staging Bootstrap Seed Script for CBT SMART EXAM.
 * Usage:
 *   node --env-file=.env.local scripts/seed-dev.mjs
 *
 * WARNING: For development & staging verification only. Change all default
 * credentials immediately or use Admin UI to generate fresh credentials.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createAccount({ schoolId, role, username, fullName, password }) {
  const authEmail = `${username}@auth.cbtsmartexam.internal`;
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { role, school_id: schoolId, username },
  });

  if (authErr || !authUser.user) {
    throw new Error(`Failed creating auth user ${username}: ${authErr?.message}`);
  }

  const { error: profErr } = await admin.from("profiles").insert({
    id: authUser.user.id,
    school_id: schoolId,
    role,
    username,
    auth_email: authEmail,
    full_name: fullName,
    status: "active",
    is_active: true,
    must_change_password: false,
  });

  if (profErr) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    throw new Error(`Failed creating profile ${username}: ${profErr.message}`);
  }

  return authUser.user.id;
}

async function main() {
  const initialPassword =
    process.env.SEED_DEFAULT_PASSWORD || `CbtDev#${crypto.randomBytes(4).toString("hex")}`;

  // 1. Create Super Admin
  await createAccount({
    schoolId: null,
    role: "super_admin",
    username: "superadmin",
    fullName: "Super Admin CBT",
    password: initialPassword,
  });

  // 2. Create Staging School
  const { data: school } = await admin
    .from("schools")
    .upsert(
      {
        code: "SMAN1DEMO",
        name: "SMA Negeri 1 Demo CBT",
        education_level: "SMA",
        city: "Jakarta",
        status: "active",
      },
      { onConflict: "code" }
    )
    .select("id")
    .single();

  await admin
    .from("school_settings")
    .upsert({ school_id: school.id }, { onConflict: "school_id" });

  // 3. Create School Admin, Teacher, Supervisor, Student
  await createAccount({
    schoolId: school.id,
    role: "school_admin",
    username: "admin.sman1",
    fullName: "Admin Sekolah SMAN 1",
    password: initialPassword,
  });

  const teacherUserId = await createAccount({
    schoolId: school.id,
    role: "teacher",
    username: "guru.matematika",
    fullName: "Guru Matematika",
    password: initialPassword,
  });

  await createAccount({
    schoolId: school.id,
    role: "supervisor",
    username: "pengawas.ruang1",
    fullName: "Pengawas Ruang 1",
    password: initialPassword,
  });

  const studentUserId = await createAccount({
    schoolId: school.id,
    role: "student",
    username: "202601001",
    fullName: "Siswa Uji Coba 1",
    password: initialPassword,
  });

  const { data: cls } = await admin
    .from("classes")
    .upsert(
      { school_id: school.id, code: "X-IPA-1", name: "X IPA 1", grade_level: "X" },
      { onConflict: "school_id,code" }
    )
    .select("id")
    .single();

  const { data: subj } = await admin
    .from("subjects")
    .upsert(
      { school_id: school.id, code: "MTK-X", name: "Matematika Wajib", grade_level: "X" },
      { onConflict: "school_id,code" }
    )
    .select("id")
    .single();

  const { data: teacherRow } = await admin
    .from("teachers")
    .upsert({ school_id: school.id, profile_id: teacherUserId, nip: "198501012010011001" }, { onConflict: "profile_id" })
    .select("id")
    .single();

  await admin
    .from("teacher_subjects")
    .upsert(
      { school_id: school.id, teacher_id: teacherRow.id, subject_id: subj.id, class_id: cls.id },
      { onConflict: "school_id,teacher_id,subject_id,class_id" }
    );

  await admin
    .from("students")
    .upsert(
      {
        school_id: school.id,
        profile_id: studentUserId,
        class_id: cls.id,
        nis: "202601001",
        nisn: "0099887766",
      },
      { onConflict: "profile_id" }
    );

  console.log("Seed completed successfully.");
  console.log("School ID:", school.id);
  console.log("Initial generated password for seeded accounts:", initialPassword);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
