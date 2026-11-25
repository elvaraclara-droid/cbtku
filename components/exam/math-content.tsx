"use client";

import React, { useMemo } from "react";
import katex from "katex";
import { sanitizeRichHtml } from "@/lib/security/html-sanitizer";
import { cn } from "@/lib/utils";

function renderMathInlineAndBlock(html: string): string {
  const safeHtml = sanitizeRichHtml(html);

  // Render block math $$...$$ first
  const withBlockMath = safeHtml.replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr) => {
    try {
      return katex.renderToString(expr.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return expr;
    }
  });

  // Render inline math $...$
  return withBlockMath.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_match, expr) => {
    try {
      return katex.renderToString(expr.trim(), {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return expr;
    }
  });
}

export function MathRichContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const renderedHtml = useMemo(() => renderMathInlineAndBlock(html), [html]);

  return (
    <div
      className={cn("cbt-rich-content prose-sm max-w-none leading-relaxed text-slate-800", className)}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
