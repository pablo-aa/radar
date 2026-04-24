// Supabase Storage helpers for browser-side uploads.
// Uses the anon client; storage RLS scopes writes to the user's own folder.
// Server-side signed URL helpers live in storage-admin.ts (service role,
// import "server-only" guarded). Splitting prevents the admin client from
// ever bundling into a Client Component.

/* global File, Blob, crypto */

import { createClient } from "@/lib/supabase/client";

const CV_BUCKET = "cvs";
const VOICE_BUCKET = "voice";

const CV_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const VOICE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const CV_MIME_ALLOWED = new Set<string>(["application/pdf"]);
const VOICE_MIME_ALLOWED = new Set<string>([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
]);

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildPath(userId: string, filename: string): string {
  return `${userId}/${crypto.randomUUID()}-${safeFilename(filename)}`;
}

/**
 * Upload a CV PDF for the given user. Returns the storage path.
 * Throws on invalid mime, oversize, or upload failure.
 */
export async function uploadCV(
  userId: string,
  file: File,
): Promise<{ path: string }> {
  if (!CV_MIME_ALLOWED.has(file.type)) {
    throw new Error("CV must be a PDF (application/pdf).");
  }
  if (file.size > CV_MAX_BYTES) {
    throw new Error("CV exceeds 10 MB limit.");
  }

  const path = buildPath(userId, file.name);
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(CV_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`CV upload failed: ${error.message}`);
  }

  return { path };
}

/**
 * Upload a voice-note blob for the given user. Returns the storage path.
 * Throws on invalid mime, oversize, or upload failure.
 */
export async function uploadVoiceNote(
  userId: string,
  blob: Blob,
  filename?: string,
): Promise<{ path: string }> {
  if (!VOICE_MIME_ALLOWED.has(blob.type)) {
    throw new Error(
      "Voice note must be audio/webm, audio/ogg, or audio/mp4.",
    );
  }
  if (blob.size > VOICE_MAX_BYTES) {
    throw new Error("Voice note exceeds 5 MB limit.");
  }

  const name = filename ?? `voice-${Date.now()}.webm`;
  const path = buildPath(userId, name);
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });

  if (error) {
    throw new Error(`Voice upload failed: ${error.message}`);
  }

  return { path };
}
