// /waitlist
// Public status page for users who tried to sign in but are not invited yet,
// or who just submitted the waitlist form. Server component. Reads searchParams
// (Next 16 async). Three variants: pending, not_invited, already.

import Link from "next/link";
import CornerMeta from "@/components/CornerMeta";

type SP = Record<string, string | string[] | undefined>;

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

type WaitlistPageProps = {
  searchParams: Promise<SP>;
};

export default async function WaitlistPage({ searchParams }: WaitlistPageProps) {
  const sp = await searchParams;
  const status = pickStr(sp.status);
  const handle = pickStr(sp.handle);
  const reason = pickStr(sp.reason);
  const name = pickStr(sp.name);
  const positionStr = pickStr(sp.position);
  const email = pickStr(sp.email);

  let kicker = "§ waitlist";
  let title = "You are not on the invite list yet.";
  let body =
    "Radar is invite-only during beta. Once approved, sign in again with the same GitHub account.";
  let primary: { href: string; label: string } | null = {
    href: "/login",
    label: "Try signing in again",
  };
  let secondary: { href: string; label: string } | null = {
    href: "/",
    label: "Back to landing",
  };

  if (status === "pending") {
    const positionNum = Number(positionStr);
    const position =
      Number.isFinite(positionNum) && positionNum > 0 ? positionNum : 0;
    kicker = "§ on the list";
    title = `Thanks${name ? `, ${name}` : ""}.`;
    body = position
      ? `You are request #${position} in the queue.${
          email ? ` We will reach out at ${email}.` : ""
        }`
      : `You are on the queue.${
          email ? ` We will reach out at ${email}.` : ""
        }`;
    primary = { href: "/", label: "Back to landing" };
    secondary = null;
  } else if (status === "already") {
    kicker = "§ already on list";
    title = "You are already on the list.";
    body = "Sit tight. We will reach out the moment your invite is approved.";
    primary = { href: "/", label: "Back to landing" };
    secondary = null;
  } else if (status === "not_invited" || status === undefined) {
    kicker = "§ not invited yet";
    if (reason === "missing_handle") {
      title = "We could not read your GitHub handle.";
      body =
        "The OAuth response did not include a usable handle. Try signing in again. If the problem persists, mention it on the project Discord.";
    } else if (handle) {
      title = `Your GitHub handle @${handle} is not on the invite list yet.`;
      body =
        "Radar is invite-only during beta. Once approved, sign in again with the same GitHub account.";
    } else {
      title = "You are not on the invite list yet.";
      body =
        "Radar is invite-only during beta. Once approved, sign in again with the same GitHub account.";
    }
    primary = { href: "/login", label: "Try signing in again" };
    secondary = { href: "/", label: "Back to landing" };
  }

  return (
    <div className="wrap">
      <div className="waitlist-page">
        <div className="locked-seal" aria-hidden="true">
          <span className="locked-seal-shell"></span>
          <span className="locked-seal-dot"></span>
        </div>
        <div className="locked-kicker">{kicker}</div>
        <h1 className="locked-h">{title}</h1>
        <p className="locked-body">{body}</p>
        <div className="locked-actions">
          {primary && (
            <Link className="btn" href={primary.href}>
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link className="btn ghost" href={secondary.href}>
              {secondary.label}
            </Link>
          )}
          <span className="locked-foot">invite-only · beta</span>
        </div>
      </div>
      <CornerMeta />
    </div>
  );
}
