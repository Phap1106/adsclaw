/**
 * page-resolver.ts — v5 FINAL
 *
 * Resolves Facebook page URL → { pageId, pageName }
 * pageName is CRITICAL — used in ads_archive search_terms for VN market
 *
 * Methods:
 *  1. Already numeric
 *  2. Graph API + META_ACCESS_TOKEN (user token)
 *  3. Graph API + META_APP_ID|META_APP_SECRET (app token)
 *  4. Serper strict match → view_all_page_id in Ad Library URLs
 *  5. Ad Library page scrape (no auth)
 *  6. Mobile HTML scrape
 */

import { httpFetch } from "./http-fetch.js";

export type PageResolveResult = {
  pageId: string;
  pageName?: string;
  method:
    | "numeric_url"
    | "graph_user_token"
    | "graph_app_token"
    | "serper_ad_library"
    | "ad_library_scrape"
    | "html_scrape";
};

// ─── URL slug extractor ───────────────────────────────────────────────────────

export function extractPageSlugFromUrl(url: string): string | undefined {
  const n = url.trim().replace(/^@/, "");

  const profileM = n.match(/profile\.php\?id=(\d+)/);
  if (profileM?.[1]) return profileM[1];

  const pagesM = n.match(/facebook\.com\/pages\/[^/]+\/(\d+)/i);
  if (pagesM?.[1]) return pagesM[1];

  const pgM = n.match(/facebook\.com\/pg\/([^/?#]+)/i);
  if (pgM?.[1]) return pgM[1];

  const adLibM = n.match(/view_all_page_id=(\d+)/);
  if (adLibM?.[1]) return adLibM[1];

  const slugM = n.match(/facebook\.com\/([^/?#]+)/i);
  const slug = slugM?.[1];
  const reserved = [
    "ads", "pages", "groups", "events", "watch",
    "marketplace", "reel", "stories", "gaming", "help", "login",
  ];
  if (slug && !reserved.includes(slug.toLowerCase())) return slug;

  return undefined;
}

// ─── Graph API ────────────────────────────────────────────────────────────────

async function tryGraphApi(
  slug: string,
  token: string,
  graphVersion = "v25.0",
): Promise<Pick<PageResolveResult, "pageId" | "pageName"> | null> {
  try {
    const url = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(slug)}`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", token);
    const r = await httpFetch({ url: url.toString(), timeoutMs: 8000 });
    if (!r.ok) return null;
    const d = r.data as Record<string, unknown>;
    if (typeof d?.id === "string" && /^\d+$/.test(d.id)) {
      return {
        pageId: d.id,
        pageName: typeof d.name === "string" ? d.name : undefined,
      };
    }
  } catch { /* next */ }
  return null;
}

// ─── Serper → strict slug match ───────────────────────────────────────────────

async function trySerperAdLibrary(
  slug: string,
  serperKey: string,
): Promise<Pick<PageResolveResult, "pageId" | "pageName"> | null> {
  const queries = [
    `"facebook.com/ads/library" "${slug}" "view_all_page_id"`,
    `facebook ads library "${slug}" view_all_page_id site:facebook.com`,
  ];

  for (const q of queries) {
    try {
      const r = await httpFetch({
        url: "https://google.serper.dev/search",
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: { q, num: 10 },
        timeoutMs: 10000,
      });
      if (!r.ok) continue;

      const d = r.data as Record<string, unknown>;
      const organic = Array.isArray(d.organic) ? d.organic : [];

      for (const item of organic as Record<string, unknown>[]) {
        const link = typeof item.link === "string" ? item.link : "";
        const snippet = typeof item.snippet === "string" ? item.snippet : "";
        const combined = `${link} ${snippet}`.toLowerCase();

        // Strict: must contain slug
        if (!combined.includes(slug.toLowerCase())) continue;

        const m = `${link} ${snippet}`.match(/view_all_page_id=(\d{6,})/);
        if (m?.[1]) {
          return {
            pageId: m[1],
            pageName: typeof item.title === "string"
              ? item.title.split("|")[0]?.trim()
              : undefined,
          };
        }

        const pm = link.match(/\/pages\/[^/]+\/(\d{6,})/);
        if (pm?.[1]) return { pageId: pm[1] };
      }
    } catch { continue; }
  }
  return null;
}

// ─── Ad Library scrape ────────────────────────────────────────────────────────

async function tryAdLibraryScrape(
  slug: string,
): Promise<Pick<PageResolveResult, "pageId" | "pageName"> | null> {
  const patterns = [
    /view_all_page_id=(\d{6,})/,
    /"page_id"\s*:\s*"?(\d{6,})"?/,
    /"pageID"\s*:\s*"?(\d{6,})"?/,
    /"entity_id"\s*:\s*"?(\d{6,})"?/,
    /\/pages\/[^/]+\/(\d{6,})/,
  ];
  const urls = [
    `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(slug)}`,
  ];
  for (const url of urls) {
    try {
      const r = await httpFetch({
        url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeoutMs: 15000,
      });
      if (!r.ok || typeof r.rawText !== "string") continue;
      for (const p of patterns) {
        const m = r.rawText.match(p);
        if (m?.[1] && /^\d{6,}$/.test(m[1])) {
          const tm = r.rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
          return { pageId: m[1], pageName: tm?.[1]?.split("|")[0]?.trim() };
        }
      }
    } catch { continue; }
  }
  return null;
}

// ─── HTML scrape ──────────────────────────────────────────────────────────────

const HTML_PATTERNS = [
  /fb:\/\/page\/(\d{5,})/,
  /"pageID"\s*:\s*"(\d{5,})"/,
  /"page_id"\s*:\s*"(\d{5,})"/,
  /profile\.php\?id=(\d{5,})/,
  /\/pages\/[^/]+\/(\d{6,})/,
  /"id":"(\d{10,})"/,
];

async function tryHtmlScrape(
  pageUrl: string,
  slug: string,
): Promise<Pick<PageResolveResult, "pageId" | "pageName"> | null> {
  const urls = [
    `https://m.facebook.com/${encodeURIComponent(slug)}`,
    `https://www.facebook.com/${encodeURIComponent(slug)}`,
    pageUrl,
  ].filter((u, i, a) => a.indexOf(u) === i);

  for (const url of urls) {
    try {
      const r = await httpFetch({
        url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
        timeoutMs: 12000,
      });
      if (!r.ok || typeof r.rawText !== "string") continue;
      for (const p of HTML_PATTERNS) {
        const m = r.rawText.match(p);
        if (m?.[1] && /^\d{5,}$/.test(m[1])) {
          const tm = r.rawText.match(/<title[^>]*>([^<]+)<\/title>/i);
          return { pageId: m[1], pageName: tm?.[1]?.split("|")[0]?.trim() };
        }
      }
    } catch { continue; }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function resolvePageId(
  url: string,
  opts: {
    userToken?: string;
    appId?: string;
    appSecret?: string;
    serperKey?: string;
    graphVersion?: string;
  } = {},
): Promise<PageResolveResult | null> {
  const slug = extractPageSlugFromUrl(url);
  if (!slug) {
    console.log(`[page-resolver] Cannot extract slug from: ${url}`);
    return null;
  }

  console.log(`[page-resolver] Resolving slug="${slug}"`);

  // M1: Already numeric
  if (/^\d+$/.test(slug)) {
    return { pageId: slug, method: "numeric_url" };
  }

  // M2: User token
  const userToken = opts.userToken ?? process.env.META_ACCESS_TOKEN;
  if (userToken) {
    const r = await tryGraphApi(slug, userToken, opts.graphVersion ?? "v25.0");
    if (r) {
      console.log(`[page-resolver] ✅ M2 user token → ${r.pageId} (${r.pageName})`);
      return { ...r, method: "graph_user_token" };
    }
    console.log(`[page-resolver] M2 failed`);
  }

  // M3: App token
  const appId = opts.appId ?? process.env.META_APP_ID;
  const appSecret = opts.appSecret ?? process.env.META_APP_SECRET;
  if (appId && appSecret) {
    const r = await tryGraphApi(slug, `${appId}|${appSecret}`, opts.graphVersion ?? "v25.0");
    if (r) {
      console.log(`[page-resolver] ✅ M3 app token → ${r.pageId} (${r.pageName})`);
      return { ...r, method: "graph_app_token" };
    }
    console.log(`[page-resolver] M3 failed`);
  }

  // M4: Serper strict
  const serperKey = opts.serperKey ?? process.env.SERPER_API_KEY;
  if (serperKey) {
    console.log(`[page-resolver] M4 Serper strict...`);
    const r = await trySerperAdLibrary(slug, serperKey);
    if (r) {
      console.log(`[page-resolver] ✅ M4 → ${r.pageId}`);
      return { ...r, method: "serper_ad_library" };
    }
    console.log(`[page-resolver] M4 failed`);
  }

  // M5: Ad Library scrape
  console.log(`[page-resolver] M5 Ad Library scrape...`);
  const r5 = await tryAdLibraryScrape(slug);
  if (r5) {
    console.log(`[page-resolver] ✅ M5 → ${r5.pageId}`);
    return { ...r5, method: "ad_library_scrape" };
  }

  // M6: HTML scrape
  console.log(`[page-resolver] M6 HTML scrape...`);
  const r6 = await tryHtmlScrape(url, slug);
  if (r6) {
    console.log(`[page-resolver] ✅ M6 → ${r6.pageId}`);
    return { ...r6, method: "html_scrape" };
  }

  console.log(`[page-resolver] ❌ All failed for slug="${slug}"`);
  return null;
}
