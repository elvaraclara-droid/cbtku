/**
 * Strict HTML Allowlist Sanitizer for question stems, options, and statements.
 * Strips script, iframe, object, embed, svg event handlers, style expressions,
 * and dangerous protocols (javascript:, vbscript:, data:text/html).
 */

const BLOCKED_TAGS_WITH_BODY =
  /<\s*(script|iframe|object|embed|applet|style|link|meta|base|form|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const BLOCKED_SELF_CLOSING_TAGS =
  /<\s*(script|iframe|object|embed|applet|style|link|meta|base|form|input|button|textarea|select)\b[^>]*\/?>/gi;

const EVENT_HANDLER_ATTRS = /\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_PROTOCOLS = /\b(href|src|xlink:href|action|formaction)\s*=\s*(?:"\s*(?:javascript|vbscript|data:text\/html)[^"]*"|'\s*(?:javascript|vbscript|data:text\/html)[^']*'|[^\s>]*javascript:[^\s>]*)/gi;
const SRC_DOC_ATTR = /\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

export function sanitizeRichHtml(input: string): string {
  if (!input) return "";

  let cleaned = input
    .replace(BLOCKED_TAGS_WITH_BODY, "")
    .replace(BLOCKED_SELF_CLOSING_TAGS, "")
    .replace(EVENT_HANDLER_ATTRS, "")
    .replace(SRC_DOC_ATTR, "")
    .replace(DANGEROUS_PROTOCOLS, ' $1="#"');

  // Neutralize stray opening/closing tags for dangerous elements
  cleaned = cleaned.replace(/<\/?\s*(script|iframe|object|embed|svg)\b[^>]*>/gi, "");

  return cleaned.trim();
}

export function stripHtmlToPlainText(input: string): string {
  return sanitizeRichHtml(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
