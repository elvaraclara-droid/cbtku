# Panduan Pemecahan Masalah (Troubleshooting) — CBT SMART EXAM

1. **Pesan "Supabase belum dikonfigurasi" saat membuka `/login`:**
   - Pastikan `.env.local` (lokal) atau Environment Variables di Vercel berisi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`.
   - Periksa status melalui endpoint `/api/health`.
2. **Siswa gagal login dengan error "Token ujian tidak valid atau sudah dicabut":**
   - Pastikan token sesuai dengan **ujian dan sesi** tempat siswa terdaftar di `exam_session_students`.
   - Periksa masa aktif token (`valid_from` s/d `valid_until`) serta status ujian/sesi (`scheduled` atau `active`).
3. **Siswa terputus koneksi internet saat ujian:**
   - Jawaban baru disimpan otomatis ke antrean lokal **IndexedDB**. Jangan menutup/membersihkan cache browser; saat koneksi pulih, aplikasi otomatis menyinkronkan ke server pada `attempt_id` yang sama.
4. **Layar siswa terkunci dengan status `PENDING_SUPERVISOR_APPROVAL` atau `PAUSED`:**
   - Minta Pengawas membuka detail siswa di Dashboard Monitoring Pengawas, memeriksa riwayat aktivitas keamanan, lalu menekan tombol **Izinkan Lanjutkan** beserta alasan pemeriksaan.
5. **Kamera verifikasi wajah tidak muncul:**
   - Periksa apakah ujian mengaktifkan opsi verifikasi wajah (default sistem adalah `OFF`). Jika `ON` namun perangkat siswa bermasalah, gunakan tombol **Ajukan Verifikasi Manual Pengawas**.
