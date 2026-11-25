import type {
  AttemptStatus,
  DifficultyLevel,
  ExamStatus,
  FaceVerificationStatus,
  QuestionType,
  RiskLevel,
} from "@/types/database";

export interface SubjectRef {
  id?: string;
  name: string;
  code?: string;
}

export interface ClassRef {
  id?: string;
  name: string;
  code?: string;
  grade_level?: string;
}

export interface SchoolSummaryRow {
  id: string;
  code: string;
  name: string;
  education_level: string;
  city: string | null;
  status: string;
}

export interface SchoolAdminSummaryRow {
  id: string;
  username: string;
  full_name: string;
  is_active: boolean;
  schools?: { name: string; code: string } | null;
}

export interface ExamSessionSummary {
  id: string;
  session_number: number;
  name: string;
  starts_at: string;
  ends_at: string;
  max_participants: number;
  status: string;
}

export interface ExamSummary {
  id: string;
  title: string;
  exam_date: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  total_questions: number;
  status: ExamStatus | string;
  face_verification_enabled: boolean;
  is_makeup?: boolean;
  results_published?: boolean;
  subjects?: SubjectRef | null;
  classes?: ClassRef | null;
  exam_sessions?: ExamSessionSummary[];
}

export interface StudentEnrollmentView {
  exam_id: string;
  session_id: string;
  retake_allowed?: boolean;
  exams?: ExamSummary | null;
  exam_sessions?: ExamSessionSummary | null;
}

export interface StudentAttemptView {
  id: string;
  exam_id: string;
  session_id: string;
  attempt_number: number;
  status: AttemptStatus;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
}

export interface PublishedResultView {
  exam_id: string;
  attempt_id: string;
  total_score: number;
  max_possible_score: number;
  percentage: number;
  is_passed: boolean;
  is_published: boolean;
}

export interface TokenMetadataView {
  id: string;
  session_id: string;
  token_hint: string;
  generation_mode: string;
  usage_policy: string;
  use_count: number;
  valid_from: string;
  valid_until: string;
  status: string;
}

export interface AuditLogView {
  id: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  server_timestamp: string;
}

export interface BackupRecordView {
  id: string;
  backup_scope: string;
  status: string;
  notes: string | null;
  executed_at: string;
}

export interface QuestionBankView {
  id: string;
  subject_id: string;
  title: string;
  subjects?: SubjectRef | null;
}

export interface QuestionView {
  id: string;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  stem_html: string;
  stem_plain: string | null;
  default_weight: number;
  subjects?: SubjectRef | null;
  question_media?: Array<{ id: string; file_name: string }>;
}

export interface StudentListRow {
  id: string;
  nis: string;
  nisn: string | null;
  classes?: ClassRef | null;
  profiles: {
    id: string;
    username: string;
    full_name: string;
    is_active: boolean;
  };
}

export interface TeacherListRow {
  id: string;
  nip: string | null;
  profiles: {
    id: string;
    username: string;
    full_name: string;
    is_active: boolean;
  };
}

export interface SupervisorListRow {
  id: string;
  username: string;
  full_name: string;
  is_active: boolean;
}

export interface MonitoringDetailView {
  securityEvents: Array<{
    id: string;
    event_type: string;
    risk_level: RiskLevel;
    duration_seconds: number;
    server_timestamp: string;
  }>;
  supervisorActions: Array<{
    id: string;
    action_type: string;
    status_before: AttemptStatus;
    status_after: AttemptStatus;
    reason: string;
    server_timestamp: string;
    profiles?: { full_name: string } | null;
  }>;
  faceRecords: Array<{
    id: string;
    status: FaceVerificationStatus;
    quality_score: number | null;
  }>;
}
