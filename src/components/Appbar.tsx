"use client";

// Top app chrome. Nav, avatar menu with sign-out, mobile drawer.
//
// Nav rendering:
//   - onboardComplete=true:  show all 3 tabs (01 Report, 02 Radar, 03 Intake), no locks.
//   - first-run (onboardComplete=false):
//       01 Report  → only when intakeSubmitted=true
//       02 Radar   → only when intakeSubmitted=true
//       03 Intake  → always (entry point)
//   - Mobile drawer mirrors the same logic.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/actions";

export type AppbarRoute =
  | "radar"
  | "detail"
  | "report"
  | "intake"
  | "scout"
  | "settings"
  | "welcome"
  | "generating"
  | "auth";

type AppbarProps = {
  route: AppbarRoute;
  userInitials?: string;
  userHandle?: string;
  userName?: string;
  userCity?: string;
  intakeSubmitted?: boolean;
  onboardComplete?: boolean;
  // When true, render a small accent-colored dot on the "02 Radar" nav item
  // so a first-time post-report user notices that the radar is the next
  // step. Cleared by ClearRadarNudge on first /radar mount.
  radarNudge?: boolean;
};

export default function Appbar({
  route,
  userInitials = "PA",
  userHandle = "pabloaa",
  userName = "Pablo A. Araújo",
  userCity = "São Paulo, BR",
  intakeSubmitted = false,
  onboardComplete = false,
  radarNudge = false,
}: AppbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const hideNav =
    route === "auth" || route === "welcome" || route === "generating";

  const showReport = onboardComplete || intakeSubmitted;
  const showRadar = onboardComplete || intakeSubmitted;
  const showIntake = true;

  const on = (n: AppbarRoute | "group:radar") => {
    if (n === "group:radar") {
      return route === "radar" || route === "detail" || route === "scout"
        ? "on"
        : "";
    }
    return route === n ? "on" : "";
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    await signOut();
  };

  return (
    <header className="appbar">
      <Link className="brand" href="/">
        <span className="mark" aria-hidden="true"></span>
        <span>radar</span>
      </Link>

      {!hideNav && (
        <nav>
          {showReport && (
            <Link className={on("report")} href="/report">
              <span className="n">01</span>Report
            </Link>
          )}
          {showRadar && (
            <Link className={on("group:radar")} href="/radar">
              <span className="n">02</span>Radar
              {radarNudge && onboardComplete && (
                <span
                  className="appbar-nudge-dot"
                  aria-label="new"
                  title="Seu radar está pronto"
                />
              )}
            </Link>
          )}
          {showIntake && (
            <Link className={on("intake")} href="/intake">
              <span className="n">03</span>Intake
            </Link>
          )}
        </nav>
      )}

      <div className="who" ref={menuRef}>
        {hideNav ? (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: "10.5px",
              letterSpacing: ".06em",
              color: "var(--ink-3)",
            }}
          >
            radar · week 17 · 2026
          </span>
        ) : (
          <>
            <button
              className="appbar-mobile-toggle"
              type="button"
              aria-label="Open navigation"
              onClick={() => setDrawerOpen((v) => !v)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <button
              className="avatar-btn"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label="Open account menu"
            >
              <span className="avatar">{userInitials}</span>
              <span>{userHandle}</span>
              <span className="chev" aria-hidden="true">
                ▾
              </span>
            </button>
          </>
        )}
        {menuOpen && (
          <div className="avatar-menu" role="menu">
            <div className="avatar-menu-hd">
              <div className="avatar-menu-name">{userName}</div>
              <div className="avatar-menu-sub">
                @{userHandle} · {userCity}
              </div>
            </div>
            <Link
              className="avatar-menu-it"
              href="/settings"
              onClick={() => setMenuOpen(false)}
            >
              <span>Settings</span>
              <span className="k">⌘,</span>
            </Link>
            <Link
              className="avatar-menu-it"
              href="/intake"
              onClick={() => setMenuOpen(false)}
            >
              <span>Re-run Anamnesis</span>
              <span className="k">↻</span>
            </Link>
            <Link
              className="avatar-menu-it"
              href="/scout"
              onClick={() => setMenuOpen(false)}
            >
              <span>Watch Scout live</span>
              <span className="k">•</span>
            </Link>
            <div className="avatar-menu-sep"></div>
            <a
              className="avatar-menu-it dim"
              href="https://github.com/pabloaa/radar"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              <span>Source on GitHub</span>
              <span className="k">↗</span>
            </a>
            <button
              className="avatar-menu-it dim"
              type="button"
              onClick={handleSignOut}
              style={{
                background: "transparent",
                border: 0,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span>Sign out</span>
              <span className="k">⏻</span>
            </button>
          </div>
        )}
      </div>

      {!hideNav && drawerOpen && (
        <div
          className="appbar-drawer-scrim"
          onClick={() => setDrawerOpen(false)}
        >
          <div className="appbar-drawer" onClick={(e) => e.stopPropagation()}>
            {showReport && (
              <Link
                className="appbar-drawer-it"
                href="/report"
                onClick={() => setDrawerOpen(false)}
              >
                <span className="n">01</span>Report
              </Link>
            )}
            {showRadar && (
              <Link
                className="appbar-drawer-it"
                href="/radar"
                onClick={() => setDrawerOpen(false)}
              >
                <span className="n">02</span>Radar
                {radarNudge && onboardComplete && (
                  <span
                    className="appbar-nudge-dot"
                    aria-label="new"
                    title="Seu radar está pronto"
                  />
                )}
              </Link>
            )}
            <Link
              className="appbar-drawer-it"
              href="/intake"
              onClick={() => setDrawerOpen(false)}
            >
              <span className="n">03</span>Intake
            </Link>
            {onboardComplete && (
              <Link
                className="appbar-drawer-it"
                href="/scout"
                onClick={() => setDrawerOpen(false)}
              >
                <span className="n">·</span>Scout
              </Link>
            )}
            <Link
              className="appbar-drawer-it"
              href="/settings"
              onClick={() => setDrawerOpen(false)}
            >
              <span className="n">·</span>Settings
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
