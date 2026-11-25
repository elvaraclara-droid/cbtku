"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ClipboardCheck, BarChart3, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeID } from "@/lib/utils";
import type { ExamSummary, QuestionBankView, QuestionView } from "@/types/views";

export default function TeacherDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<QuestionBankView[]>([]);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [exams, setExams] = useState<ExamSummary[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/questions/banks").then((r) => r.json()),
      fetch("/api/questions").then((r) => r.json()),
      fetch("/api/exams").then((r) => r.json()),
    ])
      .then(([b, q, e]) => {
        setBanks(b.banks || []);
        setQuestions(q.questions || []);
        setExams(e.exams || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat ruang kerja Guru...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard Guru</h1>
          <p className="text-sm text-slate-500">
            Kelola bank soal terpusat, buat ujian multi-sesi, periksa nilai manual, dan
            analisis butir soal sesuai mata pelajaran yang ditugaskan.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/teacher/questions">
            <Button variant="outline">Kelola Bank Soal</Button>
          </Link>
          <Link href="/teacher/exams">
            <Button>
              Buat & Atur Ujian <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <BookOpen className="h-9 w-9 text-blue-700" />
            <div>
              <p className="text-xs text-slate-500">Paket Bank Soal / Total Soal</p>
              <p className="text-2xl font-bold">
                {banks.length} / {questions.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <ClipboardCheck className="h-9 w-9 text-emerald-600" />
            <div>
              <p className="text-xs text-slate-500">Ujian Dikelola</p>
              <p className="text-2xl font-bold">{exams.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <BarChart3 className="h-9 w-9 text-amber-600" />
            <div>
              <p className="text-xs text-slate-500">Ujian Aktif</p>
              <p className="text-2xl font-bold">
                {exams.filter((e) => e.status === "active").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Ujian & Hasil</CardTitle>
          <CardDescription>Klik Lihat Hasil untuk menilai esai, analisis butir, atau export nilai.</CardDescription>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Belum ada ujian yang dibuat.
            </p>
          ) : (
            <div className="space-y-3">
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{ex.title}</span>
                      <Badge variant={ex.status === "active" ? "success" : "primary"}>
                        {ex.status}
                      </Badge>
                      {ex.is_makeup && <Badge variant="warning">Susulan</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {ex.subjects?.name} • {ex.total_questions} soal • Mulai{" "}
                      {formatDateTimeID(ex.starts_at)}
                    </p>
                  </div>
                  <Link href={`/teacher/results/${ex.id}`}>
                    <Button size="sm" variant="outline">
                      <BarChart3 className="h-3.5 w-3.5" /> Hasil & Analisis
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
