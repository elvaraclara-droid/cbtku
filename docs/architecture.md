# Arsitektur Sistem — CBT SMART EXAM

**Tagline:** *SMART EXAMINATION, SECURE ASSESSMENT.*

## Diagram Alur Sistem

```text
GITHUB (Repository: cbt-smart-exam | Branch: main, staging, development)
  │  (GitHub Actions CI: lint, typecheck, test, build)
  ▼
VERCEL (Next.js App Router Hosting & Environment Variables)
  │
  ▼
NEXT.JS APPLICATION (React 19 + TypeScript + Tailwind CSS + Radix/shadcn UI)
  ├── Portal Peran: /super-admin, /admin, /teacher, /supervisor, /student
  ├── Layar Ujian Fokus: /exam/[attemptId] (Anti-Cheating + IndexedDB Offline Queue)
  └── Route Handlers (/api/*) & Session Middleware (@supabase/ssr)
        │  (Validasi autentikasi, RBAC, Zod, rate limit, kepemilikan data)
        ▼
SUPABASE
  ├── PostgreSQL Database (41 tabel, UUID PK, FKs, Indexes, Triggers, RLS)
  ├── Authentication (Email/Password + pemetaan username server-side)
  ├── Storage (7 bucket privat/terkontrol + Signed URLs)
  ├── Realtime (Monitoring Pengawas terfilter per exam_id)
  └── Edge Functions (supabase/functions/*)
```

## Prinsip Keamanan & Skalabilitas
1. **Service Role Isolation:** `SUPABASE_SERVICE_ROLE_KEY` hanya digunakan oleh modul server-only (`lib/supabase/admin.ts`) dan Edge Functions, tidak pernah masuk ke bundle browser.
2. **Isolasi Kunci Jawaban:** Siswa tidak memiliki kebijakan `SELECT` RLS pada `question_options` dan `question_statements`. Pengambilan soal saat ujian dilakukan lewat server (`getSanitizedExamPayload`) yang memproyeksikan kolom tanpa `is_correct`, `is_true`, atau `explanation_html`.
3. **Server-Authoritative Timer & Grading:** Batas waktu ujian dan penilaian otomatis/manual dihitung di server.
4. **Selective Realtime:** Publikasi Supabase Realtime diaktifkan hanya untuk `exam_attempts`, `exam_security_events`, `supervisor_actions`, `exam_announcements`, dan `notifications` agar beban koneksi tetap efisien hingga skala 500 peserta bersamaan.
