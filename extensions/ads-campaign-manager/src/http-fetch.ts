/**
 * http-fetch.ts
 * Generic HTTP fetch service for the AI agent to call any external API.
 * Reads env variables directly so the bot can use them without extra config.
 */

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

/**
 * Makes an HTTP request to any URL. Used by AI tools to fetch data from
 * external APIs directly without going through browser.
 */
export async function httpFetch(params: HttpFetchParams): Promise<HttpFetchResult> {
  const { url, method = "GET", headers = {}, body, timeoutMs = 30000 } = params;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        "User-Agent": "OpenClaw-Bot/1.0 (Ads-Manager-Assistant)",
        ...headers,
      },
      signal: controller.signal,
    };

    if (body !== undefined) {
      if (typeof body === "string") {
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
        if (!headers["Content-Type"]) {
          (fetchOptions.headers as Record<string, string>)["Content-Type"] = "application/json";
        }
      }
    }

    const response = await fetch(url, fetchOptions);
    const rawText = await response.text();

    let data: unknown = rawText;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Not JSON — keep as raw text
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      rawText,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      statusText: "Network Error",
      data: null,
      rawText: "",
      error: msg,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves an API key from a direct value or environment variable name.
 */
export function resolveApiKey(direct?: string, envVar?: string): string | undefined {
  if (direct) return direct;
  if (envVar) return process.env[envVar];
  return undefined;
}

/**
 * Call Serper.dev Google Search API directly using env variable.
 * Falls back to SERPER_API_KEY env var automatically.
 */
export async function serperSearch(params: {
  query: string;
  apiKey?: string;
  type?: "search" | "news" | "images";
  limit?: number;
}): Promise<Array<{ title: string; link: string; snippet: string; position?: number }>> {
  const key = params.apiKey ?? process.env.SERPER_API_KEY;
  if (!key) throw new Error("SERPER_API_KEY not found in environment variables.");

  const endpoint = params.type === "news"
    ? "https://google.serper.dev/news"
    : params.type === "images"
    ? "https://google.serper.dev/images"
    : "https://google.serper.dev/search";

  const result = await httpFetch({
    url: endpoint,
    method: "POST",
    headers: {
      "X-API-KEY": key,
      "Content-Type": "application/json",
    },
    body: { q: params.query, num: params.limit ?? 10 },
  });

  if (!result.ok) {
    throw new Error(`Serper search failed: ${result.status} ${result.statusText}`);
  }

  const data = result.data as any;
  const items = data.organic ?? data.news ?? data.images ?? [];
  return items.map((item: any) => ({
    title: item.title ?? "",
    link: item.link ?? "",
    snippet: item.snippet ?? item.description ?? "",
    position: item.position,
  }));
}

/**
 * Call Facebook Ad Library API directly.
 * Does NOT require user authentication — uses the public Ad Library endpoint.
 */
export async function fetchFacebookAdLibrary(params: {
  pageId?: string;
  pageUrl?: string;
  accessToken?: string;
  limit?: number;
  country?: string;
}): Promise<Array<{ id: string; adText: string; status: string; startDate?: string; endDate?: string }>> {
  // Extract page ID from URL if needed
  let pageId = params.pageId;
  if (!pageId && params.pageUrl) {
    const match = params.pageUrl.match(/facebook\.com\/([^/?#]+)/);
    pageId = match?.[1];
  }
  if (!pageId) throw new Error("Cannot determine Facebook Page ID from provided URL.");

  // Use provided access token or fall back to a public app token
  const token = params.accessToken ?? process.env.META_ACCESS_TOKEN;

  const url = new URL("https://graph.facebook.com/v21.0/ads_archive");
  url.searchParams.set("search_page_ids", pageId);
  url.searchParams.set("ad_reached_countries", `["${params.country ?? "VN"}"]`);
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("fields", "id,ad_creative_bodies,ad_creative_link_captions,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,impressions,spend,publisher_platforms");
  url.searchParams.set("limit", String(params.limit ?? 20));
  if (token) url.searchParams.set("access_token", token);

  const result = await httpFetch({ url: url.toString() });

  if (!result.ok) {
    throw new Error(`Meta Ad Library API failed: ${result.status} - ${result.rawText.slice(0, 300)}`);
  }

  const data = result.data as any;
  const ads = data.data ?? [];

  return ads.map((ad: any) => ({
    id: ad.id,
    adText: (ad.ad_creative_bodies ?? []).join(" | "),
    status: "ACTIVE",
    startDate: ad.ad_delivery_start_time,
    endDate: ad.ad_delivery_stop_time,
    snapshotUrl: ad.ad_snapshot_url,
    impressions: ad.impressions,
    spend: ad.spend,
    platforms: ad.publisher_platforms,
  }));
}

/**
 * Trigger Apify Facebook Ads Scraper actor directly.
 * Uses APIFY_TOKEN from env automatically.
 */
export async function apifyFacebookAdsScraper(params: {
  url: string;
  apiToken?: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  adText: string;
  link: string;
  imageUrl?: string;
  videoUrl?: string;
  startDate: string;
  isActive: boolean;
  pageName: string;
}>> {
  const token = params.apiToken ?? process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not found in environment variables.");

  // Use the Facebook Ads Scraper actor
  const actorId = "apify~facebook-ads-scraper";
  const triggerUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}&wait=120`;

  const triggerResult = await httpFetch({
    url: triggerUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: {
      startUrls: [{ url: params.url }],
      maxItems: params.limit ?? 15,
      includeImages: true,
      includeVideos: true,
    },
    timeoutMs: 130000,
  });

  if (!triggerResult.ok) {
    // Fallback: try the Ad Library scraper actor
    throw new Error(`Apify actor failed: ${triggerResult.status} ${triggerResult.rawText?.slice(0, 300)}`);
  }

  const runData = triggerResult.data as any;
  const datasetId = runData?.data?.defaultDatasetId;
  if (!datasetId) throw new Error("Apify run did not return a dataset ID.");

  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true`;
  const dataResult = await httpFetch({ url: datasetUrl });

  if (!dataResult.ok) {
    throw new Error(`Failed to fetch Apify dataset: ${dataResult.status}`);
  }

  const items = (dataResult.data as any[]) ?? [];
  return items.map((item: any) => ({
    id: item.id ?? item.adId ?? String(Math.random()),
    adText: item.adText ?? item.text ?? item.body ?? "",
    link: item.adLink ?? item.link ?? item.url ?? "",
    imageUrl: item.imageUrls?.[0] ?? item.imageUrl,
    videoUrl: item.videoUrls?.[0] ?? item.videoUrl,
    startDate: item.startDate ?? item.adCreationDate ?? "",
    isActive: item.isActive ?? true,
    pageName: item.pageName ?? item.page_name ?? "",
  }));
}
