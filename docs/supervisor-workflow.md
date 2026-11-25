# Alur Kerja Pengawas & Persetujuan Melanjutkan Ujian — CBT SMART EXAM

## Pemantauan Langsung (`/supervisor/monitoring/[examId]`)
Pengawas hanya dapat mengakses ujian yang ditugaskan (`exam_supervisors`). Dashboard menampilkan 10 metrik langsung dan 13 status peserta (`NOT_STARTED` hingga `SUBMITTED` / `TERMINATED` / `DISCONNECTED`).

## 6 Tombol Tindakan Pengawas
1. **LIHAT DETAIL:** Membuka profil peserta, sisa waktu server, progres soal, log keamanan, dan riwayat tindakan pengawas.
2. **BERIKAN PERINGATAN:** Mengirim pengumuman peringatan langsung ke layar siswa.
3. **JEDA UJIAN:** Menjeda sesi ujian peserta (`PAUSED`).
4. **IZINKAN LANJUTKAN:** Memulihkan peserta dari status `PAUSED`, `LOCKED`, `PENDING_SUPERVISOR_APPROVAL`, `NEEDS_REVIEW`, atau `WARNING` menjadi `RESUMED`.
   - Menggunakan `attempt_id` yang **sama** (tidak membuat attempt baru).
   - Jawaban yang telah tersimpan di server tetap utuh dan tidak diubah.
   - Timer tetap mengikuti waktu server dan memperhitungkan durasi jeda.
5. **TAMBAH WAKTU:** Menambahkan menit perpanjangan waktu secara terpisah (memerlukan izin `can_extend_time`).
6. **AKHIRI UJIAN:** Menghentikan ujian siswa secara permanen dengan alasan wajib (memerlukan izin `can_terminate_attempt`).

Seluruh tindakan wajib menyertakan alasan tertulis, tercatat permanen di `supervisor_actions` dan `supervisor_override_logs`, serta tidak dapat dihapus oleh pengguna biasa.
