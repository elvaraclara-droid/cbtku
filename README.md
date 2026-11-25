# CBT SMART EXAM

**SMART EXAMINATION, SECURE ASSESSMENT.**

Platform Computer Based Testing (CBT) profesional berbasis Next.js, React, TypeScript, Tailwind CSS, dan Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) dengan sistem pengawasan langsung dan anti-cheating.

## Fitur Utama
- **5 Peran Terisolasi (RBAC + RLS):** Super Admin, Admin Sekolah, Guru, Pengawas, dan Siswa.
- **Login Siswa 3 Komponen:** Validasi server atas `username` + `password` (Supabase Auth) + `token` (HMAC-SHA256 hash terikat ujian, sesi, peserta, dan jadwal).
- **Manajemen Token:** Pembuatan token otomatis (CSPRNG) & manual, tampilan plaintext satu kali, pencabutan, dan audit log bebas plaintext.
- **Bank Soal Lengkap:** Pilihan Ganda Tunggal, MCMA (*exact match* & *partial credit*), Benar/Salah multi-pernyataan, Uraian, rumus matematika KaTeX, media privat Storage, duplikasi, dan import/export JSON.
- **Ujian Fleksibel:** Multi-sesi, ujian susulan, ujian ulang dengan riwayat attempt terjaga, dan verifikasi wajah opsional (default `OFF`).
- **Autosave & Pemulihan Offline:** Idempoten + versi jawaban + antrean lokal IndexedDB + sinkronisasi otomatis saat reconnect + timer server-authoritative.
- **Anti-Cheating & Persetujuan Pengawas:** Deteksi keluar fullscreen, pindah tab, pembatasan copy-paste aman, shortcut, sesi ganda, watermark dinamis, dan dashboard pengawas real-time lengkap dengan tombol **Izinkan Lanjutkan** tanpa kehilangan jawaban.
- **Penilaian & Laporan:** Auto-grading, penilaian manual esai dengan riwayat perubahan skor, analisis butir soal, publikasi hasil, dan export CSV / Excel / PDF.

## Menjalankan Secara Lokal
```bash
npm install
cp .env.example .env.local
# Lengkapi variabel Supabase pada .env.local lalu jalankan migrasi supabase/migrations/*.sql
npm run dev
```

## Pengujian & Verifikasi
```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Dokumentasi lengkap tersedia pada direktori [`docs/`](./docs).
