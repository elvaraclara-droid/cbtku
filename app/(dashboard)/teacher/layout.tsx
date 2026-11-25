import { redirect } from "next/navigation";
import { BookOpen, ClipboardList, LayoutDashboard } from "lucide-react";
import { getAuthenticatedContext, getRoleHomePath } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) redirect("/login");
  if (!["teacher", "school_admin", "super_admin"].includes(ctx.profile.role)) {
    redirect(getRoleHomePath(ctx.profile.role));
  }

  let schoolName: string | null = null;
  if (ctx.profile.school_id) {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("schools")
      .select("name")
      .eq("id", ctx.profile.school_id)
      .maybeSingle();
    schoolName = data?.name || null;
  }

  return (
    <DashboardShell
      profile={ctx.profile}
      schoolName={schoolName}
      navItems={[
        {
          href: "/teacher",
          label: "Dashboard Guru",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          href: "/teacher/questions",
          label: "Bank Soal",
          icon: <BookOpen className="h-4 w-4" />,
        },
        {
          href: "/teacher/exams",
          label: "Ujian & Penilaian",
          icon: <ClipboardList className="h-4 w-4" />,
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
