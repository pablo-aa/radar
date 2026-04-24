// Static scout event stream used by the Scout live view.
// Phase 2E will replace this with a real poll of scout_runs + scout_discarded.

export type ScoutEventVerb =
  | "found"
  | "parse"
  | "fetch"
  | "dup"
  | "match"
  | "err"
  | "skip";

export type ScoutEvent = {
  t: string;
  v: ScoutEventVerb;
  host: string;
  note: string;
};

export type ScoutQueueRow = {
  name: string;
  loc: string;
  status: "found" | "done" | "active" | "queued";
  pct: number;
  note?: string;
};

export type ScoutMetrics = {
  elapsed: string;
  sources: string;
  fetched: string;
  parsed: string;
  candidates: string;
  confirmed: string;
  duplicates: string;
  errors: string;
};

export const SCOUT_EVENTS: ScoutEvent[] = [
  { t: "14:08:02", v: "found", host: "mercatus.org", note: "op_0142 · Emergent Ventures · fit 84" },
  { t: "14:08:01", v: "parse", host: "mercatus.org", note: "schema.org/GrantedBy · 1 opportunity extracted" },
  { t: "14:08:00", v: "fetch", host: "mercatus.org", note: "GET /emergent-ventures (200, 42kb, 410ms)" },
  { t: "14:07:58", v: "dup", host: "fapesp.br", note: "#0142 already indexed, skipping" },
  { t: "14:07:55", v: "parse", host: "fapesp.br", note: "edital 2026/07 · deadline unchanged" },
  { t: "14:07:54", v: "fetch", host: "fapesp.br", note: "GET /pipe (200, 116kb, 612ms)" },
  { t: "14:07:52", v: "match", host: "openphilanthropy.org", note: "rfp: interpretability · scoring profile" },
  { t: "14:07:50", v: "fetch", host: "openphilanthropy.org", note: "GET /focus/ai/technical (200, 84kb, 489ms)" },
  { t: "14:07:48", v: "err", host: "serrapilheira.org", note: "429 throttled · backing off 45s" },
  { t: "14:07:45", v: "fetch", host: "serrapilheira.org", note: "GET /chamadas (attempt 2)" },
  { t: "14:07:42", v: "skip", host: "linkedin.com", note: "content-type: jobs · out of scope" },
  { t: "14:07:40", v: "parse", host: "estudar.org.br", note: "3 programmes · 1 new candidate" },
  { t: "14:07:38", v: "fetch", host: "estudar.org.br", note: "GET /programas/bolsas (200, 38kb, 302ms)" },
  { t: "14:07:35", v: "dup", host: "chevening.org", note: "#0131 unchanged from 2026-04-15 crawl" },
  { t: "14:07:32", v: "fetch", host: "chevening.org", note: "GET /scholarship/brazil (200, 72kb, 540ms)" },
  { t: "14:07:29", v: "found", host: "metr.org", note: "op_0173 · METR task arena · fit 73" },
  { t: "14:07:27", v: "parse", host: "metr.org", note: "json-ld · 14 arenas detected" },
  { t: "14:07:25", v: "fetch", host: "metr.org", note: "GET /tasks (200, 218kb, 811ms)" },
  { t: "14:07:20", v: "match", host: "studyinjapan.go.jp", note: "MEXT research · profile alignment 0.71" },
  { t: "14:07:18", v: "fetch", host: "studyinjapan.go.jp", note: "GET /planning/about-mext (200, 48kb)" },
  { t: "14:07:15", v: "skip", host: "workatastartup.com", note: "job-board pattern · out of scope" },
  { t: "14:07:12", v: "parse", host: "huggingface.co", note: "leaderboard: PT-BR · 14 submissions" },
  { t: "14:07:10", v: "fetch", host: "huggingface.co", note: "GET /leaderboards/pt-br (200, 62kb)" },
  { t: "14:07:07", v: "dup", host: "pythonbrasil.org.br", note: "#0175 unchanged since CFP open" },
  { t: "14:07:05", v: "fetch", host: "pythonbrasil.org.br", note: "GET /2026/cfp (200, 22kb)" },
  { t: "14:07:00", v: "err", host: "capes.gov.br", note: "503 · retry queued" },
  { t: "14:06:58", v: "fetch", host: "capes.gov.br", note: "GET /editais (attempt 1)" },
  { t: "14:06:55", v: "skip", host: "gupy.io", note: "job-board pattern · out of scope" },
  { t: "14:06:52", v: "parse", host: "ycombinator.com", note: "season: summer 2026 · rolling review" },
  { t: "14:06:50", v: "fetch", host: "ycombinator.com", note: "GET /apply (200, 92kb, 540ms)" },
  { t: "14:06:47", v: "match", host: "mercatus.org", note: "thesis: unusual talent · alignment 0.91" },
  { t: "14:06:44", v: "parse", host: "sebrae.com.br", note: "fomento estadual · 8 chamadas" },
  { t: "14:06:42", v: "fetch", host: "sebrae.com.br", note: "GET /fomento (200, 154kb)" },
  { t: "14:06:39", v: "dup", host: "finep.gov.br", note: "#0089 unchanged since last week" },
  { t: "14:06:36", v: "fetch", host: "finep.gov.br", note: "GET /editais (200, 88kb)" },
];

export const SCOUT_QUEUE: ScoutQueueRow[] = [
  { name: "mercatus.org", loc: "US", status: "found", pct: 100 },
  { name: "fapesp.br", loc: "BR", status: "done", pct: 100 },
  { name: "openphilanthropy.org", loc: "US", status: "active", pct: 72 },
  { name: "serrapilheira.org", loc: "BR", status: "queued", pct: 0, note: "429 backoff" },
  { name: "studyinjapan.go.jp", loc: "JP", status: "active", pct: 41 },
  { name: "huggingface.co", loc: "FR", status: "done", pct: 100 },
  { name: "metr.org", loc: "US", status: "found", pct: 100 },
  { name: "ycombinator.com", loc: "US", status: "done", pct: 100 },
  { name: "chevening.org", loc: "UK", status: "done", pct: 100 },
  { name: "estudar.org.br", loc: "BR", status: "done", pct: 100 },
  { name: "capes.gov.br", loc: "BR", status: "queued", pct: 0, note: "retry queued" },
  { name: "finep.gov.br", loc: "BR", status: "done", pct: 100 },
  { name: "sebrae.com.br", loc: "BR", status: "active", pct: 88 },
  { name: "pythonbrasil.org.br", loc: "BR", status: "done", pct: 100 },
];

export const SCOUT_METRICS: ScoutMetrics = {
  elapsed: "47m 22s",
  sources: "14 of 18",
  fetched: "214 pages",
  parsed: "1,842 nodes",
  candidates: "31 considered",
  confirmed: "7 new · 4 updated",
  duplicates: "86 skipped",
  errors: "2 (retry queued)",
};
