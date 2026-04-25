import "server-only";
import { Resend } from "resend";

let _client: Resend | null = null;

export function getResendClient(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Set it in .env.local and on Vercel.",
    );
  }
  _client = new Resend(key);
  return _client;
}

// Sender. Falls back to onboarding@resend.dev for MVP if RESEND_FROM is not set.
export function getResendFrom(): string {
  return process.env.RESEND_FROM ?? "Radar <onboarding@resend.dev>";
}

export const RESEND_FROM_DEFAULT = "Radar <onboarding@resend.dev>";
