import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get("format") || "csv";
  const admin = createSupabaseAdminClient();
  const { data: students } = await admin
    .from("students")
    .select("nis, nisn, gender, status, classes(name, code), profiles!students_profile_id_fkey(username, full_name, is_active)")
    .eq("school_id", schoolId)
    .order("nis");

  interface ExportStudentRow {
    nis: string;
    nisn: string | null;
    gender: string | null;
    classes?: { name?: string; code?: string } | null;
    profiles?: { username?: string; full_name?: string; is_active?: boolean } | null;
  }

  const rows = ((students || []) as ExportStudentRow[]).map((s) => ({
    nis: s.nis,
    nisn: s.nisn || "",
    username: s.profiles?.username || "",
    full_name: s.profiles?.full_name || "",
    class_code: s.classes?.code || "",
    class_name: s.classes?.name || "",
    gender: s.gender || "",
    status: s.profiles?.is_active ? "Aktif" : "Nonaktif",
  }));

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Data Siswa");
    ws.columns = [
      { header: "NIS", key: "nis", width: 16 },
      { header: "NISN", key: "nisn", width: 16 },
      { header: "Username", key: "username", width: 20 },
      { header: "Nama Lengkap", key: "full_name", width: 32 },
      { header: "Kode Kelas", key: "class_code", width: 14 },
      { header: "Kelas", key: "class_name", width: 20 },
      { header: "Gender", key: "gender", width: 10 },
      { header: "Status", key: "status", width: 12 },
    ];
    rows.forEach((r) => ws.addRow(r));
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="data-siswa.xlsx"',
      },
    });
  }

  const header = "nis,nisn,username,full_name,class_code,class_name,gender,status";
  const csvLines = rows.map(
    (r) =>
      `"${r.nis}","${r.nisn}","${r.username}","${r.full_name.replace(/"/g, '""')}","${r.class_code}","${r.class_name}","${r.gender}","${r.status}"`
  );
  const csvContent = [header, ...csvLines].join("\n");
  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="data-siswa.csv"',
    },
  });
}
