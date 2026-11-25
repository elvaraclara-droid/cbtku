/**
 * Load Testing Harness for CBT SMART EXAM (Staged: 50 / 100 / 250 / 500 concurrent virtual students)
 * Usage:
 *   node scripts/load-test.mjs --users=50 --target=http://localhost:3000
 *
 * IMPORTANT: Only run against dedicated staging or local test environments.
 * Requires valid test credentials/tokens configured via environment or --health-only mode.
 */

import crypto from "crypto";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const VIRTUAL_USERS = Number(args.users || 50);
const TARGET_URL = args.target || process.env.LOAD_TEST_TARGET_URL || "http://localhost:3000";
const MODE = args.mode || "health"; // "health" or "full-exam"

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function simulateStudent(vuIndex) {
  const latencies = [];
  let errors = 0;
  let requests = 0;

  async function timedFetch(url, options) {
    const start = performance.now();
    requests++;
    try {
      const res = await fetch(url, options);
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      if (!res.ok) errors++;
      return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
    } catch {
      latencies.push(performance.now() - start);
      errors++;
      return { ok: false, status: 0, data: {} };
    }
  }

  if (MODE === "health") {
    // Baseline concurrency probe against /api/health
    await timedFetch(`${TARGET_URL}/api/health`);
    return { latencies, errors, requests };
  }

  // Realistic CBT Student Lifecycle against configured staging accounts:
  // Student usernames expected: loadtest_stu_1 .. loadtest_stu_N
  const username = `loadtest_stu_${vuIndex + 1}`;
  const password = process.env.LOAD_TEST_STUDENT_PASSWORD || "";
  const token = process.env.LOAD_TEST_TOKEN || "";

  if (!password || !token) {
    throw new Error("LOAD_TEST_STUDENT_PASSWORD and LOAD_TEST_TOKEN are required for full-exam mode.");
  }

  const loginRes = await timedFetch(`${TARGET_URL}/api/auth/student-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, token }),
  });

  if (!loginRes.ok) {
    return { latencies, errors, requests };
  }

  // Simulate 5 autosaves and 1 heartbeat
  const attemptId = loginRes.data.attemptId;
  if (attemptId) {
    for (let q = 1; q <= 5; q++) {
      await timedFetch(`${TARGET_URL}/api/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: crypto.randomUUID(),
          isFlagged: false,
          isAnswered: true,
          answerVersion: q,
          idempotencyKey: `lt-${vuIndex}-${q}-${Date.now()}`,
        }),
      });
    }
    await timedFetch(`${TARGET_URL}/api/attempts/${attemptId}`, { method: "POST" });
  }

  return { latencies, errors, requests };
}

async function main() {
  console.log(`\n=== CBT SMART EXAM Load Test ===`);
  console.log(`Target : ${TARGET_URL}`);
  console.log(`Users  : ${VIRTUAL_USERS}`);
  console.log(`Mode   : ${MODE}\n`);

  const startAll = performance.now();
  const tasks = Array.from({ length: VIRTUAL_USERS }, (_, idx) => simulateStudent(idx));
  const results = await Promise.all(tasks);
  const totalMs = performance.now() - startAll;

  const allLatencies = results.flatMap((r) => r.latencies).sort((a, b) => a - b);
  const totalRequests = results.reduce((s, r) => s + r.requests, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors, 0);

  console.log(`Total Duration : ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`Total Requests : ${totalRequests}`);
  console.log(`Failed Requests: ${totalErrors} (${((totalErrors / Math.max(1, totalRequests)) * 100).toFixed(2)}%)`);
  console.log(`Throughput     : ${(totalRequests / (totalMs / 1000)).toFixed(2)} req/s`);
  console.log(`Latency p50    : ${percentile(allLatencies, 50).toFixed(1)} ms`);
  console.log(`Latency p95    : ${percentile(allLatencies, 95).toFixed(1)} ms`);
  console.log(`Latency p99    : ${percentile(allLatencies, 99).toFixed(1)} ms\n`);
}

main().catch((err) => {
  console.error("Load test aborted:", err.message);
  process.exit(1);
});
