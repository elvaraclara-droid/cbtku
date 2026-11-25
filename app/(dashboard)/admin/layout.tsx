import { redirect } from "next/navigation";
import { Building, ClipboardList, LayoutDashboard, Users } from "lucide-react";
import { getAuthenticatedContext, getRoleHomePath } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) redirect("/login");
  if (!["school_admin", "super_admin"].includes(ctx.profile.role)) {
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
          href: "/admin",
          label: "Dashboard Sekolah",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          href: "/admin/school",
          label: "Data Sekolah & Akademik",
          icon: <Building className="h-4 w-4" />,
        },
        {
          href: "/admin/users",
          label: "Siswa, Guru & Pengawas",
          icon: <Users className="h-4 w-4" />,
        },
        {
          href: "/admin/exams",
          label: "Ujian, Token & Audit",
          icon: <ClipboardList className="h-4 w-4" />,
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
