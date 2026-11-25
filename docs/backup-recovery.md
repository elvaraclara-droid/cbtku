# Manajemen Backup & Disaster Recovery — CBT SMART EXAM

## Target Awal Pemulihan
- **RPO (Recovery Point Objective):** 15–60 menit (sesuai fitur Point-in-Time Recovery / Daily Backup pada paket Supabase yang digunakan).
- **RTO (Recovery Time Objective):** 2–4 jam.

## Ruang Lingkup Backup
1. **Database PostgreSQL:** Seluruh skema, bank soal, jawaban siswa, nilai, akun pengguna, dan audit log.
2. **Supabase Storage:** Bucket `question-images`, `question-audio`, `question-videos`, `exam-attachments`, `student-uploads`, `school-assets`, dan `report-exports` (disinkronkan secara terpisah bila paket Supabase tidak menyertakan snapshot Storage otomatis).

## Prosedur Restore & Verifikasi
1. Lakukan backup manual/snapshot sebelum migrasi berisiko tinggi.
2. Untuk uji restore database, pulihkan backup ke project/database staging terpisah terlebih dahulu (`pg_restore` atau fitur Restore Dashboard Supabase).
3. Verifikasi integritas tabel kritis (`exam_attempts`, `student_answers`, `exam_results`, `audit_logs`).
4. Catat hasil uji restore pada menu **Super Admin → Konfigurasi Backup** (`backup_records`).
5. **Penting:** Jangan menyatakan prosedur pemulihan berhasil sebelum uji restore nyata di lingkungan staging selesai diverifikasi.
