"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  Maximize2,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { MathRichContent } from "@/components/exam/math-content";
import { DynamicWatermark } from "@/components/exam/dynamic-watermark";
import { useExamProctoring } from "@/hooks/use-exam-proctoring";
import {
  clearOfflineAttemptQueue,
  enqueueOfflineAnswer,
  getOfflineAnswersForAttempt,
  removeOfflineAnswer,
} from "@/lib/offline/answer-queue";
import { cn, formatSecondsClock } from "@/lib/utils";
import type {
  AntiCheatConfig,
  AttemptStatus,
  AutosaveStatus,
  StudentExamQuestionDTO,
  StudentSavedAnswerState,
} from "@/types/database";

interface ExamHeaderInfo {
  id: string;
  title: string;
  anti_cheat_config?: Partial<AntiCheatConfig>;
  subjects?: { name?: string } | null;
}

interface ExamSessionHeaderInfo {
  id: string;
  name: string;
}

interface ExamStudentHeaderInfo {
  nis: string;
  profiles?: { full_name?: string } | null;
}

interface ExamAnnouncementView {
  id: string;
  title: string;
  message: string;
}

interface SubmittedExamInfo {
  submittedAt: string;
  autoTimeout?: boolean;
  result?: { is_published?: boolean; percentage?: number } | null;
}

export default function StudentExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exam, setExam] = useState<ExamHeaderInfo | null>(null);
  const [session, setSession] = useState<ExamSessionHeaderInfo | null>(null);
  const [student, setStudent] = useState<ExamStudentHeaderInfo | null>(null);
  const [questions, setQuestions] = useState<StudentExamQuestionDTO[]>([]);
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatus>("NORMAL");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentSavedAnswerState>>({});
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("SAVED");
  const [isOnline, setIsOnline] = useState(true);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  // Server-authoritative timer
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [announcements, setAnnouncements] = useState<ExamAnnouncementView[]>([]);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedInfo, setSubmittedInfo] = useState<SubmittedExamInfo | null>(null);

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isLocked = ["PAUSED", "LOCKED", "PENDING_SUPERVISOR_APPROVAL"].includes(
    attemptStatus
  );

  const antiCheatConfig = useMemo<Partial<AntiCheatConfig>>(
    () => (exam?.anti_cheat_config || {}) as Partial<AntiCheatConfig>,
    [exam]
  );

  const handleServerStatusUpdate = useCallback((status: AttemptStatus) => {
    setAttemptStatus(status);
  }, []);

  const proctoring = useExamProctoring({
    attemptId,
    enabled: !loading && !loadError && !isLocked && attemptStatus !== "SUBMITTED" && attemptStatus !== "TERMINATED",
    config: antiCheatConfig,
    onServerStatusUpdate: handleServerStatusUpdate,
  });

  // Load exam payload and restore both server answers and unsynced IndexedDB queue
  const loadExamData = useCallback(async () => {
    try {
      const res = await fetch(`/api/attempts/${attemptId}`);
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Gagal memuat data ujian.");
        return;
      }

      setExam(data.exam);
      setSession(data.session);
      setStudent(data.student);
      setQuestions(data.questions || []);
      setAttemptStatus(data.attempt.status);
      setRemainingSeconds(data.remainingSeconds ?? 0);

      if (data.attempt.status === "SUBMITTED") {
        setSubmittedInfo({ submittedAt: data.attempt.submitted_at });
      }

      const map: Record<string, StudentSavedAnswerState> = {};
      for (const sa of (data.savedAnswers || []) as StudentSavedAnswerState[]) {
        map[sa.question_id] = sa;
      }

      // Overlay any newer unsynced IndexedDB local answers
      const queued = await getOfflineAnswersForAttempt(attemptId);
      setPendingOfflineCount(queued.length);
      for (const qItem of queued) {
        const serverVer = map[qItem.questionId]?.answer_version || 0;
        if (qItem.answerVersion >= serverVer) {
          map[qItem.questionId] = {
            question_id: qItem.questionId,
            selected_option_id: qItem.selectedOptionId,
            selected_option_ids: qItem.selectedOptionIds,
            statement_answers: qItem.statementAnswers,
            essay_answer: qItem.essayAnswer,
            is_flagged: qItem.isFlagged,
            is_answered: qItem.isAnswered,
            answer_version: qItem.answerVersion,
          };
        }
      }
      setAnswers(map);
    } catch {
      setLoadError("Tidak dapat terhubung ke server ujian.");
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    loadExamData();
  }, [loadExamData]);

  // Flush IndexedDB queue when online
  const flushOfflineQueue = useCallback(async () => {
    const items = await getOfflineAnswersForAttempt(attemptId);
    setPendingOfflineCount(items.length);
    if (items.length === 0) return;

    setSaveStatus("SYNCING");
    try {
      const res = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        for (const item of items) {
          await removeOfflineAnswer(item.queueKey);
        }
        setPendingOfflineCount(0);
        setSaveStatus("SAVED");
        toast.success(`${items.length} jawaban lokal berhasil disinkronkan.`);
      } else {
        setSaveStatus("FAILED");
      }
    } catch {
      setSaveStatus("OFFLINE");
    }
  }, [attemptId]);

  // Network listeners
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const onOnline = () => {
      setIsOnline(true);
      toast.info("Koneksi pulih. Menyinkronkan jawaban...");
      proctoring.reportEvent("RECONNECTED");
      flushOfflineQueue();
    };
    const onOffline = () => {
      setIsOnline(false);
      setSaveStatus("OFFLINE");
      toast.warning("Koneksi terputus. Jawaban disimpan sementara di perangkat.");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flushOfflineQueue, proctoring]);

  // Server-authoritative countdown & periodic heartbeat (every 15s)
  useEffect(() => {
    if (loading || loadError || attemptStatus === "SUBMITTED" || attemptStatus === "TERMINATED") {
      return;
    }

    const tick = setInterval(() => {
      if (!isLocked) {
        setRemainingSeconds((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    const heartbeat = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch(`/api/attempts/${attemptId}`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setRemainingSeconds(data.remainingSeconds ?? 0);
          setAttemptStatus(data.attemptStatus);
          if (data.announcements) setAnnouncements(data.announcements);
          if (data.autoSubmitted) {
            setSubmittedInfo({ submittedAt: data.serverNow, autoTimeout: true });
            toast.info("Waktu ujian berakhir. Jawaban telah dikirim otomatis oleh server.");
          }
          if (data.sessionRevoked) {
            toast.error("Sesi ini digantikan login perangkat lain.");
            router.push("/login");
          }
        }
      } catch {
        // Ignore transient offline heartbeat
      }
    }, 15_000);

    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
    };
  }, [attemptId, attemptStatus, isLocked, loadError, loading, router]);

  // Persist answer with idempotency_key + version + IndexedDB offline safety
  const persistAnswer = useCallback(
    async (state: StudentSavedAnswerState) => {
      const idempotencyKey = `${attemptId}:${state.question_id}:v${state.answer_version}:${crypto.randomUUID()}`;
      const payload = {
        questionId: state.question_id,
        selectedOptionId: state.selected_option_id,
        selectedOptionIds: state.selected_option_ids,
        statementAnswers: state.statement_answers,
        essayAnswer: state.essay_answer,
        isFlagged: state.is_flagged,
        isAnswered: state.is_answered,
        answerVersion: state.answer_version,
        idempotencyKey,
        clientUpdatedAt: new Date().toISOString(),
      };

      const queueItem = {
        ...payload,
        queueKey: `${attemptId}:${state.question_id}`,
        attemptId,
      };

      // Always stage in IndexedDB before network call; only delete after HTTP 200
      await enqueueOfflineAnswer(queueItem);

      if (!navigator.onLine) {
        setSaveStatus("OFFLINE");
        const items = await getOfflineAnswersForAttempt(attemptId);
        setPendingOfflineCount(items.length);
        return;
      }

      setSaveStatus("SAVING");
      try {
        const res = await fetch(`/api/attempts/${attemptId}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          await removeOfflineAnswer(queueItem.queueKey);
          const remaining = await getOfflineAnswersForAttempt(attemptId);
          setPendingOfflineCount(remaining.length);
          setSaveStatus("SAVED");
        } else {
          setSaveStatus("FAILED");
        }
      } catch {
        setSaveStatus("OFFLINE");
        const items = await getOfflineAnswersForAttempt(attemptId);
        setPendingOfflineCount(items.length);
      }
    },
    [attemptId]
  );

  function updateAnswerState(
    questionId: string,
    updater: (prev: StudentSavedAnswerState) => StudentSavedAnswerState,
    debounceMs = 250
  ) {
    if (isLocked || attemptStatus === "SUBMITTED" || attemptStatus === "TERMINATED") return;

    setAnswers((prevMap) => {
      const existing: StudentSavedAnswerState = prevMap[questionId] || {
        question_id: questionId,
        selected_option_id: null,
        selected_option_ids: [],
        statement_answers: {},
        essay_answer: null,
        is_flagged: false,
        is_answered: false,
        answer_version: 0,
      };

      const nextBase = updater(existing);
      const nextState: StudentSavedAnswerState = {
        ...nextBase,
        answer_version: existing.answer_version + 1,
      };

      if (saveTimersRef.current[questionId]) {
        clearTimeout(saveTimersRef.current[questionId]);
      }
      saveTimersRef.current[questionId] = setTimeout(() => {
        persistAnswer(nextState);
      }, debounceMs);

      return { ...prevMap, [questionId]: nextState };
    });
  }

  async function handleConfirmSubmit() {
    setSubmitting(true);
    try {
      await flushOfflineQueue();
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Siswa menekan tombol Kirim Ujian" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Gagal mengirim ujian.");
        return;
      }
      await clearOfflineAttemptQueue(attemptId);
      setAttemptStatus("SUBMITTED");
      setSubmitModalOpen(false);
      setSubmittedInfo({
        submittedAt: data.attempt?.submitted_at || new Date().toISOString(),
        result: data.result,
      });
      toast.success("Ujian berhasil dikirim dan tersimpan di server.");
    } catch {
      toast.error("Gagal menghubungi server saat mengirim ujian.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-900" />
        Memuat ruang ujian terenkripsi...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-rose-600" />
            <h2 className="text-lg font-bold">Akses Ujian Ditolak</h2>
            <p className="text-sm text-slate-600">{loadError}</p>
            <Button onClick={() => router.push("/student")}>Kembali ke Portal Siswa</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (attemptStatus === "SUBMITTED" || submittedInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h2 className="text-2xl font-bold text-slate-900">Ujian Berhasil Dikirim</h2>
            <p className="text-sm text-slate-600">
              Jawaban Anda pada <strong>{exam?.title}</strong> telah dikunci dan tercatat
              di server.
            </p>
            {submittedInfo?.result?.is_published && (
              <div className="rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-medium text-emerald-700">Nilai Akhir (Publikasi Otomatis)</p>
                <p className="text-3xl font-extrabold text-emerald-800">
                  {submittedInfo.result.percentage}%
                </p>
              </div>
            )}
            <Button onClick={() => router.push("/student")} className="w-full">
              Kembali ke Dashboard Siswa
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (attemptStatus === "TERMINATED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="max-w-md">
          <CardContent className="space-y-4 p-8 text-center">
            <Lock className="mx-auto h-12 w-12 text-rose-600" />
            <h2 className="text-xl font-bold text-slate-900">Ujian Dihentikan Pengawas</h2>
            <p className="text-sm text-slate-600">
              Sesi ujian Anda telah diakhiri oleh Pengawas. Hubungi Pengawas atau Admin
              Sekolah untuk informasi lebih lanjut.
            </p>
            <Button onClick={() => router.push("/student")}>Kembali ke Portal</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.question_id] : undefined;
  const answeredCount = questions.filter((q) => answers[q.question_id]?.is_answered).length;
  const unansweredCount = questions.length - answeredCount;
  const flaggedCount = questions.filter((q) => answers[q.question_id]?.is_flagged).length;

  return (
    <div className="relative min-h-screen bg-slate-100 select-none">
      {antiCheatConfig.watermark_enabled !== false && (
        <DynamicWatermark
          studentName={student?.profiles?.full_name || "Peserta"}
          nis={student?.nis || "-"}
          examTitle={exam?.title || "Ujian"}
          sessionName={session?.name || "Sesi"}
        />
      )}

      {/* Top Exam Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-bold text-slate-900 sm:text-base">{exam?.title}</h1>
            <p className="text-xs text-slate-500">
              {student?.profiles?.full_name} ({student?.nis}) • {exam?.subjects?.name} •{" "}
              {session?.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Connection Status */}
            <Badge variant={isOnline ? "success" : "danger"} className="gap-1">
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? "Online" : "Offline"}
            </Badge>

            {/* Autosave Status */}
            <Badge
              variant={
                saveStatus === "SAVED"
                  ? "success"
                  : saveStatus === "SAVING" || saveStatus === "SYNCING"
                    ? "primary"
                    : "warning"
              }
            >
              {saveStatus}
              {pendingOfflineCount > 0 ? ` (${pendingOfflineCount} lokal)` : ""}
            </Badge>

            {pendingOfflineCount > 0 && isOnline && (
              <Button size="sm" variant="outline" onClick={flushOfflineQueue}>
                <RefreshCw className="h-3.5 w-3.5" />
                Sinkronkan
              </Button>
            )}

            {/* Server-Authoritative Timer */}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-sm font-bold",
                remainingSeconds <= 300
                  ? "border-rose-300 bg-rose-50 text-rose-700"
                  : "border-blue-200 bg-blue-50 text-blue-900"
              )}
            >
              <Clock className="h-4 w-4" />
              {formatSecondsClock(remainingSeconds)}
            </div>

            {!proctoring.isFullscreen && (
              <Button size="sm" variant="outline" onClick={proctoring.enterFullscreen}>
                <Maximize2 className="h-3.5 w-3.5" />
                Layar Penuh
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Supervisor Pause / Approval Lock Overlay */}
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-md border-amber-300">
            <CardContent className="space-y-4 p-8 text-center">
              <Lock className="mx-auto h-12 w-12 text-amber-600" />
              <h2 className="text-xl font-bold text-slate-900">
                Ujian Dijeda / Menunggu Persetujuan Pengawas
              </h2>
              <p className="text-sm text-slate-600">
                Status saat ini: <strong>{attemptStatus}</strong>. Jawaban Anda aman dan
                tersimpan di server. Mohon hubungi Pengawas ruangan untuk pemeriksaan dan
                persetujuan melanjutkan ujian pada attempt yang sama.
              </p>
              <Button variant="outline" onClick={loadExamData} className="w-full">
                <RefreshCw className="h-4 w-4" />
                Periksa Status Persetujuan
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <main className="relative z-20 mx-auto max-w-7xl px-4 py-6">
        {proctoring.warningBanner && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>{proctoring.warningBanner}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={proctoring.dismissWarning}>
              Tutup
            </Button>
          </div>
        )}

        {announcements.length > 0 && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
            <strong>{announcements[0].title}:</strong> {announcements[0].message}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_290px]">
          {/* Question Workspace */}
          {currentQuestion && (
            <Card className="shadow-xs">
              <CardContent className="space-y-6 p-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-blue-900 px-3 py-1 text-sm font-bold text-white">
                      Soal No. {currentIndex + 1}
                    </span>
                    <Badge variant="default">
                      {currentQuestion.question_type === "single_choice"
                        ? "Pilihan Ganda"
                        : currentQuestion.question_type === "mcma"
                          ? "Pilihan Ganda Kompleks (MCMA)"
                          : currentQuestion.question_type === "true_false"
                            ? "Benar / Salah"
                            : "Uraian"}
                    </Badge>
                    <Badge variant="primary">Bobot: {currentQuestion.weight}</Badge>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant={currentAnswer?.is_flagged ? "warning" : "outline"}
                    onClick={() =>
                      updateAnswerState(
                        currentQuestion.question_id,
                        (prev) => ({
                          ...prev,
                          is_flagged: !prev.is_flagged,
                        }),
                        100
                      )
                    }
                  >
                    <Flag className="h-3.5 w-3.5" />
                    {currentAnswer?.is_flagged ? "Ditandai" : "Tandai Tinjauan"}
                  </Button>
                </div>

                {/* Media Attachments */}
                {currentQuestion.media?.length > 0 && (
                  <div className="space-y-3">
                    {currentQuestion.media.map((m) => (
                      <div key={m.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        {m.media_type === "image" && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.signed_url}
                            alt={m.caption || m.file_name}
                            className="max-h-72 rounded-md object-contain"
                          />
                        )}
                        {m.media_type === "audio" && (
                          <audio controls src={m.signed_url} className="w-full" />
                        )}
                        {m.media_type === "video" && (
                          <video controls src={m.signed_url} className="max-h-72 w-full rounded-md" />
                        )}
                        {m.caption && (
                          <p className="mt-1 text-xs text-slate-500">{m.caption}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Question Stem */}
                <MathRichContent html={currentQuestion.stem_html} className="text-base" />

                {/* Single Choice */}
                {currentQuestion.question_type === "single_choice" && (
                  <div className="space-y-2.5">
                    {currentQuestion.options.map((opt) => {
                      const selected = currentAnswer?.selected_option_id === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            updateAnswerState(currentQuestion.question_id, (prev) => ({
                              ...prev,
                              selected_option_id: opt.id,
                              is_answered: true,
                            }))
                          }
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors cursor-pointer",
                            selected
                              ? "border-blue-700 bg-blue-50/70 ring-1 ring-blue-700"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                              selected
                                ? "border-blue-800 bg-blue-800 text-white"
                                : "border-slate-300 bg-slate-50 text-slate-700"
                            )}
                          >
                            {opt.option_label}
                          </span>
                          <MathRichContent html={opt.content_html} className="text-sm" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* MCMA */}
                {currentQuestion.question_type === "mcma" && (
                  <div className="space-y-2.5">
                    <p className="text-xs font-medium text-blue-800">
                      Pilih satu atau lebih jawaban yang benar:
                    </p>
                    {currentQuestion.options.map((opt) => {
                      const chosenIds = currentAnswer?.selected_option_ids || [];
                      const checked = chosenIds.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            updateAnswerState(currentQuestion.question_id, (prev) => {
                              const set = new Set(prev.selected_option_ids || []);
                              if (set.has(opt.id)) set.delete(opt.id);
                              else set.add(opt.id);
                              const nextIds = Array.from(set);
                              return {
                                ...prev,
                                selected_option_ids: nextIds,
                                is_answered: nextIds.length > 0,
                              };
                            })
                          }
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors cursor-pointer",
                            checked
                              ? "border-blue-700 bg-blue-50/70 ring-1 ring-blue-700"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
                              checked
                                ? "border-blue-800 bg-blue-800 text-white"
                                : "border-slate-300 bg-slate-50 text-slate-700"
                            )}
                          >
                            {checked ? "✓" : opt.option_label}
                          </span>
                          <MathRichContent html={opt.content_html} className="text-sm" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* True / False Multi-Statement */}
                {currentQuestion.question_type === "true_false" && (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                        <tr>
                          <th className="p-3 text-left">Pernyataan</th>
                          <th className="w-24 p-3 text-center">Benar</th>
                          <th className="w-24 p-3 text-center">Salah</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {currentQuestion.statements.map((stmt) => {
                          const val = currentAnswer?.statement_answers?.[stmt.id];
                          return (
                            <tr key={stmt.id} className="bg-white">
                              <td className="p-3">
                                <MathRichContent html={stmt.statement_html} className="text-sm" />
                              </td>
                              <td className="p-3 text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={val === true ? "success" : "outline"}
                                  onClick={() =>
                                    updateAnswerState(currentQuestion.question_id, (prev) => {
                                      const nextMap = {
                                        ...(prev.statement_answers || {}),
                                        [stmt.id]: true,
                                      };
                                      return {
                                        ...prev,
                                        statement_answers: nextMap,
                                        is_answered: Object.keys(nextMap).length > 0,
                                      };
                                    })
                                  }
                                >
                                  Benar
                                </Button>
                              </td>
                              <td className="p-3 text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={val === false ? "destructive" : "outline"}
                                  onClick={() =>
                                    updateAnswerState(currentQuestion.question_id, (prev) => {
                                      const nextMap = {
                                        ...(prev.statement_answers || {}),
                                        [stmt.id]: false,
                                      };
                                      return {
                                        ...prev,
                                        statement_answers: nextMap,
                                        is_answered: Object.keys(nextMap).length > 0,
                                      };
                                    })
                                  }
                                >
                                  Salah
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Essay (allows normal typing!) */}
                {currentQuestion.question_type === "essay" && (
                  <div className="space-y-2">
                    <Textarea
                      rows={6}
                      placeholder="Ketik jawaban uraian Anda di sini..."
                      className="select-text"
                      value={currentAnswer?.essay_answer || ""}
                      onChange={(e) => {
                        const text = e.target.value;
                        updateAnswerState(
                          currentQuestion.question_id,
                          (prev) => ({
                            ...prev,
                            essay_answer: text,
                            is_answered: text.trim().length > 0,
                          }),
                          600
                        );
                      }}
                    />
                  </div>
                )}

                {/* Navigation Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Sebelumnya
                  </Button>

                  {currentIndex < questions.length - 1 ? (
                    <Button
                      type="button"
                      onClick={() =>
                        setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                      }
                    >
                      Berikutnya
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="success"
                      onClick={() => setSubmitModalOpen(true)}
                    >
                      <Send className="h-4 w-4" />
                      Kirim Ujian
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Question Navigation Panel */}
          <aside className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">Navigasi Soal</h2>
                  <span className="text-xs text-slate-500">
                    {answeredCount}/{questions.length} terjawab
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, idx) => {
                    const ans = answers[q.question_id];
                    const isCurrent = idx === currentIndex;
                    const isFlagged = Boolean(ans?.is_flagged);
                    const isAnswered = Boolean(ans?.is_answered);

                    return (
                      <button
                        key={q.question_id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className={cn(
                          "relative flex h-9 items-center justify-center rounded-lg border text-xs font-bold transition-all cursor-pointer",
                          isCurrent && "ring-2 ring-blue-700 ring-offset-1",
                          isFlagged
                            ? "border-amber-400 bg-amber-100 text-amber-900"
                            : isAnswered
                              ? "border-emerald-500 bg-emerald-600 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm bg-emerald-600" /> Sudah dijawab ({answeredCount})
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm bg-amber-300" /> Ditandai ({flaggedCount})
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm border border-slate-300 bg-white" /> Belum dijawab ({unansweredCount})
                  </div>
                </div>

                <Button
                  type="button"
                  variant="success"
                  className="w-full"
                  onClick={() => setSubmitModalOpen(true)}
                >
                  <Send className="h-4 w-4" />
                  Kirim Ujian
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      {/* Submit Confirmation Modal */}
      <Dialog open={submitModalOpen} onOpenChange={setSubmitModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Pengiriman Ujian</DialogTitle>
            <DialogDescription>
              Periksa kembali ringkasan jawaban Anda sebelum mengirim secara permanen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Terjawab</p>
                <p className="text-xl font-bold text-emerald-700">{answeredCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Belum Dijawab</p>
                <p className="text-xl font-bold text-rose-600">{unansweredCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ditandai</p>
                <p className="text-xl font-bold text-amber-600">{flaggedCount}</p>
              </div>
            </div>

            {unansweredCount > 0 && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                Masih terdapat {unansweredCount} soal yang belum terjawab. Anda dapat menekan
                &ldquo;Periksa Kembali&rdquo; untuk melengkapinya.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSubmitModalOpen(false)}>
                Periksa Kembali
              </Button>
              <Button variant="success" disabled={submitting} onClick={handleConfirmSubmit}>
                {submitting ? "Mengirim ke Server..." : "Ya, Kirim Jawaban"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
