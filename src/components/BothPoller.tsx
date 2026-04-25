"use client";

// BothPoller — client component for /generating?step=both.
// The single waiting screen for the chained intake flow:
// Anamnesis runs first, then Strategist (dispatched via fetch from inside
// /api/intake/submit's after() callback). The poller polls the aggregated
// /api/onboarding/status endpoint every 10s and redirects to /report when
// both are done.
//
// Phases shown to the user:
//   1. anamnesis running (or pending)            -> "Lendo seu trabalho"
//   2. anamnesis done, strategist null/running   -> "Comparando com o catalogo"
//   3. both done                                  -> redirect to /report
//   anamnesis error                              -> error UI + admin re-run
//   strategist error                             -> error UI + admin re-run

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
  | { kind: "waiting"; total_elapsed: number; phase_label: string }
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

  // Phase 2: anamnesis done, strategist null/pending/running.
  if (a?.status === "done") {
    return {
      kind: "waiting",
      total_elapsed: total,
      phase_label: "Comparando com o catalogo",
    };
  }

  // Phase 1: anamnesis null/pending/running.
  return {
    kind: "waiting",
    total_elapsed: total,
    phase_label: "Lendo seu trabalho",
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
        // Stay on /generating; let the poller pick up the new running row
        // (it polls latest, no run_id needed).
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
      {loading ? "reenviando..." : `re-run ${agent}`}
    </button>
  );
}

export default function BothPoller({ isAdmin }: BothPollerProps) {
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<OnboardingStatus | null>(null);
  const [pollErr, setPollErr] = useState(false);
  // Guard: ensure router.push("/report") fires exactly once even if a poll
  // tick races with the visibility-change handler.
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

  // Initial render before first poll resolves: show the same scaffold so
  // there is no layout flash. The first tick fires immediately on mount.
  const phase: Phase = snapshot
    ? computePhase(snapshot)
    : { kind: "waiting", total_elapsed: 0, phase_label: "Iniciando" };

  const isError = phase.kind === "error";

  let statusLine: string;
  if (phase.kind === "done") {
    statusLine = "PRONTO. REDIRECIONANDO...";
  } else if (phase.kind === "error") {
    statusLine = `ERRO NO ${phase.agent.toUpperCase()}${
      phase.code ? ` · ${phase.code}` : ""
    }`;
  } else {
    statusLine = `ELAPSED ${formatElapsed(phase.total_elapsed)} · ${phase.phase_label.toUpperCase()} · VERIFICANDO A CADA 10s`;
  }

  return (
    <div
      style={{
        padding: "5rem 1rem",
        maxWidth: "680px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
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
        ETAPA · 02 / GENERATING
      </div>

      {/* Hero */}
      <h1
        style={{
          fontFamily: "var(--mono)",
          fontSize: "clamp(22px, 4vw, 32px)",
          fontWeight: 700,
          lineHeight: 1.15,
          margin: 0,
          color: "var(--ink)",
        }}
      >
        Preparando seu radar.
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
          aria-hidden="true"
        />
      </h1>

      {/* Body */}
      <p
        style={{
          fontFamily: "var(--serif)",
          fontSize: "16px",
          lineHeight: 1.55,
          color: "var(--ink-2)",
          margin: 0,
        }}
      >
        Claude Opus 4.7 esta lendo seu GitHub, seu CV, o momento que voce
        descreveu, e em seguida pesando sua trajetoria contra cada
        oportunidade do catalogo. Sao dois agentes em sequencia.
      </p>

      {/* Time + persistence note */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          letterSpacing: "0.05em",
          color: "var(--ink-3)",
          lineHeight: 1.7,
        }}
      >
        Isso pode levar ate 10 minutos.
        <br />
        Voce pode fechar esta aba, os resultados persistem.
        <br />
        Te avisamos por email quando estiver pronto.
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
          O agente {phase.agent} encerrou de forma inesperada.
          {phase.code && ` Codigo: ${phase.code}.`}{" "}
          {isAdmin
            ? "Use o botao abaixo para tentar de novo."
            : "Tente novamente em alguns minutos ou contate o suporte."}
        </div>
      )}

      {/* Network/poll error (non-fatal: keeps trying) */}
      {pollErr && phase.kind !== "error" && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            color: "var(--ink-3)",
          }}
        >
          Sem conexao com o servidor agora. Tentando de novo em 10s.
        </div>
      )}

      {/* Live status line */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          letterSpacing: "0.07em",
          color: isError ? "var(--accent)" : "var(--ink-3)",
          textTransform: "uppercase",
          borderTop: "0.5px solid var(--ink-5, rgba(26,26,23,0.15))",
          paddingTop: "1rem",
          marginTop: "0.5rem",
        }}
      >
        {statusLine}
      </div>

      {/* Admin retry */}
      {isAdmin && phase.kind === "error" && (
        <AdminRetryInline agent={phase.agent} />
      )}
    </div>
  );
}
