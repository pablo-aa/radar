"use client";

/* global File */

// Intake form. Real GitHub data, real CV upload, free-text moment textarea,
// POST to /api/intake/submit, navigate to /generating. The form is
// editorial-first; live confirm panel mirrors the inputs.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GitHubProfile } from "@/lib/github";
import { uploadCV } from "@/lib/storage";

const INTEREST_OPTIONS = [
  "AI safety",
  "applied ML",
  "open source",
  "developer tools",
  "research",
  "founding a company",
  "academic path",
  "freelance / consulting",
  "indie product",
  "remote-friendly roles",
  "international fellowships",
  "Latin American programs",
  "writing & teaching",
  "competitive programming",
] as const;

const INTEREST_MIN = 3;
const INTEREST_MAX = 6;
const MOMENT_MAX_CHARS = 2000;

type Props = {
  initialHandle: string;
  ghProfile?: GitHubProfile | null;
  initialCvPath?: string | null;
  initialSiteUrl?: string;
  userId: string;
  runsUsed: number;
  firstRun: boolean;
};

type CvState =
  | { kind: "idle" }
  | { kind: "uploading"; name: string }
  | { kind: "ready"; name: string; path: string }
  | { kind: "error"; message: string };

type SiteFetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "ok"; title: string | null }
  | { kind: "soft-fail" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fileBaseName(name: string): string {
  return name.length > 36 ? name.slice(0, 33) + "..." : name;
}

export default function IntakeForm({
  initialHandle,
  ghProfile,
  initialCvPath,
  initialSiteUrl,
  userId,
  runsUsed,
  firstRun,
}: Props) {
  const router = useRouter();
  const runsMax = 1;
  const locked = runsUsed >= runsMax;

  const [gh, setGh] = useState(initialHandle);
  const [site, setSite] = useState(initialSiteUrl ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [momentText, setMomentText] = useState("");
  const [cv, setCv] = useState<CvState>(
    initialCvPath
      ? { kind: "ready", name: initialCvPath.split("/").pop() ?? "cv.pdf", path: initialCvPath }
      : { kind: "idle" },
  );
  const [siteFetch, setSiteFetch] = useState<SiteFetchState>({ kind: "idle" });

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string>("");

  // Silence unused-effect warning: keep this to preserve hook order stability
  // across potential future additions.
  useEffect(() => {}, []);

  // ── tag toggle ────────────────────────────────────────────────────────
  const toggleTag = (t: string) => {
    setTags((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= INTEREST_MAX) return prev;
      return [...prev, t];
    });
  };

  // ── CV upload ─────────────────────────────────────────────────────────
  const onCvFile = async (file: File | undefined) => {
    if (!file) return;
    setCv({ kind: "uploading", name: file.name });
    try {
      const { path } = await uploadCV(userId, file);
      setCv({ kind: "ready", name: file.name, path });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setCv({ kind: "error", message });
    }
  };

  // ── personal site preview (best-effort, soft-fail) ────────────────────
  const previewSite = async () => {
    const trimmed = site.trim();
    if (!trimmed) {
      setSiteFetch({ kind: "idle" });
      return;
    }
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    setSiteFetch({ kind: "fetching" });
    try {
      const res = await fetch("/api/anamnesis/fetch-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (
        res.ok &&
        isRecord(data) &&
        data.ok === true
      ) {
        const title =
          typeof data.title === "string" && data.title.length > 0
            ? data.title
            : null;
        setSiteFetch({ kind: "ok", title });
      } else {
        setSiteFetch({ kind: "soft-fail" });
      }
    } catch {
      setSiteFetch({ kind: "soft-fail" });
    }
  };

  // ── submit ────────────────────────────────────────────────────────────
  const minMet = tags.length >= INTEREST_MIN;
  const canSubmit = !locked && !submitting && !!gh.trim() && minMet;

  const tryGenerate = () => {
    if (!canSubmit) return;
    setSubmitErr("");
    setConfirming(true);
  };

  const doGenerate = async () => {
    setConfirming(false);
    setSubmitting(true);
    setSubmitErr("");

    const cvPath = cv.kind === "ready" ? cv.path : undefined;
    const siteUrl = site.trim() || undefined;
    const momentTrimmed = momentText.trim() || undefined;

    try {
      const res = await fetch("/api/intake/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_url: cvPath,
          moment_text: momentTrimmed,
          declared_interests: tags,
          site_url: siteUrl,
        }),
      });

      if (!res.ok) {
        const data: unknown = await res.json().catch(() => null);
        const code =
          isRecord(data) && typeof data.error === "string" ? data.error : null;
        const friendly =
          code === "moment_text_too_long"
            ? "O texto do momento atual excede 2000 caracteres."
            : code === "declared_interests_too_many"
              ? "Selecione no maximo 20 interesses."
              : code === "invalid_cv_url"
                ? "O arquivo de CV enviado e invalido. Tente enviar novamente."
                : "Nao foi possivel iniciar a analise. Tente novamente.";
        setSubmitting(false);
        setSubmitErr(friendly);
        return;
      }

      // The intake/submit response includes the anamnesis run_id but the
      // chained-flow waiting screen (/generating?step=both) polls the
      // aggregated /api/onboarding/status endpoint, which finds the latest
      // run by user_id. So we do not need run_id in the URL.
      await res.json().catch(() => null);
      // Reset submitting before navigation so the button is not stuck if the
      // user soft-navigates back (Next router keeps the form mounted).
      setSubmitting(false);
      router.push("/generating?step=both");
    } catch {
      setSubmitting(false);
      setSubmitErr("Erro de rede. Tente novamente.");
      return;
    }
  };

  // ── derived display ───────────────────────────────────────────────────
  const ghStatusLabel = ghProfile
    ? `connected as ${ghProfile.login}`
    : "live data unavailable";
  const ghStatusKind: "ok" | "pending" = ghProfile ? "ok" : "pending";

  const ghHint = ghProfile
    ? `${ghProfile.public_repos} public repos${
        ghProfile.location ? ` · ${ghProfile.location}` : ""
      }${ghProfile.bio ? ` · ${ghProfile.bio}` : ""}`
    : "Could not fetch live GitHub stats. Will retry on the next run.";

  const cvStatus = (() => {
    switch (cv.kind) {
      case "idle":
        return { label: "no file yet", cls: "" };
      case "uploading":
        return { label: "uploading...", cls: "pending" };
      case "ready":
        return { label: `uploaded · ${fileBaseName(cv.name)}`, cls: "ok" };
      case "error":
        return { label: cv.message, cls: "pending" };
    }
  })();

  const siteStatus = (() => {
    switch (siteFetch.kind) {
      case "idle":
        return { label: site ? "press enter to preview" : "optional", cls: "" };
      case "fetching":
        return { label: "fetching...", cls: "pending" };
      case "ok":
        return {
          label: siteFetch.title ? `fetched · ${fileBaseName(siteFetch.title)}` : "fetched",
          cls: "ok",
        };
      case "soft-fail":
        return { label: "could not preview, will retry on run", cls: "pending" };
    }
  })();

  const momentCharsLeft = MOMENT_MAX_CHARS - momentText.length;

  return (
    <>
      <div className="ana-banner">
        <div className="ana-banner-l">
          <div className="ana-banner-k">beta · runs</div>
          <div className="ana-banner-v">
            {runsUsed} <span className="ana-banner-sl">/</span> {runsMax} used
          </div>
        </div>
        <div className="ana-banner-m">
          <strong>One report per account in beta.</strong> Read each field
          carefully before you submit, the profile you generate here is the
          foundation of every weekly radar that follows. Additional runs
          unlock as test cohorts progress.
        </div>
      </div>

      <div className="ana">
        <div>
          <div className="sec-label">
            <span className="n">001</span>
            <span>Intake · tell Anamnesis about you</span>
            <span className="bar"></span>
          </div>
          <h1>
            Build your profile
            <span
              style={{
                display: "inline-block",
                width: ".5em",
                height: ".8em",
                background: "var(--accent)",
                marginLeft: ".05em",
                verticalAlign: "-.08em",
                animation: "blink 1.05s steps(1) infinite",
              }}
            ></span>
          </h1>
          <p className="lede">
            Anamnesis reads what you already ship. The more it reads, the less
            it guesses. Everything below except GitHub is optional, but a thin
            intake produces a thin report.
          </p>

          <div className="input-block">
            <div className="input-hd">
              <span>GitHub · auto-imported</span>
              <span className={`status ${ghStatusKind}`}>{ghStatusLabel}</span>
            </div>
            <p className="input-hint">{ghHint}</p>
            <input
              className="field"
              value={gh}
              onChange={(e) => setGh(e.target.value)}
              style={{ background: "var(--paper)" }}
            />
          </div>

          <div className="input-block">
            <div className="input-hd">
              <span>CV · PDF upload</span>
              <span className={"status " + cvStatus.cls}>{cvStatus.label}</span>
            </div>
            <p className="input-hint">
              Anamnesis extracts roles, dates, and one-line descriptors. Not
              scored, not filtered. PDF only, up to 10 MB.
            </p>
            <label
              className="field"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                gap: 12,
              }}
            >
              <span style={{ color: "var(--ink-3)" }}>
                {cv.kind === "ready"
                  ? fileBaseName(cv.name)
                  : cv.kind === "uploading"
                    ? "uploading..."
                    : "drop a PDF or click to browse"}
              </span>
              <span style={{ color: "var(--ink-4)", fontSize: 11 }}>
                {cv.kind === "ready" ? "ready" : "select file"}
              </span>
              <input
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={(e) => onCvFile(e.target.files?.[0])}
              />
            </label>
          </div>

          <div className="input-block">
            <div className="input-hd">
              <span>Personal site or blog</span>
              <span className={"status " + siteStatus.cls}>{siteStatus.label}</span>
            </div>
            <p className="input-hint">
              Optional. Gives Anamnesis your voice, not just your resume.
            </p>
            <input
              className="field"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              onBlur={previewSite}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  previewSite();
                }
              }}
              placeholder="example.com"
            />
          </div>

          <div className="input-block">
            <div className="input-hd">
              <span>O seu momento atual</span>
              <span className="status" style={{ color: momentCharsLeft < 200 ? "var(--accent)" : undefined }}>
                {momentText.length > 0
                  ? `${momentCharsLeft} chars remaining`
                  : "optional"}
              </span>
            </div>
            <p className="input-hint">
              2 a 3 paragrafos sobre o que voce esta construindo, aprendendo, ou buscando.
            </p>
            <textarea
              className="field"
              value={momentText}
              onChange={(e) => {
                if (e.target.value.length <= MOMENT_MAX_CHARS) {
                  setMomentText(e.target.value);
                }
              }}
              rows={6}
              style={{
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.6,
                background: "var(--paper)",
              }}
              placeholder="Conte o que voce esta construindo este ano, o que esta aprendendo, ou o que esta buscando. Um paragrafo e suficiente."
            />
          </div>

          <div className="input-block">
            <div className="input-hd">
              <span>Declared interests</span>
              <span className="status">
                {tags.length} selected · pick {INTEREST_MIN} to {INTEREST_MAX}
              </span>
            </div>
            <p className="input-hint">
              Strategist uses these as thesis anchors, not filters.
            </p>
            <div className="tag-row">
              {INTEREST_OPTIONS.map((t) => {
                const on = tags.includes(t);
                const max = !on && tags.length >= INTEREST_MAX;
                return (
                  <button
                    key={t}
                    type="button"
                    className={"chip" + (on ? " on" : "")}
                    onClick={() => toggleTag(t)}
                    disabled={max}
                    style={{
                      cursor: max ? "not-allowed" : "pointer",
                      background: on ? undefined : "transparent",
                      border: on ? undefined : ".5px solid var(--ink-4)",
                      font: "inherit",
                      opacity: max ? 0.4 : 1,
                    }}
                  >
                    {on && <span className="tick"></span>}
                    <span style={{ textTransform: "none", letterSpacing: 0 }}>
                      {on ? t : `+ ${t}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
                cursor: !canSubmit ? "not-allowed" : "pointer",
                opacity: !canSubmit ? 0.4 : 1,
              }}
              disabled={!canSubmit}
              onClick={tryGenerate}
            >
              <span className="hi">G</span>enerate my report
              <span className="cur"></span>
            </button>
            {!firstRun && (
              <button
                type="button"
                className="btn ghost"
                style={{ cursor: "pointer" }}
                onClick={() => router.push("/radar")}
              >
                Back to radar
              </button>
            )}
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: "11px",
                color: locked ? "var(--accent)" : "var(--ink-3)",
                letterSpacing: ".04em",
                textTransform: "uppercase",
              }}
            >
              {locked
                ? "beta · no runs remaining"
                : !minMet
                  ? `pick at least ${INTEREST_MIN} interests`
                  : `${runsMax - runsUsed} run remaining in beta · this is your only one`}
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
        </div>

        <aside className="ana-confirm">
          <h2>002 · Live confirm</h2>
          <p className="eye">What Anamnesis sees, right now</p>
          <div className="prof">
            <div>
              <span className="k">handle</span>
              <span className="v">{gh || "(not set)"}</span>
            </div>
            {ghProfile?.name && (
              <div>
                <span className="k">name</span>
                <span className="v">{ghProfile.name}</span>
              </div>
            )}
            {ghProfile?.location && (
              <div>
                <span className="k">based</span>
                <span className="v">{ghProfile.location}</span>
              </div>
            )}
            {ghProfile && (
              <div>
                <span className="k">repos</span>
                <span className="v">
                  {ghProfile.public_repos} public · {ghProfile.followers} followers
                </span>
              </div>
            )}
            <div>
              <span className="k">cv</span>
              <span className="v">
                {cv.kind === "ready"
                  ? fileBaseName(cv.name)
                  : cv.kind === "uploading"
                    ? "uploading..."
                    : "not uploaded"}
              </span>
            </div>
            <div>
              <span className="k">site</span>
              <span className="v">{site || "(none)"}</span>
            </div>
            <div>
              <span className="k">momento</span>
              <span className="v">
                {momentText.trim()
                  ? `${momentText.trim().slice(0, 60)}${momentText.trim().length > 60 ? "..." : ""}`
                  : "skipped"}
              </span>
            </div>
            <div>
              <span className="k">interests</span>
              <span className="v">{tags.length ? tags.join(" · ") : "(none yet)"}</span>
            </div>
          </div>
          <div className="prose">
            <span className="dim">Anamnesis draft:</span>{" "}
            {ghProfile?.bio
              ? ghProfile.bio
              : "Once your inputs are in, Strategist will compose a self-portrait from what is on the record."}
            <span className="cursor-type" aria-hidden="true"></span>
          </div>
        </aside>
      </div>

      {confirming && (
        <div
          className="ana-modal-scrim"
          onClick={() => setConfirming(false)}
        >
          <div
            className="ana-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ana-modal-kicker">
              § confirm · one report per account
            </div>
            <h3 className="ana-modal-h">Ready to generate?</h3>
            <p className="ana-modal-body">
              In beta, each account has one report run. Once you continue,
              Anamnesis reads your inputs, Scout crawls the week, and
              Strategist writes your self-portrait. You cannot re-run this
              week, edits to your inputs will apply the next time runs unlock.
            </p>
            <ul className="ana-modal-list">
              <li>
                <span className="ana-modal-dot" /> GitHub connected as{" "}
                <b>{gh}</b>
              </li>
              <li>
                <span
                  className={"ana-modal-dot " + (cv.kind === "ready" ? "" : "off")}
                />{" "}
                CV ·{" "}
                <b>
                  {cv.kind === "ready"
                    ? fileBaseName(cv.name)
                    : "skipped (recommended)"}
                </b>
              </li>
              <li>
                <span
                  className={"ana-modal-dot " + (site ? "" : "off")}
                />{" "}
                Site · <b>{site || "skipped"}</b>
              </li>
              <li>
                <span
                  className={"ana-modal-dot " + (momentText.trim() ? "" : "off")}
                />{" "}
                Momento ·{" "}
                <b>
                  {momentText.trim()
                    ? `${momentText.trim().length} chars`
                    : "skipped (recommended)"}
                </b>
              </li>
              <li>
                <span className="ana-modal-dot" /> Interests ·{" "}
                <b>{tags.length} selected</b>
              </li>
            </ul>
            <div className="ana-modal-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirming(false)}
              >
                Go back · edit inputs
              </button>
              <button
                type="button"
                className="btn"
                onClick={doGenerate}
              >
                <span className="hi">G</span>enerate report · use my run
                <span className="cur"></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
