// Anamnesis tool specs and executor functions.
// Tools use globalThis.fetch (GitHub is a simple JSON API; no SSE buffering
// issues, and Next.js fetch patching is fine for short one-shot responses).

import "server-only";

// ---------------------------------------------------------------------------
// Tool specs (Anthropic messages.create format)
// ---------------------------------------------------------------------------

export const ANAMNESIS_TOOLS = [
  {
    name: "fetch_github_profile",
    description:
      "Fetch basic public profile metadata for a GitHub user. Returns login, name, bio, company, location, followers, public_repos, avatar_url, and created_at. Returns an error object if the handle is invalid, the user is not found, or the API is rate-limited.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: {
          type: "string",
          description: "GitHub username (login), e.g. 'torvalds'",
        },
      },
      required: ["handle"],
    },
  },
  {
    name: "fetch_github_repos",
    description:
      "Fetch up to 10 public repositories for a GitHub user, ordered by star count descending. Each repo includes name, description, primary language, stargazers_count, updated_at, fork flag, and a readme_excerpt (first 2000 chars of the README, best-effort). Returns an error object on API failure or rate limit.",
    input_schema: {
      type: "object" as const,
      properties: {
        handle: {
          type: "string",
          description: "GitHub username (login), e.g. 'torvalds'",
        },
      },
      required: ["handle"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Narrow helpers
// ---------------------------------------------------------------------------

const HANDLE_RE = /^[a-zA-Z0-9-]{1,39}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function pickBool(obj: Record<string, unknown>, key: string): boolean {
  return obj[key] === true;
}

// ---------------------------------------------------------------------------
// fetch_github_profile executor
// ---------------------------------------------------------------------------

export type GitHubProfileResult =
  | {
      login: string;
      name: string | null;
      bio: string | null;
      company: string | null;
      location: string | null;
      followers: number;
      public_repos: number;
      avatar_url: string | null;
      created_at: string | null;
    }
  | { error: "rate_limited"; retry_after_s?: number }
  | { error: "not_found" }
  | { error: "invalid_handle" }
  | { error: "fetch_failed"; status: number }
  | { error: "parse_failed" };

export async function executeFetchGithubProfile(
  handle: string,
): Promise<GitHubProfileResult> {
  if (!HANDLE_RE.test(handle)) {
    return { error: "invalid_handle" };
  }

  let response: Response;
  try {
    response = await globalThis.fetch(
      `https://api.github.com/users/${encodeURIComponent(handle)}`,
      {
        headers: {
          "User-Agent": "radar-anamnesis-agent",
          Accept: "application/vnd.github+json",
        },
      },
    );
  } catch {
    return { error: "fetch_failed", status: 0 };
  }

  if (response.status === 404) {
    return { error: "not_found" };
  }

  if (response.status === 403 || response.status === 429) {
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfterS =
      retryAfterRaw !== null ? parseInt(retryAfterRaw, 10) : undefined;
    return {
      error: "rate_limited",
      retry_after_s: Number.isFinite(retryAfterS) ? retryAfterS : undefined,
    };
  }

  if (!response.ok) {
    return { error: "fetch_failed", status: response.status };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { error: "parse_failed" };
  }

  if (!isRecord(parsed)) {
    return { error: "parse_failed" };
  }

  const login = pickString(parsed, "login");
  if (!login) return { error: "parse_failed" };

  return {
    login,
    name: pickString(parsed, "name"),
    bio: pickString(parsed, "bio"),
    company: pickString(parsed, "company"),
    location: pickString(parsed, "location"),
    followers: pickNumber(parsed, "followers"),
    public_repos: pickNumber(parsed, "public_repos"),
    avatar_url: pickString(parsed, "avatar_url"),
    created_at: pickString(parsed, "created_at"),
  };
}

// ---------------------------------------------------------------------------
// fetch_github_repos executor
// ---------------------------------------------------------------------------

export interface GitHubRepoItem {
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string | null;
  fork: boolean;
  readme_excerpt: string | null;
}

export type GitHubReposResult =
  | { repos: GitHubRepoItem[] }
  | { error: "rate_limited"; retry_after_s?: number }
  | { error: "not_found" }
  | { error: "invalid_handle" }
  | { error: "fetch_failed"; status: number }
  | { error: "parse_failed" };

async function fetchReadmeExcerpt(
  handle: string,
  repoName: string,
): Promise<string | null> {
  try {
    const res = await globalThis.fetch(
      `https://api.github.com/repos/${encodeURIComponent(handle)}/${encodeURIComponent(repoName)}/readme`,
      {
        headers: {
          "User-Agent": "radar-anamnesis-agent",
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (!isRecord(json)) return null;
    const content = json["content"];
    if (typeof content !== "string") return null;
    // GitHub returns base64-encoded content with newlines
    const decoded = globalThis.Buffer.from(
      content.replace(/\n/g, ""),
      "base64",
    ).toString("utf-8");
    return decoded.slice(0, 2000) || null;
  } catch {
    return null;
  }
}

export async function executeFetchGithubRepos(
  handle: string,
): Promise<GitHubReposResult> {
  if (!HANDLE_RE.test(handle)) {
    return { error: "invalid_handle" };
  }

  let response: Response;
  try {
    response = await globalThis.fetch(
      `https://api.github.com/users/${encodeURIComponent(handle)}/repos?sort=stars&direction=desc&per_page=10&type=owner`,
      {
        headers: {
          "User-Agent": "radar-anamnesis-agent",
          Accept: "application/vnd.github+json",
        },
      },
    );
  } catch {
    return { error: "fetch_failed", status: 0 };
  }

  if (response.status === 404) {
    return { error: "not_found" };
  }

  if (response.status === 403 || response.status === 429) {
    const retryAfterRaw = response.headers.get("Retry-After");
    const retryAfterS =
      retryAfterRaw !== null ? parseInt(retryAfterRaw, 10) : undefined;
    return {
      error: "rate_limited",
      retry_after_s: Number.isFinite(retryAfterS) ? retryAfterS : undefined,
    };
  }

  if (!response.ok) {
    return { error: "fetch_failed", status: response.status };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { error: "parse_failed" };
  }

  if (!Array.isArray(parsed)) {
    return { error: "parse_failed" };
  }

  // Fetch READMEs in parallel for all repos (best-effort, errors silenced).
  const repos: GitHubRepoItem[] = await Promise.all(
    parsed.slice(0, 10).map(async (item: unknown): Promise<GitHubRepoItem> => {
      if (!isRecord(item)) {
        return {
          name: "unknown",
          description: null,
          language: null,
          stargazers_count: 0,
          updated_at: null,
          fork: false,
          readme_excerpt: null,
        };
      }
      const name = pickString(item, "name") ?? "unknown";
      const readme_excerpt = await fetchReadmeExcerpt(handle, name);
      return {
        name,
        description: pickString(item, "description"),
        language: pickString(item, "language"),
        stargazers_count: pickNumber(item, "stargazers_count"),
        updated_at: pickString(item, "updated_at"),
        fork: pickBool(item, "fork"),
        readme_excerpt,
      };
    }),
  );

  return { repos };
}

// ---------------------------------------------------------------------------
// Dispatcher: routes tool_use calls by name
// ---------------------------------------------------------------------------

export async function executeAnamnosisTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const handle =
    typeof input["handle"] === "string" ? input["handle"] : "";

  if (name === "fetch_github_profile") {
    return executeFetchGithubProfile(handle);
  }
  if (name === "fetch_github_repos") {
    return executeFetchGithubRepos(handle);
  }
  return { error: "unknown_tool", tool: name };
}
