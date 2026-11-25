-- ============================================================================
-- Migration 0007: Supabase Storage Buckets & Access Policies
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('question-images', 'question-images', FALSE, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('question-audio', 'question-audio', FALSE, 20971520, ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm']),
  ('question-videos', 'question-videos', FALSE, 52428800, ARRAY['video/mp4', 'video/webm']),
  ('exam-attachments', 'exam-attachments', FALSE, 10485760, ARRAY['application/pdf', 'image/png', 'image/jpeg']),
  ('student-uploads', 'student-uploads', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('school-assets', 'school-assets', TRUE, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('report-exports', 'report-exports', FALSE, 20971520, ARRAY['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Staff (school_admin & teacher) can manage question media within their school folder: <school_id>/...
CREATE POLICY storage_question_media_staff ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id IN ('question-images', 'question-audio', 'question-videos', 'exam-attachments')
  AND (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('school_admin', 'teacher')
      AND (storage.foldername(name))[1] = public.current_school_id()::text
    )
  )
)
WITH CHECK (
  bucket_id IN ('question-images', 'question-audio', 'question-videos', 'exam-attachments')
  AND (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('school_admin', 'teacher')
      AND (storage.foldername(name))[1] = public.current_school_id()::text
    )
  )
);

-- Student uploads (optional face verification snapshots): private! Never public.
-- Path convention: <school_id>/<student_id>/...
CREATE POLICY storage_student_uploads_policy ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'student-uploads'
  AND (
    public.is_super_admin()
    OR (
      public.current_user_role() IN ('school_admin', 'supervisor')
      AND (storage.foldername(name))[1] = public.current_school_id()::text
    )
    OR (
      public.current_user_role() = 'student'
      AND (storage.foldername(name))[1] = public.current_school_id()::text
      AND (storage.foldername(name))[2] = public.current_student_id()::text
    )
  )
);

-- School assets (logos)
CREATE POLICY storage_school_assets_manage ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'school-assets'
  AND (
    public.is_super_admin()
    OR (public.current_user_role() = 'school_admin' AND (storage.foldername(name))[1] = public.current_school_id()::text)
  )
)
WITH CHECK (
  bucket_id = 'school-assets'
  AND (
    public.is_super_admin()
    OR (public.current_user_role() = 'school_admin' AND (storage.foldername(name))[1] = public.current_school_id()::text)
  )
);

-- Report exports
CREATE POLICY storage_report_exports_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'report-exports'
  AND (
    public.is_super_admin()
    OR (public.current_user_role() IN ('school_admin', 'teacher') AND (storage.foldername(name))[1] = public.current_school_id()::text)
  )
);
