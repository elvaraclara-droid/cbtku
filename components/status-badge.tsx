import { Badge } from "@/components/ui/badge";
import type { AttemptStatus, RiskLevel } from "@/types/database";

const ATTEMPT_STATUS_META: Record<
  AttemptStatus,
  { label: string; variant: "default" | "primary" | "success" | "warning" | "danger" | "purple" | "teal" }
> = {
  NOT_STARTED: { label: "Belum Mulai", variant: "default" },
  LOGGED_IN: { label: "Sudah Login", variant: "primary" },
  NORMAL: { label: "Sedang Ujian", variant: "success" },
  WARNING: { label: "Peringatan", variant: "warning" },
  NEEDS_REVIEW: { label: "Perlu Diperiksa", variant: "warning" },
  PAUSED: { label: "Dijeda", variant: "purple" },
  LOCKED: { label: "Dikunci", variant: "danger" },
  PENDING_SUPERVISOR_APPROVAL: { label: "Menunggu Persetujuan", variant: "danger" },
  APPROVED_TO_RESUME: { label: "Disetujui Lanjut", variant: "teal" },
  RESUMED: { label: "Dilanjutkan", variant: "teal" },
  SUBMITTED: { label: "Selesai", variant: "primary" },
  TERMINATED: { label: "Dihentikan", variant: "danger" },
  DISCONNECTED: { label: "Terputus", variant: "default" },
};

export function AttemptStatusBadge({ status }: { status: AttemptStatus }) {
  const meta = ATTEMPT_STATUS_META[status] || { label: status, variant: "default" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

const RISK_META: Record<
  RiskLevel,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  LOW: { label: "LOW", variant: "success" },
  MEDIUM: { label: "MEDIUM", variant: "warning" },
  HIGH: { label: "HIGH", variant: "danger" },
  CRITICAL: { label: "CRITICAL", variant: "danger" },
};

export function RiskLevelBadge({ level }: { level: RiskLevel }) {
  const meta = RISK_META[level] || { label: level, variant: "warning" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
