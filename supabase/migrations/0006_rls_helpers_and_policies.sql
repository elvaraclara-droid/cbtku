-- ============================================================================
-- Migration 0006: Row Level Security (RLS) Helpers & Policies
-- Strict multi-school isolation and role-based database authorization
-- ============================================================================

-- Helper functions (SECURITY DEFINER to avoid recursive RLS lookups)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.students WHERE profile_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_teacher_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.teachers WHERE profile_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'super_admin' FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin_of(p_school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'school_admin' AND school_id = p_school_id
     FROM public.profiles WHERE id = auth.uid() AND is_active = TRUE),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_for_subject(p_school_id UUID, p_subject_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.teacher_subjects ts
    JOIN public.teachers t ON t.id = ts.teacher_id
    WHERE t.profile_id = auth.uid()
      AND ts.school_id = p_school_id
      AND ts.subject_id = p_subject_id
      AND ts.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor_for_exam(p_exam_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_supervisors es
    WHERE es.exam_id = p_exam_id
      AND es.supervisor_id = auth.uid()
      AND es.status = 'assigned'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_enrolled_in_exam(p_exam_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exam_session_students ess
    JOIN public.students s ON s.id = ess.student_id
    WHERE ess.exam_id = p_exam_id
      AND s.profile_id = auth.uid()
      AND ess.status = 'enrolled'
  );
$$;

-- Enable RLS on ALL tables
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_session_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_override_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_grading ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_records ENABLE ROW LEVEL SECURITY;

-- 1. schools
CREATE POLICY schools_select ON public.schools FOR SELECT USING (
  public.is_super_admin() OR id = public.current_school_id()
);
CREATE POLICY schools_manage_super ON public.schools FOR ALL USING (
  public.is_super_admin()
) WITH CHECK (public.is_super_admin());

-- 2. school_settings
CREATE POLICY school_settings_select ON public.school_settings FOR SELECT USING (
  public.is_super_admin() OR school_id = public.current_school_id()
);
CREATE POLICY school_settings_manage ON public.school_settings FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

-- 3. profiles (Students can only read own profile; school_admin manages own school non-super_admin)
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (
  public.is_super_admin()
  OR id = auth.uid()
  OR (public.is_school_admin_of(school_id) AND role <> 'super_admin')
  OR (
    public.current_user_role() IN ('teacher', 'supervisor')
    AND school_id = public.current_school_id()
    AND role = 'student'
  )
);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR (public.is_school_admin_of(school_id) AND role <> 'super_admin')
);

-- 4. Academic tables (academic_years, semesters, classes, subjects, teachers, teacher_subjects, students)
CREATE POLICY academic_years_read ON public.academic_years FOR SELECT USING (
  public.is_super_admin() OR school_id = public.current_school_id()
);
CREATE POLICY academic_years_write ON public.academic_years FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY semesters_read ON public.semesters FOR SELECT USING (
  public.is_super_admin() OR school_id = public.current_school_id()
);
CREATE POLICY semesters_write ON public.semesters FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY classes_read ON public.classes FOR SELECT USING (
  public.is_super_admin() OR school_id = public.current_school_id()
);
CREATE POLICY classes_write ON public.classes FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY subjects_read ON public.subjects FOR SELECT USING (
  public.is_super_admin() OR school_id = public.current_school_id()
);
CREATE POLICY subjects_write ON public.subjects FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY teachers_read ON public.teachers FOR SELECT USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id) OR profile_id = auth.uid()
);
CREATE POLICY teachers_write ON public.teachers FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY teacher_subjects_read ON public.teacher_subjects FOR SELECT USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id) OR teacher_id = public.current_teacher_id()
);
CREATE POLICY teacher_subjects_write ON public.teacher_subjects FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

-- Students: only own record, school_admin of same school, or teachers/supervisors of same school
CREATE POLICY students_read ON public.students FOR SELECT USING (
  public.is_super_admin()
  OR profile_id = auth.uid()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() IN ('teacher', 'supervisor') AND school_id = public.current_school_id())
);
CREATE POLICY students_write ON public.students FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

-- 5. Question Bank (CRITICAL: Students & Supervisors CANNOT read question_options or question_statements!)
CREATE POLICY q_categories_read ON public.question_categories FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);
CREATE POLICY q_categories_write ON public.question_categories FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);

CREATE POLICY q_banks_read ON public.question_banks FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND (teacher_id = public.current_teacher_id() OR is_shared = TRUE OR public.is_teacher_for_subject(school_id, subject_id)))
);
CREATE POLICY q_banks_write ON public.question_banks FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND (teacher_id = public.current_teacher_id() OR public.is_teacher_for_subject(school_id, subject_id)))
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND public.is_teacher_for_subject(school_id, subject_id))
);

CREATE POLICY questions_staff_read ON public.questions FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND (created_by = auth.uid() OR public.is_teacher_for_subject(school_id, subject_id)))
);
CREATE POLICY questions_staff_write ON public.questions FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND (created_by = auth.uid() OR public.is_teacher_for_subject(school_id, subject_id)))
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND public.is_teacher_for_subject(school_id, subject_id))
);

-- NO student or supervisor SELECT policy on question_options!
CREATE POLICY question_options_staff_only ON public.question_options FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND (q.created_by = auth.uid() OR public.is_teacher_for_subject(q.school_id, q.subject_id))))
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND (q.created_by = auth.uid() OR public.is_teacher_for_subject(q.school_id, q.subject_id))))
);

-- NO student or supervisor SELECT policy on question_statements!
CREATE POLICY question_statements_staff_only ON public.question_statements FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND (q.created_by = auth.uid() OR public.is_teacher_for_subject(q.school_id, q.subject_id))))
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.questions q WHERE q.id = question_id AND (q.created_by = auth.uid() OR public.is_teacher_for_subject(q.school_id, q.subject_id))))
);

CREATE POLICY question_media_staff_only ON public.question_media FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);

-- 6. Exams, Sessions, Enrollment, Supervisors, Tokens
CREATE POLICY exams_select ON public.exams FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND (created_by = auth.uid() OR public.is_teacher_for_subject(school_id, subject_id)))
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(id))
  OR (public.current_user_role() = 'student' AND public.is_student_enrolled_in_exam(id))
);
CREATE POLICY exams_write ON public.exams FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND (created_by = auth.uid() OR public.is_teacher_for_subject(school_id, subject_id)))
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND public.is_teacher_for_subject(school_id, subject_id))
);

CREATE POLICY exam_questions_staff ON public.exam_questions FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);

CREATE POLICY exam_sessions_select ON public.exam_sessions FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
  OR (public.current_user_role() = 'student' AND public.is_student_enrolled_in_exam(exam_id))
);
CREATE POLICY exam_sessions_write ON public.exam_sessions FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);

CREATE POLICY exam_session_students_select ON public.exam_session_students FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR student_id = public.current_student_id()
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
);
CREATE POLICY exam_session_students_write ON public.exam_session_students FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);

CREATE POLICY exam_supervisors_select ON public.exam_supervisors FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR supervisor_id = auth.uid()
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);
CREATE POLICY exam_supervisors_write ON public.exam_supervisors FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY exam_tokens_admin_only ON public.exam_tokens FOR ALL USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
) WITH CHECK (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

-- 7. Attempts & Answers (Students read own only; Supervisors read assigned exams only, NO answer modification!)
CREATE POLICY exam_attempts_select ON public.exam_attempts FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR student_id = public.current_student_id()
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR public.is_teacher_for_subject(e.school_id, e.subject_id))))
);

-- Student answers: student sees ONLY own answers; teacher/admin see own school; supervisor CANNOT see or edit student_answers!
CREATE POLICY student_answers_select ON public.student_answers FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR student_id = public.current_student_id()
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR public.is_teacher_for_subject(e.school_id, e.subject_id))))
);

CREATE POLICY answer_details_select ON public.answer_details FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR public.is_teacher_for_subject(e.school_id, e.subject_id))))
  OR (student_id = public.current_student_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.results_published = TRUE))
);

-- 8. Monitoring & Immutable Logs
CREATE POLICY exam_activity_logs_select ON public.exam_activity_logs FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
);

CREATE POLICY exam_security_events_select ON public.exam_security_events FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
);

CREATE POLICY supervisor_actions_select ON public.supervisor_actions FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
  OR student_id = public.current_student_id()
);

CREATE POLICY supervisor_override_logs_select ON public.supervisor_override_logs FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
);

CREATE POLICY exam_announcements_select ON public.exam_announcements FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
  OR (public.current_user_role() = 'student' AND public.is_student_enrolled_in_exam(exam_id))
);

CREATE POLICY user_sessions_select ON public.user_sessions FOR SELECT USING (
  public.is_super_admin()
  OR user_id = auth.uid()
  OR public.is_school_admin_of(school_id)
);

-- 9. Face Verification
CREATE POLICY face_verification_select ON public.face_verification_records FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR student_id = public.current_student_id()
  OR (public.current_user_role() = 'supervisor' AND public.is_supervisor_for_exam(exam_id))
);

-- 10. Results & Grading (Supervisors CANNOT modify results or manual grading!)
CREATE POLICY exam_results_select ON public.exam_results FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (student_id = public.current_student_id() AND is_published = TRUE)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR public.is_teacher_for_subject(e.school_id, e.subject_id))))
);

CREATE POLICY manual_grading_staff ON public.manual_grading FOR ALL USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR public.is_teacher_for_subject(e.school_id, e.subject_id))))
) WITH CHECK (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id()
      AND EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND (e.created_by = auth.uid() OR public.is_teacher_for_subject(e.school_id, e.subject_id))))
);

CREATE POLICY grading_history_select ON public.grading_history FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND school_id = public.current_school_id())
);

CREATE POLICY report_exports_select ON public.report_exports FOR SELECT USING (
  public.is_super_admin()
  OR public.is_school_admin_of(school_id)
  OR (public.current_user_role() = 'teacher' AND created_by = auth.uid())
);

-- 11. Audit logs, System settings, Notifications, Rate limits, Backup records
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (
  public.is_super_admin() OR public.is_school_admin_of(school_id)
);

CREATE POLICY system_settings_select ON public.system_settings FOR SELECT USING (
  public.is_super_admin() OR is_public = TRUE
);
CREATE POLICY system_settings_write ON public.system_settings FOR ALL USING (
  public.is_super_admin()
) WITH CHECK (public.is_super_admin());

CREATE POLICY notifications_own ON public.notifications FOR ALL USING (
  public.is_super_admin() OR recipient_id = auth.uid()
) WITH CHECK (
  public.is_super_admin() OR recipient_id = auth.uid()
);

-- auth_rate_limits: service role only (zero client access)
CREATE POLICY auth_rate_limits_none ON public.auth_rate_limits FOR SELECT USING (FALSE);

-- backup_records: super_admin only
CREATE POLICY backup_records_super ON public.backup_records FOR ALL USING (
  public.is_super_admin()
) WITH CHECK (public.is_super_admin());
