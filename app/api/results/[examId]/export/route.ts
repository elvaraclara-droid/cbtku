import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ examId: string }> }
) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const { examId } = await context.params;
  const format = request.nextUrl.searchParams.get("format") || "csv";
  const admin = createSupabaseAdminClient();

  const { data: exam } = await admin
    .from("exams")
    .select("id, school_id, title, exam_date, subjects(name)")
    .eq("id", examId)
    .single();

  if (!exam) return NextResponse.json({ error: "Ujian tidak ditemukan" }, { status: 404 });
  if (auth.ctx.profile.role !== "super_admin" && exam.school_id !== auth.ctx.profile.school_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: results } = await admin
    .from("exam_results")
    .select("*, students(nis, classes(name), profiles!students_profile_id_fkey(full_name))")
    .eq("exam_id", examId)
    .order("percentage", { ascending: false });

  interface ExportResultRow {
    auto_score: number;
    manual_score: number;
    total_score: number;
    percentage: number;
    is_passed: boolean;
    students?: {
      nis?: string;
      classes?: { name?: string } | null;
      profiles?: { full_name?: string } | null;
    } | null;
  }

  const rows = ((results || []) as ExportResultRow[]).map((r, i: number) => ({
    no: i + 1,
    nis: r.students?.nis || "-",
    nama: r.students?.profiles?.full_name || "Siswa",
    kelas: r.students?.classes?.name || "-",
    auto_score: Number(r.auto_score || 0),
    manual_score: Number(r.manual_score || 0),
    total_score: Number(r.total_score || 0),
    percentage: Number(r.percentage || 0),
    status: r.is_passed ? "LULUS" : "BELUM LULUS",
  }));

  await admin.from("report_exports").insert({
    school_id: exam.school_id,
    exam_id: examId,
    export_type:
      format === "xlsx"
        ? "exam_results_xlsx"
        : format === "pdf"
          ? "exam_results_pdf"
          : "exam_results_csv",
    file_name: `hasil-ujian-${examId}.${format}`,
    row_count: rows.length,
    status: "completed",
    created_by: auth.ctx.userId,
  });

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Hasil Ujian");
    ws.columns = [
      { header: "No", key: "no", width: 6 },
      { header: "NIS", key: "nis", width: 16 },
      { header: "Nama Siswa", key: "nama", width: 28 },
      { header: "Kelas", key: "kelas", width: 16 },
      { header: "Nilai Auto", key: "auto_score", width: 12 },
      { header: "Nilai Manual", key: "manual_score", width: 12 },
      { header: "Total Skor", key: "total_score", width: 12 },
      { header: "Persentase (%)", key: "percentage", width: 14 },
      { header: "Keterangan", key: "status", width: 14 },
    ];
    rows.forEach((r) => ws.addRow(r));
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="hasil-ujian-${examId}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`LAPORAN HASIL UJIAN — CBT SMART EXAM`, 14, 16);
    doc.setFontSize(10);
    doc.text(
      `Ujian: ${exam.title} | Tanggal: ${exam.exam_date} | Jumlah Peserta: ${rows.length}`,
      14,
      23
    );

    autoTable(doc, {
      startY: 28,
      head: [["No", "NIS", "Nama Siswa", "Kelas", "Auto", "Manual", "Total", "Nilai (%)", "Status"]],
      body: rows.map((r) => [
        r.no,
        r.nis,
        r.nama,
        r.kelas,
        r.auto_score,
        r.manual_score,
        r.total_score,
        `${r.percentage}%`,
        r.status,
      ]),
    });

    const pdfBytes = doc.output("arraybuffer");
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hasil-ujian-${examId}.pdf"`,
      },
    });
  }

  const header = "no,nis,nama,kelas,auto_score,manual_score,total_score,percentage,status";
  const csvRows = rows.map(
    (r) =>
      `${r.no},"${r.nis}","${r.nama.replace(/"/g, '""')}","${r.kelas}",${r.auto_score},${r.manual_score},${r.total_score},${r.percentage},"${r.status}"`
  );
  return new NextResponse([header, ...csvRows].join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hasil-ujian-${examId}.csv"`,
    },
  });
}
