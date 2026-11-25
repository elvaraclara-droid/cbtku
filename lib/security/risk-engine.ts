import type { AntiCheatConfig, AttemptStatus, RiskLevel } from "@/types/database";

export type SecurityEventType =
  | "FULLSCREEN_EXIT"
  | "TAB_SWITCH"
  | "WINDOW_BLUR"
  | "COPY_ATTEMPT"
  | "CUT_ATTEMPT"
  | "PASTE_ATTEMPT"
  | "CONTEXT_MENU"
  | "SHORTCUT_DETECTED"
  | "MULTI_SESSION_DETECTED"
  | "DISCONNECTED"
  | "RECONNECTED"
  | "FACE_CHECK_FAILED";

const EVENT_POINTS: Record<SecurityEventType, number> = {
  FULLSCREEN_EXIT: 2,
  TAB_SWITCH: 2,
  WINDOW_BLUR: 1,
  COPY_ATTEMPT: 1,
  CUT_ATTEMPT: 1,
  PASTE_ATTEMPT: 1,
  CONTEXT_MENU: 1,
  SHORTCUT_DETECTED: 1,
  MULTI_SESSION_DETECTED: 4,
  DISCONNECTED: 0,
  RECONNECTED: 0,
  FACE_CHECK_FAILED: 0, // Face failure alone is NOT treated as cheating
};

const EVENT_RISK: Record<SecurityEventType, RiskLevel> = {
  FULLSCREEN_EXIT: "MEDIUM",
  TAB_SWITCH: "MEDIUM",
  WINDOW_BLUR: "LOW",
  COPY_ATTEMPT: "LOW",
  CUT_ATTEMPT: "LOW",
  PASTE_ATTEMPT: "LOW",
  CONTEXT_MENU: "LOW",
  SHORTCUT_DETECTED: "MEDIUM",
  MULTI_SESSION_DETECTED: "HIGH",
  DISCONNECTED: "LOW",
  RECONNECTED: "LOW",
  FACE_CHECK_FAILED: "LOW",
};

export interface RiskEvaluationResult {
  eventRiskLevel: RiskLevel;
  eventPoints: number;
  newRiskScore: number;
  newViolationCount: number;
  newRiskLevel: RiskLevel;
  nextStatus: AttemptStatus | null;
  requiresSupervisorApproval: boolean;
}

/**
 * Evaluates cumulative risk indicators.
 * IMPORTANT POLICY:
 * - A single technical event NEVER auto-terminates or condemns a student.
 * - Escalation follows admin-configured thresholds and relies on human supervisor review.
 */
export function evaluateSecurityRisk(params: {
  currentRiskScore: number;
  currentViolationCount: number;
  currentStatus: AttemptStatus;
  eventType: SecurityEventType;
  config: Partial<AntiCheatConfig>;
}): RiskEvaluationResult {
  const {
    currentRiskScore,
    currentViolationCount,
    currentStatus,
    eventType,
    config,
  } = params;

  const warningThreshold = config.warning_threshold ?? 2;
  const reviewThreshold = config.review_threshold ?? 4;
  const autoPauseThreshold = config.auto_pause_threshold ?? 6;

  const eventPoints = EVENT_POINTS[eventType] ?? 1;
  const eventRiskLevel = EVENT_RISK[eventType] ?? "LOW";

  const isViolation = eventPoints > 0;
  const newRiskScore = currentRiskScore + eventPoints;
  const newViolationCount = isViolation
    ? currentViolationCount + 1
    : currentViolationCount;

  let newRiskLevel: RiskLevel = "LOW";
  if (autoPauseThreshold > 0 && newViolationCount >= autoPauseThreshold) {
    newRiskLevel = "CRITICAL";
  } else if (newViolationCount >= reviewThreshold || eventType === "MULTI_SESSION_DETECTED") {
    newRiskLevel = "HIGH";
  } else if (newViolationCount >= warningThreshold) {
    newRiskLevel = "MEDIUM";
  }

  // Do not overwrite terminal or already paused/locked states
  const protectedStates: AttemptStatus[] = [
    "PAUSED",
    "LOCKED",
    "PENDING_SUPERVISOR_APPROVAL",
    "SUBMITTED",
    "TERMINATED",
  ];

  let nextStatus: AttemptStatus | null = null;
  let requiresSupervisorApproval = false;

  if (!protectedStates.includes(currentStatus) && isViolation) {
    if (autoPauseThreshold > 0 && newViolationCount >= autoPauseThreshold) {
      nextStatus = "PENDING_SUPERVISOR_APPROVAL";
      requiresSupervisorApproval = true;
    } else if (newViolationCount >= reviewThreshold) {
      nextStatus = "NEEDS_REVIEW";
    } else if (newViolationCount >= warningThreshold) {
      nextStatus = "WARNING";
    }
  }

  return {
    eventRiskLevel,
    eventPoints,
    newRiskScore,
    newViolationCount,
    newRiskLevel,
    nextStatus,
    requiresSupervisorApproval,
  };
}
