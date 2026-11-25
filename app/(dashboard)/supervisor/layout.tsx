import { redirect } from "next/navigation";
import { Eye, LayoutDashboard } from "lucide-react";
import { getAuthenticatedContext, getRoleHomePath } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function SupervisorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) redirect("/login");
  if (!["supervisor", "school_admin", "super_admin"].includes(ctx.profile.role)) {
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
          href: "/supervisor",
          label: "Ujian Ditugaskan",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          href: "/supervisor",
          label: "Pemantauan Langsung",
          icon: <Eye className="h-4 w-4" />,
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
