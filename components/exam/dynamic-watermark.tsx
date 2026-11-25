"use client";

import React from "react";

export function DynamicWatermark({
  studentName,
  nis,
  examTitle,
  sessionName,
}: {
  studentName: string;
  nis: string;
  examTitle: string;
  sessionName: string;
}) {
  const label = `${studentName} (${nis}) • ${examTitle} • ${sessionName}`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-10 overflow-hidden select-none opacity-[0.045]"
    >
      <div className="grid h-[150%] w-[150%] -translate-x-12 -translate-y-12 -rotate-24 grid-cols-3 gap-16">
        {Array.from({ length: 18 }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center justify-center text-center text-xs font-bold tracking-wider text-slate-900 uppercase"
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
