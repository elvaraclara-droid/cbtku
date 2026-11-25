# Konfigurasi Environment Variables — CBT SMART EXAM

Salin `.env.example` menjadi `.env.local` untuk pengembangan lokal. **Jangan pernah mengunggah `.env.local` ke GitHub.**

| Variabel | Sifat | Kegunaan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Publik | URL endpoint project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publik | Kunci anon publik untuk browser (terbatas RLS) |
| `NEXT_PUBLIC_APP_URL` | Publik | URL dasar aplikasi |
| `NEXT_PUBLIC_APP_NAME` | Publik | Nama identitas aplikasi (`CBT SMART EXAM`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Rahasia Server** | Kunci admin backend server-only (`lib/supabase/admin.ts`) |
| `TOKEN_HASH_PEPPER` | **Rahasia Server** | Pepper HMAC-SHA256 untuk hashing token ujian |
| `SESSION_SIGNING_SECRET` | **Rahasia Server** | Rahasia penandatanganan sesi server |
| `FACE_VERIFICATION_PROVIDER` | Server | Mode verifikasi wajah (`local_quality_plus_supervisor` default) |
| `FACE_VERIFICATION_API_URL` | Server (Opsional) | Endpoint API biometrik eksternal bila tersedia |
| `FACE_VERIFICATION_API_KEY` | **Rahasia Server** (Opsional) | Kunci API biometrik eksternal |
| `LOAD_TEST_TARGET_URL` | Staging | Target URL untuk `scripts/load-test.mjs` |
