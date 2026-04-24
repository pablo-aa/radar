import Link from "next/link";
import type { Opportunity } from "@/lib/supabase/types";
import type { PickOverride } from "@/lib/agents/strategist/output-reader";
import OppCard from "./OppCard";

export default function OppCardLink({
  o,
  pick,
}: {
  o: Opportunity;
  pick?: PickOverride;
}) {
  return (
    <Link
      href={`/opp/${o.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <OppCard o={o} pick={pick} />
    </Link>
  );
}
