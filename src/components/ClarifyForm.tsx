"use client";

// Renders the AI-generated clarification questions and POSTs the answers.
// On mount: GETs /api/intake/clarify-questions (cached server-side after
// first run, so reloads are instant). Submitting POSTs the answers and
// navigates to /generating?step=both, which polls the chained Anamnesis ->
// Strategist flow that the answers endpoint just kicked off.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Question = {
  id: string;
  question: string;
  context: string;
  placeholder: string;
  kind: "short" | "long";
};

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; questions: Question[] }
  | { kind: "error"; message: string };

const ANSWER_MAX_CHARS = 600;

function isQuestion(v: unknown): v is Question {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.question === "string" &&
    typeof o.context === "string" &&
    typeof o.placeholder === "string" &&
    (o.kind === "short" || o.kind === "long")
  );
}

export default function ClarifyForm({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string>("");
  const [regenerating, setRegenerating] = useState(false);

  const loadQuestions = async (regenerate: boolean) => {
    if (regenerate) {
      setRegenerating(true);
    }
    try {
      const url = regenerate
        ? "/api/intake/clarify-questions?regenerate=1"
        : "/api/intake/clarify-questions";
      const res = await fetch(url, { method: "GET" });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data === "object" && "message" in data
            ? String((data as Record<string, unknown>).message)
            : "Falha ao gerar as perguntas. Tente novamente.";
        setState({ kind: "error", message });
        return;
      }
      const raw =
        data && typeof data === "object" && "questions" in data
          ? (data as Record<string, unknown>).questions
          : null;
      if (!Array.isArray(raw)) {
        setState({ kind: "error", message: "Resposta invalida do servidor." });
        return;
      }
      const questions = raw.filter(isQuestion);
      if (questions.length === 0) {
        setState({
          kind: "error",
          message: "A IA nao conseguiu propor perguntas grounded; tente regenerar.",
        });
        return;
      }
      if (regenerate) {
        setAnswers({});
      }
      setState({ kind: "ready", questions });
    } catch {
      setState({ kind: "error", message: "Erro de rede. Tente novamente." });
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void loadQuestions(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (skipped: boolean) => {
    setSubmitting(true);
    setSubmitErr("");
    try {
      const res = await fetch("/api/intake/clarify-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, skipped }),
      });
      if (!res.ok) {
        setSubmitting(false);
        setSubmitErr("Nao foi possivel salvar suas respostas. Tente novamente.");
        return;
      }
      await res.json().catch(() => null);
      setSubmitting(false);
      router.push("/generating?step=both");
    } catch {
      setSubmitting(false);
      setSubmitErr("Erro de rede. Tente novamente.");
    }
  };

  if (state.kind === "loading") {
    return (
      <div
        className="input-block"
        style={{
          marginTop: 24,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div className="input-hd">
          <span>Gerando suas perguntas</span>
          <span className="status pending">a IA esta lendo seus inputs</span>
        </div>
        <p className="input-hint">
          {firstName}, isso leva uns segundos. Estamos pedindo para o Claude
          olhar seu GitHub e o que voce escreveu, e propor de tres a cinco
          perguntas curtas que ajudem a Anamnesis nao chutar.
        </p>
        <div
          aria-hidden="true"
          style={{
            marginTop: 8,
            height: 2,
            background:
              "linear-gradient(90deg, var(--accent) 0%, transparent 50%, var(--accent) 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.6s linear infinite",
          }}
        />
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: 0 0; } }`}</style>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="input-block" style={{ marginTop: 24 }}>
        <div className="input-hd">
          <span>Algo deu errado</span>
          <span className="status pending">erro ao gerar</span>
        </div>
        <p className="input-hint">{state.message}</p>
        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            type="button"
            className="btn"
            style={{ cursor: "pointer" }}
            onClick={() => loadQuestions(true)}
          >
            Tentar de novo
            <span className="cur"></span>
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ cursor: "pointer" }}
            onClick={() => submit(true)}
            disabled={submitting}
          >
            Pular esta etapa
          </button>
        </div>
      </div>
    );
  }

  const { questions } = state;
  const answeredCount = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const allAnswered = answeredCount === questions.length;
  const someAnswered = answeredCount > 0;

  return (
    <>
      {questions.map((q, i) => {
        const value = answers[q.id] ?? "";
        const charsLeft = ANSWER_MAX_CHARS - value.length;
        const isLong = q.kind === "long";
        const idx = String(i + 1).padStart(2, "0");
        return (
          <div key={q.id} className="input-block">
            <div className="input-hd">
              <span>
                <span style={{ color: "var(--ink-3)", marginRight: 8 }}>
                  {idx}
                </span>
                {q.question}
              </span>
              <span
                className="status"
                style={{ color: charsLeft < 80 ? "var(--accent)" : undefined }}
              >
                {value.length > 0 ? `${charsLeft} chars` : "optional"}
              </span>
            </div>
            <p className="input-hint">{q.context}</p>
            {isLong ? (
              <textarea
                className="field"
                rows={3}
                value={value}
                placeholder={q.placeholder}
                onChange={(e) => {
                  if (e.target.value.length <= ANSWER_MAX_CHARS) {
                    setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }));
                  }
                }}
                style={{
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.6,
                  background: "var(--paper)",
                }}
              />
            ) : (
              <input
                className="field"
                value={value}
                placeholder={q.placeholder}
                maxLength={ANSWER_MAX_CHARS}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                }
                style={{ background: "var(--paper)" }}
              />
            )}
          </div>
        );
      })}

      <div
        style={{
          marginTop: 24,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn"
          style={{
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.4 : 1,
          }}
          disabled={submitting}
          onClick={() => submit(false)}
        >
          <span className="hi">C</span>ontinuar para o relatorio
          <span className="cur"></span>
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ cursor: submitting ? "not-allowed" : "pointer" }}
          disabled={submitting}
          onClick={() => submit(true)}
        >
          Pular e gerar mesmo assim
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ cursor: regenerating ? "not-allowed" : "pointer" }}
          disabled={regenerating || submitting}
          onClick={() => loadQuestions(true)}
          title="Regerar as perguntas com novos inputs"
        >
          {regenerating ? "regenerando..." : "regerar perguntas"}
        </button>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: "11px",
            color: allAnswered
              ? "var(--ok, #2a7)"
              : someAnswered
                ? "var(--ink-3)"
                : "var(--ink-3)",
            letterSpacing: ".04em",
            textTransform: "uppercase",
          }}
        >
          {answeredCount} / {questions.length} respondidas
        </span>
      </div>
      {submitErr && (
        <div
          className="waitlist-error"
          role="alert"
          style={{ marginTop: 14 }}
        >
          {submitErr}
        </div>
      )}
    </>
  );
}
