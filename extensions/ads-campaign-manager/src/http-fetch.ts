/**
 * http-fetch.ts — v9 FINAL
 *
 * CONFIRMED Apify actor input schemas (from 400 error messages):
 *   webdatalabs~meta-ad-library-scraper : { searchQueries: string[] }  ← array required
 *   XtaWFhbtfxyzqrFmd (curious_coder)   : { urls: string[] }          ← Ad Library URL only
 *   whoareyouanas~meta-ad-scraper        : { pageId: string, country, maxItems }
 *
 * KEY: webdatalabs needs DISPLAY NAME (e.g. "Gangnam Beauty Center"), NOT slug
 *
 * ALSO EXPORTS: fetchMetaAccountData() for own account Marketing API v25
 */

import { resolvePageId, extractPageSlugFromUrl, findPageDisplayName } from "./page-resolver.js";

// ─── Types ────────────────────────────────────────────────────────────────────

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

export type AdLibraryResult = {
  id: string;
  adText: string;
  status: string;
  startDate?: string;
  endDate?: string;
  snapshotUrl?: string;
  impressions?: unknown;
  platforms?: string[];
  pageName?: string;
  pageId?: string;
  linkTitles?: string[];
  imageUrl?: string;
  videoUrl?: string;
  ctaType?: string;
  libraryUrl?: string;
};

export type MetaAccountData = {
  accountId: string;
  accountName: string;
  amountSpent: number;
  spendCap: number;
  balance: number;
  currency: string;
  campaigns: MetaCampaignData[];
};

export type MetaCampaignData = {
  id: string;
  name: string;
  status: string;
  dailyBudget: number;
  lifetimeBudget: number;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  healthScore: number;
  healthGrade: "A" | "B" | "C" | "D" | "F";
  fatigued: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function safeStr(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  const s = String(val);
  return (s === "undefined" || s === "null" || s === "") ? undefined : s;
}

function isValidAdLibraryUrl(url: string): boolean {
  return url.includes("facebook.com/ads/library") && url.includes("view_all_page_id=");
}

// ─── Health Score Calculator ──────────────────────────────────────────────────

export function calcHealthScore(c: Partial<MetaCampaignData> & { spend: number }): {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
} {
  if (c.spend < 300000) return { score: 50, grade: "C" }; // insufficient data

  const roas = c.roas ?? 0;
  const ctr = c.ctr ?? 0;
  const cpa = c.cpa ?? 0;
  const pacing = (c.dailyBudget ?? 0) > 0 ? c.spend / (c.dailyBudget ?? 1) : 0.8;
  const learning = c.status === "active" ? 1 : 0;

  const roasScore = roas >= 2.6 ? 100 : roas >= 2.0 ? 80 : roas >= 1.5 ? 60 : roas >= 1.0 ? 30 : 0;
  const ctrScore = ctr >= 2.0 ? 100 : ctr >= 1.5 ? 80 : ctr >= 1.2 ? 60 : ctr >= 0.8 ? 30 : 0;
  const cpaScore = cpa === 0 ? 50 : cpa < 100000 ? 100 : cpa < 150000 ? 80 : cpa < 250000 ? 60 : cpa < 350000 ? 30 : 0;
  const pacingScore = pacing >= 0.8 && pacing <= 1.0 ? 100 : pacing >= 0.6 ? 70 : pacing > 1.15 ? 0 : 40;
  const learningScore = learning === 1 ? 100 : 0;

  const score = Math.round(
    roasScore * 0.30 + ctrScore * 0.20 + cpaScore * 0.20 + pacingScore * 0.15 + learningScore * 0.15
  );
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade };
}

// ─── Generic httpFetch ────────────────────────────────────────────────────────


export async function httpFetch(params: HttpFetchParams & { retries?: number }): Promise<HttpFetchResult> {
  const { url, method = "GET", headers = {}, body, timeoutMs = 30000, retries = 3 } = params;
  let attempt = 0;

  while (attempt < retries) {
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

      // Success
      if (res.ok) {
        return { ok: res.ok, status: res.status, statusText: res.statusText, data, rawText };
      }

      // Retryable errors: 429 (Too many requests), 5xx (Server error)
      if (res.status !== 429 && res.status < 500) {
        return { ok: res.ok, status: res.status, statusText: res.statusText, data, rawText };
      }

      console.warn(`[http-fetch] Attempt ${attempt + 1} failed (${res.status}). Retrying...`);
    } catch (err) {
      if (attempt === retries - 1) {
        return { ok: false, status: 0, statusText: "Network Error", data: null, rawText: "", error: String(err) };
      }
      console.warn(`[http-fetch] Attempt ${attempt + 1} threw error: ${err}. Retrying...`);
    } finally {
      clearTimeout(timer);
      attempt++;
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }
  return { ok: false, status: 0, statusText: "Retries Exhausted", data: null, rawText: "" };
}

export function resolveApiKey(direct?: string, envVar?: string): string | undefined {
  return direct || (envVar ? process.env[envVar] : undefined);
}

// ─── Serper ───────────────────────────────────────────────────────────────────

export async function serperSearch(params: {
  query: string; apiKey?: string; type?: "search" | "news" | "images"; limit?: number;
}): Promise<Array<{ title: string; link: string; snippet: string; position?: number }>> {
  const key = params.apiKey ?? process.env.SERPER_API_KEY;
  if (!key) {
    console.warn("[http-fetch] SERPER_API_KEY missing from environment.");
    return []; // Return empty instead of throwing to prevent bot hangs
  }
  const endpoint = params.type === "news" ? "https://google.serper.dev/news"
    : params.type === "images" ? "https://google.serper.dev/images"
    : "https://google.serper.dev/search";
  const r = await httpFetch({ url: endpoint, method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: { q: params.query, num: params.limit ?? 10 },
    timeoutMs: 10000 }); // 10s strict timeout
  if (!r.ok) {
    console.error(`[http-fetch] Serper failed (${r.status}): ${r.rawText}`);
    return [];
  }
  const d = r.data as Record<string, unknown>;
  const items = (d.organic ?? d.news ?? d.images ?? []) as Record<string, unknown>[];
  return items.map(i => ({
    title: String(i.title ?? ""), link: String(i.link ?? ""),
    snippet: String(i.snippet ?? i.description ?? ""),
    position: typeof i.position === "number" ? i.position : undefined,
  }));
}

// ─── SearchAPI.io ─────────────────────────────────────────────────────────────

export async function searchApiSearch(params: {
  query: string; apiKey?: string; engine?: string; limit?: number;
}): Promise<Array<{ title: string; link: string; snippet: string; position?: number }>> {
  const key = params.apiKey ?? process.env.SEARCHAPI_API_KEY;
  if (!key) {
    console.warn("[http-fetch] SEARCHAPI_API_KEY missing from environment.");
    return [];
  }
  const engine = params.engine ?? "google";
  const endpoint = "https://www.searchapi.io/api/v1/search";
  
  const url = new URL(endpoint);
  url.searchParams.set("q", params.query);
  url.searchParams.set("engine", engine);
  url.searchParams.set("api_key", key);
  url.searchParams.set("num", String(params.limit ?? 10));

  const r = await httpFetch({ url: url.toString(), method: "GET", timeoutMs: 15000 });
  if (!r.ok) {
    console.error(`[http-fetch] SearchAPI failed (${r.status}): ${r.rawText}`);
    return [];
  }
  const d = r.data as Record<string, unknown>;
  const items = (d.organic_results ?? []) as Record<string, unknown>[];
  return items.map(i => ({
    title: String(i.title ?? ""), link: String(i.link ?? ""),
    snippet: String(i.snippet ?? ""),
    position: typeof i.position === "number" ? i.position : undefined,
  }));
}

export async function googleAdsSearch(params: {
  query: string; domain?: string; apiKey?: string; limit?: number;
}): Promise<any[]> {
  const key = params.apiKey ?? process.env.SEARCHAPI_API_KEY;
  if (!key) return [];

  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "google_ads_transparency_center");
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", params.query);
  if (params.domain) url.searchParams.set("domain", params.domain);
  url.searchParams.set("location", "Vietnam");
  url.searchParams.set("num", String(params.limit ?? 10));

  const r = await httpFetch({ url: url.toString(), method: "GET", timeoutMs: 15000 });
  if (!r.ok) return [];

  const d = r.data as Record<string, unknown>;
  const ads = (d.ads ?? []) as Record<string, unknown>[];
  return ads.map(ad => {
    const a = ad as any;
    return {
      id: String(a.creative_id || Math.random()),
      advertiserName: String(a.advertiser_name || ""),
      title: String(a.title || ""),
      link: String(a.link || ""),
      snippet: String(a.snippet || ""),
      format: a.ad_format,
      platform: "GOOGLE",
      targeting: {
        locations: a.audience_selection?.geographic_locations,
        demographics: a.audience_selection?.demographic_info,
        context: a.audience_selection?.contextual_signals,
      }
    };
  });
}

// ─── Ad Library URL builder ───────────────────────────────────────────────────

export function buildAdLibraryUrl(pageId: string, country = "ALL"): string {
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=${pageId}`;
}

export function buildSpecificAdUrl(adId: string): string {
  return `https://www.facebook.com/ads/library/?id=${adId}`;
}

// ─── Graph API fields ─────────────────────────────────────────────────────────

const GRAPH_FIELDS = [
  "id", "page_id", "page_name",
  "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_captions",
  "ad_delivery_start_time", "ad_delivery_stop_time",
  "ad_snapshot_url", "publisher_platforms", "impressions",
].join(",");

// ─── fetchFacebookAdLibrary ───────────────────────────────────────────────────

export async function fetchFacebookAdLibrary(params: {
  pageId?: string; pageUrl?: string; pageName?: string;
  accessToken?: string; limit?: number; country?: string; graphVersion?: string;
}): Promise<AdLibraryResult[]> {
  const graphVersion = params.graphVersion ?? "v25.0";
  const token = params.accessToken ?? process.env.META_ACCESS_TOKEN;
  const country = params.country ?? "VN";
  const limit = params.limit ?? 30;

  let slug = safeStr(params.pageId);
  if (!slug && params.pageUrl) slug = extractPageSlugFromUrl(params.pageUrl);
  if (!slug) throw new Error("Cannot determine page identifier.");

  console.log(`[http-fetch] fetchFacebookAdLibrary: slug="${slug}" country="${country}"`);

  let numericId: string | undefined;
  let resolvedName = safeStr(params.pageName);

  if (/^\d+$/.test(slug)) {
    numericId = slug;
  } else {
    const resolved = await resolvePageId(params.pageUrl ?? `https://www.facebook.com/${slug}`);
    if (resolved) {
      numericId = resolved.pageId;
      resolvedName = safeStr(resolved.pageName) ?? resolvedName;
    }
  }

  if (!token) { console.log(`[http-fetch] Skipping Graph API: no token`); return []; }

  const searchName = resolvedName ?? slug;
  console.log(`[http-fetch] ads_archive search_terms="${searchName}"`);

  const url = new URL(`https://graph.facebook.com/${graphVersion}/ads_archive`);
  url.searchParams.set("ad_reached_countries", JSON.stringify([country]));
  url.searchParams.set("ad_active_status", "ALL");
  url.searchParams.set("ad_type", "ALL");
  url.searchParams.set("fields", GRAPH_FIELDS);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("search_terms", searchName);
  if (numericId) url.searchParams.set("search_page_ids", numericId);
  url.searchParams.set("access_token", token);

  const r = await httpFetch({ url: url.toString(), timeoutMs: 20000 });
  if (!r.ok) {
    const code = ((r.data as Record<string, unknown>)?.error as Record<string, unknown>)?.code;
    console.log(`[http-fetch] ads_archive failed: code=${code} (VN commercial ads not supported)`);
    return [];
  }

  const ads = ((r.data as Record<string, unknown>).data as Record<string, unknown>[]) ?? [];
  console.log(`[http-fetch] ads_archive: ${ads.length} ads`);

  return ads.map(ad => ({
    id: String(ad.id ?? ""),
    pageId: safeStr(ad.page_id) ?? "",
    pageName: safeStr(ad.page_name) ?? "",
    adText: Array.isArray(ad.ad_creative_bodies) ? (ad.ad_creative_bodies as string[]).join(" | ") : "",
    linkTitles: Array.isArray(ad.ad_creative_link_titles) ? (ad.ad_creative_link_titles as string[]) : [],
    status: "ACTIVE",
    startDate: safeStr(ad.ad_delivery_start_time),
    endDate: safeStr(ad.ad_delivery_stop_time),
    snapshotUrl: safeStr(ad.ad_snapshot_url),
    impressions: ad.impressions,
    platforms: Array.isArray(ad.publisher_platforms) ? (ad.publisher_platforms as string[]) : [],
  }));
}

// ─── fetchMetaAccountData (Marketing API v25) ─────────────────────────────────

export async function fetchMetaAccountData(params: {
  adAccountId?: string; accessToken?: string;
  datePreset?: string; graphVersion?: string;
}): Promise<MetaAccountData | null> {
  const graphVersion = params.graphVersion ?? "v25.0";
  const token = params.accessToken ?? process.env.META_ACCESS_TOKEN;
  const rawId = params.adAccountId ?? process.env.META_AD_ACCOUNT_ID;
  if (!token || !rawId) {
    console.log(`[http-fetch] fetchMetaAccountData: missing token=${!token} accountId=${!rawId}`);
    return null;
  }
  const accountId = rawId.startsWith("act_") ? rawId : `act_${rawId}`;
  const datePreset = params.datePreset ?? "today";
  console.log(`[http-fetch] fetchMetaAccountData: ${accountId} datePreset=${datePreset}`);

  // Account-level stats
  const accountUrl = new URL(`https://graph.facebook.com/${graphVersion}/${accountId}`);
  accountUrl.searchParams.set("fields", "id,name,amount_spent,spend_cap,balance,currency");
  accountUrl.searchParams.set("access_token", token);
  const accountR = await httpFetch({ url: accountUrl.toString(), timeoutMs: 15000 });
  if (!accountR.ok) {
    const code = ((accountR.data as Record<string, unknown>)?.error as Record<string, unknown>)?.code;
    console.log(`[http-fetch] Account data failed: code=${code} status=${accountR.status}`);
    return null;
  }
  const accountData = accountR.data as Record<string, unknown>;

  // Campaign insights
  const campUrl = new URL(`https://graph.facebook.com/${graphVersion}/${accountId}/campaigns`);
  campUrl.searchParams.set("fields", [
    "id", "name", "status", "daily_budget", "lifetime_budget",
    `insights.date_preset(${datePreset}){spend,impressions,clicks,ctr,cpc,cpm,reach,frequency,actions,action_values}`,
  ].join(","));
  campUrl.searchParams.set("limit", "250");
  campUrl.searchParams.set("access_token", token);

  const campR = await httpFetch({ url: campUrl.toString(), timeoutMs: 20000 });
  const campaigns: MetaCampaignData[] = [];

  if (campR.ok) {
    const campData = ((campR.data as Record<string, unknown>).data ?? []) as Record<string, unknown>[];
    for (const camp of campData) {
      const ins = ((camp.insights as Record<string, unknown>)?.data as Record<string, unknown>[])?.[0] ?? {};
      const spend = parseFloat(String(ins.spend ?? 0));
      const impressions = parseInt(String(ins.impressions ?? 0), 10);
      const clicks = parseInt(String(ins.clicks ?? 0), 10);
      const ctr = parseFloat(String(ins.ctr ?? 0));
      const cpc = parseFloat(String(ins.cpc ?? 0));
      const cpm = parseFloat(String(ins.cpm ?? 0));
      const frequency = parseFloat(String(ins.frequency ?? 0));
      const dailyBudget = parseInt(String(camp.daily_budget ?? 0), 10) / 100;
      const lifetimeBudget = parseInt(String(camp.lifetime_budget ?? 0), 10) / 100;

      const actions = Array.isArray(ins.actions) ? ins.actions as Record<string, unknown>[] : [];
      const actionValues = Array.isArray(ins.action_values) ? ins.action_values as Record<string, unknown>[] : [];
      const purchaseTypes = ["purchase", "offsite_conversion.fb_pixel_purchase"];
      const purchases = actions.filter(a => purchaseTypes.includes(String(a.action_type))).reduce((s, a) => s + parseInt(String(a.value ?? 0), 10), 0);
      const revenue = actionValues.filter(a => purchaseTypes.includes(String(a.action_type))).reduce((s, a) => s + parseFloat(String(a.value ?? 0)), 0);
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : 0;
      const fatigued = frequency > 3.0 && ctr < 1.0;

      const partial = { spend, roas, ctr, cpa, dailyBudget, status: String(camp.status ?? "").toLowerCase() };
      const { score: healthScore, grade: healthGrade } = calcHealthScore(partial);

      campaigns.push({
        id: String(camp.id ?? ""),
        name: String(camp.name ?? ""),
        status: String(camp.status ?? "").toLowerCase(),
        dailyBudget, lifetimeBudget,
        spend, impressions, clicks, ctr, cpc, cpm, frequency,
        purchases, revenue, roas, cpa,
        healthScore, healthGrade, fatigued,
      });
    }
  }

  return {
    accountId: String(accountData.id ?? accountId),
    accountName: String(accountData.name ?? "Ad Account"),
    amountSpent: parseFloat(String(accountData.amount_spent ?? 0)),
    spendCap: parseFloat(String(accountData.spend_cap ?? 0)),
    balance: parseFloat(String(accountData.balance ?? 0)),
    currency: String(accountData.currency ?? "VND"),
    campaigns,
  };
}

// ─── apifyFacebookAdsScraper ─────────────────────────────────────────────────
/**
 * CONFIRMED input schemas from error logs:
 *
 * webdatalabs~meta-ad-library-scraper:
 *   { searchQueries: ["DISPLAY NAME or Ad Library URL"], country: "ALL", maxItems: N }
 *   ← searchQueries is ARRAY (not searchQuery string)
 *   ← MUST use DISPLAY NAME, not slug!
 *
 * XtaWFhbtfxyzqrFmd (curious_coder):
 *   { urls: ["https://...ads/library/?...&view_all_page_id=NUMERIC"] }
 *   ← urls is ARRAY of Ad Library URLs ONLY
 *   ← FAILS with 400 if URL is not a valid Ad Library URL
 *
 * whoareyouanas~meta-ad-scraper:
 *   { pageId: "NUMERIC_ID", country: "ALL", maxItems: N }
 *   ← SKIP if no numeric pageId
 */
export async function apifyFacebookAdsScraper(params: {
  url: string;
  pageId?: string;
  pageName?: string;  // DISPLAY NAME (not slug) — critical for webdatalabs
  apiToken?: string;
  limit?: number;
  country?: string;
}): Promise<AdLibraryResult[]> {
  const token = params.apiToken ?? process.env.APIFY_TOKEN;
  const scrapeCreatorsKey = process.env.SCRAPECREATORS_API_KEY;

  const limit = params.limit ?? 20;
  const country = params.country ?? "ALL";
  const safePageId = safeStr(params.pageId);
  const safePageName = safeStr(params.pageName);
  const urlPageId = params.url.match(/view_all_page_id=(\d+)/)?.[1];
  const effectivePageId = safePageId ?? urlPageId;

  // ─── Phase 6: Fast API Scrape (ScrapeCreators) ──────────────────────────────
  if (scrapeCreatorsKey && (effectivePageId || safePageName)) {
    console.log(`[http-fetch] 🚀 Trying ScrapeCreators Fast API for ${effectivePageId || safePageName}...`);
    try {
      const scUrl = new URL("https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads");
      scUrl.searchParams.set("query", safeStr(effectivePageId ?? safePageName) || "");
      scUrl.searchParams.set("country", country === "ALL" ? "ALL" : country);
      scUrl.searchParams.set("status", "ACTIVE");
      
      const scRes = await httpFetch({
        url: scUrl.toString(),
        method: "GET",
        headers: { "x-api-key": scrapeCreatorsKey },
        timeoutMs: 30000
      });

      if (scRes.ok) {
        let items = (scRes.data as any)?.searchResults || (scRes.data as any)?.data || [];
        if (Array.isArray(items)) {
          if (items.length > 0) {
            console.log(`[http-fetch] ✅ ScrapeCreators returned ${items.length} items`);
            return items.map(item => ({
              id: String(item.ad_archive_id || item.id || item.adId || Math.random()),
              adText: String(item.snapshot?.body?.text || item.adText || item.body || item.text || "").trim(),
              status: "ACTIVE",
              pageName: item.page_name || item.pageName || item.advertiserName || safePageName || "",
              pageId: item.page_id || item.pageId || effectivePageId || "",
              startDate: item.start_date ? new Date(item.start_date * 1000).toISOString() : (item.startDate || ""),
              endDate: item.end_date ? new Date(item.end_date * 1000).toISOString() : (item.endDate || ""),
              imageUrl: item.snapshot?.images?.[0]?.original_image_url || item.imageUrl || (item.imageUrls?.[0]),
              videoUrl: item.snapshot?.videos?.[0]?.video_hd_url || item.videoUrl || (item.videoUrls?.[0]),
              platforms: item.publisher_platform || item.platforms || [],
              ctaType: item.snapshot?.cta_text || item.ctaText || item.ctaType || "",
              linkTitles: item.linkTitles || [],
              impressions: item.impressions_with_index?.impressions_text || item.impressions,
              snapshotUrl: item.snapshotUrl || item.adSnapshotUrl || `https://www.facebook.com/ads/library/?id=${item.ad_archive_id}`,
              libraryUrl: item.ad_archive_id ? buildSpecificAdUrl(String(item.ad_archive_id)) : undefined,
            }));
          } else {
            console.log(`[http-fetch] ℹ️ ScrapeCreators returned 0 ads (No active campaigns found for this query).`);
            return [];
          }
        } else {
          console.log(`[http-fetch] ⚠️ ScrapeCreators unexpected data format: ${scRes.rawText.slice(0, 300)}`);
        }
      } else {
        console.log(`[http-fetch] ⚠️ ScrapeCreators failed: ${scRes.status} ${scRes.error || ""}`);
      }
    } catch (err) {
      console.log(`[http-fetch] ⚠️ ScrapeCreators threw: ${err}`);
    }
  }

  // ─── Fallback: Standard Apify Scrapers ──────────────────────────────────────
  if (!token) {
    console.log("[http-fetch] ⚠️ APIFY_TOKEN not found, skipping fallback scrapers.");
    return [];
  }

  const adLibUrl = effectivePageId ? buildAdLibraryUrl(effectivePageId, "ALL") : null;
  const slug = extractPageSlugFromUrl(params.url);

  // If we don't have displayName but have slug, try to find it
  let displayName = safePageName;
  if (!displayName && slug && !/^\d+$/.test(slug)) {
    console.log(`[http-fetch] No displayName, trying findPageDisplayName for "${slug}"...`);
    const found = await findPageDisplayName(slug);
    if (found) {
      displayName = found;
      console.log(`[http-fetch] Found displayName: "${displayName}"`);
    }
  }

  console.log(`[http-fetch] Apify: pageId=${effectivePageId ?? "none"} displayName="${displayName ?? "none"}" adLibUrl=${adLibUrl ? "✅" : "❌"}`);

  type Actor = { id: string; label: string; input: Record<string, unknown>; skip?: boolean };

  const actors: Actor[] = [
    // Actor 1: whoareyouanas — needs numeric pageId
    {
      id: "whoareyouanas~meta-ad-scraper",
      label: "whoareyouanas/meta-ad-scraper",
      input: { pageId: effectivePageId, country, maxItems: limit },
      skip: !effectivePageId,
    },
    // Actor 2: webdatalabs — display name (MOST IMPORTANT for VN pages without pageId)
    ...(displayName ? [{
      id: "webdatalabs~meta-ad-library-scraper",
      label: `webdatalabs/meta-ad-library-scraper (name: "${displayName}")`,
      input: { searchQueries: [displayName], country, maxItems: limit, activeStatus: "active" },
    }] : []),
    // Actor 3: webdatalabs — Ad Library URL
    ...(adLibUrl ? [{
      id: "webdatalabs~meta-ad-library-scraper",
      label: "webdatalabs/meta-ad-library-scraper (Ad Lib URL)",
      input: { searchQueries: [adLibUrl], country, maxItems: limit },
    }] : []),
    // Actor 4: webdatalabs — slug as last resort
    ...(slug && slug !== displayName && !/^\d+$/.test(slug) ? [{
      id: "webdatalabs~meta-ad-library-scraper",
      label: `webdatalabs/meta-ad-library-scraper (slug: "${slug}")`,
      input: { searchQueries: [slug], country, maxItems: limit },
    }] : []),
    // Actor 5: curious_coder — ONLY valid Ad Library URLs
    ...(adLibUrl && isValidAdLibraryUrl(adLibUrl) ? [{
      id: "XtaWFhbtfxyzqrFmd",
      label: "curious_coder/facebook-ads-library-scraper",
      input: { urls: [adLibUrl], maxItems: limit, proxy: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] } },
    }] : []),
  ];

  for (const actor of actors) {
    if (actor.skip) { console.log(`[http-fetch] Skipping ${actor.label}`); continue; }
    console.log(`[http-fetch] Trying ${actor.label}...`);
    try {
      const triggerUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actor.id)}/runs?token=${token}&waitSecs=90`;
      const tr = await httpFetch({ url: triggerUrl, method: "POST", headers: { "Content-Type": "application/json" }, body: actor.input, timeoutMs: 100000 });
      if (!tr.ok) {
        const s = tr.status;
        const e = tr.rawText.slice(0, 200);
        console.log(`[http-fetch] ${actor.label} failed: ${s} — ${e}`);
        if (s === 404 || s === 400 || s === 403 || s === 402) continue;
        continue;
      }
      const runInfo = ((tr.data as Record<string, unknown>)?.data as Record<string, unknown>) ?? {};
      const runId = safeStr(runInfo?.id);
      const datasetId = safeStr(runInfo?.defaultDatasetId);
      if (!runId || !datasetId) { console.log(`[http-fetch] No dataset ID`); continue; }

      let status = safeStr(runInfo?.status);
      let attempts = 0;
      while (status !== "SUCCEEDED" && status !== "FAILED" && status !== "ABORTED" && attempts < 15) {
        await new Promise(r => setTimeout(r, 5000));
        const sr = await httpFetch({ url: `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, timeoutMs: 15000 });
        if (sr.ok) status = safeStr(((sr.data as Record<string, unknown>)?.data as Record<string, unknown>)?.status) ?? status;
        attempts++;
        console.log(`[http-fetch] ${actor.label} status: ${status} (attempt ${attempts}/15)`);
      }

      if (status !== "SUCCEEDED") {
        console.log(`[http-fetch] ${actor.label} gave up with status: ${status}`);
        continue;
      }

      const dr = await httpFetch({ url: `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&limit=${limit}`, timeoutMs: 30000 });
      if (!dr.ok) continue;
      const items = Array.isArray(dr.data) ? dr.data : [];
      console.log(`[http-fetch] ✅ ${actor.label} returned ${items.length} items`);
      if (items.length === 0) continue;

      return (items as Record<string, unknown>[]).map(item => ({
        id: String(item.id ?? item.adId ?? item.adArchiveID ?? Math.random()),
        adText: String(safeStr(item.adText) ?? safeStr(item.body) ?? safeStr(item.text) ??
          (Array.isArray(item.adCreativeBodies) ? (item.adCreativeBodies as string[]).join(" | ") : "") ?? "").trim(),
        status: "ACTIVE",
        pageName: safeStr(item.pageName) ?? safeStr(item.page_name) ?? safeStr(item.advertiserName) ?? displayName ?? "",
        pageId: safeStr(item.pageID) ?? safeStr(item.page_id) ?? effectivePageId ?? "",
        startDate: safeStr(item.startDate) ?? safeStr(item.adCreationDate) ?? safeStr(item.adDeliveryStartTime) ?? "",
        endDate: safeStr(item.endDate) ?? safeStr(item.adDeliveryStopTime) ?? "",
        imageUrl: safeStr(item.imageUrl) ?? (Array.isArray(item.imageUrls) ? safeStr((item.imageUrls as unknown[])[0]) : undefined),
        videoUrl: safeStr(item.videoUrl) ?? (Array.isArray(item.videoUrls) ? safeStr((item.videoUrls as unknown[])[0]) : undefined),
        platforms: Array.isArray(item.platforms) ? (item.platforms as string[]) : [],
        ctaType: safeStr(item.ctaText) ?? safeStr(item.ctaType) ?? "",
        linkTitles: Array.isArray(item.adCreativeLinkTitles) ? (item.adCreativeLinkTitles as string[]) : [],
        impressions: item.impressions,
        snapshotUrl: safeStr(item.adSnapshotUrl),
        libraryUrl: item.id || item.adId || item.adArchiveID ? buildSpecificAdUrl(String(item.id ?? item.adId ?? item.adArchiveID)) : undefined,
      }));
    } catch (err) {
      console.log(`[http-fetch] ${actor.label} threw: ${err}`);
      continue;
    }
  }
  console.log(`[http-fetch] All Apify actors exhausted`);
  return [];
}
/**
 * NEW: scrapeCreatorsIndustrySearch
 * Dedicated industry-wide search using ScrapeCreators /search/ads endpoint.
 */
export async function scrapeCreatorsIndustrySearch(params: {
  query: string;
  country?: string;
  platform?: string; // FB, IG
  limit?: number;
}): Promise<AdLibraryResult[]> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) {
    console.warn("[http-fetch] SCRAPECREATORS_API_KEY missing for industry search.");
    return [];
  }

  const country = params.country ?? "ALL";
  const limit = params.limit ?? 20;

  console.log(`[http-fetch] 🕵️ Searching industry ads for "${params.query}" in ${country}...`);

  const searchUrl = new URL("https://api.scrapecreators.com/v1/facebook/adLibrary/search/ads");
  searchUrl.searchParams.set("query", params.query);
  searchUrl.searchParams.set("country", country === "ALL" ? "ALL" : country);
  searchUrl.searchParams.set("status", "ACTIVE");
  searchUrl.searchParams.set("limit", String(limit));

  if (params.platform === "IG") {
    searchUrl.searchParams.set("publisher_platforms", "INSTAGRAM");
  } else if (params.platform === "FB") {
    searchUrl.searchParams.set("publisher_platforms", "FACEBOOK");
  }

  const res = await httpFetch({
    url: searchUrl.toString(),
    method: "GET",
    headers: { "x-api-key": key },
    timeoutMs: 35000
  });

  if (!res.ok) {
    console.error(`[http-fetch] Industry search failed: ${res.status} ${res.error || ""}`);
    return [];
  }

  // ScrapeCreators Search Response can be in .searchResults or .data
  let items = (res.data as any)?.searchResults || (res.data as any)?.data || (res.data as any)?.results || (res.data as any)?.ads;
  if (!Array.isArray(items) && Array.isArray(res.data)) items = res.data;

  if (!Array.isArray(items)) {
    console.log(`[http-fetch] ⚠️ Unexpected format: ${res.rawText.slice(0, 200)}`);
    return [];
  }

  // Win-Score Algorithm:
  const now = new Date();
  
  return items.map(item => {
    // Search endpoint uses different field names: ad_archive_id, snapshot
    const adId = item.ad_archive_id || item.id || item.adId;
    const snapshot = item.snapshot || {};
    const adText = snapshot.body?.text || item.adText || item.body || item.text || "";
    const pageName = item.page_name || item.pageName || item.advertiserName || "";
    const pageId = item.page_id || item.pageId || "";
    
    // Duration estimation
    const start = item.startDate || item.adCreationDate || snapshot.ad_creation_time || "";
    let runDays = 0;
    if (start) {
      const startDate = new Date(/^\d+$/.test(String(start)) ? parseInt(String(start)) * 1000 : start);
      runDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      id: String(adId || Math.random()),
      adText: String(adText).trim(),
      status: "ACTIVE",
      pageName: String(pageName),
      pageId: String(pageId),
      startDate: start,
      endDate: item.endDate || "",
      imageUrl: item.imageUrl || snapshot.images?.[0]?.url || (item.imageUrls?.[0]),
      videoUrl: item.videoUrl || snapshot.videos?.[0]?.video_hd_url || snapshot.videos?.[0]?.video_sd_url,
      platforms: item.platforms || snapshot.publisher_platforms || [],
      ctaType: item.ctaText || item.ctaType || snapshot.cta_text || "",
      linkTitles: item.linkTitles || [],
      impressions: item.impressions,
      snapshotUrl: item.adSnapshotUrl || item.snapshot_url,
      libraryUrl: adId ? buildSpecificAdUrl(String(adId)) : undefined,
      _runDays: runDays,
    };
  }).sort((a, b) => (b._runDays || 0) - (a._runDays || 0));
}
