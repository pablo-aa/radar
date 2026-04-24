"use client";

// Fires markReportSeen() once when the report screen mounts.
// Keeps the long-read page a server component.

import { useEffect, useRef } from "react";
import { markReportSeen } from "@/lib/actions";

export default function MarkReportSeen() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Fire and forget. Failures are non-fatal; the reader can still read.
    markReportSeen().catch((err: unknown) => {
      console.error("[MarkReportSeen] failed", err);
    });
  }, []);
  return null;
}
