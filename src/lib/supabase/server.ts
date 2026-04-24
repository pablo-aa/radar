// Server-side Supabase client. Bridges the Next 16 async cookies() API
// into @supabase/ssr. Safe to call from Server Components, Route Handlers,
// and Server Actions. RLS still applies; anon key is used unless a session
// cookie is present.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// @supabase/ssr@0.5.x was typed against an older supabase-js. Its
// createServerClient returns SupabaseClient<Database, SchemaName, Schema>,
// but supabase-js@2.104 added a new generic slot (ClientOptions), so the
// positional generics no longer line up and .from('table').update(...) ends
// up resolving to `never`. We assert the return type through the v2.104
// signature so downstream code gets correct Row/Insert/Update types.
export async function createClient(): Promise<SupabaseClient<Database, "public">> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  const cookieStore = await cookies();

  const client = createServerClient<Database, "public">(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Setting cookies from a pure Server Component is a no-op; middleware
          // will refresh the session on the next request.
        }
      },
    },
  });

  return client as unknown as SupabaseClient<Database, "public">;
}
