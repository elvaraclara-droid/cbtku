# Panduan Integrasi GitHub — CBT SMART EXAM

## Struktur Branch
- `main`: Branch produksi (terhubung ke Vercel Production Deployment).
- `staging`: Branch pra-produksi untuk uji integrasi & load test 50–500 siswa.
- `development`: Branch pengembangan aktif.

## Langkah Menghubungkan ke GitHub
1. Buat repository baru bernama `cbt-smart-exam` pada akun/organisasi GitHub Anda (set ke **Private** direkomendasikan untuk sekolah).
2. Pastikan `.env` dan `.env.local` tidak ikut ter-commit (`.gitignore` sudah memblokir seluruh file `.env*.local`).
3. Tambahkan remote dan push branch:

```bash
git remote add origin https://github.com/<ORG_OR_USER>/cbt-smart-exam.git
git push -u origin main
git push -u origin staging
git push -u origin development
```

## GitHub Actions CI
Workflow `.github/workflows/ci.yml` otomatis berjalan pada setiap `push` dan `pull_request` ke `main`, `staging`, dan `development` untuk menjalankan:
1. `npm run lint`
2. `npm run typecheck`
3. `npm test` (Unit & Security Tests)
4. `npm run build`
