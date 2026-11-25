const SENSITIVE_KEYS = new Set([
  "password",
  "rawtoken",
  "token",
  "secret",
  "service_role_key",
  "apikey",
  "authorization",
]);

export function sanitizeAuditMetadata(
  input: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!input) return {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      result[key] = sanitizeAuditMetadata(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}
