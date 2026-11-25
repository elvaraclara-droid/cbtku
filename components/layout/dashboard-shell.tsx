"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  LogOut,
  Menu,
  X,
  KeyRound,
  MonitorSmartphone,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDateTimeID } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProfileRecord, UserRole } from "@/types/database";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  school_admin: "Admin Sekolah",
  teacher: "Guru",
  supervisor: "Pengawas",
  student: "Siswa",
};

interface ActiveSessionRow {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  is_active: boolean;
  last_seen_at: string;
}

export function DashboardShell({
  profile,
  schoolName,
  navItems,
  children,
}: {
  profile: ProfileRecord;
  schoolName?: string | null;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Change password state
  const [pwdDialogOpen, setPwdDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pwdLoading, setPwdLoading] = useState(false);

  // Sessions state
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessions, setSessions] = useState<ActiveSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Anda telah keluar dari sistem.");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Gagal logout.");
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: revokeOthers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal mengganti password");
        return;
      }
      toast.success("Password berhasil diperbarui.");
      setPwdDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      toast.error("Kesalahan jaringan saat mengganti password");
    } finally {
      setPwdLoading(false);
    }
  }

  async function openSessionsModal() {
    setSessionsOpen(true);
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/auth/sessions");
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch {
      toast.error("Gagal memuat daftar sesi");
    } finally {
      setSessionsLoading(false);
    }
  }

  async function revokeOtherSessions() {
    const res = await fetch("/api/auth/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revokeAllOthers: true }),
    });
    if (res.ok) {
      toast.success("Seluruh sesi perangkat lain telah dihentikan.");
      openSessionsModal();
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-900">
              CBT SMART EXAM
            </div>
            <div className="text-[10px] font-medium tracking-wider text-slate-500 uppercase">
              Secure Assessment
            </div>
          </div>
        </div>

        <div className="border-b border-slate-100 px-5 py-3">
          <Badge variant="primary" className="mb-1">
            {ROLE_LABELS[profile.role]}
          </Badge>
          <p className="truncate text-sm font-semibold text-slate-900">
            {profile.full_name}
          </p>
          <p className="truncate text-xs text-slate-500">
            @{profile.username}
            {schoolName ? ` • ${schoolName}` : ""}
          </p>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-900"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1.5 border-t border-slate-200 p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setPwdDialogOpen(true)}
          >
            <KeyRound className="h-4 w-4" />
            Ganti Password
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={openSessionsModal}
          >
            <MonitorSmartphone className="h-4 w-4" />
            Sesi Aktif
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            Keluar
          </Button>
        </div>
      </aside>

      {/* Mobile Header + Drawer */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-900" />
            <span className="text-sm font-bold text-slate-900">CBT SMART EXAM</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </header>

        {mobileOpen && (
          <div className="border-b border-slate-200 bg-white p-3 lg:hidden">
            <div className="mb-2 flex items-center justify-between px-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{profile.full_name}</p>
                <p className="text-xs text-slate-500">{ROLE_LABELS[profile.role]}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Keluar
              </Button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                    pathname === item.href
                      ? "bg-blue-50 text-blue-900"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Password Dialog */}
      <Dialog open={pwdDialogOpen} onOpenChange={setPwdDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti Password Akun</DialogTitle>
            <DialogDescription>
              Verifikasi password saat ini sebelum menetapkan password baru.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currPwd">Password Saat Ini</Label>
              <Input
                id="currPwd"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPwd">Password Baru (min. 8 karakter, huruf & angka)</Label>
              <Input
                id="newPwd"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Akhiri sesi di semua perangkat lain
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwdDialogOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={pwdLoading}>
                {pwdLoading ? "Menyimpan..." : "Simpan Password"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Active Sessions Dialog */}
      <Dialog open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Riwayat Sesi Aktif</DialogTitle>
            <DialogDescription>
              Pantau perangkat yang login menggunakan akun Anda.
            </DialogDescription>
          </DialogHeader>
          {sessionsLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Memuat sesi...</div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" variant="outline" onClick={revokeOtherSessions}>
                  Hentikan Perangkat Lain
                </Button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {sessions.length === 0 ? (
                  <p className="text-sm text-slate-500">Belum ada catatan sesi.</p>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg border border-slate-200 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">
                          {s.ip_address || "IP tidak tercatat"}
                        </span>
                        <Badge variant={s.is_active ? "success" : "default"}>
                          {s.is_active ? "Aktif" : "Berakhir"}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-slate-500">
                        {s.user_agent || "-"}
                      </p>
                      <p className="mt-0.5 text-slate-400">
                        Terakhir aktif: {formatDateTimeID(s.last_seen_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
