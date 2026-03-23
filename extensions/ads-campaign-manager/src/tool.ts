/**
 * tool.ts — v7 FIXED
 *
 * Bug fixes vs v6:
 * 1. pageName undefined bug: safePageName guard before passing to Apify
 * 2. resolvePageId called 3x (resolve_tool + meta_ad_library tool + fetchFacebookAdLibrary)
 *    → Now resolve ONCE in tool.execute, pass results down
 * 3. fetchFacebookAdLibrary only called for Graph API attempt — Apify called separately
 * 4. Cleaner flow: resolve → Graph API try → Apify → Serper
 */

import { Static, Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  loadAssistantContext,
  setProposalStatus,
  acknowledgeInstruction,
  createProposal,
  appendCompetitorInsight,
} from "./assistant.js";
import { performWebSearch } from "./web-search.js";
import { scrapePage } from "./scraper.js";
import { analyzeCompetitorAdsWithApify } from "./apify-service.js";
import {
  httpFetch,
  serperSearch,
  fetchFacebookAdLibrary,
  apifyFacebookAdsScraper,
  buildAdLibraryUrl,
  type AdLibraryResult,
} from "./http-fetch.js";
import { resolvePageId, extractPageSlugFromUrl } from "./page-resolver.js";
import type { AdsManagerPluginConfig } from "./types.js";

type BriefMode =
  | "report" | "overview" | "alerts" | "budget"
  | "plan" | "proposals" | "competitors";

function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({ type: "string", enum: [...values], description });
}

const BRIEF_MODES = [
  "report", "overview", "alerts", "budget",
  "plan", "proposals", "competitors",
] as const;

// ─── Brief payload ────────────────────────────────────────────────────────────

function buildPayload(
  mode: BriefMode,
  context: Awaited<ReturnType<typeof loadAssistantContext>>,
) {
  const pending = context.state.proposals.filter((p) => p.status === "pending");
  switch (mode) {
    case "overview":
      return {
        mode, health: context.derived.health, generatedAt: context.derived.generatedAt,
        lastSyncAt: context.state.lastSyncAt, alerts: context.derived.alerts.length,
        winners: context.derived.winners.length, watchlist: context.derived.watchlist.length,
        atRisk: context.derived.atRisk.length, operations: context.operations,
        warnings: context.warnings,
      };
    case "alerts":
      return { mode, alerts: context.derived.alerts, operations: context.operations, warnings: context.warnings };
    case "budget":
      return {
        mode, budget: context.derived.budget, operations: context.operations,
        winners: context.derived.winners.map((v) => ({
          id: v.campaign.id, name: v.campaign.name,
          roas: v.campaign.roas, ctr: v.campaign.ctr,
        })),
      };
    case "plan":
      return {
        mode, dailyTasks: context.derived.dailyTasks,
        bossInstructions: context.state.instructions.slice(0, 5),
        operations: context.operations,
      };
    case "proposals":
      return { mode, pending, all: context.state.proposals, operations: context.operations };
    case "competitors":
      return {
        mode, competitors: context.snapshot?.competitors ?? [],
        notes: context.snapshot?.notes ?? [], operations: context.operations,
      };
    case "report":
    default:
      return {
        mode: "report", business: context.config.business,
        health: context.derived.health, generatedAt: context.derived.generatedAt,
        budget: context.derived.budget, alerts: context.derived.alerts,
        pendingProposals: pending,
        topWinner: context.derived.winners[0]?.campaign,
        topRisk: context.derived.atRisk[0]?.campaign,
        dailyTasks: context.derived.dailyTasks,
        operations: context.operations, warnings: context.warnings,
      };
  }
}

// ─── Ad format helper ─────────────────────────────────────────────────────────

function daysRunning(startDate: string | undefined): string {
  if (!startDate || startDate === "undefined") return "?";
  try {
    const ms = Date.now() - new Date(startDate).getTime();
    const d = Math.floor(ms / 86400000);
    return d >= 0 ? String(d) : "?";
  } catch { return "?"; }
}

function formatAds(ads: AdLibraryResult[], source: string): string {
  const lines = ads.map((ad, i) => {
    const text = (ad.adText ?? "").slice(0, 300);
    const days = daysRunning(ad.startDate);
    const plat = Array.isArray(ad.platforms) && ad.platforms.length
      ? ad.platforms.join(", ") : "unknown";
    const cta = ad.ctaType && ad.ctaType !== "undefined" ? ` | CTA: ${ad.ctaType}` : "";
    return (
      `Ad ${i + 1} [${days} ngày | ${plat}${cta}]:\n` +
      `  Hook: ${text || "(no text)"}\n` +
      `  Bắt đầu: ${ad.startDate ?? "unknown"}` +
      (ad.imageUrl ? `\n  Image: ${ad.imageUrl}` : "")
    );
  });
  return `📊 [${source}] Found ${ads.length} active ads:\n\n${lines.join("\n\n")}`;
}

// ─── Resolve helper (called ONCE per request) ──────────────────────────────────

async function resolvePageInfo(url: string, knownPageId?: string): Promise<{
  pageId: string | undefined;
  pageName: string | undefined;
  method: string | undefined;
}> {
  // Already numeric — skip resolution
  if (knownPageId && /^\d+$/.test(knownPageId)) {
    // Try to get page name from Graph API
    const token = process.env.META_ACCESS_TOKEN;
    if (token) {
      try {
        const r = await httpFetch({
          url: `https://graph.facebook.com/v25.0/${knownPageId}?fields=id,name&access_token=${token}`,
          timeoutMs: 5000,
        });
        if (r.ok) {
          const d = r.data as Record<string, unknown>;
          return {
            pageId: knownPageId,
            pageName: typeof d.name === "string" ? d.name : undefined,
            method: "graph_direct",
          };
        }
      } catch { /* ok */ }
    }
    return { pageId: knownPageId, pageName: undefined, method: "numeric_input" };
  }

  // Resolve from URL
  try {
    const resolved = await resolvePageId(url);
    if (resolved) {
      return {
        pageId: resolved.pageId,
        pageName: resolved.pageName,
        method: resolved.method,
      };
    }
  } catch (err) {
    console.log(`[tool] resolvePageInfo error: ${err}`);
  }
  return { pageId: undefined, pageName: undefined, method: undefined };
}

// ─── Main factory ─────────────────────────────────────────────────────────────

export function createAdsManagerTool(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): AnyAgentTool[] {

  // ── 1. ads_manager_brief ──────────────────────────────────────────────────
  const briefTool: AnyAgentTool = {
    name: "ads_manager_brief",
    label: "Ads Manager Brief",
    description: "Read-only brief. Call with mode matching the /command received.",
    parameters: Type.Object(
      { mode: Type.Optional(stringEnum(BRIEF_MODES, "View mode")) },
      { additionalProperties: false },
    ),
    execute: async (_id, raw) => {
      const mode = ((raw as any).mode ?? "report") as BriefMode;
      const ctx = await loadAssistantContext({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
      });
      const payload = buildPayload(mode, ctx);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        details: payload,
      };
    },
  };

  // ── 2. ads_manager_create_proposal ───────────────────────────────────────
  const createProposalTool: AnyAgentTool = {
    name: "ads_manager_create_proposal",
    label: "Create Ads Proposal",
    description: "Create a proposal for boss review. Required for budget changes >10%, pause/resume, new campaigns.",
    parameters: Type.Object({
      title: Type.String(),
      summary: Type.String(),
      reason: Type.String(),
      impact: Type.String({ description: "high/medium/low" }),
      campaignId: Type.Optional(Type.String()),
      commandHint: Type.Optional(Type.String()),
    }),
    execute: async (_id, raw: any) => {
      const ctx = await createProposal({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        proposal: raw,
      });
      const pending = ctx.state.proposals.filter((p) => p.status === "pending").length;
      return {
        content: [{ type: "text" as const, text: `Proposal created. Pending: ${pending}. → /pheduyet ${ctx.state.proposals[0]?.id}` }],
        details: ctx.state.proposals[0],
      };
    },
  };

  // ── 3. ads_manager_execute_action ─────────────────────────────────────────
  const executeActionTool: AnyAgentTool = {
    name: "ads_manager_execute_action",
    label: "Execute Ads Action",
    description: "Approve or reject a pending proposal.",
    parameters: Type.Object({
      proposalId: Type.String(),
      status: stringEnum(["approved", "rejected"], "New status"),
    }),
    execute: async (_id, raw: any) => {
      const ctx = await setProposalStatus({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        proposalId: raw.proposalId,
        status: raw.status,
      });
      return {
        content: [{ type: "text" as const, text: `Proposal ${raw.proposalId} → ${raw.status}.` }],
        details: ctx.state.proposals.find((p) => p.id === raw.proposalId),
      };
    },
  };

  // ── 4. ads_manager_ack_instruction ───────────────────────────────────────
  const ackInstructionTool: AnyAgentTool = {
    name: "ads_manager_ack_instruction",
    label: "Acknowledge Boss Instruction",
    description: "Mark a boss instruction as acknowledged.",
    parameters: Type.Object({ instructionId: Type.String() }),
    execute: async (_id, raw: any) => {
      const ctx = await acknowledgeInstruction({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        instructionId: raw.instructionId,
      });
      return {
        content: [{ type: "text" as const, text: `Instruction ${raw.instructionId} → acknowledged.` }],
        details: ctx.state.instructions.find((i) => i.id === raw.instructionId),
      };
    },
  };

  // ── 5. ads_manager_search ─────────────────────────────────────────────────
  const searchTool: AnyAgentTool = {
    name: "ads_manager_search",
    label: "Professional Web Search (via config)",
    description: "Web search via intelligence.search config. Use serper_search for direct access.",
    parameters: Type.Object({
      query: Type.String(),
      limit: Type.Optional(Type.Number({ default: 5 })),
    }),
    execute: async (_id, raw: any) => {
      const results = await performWebSearch({
        config: params.pluginConfig,
        query: raw.query,
        limit: raw.limit,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        details: results,
      };
    },
  };

  // ── 6. ads_manager_scrape ─────────────────────────────────────────────────
  const scrapeTool: AnyAgentTool = {
    name: "ads_manager_scrape",
    label: "Professional Scraper",
    description: "Scrape a URL via Playwright or fetch. Requires intelligence.scrape.enabled=true.",
    parameters: Type.Object({ url: Type.String() }),
    execute: async (_id, raw: any) => {
      const result = await scrapePage({ config: params.pluginConfig, url: raw.url });
      return {
        content: [{ type: "text" as const, text: `${result.title}\n\n${result.content.slice(0, 2000)}` }],
        details: result,
      };
    },
  };

  // ── 7. ads_manager_analyze_ads ────────────────────────────────────────────
  const analyzeAdsTool: AnyAgentTool = {
    name: "ads_manager_analyze_ads",
    label: "Professional Ad Analyzer (Apify via config)",
    description: "Analyze competitor ads via Apify config. Use apify_facebook_ads for direct access.",
    parameters: Type.Object({
      url: Type.String(),
      limit: Type.Optional(Type.Number({ default: 10 })),
    }),
    execute: async (_id, raw: any) => {
      const results = await analyzeCompetitorAdsWithApify({
        config: params.pluginConfig,
        url: raw.url,
        limit: raw.limit,
      });
      return {
        content: [{ type: "text" as const, text: `Found ${results.length} ads.` }],
        details: results,
      };
    },
  };

  // ── 8. ads_manager_save_competitor ───────────────────────────────────────
  const saveCompetitorTool: AnyAgentTool = {
    name: "ads_manager_save_competitor",
    label: "Save Competitor to Memory",
    description: "Save competitor insights. ALWAYS call after any competitor analysis.",
    parameters: Type.Object({
      name: Type.String({ description: "Competitor page name" }),
      angle: Type.String({ description: "Dominant angle or 'no ads found [date]'" }),
      note: Type.Optional(Type.String()),
      sourceUrl: Type.Optional(Type.String()),
    }),
    execute: async (_id, raw: any) => {
      await appendCompetitorInsight({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        competitor: {
          name: raw.name,
          angle: raw.angle,
          note: raw.note,
          sourceUrl: raw.sourceUrl,
        },
      });
      return {
        content: [{ type: "text" as const, text: `Saved "${raw.name}" to memory.` }],
        details: { success: true, name: raw.name },
      };
    },
  };

  // ── 9. http_request ───────────────────────────────────────────────────────
  const httpRequestTool: AnyAgentTool = {
    name: "http_request",
    label: "HTTP API Request",
    description: "Direct HTTP request to any REST API.",
    parameters: Type.Object({
      url: Type.String(),
      method: Type.Optional(Type.String()),
      headers: Type.Optional(Type.String({ description: "JSON string" })),
      body: Type.Optional(Type.String()),
    }),
    execute: async (_id, raw: any) => {
      let headersObj: Record<string, string> = {};
      if (raw.headers) { try { headersObj = JSON.parse(raw.headers); } catch { /* ok */ } }
      const result = await httpFetch({
        url: raw.url,
        method: raw.method ?? "GET",
        headers: headersObj,
        body: raw.body,
      });
      const bodyText = typeof result.data === "string"
        ? result.data : JSON.stringify(result.data, null, 2);
      return {
        content: [{
          type: "text" as const,
          text: result.ok
            ? `✅ ${result.status}\n\n${bodyText}`.slice(0, 8000)
            : `❌ ${result.status} ${result.statusText}\n${result.error ?? bodyText.slice(0, 500)}`,
        }],
        details: result,
      };
    },
  };

  // ── 10. serper_search ─────────────────────────────────────────────────────
  const serperSearchTool: AnyAgentTool = {
    name: "serper_search",
    label: "Google Search (Serper Direct)",
    description: "Search Google via Serper. SERPER_API_KEY auto-read from env. type: search|news|images.",
    parameters: Type.Object({
      query: Type.String(),
      type: Type.Optional(Type.String({ description: "search | news | images" })),
      limit: Type.Optional(Type.Number()),
    }),
    execute: async (_id, raw: any) => {
      const results = await serperSearch({
        query: raw.query,
        type: raw.type,
        limit: raw.limit ?? 10,
      });
      const text = `🔍 "${raw.query}":\n\n` +
        results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`).join("\n\n");
      return {
        content: [{ type: "text" as const, text }],
        details: results,
      };
    },
  };

  // ── 11. meta_ad_library — FIXED: resolve ONCE, no triple-call ────────────
  const metaAdLibraryTool: AnyAgentTool = {
    name: "meta_ad_library",
    label: "Facebook Ad Library Analyzer",
    description:
      "Phân tích ads Facebook competitor. " +
      "Meta Graph API không hỗ trợ VN commercial ads → tool dùng Apify scrape Ad Library website. " +
      "Nhận pageUrl hoặc pageId. Tự động resolve và scrape. " +
      "Tất cả credentials đọc từ env.",
    parameters: Type.Object({
      pageUrl: Type.Optional(Type.String({ description: "Facebook page URL" })),
      pageId: Type.Optional(Type.String({ description: "Numeric page ID (nếu đã biết)" })),
      country: Type.Optional(Type.String({ description: "default: VN" })),
      limit: Type.Optional(Type.Number({ description: "default: 20" })),
    }),
    execute: async (_id, raw: any) => {
      const country = raw.country ?? "VN";
      const limit = raw.limit ?? 20;
      const originalUrl = raw.pageUrl
        ?? (raw.pageId ? `https://www.facebook.com/${raw.pageId}` : "");

      if (!originalUrl) {
        return {
          content: [{ type: "text" as const, text: "❌ Cần cung cấp pageUrl hoặc pageId." }],
          details: { ads: [], count: 0, source: "none" },
        };
      }

      // ── STEP 1: Resolve page info ONCE ───────────────────────────────────
      const pageInfo = await resolvePageInfo(originalUrl, raw.pageId);
      const { pageId: resolvedPageId, pageName: resolvedPageName, method: resolveMethod } = pageInfo;

      const slug = resolvedPageId ?? extractPageSlugFromUrl(originalUrl) ?? "unknown";
      console.log(`[meta_ad_library tool] Resolved: pageId=${resolvedPageId} pageName="${resolvedPageName}" method=${resolveMethod}`);

      // ── STEP 2: Try Graph API (EU/political, VN thường 0) ─────────────────
      const token = process.env.META_ACCESS_TOKEN;
      let graphAds: AdLibraryResult[] = [];

      if (token) {
        const searchName = resolvedPageName ?? slug;
        const graphUrl = new URL(`https://graph.facebook.com/v25.0/ads_archive`);
        graphUrl.searchParams.set("ad_reached_countries", JSON.stringify([country]));
        graphUrl.searchParams.set("ad_active_status", "ALL");
        graphUrl.searchParams.set("ad_type", "ALL");
        graphUrl.searchParams.set("fields", "id,page_id,page_name,ad_creative_bodies,ad_delivery_start_time,publisher_platforms");
        graphUrl.searchParams.set("limit", String(limit));
        graphUrl.searchParams.set("search_terms", searchName);
        if (resolvedPageId) graphUrl.searchParams.set("search_page_ids", resolvedPageId);
        graphUrl.searchParams.set("access_token", token);

        console.log(`[meta_ad_library tool] Graph API search_terms="${searchName}"`);
        const gr = await httpFetch({ url: graphUrl.toString(), timeoutMs: 20000 });
        if (gr.ok) {
          const data = ((gr.data as Record<string, unknown>).data ?? []) as Record<string, unknown>[];
          graphAds = data.map(ad => ({
            id: String(ad.id ?? ""),
            pageId: String(ad.page_id ?? ""),
            pageName: String(ad.page_name ?? ""),
            adText: Array.isArray(ad.ad_creative_bodies)
              ? (ad.ad_creative_bodies as string[]).join(" | ") : "",
            status: "ACTIVE",
            startDate: typeof ad.ad_delivery_start_time === "string"
              ? ad.ad_delivery_start_time : undefined,
            platforms: Array.isArray(ad.publisher_platforms)
              ? (ad.publisher_platforms as string[]) : [],
          }));
          console.log(`[meta_ad_library tool] Graph API returned ${graphAds.length} ads`);
        } else {
          const code = ((gr.data as Record<string, unknown>)?.error as Record<string, unknown>)?.code;
          console.log(`[meta_ad_library tool] Graph API failed: code=${code} status=${gr.status}`);
        }
      }

      if (graphAds.length > 0) {
        return {
          content: [{ type: "text" as const, text: formatAds(graphAds, "Meta Graph API") }],
          details: { ads: graphAds, count: graphAds.length, source: "meta_graph_api", resolvedPageId, resolvedPageName },
        };
      }

      // ── STEP 3: Apify (PRIMARY for VN) ────────────────────────────────────
      console.log(`[meta_ad_library tool] Graph API 0 → Apify primary for VN`);

      const apifyToken = process.env.APIFY_TOKEN;
      if (!apifyToken) {
        const manualUrl = resolvedPageId
          ? buildAdLibraryUrl(resolvedPageId, "ALL")
          : `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(slug)}`;
        return {
          content: [{
            type: "text" as const,
            text: [
              `ℹ️ Meta Graph API không trả VN commercial ads (giới hạn Meta).`,
              `APIFY_TOKEN chưa cấu hình.`,
              resolvedPageId ? `Page ID: ${resolvedPageId} (${resolvedPageName ?? "unknown"})` : "",
              `Xem thủ công: ${manualUrl}`,
            ].filter(Boolean).join("\n"),
          }],
          details: { ads: [], count: 0, source: "none", resolvedPageId, resolvedPageName },
        };
      }

      let apifyAds: AdLibraryResult[] = [];
      try {
        apifyAds = await apifyFacebookAdsScraper({
          url: originalUrl,
          pageId: resolvedPageId,
          pageName: resolvedPageName, // safe — guard inside apifyFacebookAdsScraper
          limit,
        });
      } catch (err) {
        console.log(`[meta_ad_library tool] Apify error: ${err}`);
      }

      if (apifyAds.length > 0) {
        return {
          content: [{ type: "text" as const, text: formatAds(apifyAds, "Apify Ad Library Scraper") }],
          details: { ads: apifyAds, count: apifyAds.length, source: "apify", resolvedPageId, resolvedPageName },
        };
      }

      // ── STEP 4: Both failed ───────────────────────────────────────────────
      const manualSearchUrl = resolvedPageName
        ? `https://www.facebook.com/ads/library/?search_type=keyword_unordered&q=${encodeURIComponent(resolvedPageName)}`
        : resolvedPageId
          ? buildAdLibraryUrl(resolvedPageId, "ALL")
          : `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(slug)}`;

      return {
        content: [{
          type: "text" as const,
          text: [
            `⚠️ Không lấy được ads tự động cho "${resolvedPageName ?? slug}".`,
            ``,
            `Đã thử: Meta Graph API (VN không hỗ trợ) + Apify (actors chưa index hoặc rate limit)`,
            ``,
            resolvedPageId
              ? `Page ID: ${resolvedPageId} (${resolvedPageName ?? "unknown"}) — via ${resolveMethod}`
              : `Page ID chưa resolve được từ URL này`,
            ``,
            `Xem ads thủ công:`,
            `  ${manualSearchUrl}`,
            ``,
            `Nếu thấy ads → copy URL đầy đủ (có view_all_page_id) và dán cho tôi`,
            `hoặc gọi: apify_facebook_ads(url:"<Ad Library URL>", pageName:"${resolvedPageName ?? slug}")`,
          ].filter(Boolean).join("\n"),
        }],
        details: {
          ads: [], count: 0, source: "none",
          resolvedPageId, resolvedPageName, resolveMethod,
          manualUrl: manualSearchUrl,
        },
      };
    },
  };

  // ── 12. apify_facebook_ads ────────────────────────────────────────────────
  const apifyScraperTool: AnyAgentTool = {
    name: "apify_facebook_ads",
    label: "Apify Ad Library Scraper (Direct)",
    description:
      "Scrape Facebook Ad Library website via Apify. APIFY_TOKEN auto-read. " +
      "Dùng Ad Library URL với view_all_page_id cho kết quả tốt nhất. " +
      "Truyền pageName nếu biết (dùng cho keyword search actors).",
    parameters: Type.Object({
      url: Type.String({ description: "Ad Library URL (với view_all_page_id) HOẶC Facebook page URL" }),
      pageId: Type.Optional(Type.String({ description: "Numeric page ID nếu biết" })),
      pageName: Type.Optional(Type.String({ description: "Tên page nếu biết (quan trọng cho search)" })),
      limit: Type.Optional(Type.Number({ description: "Max ads (default: 20)" })),
    }),
    execute: async (_id, raw: any) => {
      // Safe guard pageName
      const safePageName = raw.pageName && raw.pageName !== "undefined"
        ? raw.pageName : undefined;

      const ads = await apifyFacebookAdsScraper({
        url: raw.url,
        pageId: raw.pageId,
        pageName: safePageName,
        limit: raw.limit ?? 20,
      });

      if (ads.length === 0) {
        const hint = raw.pageId
          ? `\n→ Thử: ${buildAdLibraryUrl(raw.pageId, "ALL")}`
          : "";
        return {
          content: [{ type: "text" as const, text: `Apify returned 0 ads.${hint}` }],
          details: { ads: [], count: 0 },
        };
      }
      return {
        content: [{ type: "text" as const, text: formatAds(ads, "Apify Direct") }],
        details: { ads, count: ads.length },
      };
    },
  };

  // ── 13. resolve_facebook_page_id ─────────────────────────────────────────
  const resolvePageIdTool: AnyAgentTool = {
    name: "resolve_facebook_page_id",
    label: "Resolve Facebook Page ID",
    description:
      "Resolve Facebook page URL → numeric Page ID + Page Name. " +
      "ALWAYS call trước meta_ad_library khi có URL như facebook.com/visioedu. " +
      "Trả về pageId + pageName (cả 2 đều cần cho phân tích VN market).",
    parameters: Type.Object({
      url: Type.String({ description: "Facebook page URL hoặc username" }),
    }),
    execute: async (_id, raw: any) => {
      const inputUrl = raw.url as string;
      const url = inputUrl.startsWith("http")
        ? inputUrl
        : `https://www.facebook.com/${inputUrl.replace(/^@/, "")}`;
      const slug = extractPageSlugFromUrl(url);

      if (slug && /^\d+$/.test(slug)) {
        return {
          content: [{ type: "text" as const, text: `✅ Already numeric: ${slug}\n→ meta_ad_library(pageId: "${slug}")` }],
          details: { resolved: true, pageId: slug, method: "numeric_url", adLibraryUrl: buildAdLibraryUrl(slug, "ALL") },
        };
      }

      let result: Awaited<ReturnType<typeof resolvePageId>> = null;
      try { result = await resolvePageId(url); } catch (err) {
        return {
          content: [{ type: "text" as const, text: `❌ Error: ${err}` }],
          details: { error: String(err), resolved: false },
        };
      }

      if (!result) {
        const searchUrl = `https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(slug ?? inputUrl)}`;
        return {
          content: [{
            type: "text" as const,
            text: [
              `⚠️ Không resolve được Page ID cho "${slug ?? inputUrl}".`,
              `Tìm thủ công: ${searchUrl}`,
              `→ Click vào page → copy view_all_page_id từ URL`,
              `→ meta_ad_library(pageId:"NUMERIC_ID")`,
            ].join("\n"),
          }],
          details: { resolved: false, slug, url },
        };
      }

      const adLibUrl = buildAdLibraryUrl(result.pageId, "ALL");
      return {
        content: [{
          type: "text" as const,
          text: [
            `✅ Resolved!`,
            `Page ID: ${result.pageId}`,
            `Page Name: ${result.pageName ?? "unknown"}`,
            `Method: ${result.method}`,
            ``,
            `→ meta_ad_library(pageId: "${result.pageId}", country: "VN")`,
            `→ Ad Library URL: ${adLibUrl}`,
          ].join("\n"),
        }],
        details: {
          resolved: true,
          pageId: result.pageId,
          pageName: result.pageName,
          method: result.method,
          slug, url, adLibraryUrl: adLibUrl,
        },
      };
    },
  };

  return [
    briefTool,           // 1
    createProposalTool,  // 2
    executeActionTool,   // 3
    ackInstructionTool,  // 4
    searchTool,          // 5
    scrapeTool,          // 6
    analyzeAdsTool,      // 7
    saveCompetitorTool,  // 8
    httpRequestTool,     // 9
    serperSearchTool,    // 10
    metaAdLibraryTool,   // 11
    apifyScraperTool,    // 12
    resolvePageIdTool,   // 13
  ];
}
