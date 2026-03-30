import { resolveMetaSecret } from "./meta-api.js";
import type { AdsManagerPluginConfig } from "./types.js";
import { searchApiSearch, serperSearch } from "./http-fetch.js";

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
  const limit = params.limit ?? 5;

  // ─── Phase 9: Flexible Provider Logic ──────────────────────────────────────
  
  // 1. Try Primary Provider (from config)
  const primaryProvider = searchConfig?.provider || "serper";
  const serperKey = process.env.SERPER_API_KEY;
  const searchApiKey = process.env.SEARCHAPI_API_KEY;

  console.log(`[web-search] Performing search for "${params.query}" (Primary: ${primaryProvider})`);

  try {
    if (primaryProvider === "searchapi" && searchApiKey) {
      return await searchApiSearch({ query: params.query, apiKey: searchApiKey, limit });
    }
    if (primaryProvider === "serper" && serperKey) {
      return await serperSearch({ query: params.query, apiKey: serperKey, limit });
    }
  } catch (err) {
    console.warn(`[web-search] Primary provider "${primaryProvider}" failed: ${err}. Trying fallback...`);
  }

  // 2. Fallback Logic
  if (primaryProvider === "serper" && searchApiKey) {
    console.log(`[web-search] Falling back to SearchAPI.io`);
    return await searchApiSearch({ query: params.query, apiKey: searchApiKey, limit });
  }
  if (primaryProvider === "searchapi" && serperKey) {
    console.log(`[web-search] Falling back to Serper`);
    return await serperSearch({ query: params.query, apiKey: serperKey, limit });
  }

  throw new Error("No web search providers (Serper/SearchAPI) are available or configured correctly.");
}
