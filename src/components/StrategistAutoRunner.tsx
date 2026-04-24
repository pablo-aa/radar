"use client";

// StrategistAutoRunner — mounts invisibly, POSTs /api/strategist/run once,
// then refreshes the router so the server component re-reads the DB.
//
// Mount only when state is "fresh" or "stale" (never on "error" or "ready")
// to avoid loops. React strict mode double-invokes effects in development;
// the ref guard ensures a single real request per mount.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function StrategistAutoRunner() {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    fetch("/api/strategist/run", { method: "POST" })
      .then((res) => {
        // 200 = done (new or cached); refresh to pick up the result.
        // 409 = already running; unmount quietly (parent won't re-mount for running state).
        if (res.ok) {
          router.refresh();
        }
        // Any other status (500, etc.) is silently swallowed here; the server
        // will have written an error row which the next page render will show.
      })
      .catch(() => {
        // Network failure: ignore; user can reload manually.
      });
  }, [router]);

  return null;
}
