// Middleware helper that refreshes the Supabase session cookie on every
// request passing the matcher. Pattern from @supabase/ssr docs: create a
// response early, give Supabase cookie bridges that write to both request
// and response, then return the response so any refreshed tokens survive.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Fail closed but do not crash the app in environments that have no
    // Supabase configured. The auth callback will error loudly separately.
    return response;
  }

  const supabase = createServerClient<Database, "public">(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Forces token refresh if needed. We intentionally do not branch on the
  // user here; route-level guards (Phase 2D) will handle redirects.
  await supabase.auth.getUser();

  return response;
}
