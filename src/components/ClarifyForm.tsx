"use client";

// Renders the clarify question set: hardcoded eliminatory / ambition first,
// then AI-generated grounded follow-ups with a visible "porque..." badge.
// Chip-first UI: single_choice (radio chips), multi_choice (toggle chips
// with optional max), scale (ordinal chips), short_text (rare). When a
// question allows "outro", a chip toggles a free-text input. Submitting
// POSTs the answer payload and navigates to /generating?step=both.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

type Question = {
  id: string;
  question: string;
  context: string;
  category:
    | "intensity"
    | "role_precision"
    | "disambiguation"
    | "status"
    | "constraint"
    | "ambition"
    | "time_budget"
    | "language";
  kind: "single_choice" | "multi_choice" | "scale" | "short_text";
  source: "eliminatory" | "ai_generated";
  grounding?: string;
  options?: Option[];
  allow_other?: boolean;
  max_select?: number;
  placeholder?: string;
};

type FetchState =
  | { kind: "loading" }
  | { kind: "ready"; questions: Question[]; aiError?: string }
  | { kind: "error"; message: string };

const OTHER_VALUE = "__other__";
const OTHER_TEXT_MAX = 600;

function isOption(v: unknown): v is Option {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.value === "string" && typeof o.label === "string";
}

function isQuestion(v: unknown): v is Question {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string") return false;
  if (typeof o.question !== "string") return false;
  if (typeof o.context !== "string") return false;
  if (typeof o.kind !== "string") return false;
  if (typeof o.source !== "string") return false;
  if (typeof o.category !== "string") return false;
  if (o.options !== undefined && !Array.isArray(o.options)) return false;
  if (Array.isArray(o.options) && !o.options.every(isOption)) return false;
  if (o.grounding !== undefined && typeof o.grounding !== "string") return false;
  return true;
}

type AnswerState = {
  values: string[];
  otherText: string;
  otherEnabled: boolean;
};

const emptyAnswer: AnswerState = {
  values: [],
  otherText: "",
  otherEnabled: false,
};

function chipBaseStyle(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    fontSize: 13,
    fontFamily: "inherit",
    background: active ? undefined : "transparent",
    border: active ? undefined : ".5px solid var(--ink-4)",
    cursor: "pointer",
    textTransform: "none",
    letterSpacing: 0,
  };
}

export default function ClarifyForm({ firstName }: { firstName: string }) {
  const router = useRouter();
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string>("");
  const [regenerating, setRegenerating] = useState(false);
  // Preview overlay between "Continuar" and the actual dispatch. Mirrors
  // Claude Design's clarify -> plan -> build pattern so the user can
  // verify what the agent will see before paying for the run.
  const [previewing, setPreviewing] = useState(false);

  const loadQuestions = async (regenerate: boolean, signal?: AbortSignal) => {
    if (regenerate) setRegenerating(true);
    try {
      const url = regenerate
        ? "/api/intake/clarify-questions?regenerate=1"
        : "/api/intake/clarify-questions";
      const res = await fetch(url, { method: "GET", signal });
      if (signal?.aborted) return;
      const data: unknown = await res.json().catch(() => null);
      if (signal?.aborted) return;
      if (!res.ok) {
        const message =
          data && typeof data === "object" && "message" in data
            ? String((data as Record<string, unknown>).message)
            : "Failed to load the questions. Please try again.";
        setState({ kind: "error", message });
        return;
      }
      const rawQuestions =
        data && typeof data === "object" && "questions" in data
          ? (data as Record<string, unknown>).questions
          : null;
      const aiError =
        data && typeof data === "object" && "ai_error" in data
          ? String((data as Record<string, unknown>).ai_error)
          : undefined;
      if (!Array.isArray(rawQuestions)) {
        setState({ kind: "error", message: "Invalid response from the server." });
        return;
      }
      const questions = rawQuestions.filter(isQuestion);
      if (questions.length === 0) {
        setState({
          kind: "error",
          message: "No questions were generated. Try regenerating.",
        });
        return;
      }
      if (regenerate) setAnswers({});
      setState({ kind: "ready", questions, aiError });
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.resolve().then(() => {
      if (!ctrl.signal.aborted) void loadQuestions(false, ctrl.signal);
    });
    return () => {
      ctrl.abort();
    };
  }, []);

  const setAnswer = (qid: string, patch: Partial<AnswerState>) => {
    setAnswers((prev) => {
      const current = prev[qid] ?? emptyAnswer;
      return { ...prev, [qid]: { ...current, ...patch } };
    });
  };

  const toggleSingleValue = (q: Question, value: string) => {
    const current = answers[q.id] ?? emptyAnswer;
    const isOtherClick = value === OTHER_VALUE;
    if (isOtherClick) {
      const enable = !current.otherEnabled;
      setAnswer(q.id, {
        values: enable ? [] : current.values,
        otherEnabled: enable,
        otherText: enable ? current.otherText : "",
      });
      return;
    }
    setAnswer(q.id, {
      values: [value],
      otherEnabled: false,
      otherText: "",
    });
  };

  const toggleMultiValue = (q: Question, value: string) => {
    const current = answers[q.id] ?? emptyAnswer;
    const isOtherClick = value === OTHER_VALUE;
    if (isOtherClick) {
      const enable = !current.otherEnabled;
      setAnswer(q.id, {
        otherEnabled: enable,
        otherText: enable ? current.otherText : "",
      });
      return;
    }
    const isSelected = current.values.includes(value);
    if (
      !isSelected &&
      typeof q.max_select === "number" &&
      current.values.length >= q.max_select
    ) {
      // At cap: refuse the new selection rather than silently dropping the
      // user's earliest pick. Selected chips remain individually clickable
      // to deselect, freeing a slot.
      return;
    }
    const nextValues = isSelected
      ? current.values.filter((v) => v !== value)
      : [...current.values, value];
    setAnswer(q.id, { values: nextValues });
  };

  const submit = async (skipped: boolean) => {
    setSubmitting(true);
    setSubmitErr("");
    try {
      // Serialize answers into the API contract.
      const payload: Record<string, { values: string[]; other_text?: string }> =
        {};
      for (const [qid, a] of Object.entries(answers)) {
        const cleanText = a.otherText.trim();
        const hasOther = a.otherEnabled && cleanText.length > 0;
        if (a.values.length === 0 && !hasOther) continue;
        const entry: { values: string[]; other_text?: string } = {
          values: a.values,
        };
        if (hasOther) entry.other_text = cleanText.slice(0, OTHER_TEXT_MAX);
        payload[qid] = entry;
      }

      const res = await fetch("/api/intake/clarify-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload, skipped }),
      });
      if (!res.ok) {
        setSubmitting(false);
        setSubmitErr("Could not save your answers. Please try again.");
        return;
      }
      await res.json().catch(() => null);
      setSubmitting(false);
      router.push("/generating?step=both");
    } catch {
      setSubmitting(false);
      setSubmitErr("Network error. Please try again.");
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
          <span>Preparing your questions</span>
          <span className="status pending">the AI is reading your inputs</span>
        </div>
        <p className="input-hint">
          {firstName}, this takes a few seconds. We are asking Claude to
          look at your GitHub and what you wrote, and propose personalized
          follow-ups. The constraint questions are fixed.
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
          <span>Something went wrong</span>
          <span className="status pending">generation error</span>
        </div>
        <p className="input-hint">{state.message}</p>
        <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
          <button
            type="button"
            className="btn"
            style={{ cursor: "pointer" }}
            onClick={() => loadQuestions(true)}
          >
            Try again
            <span className="cur"></span>
          </button>
          <button
            type="button"
            className="btn ghost"
            style={{ cursor: "pointer" }}
            onClick={() => submit(true)}
            disabled={submitting}
          >
            Skip this step
          </button>
        </div>
      </div>
    );
  }

  const { questions, aiError } = state;
  return (
    <>
      <ClarifyBody
        firstName={firstName}
        questions={questions}
        aiError={aiError}
        answers={answers}
        submitting={submitting}
        regenerating={regenerating}
        submitErr={submitErr}
        onAnswerText={(qid, text) => setAnswer(qid, { otherText: text })}
        onAnswerShortText={(qid, text) =>
          setAnswer(qid, {
            otherText: text,
            otherEnabled: true,
            values: [],
          })
        }
        onToggleSingle={toggleSingleValue}
        onToggleMulti={toggleMultiValue}
        onContinue={() => setPreviewing(true)}
        onSkip={() => submit(true)}
        onRegenerate={() => loadQuestions(true)}
      />
      {previewing && (
        <PreviewModal
          firstName={firstName}
          questions={questions}
          answers={answers}
          submitting={submitting}
          onCancel={() => setPreviewing(false)}
          onConfirm={() => {
            // Keep the modal mounted during the request so the user sees
            // the disabled "Confirmar" button rather than being dumped back
            // on the form with no spinner. The success path navigates away
            // (route change unmounts everything); the error path resets
            // submitting and keeps the modal open so the user can retry.
            void submit(false);
          }}
        />
      )}
    </>
  );
}

type BodyProps = {
  firstName: string;
  questions: Question[];
  aiError?: string;
  answers: Record<string, AnswerState>;
  submitting: boolean;
  regenerating: boolean;
  submitErr: string;
  onAnswerText: (qid: string, text: string) => void;
  onAnswerShortText: (qid: string, text: string) => void;
  onToggleSingle: (q: Question, value: string) => void;
  onToggleMulti: (q: Question, value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onRegenerate: () => void;
};

function ClarifyBody({
  firstName,
  questions,
  aiError,
  answers,
  submitting,
  regenerating,
  submitErr,
  onAnswerText,
  onAnswerShortText,
  onToggleSingle,
  onToggleMulti,
  onContinue,
  onSkip,
  onRegenerate,
}: BodyProps) {
  const eliminatory = useMemo(
    () => questions.filter((q) => q.source === "eliminatory"),
    [questions],
  );
  const ai = useMemo(
    () => questions.filter((q) => q.source === "ai_generated"),
    [questions],
  );
  const total = questions.length;
  const answered = useMemo(
    () =>
      questions.reduce((acc, q) => {
        const a = answers[q.id];
        if (!a) return acc;
        const has = a.values.length > 0 || (a.otherEnabled && a.otherText.trim().length > 0);
        return has ? acc + 1 : acc;
      }, 0),
    [questions, answers],
  );

  return (
    <>
      {aiError && (
        <div
          style={{
            marginTop: 16,
            padding: 10,
            border: ".5px solid var(--ink-4)",
            background: "rgba(255, 200, 0, 0.04)",
            fontSize: 12,
            color: "var(--ink-3)",
            fontFamily: "var(--mono)",
          }}
        >
          The AI could not propose personalized follow-ups this time. The
          constraint questions below are enough for a decent report; you
          can regenerate or proceed.
        </div>
      )}

      <ProgressStrip answered={answered} total={total} />


      <SectionHeader
        n="A"
        title="Constraints and ambition"
        sub="Fixed questions. They define the universe of opportunities that make sense for you."
      />
      {eliminatory.map((q, i) => (
        <QuestionRow
          key={q.id}
          q={q}
          idx={i + 1}
          answer={answers[q.id] ?? emptyAnswer}
          submitting={submitting}
          onToggleSingle={onToggleSingle}
          onToggleMulti={onToggleMulti}
          onAnswerText={onAnswerText}
          onAnswerShortText={onAnswerShortText}
        />
      ))}

      {ai.length > 0 && (
        <SectionHeader
          n="B"
          title={`Personalized for ${firstName}`}
          sub="The AI looked at your signals and picked what is worth confirming before the report."
        />
      )}
      {ai.map((q, i) => (
        <QuestionRow
          key={q.id}
          q={q}
          idx={eliminatory.length + i + 1}
          answer={answers[q.id] ?? emptyAnswer}
          submitting={submitting}
          onToggleSingle={onToggleSingle}
          onToggleMulti={onToggleMulti}
          onAnswerText={onAnswerText}
          onAnswerShortText={onAnswerShortText}
        />
      ))}

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
          onClick={onContinue}
        >
          <span className="hi">C</span>ontinue to the report
          <span className="cur"></span>
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ cursor: submitting ? "not-allowed" : "pointer" }}
          disabled={submitting}
          onClick={onSkip}
        >
          Skip and generate anyway
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ cursor: regenerating ? "not-allowed" : "pointer" }}
          disabled={regenerating || submitting}
          onClick={onRegenerate}
          title="Regenerate the personalized questions"
        >
          {regenerating ? "regenerating..." : "regenerate AI"}
        </button>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-3)",
            letterSpacing: ".04em",
            textTransform: "uppercase",
          }}
        >
          {answered} / {total} answered
        </span>
      </div>
      {submitErr && (
        <div className="waitlist-error" role="alert" style={{ marginTop: 14 }}>
          {submitErr}
        </div>
      )}
    </>
  );
}

function ProgressStrip({
  answered,
  total,
}: {
  answered: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 4,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      aria-label={`progress: ${answered} of ${total}`}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: ".04em",
          textTransform: "uppercase",
        }}
      >
        <span>progress</span>
        <span>
          {String(answered).padStart(2, "0")} of {String(total).padStart(2, "0")}{" "}
          answered
        </span>
      </div>
      <div
        style={{
          height: 2,
          background: "var(--ink-5, rgba(0,0,0,0.08))",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: `${pct}%`,
            background: "var(--accent)",
            transition: "width 220ms ease-out",
          }}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  n,
  title,
  sub,
}: {
  n: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="sec-label" style={{ marginTop: 32 }}>
      <span className="n">{n}</span>
      <span>{title}</span>
      <span className="bar"></span>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: ".04em",
          textTransform: "none",
          marginLeft: 12,
        }}
      >
        {sub}
      </span>
    </div>
  );
}

type RowProps = {
  q: Question;
  idx: number;
  answer: AnswerState;
  submitting: boolean;
  onToggleSingle: (q: Question, value: string) => void;
  onToggleMulti: (q: Question, value: string) => void;
  onAnswerText: (qid: string, text: string) => void;
  onAnswerShortText: (qid: string, text: string) => void;
};

function QuestionRow({
  q,
  idx,
  answer,
  submitting,
  onToggleSingle,
  onToggleMulti,
  onAnswerText,
  onAnswerShortText,
}: RowProps) {
  const idxLabel = String(idx).padStart(2, "0");
  const answered =
    answer.values.length > 0 ||
    (answer.otherEnabled && answer.otherText.trim().length > 0);

  return (
    <div className="input-block">
      <div className="input-hd">
        <span>
          <span style={{ color: "var(--ink-3)", marginRight: 8 }}>
            {idxLabel}
          </span>
          {q.question}
        </span>
        <span className={"status " + (answered ? "ok" : "")}>
          {q.source === "eliminatory" ? "constraint" : "personalized"}
        </span>
      </div>
      {q.grounding && (
        <div
          style={{
            display: "inline-block",
            maxWidth: "100%",
            marginTop: 4,
            padding: "2px 8px",
            border: ".5px solid var(--accent)",
            color: "var(--accent)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: 0,
            textTransform: "none",
            whiteSpace: "normal",
            wordBreak: "break-word",
          }}
        >
          because {q.grounding}
        </div>
      )}
      <p className="input-hint">{q.context}</p>

      {q.kind === "short_text" ? (
        <input
          className="field"
          placeholder={q.placeholder ?? ""}
          value={answer.otherText}
          maxLength={OTHER_TEXT_MAX}
          disabled={submitting}
          onChange={(e) => onAnswerShortText(q.id, e.target.value)}
          style={{ background: "var(--paper)" }}
        />
      ) : (
        <ChipGroup
          q={q}
          answer={answer}
          submitting={submitting}
          onToggleSingle={onToggleSingle}
          onToggleMulti={onToggleMulti}
          onAnswerText={onAnswerText}
        />
      )}
    </div>
  );
}

type ChipGroupProps = {
  q: Question;
  answer: AnswerState;
  submitting: boolean;
  onToggleSingle: (q: Question, value: string) => void;
  onToggleMulti: (q: Question, value: string) => void;
  onAnswerText: (qid: string, text: string) => void;
};

function ChipGroup({
  q,
  answer,
  submitting,
  onToggleSingle,
  onToggleMulti,
  onAnswerText,
}: ChipGroupProps) {
  const isMulti = q.kind === "multi_choice";
  const isScale = q.kind === "scale";
  const onClick = (value: string) =>
    isMulti ? onToggleMulti(q, value) : onToggleSingle(q, value);

  return (
    <>
      <div
        className="tag-row"
        style={
          isScale
            ? { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }
            : undefined
        }
      >
        {(q.options ?? []).map((opt) => {
          const active = answer.values.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              className={"chip" + (active ? " on" : "")}
              disabled={submitting}
              onClick={() => onClick(opt.value)}
              style={chipBaseStyle(active)}
            >
              {active && <span className="tick"></span>}
              <span style={{ textTransform: "none", letterSpacing: 0 }}>
                {active ? opt.label : `+ ${opt.label}`}
              </span>
            </button>
          );
        })}
        {q.allow_other && (
          <button
            type="button"
            className={"chip" + (answer.otherEnabled ? " on" : "")}
            disabled={submitting}
            onClick={() => onClick(OTHER_VALUE)}
            style={chipBaseStyle(answer.otherEnabled)}
          >
            {answer.otherEnabled && <span className="tick"></span>}
            <span style={{ textTransform: "none", letterSpacing: 0 }}>
              {answer.otherEnabled ? "other" : "+ other"}
            </span>
          </button>
        )}
      </div>
      {q.allow_other && answer.otherEnabled && (
        <input
          className="field"
          placeholder="tell us in one sentence"
          value={answer.otherText}
          maxLength={OTHER_TEXT_MAX}
          disabled={submitting}
          onChange={(e) => onAnswerText(q.id, e.target.value)}
          style={{ marginTop: 10, background: "var(--paper)" }}
        />
      )}
      {q.max_select ? (
        <p className="input-hint" style={{ marginTop: 6 }}>
          pick up to {q.max_select}.
        </p>
      ) : null}
    </>
  );
}

// ── preview modal ─────────────────────────────────────────────────────

type PreviewModalProps = {
  firstName: string;
  questions: Question[];
  answers: Record<string, AnswerState>;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function summarizeAnswer(q: Question, a: AnswerState | undefined): string {
  if (!a) return "(no answer)";
  const optByValue = new Map((q.options ?? []).map((o) => [o.value, o.label]));
  const labels = a.values
    .map((v) => optByValue.get(v))
    .filter((l): l is string => typeof l === "string");
  const otherText = a.otherEnabled ? a.otherText.trim() : "";
  const parts: string[] = [];
  if (labels.length > 0) parts.push(labels.join(", "));
  if (otherText) parts.push(`other: ${otherText}`);
  if (q.kind === "short_text" && otherText) return otherText;
  if (parts.length === 0) return "(no answer)";
  return parts.join(" · ");
}

function PreviewModal({
  firstName,
  questions,
  answers,
  submitting,
  onCancel,
  onConfirm,
}: PreviewModalProps) {
  // Esc to close (only when not submitting). Tied to mount so it cleans up
  // on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onCancel]);

  // Block scrim click while a submit is in flight, so a stray miss does
  // not orphan the user on the form with no spinner while the request
  // continues in the background.
  const onScrim = () => {
    if (!submitting) onCancel();
  };

  const answered = questions.filter((q) => {
    const a = answers[q.id];
    if (!a) return false;
    return (
      a.values.length > 0 || (a.otherEnabled && a.otherText.trim().length > 0)
    );
  });
  const unanswered = questions.length - answered.length;

  return (
    <div className="ana-modal-scrim" onClick={onScrim}>
      <div
        className="ana-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "84vh", overflow: "auto" }}
      >
        <div className="ana-modal-kicker">
          § preview · what Anamnesis and the Strategist will consider
        </div>
        <h3 className="ana-modal-h">
          All set, {firstName}?
        </h3>
        <p className="ana-modal-body">
          Confirm the answers below. Anamnesis will treat them as authority
          over your CV and GitHub. The Strategist will filter incompatible
          opportunities before ranking. Going back to edit costs nothing.
        </p>
        <ul className="ana-modal-list" style={{ paddingLeft: 0, listStyle: "none" }}>
          {questions.map((q) => {
            const a = answers[q.id];
            const has =
              a &&
              (a.values.length > 0 ||
                (a.otherEnabled && a.otherText.trim().length > 0));
            return (
              <li
                key={q.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: ".5px solid var(--ink-5, rgba(0,0,0,0.05))",
                }}
              >
                <span
                  className={"ana-modal-dot " + (has ? "" : "off")}
                  style={{ marginTop: 6 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--ink-3)",
                      letterSpacing: ".04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {q.source === "eliminatory" ? "constraint" : "personalized"}
                    {" · "}
                    {q.category.replace(/_/g, " ")}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 13 }}>{q.question}</div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      color: has ? undefined : "var(--ink-4)",
                      fontStyle: has ? "normal" : "italic",
                    }}
                  >
                    {summarizeAnswer(q, a)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {unanswered > 0 && (
          <div
            style={{
              marginTop: 4,
              marginBottom: 14,
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}
          >
            {unanswered} {unanswered === 1 ? "question" : "questions"} left
            unanswered. It is fine to continue, but Anamnesis will have less context.
          </div>
        )}
        <div className="ana-modal-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Edit answers
          </button>
          <button
            type="button"
            className="btn"
            onClick={onConfirm}
            disabled={submitting}
          >
            Confirm and generate
            <span className="cur"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
