"use client";

// Generating screen animation. When the last stage completes,
// calls markIntakeDone() then navigates to /report.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markIntakeDone } from "@/lib/actions";

type Stage = { k: string; label: string; detail: string; ms: number };

const STAGES: Stage[] = [
  {
    k: "anamnesis",
    label: "Anamnesis · reading you",
    detail: "github · cv · site · voice note",
    ms: 1600,
  },
  {
    k: "scout",
    label: "Scout · crawling the world",
    detail: "1,240 sources · weekly index",
    ms: 2200,
  },
  {
    k: "strategist",
    label: "Strategist · drafting your radar",
    detail: "fit scores · why-you · 90-day path",
    ms: 1800,
  },
  {
    k: "composing",
    label: "Composing your self-portrait",
    detail: "archetype · territory · vectors",
    ms: 1400,
  },
];

export default function GeneratingProgress() {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [pct, setPct] = useState(0);
  const finalizedRef = useRef(false);

  useEffect(() => {
    if (i >= STAGES.length) {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      (async () => {
        await markIntakeDone().catch(() => null);
        router.push("/report");
      })();
      return;
    }
    const start = performance.now();
    const dur = STAGES[i].ms;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const total = (i + t) / STAGES.length;
      setPct(total * 100);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setI(i + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [i, router]);

  const skip = async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    await markIntakeDone().catch(() => null);
    router.push("/report");
  };

  return (
    <div className="gen">
      <div className="gen-l">
        <div className="gen-kicker">§ agents working · ~15 seconds</div>
        <h1 className="gen-lede">
          Three agents are reading you, the world, and each other.
          <span className="gen-cur" aria-hidden="true"></span>
        </h1>
        <p className="gen-caption">
          Anamnesis reads your commits, writing and voice. Scout crawls 1,240
          sources for this week&apos;s opportunities. Strategist argues the
          match and drafts a 90-day path. You land on your self-portrait when
          they&apos;re done.
        </p>
        <div className="gen-bar">
          <i style={{ width: pct + "%" }}></i>
        </div>
        <div className="gen-pct">{Math.round(pct)}%</div>
      </div>
      <div className="gen-r">
        <div className="gen-figcap">Fig. live · agent pipeline, this run</div>
        <ol className="gen-stages">
          {STAGES.map((s, n) => {
            const done = n < i;
            const active = n === i;
            return (
              <li
                key={s.k}
                className={"gen-st " + (done ? "done" : active ? "on" : "")}
              >
                <span className="gen-st-dot" aria-hidden="true"></span>
                <div className="gen-st-body">
                  <div className="gen-st-label">
                    <span>{s.label}</span>
                    <span className="gen-st-status">
                      {done ? "done" : active ? "running…" : "queued"}
                    </span>
                  </div>
                  <div className="gen-st-detail">{s.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="gen-foot">
          You can stay, or skip, the run continues in the background and lands
          on your radar either way.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button type="button" className="btn ghost sm" onClick={skip}>
            Skip to radar
          </button>
        </div>
      </div>
    </div>
  );
}
