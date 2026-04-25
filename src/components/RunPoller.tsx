"use client";

// RunPoller — client component for the /generating page.
// Polls the relevant status endpoint every 10s and redirects when done.
// Pauses polling when the tab is hidden; resumes on visibility.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Step = "anamnesis" | "strategist";
type RunStatus = "pending" | "running" | "done" | "error";

interface RunPollerProps {
  step: Step;
  runId: string;
  startedAt: string;
  initialStatus: RunStatus;
  isAdmin: boolean;
}

// Progress signal per step, keyed by elapsed seconds threshold.
const ANAMNESIS_SIGNALS: { threshold: number; label: string }[] = [
  { threshold: 120, label: "Quase la..." },
  { threshold: 60, label: "Compondo seu retrato..." },
  { threshold: 30, label: "Lendo seu CV..." },
  { threshold: 0, label: "Conectando ao GitHub..." },
];

const STRATEGIST_SIGNALS: { threshold: number; label: string }[] = [
  { threshold: 180, label: "Finalizando..." },
  { threshold: 90, label: "Escrevendo o why-you de cada card..." },
  { threshold: 30, label: "Ranking do catalogo..." },
  { threshold: 0, label: "Lendo seu perfil..." },
];

function progressSignal(step: Step, elapsed: number): string {
  const signals = step === "anamnesis" ? ANAMNESIS_SIGNALS : STRATEGIST_SIGNALS;
  for (const s of signals) {
    if (elapsed >= s.threshold) return s.label;
  }
  return signals[signals.length - 1].label;
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function AdminRerunInline({ step }: { step: Step }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    fetch(`/api/${step}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        // Navigate with the new run_id so the page polls the fresh row
        // instead of finding the old completed/errored row via refresh.
        const data: unknown = await res.json().catch(() => null);
        if (data && typeof data === "object" && "run_id" in data) {
          const newRunId = (data as { run_id: unknown }).run_id;
          if (typeof newRunId === "string" && newRunId.length > 0) {
            router.push(`/generating?step=${step}&run_id=${encodeURIComponent(newRunId)}`);
            return;
          }
        }
        // Fallback: drop run_id and let server pick the latest.
        router.push(`/generating?step=${step}`);
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
      {loading ? "reenviando..." : `re-run ${step}`}
    </button>
  );
}

export default function RunPoller({
  step,
  runId,
  startedAt,
  initialStatus,
  isAdmin,
}: RunPollerProps) {
  const router = useRouter();

  // Elapsed seconds: seed from server (difference between now and startedAt).
  // Use the initializer form of useState so Date.now() runs once, not on every render.
  const [elapsed, setElapsed] = useState<number>(() =>
    Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
  );
  const [status, setStatus] = useState<RunStatus>(initialStatus);
  const [hasError, setHasError] = useState(initialStatus === "error");

  // Track actual error code for display.
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Detect soft/hard timeout messages.
  const softWarning = elapsed >= 300 && status === "running"; // 5 min
  const hardWarning = elapsed >= 600 && status === "running"; // 10 min

  // Local elapsed ticker (corrected each tick by server response).
  useEffect(() => {
    // Both "pending" (inserted but agent not yet picked up) and "running"
    // (drain in flight) are "in progress" from the user's POV.
    if (status !== "running" && status !== "pending") return;
    const id = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  // Polling effect.
  useEffect(() => {
    // Both "pending" (inserted but agent not yet picked up) and "running"
    // (drain in flight) are "in progress" from the user's POV.
    if (status !== "running" && status !== "pending") return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(
          `/api/${step}/status?run_id=${encodeURIComponent(runId)}`,
        );
        if (cancelled) return;
        if (!res.ok) return;
        const data: unknown = await res.json();
        // Re-check after the second await: user may have unmounted in the
        // ~50ms window between fetch resolve and json parse.
        if (cancelled) return;
        if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;

          // Correct elapsed from server.
          if (typeof d.elapsed_seconds === "number") {
            setElapsed(d.elapsed_seconds);
          }

          if (typeof d.status === "string") {
            const nextStatus = d.status as RunStatus;
            setStatus(nextStatus);
            if (nextStatus === "done") {
              // Brief state update, then redirect.
              router.push(step === "anamnesis" ? "/report" : "/radar");
            } else if (nextStatus === "error") {
              setHasError(true);
              if (typeof d.error_code === "string") {
                setErrorCode(d.error_code);
              }
            }
          }
        }
      } catch {
        // Ignore network errors; retry on next tick.
      }
    };

    tick(); // Immediate first check.
    intervalId = setInterval(tick, 10_000);

    // Pause/resume on visibility change.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [step, runId, router, status]);

  // Status line at the bottom.
  let statusLine: string;
  if (status === "done") {
    statusLine = `ELAPSED ${formatElapsed(elapsed)} · DONE · REDIRECIONANDO...`;
  } else if (hasError) {
    statusLine = `ELAPSED ${formatElapsed(elapsed)} · ERRO${errorCode ? ` · ${errorCode}` : ""}`;
  } else {
    statusLine = `ELAPSED ${formatElapsed(elapsed)} · VERIFICANDO A CADA 10s`;
  }

  const signal = progressSignal(step, elapsed);

  const heroText =
    step === "anamnesis" ? "Lendo seu trabalho." : "Pesando sua trajetoria.";

  const bodyText =
    step === "anamnesis"
      ? "Claude Opus 4.7 esta lendo seu GitHub, seu CV, e o momento que voce descreveu. Isso geralmente toma 1 a 2 minutos."
      : "Claude Opus 4.7 esta pesando sua trajetoria contra cada oportunidade no catalogo. One pass. Output e um plano de 90 dias e um fit score baseado no seu trabalho.";

  const timeEstimate =
    step === "anamnesis" ? "Cerca de 1 a 2 minutos." : "Cerca de 2 a 3 minutos.";

  const eyebrow = step === "anamnesis" ? "ANAMNESIS" : "STRATEGIST";

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
        {eyebrow} · RODANDO
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
        {heroText}
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
        {bodyText}
      </p>

      {/* Error banner */}
      {hasError && (
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
          ERRO: O agente encerrou de forma inesperada.
          {errorCode && ` Codigo: ${errorCode}.`} Tente novamente ou contate o
          suporte.
        </div>
      )}

      {/* Soft/hard timeout messages */}
      {!hasError && hardWarning && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            color: "var(--ink-3)",
          }}
        >
          Isso esta demorando mais que o esperado. O agente ainda esta rodando.
        </div>
      )}
      {!hasError && !hardWarning && softWarning && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "11px",
            letterSpacing: "0.05em",
            color: "var(--ink-3)",
          }}
        >
          Ainda trabalhando, isso pode demorar um pouco mais que o usual.
        </div>
      )}

      {/* Time estimate + persistence note */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          letterSpacing: "0.05em",
          color: "var(--ink-3)",
          lineHeight: 1.7,
        }}
      >
        {timeEstimate}
        <br />
        Voce pode fechar esta aba,
        <br />
        os resultados persistem.
      </div>

      {/* Progress signal */}
      {!hasError && (
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "11px",
            letterSpacing: "0.06em",
            color: "var(--ink-4)",
            textTransform: "uppercase",
          }}
        >
          {signal}
        </div>
      )}

      {/* Live status line */}
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: "11px",
          letterSpacing: "0.07em",
          color: hasError ? "var(--accent)" : "var(--ink-3)",
          textTransform: "uppercase",
          borderTop: "0.5px solid var(--ink-5, rgba(26,26,23,0.15))",
          paddingTop: "1rem",
          marginTop: "0.5rem",
        }}
      >
        {statusLine}
      </div>

      {/* Admin rerun */}
      {isAdmin && (hasError || hardWarning) && (
        <AdminRerunInline step={step} />
      )}
    </div>
  );
}
