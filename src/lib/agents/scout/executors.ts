import "server-only";

import * as dns from "dns";
import * as net from "net";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FetchUrlInput,
  FetchUrlResult,
  MarkDiscardedInput,
  MarkDiscardedResult,
  UpsertOpportunityResult,
} from "./types";
import type { SuggestSourceInput } from "./tool-spec";
import type { OpportunityCategory, OpportunityType } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

/** Returns true if the IP is in a private/loopback/link-local range. */
function isPrivateIp(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1") return true;
  // IPv4-mapped IPv6
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const addr = v4mapped ? v4mapped[1] : ip;

  if (!net.isIPv4(addr)) {
    // Block all non-public IPv6 except what we explicitly allow
    // ULA (fc00::/7), link-local (fe80::/10), loopback (::1 already handled)
    return /^(fc|fd|fe[89ab])/i.test(addr);
  }

  const parts = addr.split(".").map(Number);
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local + metadata IP 169.254.169.254)
  if (a === 169 && b === 254) return true;
  return false;
}

async function ssrfCheck(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid_url";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "protocol_not_allowed";
  }
  const hostname = parsed.hostname;
  if (hostname === "localhost") return "ssrf_blocked";

  // Resolve hostname to catch DNS rebinding on a best-effort basis.
  let resolvedIp: string;
  try {
    const result = await dns.promises.lookup(hostname, { family: 0 });
    resolvedIp = result.address;
  } catch {
    return "dns_resolution_failed";
  }
  if (isPrivateIp(resolvedIp)) return "ssrf_blocked";
  return null;
}

// ---------------------------------------------------------------------------
// Strip HTML tags (crude plaintext extraction)
// ---------------------------------------------------------------------------

function stripHtml(raw: string): string {
  // Remove script/style blocks with content
  let text = raw.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ---------------------------------------------------------------------------
// fetch_url executor
// NOTE: The Scout MA agent uses native web_fetch instead of this executor.
// Kept here for potential reuse as the SSRF guard is generally useful.
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 500_000;
const DEFAULT_MAX_CHARS = 8_000;
const USER_AGENT = "Radar/1.0 (+https://github.com/pablo-aa/radar)";

export async function executeFetchUrl(
  input: FetchUrlInput,
): Promise<FetchUrlResult> {
  const maxChars = input.max_chars ?? DEFAULT_MAX_CHARS;

  const ssrfError = await ssrfCheck(input.url);
  if (ssrfError === "ssrf_blocked" || ssrfError === "protocol_not_allowed") {
    return { ok: false, error: "ssrf_blocked", detail: ssrfError };
  }
  if (ssrfError === "invalid_url") {
    return { ok: false, error: "fetch_failed", detail: "invalid_url" };
  }
  if (ssrfError === "dns_resolution_failed") {
    return { ok: false, error: "fetch_failed", detail: "dns_resolution_failed" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await globalThis.fetch(input.url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("timed out")) {
      return { ok: false, error: "timeout", detail: msg };
    }
    return { ok: false, error: "fetch_failed", detail: msg };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "http_error",
      detail: `HTTP ${response.status} ${response.statusText}`,
    };
  }

  const contentType = response.headers.get("content-type");

  // Read body with size cap.
  let rawText: string;
  try {
    const buffer = await response.arrayBuffer();
    const capped = buffer.byteLength > MAX_RESPONSE_BYTES
      ? buffer.slice(0, MAX_RESPONSE_BYTES)
      : buffer;
    rawText = new globalThis.TextDecoder("utf-8", { fatal: false }).decode(capped);
  } catch (err: unknown) {
    return {
      ok: false,
      error: "fetch_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const isHtml =
    !contentType ||
    contentType.includes("html") ||
    contentType.includes("xml");
  const plaintext = isHtml ? stripHtml(rawText) : rawText;
  const truncated = plaintext.length > maxChars;
  const text_excerpt = plaintext.slice(0, maxChars);

  return {
    ok: true,
    status: response.status,
    content_type: contentType,
    text_excerpt,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// Narrow helpers shared by upsert_opportunity
// ---------------------------------------------------------------------------

const VALID_CATEGORIES = new Set<string>([
  "dated_one_shot",
  "recurrent_annual",
  "rolling",
  "arena",
]);

const VALID_OPPORTUNITY_TYPES = new Set<string>([
  "grant",
  "fellowship",
  "scholarship",
  "accelerator",
  "arena",
  "competition",
  "event",
  "community",
  "internship",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const filtered = v.filter((x): x is string => typeof x === "string");
  return filtered.length > 0 ? filtered : null;
}

// ---------------------------------------------------------------------------
// upsert_opportunity executor
// ---------------------------------------------------------------------------

export async function executeUpsertOpportunity(
  raw: Record<string, unknown>,
  scoutRunId: string,
): Promise<UpsertOpportunityResult> {
  // Validate required fields.
  const source_url =
    typeof raw["source_url"] === "string" && raw["source_url"].length > 0
      ? raw["source_url"]
      : null;
  const title =
    typeof raw["title"] === "string" && raw["title"].length > 0
      ? raw["title"]
      : null;
  const opportunity_type =
    typeof raw["opportunity_type"] === "string" &&
    VALID_OPPORTUNITY_TYPES.has(raw["opportunity_type"])
      ? (raw["opportunity_type"] as OpportunityType)
      : null;

  if (!source_url || !title || !opportunity_type) {
    return { ok: false, error: "invalid_input", detail: "source_url, title, and opportunity_type are required" };
  }

  const category: OpportunityCategory = (
    typeof raw["category"] === "string" && VALID_CATEGORIES.has(raw["category"])
      ? raw["category"]
      : "rolling"
  ) as OpportunityCategory;

  const org = typeof raw["org"] === "string" ? raw["org"] : null;
  const loc = typeof raw["loc"] === "string" ? raw["loc"] : null;
  const deadline = typeof raw["deadline"] === "string" ? raw["deadline"] : null;
  const funding_brl =
    typeof raw["funding_brl"] === "string" ? raw["funding_brl"] : null;
  const commitment =
    typeof raw["commitment"] === "string" ? raw["commitment"] : null;
  const status = typeof raw["status"] === "string" ? raw["status"] : null;
  const badge = typeof raw["badge"] === "string" ? raw["badge"] : null;
  const seniority = toStringArray(raw["seniority"]);
  const audience = toStringArray(raw["audience"]);
  const location_req = isRecord(raw["location_req"])
    ? (raw["location_req"] as Record<string, unknown>)
    : null;
  const deep_data = isRecord(raw["deep_data"])
    ? (raw["deep_data"] as Record<string, unknown>)
    : {};

  const admin = createAdminClient();

  // Dedup by source_url.
  const existing = await admin
    .from("opportunities")
    .select("id, title")
    .eq("source_url", source_url)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: "db_error", detail: existing.error.message };
  }

  if (existing.data) {
    // UPDATE existing row.
    const update = await admin
      .from("opportunities")
      .update({
        title,
        org,
        loc,
        category,
        opportunity_type,
        deadline,
        funding_brl,
        commitment,
        status,
        badge,
        seniority,
        audience,
        location_req: location_req ?? undefined,
        deep_data,
        scout_run_id: scoutRunId,
        found_at: new Date().toISOString(),
      })
      .eq("id", existing.data.id)
      .select("id")
      .single();

    if (update.error) {
      return { ok: false, error: "db_error", detail: update.error.message };
    }
    return { ok: true, id: update.data.id, action: "updated" };
  }

  // Check for same title with different source_url (soft duplicate hint).
  const titleDup = await admin
    .from("opportunities")
    .select("id")
    .eq("title", title)
    .neq("source_url", source_url)
    .maybeSingle();

  const deepDataWithDupHint: Record<string, unknown> = { ...deep_data };
  if (!titleDup.error && titleDup.data) {
    deepDataWithDupHint["potential_duplicate_of"] = titleDup.data.id;
  }

  // INSERT new row.
  const insert = await admin
    .from("opportunities")
    .insert({
      source_url,
      title,
      org,
      loc,
      category,
      opportunity_type,
      deadline,
      funding_brl,
      commitment,
      status,
      badge,
      seniority,
      audience,
      location_req: location_req ?? undefined,
      deep_data: deepDataWithDupHint,
      scout_run_id: scoutRunId,
      found_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insert.error) {
    return { ok: false, error: "db_error", detail: insert.error.message };
  }
  return { ok: true, id: insert.data.id, action: "inserted" };
}

// ---------------------------------------------------------------------------
// suggest_source executor
// ---------------------------------------------------------------------------

export interface SuggestSourceResult {
  ok: boolean;
  url?: string;
  action?: "inserted" | "updated";
  error?: string;
}

const URL_PROTOCOL_RE = /^https?:\/\/.+/;

export async function executeSuggestSource(
  input: SuggestSourceInput,
  scoutRunId: string,
): Promise<SuggestSourceResult> {
  if (!URL_PROTOCOL_RE.test(input.url)) {
    return { ok: false, error: "invalid_url" };
  }

  const admin = createAdminClient();

  // Check if already exists to determine action label
  const existing = await admin
    .from("scout_queue")
    .select("url, visit_count, citation_count")
    .eq("url", input.url)
    .maybeSingle();

  if (existing.error) {
    return { ok: false, error: "db_error" };
  }

  if (existing.data) {
    // UPDATE: increment citation_count, recalculate priority_score
    const newCitation = existing.data.citation_count + 1;
    const newPriority = newCitation / (existing.data.visit_count + 1.0);
    const upd = await admin
      .from("scout_queue")
      .update({
        citation_count: newCitation,
        priority_score: newPriority,
      })
      .eq("url", input.url);

    if (upd.error) {
      return { ok: false, error: "db_error" };
    }
    return { ok: true, url: input.url, action: "updated" };
  }

  // INSERT
  const ins = await admin.from("scout_queue").insert({
    url: input.url,
    hint: input.hint,
    opportunity_type: input.opportunity_type,
    discovered_from: scoutRunId,
    citation_count: 1,
    priority_score: 1.0,
    status: "pending",
  });

  if (ins.error) {
    return { ok: false, error: "db_error" };
  }
  return { ok: true, url: input.url, action: "inserted" };
}

// ---------------------------------------------------------------------------
// mark_discarded executor
// ---------------------------------------------------------------------------

export async function executeMarkDiscarded(
  raw: Record<string, unknown>,
): Promise<MarkDiscardedResult> {
  const host = typeof raw["host"] === "string" ? raw["host"] : null;
  const scout_run_id =
    typeof raw["scout_run_id"] === "string" ? raw["scout_run_id"] : null;
  const reason = typeof raw["reason"] === "string" ? raw["reason"] : null;

  if (!host || !scout_run_id || !reason) {
    return { ok: false, error: "db_error", detail: "host, scout_run_id, and reason are required" };
  }

  const admin = createAdminClient();
  const result = await admin.from("scout_discarded").insert({
    host,
    path: typeof raw["path"] === "string" ? raw["path"] : null,
    reason: reason as MarkDiscardedInput["reason"],
    detail: typeof raw["detail"] === "string" ? raw["detail"] : null,
    scout_run_id,
    decided_at: new Date().toISOString(),
  });

  if (result.error) {
    return { ok: false, error: "db_error", detail: result.error.message };
  }
  return { ok: true };
}
