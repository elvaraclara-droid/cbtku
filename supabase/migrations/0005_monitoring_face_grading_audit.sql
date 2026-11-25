-- ============================================================================
-- Migration 0005: Monitoring, Face Verification, Grading, Audit & System
-- ============================================================================

-- 1. exam_activity_logs
CREATE TABLE IF NOT EXISTS public.exam_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_type VARCHAR(64) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exam_activity_logs_attempt ON public.exam_activity_logs(attempt_id, server_timestamp DESC);
CREATE INDEX idx_exam_activity_logs_exam ON public.exam_activity_logs(exam_id, server_timestamp DESC);

-- 2. exam_security_events
CREATE TABLE IF NOT EXISTS public.exam_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  risk_level public.risk_level NOT NULL DEFAULT 'LOW',
  risk_points INTEGER NOT NULL DEFAULT 1 CHECK (risk_points >= 0),
  duration_seconds INTEGER DEFAULT 0,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_exam_time ON public.exam_security_events(exam_id, server_timestamp DESC);
CREATE INDEX idx_security_events_attempt ON public.exam_security_events(attempt_id, server_timestamp DESC);

-- 3. supervisor_actions (immutable operational record)
CREATE TABLE IF NOT EXISTS public.supervisor_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action_type VARCHAR(48) NOT NULL CHECK (action_type IN (
    'WARNING_SENT',
    'EXAM_PAUSED',
    'RESUME_APPROVED',
    'TIME_EXTENDED',
    'EXAM_TERMINATED',
    'MANUAL_FACE_APPROVED',
    'MANUAL_FACE_REJECTED'
  )),
  status_before public.attempt_status NOT NULL,
  status_after public.attempt_status NOT NULL,
  reason TEXT NOT NULL,
  extra_minutes INTEGER DEFAULT 0 CHECK (extra_minutes >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supervisor_actions_attempt ON public.supervisor_actions(attempt_id, server_timestamp DESC);
CREATE INDEX idx_supervisor_actions_exam ON public.supervisor_actions(exam_id, server_timestamp DESC);

-- 4. supervisor_override_logs (specifically for resume / time / lock overrides)
CREATE TABLE IF NOT EXISTS public.supervisor_override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  supervisor_action_id UUID REFERENCES public.supervisor_actions(id) ON DELETE SET NULL,
  override_type VARCHAR(48) NOT NULL,
  previous_status public.attempt_status NOT NULL,
  new_status public.attempt_status NOT NULL,
  previous_deadline_at TIMESTAMPTZ,
  new_deadline_at TIMESTAMPTZ,
  reason TEXT NOT NULL,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_supervisor_override_logs_attempt ON public.supervisor_override_logs(attempt_id, server_timestamp DESC);

-- 5. exam_announcements
CREATE TABLE IF NOT EXISTS public.exam_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  target_attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  severity VARCHAR(24) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exam_announcements_exam ON public.exam_announcements(exam_id, is_active, server_timestamp DESC);

-- 6. user_sessions (single/multi-session tracking & revocation)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_token_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  device_fingerprint TEXT,
  user_agent TEXT,
  browser_name VARCHAR(64),
  os_name VARCHAR(64),
  ip_address INET,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_sessions_user_active ON public.user_sessions(user_id, is_active);

CREATE TRIGGER trg_user_sessions_updated_at
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. face_verification_records (optional feature, default OFF; minimal metadata + retention expiry)
CREATE TABLE IF NOT EXISTS public.face_verification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status public.face_verification_status NOT NULL DEFAULT 'pending',
  provider VARCHAR(64) NOT NULL DEFAULT 'local_quality_plus_supervisor',
  quality_score NUMERIC(5,2),
  quality_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot_storage_path TEXT, -- private bucket only, deleted on retention_expires_at
  consent_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  consent_accepted_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verification_note TEXT,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  deleted_at TIMESTAMPTZ,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_face_verification_exam_student ON public.face_verification_records(exam_id, student_id);
CREATE INDEX idx_face_verification_retention ON public.face_verification_records(retention_expires_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_face_verification_updated_at
  BEFORE UPDATE ON public.face_verification_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. exam_results
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL UNIQUE REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  auto_score NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  manual_score NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  total_score NUMERIC(8,2) NOT NULL DEFAULT 0.00,
  max_possible_score NUMERIC(8,2) NOT NULL DEFAULT 100.00,
  percentage NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  is_passed BOOLEAN NOT NULL DEFAULT FALSE,
  grading_status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (grading_status IN ('pending', 'auto_graded', 'needs_manual', 'completed')),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exam_results_exam_student ON public.exam_results(exam_id, student_id, is_published);

CREATE TRIGGER trg_exam_results_updated_at
  BEFORE UPDATE ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. manual_grading
CREATE TABLE IF NOT EXISTS public.manual_grading (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_detail_id UUID REFERENCES public.answer_details(id) ON DELETE CASCADE,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  awarded_score NUMERIC(6,2) NOT NULL DEFAULT 0.00 CHECK (awarded_score >= 0),
  grader_note TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'graded')),
  graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_manual_grading_exam_status ON public.manual_grading(exam_id, status);

CREATE TRIGGER trg_manual_grading_updated_at
  BEFORE UPDATE ON public.manual_grading
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. grading_history (immutable score change log)
CREATE TABLE IF NOT EXISTS public.grading_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE SET NULL,
  previous_score NUMERIC(8,2),
  new_score NUMERIC(8,2) NOT NULL,
  reason TEXT,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_grading_history_attempt ON public.grading_history(attempt_id, server_timestamp DESC);

-- 11. report_exports
CREATE TABLE IF NOT EXISTS public.report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  export_type VARCHAR(32) NOT NULL CHECK (export_type IN ('exam_results_csv', 'exam_results_xlsx', 'exam_results_pdf', 'item_analysis', 'students_csv', 'audit_log')),
  file_name TEXT NOT NULL,
  storage_path TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. audit_logs (immutable global & school audit log)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role public.user_role,
  action VARCHAR(96) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_school_time ON public.audit_logs(school_id, server_timestamp DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id, server_timestamp DESC);

-- 13. system_settings (Super Admin global settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key VARCHAR(96) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES
  ('security_policy', '{"max_login_failures": 5, "lockout_minutes": 15, "token_max_failures": 8, "require_strong_password": true}'::jsonb, 'Global authentication and token security policy', false),
  ('backup_policy', '{"rpo_target_minutes": 30, "rto_target_minutes": 120, "schedule": "daily_0200_wib", "storage_backup_enabled": true}'::jsonb, 'Disaster recovery and backup policy', false),
  ('platform_branding', '{"app_name": "CBT SMART EXAM", "tagline": "SMART EXAMINATION, SECURE ASSESSMENT."}'::jsonb, 'Platform identity', true)
ON CONFLICT (key) DO NOTHING;

-- 14. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'system',
  link_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);

-- 15. auth_rate_limits (DB-backed brute force & token abuse mitigation)
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  rate_key VARCHAR(160) PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. backup_records (tracks Supabase backup checks & restore verification)
CREATE TABLE IF NOT EXISTS public.backup_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_scope VARCHAR(32) NOT NULL CHECK (backup_scope IN ('database', 'storage', 'full_dr_drill')),
  status VARCHAR(24) NOT NULL CHECK (status IN ('scheduled', 'completed', 'verified', 'failed')),
  notes TEXT,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
