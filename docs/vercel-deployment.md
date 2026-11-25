# Panduan Deployment Vercel — CBT SMART EXAM

## 1. Menghubungkan Repository GitHub ke Vercel
1. Login ke [Vercel Dashboard](https://vercel.com/new).
2. Pilih **Add New Project** → Import repository `cbt-smart-exam`.
3. Framework Preset: **Next.js** (otomatis terdeteksi).
4. Root Directory: `.` (root proyek `cbt-smart-exam`).

## 2. Konfigurasi Environment Variables di Vercel
Tambahkan variabel berikut pada **Project Settings → Environment Variables** secara terpisah untuk **Production**, **Preview** (`staging`), dan **Development**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (mis. `https://cbt.sekolah.sch.id`)
- `SUPABASE_SERVICE_ROLE_KEY` (**JANGAN** beri awalan `NEXT_PUBLIC_`)
- `TOKEN_HASH_PEPPER` (string acak 64 hex unik per environment)
- `SESSION_SIGNING_SECRET` (string acak 64 hex unik per environment)

## 3. Branch & Domain Mapping
- Branch `main` → Production (`https://...`) dengan HTTPS aktif otomatis.
- Branch `staging` → Preview Environment untuk pengujian pra-rilis dan load test.
- Pastikan URL domain produksi dan preview didaftarkan pada **Supabase Auth → URL Configuration → Redirect URLs**.

## 4. Pemeriksaan Pasca-Deployment
1. Akses `/api/health` dan pastikan `"dbConnected": true`.
2. Periksa **Build Logs** dan **Runtime Logs** di Vercel Dashboard.
3. Lakukan uji login tiap peran (`super_admin`, `school_admin`, `teacher`, `supervisor`, `student`).
