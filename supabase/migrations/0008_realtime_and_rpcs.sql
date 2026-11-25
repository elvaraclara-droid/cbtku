-- ============================================================================
-- Migration 0008: Realtime Publication & Atomic Server RPCs
-- ============================================================================

-- Enable Supabase Realtime selectively for tables that truly require live updates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_attempts; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_security_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.supervisor_actions; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_announcements; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Atomic versioned & idempotent autosave RPC (called by backend service role)
CREATE OR REPLACE FUNCTION public.save_student_answer_atomic(
  p_school_id UUID,
  p_exam_id UUID,
  p_session_id UUID,
  p_student_id UUID,
  p_attempt_id UUID,
  p_question_id UUID,
  p_selected_option_id UUID,
  p_selected_option_ids UUID[],
  p_statement_answers JSONB,
  p_essay_answer TEXT,
  p_is_flagged BOOLEAN,
  p_is_answered BOOLEAN,
  p_answer_version INTEGER,
  p_idempotency_key VARCHAR,
  p_client_updated_at TIMESTAMPTZ,
  p_actor_id UUID
)
RETURNS TABLE (
  answer_id UUID,
  persisted_version INTEGER,
  conflict_detected BOOLEAN,
  saved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_answer_id UUID;
  v_version INTEGER;
BEGIN
  -- 1. Check idempotency key first (exact replay returns stored state safely)
  SELECT sa.id, sa.answer_version, sa.server_timestamp
  INTO v_existing
  FROM public.student_answers sa
  WHERE sa.attempt_id = p_attempt_id
    AND sa.idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.answer_version, FALSE, v_existing.server_timestamp;
    RETURN;
  END IF;

  -- 2. Lock existing question answer row if present to guard against stale overwrites
  SELECT sa.id, sa.answer_version, sa.server_timestamp
  INTO v_existing
  FROM public.student_answers sa
  WHERE sa.attempt_id = p_attempt_id
    AND sa.question_id = p_question_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_answer_version < v_existing.answer_version THEN
      -- Stale client version detected: do NOT overwrite newer server answer
      RETURN QUERY SELECT v_existing.id, v_existing.answer_version, TRUE, v_existing.server_timestamp;
      RETURN;
    END IF;

    UPDATE public.student_answers
    SET
      selected_option_id = p_selected_option_id,
      selected_option_ids = COALESCE(p_selected_option_ids, '{}'),
      statement_answers = COALESCE(p_statement_answers, '{}'::jsonb),
      essay_answer = p_essay_answer,
      is_flagged = COALESCE(p_is_flagged, FALSE),
      is_answered = COALESCE(p_is_answered, FALSE),
      answer_version = GREATEST(v_existing.answer_version + 1, p_answer_version),
      idempotency_key = p_idempotency_key,
      client_updated_at = p_client_updated_at,
      server_timestamp = v_now,
      updated_by = p_actor_id
    WHERE id = v_existing.id
    RETURNING id, answer_version INTO v_answer_id, v_version;
  ELSE
    INSERT INTO public.student_answers (
      school_id, exam_id, session_id, student_id, attempt_id, question_id,
      selected_option_id, selected_option_ids, statement_answers, essay_answer,
      is_flagged, is_answered, answer_version, idempotency_key,
      client_updated_at, server_timestamp, created_by, updated_by
    )
    VALUES (
      p_school_id, p_exam_id, p_session_id, p_student_id, p_attempt_id, p_question_id,
      p_selected_option_id, COALESCE(p_selected_option_ids, '{}'), COALESCE(p_statement_answers, '{}'::jsonb), p_essay_answer,
      COALESCE(p_is_flagged, FALSE), COALESCE(p_is_answered, FALSE), GREATEST(1, p_answer_version), p_idempotency_key,
      p_client_updated_at, v_now, p_actor_id, p_actor_id
    )
    RETURNING id, answer_version INTO v_answer_id, v_version;
  END IF;

  UPDATE public.exam_attempts
  SET last_saved_at = v_now,
      last_heartbeat_at = v_now,
      server_timestamp = v_now
  WHERE id = p_attempt_id;

  RETURN QUERY SELECT v_answer_id, v_version, FALSE, v_now;
END;
$$;

-- Retention cleanup helper for optional biometric snapshots
CREATE OR REPLACE FUNCTION public.cleanup_expired_face_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.face_verification_records
  SET snapshot_storage_path = NULL,
      deleted_at = NOW(),
      verification_note = COALESCE(verification_note, '') || ' [Snapshot metadata purged per retention policy]'
  WHERE deleted_at IS NULL
    AND retention_expires_at <= NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
