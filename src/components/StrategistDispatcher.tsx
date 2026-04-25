"use client";

// StrategistDispatcher — rendered by /generating when step=strategist but no run row
// exists yet. POSTs /api/strategist/run once on mount (ref-guarded against strict-mode
// double-invocation), then replaces the URL with the new run_id so RunPoller takes over.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function StrategistDispatcher() {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    fetch("/api/strategist/run", { method: "POST" })
      .then(async (res) => {
        // 202: new running row created.
        // 200: done-guard returned a cached completed run; navigate to /radar.
        // 409: a running row already exists for this user; pick up its run_id.
        // Anything else: refresh and let the server component recover.
        const data: unknown = await res.json().catch(() => null);
        const runId =
          data && typeof data === "object" && "run_id" in data &&
          typeof (data as { run_id: unknown }).run_id === "string"
            ? (data as { run_id: string }).run_id
            : null;

        if (res.status === 200) {
          // Cached done; the right destination is /radar, not /generating.
          router.replace("/radar");
          return;
        }
        if ((res.status === 202 || res.status === 409) && runId) {
          router.replace(
            "/generating?step=strategist&run_id=" + encodeURIComponent(runId),
          );
          return;
        }
        router.refresh();
      })
      .catch(() => {
        router.refresh();
      });
  }, [router]);

  return (
    <div
      style={{
        padding: "5rem 1rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          color: "var(--ink-3)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "1.5rem",
        }}
      >
        Strategist · starting
      </div>
      <h2
        style={{
          fontFamily: "var(--mono)",
          fontSize: "28px",
          fontWeight: 700,
          lineHeight: 1.2,
          margin: "0 auto",
          maxWidth: "640px",
        }}
      >
        Reading your profile, ranking the catalog.
        <span
          style={{
            display: "inline-block",
            width: ".45em",
            height: ".75em",
            background: "var(--accent)",
            marginLeft: ".08em",
            verticalAlign: "-.05em",
            animation: "blink 1.05s steps(1) infinite",
          }}
        />
      </h2>
      <p
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          color: "var(--ink-3)",
          marginTop: "2rem",
        }}
      >
        About 2 to 3 minutes. You can close this tab, results persist.
      </p>
    </div>
  );
}
