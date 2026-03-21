import { resolveMetaSecret } from "./meta-api.js";
import type { AdsManagerPluginConfig } from "./types.js";

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
  const runId = runData.data.id;
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
