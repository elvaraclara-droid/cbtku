import * as React from "react";
import { cn } from "@/lib/utils";

const BADGE_VARIANTS = {
  default: "bg-slate-100 text-slate-700 border-slate-200",
  primary: "bg-blue-50 text-blue-800 border-blue-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-700 border-rose-200",
  purple: "bg-purple-50 text-purple-800 border-purple-200",
  teal: "bg-teal-50 text-teal-800 border-teal-200",
};

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof BADGE_VARIANTS;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
