# Pengujian Performa & Kapasitas (Target 500 Siswa) — CBT SMART EXAM

## Alat Pengujian Tersedia
Proyek menyediakan skrip load test bertahap di `scripts/load-test.mjs` yang dapat dijalankan pada lingkungan staging/lokal:

```bash
# Tahap 1: 50 siswa virtual
node scripts/load-test.mjs --users=50 --target=https://staging.domain.sch.id --mode=full-exam

# Tahap 2: 100 siswa virtual
node scripts/load-test.mjs --users=100 --target=https://staging.domain.sch.id --mode=full-exam

# Tahap 3: 250 siswa virtual
node scripts/load-test.mjs --users=250 --target=https://staging.domain.sch.id --mode=full-exam

# Tahap 4: 500 siswa virtual
node scripts/load-test.mjs --users=500 --target=https://staging.domain.sch.id --mode=full-exam
```

## Catatan Penting Kapasitas
- Aplikasi dirancang untuk efisiensi beban 500 peserta bersamaan (index database lengkap, RPC atomik `save_student_answer_atomic`, Realtime selektif tanpa broadcast `student_answers`, serta verifikasi wajah tanpa aliran video berkelanjutan).
- **Kejujuran Pengujian:** Pengujian kapasitas nyata hingga 500 pengguna serentak wajib dilakukan pada **lingkungan staging terhubung ke Supabase & Vercel** dengan kuota paket yang sesuai (misal Supabase Connection Pooling / PgBouncer aktif dan Vercel Serverless concurrency memadai). Jangan mengklaim kapasitas 500 pengguna sebelum laporan metrik staging aktual tercatat.
