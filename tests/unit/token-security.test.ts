import { describe, it, expect } from "vitest";
import {
  generateSecureExamToken,
  hashExamToken,
  maskTokenHint,
  normalizeExamToken,
  validateTokenFormat,
  verifyExamTokenHash,
} from "@/lib/security/token";

describe("Token Security & CSPRNG", () => {
  const pepper = "test-pepper-0123456789abcdef0123456789abcdef";

  it("generates unique non-sequential cryptographic tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const tok = generateSecureExamToken(8);
      expect(tok).toHaveLength(8);
      expect(tok).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
      tokens.add(tok);
    }
    expect(tokens.size).toBe(100);
  });

  it("normalizes and validates manual tokens", () => {
    expect(normalizeExamToken(" ab12-cd34 ")).toBe("AB12CD34");
    expect(validateTokenFormat("ab12-cd34").valid).toBe(true);
    expect(validateTokenFormat("123").valid).toBe(false);
    expect(validateTokenFormat("ABC$123").valid).toBe(false);
  });

  it("hashes and verifies tokens in constant time without exposing plaintext", () => {
    const raw = generateSecureExamToken(8);
    const hashed = hashExamToken(raw, pepper);
    expect(hashed).toHaveLength(64);
    expect(hashed).not.toContain(raw);
    expect(verifyExamTokenHash(raw.toLowerCase(), hashed, pepper)).toBe(true);
    expect(verifyExamTokenHash("WRONGTKN", hashed, pepper)).toBe(false);

    const masked = maskTokenHint(raw);
    expect(masked).toHaveLength(8);
    expect(masked.slice(2, 6)).toBe("****");
  });
});
