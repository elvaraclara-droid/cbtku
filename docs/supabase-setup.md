# Panduan Setup Supabase — CBT SMART EXAM

## 1. Membuat Project Supabase
1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard).
2. Buat project baru (misal `cbt-smart-exam-staging` dan `cbt-smart-exam-prod`) pada region terdekat (Singapore `ap-southeast-1`).
3. Catat **Project URL**, **Anon Key**, dan **Service Role Key** (rahasia server-only).

## 2. Menjalankan Migrasi Database
Anda dapat menjalankan migrasi menggunakan Supabase CLI atau SQL Editor secara berurutan (`0001` hingga `0008`):

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

## 3. Verifikasi Bucket Storage & RLS
Pastikan seluruh 7 bucket terbentuk di menu **Storage**:
- `question-images` (Private)
- `question-audio` (Private)
- `question-videos` (Private)
- `exam-attachments` (Private)
- `student-uploads` (Private — foto verifikasi opsional)
- `school-assets` (Public terbatas)
- `report-exports` (Private)

## 4. Deploy Edge Functions (Opsional Tambahan)
```bash
npx supabase functions deploy validate-exam-token
npx supabase functions deploy save-student-answer
npx supabase functions deploy approve-student-resume
```
Set secrets Edge Functions:
```bash
npx supabase secrets set TOKEN_HASH_PEPPER=<64_HEX_SECRET>
```

## 5. Membuat Super Admin Pertama
Jalankan skrip bootstrap atau buat user via Supabase Auth Dashboard lalu insert baris `profiles` dengan `role = 'super_admin'` dan `is_active = true`.
