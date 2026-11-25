# Skema Database PostgreSQL — CBT SMART EXAM

Seluruh skema dikelola melalui migrasi berurutan pada `supabase/migrations/`:
- `0001_extensions_and_enums.sql` — Ekstensi `pgcrypto`/`uuid-ossp` serta 10 tipe ENUM.
- `0002_core_school_and_users.sql` — `schools`, `school_settings`, `profiles`, `academic_years`, `semesters`, `classes`, `subjects`, `teachers`, `teacher_subjects`, `students`.
- `0003_question_bank.sql` — `question_categories`, `question_banks`, `questions`, `question_options`, `question_statements`, `question_media`.
- `0004_exams_and_attempts.sql` — `exams`, `exam_questions`, `exam_sessions`, `exam_session_students`, `exam_supervisors`, `exam_tokens`, `exam_attempts`, `student_answers`, `answer_details`.
- `0005_monitoring_face_grading_audit.sql` — `exam_activity_logs`, `exam_security_events`, `supervisor_actions`, `supervisor_override_logs`, `exam_announcements`, `user_sessions`, `face_verification_records`, `exam_results`, `manual_grading`, `grading_history`, `report_exports`, `audit_logs`, `system_settings`, `notifications`, `auth_rate_limits`, `backup_records`.
- `0006_rls_helpers_and_policies.sql` — Aktivasi RLS pada 41 tabel dan kebijakan peran.
- `0007_storage_buckets_and_policies.sql` — 7 bucket Storage & kebijakan akses berbasis folder `school_id`.
- `0008_realtime_and_rpcs.sql` — Publikasi Realtime selektif, RPC atomik `save_student_answer_atomic`, dan `cleanup_expired_face_records`.

## Field Audit & Konsistensi Penting
Setiap entitas inti menyertakan kolom `created_at`, `updated_at`, `created_by`, `updated_by`, `school_id` sebagai batas isolasi multi-sekolah, serta `server_timestamp`, `answer_version`, dan `idempotency_key` pada alur jawaban siswa.
