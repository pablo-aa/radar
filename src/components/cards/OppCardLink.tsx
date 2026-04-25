import Link from "next/link";
import type { Opportunity } from "@/lib/supabase/types";
import type {
  BulkScoreEntry,
  PickOverride,
} from "@/lib/agents/strategist/output-reader";
import OppCard from "./OppCard";

export default function OppCardLink({
  o,
  pick,
  score,
}: {
  o: Opportunity;
  pick?: PickOverride;
  score?: BulkScoreEntry;
}) {
  return (
    <Link
      href={`/opp/${o.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <OppCard o={o} pick={pick} score={score} />
    </Link>
  );
}
