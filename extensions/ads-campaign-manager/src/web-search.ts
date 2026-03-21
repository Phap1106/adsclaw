import { resolveMetaSecret } from "./meta-api.js";
import type { AdsManagerPluginConfig } from "./types.js";

export type SearchResult = {
  title: string;
  link: string;
  snippet: string;
};

export async function performWebSearch(params: {
  config: AdsManagerPluginConfig;
  query: string;
  limit?: number;
}): Promise<SearchResult[]> {
  const searchConfig = params.config.intelligence?.search;
  if (!searchConfig || !searchConfig.enabled) {
    throw new Error("Web search is not enabled in plugin configuration.");
  }

  const apiKey = resolveMetaSecret(searchConfig.apiKey, searchConfig.apiKeyEnvVar);
  if (!apiKey) {
    throw new Error("Web search API key is missing (check apiKey or apiKeyEnvVar).");
  }

  if (searchConfig.provider === "serper") {
    return await searchSerper(params.query, apiKey, params.limit ?? 5);
  }

  // Fallback / Google Search placeholder
  throw new Error(`Search provider "${searchConfig.provider}" is not fully implemented yet.`);
}

async function searchSerper(query: string, apiKey: string, limit: number): Promise<SearchResult[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: limit }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Serper API search failed: ${response.status} ${errorText}`);
  }

  const data = await response.json() as any;
  const organic = Array.isArray(data.organic) ? data.organic : [];
  
  return organic.map((item: any) => ({
    title: item.title ?? "",
    link: item.link ?? "",
    snippet: item.snippet ?? "",
  }));
}
