import "server-only";
import { getServerEnv } from "@/lib/env";
import type { FaceVerificationStatus } from "@/types/database";

export interface FaceVerificationInput {
  imageBase64: string;
  width: number;
  height: number;
  brightnessScore: number;
  consentAccepted: boolean;
}

export interface FaceVerificationEvaluation {
  status: FaceVerificationStatus;
  provider: string;
  qualityScore: number;
  qualityChecks: {
    resolutionOk: boolean;
    brightnessOk: boolean;
    payloadSizeOk: boolean;
    consentAccepted: boolean;
    externalMatchUsed: boolean;
  };
  note: string;
}

/**
 * Optional Face Verification Evaluator.
 * - Never marks failure as cheating.
 * - Supports external webhook provider if configured in env, otherwise performs
 *   real image quality + payload checks and routes to manual supervisor verification fallback
 *   when biometric matching provider is not connected.
 */
export async function evaluateOptionalFaceCheck(
  input: FaceVerificationInput
): Promise<FaceVerificationEvaluation> {
  const env = getServerEnv();
  const base64Clean = input.imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const approxBytes = Math.floor((base64Clean.length * 3) / 4);

  const resolutionOk = input.width >= 320 && input.height >= 240;
  const brightnessOk = input.brightnessScore >= 35 && input.brightnessScore <= 235;
  const payloadSizeOk = approxBytes >= 4_000 && approxBytes <= 3_500_000;

  let qualityScore = 0;
  if (resolutionOk) qualityScore += 35;
  if (brightnessOk) qualityScore += 35;
  if (payloadSizeOk) qualityScore += 30;

  if (!input.consentAccepted) {
    return {
      status: "failed",
      provider: env.faceVerificationProvider,
      qualityScore,
      qualityChecks: {
        resolutionOk,
        brightnessOk,
        payloadSizeOk,
        consentAccepted: false,
        externalMatchUsed: false,
      },
      note: "Persetujuan pemrosesan foto verifikasi belum diberikan.",
    };
  }

  if (!resolutionOk || !brightnessOk || !payloadSizeOk) {
    return {
      status: "failed",
      provider: env.faceVerificationProvider,
      qualityScore,
      qualityChecks: {
        resolutionOk,
        brightnessOk,
        payloadSizeOk,
        consentAccepted: true,
        externalMatchUsed: false,
      },
      note: !brightnessOk
        ? "Pencahayaan wajah kurang optimal. Silakan ulangi atau minta verifikasi manual Pengawas."
        : "Kualitas resolusi gambar belum memenuhi syarat minimum (320x240).",
    };
  }

  // Optional external verification API integration if configured
  if (env.faceVerificationApiUrl && env.faceVerificationApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(env.faceVerificationApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.faceVerificationApiKey}`,
        },
        body: JSON.stringify({
          image_base64: base64Clean,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const result = (await res.json()) as { verified?: boolean; confidence?: number; message?: string };
        return {
          status: result.verified ? "verified" : "manual_pending",
          provider: env.faceVerificationProvider,
          qualityScore: result.confidence ?? qualityScore,
          qualityChecks: {
            resolutionOk,
            brightnessOk,
            payloadSizeOk,
            consentAccepted: true,
            externalMatchUsed: true,
          },
          note:
            result.message ||
            (result.verified
              ? "Verifikasi wajah terkonfirmasi oleh layanan biometrik."
              : "Perlu konfirmasi manual oleh Pengawas."),
        };
      }
    } catch {
      // Fall back gracefully to manual supervisor review on timeout/network failure
    }
  }

  // Honest fallback: real capture & quality validated, queued for supervisor visual check
  return {
    status: "manual_pending",
    provider: "local_quality_plus_supervisor",
    qualityScore,
    qualityChecks: {
      resolutionOk,
      brightnessOk,
      payloadSizeOk,
      consentAccepted: true,
      externalMatchUsed: false,
    },
    note: "Kualitas foto tervalidasi. Menunggu verifikasi visual Pengawas (atau lanjut sesuai kebijakan ujian).",
  };
}
