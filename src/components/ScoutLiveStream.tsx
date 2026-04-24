"use client";

// Animates the scout event stream + queue. Reads initial data from props.

import { Fragment, useEffect, useState } from "react";
import type {
  ScoutEvent,
  ScoutMetrics,
  ScoutQueueRow,
} from "@/lib/sample-data/scout-events";

type Props = {
  initialEvents: ScoutEvent[];
  allEvents: ScoutEvent[];
  initialQueue: ScoutQueueRow[];
  metrics: ScoutMetrics;
};

type Finding = { id: string; tag: string; title: string; fit: number };

const FINDINGS: Finding[] = [
  { id: "op_0142", tag: "found", title: "Emergent Ventures · Mercatus Center", fit: 84 },
  { id: "op_0155", tag: "found", title: "Open Philanthropy · Technical AI RFP", fit: 69 },
  { id: "op_0173", tag: "found", title: "METR · Frontier Model Eval Arena", fit: 73 },
  { id: "op_0171", tag: "updated", title: "HF PT-BR leaderboard · new weights", fit: 88 },
];

export default function ScoutLiveStream({
  initialEvents,
  allEvents,
  initialQueue,
  metrics,
}: Props) {
  const [events, setEvents] = useState<ScoutEvent[]>(initialEvents);
  const [, setIdx] = useState<number>(initialEvents.length);
  const [queue, setQueue] = useState<ScoutQueueRow[]>(initialQueue);

  useEffect(() => {
    if (allEvents.length === 0) return;
    const id = setInterval(() => {
      setIdx((prev) => {
        const next = (prev + 1) % allEvents.length;
        setEvents((evs) => [allEvents[next], ...evs].slice(0, 26));
        return next;
      });
      setQueue((q) =>
        q.map((row) => {
          if (row.status === "active") {
            const pct = Math.min(
              100,
              row.pct + 2 + Math.floor(Math.random() * 5),
            );
            return {
              ...row,
              pct,
              status: pct === 100 ? "done" : "active",
            };
          }
          return row;
        }),
      );
    }, 520);
    return () => clearInterval(id);
  }, [allEvents]);

  const queueDone = queue.filter(
    (q) => q.status === "done" || q.status === "found",
  ).length;

  return (
    <div className="scout-grid">
      <div className="scout-pane">
        <h3>
          <span>Live event stream · tail -f scout.log</span>
          <span className="meta">{events.length} / 214 shown</span>
        </h3>
        <div className="stream">
          {events.map((e, i) => (
            <div
              key={i + "_" + e.t}
              className={"row " + (e.v === "found" ? "found" : "")}
            >
              <span className="t">{e.t}</span>
              <span className={"v " + e.v}>{e.v.toUpperCase()}</span>
              <span className="note">
                <span className="host">{e.host}</span> · {e.note}
              </span>
              <span className="t">
                #{String(214 - i).padStart(4, "0")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="scout-pane queue">
        <h3>
          <span>Source queue · this cycle</span>
          <span className="meta">
            {queueDone}/{queue.length}
          </span>
        </h3>
        {queue.map((q, i) => (
          <Fragment key={i}>
            <div className={"q-row " + q.status}>
              <span className="name">
                {q.name}
                {q.note ? " · " + q.note : ""}
              </span>
              <span className="loc">{q.loc}</span>
              <span className="loc">
                {q.status === "found" ? "new" : q.status}
              </span>
            </div>
            <div
              className="q-row"
              style={{
                paddingTop: 0,
                borderTop: 0,
                gridTemplateColumns: "1fr",
              }}
            >
              <div className="bar">
                <i style={{ width: q.pct + "%" }}></i>
              </div>
            </div>
          </Fragment>
        ))}

        <div className="metrics">
          <div className="m">
            <div className="k">Pages fetched</div>
            <div className="v">{metrics.fetched}</div>
          </div>
          <div className="m">
            <div className="k">Nodes parsed</div>
            <div className="v">{metrics.parsed}</div>
          </div>
          <div className="m">
            <div className="k">Candidates</div>
            <div className="v">{metrics.candidates}</div>
          </div>
          <div className="m">
            <div className="k">Duplicates</div>
            <div className="v">{metrics.duplicates}</div>
          </div>
        </div>

        <div className="findings">
          <h3>New + updated this cycle</h3>
          {FINDINGS.map((f, i) => (
            <div key={i} className="f">
              <span className="ttl">
                <span className="tag">{f.tag}</span>
                {f.title}
              </span>
              <span className="fit">fit {f.fit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
