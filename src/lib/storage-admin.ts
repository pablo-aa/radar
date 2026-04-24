// Server-side helpers for signed Storage URLs.
// Uses the service-role admin client (bypasses storage RLS). Hard-gated
// against accidental client bundling by `import "server-only"`.
// If a Client Component imports from this file, the build fails.

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const CV_BUCKET = "cvs";
const VOICE_BUCKET = "voice";
const DEFAULT_TTL_SECONDS = 3600;

async function signedUrl(
  bucket: string,
  path: string,
  ttlSeconds: number,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);

  if (error || !data) {
    console.error(
      `[storage-admin.signedUrl] failed for ${bucket}/${path}`,
      error,
    );
    return null;
  }
  return data.signedUrl;
}

/**
 * Server-side: create a signed URL for a CV file. Default TTL 1 hour.
 */
export async function signedCVUrl(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  return signedUrl(CV_BUCKET, path, ttlSeconds);
}

/**
 * Server-side: create a signed URL for a voice note. Default TTL 1 hour.
 */
export async function signedVoiceUrl(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  return signedUrl(VOICE_BUCKET, path, ttlSeconds);
}
