"use client";

// BothPoller — client component for /generating?step=both.
// The single waiting screen for the chained intake flow:
// Anamnesis runs first, then Strategist (dispatched via fetch from inside
// /api/intake/submit's after() callback). The poller polls the aggregated
// /api/onboarding/status endpoint every 10s and redirects to /report when
// both are done.
//
// UI is a 3-step narrative:
//   01 (done):     "You submitted your information"
//   02 (active):   "Two Claude Opus 4.7 agents are working right now"
//                  with sub-state for Anamnesis + Strategist
//   03 (pending):  "Your anamnesis and your opportunity radar, ready to read"

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type RunStatus = "pending" | "running" | "done" | "error";

interface AgentSnapshot {
  status: RunStatus;
  started_at: string;
  elapsed_seconds: number;
  error_code: string | null;
}

interface OnboardingStatus {
  anamnesis: AgentSnapshot | null;
  strategist: AgentSnapshot | null;
}

interface BothPollerProps {
  isAdmin: boolean;
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

type Phase =
  | {
      kind: "waiting";
      total_elapsed: number;
      anamnesisState: "running" | "done";
      strategistState: "pending" | "running";
    }
  | { kind: "done" }
  | { kind: "error"; agent: "anamnesis" | "strategist"; code: string | null };

function computePhase(s: OnboardingStatus): Phase {
  const a = s.anamnesis;
  const st = s.strategist;

  // Errors take precedence so we surface failures fast.
  if (a?.status === "error") {
    return { kind: "error", agent: "anamnesis", code: a.error_code };
  }
  if (st?.status === "error") {
    return { kind: "error", agent: "strategist", code: st.error_code };
  }

  // Both done.
  if (a?.status === "done" && st?.status === "done") {
    return { kind: "done" };
  }

  // Compute total elapsed across both phases. Once anamnesis finishes,
  // its elapsed stops growing (because finished_at is set in the DB),
  // so this gives an honest cumulative timer.
  const aElapsed = a?.elapsed_seconds ?? 0;
  const stElapsed = st?.elapsed_seconds ?? 0;
  const total = aElapsed + stElapsed;

  const anamnesisDone = a?.status === "done";
  const strategistRunning =
    st?.status === "running" || st?.status === "pending";

  return {
    kind: "waiting",
    total_elapsed: total,
    anamnesisState: anamnesisDone ? "done" : "running",
    strategistState: anamnesisDone && strategistRunning ? "running" : "pending",
  };
}

function AdminRetryInline({ agent }: { agent: "anamnesis" | "strategist" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    fetch(`/api/${agent}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    })
      .then(() => {
        router.refresh();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  return (
    <button
      type="button"
      className="btn sm ghost"
      onClick={handleClick}
      disabled={loading}
      style={{ opacity: loading ? 0.5 : 1, marginTop: "1.5rem" }}
    >
      {loading ? "retrying..." : `re-run ${agent}`}
    </button>
  );
}

// ── Timeline subcomponents ──────────────────────────────────────────────

type StepState = "done" | "active" | "pending";

function StepMarker({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          background: "var(--ink)",
          color: "var(--paper)",
          borderRadius: "50%",
          fontSize: "10px",
          lineHeight: 1,
          fontFamily: "var(--mono)",
        }}
      >
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "18px",
          height: "18px",
          background: "var(--accent)",
          borderRadius: "50%",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "var(--accent)",
            opacity: 0.35,
            animation: "pulse 1.6s ease-out infinite",
          }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        width: "18px",
        height: "18px",
        background: "transparent",
        border: "1.5px solid var(--ink-4, rgba(26,26,23,0.25))",
        borderRadius: "50%",
      }}
    />
  );
}

function AgentRow({
  state,
  name,
  description,
}: {
  state: StepState;
  name: string;
  description: string;
}) {
  const colorMap: Record<StepState, string> = {
    done: "var(--ink-3)",
    active: "var(--ink)",
    pending: "var(--ink-4, rgba(26,26,23,0.45))",
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "8px 0",
      }}
    >
      <span style={{ marginTop: "3px", flexShrink: 0 }}>
        <StepMarker state={state} />
      </span>
      <div style={{ minWidth: 0, color: colorMap[state] }}>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: "2px",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}

function StepBlock({
  num,
  state,
  title,
  children,
}: {
  num: string;
  state: StepState;
  title: string;
  children?: React.ReactNode;
}) {
  const titleColor: Record<StepState, string> = {
    done: "var(--ink-3)",
    active: "var(--ink)",
    pending: "var(--ink-4, rgba(26,26,23,0.45))",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr",
        gap: "16px",
        alignItems: "start",
        padding: "12px 0",
      }}
    >
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          letterSpacing: "0.08em",
          color: state === "active" ? "var(--accent)" : "var(--ink-4, rgba(26,26,23,0.4))",
          paddingTop: "2px",
        }}
      >
        {num}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontFamily: "var(--mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: titleColor[state],
            lineHeight: 1.3,
          }}
        >
          <StepMarker state={state} />
          <span>{title}</span>
        </div>
        {children && (
          <div
            style={{
              paddingLeft: "28px",
              borderLeft: state === "active"
                ? "1px solid var(--ink-5, rgba(26,26,23,0.12))"
                : "none",
              marginLeft: "8px",
            }}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────

export default function BothPoller({ isAdmin }: BothPollerProps) {
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<OnboardingStatus | null>(null);
  const [pollErr, setPollErr] = useState(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      if (redirectedRef.current) return;
      try {
        const res = await fetch("/api/onboarding/status");
        if (cancelled) return;
        if (!res.ok) {
          setPollErr(true);
          return;
        }
        const data: unknown = await res.json();
        if (cancelled) return;
        if (data && typeof data === "object") {
          setPollErr(false);
          const next = data as OnboardingStatus;
          setSnapshot(next);
          const phase = computePhase(next);
          if (phase.kind === "done" && !redirectedRef.current) {
            redirectedRef.current = true;
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
            router.push("/report");
          }
        }
      } catch {
        setPollErr(true);
      }
    };

    tick();
    intervalId = setInterval(tick, 10_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !redirectedRef.current) {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  const phase: Phase = snapshot
    ? computePhase(snapshot)
    : {
        kind: "waiting",
        total_elapsed: 0,
        anamnesisState: "running",
        strategistState: "pending",
      };

  // Step 02 sub-state: derived from phase.
  let anamnesisAgent: StepState = "pending";
  let strategistAgent: StepState = "pending";
  let step02State: StepState = "active";
  let step03State: StepState = "pending";
  let totalElapsed = 0;

  if (phase.kind === "waiting") {
    totalElapsed = phase.total_elapsed;
    anamnesisAgent = phase.anamnesisState === "done" ? "done" : "active";
    strategistAgent = phase.strategistState === "running" ? "active" : "pending";
    step02State = "active";
    step03State = "pending";
  } else if (phase.kind === "done") {
    anamnesisAgent = "done";
    strategistAgent = "done";
    step02State = "done";
    step03State = "active";
  } else {
    // error: keep step 02 visually active and reflect WHICH agent failed
    // so the timeline matches reality (without this both rows render as
    // "pending" hollow rings, suggesting neither agent ever started).
    step02State = "active";
    if (phase.agent === "anamnesis") {
      anamnesisAgent = "active";
      strategistAgent = "pending";
    } else {
      // strategist errored: anamnesis must have finished first
      anamnesisAgent = "done";
      strategistAgent = "active";
    }
  }

  const isError = phase.kind === "error";

  let statusLine: string;
  if (phase.kind === "done") {
    statusLine = "READY. REDIRECTING...";
  } else if (phase.kind === "error") {
    statusLine = `ERROR IN ${phase.agent.toUpperCase()}${
      phase.code ? ` · ${phase.code}` : ""
    }`;
  } else {
    const which =
      phase.anamnesisState === "done"
        ? "STRATEGIST RUNNING"
        : "ANAMNESIS RUNNING";
    statusLine = `ELAPSED ${formatElapsed(totalElapsed)} · ${which} · CHECKING EVERY 10s`;
  }

  return (
    <div
      style={{
        padding: "5rem 1rem",
        maxWidth: "720px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.75rem",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "10px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-3)",
        }}
      >
        STEP · 02 / GENERATING
      </div>

      {/* Hero — emphasize the time */}
      <h1
        style={{
          fontFamily: "var(--mono)",
          fontSize: "clamp(28px, 5vw, 44px)",
          fontWeight: 700,
          lineHeight: 1.1,
          margin: 0,
          color: "var(--ink)",
          letterSpacing: "-0.01em",
        }}
      >
        This will take up to 10 minutes.
      </h1>

      <p
        style={{
          fontFamily: "var(--serif)",
          fontSize: "17px",
          lineHeight: 1.55,
          color: "var(--ink-2)",
          margin: 0,
        }}
      >
        You can close this tab. We will email you the moment it is ready.
        Results persist.
      </p>

      {/* Timeline */}
      <div
        style={{
          marginTop: "1rem",
          borderTop: "0.5px solid var(--ink-5, rgba(26,26,23,0.15))",
        }}
      >
        <StepBlock
          num="01"
          state="done"
          title="You submitted your information."
        />
        <div
          style={{
            borderTop: "0.5px solid var(--ink-5, rgba(26,26,23,0.15))",
          }}
        />
        <StepBlock
          num="02"
          state={step02State}
          title="Two Claude Opus 4.7 agents are working right now."
        >
          <AgentRow
            state={anamnesisAgent}
            name="Anamnesis"
            description={
              anamnesisAgent === "done"
                ? "Read your GitHub, your CV, and the moment you described."
                : "Reading your GitHub, your CV, and the moment you described, in depth."
            }
          />
          <AgentRow
            state={strategistAgent}
            name="Strategist"
            description={
              strategistAgent === "active"
                ? "Comparing your trajectory against every opportunity in the catalog."
                : strategistAgent === "done"
                  ? "Compared your trajectory with the catalog and ranked everything."
                  : "Waiting for Anamnesis to finish before it starts."
            }
          />
        </StepBlock>
        <div
          style={{
            borderTop: "0.5px solid var(--ink-5, rgba(26,26,23,0.15))",
          }}
        />
        <StepBlock
          num="03"
          state={step03State}
          title="Your anamnesis and your opportunity radar, ready to read."
        />
        <div
          style={{
            borderTop: "0.5px solid var(--ink-5, rgba(26,26,23,0.15))",
          }}
        />
      </div>

      {/* Error banner */}
      {phase.kind === "error" && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "12px",
            letterSpacing: "0.05em",
            color: "var(--accent)",
            border: "1px solid var(--accent)",
            padding: "10px 14px",
            lineHeight: 1.5,
          }}
        >
          The {phase.agent} agent ended unexpectedly.
          {phase.code && ` Code: ${phase.code}.`}{" "}
          {isAdmin
            ? "Use the button below to try again."
            : "Try again in a few minutes or contact support."}
        </div>
      )}

      {/* Network/poll error (non-fatal) */}
      {pollErr && phase.kind !== "error" && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            color: "var(--ink-3)",
          }}
        >
          No connection to the server right now. Retrying in 10s.
        </div>
      )}

      {/* Status line */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          letterSpacing: "0.07em",
          color: isError ? "var(--accent)" : "var(--ink-3)",
          textTransform: "uppercase",
          paddingTop: "0.5rem",
        }}
      >
        {statusLine}
      </div>

      {isAdmin && phase.kind === "error" && (
        <AdminRetryInline agent={phase.agent} />
      )}
    </div>
  );
}
