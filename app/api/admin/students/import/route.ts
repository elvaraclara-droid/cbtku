import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import crypto from "crypto";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordAuditLog } from "@/lib/security/audit";

interface ParsedStudentRow {
  username: string;
  full_name: string;
  nis: string;
  nisn?: string;
  class_code?: string;
  gender?: string;
}

function parseCsvLines(text: string): ParsedStudentRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: ParsedStudentRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] || "";
    });
    if (rowObj.username && rowObj.full_name && rowObj.nis) {
      rows.push({
        username: rowObj.username,
        full_name: rowObj.full_name,
        nis: rowObj.nis,
        nisn: rowObj.nisn || undefined,
        class_code: rowObj.class_code || undefined,
        gender: rowObj.gender || undefined,
      });
    }
  }
  return rows;
}

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "File CSV/Excel wajib diunggah" }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Format file harus .csv atau .xlsx" },
      { status: 400 }
    );
  }

  let parsedRows: ParsedStudentRow[] = [];
  const arrayBuf = await file.arrayBuffer();

  if (fileName.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(arrayBuf);
    parsedRows = parseCsvLines(text);
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuf);
    const sheet = workbook.worksheets[0];
    if (sheet) {
      const headers: string[] = [];
      sheet.eachRow((row, rowNum) => {
        if (rowNum === 1) {
          row.eachCell((cell, colNum) => {
            headers[colNum] = String(cell.value || "").trim().toLowerCase();
          });
          return;
        }
        const rowObj: Record<string, string> = {};
        row.eachCell((cell, colNum) => {
          const key = headers[colNum];
          if (key) rowObj[key] = String(cell.value || "").trim();
        });
        if (rowObj.username && rowObj.full_name && rowObj.nis) {
          parsedRows.push({
            username: rowObj.username,
            full_name: rowObj.full_name,
            nis: rowObj.nis,
            nisn: rowObj.nisn || undefined,
            class_code: rowObj.class_code || undefined,
            gender: rowObj.gender || undefined,
          });
        }
      });
    }
  }

  if (parsedRows.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris data siswa yang valid (butuh kolom: username, full_name, nis)." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: schoolClasses } = await admin
    .from("classes")
    .select("id, code")
    .eq("school_id", schoolId);
  const classCodeMap = new Map(
    (schoolClasses || []).map((c) => [c.code.toUpperCase(), c.id])
  );

  const created: Array<{ username: string; nis: string; temporaryPassword: string }> = [];
  const skipped: Array<{ username: string; reason: string }> = [];

  for (const row of parsedRows.slice(0, 500)) {
    const username = row.username.trim().toLowerCase();
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();

    if (existingProfile) {
      skipped.push({ username, reason: "Username sudah terdaftar" });
      continue;
    }

    const { data: existingNis } = await admin
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .eq("nis", row.nis)
      .maybeSingle();

    if (existingNis) {
      skipped.push({ username, reason: `NIS ${row.nis} duplikat` });
      continue;
    }

    const tempPassword = `Cbt#${crypto.randomBytes(5).toString("base64url")}`;
    const authEmail = `${username}.${crypto.randomBytes(3).toString("hex")}@auth.cbtsmartexam.internal`;

    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: "student", school_id: schoolId, username },
    });

    if (authErr || !authUser.user) {
      skipped.push({ username, reason: authErr?.message || "Gagal membuat auth" });
      continue;
    }

    const { error: pErr } = await admin.from("profiles").insert({
      id: authUser.user.id,
      school_id: schoolId,
      role: "student",
      username,
      auth_email: authEmail,
      full_name: row.full_name,
      status: "active",
      is_active: true,
      must_change_password: true,
      created_by: auth.ctx.userId,
    });

    if (pErr) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      skipped.push({ username, reason: pErr.message });
      continue;
    }

    const classId = row.class_code
      ? classCodeMap.get(row.class_code.toUpperCase()) ?? null
      : null;

    const { error: sErr } = await admin.from("students").insert({
      school_id: schoolId,
      profile_id: authUser.user.id,
      class_id: classId,
      nis: row.nis,
      nisn: row.nisn || null,
      gender: row.gender === "P" ? "P" : "L",
      created_by: auth.ctx.userId,
    });

    if (sErr) {
      await admin.auth.admin.deleteUser(authUser.user.id);
      skipped.push({ username, reason: sErr.message });
      continue;
    }

    created.push({ username, nis: row.nis, temporaryPassword: tempPassword });
  }

  await recordAuditLog({
    schoolId,
    actorId: auth.ctx.userId,
    actorRole: auth.ctx.profile.role,
    action: "STUDENTS_BULK_IMPORTED",
    entityType: "students",
    metadata: { created_count: created.length, skipped_count: skipped.length },
  });

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  });
}
