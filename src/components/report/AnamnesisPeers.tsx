import type { AnamnesisPeers as PeersT } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisPeers({ p }: { p: PeersT }) {
  const W = 720;
  const H = 460;
  const toXY = (n: { x: number; y: number }) => ({
    x: (n.x / 100) * W,
    y: (n.y / 100) * H,
  });
  const c = toXY(p.center);

  return (
    <section className="anap-sec">
      <SecHead
        n="05"
        kicker="Seven people whose trajectories resemble yours"
        title="Peer constellation"
      />
      <p className="anap-lede-sm">{p.lede}</p>
      <div className="anap-peer-wrap">
        <figure className="anap-peer-fig">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            className="anap-peer-svg"
          >
            {[90, 160, 220].map((r, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={r}
                fill="none"
                stroke="var(--ink-5)"
                strokeWidth=".5"
                strokeDasharray={i === 2 ? "2 4" : ""}
              />
            ))}
            {p.nodes.map((n) => {
              const xy = toXY(n);
              return (
                <line
                  key={"l" + n.id}
                  x1={c.x}
                  y1={c.y}
                  x2={xy.x}
                  y2={xy.y}
                  stroke="var(--ink)"
                  strokeWidth=".4"
                  opacity=".4"
                />
              );
            })}
            {p.nodes.map((n) => {
              const xy = toXY(n);
              const right = xy.x > W / 2;
              return (
                <g key={"n" + n.id}>
                  <circle
                    cx={xy.x}
                    cy={xy.y}
                    r="6"
                    fill="var(--paper)"
                    stroke="var(--ink)"
                    strokeWidth="1"
                  />
                  <text
                    x={right ? xy.x + 11 : xy.x - 11}
                    y={xy.y + 3}
                    textAnchor={right ? "start" : "end"}
                    className="anap-peer-lbl"
                  >
                    {n.name}
                  </text>
                </g>
              );
            })}
            <circle cx={c.x} cy={c.y} r="11" fill="var(--accent)" />
            <circle
              cx={c.x}
              cy={c.y}
              r="18"
              fill="none"
              stroke="var(--accent)"
              strokeWidth=".8"
              strokeDasharray="2 3"
            />
            <text
              x={c.x}
              y={c.y + 3}
              textAnchor="middle"
              className="anap-peer-you"
            >
              you
            </text>
          </svg>
          <figcaption className="anap-figcap-b">
            Fig. 03 · Peer constellation. Ring distance = trajectory
            similarity, not fame.
          </figcaption>
        </figure>
        <ol className="anap-peer-list">
          {p.nodes.map((n) => (
            <li key={n.id}>
              <div className="anap-peer-list-hd">
                <span className="anap-peer-n">0{n.id}</span>
                <span className="anap-peer-name">{n.name}</span>
                <span className="anap-peer-ring">ring {n.ring}</span>
              </div>
              <p>{n.link}</p>
            </li>
          ))}
        </ol>
      </div>
      <p className="anap-prose anap-dim anap-note">{p.note}</p>
    </section>
  );
}
