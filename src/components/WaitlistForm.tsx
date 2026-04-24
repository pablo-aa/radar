"use client";

// Editorial waitlist form. POSTs to /api/waitlist and renders a success or
// inline error state in place. No nav, no redirect.

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

type SuccessState = {
  name: string;
  email: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export default function WaitlistForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [why, setWhy] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrMsg("");

    let cleanHandle = handle.trim();
    if (cleanHandle.startsWith("@")) cleanHandle = cleanHandle.slice(1);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          github_handle: cleanHandle,
          why: why.trim() ? why.trim() : undefined,
        }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.status === 200 && isRecord(data) && data.ok === true) {
        setSuccess({ name: name.trim(), email: email.trim() });
        setStatus("success");
        return;
      }

      if (res.status === 409) {
        setErrMsg(`@${cleanHandle} is already on the list. Sit tight.`);
        setStatus("error");
        return;
      }

      if (res.status === 400 && isRecord(data) && typeof data.error === "string") {
        const map: Record<string, string> = {
          invalid_json: "Could not parse the form. Try again.",
          invalid_body: "Could not parse the form. Try again.",
          missing_name: "Please enter your name.",
          name_too_long: "Name is too long.",
          missing_email: "Please enter your email.",
          email_too_long: "Email is too long.",
          invalid_email: "That email does not look right.",
          missing_github_handle: "Please enter your GitHub handle.",
          invalid_github_handle: "That GitHub handle does not look right.",
          invalid_why: "Could not read the optional field. Try again.",
          why_too_long: "The optional field is too long. Trim it under 500 chars.",
        };
        setErrMsg(map[data.error] ?? "Something went wrong. Try again.");
        setStatus("error");
        return;
      }

      setErrMsg("Server error. Try again in a moment.");
      setStatus("error");
    } catch {
      setErrMsg("Network error. Check your connection and retry.");
      setStatus("error");
    }
  };

  if (status === "success" && success) {
    return (
      <div className="waitlist-success">
        <div className="waitlist-success-kicker">§ on the list</div>
        <p className="waitlist-success-body">
          Thanks {success.name}, you are on the list.
          We will reach out at <strong>{success.email}</strong>.
        </p>
        <p className="waitlist-success-fine">
          Open source, AGPL-3.0. Invite-only during beta.
        </p>
      </div>
    );
  }

  const submitting = status === "submitting";

  return (
    <form className="waitlist-form" onSubmit={submit} noValidate>
      <label className="waitlist-label">
        <span className="waitlist-label-k">Name</span>
        <input
          className="field"
          type="text"
          name="name"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">Email</span>
        <input
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">GitHub handle</span>
        <input
          className="field"
          type="text"
          name="github_handle"
          autoComplete="username"
          required
          placeholder="pabloaa"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          disabled={submitting}
        />
      </label>

      <label className="waitlist-label">
        <span className="waitlist-label-k">
          Why radar <span className="waitlist-label-opt">· optional</span>
        </span>
        <textarea
          className="field"
          name="why"
          rows={3}
          maxLength={500}
          placeholder="One sentence is plenty."
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          disabled={submitting}
        />
      </label>

      {status === "error" && errMsg && (
        <div className="waitlist-error" role="alert">
          {errMsg}
        </div>
      )}

      <div className="waitlist-actions">
        <button
          className="btn"
          type="submit"
          disabled={submitting}
          style={{
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.55 : 1,
          }}
        >
          <span className="hi">J</span>
          {submitting ? "oining..." : "oin waitlist"}
        </button>
        <span className="waitlist-fine">
          We do not spam. We use your email only to invite you in.
        </span>
      </div>
    </form>
  );
}
