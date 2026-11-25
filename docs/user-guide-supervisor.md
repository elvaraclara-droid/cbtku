# Panduan Pengguna — Pengawas Ujian

1. **Login:** Masuk melalui tab **Admin / Guru / Pengawas** di `/login`.
2. **Daftar Ujian (`/supervisor`):** Pilih ujian yang ditugaskan kepada Anda untuk membuka **Pemantauan Langsung**.
3. **Memantau Peserta (`/supervisor/monitoring/[examId]`):**
   - Pantau 10 metrik ringkasan langsung (terdaftar, login, sedang ujian, selesai, terputus, peringatan, perlu diperiksa, dijeda, menunggu persetujuan, dilanjutkan).
   - Gunakan kotak pencarian atau filter status untuk menemukan peserta dengan cepat.
4. **Menangani Peserta & Persetujuan Melanjutkan:**
   - Klik **Lihat Detail** pada siswa yang berstatus `WARNING`, `NEEDS_REVIEW`, `PAUSED`, atau `PENDING_SUPERVISOR_APPROVAL`.
   - Periksa log kejadian keamanan (misal perpindahan tab dan durasinya).
   - Pilih tindakan yang sesuai (**Berikan Peringatan**, **Jeda Ujian**, **Izinkan Lanjutkan**, **Tambah Waktu**, atau **Akhiri Ujian**) dan wajib isi alasan pemeriksaan.
   - Saat **Izinkan Lanjutkan** disetujui, siswa melanjutkan tepat pada attempt yang sama tanpa kehilangan jawaban sebelumnya.
