import crypto from "crypto";

// Unambiguous uppercase alphanumeric set (omits 0, O, 1, I, L)
const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a cryptographically secure random exam token using rejection sampling
 * to guarantee uniform distribution without modulo bias.
 */
export function generateSecureExamToken(length = 8): string {
  if (length < 6 || length > 16) {
    throw new Error("Panjang token harus antara 6 hingga 16 karakter.");
  }

  const chars: string[] = [];
  const maxValidByte = Math.floor(256 / TOKEN_ALPHABET.length) * TOKEN_ALPHABET.length;

  while (chars.length < length) {
    const randomBuffer = crypto.randomBytes(length * 2);
    for (let i = 0; i < randomBuffer.length && chars.length < length; i++) {
      const byte = randomBuffer[i];
      if (byte < maxValidByte) {
        chars.push(TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]);
      }
    }
  }

  return chars.join("");
}

/**
 * Normalizes a user-entered token (uppercase, removes spaces and hyphens).
 */
export function normalizeExamToken(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * Validates manual or submitted token format.
 */
export function validateTokenFormat(rawInput: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = normalizeExamToken(rawInput);
  if (normalized.length < 6 || normalized.length > 16) {
    return {
      valid: false,
      normalized,
      error: "Token ujian harus terdiri dari 6–16 karakter alfanumerik.",
    };
  }
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: "Token ujian hanya boleh mengandung huruf dan angka.",
    };
  }
  return { valid: true, normalized };
}

/**
 * Produces an HMAC-SHA256 hex digest of the normalized token.
 * Only the hash is stored in the database and compared on the server.
 */
export function hashExamToken(rawToken: string, pepper: string): string {
  const normalized = normalizeExamToken(rawToken);
  return crypto
    .createHmac("sha256", pepper)
    .update(`cbt-token:${normalized}`)
    .digest("hex");
}

/**
 * Constant-time hash comparison to prevent timing side-channels.
 */
export function verifyExamTokenHash(
  rawToken: string,
  expectedHash: string,
  pepper: string
): boolean {
  const actualHash = hashExamToken(rawToken, pepper);
  const actualBuf = Buffer.from(actualHash, "hex");
  const expectedBuf = Buffer.from(expectedHash, "hex");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Returns a masked hint for UI tables (e.g. AB••••9F) without exposing plaintext.
 */
export function maskTokenHint(rawToken: string): string {
  const normalized = normalizeExamToken(rawToken);
  if (normalized.length <= 4) {
    return "*".repeat(normalized.length);
  }
  return `${normalized.slice(0, 2)}${"*".repeat(normalized.length - 4)}${normalized.slice(-2)}`;
}
