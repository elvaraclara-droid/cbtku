"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart3, Loader2, Plus, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, SelectNative } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeID } from "@/lib/utils";
import type {
  ClassRef,
  ExamSessionSummary,
  ExamSummary,
  QuestionView,
  SubjectRef,
  SupervisorListRow,
} from "@/types/views";

export default function TeacherExamsPage() {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorListRow[]>([]);
  const [questions, setQuestions] = useState<QuestionView[]>([]);

  // Create exam state
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [classId, setClassId] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(
    new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 16)
  );
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [sessionCount, setSessionCount] = useState(1);
  const [maxPerSession, setMaxPerSession] = useState(100);
  const [faceVerificationEnabled, setFaceVerificationEnabled] = useState(false); // DEFAULT OFF
  const [isMakeup, setIsMakeup] = useState(false);
  const [parentExamId, setParentExamId] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);

  // Assignment panel
  const [assignExamId, setAssignExamId] = useState("");
  const [assignSessionId, setAssignSessionId] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSupervisorId, setAssignSupervisorId] = useState("");
  const [assignSessionsList, setAssignSessionsList] = useState<ExamSessionSummary[]>([]);

  const loadAll = useCallback(async () => {
    try {
      const [eRes, aRes, qRes, uRes] = await Promise.all([
        fetch("/api/exams"),
        fetch("/api/admin/academic"),
        fetch("/api/questions"),
        fetch("/api/admin/users?role=supervisor"),
      ]);
      const [eData, aData, qData, uData] = await Promise.all([
        eRes.json(),
        aRes.json(),
        qRes.json(),
        uRes.json(),
      ]);
      setExams(eData.exams || []);
      setSubjects(aData.subjects || []);
      setClasses(aData.classes || []);
      setQuestions(qData.questions || []);
      setSupervisors(uData.supervisors || []);
      if (!subjectId && aData.subjects?.length) setSubjectId(aData.subjects[0].id);
      if (!assignExamId && eData.exams?.length) {
        setAssignExamId(eData.exams[0].id);
        setAssignSessionsList(eData.exams[0].exam_sessions || []);
        setAssignSessionId(eData.exams[0].exam_sessions?.[0]?.id || "");
      }
      if (!assignClassId && aData.classes?.length) setAssignClassId(aData.classes[0].id);
      if (!assignSupervisorId && uData.supervisors?.length) {
        setAssignSupervisorId(uData.supervisors[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [assignClassId, assignExamId, assignSupervisorId, subjectId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    if (selectedQuestionIds.length === 0) {
      toast.error("Pilih minimal 1 soal dari bank soal.");
      return;
    }

    const startIso = new Date(startsAt).toISOString();
    const endIso = new Date(endsAt).toISOString();
    const sessions = Array.from({ length: sessionCount }).map((_, idx) => ({
      session_number: idx + 1,
      name: `Sesi ${idx + 1}`,
      max_participants: Number(maxPerSession),
      starts_at: startIso,
      ends_at: endIso,
    }));

    const res = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        subject_id: subjectId,
        class_id: classId || null,
        exam_date: examDate,
        starts_at: startIso,
        ends_at: endIso,
        duration_minutes: Number(durationMinutes),
        is_makeup: isMakeup,
        parent_exam_id: isMakeup && parentExamId ? parentExamId : null,
        face_verification_enabled: faceVerificationEnabled,
        question_ids: selectedQuestionIds,
        sessions,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal membuat ujian");
      return;
    }
    toast.success("Ujian berhasil dibuat dan dijadwalkan.");
    setTitle("");
    setSelectedQuestionIds([]);
    loadAll();
  }

  async function handleEnrollClass() {
    if (!assignExamId || !assignSessionId || !assignClassId) return;
    const res = await fetch(`/api/exams/${assignExamId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enroll_class",
        session_id: assignSessionId,
        class_id: assignClassId,
      }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || "Gagal mendaftarkan peserta");
    else toast.success(`${data.enrolledCount} siswa didaftarkan ke sesi.`);
  }

  async function handleAssignSupervisor() {
    if (!assignExamId || !assignSupervisorId) return;
    const res = await fetch(`/api/exams/${assignExamId}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign_supervisor",
        session_id: assignSessionId || null,
        supervisor_id: assignSupervisorId,
      }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || "Gagal menugaskan pengawas");
    else toast.success("Pengawas berhasil ditugaskan ke ujian.");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat manajemen ujian...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pembuatan & Pengaturan Ujian</h1>
        <p className="text-sm text-slate-500">
          Atur jadwal, sesi (single/multi-sesi), soal, ujian susulan, verifikasi wajah
          opsional (default OFF), peserta, dan pengawas.
        </p>
      </div>

      {/* Create Exam Form */}
      <Card>
        <CardHeader>
          <CardTitle>Buat Ujian Baru</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateExam} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <Label>Nama Ujian</Label>
                <Input
                  required
                  placeholder="Contoh: Penilaian Akhir Semester Matematika X"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Mata Pelajaran</Label>
                <SelectNative value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Tanggal</Label>
                <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Mulai</Label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Selesai</Label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Durasi (menit)</Label>
                <Input
                  type="number"
                  min={5}
                  max={600}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label>Jumlah Sesi (Multi-Sesi)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={sessionCount}
                  onChange={(e) => setSessionCount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Kapasitas / Sesi</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={maxPerSession}
                  onChange={(e) => setMaxPerSession(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Kelas Target (Opsional)</Label>
                <SelectNative value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Semua Kelas</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="flex flex-col justify-end gap-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={faceVerificationEnabled}
                    onChange={(e) => setFaceVerificationEnabled(e.target.checked)}
                  />
                  Verifikasi Wajah (Default OFF)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isMakeup}
                    onChange={(e) => setIsMakeup(e.target.checked)}
                  />
                  Tandai sebagai Ujian Susulan
                </label>
              </div>
            </div>

            {isMakeup && (
              <div className="space-y-1">
                <Label>Terhubung ke Ujian Utama</Label>
                <SelectNative
                  value={parentExamId}
                  onChange={(e) => setParentExamId(e.target.value)}
                >
                  <option value="">-- Pilih Ujian Utama --</option>
                  {exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title}
                    </option>
                  ))}
                </SelectNative>
              </div>
            )}

            {/* Question Picker */}
            <div className="space-y-2 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <Label>Pilih Soal ({selectedQuestionIds.length} dipilih)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedQuestionIds(questions.map((q) => q.id))}
                >
                  Pilih Semua ({questions.length})
                </Button>
              </div>
              <div className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                {questions.map((q) => {
                  const checked = selectedQuestionIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-100 p-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQuestionIds((prev) => [...prev, q.id]);
                          } else {
                            setSelectedQuestionIds((prev) => prev.filter((id) => id !== q.id));
                          }
                        }}
                      />
                      <Badge variant="default">{q.question_type}</Badge>
                      <span className="truncate">{q.stem_plain || "Soal"}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Button type="submit">
              <Plus className="h-4 w-4" /> Simpan & Jadwalkan Ujian
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Enroll Class & Assign Supervisor */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-800" />
            Penugasan Peserta & Pengawas Sesi
          </CardTitle>
          <CardDescription>
            Daftarkan seluruh siswa kelas ke sesi tertentu dan tugaskan pengawas ruangan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ujian</Label>
            <SelectNative
              value={assignExamId}
              onChange={(e) => {
                const ex = exams.find((x) => x.id === e.target.value);
                setAssignExamId(e.target.value);
                setAssignSessionsList(ex?.exam_sessions || []);
                setAssignSessionId(ex?.exam_sessions?.[0]?.id || "");
              }}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="space-y-2">
            <Label>Sesi</Label>
            <SelectNative
              value={assignSessionId}
              onChange={(e) => setAssignSessionId(e.target.value)}
            >
              {assignSessionsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectNative>
          </div>
          <div className="flex gap-2">
            <SelectNative
              value={assignClassId}
              onChange={(e) => setAssignClassId(e.target.value)}
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectNative>
            <Button type="button" variant="outline" onClick={handleEnrollClass}>
              Daftarkan Kelas
            </Button>
          </div>
          <div className="flex gap-2">
            <SelectNative
              value={assignSupervisorId}
              onChange={(e) => setAssignSupervisorId(e.target.value)}
            >
              {supervisors.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.full_name} (@{sup.username})
                </option>
              ))}
            </SelectNative>
            <Button type="button" variant="outline" onClick={handleAssignSupervisor}>
              Tugaskan Pengawas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Exams List */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Ujian ({exams.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exams.map((ex) => (
            <div
              key={ex.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
            >
              <div>
                <p className="font-semibold text-slate-900">{ex.title}</p>
                <p className="text-xs text-slate-500">
                  {ex.subjects?.name} • {ex.exam_sessions?.length || 1} sesi •{" "}
                  {formatDateTimeID(ex.starts_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/teacher/results/${ex.id}`}>
                  <Button size="sm" variant="outline">
                    <BarChart3 className="h-3.5 w-3.5" /> Hasil & Penilaian
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
