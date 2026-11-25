-- ============================================================================
-- Migration 0001: Extensions & Enum Types for CBT SMART EXAM
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'school_admin',
    'teacher',
    'supervisor',
    'student'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.question_type AS ENUM (
    'single_choice',
    'mcma',
    'true_false',
    'essay'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.difficulty_level AS ENUM (
    'easy',
    'medium',
    'hard'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mcma_scoring_mode AS ENUM (
    'exact_match',
    'partial_credit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_status AS ENUM (
    'draft',
    'scheduled',
    'active',
    'paused',
    'completed',
    'cancelled',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attempt_status AS ENUM (
    'NOT_STARTED',
    'LOGGED_IN',
    'NORMAL',
    'WARNING',
    'NEEDS_REVIEW',
    'PAUSED',
    'LOCKED',
    'PENDING_SUPERVISOR_APPROVAL',
    'APPROVED_TO_RESUME',
    'RESUMED',
    'SUBMITTED',
    'TERMINATED',
    'DISCONNECTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_level AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.retake_policy AS ENUM (
    'best_score',
    'latest_score',
    'approved_score'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.token_status AS ENUM (
    'active',
    'revoked',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.face_verification_status AS ENUM (
    'not_required',
    'pending',
    'verified',
    'manual_pending',
    'manual_approved',
    'failed',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
