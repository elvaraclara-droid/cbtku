import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Lock, Eye, Save, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { getAuthenticatedContext, getRoleHomePath } from "@/lib/auth/session";
import { isSupabaseAdminConfigured, isSupabasePublicConfigured } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function HomePage() {
  const ctx = await getAuthenticatedContext();
  if (ctx) {
    redirect(getRoleHomePath(ctx.profile.role));
  }

  const supabaseReady = isSupabasePublicConfigured() && isSupabaseAdminConfigured();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-950 to-slate-900 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">CBT SMART EXAM</h1>
            <p className="text-[11px] tracking-widest text-blue-200 uppercase">
              SMART EXAMINATION, SECURE ASSESSMENT.
            </p>
          </div>
        </div>

        <Link href="/login">
          <Button className="bg-white text-blue-950 hover:bg-blue-50">
            Masuk Portal
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-xs font-medium text-blue-200">
            {supabaseReady ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Infrastruktur Supabase Terkonfigurasi
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Menunggu Konfigurasi Environment Supabase (.env.local)
              </>
            )}
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Platform Ujian Sekolah Aman, Terpantau, dan Andal
          </h2>
          <p className="mt-4 text-base text-slate-300 sm:text-lg">
            Dirancang untuk pelaksanaan ujian berbasis komputer dan perangkat mobile
            hingga 500 peserta bersamaan dengan otorisasi token server, autosave
            tahan gangguan jaringan, serta pengawasan langsung real-time.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/login?tab=student">
              <Button size="lg" className="w-full bg-blue-600 text-white hover:bg-blue-500 sm:w-auto">
                Login Peserta Ujian (Username + Password + Token)
              </Button>
            </Link>
            <Link href="/login?tab=staff">
              <Button
                size="lg"
                variant="outline"
                className="w-full border-slate-600 bg-slate-800/70 text-white hover:bg-slate-800 sm:w-auto"
              >
                Portal Admin, Guru & Pengawas
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-3">
          <Card className="border-slate-800 bg-slate-900/70 text-white">
            <CardContent className="p-6">
              <Lock className="mb-3 h-7 w-7 text-blue-400" />
              <h3 className="font-semibold">Autentikasi 3 Komponen & Isolasi Kunci</h3>
              <p className="mt-1.5 text-sm text-slate-300">
                Login siswa memvalidasi username, password via Supabase Auth, serta hash token
                ujian yang terikat pada sesi dan jadwal. Kunci jawaban tidak pernah dikirim ke browser.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-white">
            <CardContent className="p-6">
              <Eye className="mb-3 h-7 w-7 text-emerald-400" />
              <h3 className="font-semibold">Pengawasan Real-Time & Izin Lanjutkan</h3>
              <p className="mt-1.5 text-sm text-slate-300">
                Mencatat keluar fullscreen, pindah tab, dan sesi ganda secara proporsional.
                Pengawas dapat memeriksa detail, menjeda, dan menyetujui siswa melanjutkan attempt yang sama.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70 text-white">
            <CardContent className="p-6">
              <Save className="mb-3 h-7 w-7 text-amber-400" />
              <h3 className="font-semibold">Autosave Idempoten & Offline Recovery</h3>
              <p className="mt-1.5 text-sm text-slate-300">
                Jawaban tersimpan otomatis berversi dengan antrean IndexedDB saat koneksi
                terputus, lalu tersinkronisasi kembali tanpa membuat attempt baru.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
