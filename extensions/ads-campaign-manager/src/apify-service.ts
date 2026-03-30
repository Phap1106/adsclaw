import { resolveMetaSecret } from "./meta-api.js";
import type { AdsManagerPluginConfig, PostEngagementData } from "./types.js";

export type ApifyAdResult = {
  id: string;
  adText: string;
  link: string;
  imageUrl?: string;
  videoUrl?: string;
  startDate: string;
  isActive: boolean;
  pageName: string;
};

export async function analyzeCompetitorAdsWithApify(params: {
  config: AdsManagerPluginConfig;
  url: string;
  limit?: number;
}): Promise<ApifyAdResult[]> {
  const apifyConfig = params.config.intelligence?.apify;
  if (!apifyConfig || !apifyConfig.enabled) {
    throw new Error("Apify integration is not enabled in plugin configuration.");
  }

  const apiToken = resolveMetaSecret(apifyConfig.apiToken, apifyConfig.apiTokenEnvVar);
  if (!apiToken) {
    throw new Error("Apify API Token is missing (check apiToken or apiTokenEnvVar).");
  }

  const actorUrl = `https://api.apify.com/v2/acts/apify~facebook-ads-scraper/runs?token=${apiToken}&wait=60`;
  
  const response = await fetch(actorUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      startUrls: [{ url: params.url }],
      limit: params.limit ?? 10,
      includeImages: true,
      includeVideos: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Apify Actor trigger failed: ${response.status} ${errorText}`);
  }

  const runData = await response.json() as any;
  const defaultDatasetId = runData.data.defaultDatasetId;

  // Fetch results from dataset
  const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${apiToken}`;
  const resultsResponse = await fetch(datasetUrl);
  
  if (!resultsResponse.ok) {
    throw new Error(`Failed to fetch Apify results from dataset: ${resultsResponse.status}`);
  }

  const items = await resultsResponse.json() as any[];
  
  return items.map((item: any) => ({
    id: item.id ?? item.adId ?? "",
    adText: item.adText ?? item.text ?? "",
    link: item.adLink ?? item.link ?? "",
    imageUrl: item.imageUrls?.[0] ?? item.imageUrl,
    videoUrl: item.videoUrls?.[0] ?? item.videoUrl,
    startDate: item.startDate ?? item.adCreationDate ?? "",
    isActive: item.isActive ?? true,
    pageName: item.pageName ?? "",
  }));
}

// ─── Phase 19: Async Polling Engagement Scraper ───────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * getPostEngagement — Lấy engagement thật của 1 Facebook post.
 * Dùng REST API thuần (không dùng SDK) + Async Polling pattern.
 * Timeout mặc định: 8 phút. Poll mỗi 10 giây.
 */
export async function getPostEngagement(params: {
  postUrl: string;
  apiToken: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<PostEngagementData> {
  const timeout = params.timeoutMs ?? 8 * 60 * 1000;
  const pollInterval = params.pollIntervalMs ?? 10_000;

  // STEP A: Trigger Apify run
  const triggerRes = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-post-scraper/runs?token=${params.apiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: params.postUrl }],
        resultsLimit: 1,
      }),
    },
  );
  if (!triggerRes.ok) {
    const errText = await triggerRes.text();
    throw new Error(`Apify trigger failed: ${triggerRes.status} — ${errText}`);
  }
  const triggerData = await triggerRes.json() as any;
  const runId: string = triggerData.data.id;
  const defaultDatasetId: string = triggerData.data.defaultDatasetId;

  // STEP B: Poll until SUCCEEDED or deadline
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await sleep(pollInterval);

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${params.apiToken}`,
    );
    if (!statusRes.ok) continue; // transient network error, keep polling

    const statusData = await statusRes.json() as any;
    const runStatus: string = statusData.data?.status ?? "";

    if (runStatus === "SUCCEEDED") break;
    if (["FAILED", "ABORTED", "TIMED-OUT"].includes(runStatus)) {
      throw new Error(`Apify run ended with status ${runStatus} (runId: ${runId})`);
    }
    // RUNNING | READY | WAITING → continue
  }

  if (Date.now() >= deadline) {
    throw new Error(`Apify polling timeout after ${timeout / 1000}s (runId: ${runId})`);
  }

  // STEP C: Fetch dataset results
  const dataRes = await fetch(
    `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${params.apiToken}`,
  );
  if (!dataRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${dataRes.status}`);
  }
  const items = await dataRes.json() as any[];
  if (items.length === 0) {
    throw new Error("Apify returned empty dataset — post may be private or removed.");
  }

  const item = items[0];
  return {
    postUrl: params.postUrl,
    likes:    item.likesCount    ?? item.reactions?.total ?? 0,
    comments: item.commentsCount ?? item.comments         ?? 0,
    shares:   item.sharesCount   ?? item.shares           ?? 0,
    isVideo:  item.type === "video" || !!(item.videoUrl),
    postText: item.text ?? item.message ?? "",
    scrapedAt: new Date().toISOString(),
    source: "apify",
  };
}
