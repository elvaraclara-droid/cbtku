"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, SelectNative, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MathRichContent } from "@/components/exam/math-content";
import type { DifficultyLevel, McmaScoringMode, QuestionType } from "@/types/database";
import type { QuestionBankView, QuestionView, SubjectRef } from "@/types/views";

export default function TeacherQuestionsPage() {
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<QuestionBankView[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [questions, setQuestions] = useState<QuestionView[]>([]);

  const [filterBankId, setFilterBankId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // New Bank form
  const [newBankTitle, setNewBankTitle] = useState("");
  const [newBankSubjectId, setNewBankSubjectId] = useState("");

  // Question Editor state
  const [bankId, setBankId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [qType, setQType] = useState<QuestionType>("single_choice");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [topic, setTopic] = useState("");
  const [stemHtml, setStemHtml] = useState("");
  const [weight, setWeight] = useState(1);
  const [mcmaMode, setMcmaMode] = useState<"exact_match" | "partial_credit">("partial_credit");
  const [explanationHtml, setExplanationHtml] = useState("");

  const [options, setOptions] = useState([
    { option_label: "A", content_html: "", is_correct: true },
    { option_label: "B", content_html: "", is_correct: false },
    { option_label: "C", content_html: "", is_correct: false },
    { option_label: "D", content_html: "", is_correct: false },
    { option_label: "E", content_html: "", is_correct: false },
  ]);

  const [statements, setStatements] = useState([
    { statement_html: "", is_true: true, weight: 1 },
    { statement_html: "", is_true: false, weight: 1 },
  ]);

  const loadData = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (filterBankId) qs.set("bankId", filterBankId);
      if (filterType) qs.set("type", filterType);
      if (searchQuery.trim()) qs.set("q", searchQuery.trim());

      const [bRes, qRes, aRes] = await Promise.all([
        fetch("/api/questions/banks"),
        fetch(`/api/questions?${qs.toString()}`),
        fetch("/api/admin/academic"),
      ]);
      const [bData, qData, aData] = await Promise.all([bRes.json(), qRes.json(), aRes.json()]);
      setBanks(bData.banks || []);
      setQuestions(qData.questions || []);
      setSubjects(aData.subjects || []);
      if (!newBankSubjectId && aData.subjects?.length) setNewBankSubjectId(aData.subjects[0].id);
      if (!bankId && bData.banks?.length) {
        setBankId(bData.banks[0].id);
        setSubjectId(bData.banks[0].subject_id);
      }
    } finally {
      setLoading(false);
    }
  }, [bankId, filterBankId, filterType, newBankSubjectId, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateBank(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/questions/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bank",
        title: newBankTitle,
        subject_id: newBankSubjectId,
        is_shared: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal membuat bank soal");
      return;
    }
    toast.success("Paket bank soal berhasil dibuat.");
    setNewBankTitle("");
    loadData();
  }

  async function handleCreateQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!bankId || !subjectId) {
      toast.error("Pilih bank soal terlebih dahulu.");
      return;
    }

    const payload: Record<string, unknown> = {
      bank_id: bankId,
      subject_id: subjectId,
      question_type: qType,
      difficulty,
      topic: topic || null,
      stem_html: stemHtml,
      has_math: stemHtml.includes("$"),
      default_weight: Number(weight),
      mcma_scoring_mode: mcmaMode,
      explanation_html: explanationHtml || null,
    };

    if (qType === "single_choice" || qType === "mcma") {
      payload.options = options.filter((o) => o.content_html.trim().length > 0);
    } else if (qType === "true_false") {
      payload.statements = statements.filter((s) => s.statement_html.trim().length > 0);
    }

    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal menyimpan soal");
      return;
    }
    toast.success("Soal berhasil disimpan ke bank soal.");
    setStemHtml("");
    setTopic("");
    setExplanationHtml("");
    loadData();
  }

  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/questions/${id}`, { method: "POST" });
    if (res.ok) {
      toast.success("Soal diduplikasi.");
      loadData();
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/questions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Soal dihapus / diarsipkan.");
      loadData();
    }
  }

  async function handleMediaUpload(questionId: string, file: File) {
    const mediaType = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "attachment";
    const fd = new FormData();
    fd.append("file", file);
    fd.append("questionId", questionId);
    fd.append("mediaType", mediaType);
    const res = await fetch("/api/questions/media", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal mengunggah media");
      return;
    }
    toast.success(`Media ${file.name} berhasil dilampirkan.`);
    loadData();
  }

  async function handleJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !bankId || !subjectId) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/questions/import-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_id: bankId,
          subject_id: subjectId,
          questions: parsed.questions || parsed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import soal gagal");
        return;
      }
      toast.success(`${data.importedCount} soal berhasil diimpor.`);
      loadData();
    } catch {
      toast.error("File JSON tidak valid.");
    } finally {
      e.target.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat Bank Soal...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bank Soal Terpusat</h1>
          <p className="text-sm text-slate-500">
            Mendukung Pilihan Ganda Tunggal, MCMA, Benar/Salah Multi-Pernyataan, Uraian,
            rumus KaTeX ($...$), dan lampiran media.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/questions/import-export${filterBankId ? `?bankId=${filterBankId}` : ""}`}>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Export JSON
            </Button>
          </a>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800">
            <Upload className="h-4 w-4" /> Import JSON
            <input type="file" accept=".json" className="hidden" onChange={handleJsonImport} />
          </label>
        </div>
      </div>

      {/* Create Bank */}
      <Card>
        <CardHeader>
          <CardTitle>Buat Paket Bank Soal Baru</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateBank} className="flex flex-col gap-3 sm:flex-row">
            <SelectNative
              value={newBankSubjectId}
              onChange={(e) => setNewBankSubjectId(e.target.value)}
              className="sm:w-64"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectNative>
            <Input
              required
              placeholder="Judul Paket Soal (contoh: Bank Soal Matematika PAS X)"
              value={newBankTitle}
              onChange={(e) => setNewBankTitle(e.target.value)}
            />
            <Button type="submit">
              <Plus className="h-4 w-4" /> Buat Paket
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Question Editor */}
      <Card>
        <CardHeader>
          <CardTitle>Editor Buat Soal Baru</CardTitle>
          <CardDescription>
            Gunakan format LaTeX seperti <code>$\frac{"{a}"}{"{b}"}$</code> untuk rumus matematika.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateQuestion} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Bank Soal</Label>
                <SelectNative
                  value={bankId}
                  onChange={(e) => {
                    const b = banks.find((x) => x.id === e.target.value);
                    setBankId(e.target.value);
                    if (b) setSubjectId(b.subject_id);
                  }}
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label>Jenis Soal</Label>
                <SelectNative
                  value={qType}
                  onChange={(e) => setQType(e.target.value as QuestionType)}
                >
                  <option value="single_choice">Pilihan Ganda Tunggal</option>
                  <option value="mcma">MCMA (Banyak Jawaban)</option>
                  <option value="true_false">Benar / Salah (Pernyataan)</option>
                  <option value="essay">Uraian (Penilaian Manual)</option>
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label>Kesulitan</Label>
                <SelectNative
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                >
                  <option value="easy">Mudah</option>
                  <option value="medium">Sedang</option>
                  <option value="hard">Sulit</option>
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label>Bobot Nilai</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={weight}
                  onChange={(e) => setWeight(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Topik / Kompetensi</Label>
                <Input
                  placeholder="Contoh: Persamaan Kuadrat"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>
              {qType === "mcma" && (
                <div className="space-y-1">
                  <Label>Mode Penilaian MCMA</Label>
                  <SelectNative
                    value={mcmaMode}
                    onChange={(e) => setMcmaMode(e.target.value as McmaScoringMode)}
                  >
                    <option value="partial_credit">Partial Credit (Non-negatif)</option>
                    <option value="exact_match">Exact Match</option>
                  </SelectNative>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <Label>Pertanyaan (HTML aman / teks / rumus KaTeX)</Label>
              <Textarea
                required
                rows={4}
                placeholder="Tuliskan teks pertanyaan di sini..."
                value={stemHtml}
                onChange={(e) => setStemHtml(e.target.value)}
              />
            </div>

            {/* Options for single_choice & mcma */}
            {(qType === "single_choice" || qType === "mcma") && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                <Label>Pilihan Jawaban (Centang kunci jawaban benar)</Label>
                {options.map((opt, idx) => (
                  <div key={opt.option_label} className="flex items-center gap-2">
                    <input
                      type={qType === "single_choice" ? "radio" : "checkbox"}
                      name="correct_option"
                      checked={opt.is_correct}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setOptions((prev) =>
                          prev.map((item, i) => {
                            if (qType === "single_choice") {
                              return { ...item, is_correct: i === idx };
                            }
                            return i === idx ? { ...item, is_correct: checked } : item;
                          })
                        );
                      }}
                    />
                    <span className="w-6 text-xs font-bold">{opt.option_label}.</span>
                    <Input
                      placeholder={`Isi opsi ${opt.option_label}`}
                      value={opt.content_html}
                      onChange={(e) =>
                        setOptions((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, content_html: e.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Statements for true_false */}
            {qType === "true_false" && (
              <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <Label>Daftar Pernyataan Benar / Salah</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setStatements((prev) => [
                        ...prev,
                        { statement_html: "", is_true: true, weight: 1 },
                      ])
                    }
                  >
                    + Pernyataan
                  </Button>
                </div>
                {statements.map((stmt, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="flex-1"
                      placeholder={`Pernyataan ${idx + 1}`}
                      value={stmt.statement_html}
                      onChange={(e) =>
                        setStatements((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, statement_html: e.target.value } : item
                          )
                        )
                      }
                    />
                    <SelectNative
                      className="w-28"
                      value={stmt.is_true ? "true" : "false"}
                      onChange={(e) =>
                        setStatements((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? { ...item, is_true: e.target.value === "true" }
                              : item
                          )
                        )
                      }
                    >
                      <option value="true">Benar</option>
                      <option value="false">Salah</option>
                    </SelectNative>
                    <Input
                      type="number"
                      className="w-20"
                      min={0.5}
                      step={0.5}
                      value={stmt.weight}
                      onChange={(e) =>
                        setStatements((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, weight: Number(e.target.value) } : item
                          )
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <Button type="submit">
              <Plus className="h-4 w-4" /> Simpan Soal ke Bank Soal
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Question List + Filter */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Daftar Soal ({questions.length})</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Cari soal / topik..."
                  className="pl-9 sm:w-56"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <SelectNative
                value={filterBankId}
                onChange={(e) => setFilterBankId(e.target.value)}
                className="sm:w-48"
              >
                <option value="">Semua Bank Soal</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </SelectNative>
              <SelectNative
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="sm:w-44"
              >
                <option value="">Semua Tipe</option>
                <option value="single_choice">PG Tunggal</option>
                <option value="mcma">MCMA</option>
                <option value="true_false">Benar/Salah</option>
                <option value="essay">Uraian</option>
              </SelectNative>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="primary">#{idx + 1}</Badge>
                  <Badge variant="default">{q.question_type}</Badge>
                  <Badge variant="warning">{q.difficulty}</Badge>
                  <span className="text-xs text-slate-500">
                    {q.subjects?.name} • Bobot {q.default_weight}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">
                    <Upload className="h-3 w-3" /> Lampirkan Media
                    <input
                      type="file"
                      accept="image/*,audio/*,video/mp4,video/webm,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleMediaUpload(q.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button size="sm" variant="outline" onClick={() => handleDuplicate(q.id)}>
                    <Copy className="h-3.5 w-3.5" /> Duplikat
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(q.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <MathRichContent html={q.stem_html} className="text-sm" />
              {q.question_media && q.question_media.length > 0 && (
                <p className="mt-2 text-xs text-blue-700">
                  Media terlampir: {q.question_media.map((m) => m.file_name).join(", ")}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
