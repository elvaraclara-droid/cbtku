"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ExamSummary } from "@/types/views";

interface ExamResultRowView {
  id: string;
  auto_score: number;
  manual_score: number;
  percentage: number;
  is_passed: boolean;
  students?: {
    nis?: string;
    classes?: { name?: string } | null;
    profiles?: { full_name?: string } | null;
  } | null;
}

interface ManualQueueItemView {
  id: string;
  max_score: number;
  awarded_score: number;
  grader_note: string | null;
  status: string;
  essay_answer?: string;
  questions?: { stem_plain?: string } | null;
  students?: { nis?: string; profiles?: { full_name?: string } | null } | null;
}

interface ItemAnalysisView {
  question_id: string;
  question_order: number;
  question_type: string;
  stem_plain: string;
  total_responses: number;
  correct_rate: number;
}

export default function ExamResultsAndGradingPage() {
  const { examId } = useParams<{ examId: string }>();
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [results, setResults] = useState<ExamResultRowView[]>([]);
  const [manualQueue, setManualQueue] = useState<ManualQueueItemView[]>([]);
  const [itemAnalysis, setItemAnalysis] = useState<ItemAnalysisView[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { score: string; note: string }>>({});

  const loadResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/results/${examId}`);
      const data = await res.json();
      setExam(data.exam);
      setStats(data.stats || {});
      setResults(data.results || []);
      setManualQueue(data.manualQueue || []);
      setItemAnalysis(data.itemAnalysis || []);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  async function handlePublishToggle(publish: boolean) {
    const res = await fetch(`/api/results/${examId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish }),
    });
    if (res.ok) {
      toast.success(publish ? "Hasil ujian dipublikasikan ke siswa." : "Publikasi dibatalkan.");
      loadResults();
    }
  }

  async function handleSubmitManualGrade(itemId: string) {
    const entry = gradeInputs[itemId];
    if (!entry || entry.score === "") {
      toast.error("Masukkan skor terlebih dahulu.");
      return;
    }
    const res = await fetch("/api/results/manual-grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manualGradingId: itemId,
        awardedScore: Number(entry.score),
        graderNote: entry.note || "",
        reason: "Penilaian manual oleh guru",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal menyimpan nilai manual");
      return;
    }
    toast.success("Nilai manual tersimpan dan riwayat tercatat.");
    loadResults();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat hasil & analisis ujian...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Hasil & Penilaian: {exam?.title}
          </h1>
          <p className="text-sm text-slate-500">
            Penilaian otomatis, antrean koreksi manual, analisis butir soal, publikasi, dan export.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a href={`/api/results/${examId}/export?format=csv`}>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4" /> CSV
            </Button>
          </a>
          <a href={`/api/results/${examId}/export?format=xlsx`}>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4" /> Excel
            </Button>
          </a>
          <a href={`/api/results/${examId}/export?format=pdf`}>
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4" /> PDF
            </Button>
          </a>
          <Button
            size="sm"
            variant={exam?.results_published ? "warning" : "success"}
            onClick={() => handlePublishToggle(!exam?.results_published)}
          >
            <CheckCircle2 className="h-4 w-4" />
            {exam?.results_published ? "Batalkan Publikasi" : "Publikasikan Nilai"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Peserta Dinilai</p>
            <p className="text-2xl font-bold">{stats.participantCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Lulus</p>
            <p className="text-2xl font-bold text-emerald-700">{stats.passedCount || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Rata-rata</p>
            <p className="text-2xl font-bold text-blue-800">{stats.averagePercentage || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Tertinggi</p>
            <p className="text-2xl font-bold">{stats.highestPercentage || 0}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Terendah</p>
            <p className="text-2xl font-bold">{stats.lowestPercentage || 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Manual Grading Queue */}
      {manualQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Penilaian Manual Soal Uraian ({manualQueue.length})</CardTitle>
            <CardDescription>
              Setiap perubahan nilai manual tercatat di riwayat penilaian.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {manualQueue.map((m) => (
              <div key={m.id} className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {m.students?.profiles?.full_name} (NIS: {m.students?.nis})
                  </span>
                  <Badge variant={m.status === "graded" ? "success" : "warning"}>
                    {m.status === "graded" ? `Dinilai: ${m.awarded_score}/${m.max_score}` : "Belum Dinilai"}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">Soal: {m.questions?.stem_plain}</p>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                  <strong>Jawaban Siswa:</strong> {m.essay_answer || "(Kosong)"}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="number"
                    min={0}
                    max={m.max_score}
                    step={0.5}
                    placeholder={`Skor (0 - ${m.max_score})`}
                    className="sm:w-40"
                    value={gradeInputs[m.id]?.score ?? String(m.awarded_score ?? "")}
                    onChange={(e) =>
                      setGradeInputs((prev) => ({
                        ...prev,
                        [m.id]: { score: e.target.value, note: prev[m.id]?.note || "" },
                      }))
                    }
                  />
                  <Textarea
                    rows={1}
                    placeholder="Catatan penilaian..."
                    value={gradeInputs[m.id]?.note ?? (m.grader_note || "")}
                    onChange={(e) =>
                      setGradeInputs((prev) => ({
                        ...prev,
                        [m.id]: { score: prev[m.id]?.score || "", note: e.target.value },
                      }))
                    }
                  />
                  <Button type="button" onClick={() => handleSubmitManualGrade(m.id)}>
                    Simpan Nilai
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Nilai Siswa</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b bg-slate-50 text-xs text-slate-600 uppercase">
                <tr>
                  <th className="p-3">NIS</th>
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">Auto / Manual</th>
                  <th className="p-3">Nilai (%)</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {results.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 font-mono">{r.students?.nis}</td>
                    <td className="p-3 font-semibold">{r.students?.profiles?.full_name}</td>
                    <td className="p-3">{r.students?.classes?.name || "-"}</td>
                    <td className="p-3">
                      {r.auto_score} / {r.manual_score}
                    </td>
                    <td className="p-3 font-bold">{r.percentage}%</td>
                    <td className="p-3">
                      <Badge variant={r.is_passed ? "success" : "danger"}>
                        {r.is_passed ? "LULUS" : "BELUM LULUS"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Item Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Analisis Butir Soal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-slate-50 text-slate-600 uppercase">
                <tr>
                  <th className="p-2.5">No</th>
                  <th className="p-2.5">Tipe</th>
                  <th className="p-2.5">Ringkasan Soal</th>
                  <th className="p-2.5">Respon</th>
                  <th className="p-2.5">Tingkat Benar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {itemAnalysis.map((it) => (
                  <tr key={it.question_id}>
                    <td className="p-2.5 font-bold">#{it.question_order}</td>
                    <td className="p-2.5">{it.question_type}</td>
                    <td className="max-w-md truncate p-2.5">{it.stem_plain}</td>
                    <td className="p-2.5">{it.total_responses}</td>
                    <td className="p-2.5 font-semibold">{it.correct_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
