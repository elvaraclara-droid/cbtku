"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Building2, Users, BookOpen, Activity, Loader2, Plus, Database, Shield } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, SelectNative } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeID } from "@/lib/utils";
import type {
  AuditLogView,
  BackupRecordView,
  SchoolAdminSummaryRow,
  SchoolSummaryRow,
} from "@/types/views";

export default function SuperAdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolSummaryRow[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [schoolAdmins, setSchoolAdmins] = useState<SchoolAdminSummaryRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogView[]>([]);
  const [backupRecords, setBackupRecords] = useState<BackupRecordView[]>([]);

  // New School form
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [eduLevel, setEduLevel] = useState("SMA");
  const [city, setCity] = useState("");

  // New School Admin form
  const [adminSchoolId, setAdminSchoolId] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [createdPasswordBanner, setCreatedPasswordBanner] = useState<string | null>(null);

  // Backup log form
  const [backupScope, setBackupScope] = useState("database");
  const [backupNotes, setBackupNotes] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [schoolsRes, adminsRes, settingsRes] = await Promise.all([
        fetch("/api/super-admin/schools"),
        fetch("/api/super-admin/school-admins"),
        fetch("/api/super-admin/settings"),
      ]);
      const [sData, aData, gData] = await Promise.all([
        schoolsRes.json(),
        adminsRes.json(),
        settingsRes.json(),
      ]);
      setSchools(sData.schools || []);
      setStats(sData.stats || {});
      setSchoolAdmins(aData.schoolAdmins || []);
      setAuditLogs(gData.auditLogs || []);
      setBackupRecords(gData.backupRecords || []);
      if (!adminSchoolId && sData.schools?.length) {
        setAdminSchoolId(sData.schools[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [adminSchoolId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleCreateSchool(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/super-admin/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: schoolCode,
        name: schoolName,
        education_level: eduLevel,
        city,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal menambah sekolah");
      return;
    }
    toast.success(`Sekolah ${data.school.name} berhasil ditambahkan.`);
    setSchoolCode("");
    setSchoolName("");
    setCity("");
    loadAll();
  }

  async function handleCreateSchoolAdmin(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/super-admin/school-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        school_id: adminSchoolId,
        username: adminUsername,
        full_name: adminFullName,
        display_email: adminEmail,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal membuat Admin Sekolah");
      return;
    }
    setCreatedPasswordBanner(
      `Admin "${adminUsername}" dibuat. Password sementara (tampil sekali): ${data.temporaryPassword}`
    );
    toast.success("Admin Sekolah berhasil dibuat.");
    setAdminUsername("");
    setAdminFullName("");
    setAdminEmail("");
    loadAll();
  }

  async function handleLogBackup(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/super-admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "backup_record",
        backup_scope: backupScope,
        status: "verified",
        notes: backupNotes || "Verifikasi backup dan disaster recovery tercatat",
      }),
    });
    if (res.ok) {
      toast.success("Catatan verifikasi backup tersimpan.");
      setBackupNotes("");
      loadAll();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat dashboard global Super Admin...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Super Admin Control Center</h1>
        <p className="text-sm text-slate-500">
          Kelola sekolah, Admin Sekolah, kebijakan keamanan global, kapasitas sistem, backup,
          dan audit log lintas sekolah.
        </p>
      </div>

      {/* Global Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Building2 className="h-8 w-8 text-blue-700" />
            <div>
              <p className="text-xs text-slate-500">Total Sekolah</p>
              <p className="text-2xl font-bold">{stats.totalSchools || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Users className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-xs text-slate-500">Total Pengguna / Siswa</p>
              <p className="text-2xl font-bold">
                {stats.totalUsers || 0} / {stats.totalStudents || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <BookOpen className="h-8 w-8 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Total Ujian</p>
              <p className="text-2xl font-bold">{stats.totalExams || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <Activity className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-xs text-slate-500">Peserta Aktif Saat Ini</p>
              <p className="text-2xl font-bold">{stats.activeAttempts || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {createdPasswordBanner && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {createdPasswordBanner}
        </div>
      )}

      {/* Schools & School Admins */}
      <div id="schools" className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tambah Sekolah Baru</CardTitle>
            <CardDescription>Setiap sekolah diisolasi melalui school_id dan RLS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleCreateSchool} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Kode Sekolah</Label>
                <Input
                  required
                  placeholder="SMAN1JKT"
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1">
                <Label>Jenjang</Label>
                <SelectNative value={eduLevel} onChange={(e) => setEduLevel(e.target.value)}>
                  <option value="SD">SD</option>
                  <option value="SMP">SMP</option>
                  <option value="SMA">SMA</option>
                  <option value="SMK">SMK</option>
                  <option value="MA">MA</option>
                </SelectNative>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Nama Sekolah</Label>
                <Input
                  required
                  placeholder="SMA Negeri 1 Jakarta"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Kota / Kabupaten</Label>
                <Input
                  placeholder="Jakarta Pusat"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <Button type="submit" className="sm:col-span-2">
                <Plus className="h-4 w-4" /> Simpan Sekolah
              </Button>
            </form>

            <div className="max-h-56 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
              {schools.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {s.name} ({s.code})
                    </p>
                    <p className="text-slate-500">
                      {s.education_level} • {s.city || "-"}
                    </p>
                  </div>
                  <Badge variant={s.status === "active" ? "success" : "danger"}>
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kelola Admin Sekolah</CardTitle>
            <CardDescription>
              Buat akun Admin Sekolah dengan password sementara aman.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleCreateSchoolAdmin} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Sekolah</Label>
                <SelectNative
                  value={adminSchoolId}
                  onChange={(e) => setAdminSchoolId(e.target.value)}
                  required
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="space-y-1">
                <Label>Username Admin</Label>
                <Input
                  required
                  placeholder="admin.sman1"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Nama Lengkap</Label>
                <Input
                  required
                  placeholder="Budi Santoso, S.Kom"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Email Kontak</Label>
                <Input
                  type="email"
                  placeholder="admin@sekolah.sch.id"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="sm:col-span-2">
                <Plus className="h-4 w-4" /> Buat Akun Admin Sekolah
              </Button>
            </form>

            <div className="max-h-56 space-y-2 overflow-y-auto border-t border-slate-100 pt-3">
              {schoolAdmins.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {a.full_name} (@{a.username})
                    </p>
                    <p className="text-slate-500">{a.schools?.name || "-"}</p>
                  </div>
                  <Badge variant={a.is_active ? "success" : "default"}>
                    {a.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backup & Global Audit Logs */}
      <div id="security" className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-800" />
              Konfigurasi Backup & Disaster Recovery
            </CardTitle>
            <CardDescription>
              Target awal RPO 15–60 menit, RTO 2–4 jam. Catat verifikasi uji restore nyata.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleLogBackup} className="flex flex-col gap-2 sm:flex-row">
              <SelectNative
                value={backupScope}
                onChange={(e) => setBackupScope(e.target.value)}
                className="sm:w-44"
              >
                <option value="database">Database</option>
                <option value="storage">Storage</option>
                <option value="full_dr_drill">Uji Restore DR</option>
              </SelectNative>
              <Input
                placeholder="Catatan hasil verifikasi backup/restore..."
                value={backupNotes}
                onChange={(e) => setBackupNotes(e.target.value)}
              />
              <Button type="submit">Catat</Button>
            </form>

            <div className="max-h-56 space-y-2 overflow-y-auto">
              {backupRecords.map((b) => (
                <div key={b.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold uppercase">{b.backup_scope}</span>
                    <Badge variant="success">{b.status}</Badge>
                  </div>
                  <p className="mt-1 text-slate-600">{b.notes}</p>
                  <p className="text-[11px] text-slate-400">{formatDateTimeID(b.executed_at)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-700" />
              Audit Log Global Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{log.action}</span>
                    <Badge variant="default">{log.actor_role || "system"}</Badge>
                  </div>
                  <p className="text-slate-500">
                    Entitas: {log.entity_type} • {formatDateTimeID(log.server_timestamp)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
