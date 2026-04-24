// POST /api/anamnesis/fetch-site
//
// Helper for the intake form to preview a personal site (title + meta
// description). Server-side fetch with a 5s timeout and a 100KB cap so the
// endpoint cannot be turned into a slow proxy. Graceful degrade: any failure
// returns 200 with `{ ok: false, error: "fetch_failed" }` so the intake form
// never crashes on a bad URL.
//
// Response shapes:
//   200 (success): { ok: true, title: string | null, description: string | null, snippet: string | null }
//   200 (fetch fail): { ok: false, error: "fetch_failed" }
//   400: { error: string }   // bad input

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 100 * 1024; // 100KB
const TIMEOUT_MS = 5000;

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const DESC_RE = /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(s: string): string {
  return decodeHtmlEntities(s).replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(raw) || typeof raw.url !== "string" || !raw.url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.url);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "invalid_protocol" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "radar-app",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    console.warn("[api/fetch-site] fetch failed", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" });
  }

  if (!response.ok || !response.body) {
    return NextResponse.json({ ok: false, error: "fetch_failed" });
  }

  // Read at most MAX_BYTES from the response body.
  let text: string;
  try {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    const merged = new Uint8Array(Math.min(total, MAX_BYTES));
    let offset = 0;
    for (const chunk of chunks) {
      const remaining = merged.byteLength - offset;
      if (remaining <= 0) break;
      const slice = chunk.subarray(0, Math.min(chunk.byteLength, remaining));
      merged.set(slice, offset);
      offset += slice.byteLength;
    }
    // eslint-disable-next-line no-undef
    text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
  } catch (err) {
    console.warn("[api/fetch-site] body read failed", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" });
  }

  const titleMatch = text.match(TITLE_RE);
  const descMatch = text.match(DESC_RE);

  const title = titleMatch ? cleanText(titleMatch[1]) || null : null;
  const description = descMatch ? cleanText(descMatch[1]) || null : null;

  return NextResponse.json({
    ok: true,
    title,
    description,
    snippet: title,
  });
}
