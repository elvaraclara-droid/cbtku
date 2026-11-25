import { describe, it, expect } from "vitest";
import { evaluateSecurityRisk } from "@/lib/security/risk-engine";

describe("Anti-Cheating Risk Evaluation Policy", () => {
  const defaultConfig = {
    warning_threshold: 2,
    review_threshold: 4,
    auto_pause_threshold: 6,
  };

  it("never auto-terminates or locks on a single technical event", () => {
    const eval1 = evaluateSecurityRisk({
      currentRiskScore: 0,
      currentViolationCount: 0,
      currentStatus: "NORMAL",
      eventType: "TAB_SWITCH",
      config: defaultConfig,
    });
    expect(eval1.newViolationCount).toBe(1);
    expect(eval1.nextStatus).toBeNull();
    expect(eval1.requiresSupervisorApproval).toBe(false);
  });

  it("treats face verification failure as 0 cheating points", () => {
    const evalFace = evaluateSecurityRisk({
      currentRiskScore: 0,
      currentViolationCount: 0,
      currentStatus: "NORMAL",
      eventType: "FACE_CHECK_FAILED",
      config: defaultConfig,
    });
    expect(evalFace.eventPoints).toBe(0);
    expect(evalFace.newViolationCount).toBe(0);
    expect(evalFace.nextStatus).toBeNull();
  });

  it("escalates sequentially to WARNING, NEEDS_REVIEW, and PENDING_SUPERVISOR_APPROVAL", () => {
    const warn = evaluateSecurityRisk({
      currentRiskScore: 2,
      currentViolationCount: 1,
      currentStatus: "NORMAL",
      eventType: "FULLSCREEN_EXIT",
      config: defaultConfig,
    });
    expect(warn.nextStatus).toBe("WARNING");

    const review = evaluateSecurityRisk({
      currentRiskScore: 6,
      currentViolationCount: 3,
      currentStatus: "WARNING",
      eventType: "TAB_SWITCH",
      config: defaultConfig,
    });
    expect(review.nextStatus).toBe("NEEDS_REVIEW");

    const pause = evaluateSecurityRisk({
      currentRiskScore: 10,
      currentViolationCount: 5,
      currentStatus: "NEEDS_REVIEW",
      eventType: "TAB_SWITCH",
      config: defaultConfig,
    });
    expect(pause.nextStatus).toBe("PENDING_SUPERVISOR_APPROVAL");
    expect(pause.requiresSupervisorApproval).toBe(true);
    expect(pause.newRiskLevel).toBe("CRITICAL");
  });
});
