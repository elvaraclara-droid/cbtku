"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import type { AntiCheatConfig, AttemptStatus, RiskLevel } from "@/types/database";

export function useExamProctoring(params: {
  attemptId: string;
  enabled: boolean;
  config: Partial<AntiCheatConfig>;
  onServerStatusUpdate: (status: AttemptStatus, riskLevel?: RiskLevel) => void;
}) {
  const { attemptId, enabled, config, onServerStatusUpdate } = params;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const tabLeftAtRef = useRef<number | null>(null);

  const reportEvent = useCallback(
    async (
      eventType:
        | "FULLSCREEN_EXIT"
        | "TAB_SWITCH"
        | "WINDOW_BLUR"
        | "COPY_ATTEMPT"
        | "CUT_ATTEMPT"
        | "PASTE_ATTEMPT"
        | "CONTEXT_MENU"
        | "SHORTCUT_DETECTED"
        | "DISCONNECTED"
        | "RECONNECTED",
      durationSeconds = 0,
      metadata?: Record<string, unknown>
    ) => {
      if (!enabled || !attemptId) return;
      try {
        const res = await fetch(`/api/attempts/${attemptId}/security-events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType, durationSeconds, metadata }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.attemptStatus) {
            onServerStatusUpdate(data.attemptStatus, data.riskLevel);
          }
          if (data.requiresSupervisorApproval) {
            setWarningBanner(
              "Aktivitas terdeteksi melewati ambang batas. Ujian dijeda sementara menunggu persetujuan Pengawas."
            );
          }
        }
      } catch {
        // Offline events will not crash the exam UI
      }
    },
    [attemptId, enabled, onServerStatusUpdate]
  );

  const enterFullscreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser may block fullscreen if not triggered by direct gesture
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active && config.require_fullscreen !== false) {
        setWarningBanner(
          "Anda keluar dari mode layar penuh. Kejadian ini tercatat untuk pemeriksaan Pengawas."
        );
        toast.warning("Keluar dari layar penuh tercatat.");
        reportEvent("FULLSCREEN_EXIT");
      }
    };

    const handleVisibilityChange = () => {
      if (config.detect_tab_switch === false) return;
      if (document.hidden) {
        tabLeftAtRef.current = Date.now();
      } else if (tabLeftAtRef.current) {
        const awaySec = Math.max(
          1,
          Math.round((Date.now() - tabLeftAtRef.current) / 1000)
        );
        tabLeftAtRef.current = null;
        setWarningBanner(
          `Perpindahan tab terdeteksi (${awaySec} detik). Mohon tetap berada di halaman ujian.`
        );
        reportEvent("TAB_SWITCH", awaySec);
      }
    };

    const handleWindowBlur = () => {
      if (config.detect_tab_switch === false) return;
      if (!tabLeftAtRef.current) {
        tabLeftAtRef.current = Date.now();
      }
    };

    const handleWindowFocus = () => {
      if (tabLeftAtRef.current && !document.hidden) {
        const awaySec = Math.max(
          1,
          Math.round((Date.now() - tabLeftAtRef.current) / 1000)
        );
        tabLeftAtRef.current = null;
        if (awaySec >= 2) {
          reportEvent("WINDOW_BLUR", awaySec);
        }
      }
    };

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return tag === "textarea" || tag === "input" || target.isContentEditable;
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (config.block_copy_paste === false) return;
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        toast.warning("Salin teks soal dinonaktifkan selama ujian.");
        reportEvent("COPY_ATTEMPT");
      }
    };

    const handleCut = (e: ClipboardEvent) => {
      if (config.block_copy_paste === false) return;
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        reportEvent("CUT_ATTEMPT");
      }
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (config.block_copy_paste === false) return;
      e.preventDefault();
      toast.warning("Tempel teks dari luar tidak diizinkan.");
      reportEvent("PASTE_ATTEMPT");
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (config.block_copy_paste === false) return;
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
        reportEvent("CONTEXT_MENU");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (config.detect_shortcuts === false) return;
      const key = e.key.toLowerCase();
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;

      if (
        e.key === "F12" ||
        (isCtrlOrMeta && e.shiftKey && ["i", "j", "c"].includes(key)) ||
        (isCtrlOrMeta && ["p", "u"].includes(key))
      ) {
        e.preventDefault();
        reportEvent("SHORTCUT_DETECTED", 0, {
          key: e.key,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
        });
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, config, reportEvent]);

  return {
    isFullscreen,
    enterFullscreen,
    warningBanner,
    dismissWarning: () => setWarningBanner(null),
    reportEvent,
  };
}
