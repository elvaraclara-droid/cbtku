"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, CheckCircle2, PlayCircle, Award, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AttemptStatusBadge } from "@/components/status-badge";
import { formatDateTimeID } from "@/lib/utils";
import type { AttemptStatus } from "@/types/database";
import type {
  PublishedResultView,
  StudentAttemptView,
  StudentEnrollmentView,
} from "@/types/views";

export default function StudentDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<StudentEnrollmentView[]>([]);
  const [attempts, setAttempts] = useState<StudentAttemptView[]>([]);
  const [publishedResults, setPublishedResults] = useState<PublishedResultView[]>([]);

  useEffect(() => {
    fetch("/api/exams")
      .then((r) => r.json())
      .then((data) => {
        setEnrollments(data.enrollments || []);
        setAttempts(data.attempts || []);
        setPublishedResults(data.publishedResults || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat jadwal ujian siswa...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Portal Ujian Siswa</h1>
        <p className="text-sm text-slate-500">
          Daftar ujian terjadwal, status pengerjaan, dan nilai hasil ujian yang telah dipublikasikan.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <BookOpen className="h-9 w-9 text-blue-700" />
            <div>
              <p className="text-xs text-slate-500">Ujian Terdaftar</p>
              <p className="text-2xl font-bold">{enrollments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            <div>
              <p className="text-xs text-slate-500">Ujian Selesai</p>
              <p className="text-2xl font-bold">
                {attempts.filter((a) => a.status === "SUBMITTED").length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Award className="h-9 w-9 text-amber-600" />
            <div>
              <p className="text-xs text-slate-500">Hasil Dipublikasikan</p>
              <p className="text-2xl font-bold">{publishedResults.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Ujian Tersedia</CardTitle>
          <CardDescription>
            Pilih ujian untuk melakukan verifikasi token dan memulai sesi pengerjaan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enrollments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
              Belum ada ujian yang dijadwalkan untuk akun Anda.
            </div>
          ) : (
            <div className="space-y-3">
              {enrollments.map((enr) => {
                const exam = enr.exams;
                const session = enr.exam_sessions;
                const examAttempt = attempts.find((a) => a.exam_id === exam?.id);
                const published = publishedResults.find((r) => r.exam_id === exam?.id);
                const canResume =
                  examAttempt && !["SUBMITTED", "TERMINATED"].includes(examAttempt.status);

                return (
                  <div
                    key={`${enr.exam_id}-${enr.session_id}`}
                    className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{exam?.title}</h3>
                        <Badge variant="primary">{exam?.subjects?.name || "Mapel"}</Badge>
                        {exam?.face_verification_enabled && (
                          <Badge variant="warning">Verifikasi Wajah Aktif</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {session?.name} • Jadwal: {formatDateTimeID(session?.starts_at)} –{" "}
                        {formatDateTimeID(session?.ends_at)}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {exam?.duration_minutes} menit •{" "}
                          {exam?.total_questions} soal
                        </span>
                        {examAttempt && (
                          <AttemptStatusBadge status={examAttempt.status as AttemptStatus} />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {published && (
                        <div className="rounded-lg bg-emerald-50 px-3 py-1.5 text-right">
                          <p className="text-[11px] font-medium text-emerald-700">Nilai Akhir</p>
                          <p className="text-lg font-bold text-emerald-800">
                            {published.percentage}%
                          </p>
                        </div>
                      )}

                      {canResume ? (
                        <Link href={`/exam/${examAttempt.id}`}>
                          <Button variant="success">
                            <PlayCircle className="h-4 w-4" />
                            Lanjutkan Ujian
                          </Button>
                        </Link>
                      ) : examAttempt?.status === "SUBMITTED" && !enr.retake_allowed ? (
                        <Badge variant="success">Telah Dikirim</Badge>
                      ) : (
                        <Link
                          href={`/student/check-in?examId=${enr.exam_id}&sessionId=${enr.session_id}`}
                        >
                          <Button>
                            <PlayCircle className="h-4 w-4" />
                            Masuk Ujian
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
