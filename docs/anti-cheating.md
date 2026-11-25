# Sistem Anti-Cheating & Evaluasi Risiko — CBT SMART EXAM

## Prinsip Kebijakan
Sistem anti-cheating dirancang sebagai **indikator pembantu pengawasan manusia**, bukan hakim otomatis:
- Satu kejadian teknis (misal notifikasi OS memicu `WINDOW_BLUR` atau kendala jaringan) **tidak pernah** langsung menggagalkan ujian siswa.
- Alamat IP yang sama (jaringan Wi-Fi/Lab sekolah bersama) **tidak pernah** dipakai sebagai bukti tunggal kecurangan.
- Kegagalan verifikasi wajah bernilai **0 poin pelanggaran** dan menyediakan jalur verifikasi manual Pengawas.

## Indikator yang Dipantau (`hooks/use-exam-proctoring.ts`)
1. **Fullscreen Monitoring:** Mendeteksi keluar layar penuh (`FULLSCREEN_EXIT`).
2. **Tab Switching & Focus:** Mendeteksi perpindahan tab dan durasi kehilangan fokus (`TAB_SWITCH`, `WINDOW_BLUR`).
3. **Copy-Paste & Context Menu:** Membatasi salin/tempel pada teks soal tanpa merusak input teks esai atau aksesibilitas.
4. **Shortcut Monitoring:** Mencatat shortcut inspeksi/cetak (`F12`, `Ctrl+Shift+I`, `Ctrl+P`).
5. **Multiple Session Detection:** Mendeteksi login akun yang sama di perangkat lain (`MULTI_SESSION_DETECTED`).
6. **Dynamic Watermark:** Menampilkan nama siswa, NIS, nama ujian, dan sesi secara halus di layar ujian.
7. **Security Event Log & Risk Engine (`lib/security/risk-engine.ts`):** Mengklasifikasikan risiko `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` berdasarkan ambang batas yang dapat dikonfigurasi Admin Sekolah.
