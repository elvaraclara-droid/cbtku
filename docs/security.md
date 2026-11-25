# Keamanan Sistem & Hardening — CBT SMART EXAM

## Kontrol Keamanan yang Diimplementasikan
1. **Row Level Security (RLS):** Aktif pada seluruh 41 tabel PostgreSQL (`0006_rls_helpers_and_policies.sql`) dengan isolasi `school_id` dan fungsi `SECURITY DEFINER`.
2. **Proteksi Kunci Jawaban:** Siswa dan Pengawas tidak memiliki kebijakan `SELECT` RLS untuk tabel `question_options` dan `question_statements`. Endpoint siswa memproyeksikan kolom tanpa `is_correct`, `is_true`, atau `explanation_html`.
3. **Token Kriptografis:** Token ujian dibuat via `crypto.randomBytes` (rejection sampling), dinormalisasi, di-hash dengan HMAC-SHA256 (`TOKEN_HASH_PEPPER`), dan diverifikasi dengan `crypto.timingSafeEqual`.
4. **Perlindungan XSS & Metadata Audit:** Seluruh konten HTML soal disanitasi melalui `sanitizeRichHtml` (`lib/security/html-sanitizer.ts`), dan `sanitizeAuditMetadata` menyensor field rahasia (`password`, `token`, `service_role_key`).
5. **Security Headers (`next.config.ts`):** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, dan `Permissions-Policy`.
6. **Rate Limiting & Sesi:** Perlindungan brute-force berbasis tabel `auth_rate_limits` dan pelacakan sesi aktif `user_sessions`.

## Uji Keamanan Otomatis
Jalankan `npm run test:security` untuk memverifikasi sanitasi XSS, penyensoran metadata audit, isolasi `SUPABASE_SERVICE_ROLE_KEY`, dan isolasi kolom kunci jawaban. Uji penetrasi RLS dan API lintas peran wajib diulang pada lingkungan staging Supabase setelah migrasi diterapkan.
