"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, KeyRound, Loader2, Plus, Search, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, SelectNative } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type {
  ClassRef,
  StudentListRow,
  SubjectRef,
  SupervisorListRow,
  TeacherListRow,
} from "@/types/views";

export default function SchoolUsersManagementPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentListRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherListRow[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorListRow[]>([]);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [subjects, setSubjects] = useState<SubjectRef[]>([]);

  // Create user form
  const [role, setRole] = useState<"student" | "teacher" | "supervisor">("student");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [nis, setNis] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [tempPasswordAlert, setTempPasswordAlert] = useState<string | null>(null);

  // Import state
  const [importing, setImporting] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const [uRes, aRes] = await Promise.all([
        fetch(`/api/admin/users${qs}`),
        fetch("/api/admin/academic"),
      ]);
      const [uData, aData] = await Promise.all([uRes.json(), aRes.json()]);
      setStudents(uData.students || []);
      setTeachers(uData.teachers || []);
      setSupervisors(uData.supervisors || []);
      setClasses(aData.classes || []);
      setSubjects(aData.subjects || []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        username,
        full_name: fullName,
        nis: role === "student" ? nis : undefined,
        class_id: role === "student" && classId ? classId : null,
        subject_ids: role === "teacher" && subjectId ? [subjectId] : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal membuat akun");
      return;
    }
    setTempPasswordAlert(
      `Akun "${data.username}" berhasil dibuat. Password sementara (salin sekarang, tidak ditampilkan ulang): ${data.temporaryPassword}`
    );
    toast.success("Pengguna berhasil ditambahkan.");
    setUsername("");
    setFullName("");
    setNis("");
    loadUsers();
  }

  async function handleToggleActive(profileId: string, currentActive: boolean) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_active",
        profileId,
        isActive: !currentActive,
      }),
    });
    if (res.ok) {
      toast.success("Status akun diperbarui.");
      loadUsers();
    }
  }

  async function handleResetPassword(profileId: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reset_password",
        profileId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Gagal reset password");
      return;
    }
    setTempPasswordAlert(
      `Reset password untuk "${data.username}" berhasil. Password sementara baru (tampil sekali): ${data.temporaryPassword}`
    );
    toast.success("Password sementara baru telah dibuat.");
  }

  async function handleStudentImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/students/import", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Import gagal");
        return;
      }
      toast.success(
        `Import selesai: ${data.createdCount} dibuat, ${data.skippedCount} dilewati.`
      );
      loadUsers();
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat data pengguna sekolah...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kelola Siswa, Guru & Pengawas</h1>
          <p className="text-sm text-slate-500">
            Import CSV/Excel, aktivasi akun, reset password aman, dan penugasan guru mata pelajaran.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/admin/students/export?format=csv">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </a>
          <a href="/api/admin/students/export?format=xlsx">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Export Excel
            </Button>
          </a>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-xs font-medium text-white hover:bg-blue-800">
            <Upload className="h-4 w-4" />
            {importing ? "Mengimpor..." : "Import Siswa (.csv / .xlsx)"}
            <input
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={handleStudentImport}
              disabled={importing}
            />
          </label>
        </div>
      </div>

      {tempPasswordAlert && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          {tempPasswordAlert}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tambah Akun Pengguna</CardTitle>
          <CardDescription>
            Sistem menghasilkan password sementara secara acak (CSPRNG) dan mewajibkan ganti
            password pada login awal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Role</Label>
              <SelectNative
                value={role}
                onChange={(e) => setRole(e.target.value as "student" | "teacher" | "supervisor")}
              >
                <option value="student">Siswa</option>
                <option value="teacher">Guru</option>
                <option value="supervisor">Pengawas</option>
              </SelectNative>
            </div>
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                required
                placeholder="nis atau username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Nama Lengkap</Label>
              <Input
                required
                placeholder="Nama Lengkap"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            {role === "student" && (
              <>
                <div className="space-y-1">
                  <Label>NIS</Label>
                  <Input
                    required
                    placeholder="202601001"
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kelas</Label>
                  <SelectNative value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">-- Pilih Kelas --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </>
            )}

            {role === "teacher" && (
              <div className="space-y-1">
                <Label>Mata Pelajaran Utama</Label>
                <SelectNative value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  <option value="">-- Pilih Mapel --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectNative>
              </div>
            )}

            <div className="flex items-end">
              <Button type="submit" className="w-full">
                <Plus className="h-4 w-4" /> Buat Pengguna
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Cari nama, username, atau NIS..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Students Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Siswa ({students.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b bg-slate-50 text-xs text-slate-600 uppercase">
                <tr>
                  <th className="p-3">NIS</th>
                  <th className="p-3">Nama & Username</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 font-mono">{s.nis}</td>
                    <td className="p-3">
                      <p className="font-semibold">{s.profiles?.full_name}</p>
                      <p className="text-xs text-slate-500">@{s.profiles?.username}</p>
                    </td>
                    <td className="p-3">{s.classes?.name || "-"}</td>
                    <td className="p-3">
                      <Badge variant={s.profiles?.is_active ? "success" : "default"}>
                        {s.profiles?.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </td>
                    <td className="space-x-2 p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResetPassword(s.profiles.id)}
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Reset Password
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleToggleActive(s.profiles.id, s.profiles.is_active)
                        }
                      >
                        {s.profiles?.is_active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Teachers & Supervisors */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Guru ({teachers.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {teachers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5"
              >
                <div>
                  <p className="font-semibold">{t.profiles?.full_name}</p>
                  <p className="text-slate-500">@{t.profiles?.username}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResetPassword(t.profiles.id)}
                >
                  Reset Password
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pengawas Ujian ({supervisors.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {supervisors.map((sup) => (
              <div
                key={sup.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5"
              >
                <div>
                  <p className="font-semibold">{sup.full_name}</p>
                  <p className="text-slate-500">@{sup.username}</p>
                </div>
                <Badge variant={sup.is_active ? "success" : "default"}>
                  {sup.is_active ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
