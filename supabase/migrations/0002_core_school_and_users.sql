-- ============================================================================
-- Migration 0002: Schools, Settings, Profiles & Academic Structure
-- ============================================================================

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 1. schools
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(32) NOT NULL UNIQUE,
  npsn VARCHAR(20),
  name TEXT NOT NULL,
  education_level VARCHAR(32) NOT NULL DEFAULT 'SMA',
  address TEXT,
  city TEXT,
  province TEXT,
  phone VARCHAR(32),
  email TEXT,
  website TEXT,
  logo_path TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. school_settings
CREATE TABLE IF NOT EXISTS public.school_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  default_face_verification BOOLEAN NOT NULL DEFAULT FALSE,
  default_fullscreen_required BOOLEAN NOT NULL DEFAULT TRUE,
  default_tab_switch_warning_threshold INTEGER NOT NULL DEFAULT 2 CHECK (default_tab_switch_warning_threshold >= 1),
  default_tab_switch_review_threshold INTEGER NOT NULL DEFAULT 4 CHECK (default_tab_switch_review_threshold >= 1),
  default_auto_pause_threshold INTEGER NOT NULL DEFAULT 6 CHECK (default_auto_pause_threshold >= 0),
  allow_multiple_sessions BOOLEAN NOT NULL DEFAULT FALSE,
  max_login_failures INTEGER NOT NULL DEFAULT 5 CHECK (max_login_failures >= 3),
  lockout_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (lockout_duration_minutes >= 1),
  face_data_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (face_data_retention_days >= 1),
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  anti_cheat_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_school_settings_updated_at
  BEFORE UPDATE ON public.school_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  role public.user_role NOT NULL,
  username VARCHAR(64) NOT NULL UNIQUE,
  auth_email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  display_email TEXT,
  phone VARCHAR(32),
  avatar_path TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'locked')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_school_role ON public.profiles(school_id, role);
CREATE INDEX idx_profiles_username_lower ON public.profiles(LOWER(username));

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. academic_years
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_academic_years_school ON public.academic_years(school_id, is_active);

CREATE TRIGGER trg_academic_years_updated_at
  BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. semesters
CREATE TABLE IF NOT EXISTS public.semesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name VARCHAR(32) NOT NULL,
  semester_number SMALLINT NOT NULL CHECK (semester_number IN (1, 2)),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year_id, semester_number),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_semesters_school ON public.semesters(school_id, is_active);

CREATE TRIGGER trg_semesters_updated_at
  BEFORE UPDATE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. classes
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  code VARCHAR(32) NOT NULL,
  name TEXT NOT NULL,
  grade_level VARCHAR(16) NOT NULL,
  major VARCHAR(64),
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE INDEX idx_classes_school ON public.classes(school_id, grade_level);

CREATE TRIGGER trg_classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name TEXT NOT NULL,
  grade_level VARCHAR(16),
  description TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE INDEX idx_subjects_school ON public.subjects(school_id);

CREATE TRIGGER trg_subjects_updated_at
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8. teachers
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  nip VARCHAR(32),
  nuptk VARCHAR(32),
  specialization TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teachers_school ON public.teachers(school_id);
CREATE UNIQUE INDEX idx_teachers_school_nip ON public.teachers(school_id, nip) WHERE nip IS NOT NULL;

CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. teacher_subjects
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  semester_id UUID REFERENCES public.semesters(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, teacher_id, subject_id, class_id)
);

CREATE INDEX idx_teacher_subjects_teacher ON public.teacher_subjects(teacher_id, subject_id);

CREATE TRIGGER trg_teacher_subjects_updated_at
  BEFORE UPDATE ON public.teacher_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 10. students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  nis VARCHAR(32) NOT NULL,
  nisn VARCHAR(32),
  gender VARCHAR(16) CHECK (gender IN ('L', 'P', 'other')),
  birth_date DATE,
  parent_contact VARCHAR(32),
  status VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'graduated', 'suspended')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, nis)
);

CREATE INDEX idx_students_school_class ON public.students(school_id, class_id);
CREATE UNIQUE INDEX idx_students_school_nisn ON public.students(school_id, nisn) WHERE nisn IS NOT NULL;

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
