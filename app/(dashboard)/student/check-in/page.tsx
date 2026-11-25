"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, KeyRound, Loader2, ShieldAlert, Play } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { StudentEnrollmentView } from "@/types/views";

function StudentCheckInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const examIdParam = params.get("examId") || "";
  const sessionIdParam = params.get("sessionId") || "";

  const [enrollments, setEnrollments] = useState<StudentEnrollmentView[]>([]);
  const [selectedExamId, setSelectedExamId] = useState(examIdParam);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionIdParam);
  const [tokenInput, setTokenInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Optional face verification (ONLY shown when exam.face_verification_enabled === true)
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [requiresFace, setRequiresFace] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [photoDims, setPhotoDims] = useState({ width: 0, height: 0, brightness: 120 });
  const [faceMessage, setFaceMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetch("/api/exams")
      .then((r) => r.json())
      .then((data) => {
        const list = data.enrollments || [];
        setEnrollments(list);
        if (!selectedExamId && list.length > 0) {
          setSelectedExamId(list[0].exam_id);
          setSelectedSessionId(list[0].session_id);
        }
      })
      .finally(() => setLoading(false));

    return () => {
      stopCameraStream();
    };
  }, [selectedExamId]);

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function handleValidateAndStart(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedExamId || !selectedSessionId) {
      toast.error("Pilih ujian terlebih dahulu.");
      return;
    }
    setSubmitting(true);
    try {
      let tokenId: string | null = null;
      if (tokenInput.trim()) {
        const tokRes = await fetch("/api/exams/validate-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examId: selectedExamId,
            sessionId: selectedSessionId,
            token: tokenInput.trim().toUpperCase(),
          }),
        });
        const tokData = await tokRes.json();
        if (!tokRes.ok) {
          toast.error(tokData.error || "Token ujian tidak valid.");
          return;
        }
        tokenId = tokData.tokenId;
      }

      const startRes = await fetch("/api/attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: selectedExamId,
          sessionId: selectedSessionId,
          tokenId,
        }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) {
        toast.error(startData.error || "Gagal memulai sesi ujian.");
        return;
      }

      if (startData.requiresFaceVerification) {
        setAttemptId(startData.attempt.id);
        setRequiresFace(true);
        toast.info("Ujian ini mengaktifkan verifikasi wajah opsional.");
        return;
      }

      router.push(`/exam/${startData.attempt.id}`);
    } catch {
      toast.error("Terjadi kesalahan saat memulai ujian.");
    } finally {
      setSubmitting(false);
    }
  }

  async function startCamera() {
    if (!consentAccepted) {
      toast.error("Setujui pemberitahuan privasi terlebih dahulu.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast.error(
        "Kamera tidak dapat diakses. Anda dapat meminta verifikasi manual oleh Pengawas."
      );
    }
  }

  function captureSnapshot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let lumSum = 0;
    for (let i = 0; i < imgData.length; i += 16) {
      lumSum += 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
    }
    const avgBrightness = Math.round(lumSum / Math.max(1, imgData.length / 16));
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    setCapturedPhoto(dataUrl);
    setPhotoDims({ width: canvas.width, height: canvas.height, brightness: avgBrightness });
    // Immediately stop camera stream (no continuous streaming!)
    stopCameraStream();
  }

  async function submitFaceCheck(proceedFallback = false) {
    if (!attemptId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/face-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: capturedPhoto || "data:image/jpeg;base64," + "A".repeat(120),
          width: photoDims.width || 640,
          height: photoDims.height || 480,
          brightnessScore: photoDims.brightness || 120,
          consentAccepted,
          proceedWithSupervisorFallback: proceedFallback,
        }),
      });
      const data = await res.json();
      setFaceMessage(data.note || null);
      if (data.canEnterExam) {
        toast.success("Verifikasi tercatat. Memasuki ruang ujian...");
        router.push(`/exam/${attemptId}`);
      } else {
        toast.warning(data.note || "Silakan ulangi foto atau ajukan verifikasi Pengawas.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat informasi ujian...
      </div>
    );
  }

  const selectedEnrollment = enrollments.find((e) => e.exam_id === selectedExamId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Check-In & Verifikasi Ujian</CardTitle>
          <CardDescription>
            Pastikan ujian, sesi, dan token valid sebelum memasuki layar pengerjaan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!requiresFace ? (
            <form onSubmit={handleValidateAndStart} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Ujian Terdaftar</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  value={selectedExamId}
                  onChange={(e) => {
                    const chosen = enrollments.find((x) => x.exam_id === e.target.value);
                    setSelectedExamId(e.target.value);
                    setSelectedSessionId(chosen?.session_id || "");
                  }}
                >
                  {enrollments.map((enr) => (
                    <option key={enr.exam_id} value={enr.exam_id}>
                      {enr.exams?.title} ({enr.exam_sessions?.name})
                    </option>
                  ))}
                </select>
              </div>

              {selectedEnrollment && (
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <p>
                    <strong>Mata Pelajaran:</strong> {selectedEnrollment.exams?.subjects?.name}
                  </p>
                  <p>
                    <strong>Durasi:</strong> {selectedEnrollment.exams?.duration_minutes} menit •{" "}
                    <strong>Verifikasi Wajah:</strong>{" "}
                    {selectedEnrollment.exams?.face_verification_enabled ? "AKTIF" : "NONAKTIF (OFF)"}
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="checkin-token">
                  Token Ujian (isi jika diminta ulang / masuk dari portal)
                </Label>
                <div className="relative">
                  <KeyRound className="absolute top-3 left-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="checkin-token"
                    className="pl-9 font-mono uppercase"
                    placeholder="Masukkan token sesi"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submitting || !selectedExamId}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyiapkan Ruang Ujian...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Mulai / Lanjutkan Ujian
                  </>
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">Pemberitahuan Privasi Verifikasi Wajah</p>
                <p className="mt-1">
                  Foto tunggal hanya digunakan untuk verifikasi identitas peserta pada sesi
                  ujian ini, disimpan secara privat, dan dihapus otomatis setelah masa retensi
                  sekolah berakhir. Tidak ada perekaman video berkelanjutan.
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                />
                Saya memahami dan menyetujui pengambilan 1 foto verifikasi.
              </label>

              {faceMessage && (
                <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>{faceMessage}</span>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-center">
                {cameraActive ? (
                  <video ref={videoRef} autoPlay playsInline className="mx-auto max-h-64" />
                ) : capturedPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capturedPhoto} alt="Pratinjau foto" className="mx-auto max-h-64" />
                ) : (
                  <div className="py-12 text-xs text-slate-400">
                    Kamera belum aktif. Klik Buka Kamera di bawah.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!cameraActive && (
                  <Button type="button" variant="outline" onClick={startCamera}>
                    <Camera className="h-4 w-4" />
                    Buka Kamera
                  </Button>
                )}
                {cameraActive && (
                  <Button type="button" onClick={captureSnapshot}>
                    Ambil 1 Foto
                  </Button>
                )}
                {capturedPhoto && (
                  <Button
                    type="button"
                    variant="success"
                    disabled={submitting}
                    onClick={() => submitFaceCheck(false)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Kirim & Masuk Ujian
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => router.push(`/exam/${attemptId}`)}
                >
                  Ajukan Verifikasi Manual Pengawas
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function StudentCheckInPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat...</div>}>
      <StudentCheckInContent />
    </Suspense>
  );
}
