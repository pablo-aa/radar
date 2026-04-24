import type {
  AnamnesisHeadline as HeadlineT,
  AnamnesisTimeline,
} from "@/lib/sample-data/anamnesis-report";
import TimelineArc from "./TimelineArc";

export default function AnamnesisHeadline({
  h,
  tl,
}: {
  h: HeadlineT;
  tl: AnamnesisTimeline;
}) {
  return (
    <section className="anap-head">
      <div className="anap-head-l">
        <div className="anap-numeral">§ 01 · Opening</div>
        <h1 className="anap-lede">
          {h.lede}
          {h.cur && <span className="anap-cur" aria-hidden="true"></span>}
        </h1>
        <p className="anap-caption">{h.caption}</p>
      </div>
      <figure className="anap-head-r">
        <div className="anap-figcap">
          Fig. 01 · Trajectory. Past anchors, present position, three
          candidate futures.
        </div>
        <TimelineArc tl={tl} />
      </figure>
    </section>
  );
}
