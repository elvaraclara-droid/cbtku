import { redirect } from "next/navigation";
import { Building2, LayoutDashboard, ShieldCheck } from "lucide-react";
import { getAuthenticatedContext, getRoleHomePath } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthenticatedContext();
  if (!ctx) redirect("/login");
  if (ctx.profile.role !== "super_admin") redirect(getRoleHomePath(ctx.profile.role));

  return (
    <DashboardShell
      profile={ctx.profile}
      schoolName="Global Platform"
      navItems={[
        {
          href: "/super-admin",
          label: "Dashboard Global",
          icon: <LayoutDashboard className="h-4 w-4" />,
        },
        {
          href: "/super-admin#schools",
          label: "Sekolah & Admin",
          icon: <Building2 className="h-4 w-4" />,
        },
        {
          href: "/super-admin#security",
          label: "Keamanan & Backup",
          icon: <ShieldCheck className="h-4 w-4" />,
        },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
