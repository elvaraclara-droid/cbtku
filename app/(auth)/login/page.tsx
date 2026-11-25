"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, KeyRound, UserCheck, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "staff" ? "staff" : "student";

  const [tab, setTab] = useState<"student" | "staff">(initialTab);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Student 3-component login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");

  // Staff login
  const [staffIdentifier, setStaffIdentifier] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  async function handleStudentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          token: token.trim().toUpperCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Login ujian siswa ditolak.");
        return;
      }
      toast.success("Autentikasi & Token Ujian Terverifikasi!");
      router.push(data.redirectTo || "/student");
      router.refresh();
    } catch {
      setErrorMsg("Gagal terhubung ke server autentikasi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: staffIdentifier.trim(),
          password: staffPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Login staf gagal.");
        return;
      }
      toast.success("Berhasil masuk ke portal.");
      router.push(data.redirectTo || "/");
      router.refresh();
    } catch {
      setErrorMsg("Gagal terhubung ke server autentikasi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-900 text-white shadow-sm">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">CBT SMART EXAM</h1>
          <p className="text-xs font-medium tracking-wider text-slate-500 uppercase">
            SMART EXAMINATION, SECURE ASSESSMENT.
          </p>
        </div>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="pb-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setTab("student");
                setErrorMsg(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer",
                tab === "student"
                  ? "bg-white text-blue-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Login Ujian Siswa
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("staff");
                setErrorMsg(null);
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition-all cursor-pointer",
                tab === "staff"
                  ? "bg-white text-blue-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Admin / Guru / Pengawas
            </button>
          </div>
          <CardTitle className="pt-3">
            {tab === "student" ? "Masuk Ruang Ujian" : "Masuk Portal Pengelola"}
          </CardTitle>
          <CardDescription>
            {tab === "student"
              ? "Wajib memasukkan Username (NIS/NISN), Password, dan Token Ujian aktif."
              : "Gunakan akun resmi Super Admin, Admin Sekolah, Guru, atau Pengawas."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMsg && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {tab === "student" ? (
            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="stu-user">Username / NIS / NISN</Label>
                <Input
                  id="stu-user"
                  placeholder="Contoh: 202601001"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-pass">Password</Label>
                <Input
                  id="stu-pass"
                  type="password"
                  placeholder="Masukkan password Anda"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="stu-token">Token Ujian</Label>
                <Input
                  id="stu-token"
                  placeholder="Masukkan 6–16 karakter token dari Pengawas"
                  className="font-mono tracking-widest uppercase"
                  required
                  minLength={6}
                  maxLength={24}
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memvalidasi Akun & Token...
                  </>
                ) : (
                  "Verifikasi & Masuk Ujian"
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleStaffSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="staff-id">Username atau Email</Label>
                <Input
                  id="staff-id"
                  placeholder="Contoh: admin.sman1"
                  autoComplete="username"
                  required
                  value={staffIdentifier}
                  onChange={(e) => setStaffIdentifier(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-pass">Password</Label>
                <Input
                  id="staff-pass"
                  type="password"
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                  required
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Masuk Portal"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
          Memuat halaman autentikasi...
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
