import Link from "next/link";
import type { Opportunity } from "@/lib/supabase/types";
import OppCard from "./OppCard";

export default function OppCardLink({ o }: { o: Opportunity }) {
  return (
    <Link
      href={`/opp/${o.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <OppCard o={o} />
    </Link>
  );
}
