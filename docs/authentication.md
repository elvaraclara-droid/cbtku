# Sistem Autentikasi & Keamanan Akun — CBT SMART EXAM

## 1. Pemetaan Username ke Supabase Auth
Karena Supabase Auth menggunakan identitas email/password secara bawaan, tabel `profiles` menyimpan `username` unik serta `auth_email` internal yang hanya diakses oleh server melalui Service Role Client. Browser tidak pernah menerima `auth_email` maupun hash password.

## 2. Login Siswa Wajib 3 Komponen (`POST /api/auth/student-login`)
Sebelum siswa masuk ruang ujian, backend memvalidasi 10 syarat secara berurutan:
1. Username (NIS/NISN/username) valid.
2. Password valid via `supabase.auth.signInWithPassword`.
3. Akun aktif (`profiles.is_active` dan `students.status`).
4. Format token ujian valid dan hash HMAC-SHA256 cocok di `exam_tokens`.
5. Token berstatus `active`, tidak dicabut, dan berada dalam jendela waktu `valid_from`–`valid_until`.
6. Token cocok dengan `exam_id` dan `session_id`.
7. Siswa terdaftar pada `exam_session_students` untuk sesi tersebut.
8. Jadwal ujian dan sesi aktif mengizinkan akses.
9. Tidak ada pembatasan akun.
10. Tidak ada konflik batas percobaan (`max_attempts`) atau sesi ganda yang melanggar kebijakan ujian.

## 3. Rate Limiting & Manajemen Sesi
- Kegagalan login dan percobaan token dicatat pada tabel `auth_rate_limits` dengan penundaan bertahap dan penguncian sementara (bukan blokir permanen).
- Penggantian password memverifikasi password lama terlebih dahulu dan dapat mencabut sesi perangkat lain (`user_sessions`).
- Reset password oleh Admin menghasilkan password sementara acak CSPRNG, ditandai `must_change_password = true`, dan hanya ditampilkan satu kali.
