import { redirect } from "next/navigation";
import { LayoutDashboard, FileCheck2, KeyRound } from "lucide-react";
import { getAuthenticatedContext, getRoleHomePath } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) redirect("/login");
  if (ctx.profile.role !== "student") redirect(getRoleHomePath(ctx.profile.role));

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
          href: "/student",
          label: "Ujian & Hasil",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          href: "/student/check-in",
          label: "Masuk Ujian (Token)",
          icon: <FileCheck2 className="h-4 w-4" />,
        },
        {
          href: "/student/change-password",
          label: "Keamanan Akun",
          icon: <KeyRound className="h-4 w-4" />,
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
