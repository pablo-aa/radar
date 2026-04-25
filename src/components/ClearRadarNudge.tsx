"use client";

// Fires markRadarVisited() once when /radar mounts, clearing the
// onboard_state.radar_nudged dot indicator on the appbar nav.
// Mirrors the MarkReportSeen pattern so /radar can stay a server component.

import { useEffect, useRef } from "react";
import { markRadarVisited } from "@/lib/actions";

export default function ClearRadarNudge() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    markRadarVisited().catch((err: unknown) => {
      console.error("[ClearRadarNudge] failed", err);
    });
  }, []);
  return null;
}
