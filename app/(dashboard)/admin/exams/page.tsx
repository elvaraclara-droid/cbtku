"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Printer, Shield, Ban, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, SelectNative } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeID } from "@/lib/utils";
import type {
  AuditLogView,
  ExamSessionSummary,
  ExamSummary,
  TokenMetadataView,
} from "@/types/views";

interface ExamDetailState {
  sessions?: ExamSessionSummary[];
  tokens?: TokenMetadataView[];
}

export default function AdminExamsAndTokensPage() {
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [examDetail, setExamDetail] = useState<ExamDetailState | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogView[]>([]);

  // Token creation
  const [sessionId, setSessionId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [validFrom, setValidFrom] = useState(
    new Date(Date.now() - 5 * 60_000).toISOString().slice(0, 16)
  );
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 16)
  );
  const [generatedTokenOnce, setGeneratedTokenOnce] = useState<string | null>(null);

  const loadExamsAndLogs = useCallback(async () => {
    try {
      const [eRes, lRes] = await Promise.all([
        fetch("/api/exams"),
        fetch("/api/admin/audit-logs"),
      ]);
      const [eData, lData] = await Promise.all([eRes.json(), lRes.json()]);
      const list = eData.exams || [];
      setExams(list);
      setAuditLogs(lData.auditLogs || []);
      if (!selectedExamId && list.length > 0) {
        setSelectedExamId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedExamId]);

  const loadSelectedExam = useCallback(async (examId: string) => {
    if (!examId) return;
    const res = await fetch(`/api/exams/${examId}`);
    if (res.ok) {
      const data = await res.json();
      setExamDetail(data);
      if (data.sessions?.length) {
        setSessionId(data.sessions[0].id);
      }
    }
  }, []);

  useEffect(() => {
    loadExamsAndLogs();
  }, [loadExamsAndLogs]);

  useEffect(() => {
    if (selectedExamId) loadSelectedExam(selectedExamId);
  }, [selectedExamId, loadSelectedExam]);

  async function handleGenerateAutoToken() {
    if (!selectedExamId || !sessionId) return;
    const res = await fetch(`/api/exams/${selectedExamId}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "auto",
        session_id: sessionId,
        valid_from: new Date(validFrom).toISOString(),
        valid_until: new Date(validUntil).toISOString(),
        usage_policy: "session_shared",
        revoke_previous: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal generate token");
      return;
    }
    setGeneratedTokenOnce(data.plaintextToken);
    toast.success("Token acak CSPRNG berhasil dibuat. Salin atau cetak sekarang!");
    loadSelectedExam(selectedExamId);
  }

  async function handleManualToken(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedExamId || !sessionId) return;
    const res = await fetch(`/api/exams/${selectedExamId}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "manual",
        session_id: sessionId,
        manual_token: manualToken,
        valid_from: new Date(validFrom).toISOString(),
        valid_until: new Date(validUntil).toISOString(),
        usage_policy: "session_shared",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal menyimpan token manual");
      return;
    }
    setGeneratedTokenOnce(data.plaintextToken);
    setManualToken("");
    toast.success("Token manual disimpan dalam bentuk hash aman.");
    loadSelectedExam(selectedExamId);
  }

  async function handleRevokeToken(tokenId: string) {
    const res = await fetch(`/api/exams/${selectedExamId}/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "revoke",
        token_id: tokenId,
        reason: "Dicabut oleh Admin Sekolah",
      }),
    });
    if (res.ok) {
      toast.success("Token berhasil dicabut.");
      loadSelectedExam(selectedExamId);
    }
  }

  async function handleUpdateExamStatus(status: string) {
    const body: { status: string; cancellation_reason?: string } = { status };
    if (status === "cancelled") {
      const reason = window.prompt("Masukkan alasan pembatalan ujian:");
      if (!reason) return;
      body.cancellation_reason = reason;
    }
    const res = await fetch(`/api/exams/${selectedExamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success(`Status ujian diubah ke ${status}.`);
      loadSelectedExam(selectedExamId);
      loadExamsAndLogs();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat kontrol ujian & token...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kontrol Ujian, Token & Audit</h1>
          <p className="text-sm text-slate-500">
            Generate token acak kriptografis atau manual (disimpan ter-hash), kelola sesi,
            dan pantau audit log sekolah.
          </p>
        </div>
        <Link href="/teacher/exams">
          <Button variant="outline">Buat / Kelola Jadwal Ujian</Button>
        </Link>
      </div>

      {/* Exam selector */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-1 items-center gap-3">
            <Label className="shrink-0">Pilih Ujian:</Label>
            <SelectNative
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title} ({ex.status})
                </option>
              ))}
            </SelectNative>
          </div>
          {selectedExamId && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="success" onClick={() => handleUpdateExamStatus("active")}>
                Aktifkan
              </Button>
              <Button size="sm" variant="warning" onClick={() => handleUpdateExamStatus("paused")}>
                Jeda Ujian
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleUpdateExamStatus("completed")}>
                Tutup Ujian
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleUpdateExamStatus("cancelled")}>
                Batalkan
              </Button>
              <Link href={`/supervisor/monitoring/${selectedExamId}`}>
                <Button size="sm">
                  <Eye className="h-3.5 w-3.5" /> Monitor
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {generatedTokenOnce && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-emerald-400 bg-emerald-50 p-5">
          <div>
            <p className="text-xs font-semibold text-emerald-800 uppercase">
              Token Ujian Baru (Tampil Sekali — Tidak Disimpan Plaintext)
            </p>
            <p className="mt-1 font-mono text-3xl font-extrabold tracking-widest text-emerald-950">
              {generatedTokenOnce}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(generatedTokenOnce);
                toast.success("Token disalin ke clipboard");
              }}
            >
              <Copy className="h-4 w-4" /> Salin
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Cetak
            </Button>
          </div>
        </div>
      )}

      {/* Token Generator & History */}
      {examDetail && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-800" />
                Buat Token Ujian (Otomatis & Manual)
              </CardTitle>
              <CardDescription>
                Token disimpan hanya dalam bentuk hash HMAC-SHA256 di database.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Sesi Ujian</Label>
                <SelectNative
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  {(examDetail.sessions || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Maks {s.max_participants} siswa)
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Mulai Berlaku</Label>
                  <Input
                    type="datetime-local"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kedaluwarsa</Label>
                  <Input
                    type="datetime-local"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
              </div>

              <Button type="button" className="w-full" onClick={handleGenerateAutoToken}>
                GENERATE TOKEN OTOMATIS (CSPRNG)
              </Button>

              <form onSubmit={handleManualToken} className="flex gap-2 border-t pt-4">
                <Input
                  placeholder="Atau input token manual (6-16 karakter)"
                  className="font-mono uppercase"
                  minLength={6}
                  maxLength={16}
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value.toUpperCase())}
                />
                <Button type="submit" variant="outline">
                  Simpan Manual
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Status & Riwayat Token</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {(examDetail.tokens || []).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-xs"
                  >
                    <div>
                      <p className="font-mono font-bold text-slate-900">{t.token_hint}</p>
                      <p className="text-slate-500">
                        Mode: {t.generation_mode} • Dipakai: {t.use_count}x • Berlaku s/d{" "}
                        {formatDateTimeID(t.valid_until)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === "active" ? "success" : "danger"}>
                        {t.status}
                      </Badge>
                      {t.status === "active" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRevokeToken(t.id)}
                        >
                          <Ban className="h-3.5 w-3.5" /> Cabut
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* School Audit Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-slate-700" />
            Audit Log Sekolah
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 space-y-2 overflow-y-auto text-xs">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5"
              >
                <div>
                  <span className="font-semibold text-slate-900">{log.action}</span>
                  <span className="ml-2 text-slate-500">({log.entity_type})</span>
                </div>
                <span className="text-slate-400">{formatDateTimeID(log.server_timestamp)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
