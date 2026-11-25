# Kebijakan Privasi, Retensi & Perlindungan Data Siswa — CBT SMART EXAM

## Prinsip Perlindungan Data (Selaras UU PDP Indonesia)
1. **Minimalisasi Data:** Sistem hanya mengumpulkan data identitas akademik yang diperlukan untuk penyelenggaraan ujian (nama, NIS/NISN, kelas, log pengerjaan).
2. **Enkripsi & Kontrol Akses:** Komunikasi dienkripsi melalui HTTPS/TLS, akses database dikontrol dengan PostgreSQL RLS berdasarkan `school_id` dan peran, serta file Storage soal dan peserta bersifat privat (Signed URL sementara).
3. **Data Biometrik / Verifikasi Wajah (Opsional, Default OFF):**
   - Tidak ada pengambilan kamera atau data wajah apabila fitur bernilai `OFF`.
   - Saat diaktifkan (`ON`), siswa menerima pemberitahuan tujuan pemrosesan dan wajib memberi persetujuan sebelum pengambilan 1 foto tunggal.
   - Tidak ada perekaman aliran video berkelanjutan.
   - Foto disimpan di bucket privat `student-uploads` dengan batas retensi (`school_settings.face_data_retention_days`, default 30 hari) dan dibersihkan oleh fungsi `cleanup_expired_face_records()`.
   - Jalur verifikasi manual oleh Pengawas selalu tersedia agar kendala perangkat tidak merugikan siswa.
4. **Prosedur Penanganan Insiden & Penghapusan Data:**
   - Admin Sekolah / Super Admin dapat menonaktifkan akun, mencabut sesi aktif, mengaudit akses lewat `audit_logs`, dan menghapus/menganonimkan data peserta yang telah melewati masa retensi resmi sekolah.
