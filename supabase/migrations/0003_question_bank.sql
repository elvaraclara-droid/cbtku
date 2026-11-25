-- ============================================================================
-- Migration 0003: Question Bank & Media
-- ============================================================================

-- 1. question_categories
CREATE TABLE IF NOT EXISTS public.question_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX idx_question_categories_school ON public.question_categories(school_id, subject_id);

CREATE TRIGGER trg_question_categories_updated_at
  BEFORE UPDATE ON public.question_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. question_banks
CREATE TABLE IF NOT EXISTS public.question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  grade_level VARCHAR(16),
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_banks_school_subject ON public.question_banks(school_id, subject_id);

CREATE TRIGGER trg_question_banks_updated_at
  BEFORE UPDATE ON public.question_banks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. questions
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.question_categories(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  question_type public.question_type NOT NULL,
  difficulty public.difficulty_level NOT NULL DEFAULT 'medium',
  topic TEXT,
  competency TEXT,
  stem_html TEXT NOT NULL,
  stem_plain TEXT,
  has_math BOOLEAN NOT NULL DEFAULT FALSE,
  default_weight NUMERIC(6,2) NOT NULL DEFAULT 1.00 CHECK (default_weight > 0),
  mcma_scoring_mode public.mcma_scoring_mode NOT NULL DEFAULT 'partial_credit',
  allow_negative_score BOOLEAN NOT NULL DEFAULT FALSE,
  explanation_html TEXT,
  essay_rubric TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_bank_type ON public.questions(bank_id, question_type, status);
CREATE INDEX idx_questions_school_subject ON public.questions(school_id, subject_id);

CREATE TRIGGER trg_questions_updated_at
  BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. question_options (single_choice & mcma)
-- SECURITY NOTE: Students NEVER have direct SELECT RLS access to this table!
CREATE TABLE IF NOT EXISTS public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_label VARCHAR(4) NOT NULL, -- A, B, C, D, E
  content_html TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, option_label)
);

CREATE INDEX idx_question_options_question ON public.question_options(question_id, sort_order);

CREATE TRIGGER trg_question_options_updated_at
  BEFORE UPDATE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. question_statements (true_false multi-statement)
-- SECURITY NOTE: Students NEVER have direct SELECT RLS access to this table!
CREATE TABLE IF NOT EXISTS public.question_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  statement_html TEXT NOT NULL,
  is_true BOOLEAN NOT NULL,
  weight NUMERIC(6,2) NOT NULL DEFAULT 1.00 CHECK (weight > 0),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_statements_question ON public.question_statements(question_id, sort_order);

CREATE TRIGGER trg_question_statements_updated_at
  BEFORE UPDATE ON public.question_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. question_media
CREATE TABLE IF NOT EXISTS public.question_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('image', 'audio', 'video', 'attachment')),
  bucket_name VARCHAR(64) NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  caption TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_question_media_question ON public.question_media(question_id);

CREATE TRIGGER trg_question_media_updated_at
  BEFORE UPDATE ON public.question_media
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
