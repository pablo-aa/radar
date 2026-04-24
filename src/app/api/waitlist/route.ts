// POST /api/waitlist
//
// Public waitlist signup. Inserts a row into the `waitlist` table via the
// admin (service-role) client so we can also detect unique-violation on
// github_handle. No auth required: this is the public form on /waitlist.
//
// Response shapes:
//   200: { ok: true, position: number }
//   400: { error: string }   // validation
//   409: { error: "already_on_list" }
//   500: { error: "server_error" }

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type WaitlistBody = {
  name: string;
  email: string;
  github_handle: string;
  phone: string;
  linkedin_url: string;
  career_moment: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE_RE = /^[a-zA-Z0-9-]{1,39}$/;
const URL_RE = /^https?:\/\//;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

type Validation =
  | { ok: true; body: WaitlistBody }
  | { ok: false; reason: string };

function validate(raw: unknown): Validation {
  if (!isRecord(raw)) return { ok: false, reason: "invalid_body" };

  const name = asString(raw.name)?.trim();
  if (!name) return { ok: false, reason: "missing_name" };
  if (name.length > 100) return { ok: false, reason: "name_too_long" };

  const email = asString(raw.email)?.trim();
  if (!email) return { ok: false, reason: "missing_email" };
  if (email.length > 200) return { ok: false, reason: "email_too_long" };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };

  let handle = asString(raw.github_handle)?.trim();
  if (!handle) return { ok: false, reason: "missing_github_handle" };
  if (handle.startsWith("@")) handle = handle.slice(1);
  if (!HANDLE_RE.test(handle)) {
    return { ok: false, reason: "invalid_github_handle" };
  }

  const phone = asString(raw.phone)?.trim();
  if (!phone) return { ok: false, reason: "missing_phone" };
  if (phone.length < 8 || phone.length > 30) return { ok: false, reason: "invalid_phone" };

  const linkedin_url = asString(raw.linkedin_url)?.trim();
  if (!linkedin_url) return { ok: false, reason: "missing_linkedin_url" };
  if (!URL_RE.test(linkedin_url) || linkedin_url.length > 300) {
    return { ok: false, reason: "invalid_linkedin_url" };
  }

  const career_moment = asString(raw.career_moment)?.trim();
  if (!career_moment) return { ok: false, reason: "missing_career_moment" };
  if (career_moment.length > 1000) return { ok: false, reason: "career_moment_too_long" };

  return {
    ok: true,
    body: { name, email, github_handle: handle, phone, linkedin_url, career_moment },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const v = validate(raw);
  if (!v.ok) {
    return NextResponse.json({ error: v.reason }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[api/waitlist] admin client init failed", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  // `waitlist` is not in the typed Database yet; cast through unknown to a
  // minimal client view so we keep TS strict without using `any`.
  type WaitlistRow = {
    name: string;
    email: string;
    github_handle: string;
    phone: string;
    linkedin_url: string;
    career_moment: string;
  };
  type MinimalAdmin = {
    from(table: "waitlist"): {
      insert(row: WaitlistRow): Promise<{
        error: { code?: string; message: string } | null;
      }>;
      select(cols: string, opts?: { count: "exact"; head: true }): Promise<{
        count: number | null;
        error: { message: string } | null;
      }>;
    };
  };
  const db = admin as unknown as MinimalAdmin;

  const insert = await db.from("waitlist").insert({
    name: v.body.name,
    email: v.body.email,
    github_handle: v.body.github_handle,
    phone: v.body.phone,
    linkedin_url: v.body.linkedin_url,
    career_moment: v.body.career_moment,
  });

  if (insert.error) {
    if (insert.error.code === "23505") {
      return NextResponse.json({ error: "already_on_list" }, { status: 409 });
    }
    console.error("[api/waitlist] insert failed", insert.error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  const countRes = await db
    .from("waitlist")
    .select("*", { count: "exact", head: true });

  if (countRes.error) {
    console.error("[api/waitlist] count failed", countRes.error);
    // The insert already succeeded; report position 0 rather than 500.
    return NextResponse.json({ ok: true, position: 0 });
  }

  return NextResponse.json({ ok: true, position: countRes.count ?? 0 });
}
