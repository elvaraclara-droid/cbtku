"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  StopCircle,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabasePublicConfigured } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, SelectNative, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AttemptStatusBadge, RiskLevelBadge } from "@/components/status-badge";
import { formatDateTimeID } from "@/lib/utils";
import type { SupervisorMonitoringParticipant } from "@/types/database";
import type { ExamSummary, MonitoringDetailView } from "@/types/views";

const ALL_STATUSES: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "Semua Status" },
  { value: "PENDING_SUPERVISOR_APPROVAL", label: "Menunggu Persetujuan" },
  { value: "NEEDS_REVIEW", label: "Perlu Diperiksa" },
  { value: "WARNING", label: "Peringatan" },
  { value: "PAUSED", label: "Dijeda" },
  { value: "LOCKED", label: "Dikunci" },
  { value: "NORMAL", label: "Sedang Ujian" },
  { value: "RESUMED", label: "Dilanjutkan" },
  { value: "DISCONNECTED", label: "Terputus" },
  { value: "LOGGED_IN", label: "Sudah Login" },
  { value: "NOT_STARTED", label: "Belum Mulai" },
  { value: "SUBMITTED", label: "Selesai" },
  { value: "TERMINATED", label: "Dihentikan" },
];

type ActionType =
  | "WARNING_SENT"
  | "EXAM_PAUSED"
  | "RESUME_APPROVED"
  | "TIME_EXTENDED"
  | "EXAM_TERMINATED"
  | "MANUAL_FACE_APPROVED"
  | "MANUAL_FACE_REJECTED";

export default function SupervisorMonitoringRoomPage() {
  const { examId } = useParams<{ examId: string }>();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [participants, setParticipants] = useState<SupervisorMonitoringParticipant[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Student Detail Drawer / Modal
  const [selectedParticipant, setSelectedParticipant] =
    useState<SupervisorMonitoringParticipant | null>(null);
  const [detailData, setDetailData] = useState<MonitoringDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action Prompt Modal
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    actionType: ActionType | null;
    title: string;
  }>({ open: false, actionType: null, title: "" });
  const [actionReason, setActionReason] = useState("");
  const [extraMinutes, setExtraMinutes] = useState(10);
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const fetchMonitoring = useCallback(
    async (attemptIdForDetail?: string | null) => {
      try {
        const qs = new URLSearchParams();
        if (statusFilter !== "ALL") qs.set("status", statusFilter);
        if (search.trim()) qs.set("q", search.trim());
        if (attemptIdForDetail) qs.set("attemptId", attemptIdForDetail);

        const res = await fetch(`/api/supervisor/monitoring/${examId}?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Gagal memuat data monitoring");
          return;
        }
        setExam(data.exam);
        setSummary(data.summary || {});
        setParticipants(data.participants || []);
        if (attemptIdForDetail && data.detail) {
          setDetailData(data.detail);
        }
      } finally {
        setLoading(false);
      }
    },
    [examId, search, statusFilter]
  );

  useEffect(() => {
    fetchMonitoring(selectedParticipant?.attempt_id);
  }, [fetchMonitoring, selectedParticipant?.attempt_id]);

  // Selective Supabase Realtime subscription scoped ONLY to this exam_id
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMonitoring(selectedParticipant?.attempt_id);
    }, 10_000);

    if (!isSupabasePublicConfigured()) {
      return () => clearInterval(interval);
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`exam-monitor-${examId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exam_attempts",
          filter: `exam_id=eq.${examId}`,
        },
        () => {
          fetchMonitoring(selectedParticipant?.attempt_id);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "exam_security_events",
          filter: `exam_id=eq.${examId}`,
        },
        (payload: { new?: { risk_level?: string; event_type?: string } }) => {
          if (payload.new?.risk_level === "HIGH" || payload.new?.risk_level === "CRITICAL") {
            toast.warning(`Aktivitas keamanan terdeteksi: ${payload.new.event_type}`);
          }
          fetchMonitoring(selectedParticipant?.attempt_id);
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [examId, fetchMonitoring, selectedParticipant?.attempt_id]);

  async function openDetail(participant: SupervisorMonitoringParticipant) {
    setSelectedParticipant(participant);
    if (!participant.attempt_id) {
      setDetailData(null);
      return;
    }
    setDetailLoading(true);
    await fetchMonitoring(participant.attempt_id);
    setDetailLoading(false);
  }

  function promptAction(type: ActionType, title: string) {
    setActionReason("");
    setActionModal({ open: true, actionType: type, title });
  }

  async function submitAction(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedParticipant?.attempt_id || !actionModal.actionType) return;
    setActionSubmitting(true);
    try {
      const res = await fetch("/api/supervisor/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: selectedParticipant.attempt_id,
          actionType: actionModal.actionType,
          reason: actionReason,
          extraMinutes:
            actionModal.actionType === "TIME_EXTENDED" ? Number(extraMinutes) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Tindakan gagal diproses.");
        return;
      }
      toast.success("Tindakan pengawas berhasil disimpan ke audit log.");
      setActionModal({ open: false, actionType: null, title: "" });
      await fetchMonitoring(selectedParticipant.attempt_id);
    } finally {
      setActionSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat ruang pengawasan real-time...
      </div>
    );
  }

  const statTiles = [
    { label: "Terdaftar", val: summary.totalRegistered || 0, tone: "text-slate-900" },
    { label: "Sudah Login", val: summary.loggedIn || 0, tone: "text-blue-700" },
    { label: "Sedang Ujian", val: summary.inProgress || 0, tone: "text-emerald-700" },
    { label: "Selesai", val: summary.submitted || 0, tone: "text-indigo-700" },
    { label: "Terputus", val: summary.disconnected || 0, tone: "text-slate-600" },
    { label: "Peringatan", val: summary.warned || 0, tone: "text-amber-600" },
    { label: "Perlu Diperiksa", val: summary.needsReview || 0, tone: "text-orange-600" },
    { label: "Dijeda / Kunci", val: summary.paused || 0, tone: "text-purple-700" },
    { label: "Menunggu Persetujuan", val: summary.pendingApproval || 0, tone: "text-rose-700" },
    { label: "Sudah Dilanjutkan", val: summary.resumed || 0, tone: "text-teal-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Pemantauan Langsung: {exam?.title}
          </h1>
          <p className="text-sm text-slate-500">
            {exam?.subjects?.name} • {exam?.total_questions} soal • {exam?.duration_minutes} menit
          </p>
        </div>
        <Button variant="outline" onClick={() => fetchMonitoring(selectedParticipant?.attempt_id)}>
          <RefreshCw className="h-4 w-4" />
          Muat Ulang
        </Button>
      </div>

      {/* All 10 Live Monitoring Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {statTiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500">{tile.label}</p>
              <p className={`mt-1 text-2xl font-bold ${tile.tone}`}>{tile.val}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Daftar Peserta Sesi ({participants.length})</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Cari nama, NIS, atau kelas..."
                  className="pl-9 sm:w-64"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <SelectNative
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="sm:w-56"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectNative>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
                <tr>
                  <th className="p-3">Peserta</th>
                  <th className="p-3">Sesi</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Risiko</th>
                  <th className="p-3">Progres</th>
                  <th className="p-3">Koneksi</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {participants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      Tidak ada peserta sesuai filter.
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={`${p.student_id}-${p.session_id}`} className="hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-semibold text-slate-900">{p.student_name}</p>
                        <p className="text-xs text-slate-500">
                          NIS: {p.nis} • {p.class_name}
                        </p>
                      </td>
                      <td className="p-3 text-xs text-slate-600">{p.session_name}</td>
                      <td className="p-3">
                        <AttemptStatusBadge status={p.status} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <RiskLevelBadge level={p.risk_level} />
                          <span className="text-xs text-slate-500">({p.violation_count})</span>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-700">
                        {p.answered_count}/{p.total_questions} terjawab
                      </td>
                      <td className="p-3">
                        <Badge variant={p.connection_status === "online" ? "success" : "default"}>
                          {p.connection_status}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => openDetail(p)}>
                          <Eye className="h-3.5 w-3.5" />
                          Lihat Detail
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail & 6 Supervisor Actions Modal */}
      <Dialog
        open={Boolean(selectedParticipant)}
        onOpenChange={(open) => !open && setSelectedParticipant(null)}
      >
        <DialogContent className="max-w-3xl">
          {selectedParticipant && (
            <>
              <DialogHeader>
                <DialogTitle>Detail Peserta & Tindakan Pengawas</DialogTitle>
                <DialogDescription>
                  {selectedParticipant.student_name} (NIS: {selectedParticipant.nis}) •{" "}
                  {selectedParticipant.session_name}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-4">
                  <div>
                    <p className="text-slate-500">Status Saat Ini</p>
                    <div className="mt-1">
                      <AttemptStatusBadge status={selectedParticipant.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500">Tingkat Risiko</p>
                    <div className="mt-1">
                      <RiskLevelBadge level={selectedParticipant.risk_level} />
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500">Mulai Ujian</p>
                    <p className="mt-1 font-semibold">
                      {formatDateTimeID(selectedParticipant.started_at)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Simpan Terakhir</p>
                    <p className="mt-1 font-semibold">
                      {formatDateTimeID(selectedParticipant.last_saved_at)}
                    </p>
                  </div>
                </div>

                {/* 6 Mandatory Supervisor Action Buttons */}
                {selectedParticipant.attempt_id ? (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 p-3">
                    <Button
                      size="sm"
                      variant="warning"
                      onClick={() => promptAction("WARNING_SENT", "Berikan Peringatan ke Siswa")}
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Berikan Peringatan
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => promptAction("EXAM_PAUSED", "Jeda Ujian Siswa")}
                    >
                      <PauseCircle className="h-3.5 w-3.5" />
                      Jeda Ujian
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() =>
                        promptAction(
                          "RESUME_APPROVED",
                          "Izinkan Melanjutkan Ujian (Attempt Sama)"
                        )
                      }
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      Izinkan Lanjutkan
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => promptAction("TIME_EXTENDED", "Tambah Waktu Ujian Siswa")}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Tambah Waktu
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => promptAction("EXAM_TERMINATED", "Akhiri Ujian Siswa")}
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      Akhiri Ujian
                    </Button>

                    {selectedParticipant.face_verification_status === "manual_pending" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() =>
                          promptAction(
                            "MANUAL_FACE_APPROVED",
                            "Setujui Verifikasi Identitas Manual"
                          )
                        }
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Setujui Foto Manual
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Peserta belum memulai attempt ujian.
                  </p>
                )}

                {detailLoading ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    Memuat riwayat aktivitas keamanan...
                  </div>
                ) : detailData ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                        Riwayat Aktivitas Keamanan ({detailData.securityEvents?.length || 0})
                      </h4>
                      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5 text-xs">
                        {(detailData.securityEvents || []).length === 0 ? (
                          <p className="text-slate-400">Tidak ada kejadian keamanan.</p>
                        ) : (
                          detailData.securityEvents.map((ev) => (
                            <div key={ev.id} className="rounded-md bg-slate-50 p-2">
                              <div className="flex items-center justify-between font-semibold">
                                <span>{ev.event_type}</span>
                                <RiskLevelBadge level={ev.risk_level} />
                              </div>
                              <p className="mt-0.5 text-slate-500">
                                {formatDateTimeID(ev.server_timestamp)}
                                {ev.duration_seconds > 0 ? ` • Durasi ${ev.duration_seconds}s` : ""}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        Riwayat Tindakan Pengawas ({detailData.supervisorActions?.length || 0})
                      </h4>
                      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2.5 text-xs">
                        {(detailData.supervisorActions || []).length === 0 ? (
                          <p className="text-slate-400">Belum ada tindakan pengawas.</p>
                        ) : (
                          detailData.supervisorActions.map((act) => (
                            <div key={act.id} className="rounded-md bg-slate-50 p-2">
                              <div className="flex items-center justify-between font-semibold">
                                <span>{act.action_type}</span>
                                <span className="text-[11px] text-slate-500">
                                  {act.status_before} → {act.status_after}
                                </span>
                              </div>
                              <p className="mt-0.5 text-slate-700">Alasan: {act.reason}</p>
                              <p className="text-[11px] text-slate-400">
                                Oleh: {act.profiles?.full_name || "Pengawas"} •{" "}
                                {formatDateTimeID(act.server_timestamp)}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Action Confirmation Modal with Mandatory Reason */}
      <Dialog
        open={actionModal.open}
        onOpenChange={(open) => !open && setActionModal({ open: false, actionType: null, title: "" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionModal.title}</DialogTitle>
            <DialogDescription>
              Setiap tindakan pengawas tercatat permanen dalam audit log bersama identitas
              dan alasan Anda.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAction} className="space-y-4">
            {actionModal.actionType === "TIME_EXTENDED" && (
              <div className="space-y-1.5">
                <Label>Tambahan Waktu (Menit)</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  required
                  value={extraMinutes}
                  onChange={(e) => setExtraMinutes(Number(e.target.value))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Alasan Tindakan (Wajib)</Label>
              <Textarea
                required
                minLength={3}
                placeholder="Contoh: Siswa mengalami kendala jaringan saat ujian dan telah diverifikasi di ruangan."
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActionModal({ open: false, actionType: null, title: "" })}
              >
                Batal
              </Button>
              <Button type="submit" disabled={actionSubmitting}>
                {actionSubmitting ? "Memproses..." : "Simpan & Eksekusi"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
