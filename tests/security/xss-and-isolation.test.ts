import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { sanitizeRichHtml } from "@/lib/security/html-sanitizer";
import { sanitizeAuditMetadata } from "@/lib/security/audit-sanitizer";

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) results.push(full);
  }
  return results;
}

describe("Security Controls: XSS, Secret Isolation & Answer Key Protection", () => {
  it("strips dangerous XSS payloads while keeping safe question HTML", () => {
    const payload =
      '<p>Hitung hasil:</p><script>alert(1)</script><img src="x" onerror="fetch(\'evil\')" /><a href="javascript:alert(2)">link</a><table><tr><th>A</th></tr><tr><td>1</td></tr></table>';
    const sanitized = sanitizeRichHtml(payload);
    expect(sanitized).not.toContain("<script");
    expect(sanitized).not.toContain("onerror");
    expect(sanitized).not.toContain("javascript:");
    expect(sanitized).toContain("<p>Hitung hasil:</p>");
    expect(sanitized).toContain("<table>");
  });

  it("redacts sensitive keys in audit metadata", () => {
    const cleaned = sanitizeAuditMetadata({
      username: "siswa1",
      password: "secret-password",
      rawToken: "AB12CD34",
      nested: { service_role_key: "eyJ..." },
    });
    expect(cleaned.username).toBe("siswa1");
    expect(cleaned.password).toBe("[REDACTED]");
    expect(cleaned.rawToken).toBe("[REDACTED]");
    expect((cleaned.nested as Record<string, unknown>).service_role_key).toBe("[REDACTED]");
  });

  it("never exposes SUPABASE_SERVICE_ROLE_KEY or admin client in browser components", () => {
    const root = process.cwd();
    const clientDirs = [
      path.join(root, "components"),
      path.join(root, "hooks"),
      path.join(root, "app", "exam"),
      path.join(root, "app", "(auth)"),
    ];
    for (const dir of clientDirs) {
      for (const file of walkFiles(dir)) {
        const content = fs.readFileSync(file, "utf8");
        expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(content).not.toContain("lib/supabase/admin");
        expect(content).not.toContain("is_correct");
      }
    }
  });

  it("ensures student question payload service never queries answer key columns", () => {
    const serviceFile = path.join(process.cwd(), "services", "exam-attempt.service.ts");
    const content = fs.readFileSync(serviceFile, "utf8");
    const fnStart = content.indexOf("getSanitizedExamPayload");
    const fnEnd = content.indexOf("export async function submitStudentAttempt");
    const fnSection = content
      .slice(fnStart, fnEnd)
      .replace(/\/\/.*$/gm, "");
    expect(fnSection).not.toContain("is_correct");
    expect(fnSection).not.toContain("is_true");
    expect(fnSection).not.toContain("explanation_html");
  });
});
