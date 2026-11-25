export type UserRole =
  | "super_admin"
  | "school_admin"
  | "teacher"
  | "supervisor"
  | "student";

export type QuestionType = "single_choice" | "mcma" | "true_false" | "essay";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type McmaScoringMode = "exact_match" | "partial_credit";
export type ExamStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type AttemptStatus =
  | "NOT_STARTED"
  | "LOGGED_IN"
  | "NORMAL"
  | "WARNING"
  | "NEEDS_REVIEW"
  | "PAUSED"
  | "LOCKED"
  | "PENDING_SUPERVISOR_APPROVAL"
  | "APPROVED_TO_RESUME"
  | "RESUMED"
  | "SUBMITTED"
  | "TERMINATED"
  | "DISCONNECTED";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RetakePolicy = "best_score" | "latest_score" | "approved_score";
export type TokenStatus = "active" | "revoked" | "expired";
export type FaceVerificationStatus =
  | "not_required"
  | "pending"
  | "verified"
  | "manual_pending"
  | "manual_approved"
  | "failed"
  | "rejected";

export type AutosaveStatus = "SAVING" | "SAVED" | "FAILED" | "SYNCING" | "OFFLINE";

export interface AntiCheatConfig {
  require_fullscreen: boolean;
  detect_tab_switch: boolean;
  block_copy_paste: boolean;
  detect_shortcuts: boolean;
  allow_multiple_sessions: boolean;
  warning_threshold: number;
  review_threshold: number;
  auto_pause_threshold: number;
  watermark_enabled: boolean;
}

export interface ProfileRecord {
  id: string;
  school_id: string | null;
  role: UserRole;
  username: string;
  full_name: string;
  display_email: string | null;
  phone: string | null;
  avatar_path: string | null;
  status: "active" | "inactive" | "suspended" | "locked";
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolRecord {
  id: string;
  code: string;
  npsn: string | null;
  name: string;
  education_level: string;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive" | "suspended";
  created_at: string;
}

/**
 * Sanitized question DTO sent to students during an exam.
 * SECURITY INVARIANT: Never includes is_correct, is_true, or explanation_html!
 */
export interface StudentExamOptionDTO {
  id: string;
  option_label: string;
  content_html: string;
}

export interface StudentExamStatementDTO {
  id: string;
  statement_html: string;
  weight: number;
}

export interface StudentExamMediaDTO {
  id: string;
  media_type: "image" | "audio" | "video" | "attachment";
  signed_url: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
}

export interface StudentExamQuestionDTO {
  question_id: string;
  order_index: number;
  question_type: QuestionType;
  stem_html: string;
  has_math: boolean;
  weight: number;
  options: StudentExamOptionDTO[];
  statements: StudentExamStatementDTO[];
  media: StudentExamMediaDTO[];
}

export interface StudentSavedAnswerState {
  question_id: string;
  selected_option_id: string | null;
  selected_option_ids: string[];
  statement_answers: Record<string, boolean>;
  essay_answer: string | null;
  is_flagged: boolean;
  is_answered: boolean;
  answer_version: number;
  server_timestamp?: string;
}

export interface SupervisorMonitoringParticipant {
  attempt_id: string | null;
  student_id: string;
  student_name: string;
  nis: string;
  class_name: string | null;
  session_id: string;
  session_name: string;
  status: AttemptStatus;
  risk_level: RiskLevel;
  risk_score: number;
  warning_count: number;
  violation_count: number;
  connection_status: "online" | "offline" | "reconnecting";
  face_verification_status: FaceVerificationStatus;
  started_at: string | null;
  deadline_at: string | null;
  last_heartbeat_at: string | null;
  last_saved_at: string | null;
  answered_count: number;
  total_questions: number;
}
