/**
 * http-fetch.ts — v8 FIXED
 *
 * Fixes vs v7 (confirmed from logs 23/03/2026):
 * 1. webdatalabs needs `searchQueries` (array) not `searchQuery` (string)
 * 2. curious_coder needs `urls` (array) not `startUrls`
 * 3. simpleapi removed (403 — paid, not rented)
 * 4. whoareyouanas — correct input: { pageId, country, maxItems }
 * 5. Added fallback actor: lhotanova/facebook-ads-library-scraper
 * 6. pageName guard: never pass undefined/null as string
 */

import { resolvePageId, extractPageSlugFromUrl } from "./page-resolver.js";

// ─── Generic HTTP ─────────────────────────────────────────────────────────────

export type HttpFetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
  rawText: string;
  error?: string;
};

export type HttpFetchParams = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

export async function httpFetch(params: HttpFetchParams): Promise<HttpFetchResult> {
  const { url, method = "GET", headers = {}, body, timeoutMs = 30000 } = params;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts: RequestInit = {
      method,
      headers: { "User-Agent": "OpenClaw-Bot/1.0", ...headers },
      signal: controller.signal,
    };
    if (body !== undefined) {
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
      if (!headers["Content-Type"] && typeof body !== "string") {
        (opts.headers as Record<string, string>)["Content-Type"] = "application/json";
      }
    }
    const res = await fetch(url, opts);
    const rawText = await res.text();
    let data: unknown = rawText;
    try { data = JSON.parse(rawText); } catch { /* ok */ }
    return { ok: res.ok, status: res.status, statusText: res.statusText, data, rawText };
  } catch (err) {
    return { ok: false, status: 0, statusText: "Network Error", data: null, rawText: "", error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function resolveApiKey(direct?: string, envVar?: string): string | undefined {
  return direct || (envVar ? process.env[envVar] : undefined);
}

// ─── Serper ───────────────────────────────────────────────────────────────────

export async function serperSearch(params: {
  query: string;
  apiKey?: string;
  type?: "search" | "news" | "images";
  limit?: number;
}): Promise<Array<{ title: string; link: string; snippet: string; position?: number }>> {
  const key = params.apiKey ?? process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY not found.");
  const endpoint = params.type === "news"
    ? "https://google.serper.dev/news"
    : params.type === "images"
      ? "https://google.serper.dev/images"
      : "https://google.serper.dev/search";
  const r = await httpFetch({
    url: endpoint, method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: { q: params.query, num: params.limit ?? 10 },
  });
  if (!r.ok) throw new Error(`Serper failed: ${r.status}`);
  const d = r.data as Record<string, unknown>;
  const items = (d.organic ?? d.news ?? d.images ?? []) as Record<string, unknown>[];
  return items.map(i => ({
    title: String(i.title ?? ""),
    link: String(i.link ?? ""),
    snippet: String(i.snippet ?? i.description ?? ""),
    position: typeof i.position === "number" ? i.position : undefined,
  }));
}

// ─── Ad Library URL builder ───────────────────────────────────────────────────

export function buildAdLibraryUrl(pageId: string, country = "ALL"): string {
  return (
    `https://www.facebook.com/ads/library/` +
    `?active_status=active&ad_type=all&country=${country}` +
    `&is_targeted_country=false&media_type=all` +
    `&search_type=page&view_all_page_id=${pageId}`
  );
}

// ─── Ad types ────────────────────────────────────────────────────────────────

export type AdLibraryResult = {
  id: string;
  adText: string;
  status: string;
  startDate?: string;
  endDate?: string;
  snapshotUrl?: string;
  impressions?: unknown;
  spend?: unknown;
  platforms?: string[];
  pageName?: string;
  pageId?: string;
  linkTitles?: string[];
  linkCaptions?: string[];
  imageUrl?: string;
  videoUrl?: string;
  ctaType?: string;
};

const GRAPH_API_FIELDS = [
  "id", "page_id", "page_name",
  "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_captions",
  "ad_delivery_start_time", "ad_delivery_stop_time",
  "ad_snapshot_url", "publisher_platforms", "impressions",
].join(",");

// ─── Graph API (partial data, EU/political only for VN) ───────────────────────

export async function fetchFacebookAdLibrary(params: {
  pageId?: string;
  pageUrl?: string;
  pageName?: string;
  accessToken?: string;
  limit?: number;
  country?: string;
  graphVersion?: string;
}): Promise<AdLibraryResult[]> {
  const graphVersion = params.graphVersion ?? "v25.0";
  const token = params.accessToken ?? process.env.META_ACCESS_TOKEN;
  const country = params.country ?? "VN";
  const limit = params.limit ?? 30;

  let slug = params.pageId;
  if (!slug && params.pageUrl) slug = extractPageSlugFromUrl(params.pageUrl);
  if (!slug) throw new Error("Cannot determine Facebook Page identifier.");

  console.log(`[http-fetch] fetchFacebookAdLibrary: slug="${slug}" country="${country}"`);

  // Resolve numeric page ID if needed
  let numericPageId: string | undefined;
  let resolvedPageName: string | undefined = params.pageName;

  if (/^\d+$/.test(slug)) {
    numericPageId = slug;
  } else {
    const resolved = await resolvePageId(params.pageUrl ?? `https://www.facebook.com/${slug}`);
    if (resolved) {
      numericPageId = resolved.pageId;
      if (resolved.pageName) resolvedPageName = resolved.pageName;
      console.log(`[http-fetch] Resolved: ${slug} → ${numericPageId} (${resolvedPageName}) via ${resolved.method}`);
    } else {
      console.log(`[http-fetch] Could not resolve numeric ID for "${slug}"`);
    }
  }

  // Try Graph API (works only for EU/political)
  const searchName = resolvedPageName ?? slug;
  if (token && searchName) {
    console.log(`[http-fetch] ads_archive search_terms="${searchName}"`);
    const url = new URL(`https://graph.facebook.com/${graphVersion}/ads_archive`);
    url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
    url.searchParams.set("ad_active_status", "ALL");
    url.searchParams.set("ad_type", "ALL");
    url.searchParams.set("fields", GRAPH_API_FIELDS);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("search_terms", searchName);
    url.searchParams.set("access_token", token);

    const r = await httpFetch({ url: url.toString(), timeoutMs: 20000 });
    if (r.ok) {
      const ads = ((r.data as Record<string, unknown>).data as Record<string, unknown>[]) ?? [];
      console.log(`[http-fetch] ads_archive returned ${ads.length} ads`);
      if (ads.length > 0) return ads.map(normalizeGraphAd);
    } else {
      const code = ((r.data as Record<string, unknown>)?.error as Record<string, unknown>)?.code;
      console.log(`[http-fetch] ads_archive failed: code=${code} status=${r.status}`);
    }
  } else {
    console.log(`[http-fetch] Skipping ads_archive: no token or no search term`);
  }

  console.log(`[http-fetch] → Proceeding to Apify web scraper`);
  return [];
}

function normalizeGraphAd(ad: Record<string, unknown>): AdLibraryResult {
  return {
    id: String(ad.id ?? ""),
    pageId: String(ad.page_id ?? ""),
    pageName: String(ad.page_name ?? ""),
    adText: Array.isArray(ad.ad_creative_bodies)
      ? (ad.ad_creative_bodies as string[]).join(" | ") : "",
    linkTitles: Array.isArray(ad.ad_creative_link_titles)
      ? (ad.ad_creative_link_titles as string[]) : [],
    linkCaptions: Array.isArray(ad.ad_creative_link_captions)
      ? (ad.ad_creative_link_captions as string[]) : [],
    status: "ACTIVE",
    startDate: typeof ad.ad_delivery_start_time === "string" ? ad.ad_delivery_start_time : undefined,
    endDate: typeof ad.ad_delivery_stop_time === "string" ? ad.ad_delivery_stop_time : undefined,
    snapshotUrl: typeof ad.ad_snapshot_url === "string" ? ad.ad_snapshot_url : undefined,
    impressions: ad.impressions,
    platforms: Array.isArray(ad.publisher_platforms) ? (ad.publisher_platforms as string[]) : [],
  };
}

// ─── Apify Scraper — v8 FIXED INPUT SCHEMAS ───────────────────────────────────
/**
 * Input schemas confirmed from Apify error messages (23/03/2026):
 *
 * whoareyouanas/meta-ad-scraper
 *   { pageId: "61557...", country: "ALL", maxItems: 20 }
 *   SKIP if no pageId
 *
 * webdatalabs/meta-ad-library-scraper
 *   { searchQueries: ["page name or URL"], country: "ALL", maxItems: 20 }
 *   ← was searchQuery (wrong), now searchQueries (array, confirmed from 400 error)
 *
 * curious_coder/facebook-ads-library-scraper (XtaWFhbtfxyzqrFmd)
 *   { urls: ["Ad Library URL"], maxItems: 20 }
 *   ← was startUrls (wrong), now urls (array, confirmed from 400 error)
 *
 * lhotanova/facebook-ads-library-scraper
 *   { startUrls: [{ url: "..." }], maxResults: 20 }
 *
 * simpleapi/facebook-ads-library-scraper → REMOVED (403 paid, not rented)
 */
export async function apifyFacebookAdsScraper(params: {
  url: string;
  pageId?: string;
  pageName?: string;
  apiToken?: string;
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const token = params.apiToken ?? process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not found.");

  const limit = params.limit ?? 20;

  // Safe guard: never pass undefined/null as string
  const safePageId = params.pageId && params.pageId !== "undefined" && params.pageId !== "null"
    ? params.pageId : undefined;
  const safePageName = params.pageName && params.pageName !== "undefined" && params.pageName !== "null"
    ? params.pageName : undefined;

  // Extract page ID from URL if it's an Ad Library URL
  const urlPageId = params.url.match(/view_all_page_id=(\d+)/)?.[1];
  const effectivePageId = safePageId ?? urlPageId;

  // Build canonical Ad Library URL (country=ALL for full coverage)
  const adLibUrl = effectivePageId
    ? buildAdLibraryUrl(effectivePageId, "ALL")
    : params.url.includes("facebook.com/ads/library") ? params.url : null;

  // Search query: page name > slug > page URL
  const slug = extractPageSlugFromUrl(params.url);
  const searchQuery = safePageName ?? slug ?? params.url;

  console.log(`[http-fetch] Apify: pageId=${effectivePageId ?? "none"} pageName="${safePageName ?? "none"}" searchQuery="${searchQuery}"`);

  type Actor = {
    id: string;
    label: string;
    input: Record<string, unknown>;
    skip?: boolean;
  };

  const actors: Actor[] = [
    // Actor 1: whoareyouanas — receives pageId directly
    {
      id: "whoareyouanas~meta-ad-scraper",
      label: "whoareyouanas/meta-ad-scraper",
      input: {
        pageId: effectivePageId,
        country: "ALL",
        maxItems: limit,
      },
      skip: !effectivePageId,
    },

    // Actor 2: webdatalabs — searchQueries (array) confirmed from 400 error
    {
      id: "webdatalabs~meta-ad-library-scraper",
      label: "webdatalabs/meta-ad-library-scraper",
      input: {
        searchQueries: [searchQuery],
        country: "ALL",
        maxItems: limit,
        activeStatus: "active",
      },
    },

    // Actor 3: webdatalabs with Ad Library URL as query (if available)
    {
      id: "webdatalabs~meta-ad-library-scraper",
      label: "webdatalabs/meta-ad-library-scraper (URL query)",
      input: {
        searchQueries: adLibUrl ? [adLibUrl] : [params.url],
        country: "ALL",
        maxItems: limit,
      },
      skip: !adLibUrl && !effectivePageId,
    },

    // Actor 4: curious_coder — urls (array) confirmed from 400 error
    {
      id: "XtaWFhbtfxyzqrFmd",
      label: "curious_coder/facebook-ads-library-scraper",
      input: {
        urls: adLibUrl ? [adLibUrl] : [params.url],
        maxItems: limit,
        proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      },
    },

    // Actor 5: lhotanova — startUrls with {url} objects
    {
      id: "lhotanova~facebook-ads-library-scraper",
      label: "lhotanova/facebook-ads-library-scraper",
      input: {
        startUrls: adLibUrl
          ? [{ url: adLibUrl }]
          : [{ url: params.url }],
        maxResults: limit,
      },
    },
  ];

  for (const actor of actors) {
    if (actor.skip) {
      console.log(`[http-fetch] Skipping ${actor.label} (missing required data)`);
      continue;
    }

    console.log(`[http-fetch] Trying ${actor.label}...`);

    try {
      const triggerUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actor.id)}/runs?token=${token}&waitSecs=90`;
      const tr = await httpFetch({
        url: triggerUrl, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: actor.input,
        timeoutMs: 100000,
      });

      if (!tr.ok) {
        const status = tr.status;
        const errText = tr.rawText.slice(0, 200);
        console.log(`[http-fetch] ${actor.label} trigger failed: ${status} — ${errText}`);
        if (status === 404) { console.log(`[http-fetch] Actor not found`); continue; }
        if (status === 400) { console.log(`[http-fetch] Bad input (400) — try next actor`); continue; }
        if (status === 402) { console.log(`[http-fetch] Apify quota exceeded`); continue; }
        if (status === 403) { console.log(`[http-fetch] Actor not rented (403) — skip`); continue; }
        continue;
      }

      const runData = tr.data as Record<string, unknown>;
      const runInfo = runData?.data as Record<string, unknown> | undefined;
      const datasetId = runInfo?.defaultDatasetId as string | undefined;

      if (!datasetId) {
        console.log(`[http-fetch] No dataset ID from ${actor.label}`);
        continue;
      }

      const dr = await httpFetch({
        url: `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=${limit}`,
        timeoutMs: 30000,
      });
      if (!dr.ok) { console.log(`[http-fetch] Dataset fetch failed: ${dr.status}`); continue; }

      const items = Array.isArray(dr.data) ? dr.data : [];
      console.log(`[http-fetch] ✅ ${actor.label} returned ${items.length} items`);
      if (items.length === 0) continue;

      return (items as Record<string, unknown>[]).map(item => ({
        id: String(
          item.id ?? item.adId ?? item.libraryID ??
          item.adArchiveID ?? item.ad_archive_id ?? Math.random()
        ),
        adText: String(
          item.adText ?? item.body ?? item.text ?? item.message ??
          (Array.isArray(item.adCreativeBodies)
            ? (item.adCreativeBodies as string[]).join(" | ")
            : (Array.isArray(item.ad_creative_bodies)
              ? (item.ad_creative_bodies as string[]).join(" | ") : "")) ?? ""
        ).trim(),
        status: "ACTIVE",
        pageName: String(
          item.pageName ?? item.page_name ?? item.brand ??
          item.advertiserName ?? safePageName ?? ""
        ),
        pageId: String(item.pageID ?? item.page_id ?? effectivePageId ?? ""),
        startDate: String(
          item.startDate ?? item.adCreationDate ??
          item.adDeliveryStartTime ?? item.start_date ?? ""
        ),
        endDate: String(item.endDate ?? item.adDeliveryStopTime ?? item.end_date ?? ""),
        imageUrl: typeof item.imageUrl === "string" ? item.imageUrl :
          (Array.isArray(item.imageUrls) ? (item.imageUrls as string[])[0] : undefined),
        videoUrl: typeof item.videoUrl === "string" ? item.videoUrl :
          (Array.isArray(item.videoUrls) ? (item.videoUrls as string[])[0] : undefined),
        platforms: Array.isArray(item.platforms)
          ? (item.platforms as string[])
          : typeof item.platforms === "string" ? [item.platforms] : [],
        ctaType: String(item.ctaText ?? item.cta_text ?? item.ctaType ?? ""),
        linkTitles: Array.isArray(item.adCreativeLinkTitles)
          ? (item.adCreativeLinkTitles as string[])
          : typeof item.linkTitle === "string" ? [item.linkTitle] : [],
        impressions: item.impressions ?? item.impressionsText,
        snapshotUrl: typeof item.adSnapshotUrl === "string" ? item.adSnapshotUrl : undefined,
      }));
    } catch (err) {
      console.log(`[http-fetch] ${actor.label} threw: ${err}`);
      continue;
    }
  }

  console.log(`[http-fetch] All Apify actors exhausted — returning []`);
  return [];
}
