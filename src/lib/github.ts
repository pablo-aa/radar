// Server-only GitHub profile fetcher. Uses unstable_cache to avoid hammering
// the GitHub API on every render (1-hour TTL per handle). All wire data is
// narrowed through validators so we never trust the response shape blindly.

import { unstable_cache } from "next/cache";

export type GitHubProfile = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  public_repos: number;
  followers: number;
  following: number;
  avatar_url: string | null;
  html_url: string;
  created_at: string;
};

const HANDLE_RE = /^[a-zA-Z0-9-]{1,39}$/;

let warnedRateLimit = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function pickRequiredString(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

async function fetchGitHubProfileUncached(
  handle: string,
): Promise<GitHubProfile | null> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/users/${handle}`, {
      headers: {
        "User-Agent": "radar-app",
        Accept: "application/vnd.github+json",
      },
    });
  } catch (err) {
    console.error("[github.fetchGitHubProfile] network error", err);
    return null;
  }

  if (response.status === 404) {
    return null;
  }

  if (response.status === 403) {
    if (!warnedRateLimit) {
      warnedRateLimit = true;
      console.warn(
        "[github.fetchGitHubProfile] rate-limited (403). Suppressing further warnings.",
      );
    }
    return null;
  }

  if (!response.ok) {
    console.error(
      `[github.fetchGitHubProfile] unexpected status ${response.status} for ${handle}`,
    );
    return null;
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (err) {
    console.error("[github.fetchGitHubProfile] invalid JSON", err);
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  // login and html_url are required by the GitHub API contract; bail if missing.
  const login = pickRequiredString(parsed, "login");
  const html_url = pickRequiredString(parsed, "html_url");
  const created_at = pickRequiredString(parsed, "created_at");
  if (!login || !html_url || !created_at) {
    return null;
  }

  return {
    login,
    name: pickString(parsed, "name"),
    bio: pickString(parsed, "bio"),
    company: pickString(parsed, "company"),
    location: pickString(parsed, "location"),
    blog: pickString(parsed, "blog"),
    public_repos: pickNumber(parsed, "public_repos"),
    followers: pickNumber(parsed, "followers"),
    following: pickNumber(parsed, "following"),
    avatar_url: pickString(parsed, "avatar_url"),
    html_url,
    created_at,
  };
}

/**
 * Fetch a GitHub user profile by handle, cached for 1 hour.
 * Returns null for invalid handles, 404s, rate limits, and other errors.
 * Never throws.
 */
export async function fetchGitHubProfile(
  handle: string,
): Promise<GitHubProfile | null> {
  if (!HANDLE_RE.test(handle)) {
    return null;
  }

  const cached = unstable_cache(
    async () => fetchGitHubProfileUncached(handle),
    ["github-profile", handle],
    { revalidate: 3600, tags: ["github-profile"] },
  );

  return cached();
}
