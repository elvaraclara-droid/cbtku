import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";

export interface RateLimitDecision {
  allowed: boolean;
  remainingAttempts: number;
  lockedUntil: string | null;
  retryAfterSeconds: number;
}

const memoryFallback = new Map<
  string,
  { failureCount: number; firstFailedAt: number; lockedUntil: number | null }
>();

export async function checkRateLimit(
  rateKey: string,
  maxFailures = 5,
  windowMinutes = 15,
  lockoutMinutes = 15
): Promise<RateLimitDecision> {
  const now = Date.now();

  if (!isSupabaseAdminConfigured()) {
    const rec = memoryFallback.get(rateKey);
    if (rec?.lockedUntil && rec.lockedUntil > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: new Date(rec.lockedUntil).toISOString(),
        retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
      };
    }
    const count = rec ? rec.failureCount : 0;
    return {
      allowed: true,
      remainingAttempts: Math.max(0, maxFailures - count),
      lockedUntil: null,
      retryAfterSeconds: 0,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("auth_rate_limits")
    .select("failure_count, first_failed_at, locked_until")
    .eq("rate_key", rateKey)
    .maybeSingle();

  if (!data) {
    return {
      allowed: true,
      remainingAttempts: maxFailures,
      lockedUntil: null,
      retryAfterSeconds: 0,
    };
  }

  if (data.locked_until) {
    const lockedUntilMs = new Date(data.locked_until).getTime();
    if (lockedUntilMs > now) {
      return {
        allowed: false,
        remainingAttempts: 0,
        lockedUntil: data.locked_until,
        retryAfterSeconds: Math.ceil((lockedUntilMs - now) / 1000),
      };
    }
  }

  const windowStartMs = now - windowMinutes * 60 * 1000;
  const firstFailedMs = new Date(data.first_failed_at).getTime();
  if (firstFailedMs < windowStartMs) {
    return {
      allowed: true,
      remainingAttempts: maxFailures,
      lockedUntil: null,
      retryAfterSeconds: 0,
    };
  }

  return {
    allowed: data.failure_count < maxFailures,
    remainingAttempts: Math.max(0, maxFailures - data.failure_count),
    lockedUntil: data.locked_until,
    retryAfterSeconds: data.failure_count >= maxFailures ? lockoutMinutes * 60 : 0,
  };
}

export async function recordRateLimitFailure(
  rateKey: string,
  maxFailures = 5,
  windowMinutes = 15,
  lockoutMinutes = 15
): Promise<RateLimitDecision> {
  const now = new Date();
  const nowMs = now.getTime();
  const windowStartMs = nowMs - windowMinutes * 60 * 1000;

  if (!isSupabaseAdminConfigured()) {
    const existing = memoryFallback.get(rateKey);
    let nextCount = 1;
    let firstFailedAt = nowMs;

    if (existing && existing.firstFailedAt >= windowStartMs) {
      nextCount = existing.failureCount + 1;
      firstFailedAt = existing.firstFailedAt;
    }

    // Progressive cooldown: scales gently up to lockoutMinutes
    let lockedUntilMs: number | null = null;
    if (nextCount >= maxFailures) {
      lockedUntilMs = nowMs + lockoutMinutes * 60 * 1000;
    } else if (nextCount >= 3) {
      // Gradual backoff: 10s, 30s
      lockedUntilMs = nowMs + (nextCount === 3 ? 10 : 30) * 1000;
    }

    memoryFallback.set(rateKey, {
      failureCount: nextCount,
      firstFailedAt,
      lockedUntil: lockedUntilMs,
    });

    return {
      allowed: !lockedUntilMs,
      remainingAttempts: Math.max(0, maxFailures - nextCount),
      lockedUntil: lockedUntilMs ? new Date(lockedUntilMs).toISOString() : null,
      retryAfterSeconds: lockedUntilMs ? Math.ceil((lockedUntilMs - nowMs) / 1000) : 0,
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("auth_rate_limits")
    .select("failure_count, first_failed_at")
    .eq("rate_key", rateKey)
    .maybeSingle();

  let nextCount = 1;
  let firstFailedIso = now.toISOString();

  if (existing && new Date(existing.first_failed_at).getTime() >= windowStartMs) {
    nextCount = existing.failure_count + 1;
    firstFailedIso = existing.first_failed_at;
  }

  let lockedUntilIso: string | null = null;
  let retryAfterSeconds = 0;

  if (nextCount >= maxFailures) {
    const lockMs = nowMs + lockoutMinutes * 60 * 1000;
    lockedUntilIso = new Date(lockMs).toISOString();
    retryAfterSeconds = lockoutMinutes * 60;
  } else if (nextCount >= 3) {
    const backoffSeconds = nextCount === 3 ? 10 : 30;
    lockedUntilIso = new Date(nowMs + backoffSeconds * 1000).toISOString();
    retryAfterSeconds = backoffSeconds;
  }

  await admin.from("auth_rate_limits").upsert({
    rate_key: rateKey,
    failure_count: nextCount,
    first_failed_at: firstFailedIso,
    last_failed_at: now.toISOString(),
    locked_until: lockedUntilIso,
    updated_at: now.toISOString(),
  });

  return {
    allowed: nextCount < maxFailures && !lockedUntilIso,
    remainingAttempts: Math.max(0, maxFailures - nextCount),
    lockedUntil: lockedUntilIso,
    retryAfterSeconds,
  };
}

export async function clearRateLimit(rateKey: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    memoryFallback.delete(rateKey);
    return;
  }
  const admin = createSupabaseAdminClient();
  await admin.from("auth_rate_limits").delete().eq("rate_key", rateKey);
}
