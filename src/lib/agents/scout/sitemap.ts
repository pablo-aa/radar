import "server-only";

import type { ScoutSource } from "./types";

export interface DerivedSource {
  url: string;
  hint: string;
  opportunity_type: string;
  discovered_from: "sitemap" | "manual";
}

const SITEMAP_FETCH_TIMEOUT_MS = 10_000;

const BINARY_EXT_RE = /\.(pdf|jpg|jpeg|png|gif|svg|ico|zip|gz|tar|mp4|mp3|woff|woff2|ttf|eot|css|js|json|xml|atom|rss)$/i;

function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>([\s\S]*?)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1]?.trim();
    if (raw) locs.push(raw);
  }
  return locs;
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEMAP_FETCH_TIMEOUT_MS);
  try {
    const res = await globalThis.fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Radar/1.0 (+https://github.com/pablo-aa/radar)" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function filterUrls(urls: string[], origin: string): string[] {
  const originHost = new URL(origin).hostname;
  return urls.filter((u) => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      // same origin or subdomain
      const h = parsed.hostname;
      if (h !== originHost && !h.endsWith("." + originHost)) return false;
      // reject binary paths
      if (BINARY_EXT_RE.test(parsed.pathname)) return false;
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Fetch sitemap URLs for a given root URL. Returns up to maxUrls page URLs.
 * Checks robots.txt for Sitemap: directives first, then falls back to
 * /sitemap.xml and /sitemap_index.xml. Handles sitemap index by fetching
 * up to 3 sub-sitemaps. Never throws.
 */
export async function fetchSitemapUrls(rootUrl: string, maxUrls = 30): Promise<string[]> {
  let origin: string;
  try {
    origin = new URL(rootUrl).origin;
  } catch {
    return [];
  }

  const sitemapUrls: string[] = [];

  // 1. Check robots.txt for Sitemap: lines
  const robotsTxt = await fetchText(`${origin}/robots.txt`);
  if (robotsTxt) {
    const re = /^Sitemap:\s*(.+)$/gim;
    let m: RegExpExecArray | null;
    while ((m = re.exec(robotsTxt)) !== null) {
      const candidate = m[1]?.trim();
      if (candidate) sitemapUrls.push(candidate);
    }
  }

  // 2. Fall back to well-known paths
  if (sitemapUrls.length === 0) {
    sitemapUrls.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
  }

  const collectedUrls: string[] = [];

  for (const sitemapUrl of sitemapUrls) {
    if (collectedUrls.length >= maxUrls) break;
    const xml = await fetchText(sitemapUrl);
    if (!xml) continue;

    if (isSitemapIndex(xml)) {
      // Fetch up to 3 sub-sitemaps
      const subUrls = extractLocs(xml).slice(0, 3);
      for (const sub of subUrls) {
        if (collectedUrls.length >= maxUrls) break;
        const subXml = await fetchText(sub);
        if (!subXml) continue;
        const pageUrls = filterUrls(extractLocs(subXml), origin);
        for (const u of pageUrls) {
          if (collectedUrls.length >= maxUrls) break;
          collectedUrls.push(u);
        }
      }
    } else {
      const pageUrls = filterUrls(extractLocs(xml), origin);
      for (const u of pageUrls) {
        if (collectedUrls.length >= maxUrls) break;
        collectedUrls.push(u);
      }
    }
  }

  // Dedup
  return [...new Set(collectedUrls)];
}

/**
 * Expand a list of ScoutSources by pre-fetching sitemaps.
 * Returns the original sources (marked manual) plus sitemap-derived URLs.
 * Deduplicates by URL across the expanded set.
 */
export async function expandSourcesViaSitemap(
  sources: ScoutSource[],
): Promise<DerivedSource[]> {
  const seen = new Set<string>();
  const result: DerivedSource[] = [];

  // Add originals first (manual)
  for (const s of sources) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      result.push({
        url: s.url,
        hint: s.hint,
        opportunity_type: s.opportunity_type,
        discovered_from: "manual",
      });
    }
  }

  // Expand via sitemap in parallel. Each fetchSitemapUrls never throws, so
  // Promise.allSettled is belt-and-suspenders. A concurrency limit would
  // help politeness, but with ~30 seeds and distinct hosts the flat parallel
  // fetch takes ~15s in the worst case instead of ~11 minutes sequential.
  const derivedLists = await Promise.all(
    sources.map((s) =>
      fetchSitemapUrls(s.url).then((urls) => ({ source: s, urls })),
    ),
  );

  for (const { source, urls } of derivedLists) {
    for (const u of urls) {
      if (!seen.has(u)) {
        seen.add(u);
        result.push({
          url: u,
          hint: `Derived from sitemap of ${source.hint}`,
          opportunity_type: source.opportunity_type,
          discovered_from: "sitemap",
        });
      }
    }
  }

  return result;
}
