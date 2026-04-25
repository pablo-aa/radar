"use client";

// Fires markReportSeen() once when the report screen mounts.
// Keeps the long-read page a server component.
//
// Side-effect: markReportSeen also flips onboard_state.radar_nudged=true
// so the appbar's "02 Radar" nav item shows a small accent dot. We call
// router.refresh() once the action resolves so the dot appears without
// requiring a navigation; the user is reading and may sit on /report for
// a while, and we want them to notice the nudge.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markReportSeen } from "@/lib/actions";

export default function MarkReportSeen() {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    markReportSeen()
      .then(() => {
        router.refresh();
      })
      .catch((err: unknown) => {
        console.error("[MarkReportSeen] failed", err);
      });
  }, [router]);
  return null;
}
