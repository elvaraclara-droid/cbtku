-- ============================================================================
-- Migration 0004: Exams, Sessions, Tokens, Attempts & Answers
-- ============================================================================

-- 1. exams
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  parent_exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  exam_date DATE NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 1 AND duration_minutes <= 600),
  total_questions INTEGER NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  passing_score NUMERIC(6,2) NOT NULL DEFAULT 75.00,
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  retake_policy public.retake_policy NOT NULL DEFAULT 'best_score',
  is_makeup BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle_options BOOLEAN NOT NULL DEFAULT TRUE,
  mcma_scoring_mode public.mcma_scoring_mode NOT NULL DEFAULT 'partial_credit',
  allow_negative_score BOOLEAN NOT NULL DEFAULT FALSE,
  face_verification_enabled BOOLEAN NOT NULL DEFAULT FALSE, -- DEFAULT OFF
  anti_cheat_config JSONB NOT NULL DEFAULT '{
    "require_fullscreen": true,
    "detect_tab_switch": true,
    "block_copy_paste": true,
    "detect_shortcuts": true,
    "allow_multiple_sessions": false,
    "warning_threshold": 2,
    "review_threshold": 4,
    "auto_pause_threshold": 6,
    "watermark_enabled": true
  }'::jsonb,
  show_result_immediately BOOLEAN NOT NULL DEFAULT FALSE,
  results_published BOOLEAN NOT NULL DEFAULT FALSE,
  results_published_at TIMESTAMPTZ,
  results_published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.exam_status NOT NULL DEFAULT 'draft',
  cancellation_reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_exams_school_status ON public.exams(school_id, status, exam_date);
CREATE INDEX idx_exams_parent ON public.exams(parent_exam_id) WHERE parent_exam_id IS NOT NULL;

CREATE TRIGGER trg_exams_updated_at
  BEFORE UPDATE ON public.exams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. exam_questions
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  weight NUMERIC(6,2) NOT NULL DEFAULT 1.00 CHECK (weight > 0),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, question_id),
  UNIQUE (exam_id, question_order)
);

CREATE INDEX idx_exam_questions_exam ON public.exam_questions(exam_id, question_order);

CREATE TRIGGER trg_exam_questions_updated_at
  BEFORE UPDATE ON public.exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. exam_sessions (multi-session support, e.g., 5 sessions x 100 or 1 x 500)
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL CHECK (session_number >= 1),
  name TEXT NOT NULL,
  room_name TEXT,
  max_participants INTEGER NOT NULL DEFAULT 100 CHECK (max_participants >= 1),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'paused', 'completed', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, session_number),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_exam_sessions_exam ON public.exam_sessions(exam_id, status);

CREATE TRIGGER trg_exam_sessions_updated_at
  BEFORE UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. exam_session_students
CREATE TABLE IF NOT EXISTS public.exam_session_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  seat_number VARCHAR(24),
  retake_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  extra_attempts_granted INTEGER NOT NULL DEFAULT 0 CHECK (extra_attempts_granted >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled', 'excused', 'suspended')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, student_id)
);

CREATE INDEX idx_exam_session_students_session ON public.exam_session_students(session_id, student_id);

CREATE TRIGGER trg_exam_session_students_updated_at
  BEFORE UPDATE ON public.exam_session_students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. exam_supervisors
CREATE TABLE IF NOT EXISTS public.exam_supervisors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_extend_time BOOLEAN NOT NULL DEFAULT TRUE,
  can_terminate_attempt BOOLEAN NOT NULL DEFAULT TRUE,
  can_approve_resume BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(24) NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'revoked')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, session_id, supervisor_id)
);

CREATE INDEX idx_exam_supervisors_supervisor ON public.exam_supervisors(supervisor_id, exam_id);

CREATE TRIGGER trg_exam_supervisors_updated_at
  BEFORE UPDATE ON public.exam_supervisors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. exam_tokens (hashed tokens only, never plaintext!)
CREATE TABLE IF NOT EXISTS public.exam_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_hint VARCHAR(12) NOT NULL, -- masked prefix/suffix only, e.g., AB**9F
  generation_mode VARCHAR(16) NOT NULL CHECK (generation_mode IN ('auto', 'manual')),
  usage_policy VARCHAR(24) NOT NULL DEFAULT 'session_shared' CHECK (usage_policy IN ('session_shared', 'limited_uses')),
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ NOT NULL,
  status public.token_status NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (valid_until > valid_from)
);

CREATE INDEX idx_exam_tokens_lookup ON public.exam_tokens(exam_id, session_id, status);

CREATE TRIGGER trg_exam_tokens_updated_at
  BEFORE UPDATE ON public.exam_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. exam_attempts
CREATE TABLE IF NOT EXISTS public.exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.exam_tokens(id) ON DELETE SET NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  status public.attempt_status NOT NULL DEFAULT 'NOT_STARTED',
  risk_level public.risk_level NOT NULL DEFAULT 'LOW',
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  violation_count INTEGER NOT NULL DEFAULT 0 CHECK (violation_count >= 0),
  question_order_seed UUID NOT NULL DEFAULT gen_random_uuid(),
  question_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  option_sequences JSONB NOT NULL DEFAULT '{}'::jsonb,
  face_verification_status public.face_verification_status NOT NULL DEFAULT 'not_required',
  active_session_token_id UUID,
  connection_status VARCHAR(24) NOT NULL DEFAULT 'online' CHECK (connection_status IN ('online', 'offline', 'reconnecting')),
  last_heartbeat_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  extra_minutes_granted INTEGER NOT NULL DEFAULT 0 CHECK (extra_minutes_granted >= 0),
  paused_at TIMESTAMPTZ,
  total_paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_paused_seconds >= 0),
  submitted_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  termination_reason TEXT,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, student_id, attempt_number)
);

CREATE INDEX idx_exam_attempts_monitoring ON public.exam_attempts(exam_id, session_id, status);
CREATE INDEX idx_exam_attempts_student ON public.exam_attempts(student_id, exam_id);

CREATE TRIGGER trg_exam_attempts_updated_at
  BEFORE UPDATE ON public.exam_attempts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. student_answers (idempotent + versioned autosave)
CREATE TABLE IF NOT EXISTS public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
  selected_option_ids UUID[] NOT NULL DEFAULT '{}',
  statement_answers JSONB NOT NULL DEFAULT '{}'::jsonb, -- { "<statement_id>": true/false }
  essay_answer TEXT,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  is_answered BOOLEAN NOT NULL DEFAULT FALSE,
  answer_version INTEGER NOT NULL DEFAULT 1 CHECK (answer_version >= 1),
  idempotency_key VARCHAR(128) NOT NULL,
  client_updated_at TIMESTAMPTZ,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(24) NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'locked', 'graded')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id),
  UNIQUE (attempt_id, idempotency_key)
);

CREATE INDEX idx_student_answers_attempt ON public.student_answers(attempt_id, is_answered);

CREATE TRIGGER trg_student_answers_updated_at
  BEFORE UPDATE ON public.student_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. answer_details (server-evaluated per-item scoring breakdown)
CREATE TABLE IF NOT EXISTS public.answer_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_answer_id UUID NOT NULL REFERENCES public.student_answers(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  max_score NUMERIC(6,2) NOT NULL DEFAULT 1.00,
  awarded_score NUMERIC(6,2) NOT NULL DEFAULT 0.00,
  is_correct BOOLEAN,
  grading_status VARCHAR(24) NOT NULL DEFAULT 'auto_graded' CHECK (grading_status IN ('auto_graded', 'pending_manual', 'manual_graded')),
  evaluation_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX idx_answer_details_attempt ON public.answer_details(attempt_id, grading_status);

CREATE TRIGGER trg_answer_details_updated_at
  BEFORE UPDATE ON public.answer_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
