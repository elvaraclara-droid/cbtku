"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, Calendar, Clock, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeID } from "@/lib/utils";
import type { ExamSummary } from "@/types/views";

export default function SupervisorDashboardPage() {
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/exams")
      .then((r) => r.json())
      .then((data) => setExams(data.exams || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat daftar ujian yang ditugaskan...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Pengawas Ujian</h1>
        <p className="text-sm text-slate-500">
          Pantau peserta ujian secara langsung, periksa aktivitas keamanan, dan berikan
          persetujuan melanjutkan ujian.
        </p>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="h-4 w-4" /> Batas Kewenangan Pengawas
        </div>
        <p className="mt-1">
          Pengawas berwenang memantau, memberi peringatan, menjeda, menyetujui kelanjutan
          ujian, menambah waktu (jika diizinkan), dan mengakhiri ujian. Pengawas tidak
          dapat mengubah jawaban siswa, kunci jawaban, nilai, atau menghapus log audit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Ujian yang Ditugaskan</CardTitle>
          <CardDescription>
            Pilih ujian untuk membuka ruang pemantauan langsung (live monitoring).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
              Belum ada penugasan pengawasan ujian untuk akun Anda.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900">{exam.title}</h3>
                      <Badge variant={exam.status === "active" ? "success" : "primary"}>
                        {exam.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">{exam.subjects?.name || "-"}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {formatDateTimeID(exam.starts_at)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {exam.duration_minutes} menit
                      </span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Link href={`/supervisor/monitoring/${exam.id}`}>
                      <Button className="w-full">
                        <Eye className="h-4 w-4" />
                        Buka Pemantauan Langsung
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
  );
}
