# Alur Kerja Ujian (Exam Workflow) — CBT SMART EXAM

1. **Persiapan Data Sekolah:** Admin mengelola tahun pelajaran, semester, kelas, mata pelajaran, siswa, guru, dan pengawas.
2. **Penyusunan Bank Soal:** Guru membuat soal (`single_choice`, `mcma`, `true_false`, `essay`) lengkap dengan bobot, tingkat kesulitan, rumus KaTeX, dan media privat.
3. **Pembuatan Ujian & Sesi:** Guru/Admin menentukan jadwal, durasi, jumlah sesi (single atau multi-sesi), kebijakan anti-cheating, opsi verifikasi wajah (default `OFF`), peserta, dan pengawas.
4. **Penerbitan Token:** Admin membuat token otomatis CSPRNG atau manual (disimpan ter-hash).
5. **Login & Check-in Siswa:** Siswa masuk dengan Username + Password + Token. Jika verifikasi wajah `ON`, siswa melakukan foto tunggal dengan persetujuan privasi; jika `OFF`, kamera tidak pernah diminta.
6. **Pengerjaan & Autosave:** Setiap perubahan jawaban dikirim dengan `idempotency_key` dan `answer_version` melalui RPC atomik, serta antrean IndexedDB saat offline.
7. **Pengiriman & Penilaian:** Siswa mengonfirmasi pengiriman ujian (`SUBMITTED`), jawaban dikunci, penilaian otomatis dijalankan di server, dan soal esai masuk antrean penilaian manual Guru.
8. **Publikasi & Laporan:** Guru/Admin meninjau hasil, mempublikasikan nilai ke siswa, melihat analisis butir soal, dan mengekspor laporan CSV/Excel/PDF.
