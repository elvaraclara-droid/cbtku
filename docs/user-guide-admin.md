# Panduan Pengguna — Admin Sekolah

1. **Login:** Masuk melalui tab **Admin / Guru / Pengawas** di halaman `/login`.
2. **Pengaturan Data Sekolah (`/admin/school`):** Lengkapi profil sekolah, aktifkan Tahun Pelajaran & Semester berjalan, buat daftar Kelas dan Mata Pelajaran, serta atur ambang batas anti-cheating default dan status default verifikasi wajah (`OFF`).
3. **Manajemen Pengguna (`/admin/users`):**
   - Tambah akun Siswa, Guru, dan Pengawas satu per satu atau melalui **Import Siswa (.csv / .xlsx)** (kolom minimal: `username, full_name, nis, nisn, class_code, gender`).
   - Gunakan **Reset Password** apabila siswa lupa kata sandi; berikan password sementara yang tampil satu kali kepada siswa.
4. **Manajemen Ujian & Token (`/admin/exams`):**
   - Pilih ujian, aktifkan/jeda/tutup/batalkan ujian sesuai jadwal.
   - Pilih sesi dan klik **GENERATE TOKEN OTOMATIS** (atau input token manual). Salin/cetak token segera karena plaintext tidak pernah disimpan atau ditampilkan kembali.
   - Pantau audit log operasional sekolah secara berkala.
