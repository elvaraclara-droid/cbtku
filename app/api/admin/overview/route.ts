import { NextResponse } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireRoleApi(["school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId && auth.ctx.profile.role !== "super_admin") {
    return NextResponse.json({ error: "Sekolah tidak terikat" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const sEq = (table: string) => {
    const q = admin.from(table);
    return q;
  };
  void sEq;

  const [
    { count: totalStudents },
    { count: totalTeachers },
    { count: totalClasses },
    { count: totalExams },
    { count: activeExams },
    { count: activeParticipants },
    { count: submittedParticipants },
    { count: securityAlerts },
    { data: recentResults },
    { data: exams },
  ] = await Promise.all([
    schoolId
      ? admin.from("students").select("id", { head: true, count: "exact" }).eq("school_id", schoolId)
      : admin.from("students").select("id", { head: true, count: "exact" }),
    schoolId
      ? admin.from("teachers").select("id", { head: true, count: "exact" }).eq("school_id", schoolId)
      : admin.from("teachers").select("id", { head: true, count: "exact" }),
    schoolId
      ? admin.from("classes").select("id", { head: true, count: "exact" }).eq("school_id", schoolId)
      : admin.from("classes").select("id", { head: true, count: "exact" }),
    schoolId
      ? admin.from("exams").select("id", { head: true, count: "exact" }).eq("school_id", schoolId)
      : admin.from("exams").select("id", { head: true, count: "exact" }),
    schoolId
      ? admin.from("exams").select("id", { head: true, count: "exact" }).eq("status", "active").eq("school_id", schoolId)
      : admin.from("exams").select("id", { head: true, count: "exact" }).eq("status", "active"),
    schoolId
      ? admin
          .from("exam_attempts")
          .select("id", { head: true, count: "exact" })
          .in("status", ["NORMAL", "WARNING", "NEEDS_REVIEW", "RESUMED", "PAUSED", "PENDING_SUPERVISOR_APPROVAL"])
          .eq("school_id", schoolId)
      : admin
          .from("exam_attempts")
          .select("id", { head: true, count: "exact" })
          .in("status", ["NORMAL", "WARNING", "NEEDS_REVIEW", "RESUMED", "PAUSED", "PENDING_SUPERVISOR_APPROVAL"]),
    schoolId
      ? admin
          .from("exam_attempts")
          .select("id", { head: true, count: "exact" })
          .eq("status", "SUBMITTED")
          .eq("school_id", schoolId)
      : admin
          .from("exam_attempts")
          .select("id", { head: true, count: "exact" })
          .eq("status", "SUBMITTED"),
    schoolId
      ? admin
          .from("exam_security_events")
          .select("id", { head: true, count: "exact" })
          .in("risk_level", ["HIGH", "CRITICAL"])
          .eq("school_id", schoolId)
      : admin
          .from("exam_security_events")
          .select("id", { head: true, count: "exact" })
          .in("risk_level", ["HIGH", "CRITICAL"]),
    schoolId
      ? admin
          .from("exam_results")
          .select("percentage, is_passed, exam_id")
          .eq("school_id", schoolId)
          .order("created_at", { ascending: false })
          .limit(200)
      : admin
          .from("exam_results")
          .select("percentage, is_passed, exam_id")
          .order("created_at", { ascending: false })
          .limit(200),
    schoolId
      ? admin
          .from("exams")
          .select("id, title, exam_date, status, duration_minutes, face_verification_enabled")
          .eq("school_id", schoolId)
          .order("exam_date", { ascending: false })
          .limit(10)
      : admin
          .from("exams")
          .select("id, title, exam_date, status, duration_minutes, face_verification_enabled")
          .order("exam_date", { ascending: false })
          .limit(10),
  ]);

  const resultRows = (recentResults || []) as Array<{
    percentage: number | string | null;
    is_passed: boolean;
    exam_id: string;
  }>;
  const averageScore =
    resultRows.length > 0
      ? Math.round(
          (resultRows.reduce((s, r) => s + Number(r.percentage || 0), 0) /
            resultRows.length) *
            100
        ) / 100
      : 0;
  const passCount = resultRows.filter((r) => r.is_passed).length;
  const passRate =
    resultRows.length > 0
      ? Math.round((passCount / resultRows.length) * 10000) / 100
      : 0;

  return NextResponse.json({
    metrics: {
      totalStudents: totalStudents || 0,
      totalTeachers: totalTeachers || 0,
      totalClasses: totalClasses || 0,
      totalExams: totalExams || 0,
      activeExams: activeExams || 0,
      activeParticipants: activeParticipants || 0,
      submittedParticipants: submittedParticipants || 0,
      securityAlerts: securityAlerts || 0,
      averageScore,
      passRate,
    },
    recentExams: exams || [],
  });
}
