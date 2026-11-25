"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  GraduationCap,
  School,
  ClipboardCheck,
  ShieldAlert,
  TrendingUp,
  Loader2,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ExamSummary } from "@/types/views";

export default function SchoolAdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [recentExams, setRecentExams] = useState<ExamSummary[]>([]);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data.metrics || {});
        setRecentExams(data.recentExams || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat ringkasan operasional sekolah...
      </div>
    );
  }

  const chartData = [
    { name: "Siswa", jumlah: metrics.totalStudents || 0 },
    { name: "Guru", jumlah: metrics.totalTeachers || 0 },
    { name: "Kelas", jumlah: metrics.totalClasses || 0 },
    { name: "Ujian Aktif", jumlah: metrics.activeExams || 0 },
    { name: "Sedang Ujian", jumlah: metrics.activeParticipants || 0 },
    { name: "Selesai", jumlah: metrics.submittedParticipants || 0 },
  ];

  const cards = [
    { label: "Total Siswa", value: metrics.totalStudents || 0, icon: Users, color: "text-blue-700" },
    { label: "Total Guru", value: metrics.totalTeachers || 0, icon: GraduationCap, color: "text-indigo-700" },
    { label: "Total Kelas", value: metrics.totalClasses || 0, icon: School, color: "text-slate-700" },
    { label: "Ujian Aktif / Total", value: `${metrics.activeExams || 0} / ${metrics.totalExams || 0}`, icon: ClipboardCheck, color: "text-emerald-700" },
    { label: "Peserta Ujian / Selesai", value: `${metrics.activeParticipants || 0} / ${metrics.submittedParticipants || 0}`, icon: TrendingUp, color: "text-teal-700" },
    { label: "Peringatan Keamanan", value: metrics.securityAlerts || 0, icon: ShieldAlert, color: "text-rose-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Admin Sekolah</h1>
          <p className="text-sm text-slate-500">
            Ringkasan operasional CBT sekolah, kepesertaan ujian, dan indikator keamanan.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/users">
            <Button variant="outline">Kelola Pengguna</Button>
          </Link>
          <Link href="/admin/exams">
            <Button>
              Kelola Ujian & Token <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">{c.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
                </div>
                <Icon className={`h-8 w-8 ${c.color}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Statistik Operasional Sekolah</CardTitle>
            <CardDescription>
              Rata-rata nilai ujian: <strong>{metrics.averageScore || 0}%</strong> • Tingkat
              kelulusan: <strong>{metrics.passRate || 0}%</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="jumlah" fill="#1e3a8a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ujian Terbaru</CardTitle>
            <CardDescription>Status jadwal, durasi, dan pengaturan verifikasi wajah.</CardDescription>
          </CardHeader>
          <CardContent>
            {recentExams.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Belum ada ujian dibuat di sekolah ini.
              </p>
            ) : (
              <div className="space-y-2.5">
                {recentExams.map((ex) => (
                  <div
                    key={ex.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{ex.title}</p>
                      <p className="text-slate-500">
                        {ex.exam_date} • {ex.duration_minutes} menit • Wajah:{" "}
                        {ex.face_verification_enabled ? "ON" : "OFF"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ex.status === "active" ? "success" : "primary"}>
                        {ex.status}
                      </Badge>
                      <Link href={`/supervisor/monitoring/${ex.id}`}>
                        <Button size="sm" variant="outline">
                          Pantau
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
