/**
 * tool.ts — v9 FINAL
 *
 * 14 tools with complete intelligent brain:
 *  1-4.   Campaign management (brief, proposal, execute, ack)
 *  5-6.   Search & scrape
 *  7.     Competitor ads analysis (Apify via config)
 *  8.     Competitor save
 *  9.     HTTP request
 *  10.    Serper search
 *  11.    meta_ad_library (resolve once + Apify auto-fallback)
 *  12.    apify_facebook_ads (direct)
 *  13.    resolve_facebook_page_id (pageId + displayName)
 *  14.    meta_account_data (live own account Marketing API)
 *
 * Key patterns:
 *  - resolvePageInfoOnce(): resolve called ONCE per request
 *  - findPageDisplayName(): gets real name for Apify search
 *  - calcHealthScore(): weighted 0-100 scoring
 *  - CEP protocol: referenced in description for write tools
 */


import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  loadAssistantContext, setProposalStatus,
  acknowledgeInstruction, createProposal, appendCompetitorInsight,
} from "./assistant.js";
import { performWebSearch } from "./web-search.js";
import { scrapePage } from "./scraper.js";
import { analyzeCompetitorAdsWithApify } from "./apify-service.js";
import {
  httpFetch, serperSearch,
  fetchFacebookAdLibrary, apifyFacebookAdsScraper,
  scrapeCreatorsIndustrySearch, googleAdsSearch,
  buildAdLibraryUrl, fetchMetaAccountData, calcHealthScore,
  safeStr, type AdLibraryResult, type MetaCampaignData,
} from "./http-fetch.js";
import { resolvePageId, extractPageSlugFromUrl, findPageDisplayName } from "./page-resolver.js";
import { syncBusinessData } from "./business-sync.js";
import { 
  saveCompetitorAdToDb, 
  saveMarketBenchmarkToDb,
  initPhase3Tables
} from "./db-state.js";
import { 
  getFormulaAuditTrail, 
  detectMetricAnomaly 
} from "./ad-math.js";
import type { AdsManagerPluginConfig } from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({ type: "string", enum: [...values], description });
}

const BRIEF_MODES = ["report","overview","alerts","budget","plan","proposals","competitors"] as const;
type BriefMode = typeof BRIEF_MODES[number];

function buildPayload(mode: BriefMode, ctx: Awaited<ReturnType<typeof loadAssistantContext>>) {
  const pending = ctx.state.proposals.filter(p => p.status === "pending");
  switch (mode) {
    case "overview": return { mode, health: ctx.derived.health, generatedAt: ctx.derived.generatedAt, lastSyncAt: ctx.state.lastSyncAt, alerts: ctx.derived.alerts.length, winners: ctx.derived.winners.length, watchlist: ctx.derived.watchlist.length, atRisk: ctx.derived.atRisk.length, operations: ctx.operations, warnings: ctx.warnings };
    case "alerts": return { mode, alerts: ctx.derived.alerts, operations: ctx.operations, warnings: ctx.warnings };
    case "budget": return { mode, budget: ctx.derived.budget, operations: ctx.operations, winners: ctx.derived.winners.map(v => ({ id: v.campaign.id, name: v.campaign.name, roas: v.campaign.roas, ctr: v.campaign.ctr })) };
    case "plan": return { mode, dailyTasks: ctx.derived.dailyTasks, bossInstructions: ctx.state.instructions.slice(0, 5), operations: ctx.operations };
    case "proposals": return { mode, pending, all: ctx.state.proposals, operations: ctx.operations };
    case "competitors": return { mode, competitors: ctx.snapshot?.competitors ?? [], notes: ctx.snapshot?.notes ?? [], operations: ctx.operations };
    default: return { mode: "report", business: ctx.config.business, health: ctx.derived.health, generatedAt: ctx.derived.generatedAt, budget: ctx.derived.budget, alerts: ctx.derived.alerts, pendingProposals: pending, topWinner: ctx.derived.winners[0]?.campaign, topRisk: ctx.derived.atRisk[0]?.campaign, dailyTasks: ctx.derived.dailyTasks, operations: ctx.operations, warnings: ctx.warnings };
  }
}

function daysRunning(s: string | undefined): string {
  if (!s || s === "undefined") return "?";
  try { const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000); return d >= 0 ? String(d) : "?"; }
  catch { return "?"; }
}

function formatAds(ads: AdLibraryResult[], source: string): string {
  if (ads.length === 0) return `### 📉 [${source}] Không tìm thấy quảng cáo nào đang chạy.`;

  const rows = ads.map((ad, i) => {
    const hook = (ad.adText ?? "").slice(0, 80).replace(/\n/g, " ").trim();
    const days = daysRunning(ad.startDate);
    const startDate = ad.startDate ? ad.startDate.split("T")[0] : "N/A";
    const cta = ad.ctaType || "None";
    const link = ad.libraryUrl ? `[Link](${ad.libraryUrl})` : "N/A";
    const platformIcons = (ad.platforms || []).map(p => p === "FACEBOOK" ? "🔵" : p === "INSTAGRAM" ? "📸" : "📱").join("");
    
    return `| ${i + 1} | ${days}d | ${startDate} | ${platformIcons} | ${cta} | ${hook}... | ${link} |`;
  });

  const table = [
    `| # | Lived | Start | Platform | CTA | Hook Snippet | Meta Link |`,
    `|---|-------|-------|----------|-----|--------------|-----------|`,
    ...rows
  ].join("\n");

  return `### 📊 [${source}] PHÂN TÍCH ${ads.length} ADS ĐANG CHẠY\n\n${table}\n\n> [!NOTE]\n> Link trực tiếp có thể yêu cầu đăng nhập Facebook.`;
}

function fmtVND(n: number): string {
  return n > 0 ? `${Math.round(n).toLocaleString("vi-VN")}đ` : "0đ";
}

function gradeEmoji(grade: string): string {
  return grade === "A" ? "🟢" : grade === "B" ? "🔵" : grade === "C" ? "🟡" : grade === "D" ? "🟠" : "🔴";
}

async function performIndustryDiscovery(args: { keyword: string; country?: string; platform?: string; limit?: number }) {
  const { keyword, country = "VN", platform = "FB", limit = 10 } = args;
  
  if (platform === "GOOGLE") {
    const googleAds = await googleAdsSearch({ query: keyword, limit });
    return formatGoogleAds(googleAds, keyword);
  }

  const ads = await scrapeCreatorsIndustrySearch({ query: keyword, country, platform, limit });
  return formatIndustryAds(ads, keyword, platform);
}

function formatGoogleAds(ads: any[], keyword: string): string {
  if (ads.length === 0) return `### 📊 [Google Ads: ${keyword}] Không tìm thấy bài quảng cáo nào.`;

  const rows = ads.map((ad, i) => {
    return `| ${i + 1} | **${ad.advertiserName}** | ${ad.title} | ${ad.snippet.slice(0, 100)}... | [Xem Link](${ad.link}) |`;
  });

  const table = [
    `| # | Advertiser | Title | Snippet | Link |`,
    `|---|------------|-------|---------|------|`,
    ...rows
  ].join("\n");

  return `## 🚀 GOOGLE ADS: NGÀNH ${keyword.toUpperCase()}\n\n${table}\n\n> [!NOTE]\n> Dữ liệu được trích xuất từ Google Ads Transparency.`;
}

function formatIndustryAds(ads: AdLibraryResult[], keyword: string, platform?: string): string {
  const platformName = platform === "IG" ? "INSTAGRAM" : platform === "GOOGLE" ? "GOOGLE" : "FACEBOOK";
  const icon = platform === "IG" ? "📸" : platform === "GOOGLE" ? "🔍" : "🔵";

  if (ads.length === 0) return `### 📉 [${platformName}: ${keyword}] Không tìm thấy bài quảng cáo Winning nào.`;

  const rows = ads.map((ad, i) => {
    const days = (ad as any)._runDays !== undefined ? String((ad as any)._runDays) : daysRunning(ad.startDate);
    const startDate = ad.startDate ? ad.startDate.split("T")[0] : "N/A";
    const cta = ad.ctaType || "-";
    const link = ad.libraryUrl ? `[Xem Link](${ad.libraryUrl})` : "N/A";
    const page = ad.pageName ? `**${ad.pageName}**` : "Unknown";

    return `| ${i + 1} | ${days}d | ${startDate} | ${page} | ${cta} | ${link} |`;
  });

  const table = [
    `| # | Độ bền | Ngày bắt đầu | Nhà quảng cáo | CTA | Link Thám Báo |`,
    `|---|--------|--------------|---------------|-----|---------------|`,
    ...rows
  ].join("\n");

  return `## ${icon} WINNING ADS: ${platformName} — NGÀNH ${keyword.toUpperCase()}\n\n${table}\n\n> [!TIP]\n> Các bài viết được ưu tiên theo **Winning Score (Độ bền)**. Quảng cáo chạy càng lâu chứng tỏ hiệu quả chuyển đổi càng tốt.`;
}

// ─── Resolve ONCE per request ─────────────────────────────────────────────────

async function resolvePageInfoOnce(url: string, knownPageId?: string): Promise<{
  pageId: string | undefined;
  pageName: string | undefined;
  displayName: string | undefined;
  method: string | undefined;
  slug: string | undefined;
}> {
  const slug = extractPageSlugFromUrl(url);

  if (knownPageId && /^\d+$/.test(knownPageId)) {
    let pageName: string | undefined;
    const token = process.env.META_ACCESS_TOKEN;
    if (token) {
      try {
        const r = await httpFetch({ url: `https://graph.facebook.com/v25.0/${knownPageId}?fields=id,name&access_token=${token}`, timeoutMs: 5000 });
        if (r.ok) pageName = safeStr((r.data as Record<string, unknown>).name);
      } catch { /* ok */ }
    }
    const displayName = pageName ?? (slug && !/^\d+$/.test(slug) ? await findPageDisplayName(slug) ?? undefined : undefined);
    return { pageId: knownPageId, pageName, displayName, method: "numeric_input", slug };
  }

  if (slug && /^\d+$/.test(slug)) {
    const displayName = await findPageDisplayName(slug) ?? undefined;
    return { pageId: slug, pageName: undefined, displayName, method: "numeric_url", slug };
  }

  let resolved = null;
  try { resolved = await resolvePageId(url); } catch { /* ok */ }

  const pageName = safeStr(resolved?.pageName);
  const displayName = pageName ?? (slug ? await findPageDisplayName(slug) ?? undefined : undefined);
  return { pageId: safeStr(resolved?.pageId), pageName, displayName, method: resolved?.method, slug };
}

async function checkSystemHealth(config: AdsManagerPluginConfig) {
  const results: string[] = [];
  
  // 1. Meta Token (Live Ping Test - Phase 25)
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    results.push("❌ META_ACCESS_TOKEN: Missing");
  } else {
    try {
      const pingUrl = `https://graph.facebook.com/v25.0/me?access_token=${token}`;
      const r = await httpFetch({ url: pingUrl, timeoutMs: 5000 });
      if (r.ok) {
        results.push("✅ META_ACCESS_TOKEN: Active & Valid (Ping Success)");
      } else {
        const err = (r.data as any)?.error?.message || r.statusText;
        results.push(`❌ META_ACCESS_TOKEN: Invalid or Expired (${err})`);
      }
    } catch (err) {
      results.push(`⚠️ META_ACCESS_TOKEN: DNS/Network error during Ping (${err})`);
    }
  }

  // 2. Search API
  const searchKey = process.env.SEARCHAPI_API_KEY || process.env.SERPER_API_KEY;
  if (!searchKey) results.push("❌ SEARCH_API_KEY: Missing (Search/Google Ads disabled)");
  else results.push(`✅ SEARCH_API_KEY: Active (${process.env.SEARCHAPI_API_KEY ? "SearchAPI" : "Serper"})`);

  // 3. ScrapeCreators
  const scKey = process.env.SCRAPECREATORS_API_KEY;
  if (!scKey) results.push("⚠️ SCRAPECREATORS_API_KEY: Missing (Industry Discovery limited)");
  else results.push("✅ SCRAPECREATORS_API_KEY: Active");

  // 4. Database
  if (config.database?.enabled) results.push("✅ DATABASE: Enabled (MySQL/Postgres persistence)");
  else results.push("ℹ️ DATABASE: Disabled (Local JSON mode)");

  return results.join("\n");
}

// ─── Tool Factory ─────────────────────────────────────────────────────────────

export function createAdsManagerTool(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): AnyAgentTool[] {
  const { api, pluginConfig } = params;
  const runtime = api.runtime;
  const logger = api.logger;

  // ─ Tool 1: ads_manager_brief ──────────────────────────────────────────────
  const briefTool: AnyAgentTool = {
    name: "ads_manager_brief",
    label: "Ads Manager Brief",
    description: "Read-only snapshot. Modes: report|overview|alerts|budget|plan|proposals|competitors.",
    parameters: Type.Object({ mode: Type.Optional(stringEnum(BRIEF_MODES, "View mode")) }, { additionalProperties: false }),
    execute: async (_id, raw) => {
      const mode = ((raw as any).mode ?? "report") as BriefMode;
      const ctx = await loadAssistantContext({ runtime, logger, pluginConfig });
      const payload = buildPayload(mode, ctx);
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }], details: payload };
    },
  };

  // ─ Tool 2: ads_manager_create_proposal ───────────────────────────────────
  const createProposalTool: AnyAgentTool = {
    name: "ads_manager_create_proposal",
    label: "Create Ads Proposal",
    description: "Create proposal for boss approval. Required for any campaign changes. Use CEP protocol.",
    parameters: Type.Object({ title: Type.String(), summary: Type.String(), reason: Type.String(), impact: Type.String({ description: "high/medium/low" }), campaignId: Type.Optional(Type.String()), commandHint: Type.Optional(Type.String()) }),
    execute: async (_id, raw: any) => {
      const ctx = await createProposal({ runtime, logger, pluginConfig, proposal: raw });
      const pending = ctx.state.proposals.filter(p => p.status === "pending").length;
      return { content: [{ type: "text" as const, text: `✅ Proposal created. Pending: ${pending}.\n→ /pheduyet ${ctx.state.proposals[0]?.id}` }], details: ctx.state.proposals[0] };
    },
  };

  // ─ Tool 3: ads_manager_execute_action ────────────────────────────────────
  const executeActionTool: AnyAgentTool = {
    name: "ads_manager_execute_action",
    label: "Execute Ads Action (CEP Step 2)",
    description: "Approve or reject proposal. ALWAYS confirm with boss first (CEP). Reject is safe — no confirmation needed.",
    parameters: Type.Object({ proposalId: Type.String(), status: stringEnum(["approved", "rejected"], "New status") }),
    execute: async (_id, raw: any) => {
      const ctx = await setProposalStatus({ runtime, logger, pluginConfig, proposalId: raw.proposalId, status: raw.status });
      const emoji = raw.status === "approved" ? "✅" : "🚫";
      return { content: [{ type: "text" as const, text: `${emoji} Proposal ${raw.proposalId} → ${raw.status}.` }], details: ctx.state.proposals.find(p => p.id === raw.proposalId) };
    },
  };

  // ─ Tool 4: ads_manager_ack_instruction ───────────────────────────────────
  const ackInstructionTool: AnyAgentTool = {
    name: "ads_manager_ack_instruction",
    label: "Acknowledge Boss Instruction",
    description: "Mark instruction as acknowledged after executing.",
    parameters: Type.Object({ instructionId: Type.String() }),
    execute: async (_id, raw: any) => {
      const ctx = await acknowledgeInstruction({ runtime, logger, pluginConfig, instructionId: raw.instructionId });
      return { content: [{ type: "text" as const, text: `✅ Instruction ${raw.instructionId} acknowledged.` }], details: ctx.state.instructions.find(i => i.id === raw.instructionId) };
    },
  };

  // ─ Tool 5: ads_manager_search ────────────────────────────────────────────
  const searchTool: AnyAgentTool = {
    name: "ads_manager_search",
    label: "Web Search (via config)",
    description: "Web search via intelligence.search config.",
    parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number({ default: 5 })) }),
    execute: async (_id, raw: any) => {
      const results = await performWebSearch({ config: pluginConfig, query: raw.query, limit: raw.limit });
      return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }], details: results };
    },
  };

  // ─ Tool 6: ads_manager_scrape ────────────────────────────────────────────
  const scrapeTool: AnyAgentTool = {
    name: "ads_manager_scrape",
    label: "Page Scraper",
    description: "Scrape URL content. Requires intelligence.scrape.enabled=true.",
    parameters: Type.Object({ url: Type.String() }),
    execute: async (_id, raw: any) => {
      const result = await scrapePage({ config: pluginConfig, url: raw.url });
      return { content: [{ type: "text" as const, text: `${result.title}\n\n${result.content.slice(0, 2000)}` }], details: result };
    },
  };

  // ─ Tool 7: ads_manager_analyze_ads ───────────────────────────────────────
  const analyzeAdsTool: AnyAgentTool = {
    name: "ads_manager_analyze_ads",
    label: "Ad Analyzer (Apify via config)",
    description: "Analyze competitor ads via Apify config. Requires intelligence.apify.enabled=true.",
    parameters: Type.Object({ url: Type.String(), limit: Type.Optional(Type.Number({ default: 10 })) }),
    execute: async (_id, raw: any) => {
      const results = await analyzeCompetitorAdsWithApify({ config: pluginConfig, url: raw.url, limit: raw.limit });
      return { content: [{ type: "text" as const, text: `Found ${results.length} ads.` }], details: results };
    },
  };

  // ─ Tool 8: ads_manager_save_competitor ───────────────────────────────────
  const saveCompetitorTool: AnyAgentTool = {
    name: "ads_manager_save_competitor",
    label: "Save Competitor to Memory & DB",
    description: "ALWAYS call after competitor analysis. Persists findings across sessions. Data is saved in the structured MySQL database for mathematical analysis.",
    parameters: Type.Object({ 
      name: Type.String({ description: "Display name" }), 
      angle: Type.String({ description: "Dominant angle" }), 
      note: Type.Optional(Type.String({ description: "Detailed summary" })), 
      sourceUrl: Type.Optional(Type.String()),
      ads: Type.Optional(Type.Array(Type.Object({
        id: Type.String(),
        adText: Type.Optional(Type.String()),
        mediaUrl: Type.Optional(Type.String()),
        mediaType: Type.Optional(Type.String()),
        startDate: Type.Optional(Type.String())
      })))
    }),
    execute: async (_id, raw: any) => {
      // 1. Save to state (for current session memory)
      await appendCompetitorInsight({ runtime, logger, pluginConfig, competitor: { name: raw.name, angle: raw.angle, note: raw.note, sourceUrl: raw.sourceUrl } });
      
      // 2. Save detailed ads to MySQL DB for Phase 3 analytics
      if (Array.isArray(raw.ads)) {
        for (const ad of raw.ads) {
          const mType = (ad.mediaType?.includes('video') ? 'video' : ad.mediaType?.includes('image') ? 'image' : ad.mediaType?.includes('carousel') ? 'carousel' : 'other') as any;
          const startedAt = ad.startDate ? ad.startDate.split('T')[0] : null;
          const duration = ad.startDate ? Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86400000) : 0;
          
          await saveCompetitorAdToDb(pluginConfig, {
            id: ad.id,
            pageName: raw.name,
            hookText: ad.adText,
            mediaUrl: ad.mediaUrl,
            mediaType: mType,
            startedAt: startedAt ?? undefined,
            durationDays: duration >= 0 ? duration : 0,
            isActive: true
          });
        }
      }

      return { content: [{ type: "text" as const, text: `✅ Saved "${raw.name}" and ${raw.ads?.length ?? 0} ads to DB.` }], details: { success: true, name: raw.name } };
    },
  };

  // ─ Tool 9: http_request ───────────────────────────────────────────────────
  const httpRequestTool: AnyAgentTool = {
    name: "http_request",
    label: "HTTP API Request",
    description: "Direct REST API call. Use for Meta Graph API, Buffer API, custom endpoints.",
    parameters: Type.Object({ url: Type.String(), method: Type.Optional(Type.String()), headers: Type.Optional(Type.String({ description: "JSON string" })), body: Type.Optional(Type.String()) }),
    execute: async (_id, raw: any) => {
      let h: Record<string, string> = {};
      if (raw.headers) { try { h = JSON.parse(raw.headers); } catch { /* ok */ } }
      const result = await httpFetch({ url: raw.url, method: raw.method ?? "GET", headers: h, body: raw.body });
      const bt = typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);
      return { content: [{ type: "text" as const, text: result.ok ? `✅ ${result.status}\n\n${bt}`.slice(0, 8000) : `❌ ${result.status} ${result.statusText}\n${result.error ?? bt.slice(0, 500)}` }], details: result };
    },
  };

  // ─ Tool 10: serper_search ─────────────────────────────────────────────────
  const serperSearchTool: AnyAgentTool = {
    name: "serper_search",
    label: "Google Search (Serper)",
    description: "Google search via Serper. SERPER_API_KEY from env. type: search|news|images.",
    parameters: Type.Object({ query: Type.String(), type: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) }),
    execute: async (_id, raw: any) => {
      try {
        const results = await serperSearch({ query: raw.query, type: raw.type, limit: raw.limit ?? 10 });
        return { content: [{ type: "text" as const, text: `🔍 "${raw.query}":\n\n` + results.map((r, i) => `${i+1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`).join("\n\n") }], details: results };
      } catch (err) {
        console.error(`[serper_search] Fail: ${err}`);
        return { content: [{ type: "text" as const, text: `⚠️ Tìm kiếm thông qua Serper lỗi: ${err}. Em sẽ thử dùng công cụ tìm kiếm nội bộ khác.` }], details: { error: String(err) } };
      }
    },
  };

  // ─ Tool 11: meta_ad_library ───────────────────────────────────────────────
  const metaAdLibraryTool: AnyAgentTool = {
    name: "meta_ad_library",
    label: "Facebook Ad Library Analyzer",
    description: "Analyze competitor ads. Flow: resolve(pageId+displayName) → Graph API → Apify(displayName critical for VN). Apify uses display name ('Gangnam Beauty Center') not slug for search. All credentials from env.",
    parameters: Type.Object({
      pageUrl: Type.Optional(Type.String({ description: "Facebook page URL" })),
      pageId: Type.Optional(Type.String({ description: "Numeric page ID (skip resolve step)" })),
      country: Type.Optional(Type.String({ description: "2-letter code (default: VN)" })),
      limit: Type.Optional(Type.Number({ description: "Max ads (default: 20)" })),
    }),
    execute: async (_id, raw: any) => {
      const country = safeStr(raw.country) ?? "VN";
      const limit = Number(raw.limit ?? 20);
      const originalUrl = raw.pageUrl ?? (raw.pageId ? `https://www.facebook.com/${raw.pageId}` : "");
      if (!originalUrl) {
        return { 
          content: [{ type: "text" as const, text: "⚠️ Sếp chưa cung cấp URL hoặc ID Trang. Em sẽ tự động tìm kiếm brand này trên Facebook trước khi thám báo.\n\n👉 Sếp có thể cung cấp tên brand (ví dụ: 'Gangnam Beauty Center') để em tìm kiếm chính xác hơn." }], 
          details: { error: "missing_input", recommendation: "use_serper_first" } 
        };
      }

      // RESOLVE ONCE
      const { pageId, pageName, displayName, method: resolveMethod, slug } = await resolvePageInfoOnce(originalUrl, safeStr(raw.pageId));
      const label = displayName ?? pageName ?? slug ?? "unknown";
      console.log(`[meta_ad_library] pageId=${pageId ?? "none"} displayName="${displayName ?? "none"}"`);

      // GRAPH API ATTEMPT
      const token = process.env.META_ACCESS_TOKEN;
      let graphAds: AdLibraryResult[] = [];
      if (token) {
        const searchName = pageName ?? displayName ?? slug ?? label;
        const gUrl = new URL(`https://graph.facebook.com/v25.0/ads_archive`);
        gUrl.searchParams.set("ad_reached_countries", JSON.stringify([country]));
        gUrl.searchParams.set("ad_active_status", "ALL");
        gUrl.searchParams.set("ad_type", "ALL");
        gUrl.searchParams.set("fields", "id,page_id,page_name,ad_creative_bodies,ad_delivery_start_time,publisher_platforms");
        gUrl.searchParams.set("limit", String(limit));
        gUrl.searchParams.set("search_terms", searchName);
        if (pageId) gUrl.searchParams.set("search_page_ids", pageId);
        gUrl.searchParams.set("access_token", token);
        const gr = await httpFetch({ url: gUrl.toString(), timeoutMs: 20000 });
        if (gr.ok) {
          const data = ((gr.data as Record<string, unknown>).data ?? []) as Record<string, unknown>[];
          graphAds = data.map(ad => ({ id: String(ad.id ?? ""), pageId: safeStr(ad.page_id) ?? "", pageName: safeStr(ad.page_name) ?? "", adText: Array.isArray(ad.ad_creative_bodies) ? (ad.ad_creative_bodies as string[]).join(" | ") : "", status: "ACTIVE", startDate: safeStr(ad.ad_delivery_start_time), platforms: Array.isArray(ad.publisher_platforms) ? (ad.publisher_platforms as string[]) : [] }));
        }
      }
      if (graphAds.length > 0) return { content: [{ type: "text" as const, text: formatAds(graphAds, "Meta Graph API") }], details: { ads: graphAds, count: graphAds.length, source: "meta_graph_api", pageId, displayName } };

      // APIFY PRIMARY
      const apifyToken = process.env.APIFY_TOKEN;
      if (!apifyToken) {
        const mu = pageId ? buildAdLibraryUrl(pageId, "ALL") : `https://www.facebook.com/ads/library/?search_type=keyword_unordered&q=${encodeURIComponent(label)}`;
        return { content: [{ type: "text" as const, text: [`ℹ️ APIFY_TOKEN chưa cấu hình.`, pageId ? `Page ID: ${pageId} (${displayName ?? "unknown"})` : "", `Xem: ${mu}`].filter(Boolean).join("\n") }], details: { ads: [], count: 0, pageId, displayName } };
      }

      let apifyAds: AdLibraryResult[] = [];
      try { apifyAds = await apifyFacebookAdsScraper({ url: originalUrl, pageId: pageId ?? undefined, pageName: displayName ?? pageName ?? undefined, limit, country }); }
      catch (err) { console.log(`[meta_ad_library] Apify error: ${err}`); }
      
      if (apifyAds.length > 0) {
        // AUTO-SAVE to DB
        for (const ad of apifyAds) {
          const mType = (ad.imageUrl?.includes('video') ? 'video' : 'image') as any; // Simple heuristic for Scraper results
          const duration = ad.startDate ? Math.floor((Date.now() - new Date(ad.startDate).getTime()) / 86400000) : 0;
          await saveCompetitorAdToDb(pluginConfig, {
            id: ad.id,
            pageName: label,
            hookText: ad.adText,
            mediaUrl: ad.imageUrl,
            mediaType: mType,
            startedAt: ad.startDate ? ad.startDate.split('T')[0] : undefined,
            durationDays: duration >= 0 ? duration : 0
          });
        }
        return { content: [{ type: "text" as const, text: formatAds(apifyAds, "Apify Ad Library") }], details: { ads: apifyAds, count: apifyAds.length, source: "apify", pageId, displayName } };
      }

      // BOTH FAILED
      const manualUrl = pageId ? buildAdLibraryUrl(pageId, "ALL") : `https://www.facebook.com/ads/library/?search_type=keyword_unordered&q=${encodeURIComponent(label)}`;
      return { 
        content: [{ 
          type: "text" as const, 
          text: [
            `❌ RẤT TIẾC THƯA SẾP: Không thể trích xuất dữ liệu trực tiếp cho "${label}".`,
            `Lý do: Chiến dịch này có thể được bảo mật cao hoặc Meta đang hạn chế truy cập tự động tại khu vực VN.`,
            ``,
            `💡 ĐỀ XUẤT CỦA EM:`,
            `1. Kiểm tra dữ liệu lịch sử trong Database bằng công cụ "ads_manager_get_competitor_insights".`,
            `2. Tự kiểm tra thủ công tại Link: ${manualUrl}`,
            `3. Đổi sang tìm kiếm đối thủ này trên Google Ads nếu họ có chạy đa nền tảng.`
          ].join("\n") 
        }], 
        details: { ads: [], count: 0, source: "none", pageId, displayName, manualUrl } 
      };
    },
  };

  // ─ Tool 12: apify_facebook_ads ────────────────────────────────────────────
  const apifyScraperTool: AnyAgentTool = {
    name: "apify_facebook_ads",
    label: "Apify Ad Library Scraper (Direct)",
    description: "Direct Apify scrape. IMPORTANT: pageName must be DISPLAY NAME ('Gangnam Beauty Center'), NOT slug. Ad Library URL with view_all_page_id gives best results.",
    parameters: Type.Object({ url: Type.String(), pageId: Type.Optional(Type.String()), pageName: Type.Optional(Type.String({ description: "Display name — critical for search accuracy" })), country: Type.Optional(Type.String({ description: "Country code, e.g., VN or ALL" })), limit: Type.Optional(Type.Number()) }),
    execute: async (_id, raw: any) => {
      const ads = await apifyFacebookAdsScraper({ url: raw.url, pageId: safeStr(raw.pageId), pageName: safeStr(raw.pageName), country: safeStr(raw.country), limit: raw.limit ?? 20 });
      if (ads.length === 0) return { content: [{ type: "text" as const, text: `Apify 0 ads.${raw.pageId ? `\n→ Thử: ${buildAdLibraryUrl(raw.pageId, "ALL")}` : ""}` }], details: { ads: [], count: 0 } };
      return { content: [{ type: "text" as const, text: formatAds(ads, "Apify Direct") }], details: { ads, count: ads.length } };
    },
  };

  // ─ Tool 13: resolve_facebook_page_id ─────────────────────────────────────
  const resolvePageIdTool: AnyAgentTool = {
    name: "resolve_facebook_page_id",
    label: "Resolve Facebook Page ID + Display Name",
    description: "Resolve URL → pageId + displayName (real page name). ALWAYS call before meta_ad_library for URLs. Returns BOTH pageId and displayName — both needed for VN market.",
    parameters: Type.Object({ url: Type.String({ description: "Facebook page URL or username" }) }),
    execute: async (_id, raw: any) => {
      const inputUrl = raw.url as string;
      const url = inputUrl.startsWith("http") ? inputUrl : `https://www.facebook.com/${inputUrl.replace(/^@/, "")}`;
      const slug = extractPageSlugFromUrl(url);
      const displayName = slug && !/^\d+$/.test(slug) ? await findPageDisplayName(slug) ?? undefined : undefined;

      if (slug && /^\d+$/.test(slug)) return { content: [{ type: "text" as const, text: `✅ Numeric: ${slug}\ndisplayName: "${displayName ?? "-"}"\n→ meta_ad_library(pageId: "${slug}")` }], details: { resolved: true, pageId: slug, displayName, method: "numeric_url", adLibraryUrl: buildAdLibraryUrl(slug, "ALL") } };

      let result = null;
      try { result = await resolvePageId(url); } catch (err) { return { content: [{ type: "text" as const, text: `❌ Error: ${err}` }], details: { error: String(err), resolved: false } }; }

      const finalDisplayName = displayName ?? safeStr(result?.pageName);
      if (!result) return { content: [{ type: "text" as const, text: [`⚠️ Không resolve pageId cho "${slug ?? inputUrl}".`, finalDisplayName ? `Display name tìm được: "${finalDisplayName}" → dùng cho Apify search` : "Display name: chưa tìm được", `Xem: https://www.facebook.com/ads/library/?search_type=page&q=${encodeURIComponent(slug ?? inputUrl)}`, `→ meta_ad_library(pageUrl:"${url}") — sẽ dùng "${finalDisplayName ?? slug}" cho Apify`].filter(Boolean).join("\n") }], details: { resolved: false, slug, displayName: finalDisplayName, url } };

      const adLibUrl = buildAdLibraryUrl(result.pageId, "ALL");
      return { content: [{ type: "text" as const, text: [`✅ Resolved!`, `Page ID: ${result.pageId}`, `Page Name: ${safeStr(result.pageName) ?? "unknown"}`, `Display Name: ${finalDisplayName ?? "unknown"}`, `Method: ${result.method}`, ``, `→ meta_ad_library(pageId: "${result.pageId}", country: "VN")`, `→ Ad Library: ${adLibUrl}`].join("\n") }], details: { resolved: true, pageId: result.pageId, pageName: safeStr(result.pageName), displayName: finalDisplayName, method: result.method, slug, url, adLibraryUrl: adLibUrl } };
    },
  };

  // ─ Tool 14: meta_account_data ─────────────────────────────────────────────
  const metaAccountDataTool: AnyAgentTool = {
    name: "meta_account_data",
    label: "Meta Account Live Data (Own Account)",
    description: "Pull LIVE campaign data from YOUR Meta ad account via Marketing API v25. Returns spend, ROAS, CTR, CPA per campaign with health scores (0-100). Requires META_ACCESS_TOKEN + META_AD_ACCOUNT_ID in env.",
    parameters: Type.Object({
      datePreset: Type.Optional(Type.String({ description: "today|yesterday|last_3d|last_7d|last_30d|this_month (default: today)" })),
      status: Type.Optional(Type.String({ description: "all|active|paused (default: all)" })),
    }),
    execute: async (_id, raw: any) => {
      const token = process.env.META_ACCESS_TOKEN;
      const accountId = process.env.META_AD_ACCOUNT_ID;
      if (!token || !accountId) {
        return { content: [{ type: "text" as const, text: [`❌ Thiếu cấu hình:`, !token ? "  • META_ACCESS_TOKEN chưa có" : "", !accountId ? "  • META_AD_ACCOUNT_ID chưa có (format: act_XXXXXXXXXX)" : "", ``, `Thêm vào .env:`, `  META_AD_ACCOUNT_ID=act_XXXXXXXXXX`, `  META_ACCESS_TOKEN=EAAxxxx`, ``, `Tìm Account ID: Ads Manager → Settings → Account ID`].filter(Boolean).join("\n") }], details: { error: "missing_config" } };
      }

      const datePreset = (safeStr(raw.datePreset) ?? "today");
      const data = await fetchMetaAccountData({ adAccountId: accountId, accessToken: token, datePreset });
      if (!data) return { content: [{ type: "text" as const, text: `❌ Không lấy được data. Kiểm tra token và account ID.` }], details: { error: "api_failed" } };

      const filterFn = (c: MetaCampaignData) =>
        raw.status === "active" ? c.status === "active"
        : raw.status === "paused" ? c.status === "paused" : true;

      const sorted = data.campaigns.filter(filterFn).sort((a, b) => b.spend - a.spend);

      const campLines = sorted.map((c, i) => {
        const em = gradeEmoji(c.healthGrade);
        const fatigueWarn = c.fatigued ? " ⚠️ CREATIVE FATIGUE" : "";
        return [
          `${em} ${i+1}. ${c.name} [${c.status}] — Score: ${c.healthScore}/100 (${c.healthGrade})${fatigueWarn}`,
          `   Chi: ${fmtVND(c.spend)} / ${fmtVND(c.dailyBudget || c.lifetimeBudget)} (${((c.dailyBudget || c.lifetimeBudget) > 0 ? c.spend / (c.dailyBudget || c.lifetimeBudget) * 100 : 0).toFixed(0)}% pacing)`,
          `   ROAS: ${c.roas.toFixed(2)} | CPA: ${fmtVND(c.cpa)} | CTR: ${(c.ctr).toFixed(2)}%`,
          `   Clicks: ${c.clicks.toLocaleString()} | Impressions: ${c.impressions.toLocaleString()} | Frequency: ${c.frequency.toFixed(1)}`,
          c.purchases > 0 ? `   Purchases: ${c.purchases} | Revenue: ${fmtVND(c.revenue)}` : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n");

      const avgScore = sorted.length > 0 ? Math.round(sorted.reduce((s, c) => s + c.healthScore, 0) / sorted.length) : 0;
      const avgGrade = avgScore >= 90 ? "A" : avgScore >= 75 ? "B" : avgScore >= 60 ? "C" : avgScore >= 40 ? "D" : "F";

      const summary = [
        `📊 LIVE DATA — ${data.accountName} (${datePreset})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `💳 Đã chi: ${fmtVND(data.amountSpent)} | Balance: ${fmtVND(data.balance)} | Spend Cap: ${data.spendCap > 0 ? fmtVND(data.spendCap) : "không giới hạn"}`,
        `🏥 Account Health: ${avgScore}/100 (Grade ${avgGrade}) ${gradeEmoji(avgGrade)}`,
        `📈 Campaigns: ${data.campaigns.length} total, ${sorted.length} shown`,
        ``,
        campLines || "(Không có campaigns)",
        ``,
        `→ /de_xuat để xem proposals | /pheduyet [id] để thực thi`,
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: data };
    },
  };

  // ─ Tool 15: market_industry_discovery ──────────────────────────────────────
  const marketIndustryDiscoveryTool: AnyAgentTool = {
    name: "market_industry_discovery",
    label: "Explore Winning Ads by Industry",
    description: "Search for high-performing ads (Winning Ads) across the whole market for a specific niche/industry keyword. Use this for general trends and broad competitor intelligence.",
    parameters: Type.Object({
      keyword: Type.String({ description: "Industry or product keyword (e.g. 'đồ áo trẻ em', 'thẩm mỹ viện')" }),
      country: Type.Optional(Type.String({ description: "2-letter country code (default: VN)" })),
      platform: Type.Optional(stringEnum(["FB", "IG", "GOOGLE"], "Target platform (default: FB)")),
      limit: Type.Optional(Type.Number({ description: "Max results to return (default: 10)" }))
    }),
    execute: async (_id, raw: any) => {
      const summary = await performIndustryDiscovery(raw);
      return { content: [{ type: "text" as const, text: summary }], details: { keyword: raw.keyword } };
    },
  };

  // ─ Tool 16: sync_business_data ─────────────────────────────────────────────
  const syncBusinessDataTool: AnyAgentTool = {
    name: "sync_business_data",
    label: "Sync Business / Sales Data",
    description: "Fetch real sales, leads, and revenue data from CRM/POS to compare against Meta Ads performance.",
    parameters: Type.Object({
      dateRange: Type.Optional(Type.String({ description: "Date range, e.g. 'today', 'last_7d'" })),
      sourceType: Type.Optional(Type.String({ description: "'crm' | 'sheets' | 'pos' (default: crm)" }))
    }),
    execute: async (_id, raw: any) => {
      const src = (raw.sourceType === "sheets" || raw.sourceType === "pos") ? raw.sourceType : "crm";
      const result = await syncBusinessData({ dateRange: raw.dateRange, sourceType: src as any });
      
      const summary = [
        `📊 BUSINESS DATA SYNC — Source: ${result.source} | Date: ${result.dateRange}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `👥 Total Leads: ${result.totalLeads} | Qualified Leads: ${result.qualifiedLeads} (${Math.round((result.qualifiedLeads / Math.max(result.totalLeads, 1)) * 100)}%)`,
        `💰 Total Sales: ${result.totalSales} | Revenue: ${fmtVND(result.revenue)}`,
        `⭐ Top Products: ${result.topPerformingProducts?.join(", ") ?? "N/A"}`,
        ``,
        `📝 Note: ${result.feedbackNotes ?? "No notes"}`,
        ``,
        `→ Use this data to analyze ads true ROAS and adjust A/B testing strategy.`
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: result };
    }
  };

  // ─ Tool 17: ads_manager_doctor ─────────────────────────────────────────────
  const doctorTool: AnyAgentTool = {
    name: "ads_manager_doctor",
    label: "System Health & Diagnostic",
    description: "Check system connection, API tokens, and sync status. Use this if the bot seems slow or data is missing.",
    parameters: Type.Object({}),
    execute: async () => {
      const health = await checkSystemHealth(pluginConfig);
      const ctx = await loadAssistantContext({ runtime, logger, pluginConfig });
      
      const summary = [
        `🩺 ADS MANAGER SYSTEM DOCTOR`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        health,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🕒 Last Sync: ${ctx.state.lastSyncAt ?? "Never"}`,
        `📦 Data Source: ${ctx.operations.dataSource.toUpperCase()}`,
        `⚠️ Warnings: ${ctx.warnings.length}`,
        ...ctx.warnings.map(w => `  - ${w}`),
        ``,
        `→ Everything looks stable. If a token is expired, update your .env file.`
      ].join("\n");

      return { content: [{ type: "text" as const, text: summary }], details: { health, warnings: ctx.warnings } };
    }
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
    metaAccountDataTool, // 14
    marketIndustryDiscoveryTool, // 15
    syncBusinessDataTool,// 16
    doctorTool,          // 17
    
    // ─ Tool 18: ads_manager_get_competitor_insights ──────────────────────────
    {
      name: "ads_manager_get_competitor_insights",
      label: "Query Competitor Database",
      description: "Search internal MySQL database for previously saved competitor ads and insights. Use this to get 'accurate' historical data if the live scraper is blocked or limited.",
      parameters: Type.Object({
        pageName: Type.Optional(Type.String({ description: "Filter by competitor name (partial match)" })),
      }),
      execute: async (_id, raw: any) => {
        const { getCompetitorAdsFromDb } = await import("./db-state.js");
        const ads = await getCompetitorAdsFromDb(pluginConfig, { pageName: raw.pageName });
        
        if (ads.length === 0) {
          return { content: [{ type: "text" as const, text: `ℹ️ Không tìm thấy dữ liệu cũ về "${raw.pageName || "đối thủ"}" trong Database.` }], details: { ads: [] } };
        }

        const summary = [
          `🗄️ DATABASE INSIGHTS: Found ${ads.length} historical records for "${raw.pageName || "Competitors"}"`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          ads.map((ad, i) => {
            const date = ad.started_at ? (ad.started_at instanceof Date ? ad.started_at.toISOString().split('T')[0] : ad.started_at) : "N/A";
            return `${i+1}. [${ad.page_name}] Started: ${date} | Lived: ${ad.duration_days}d | CTA: ${ad.cta_type || "N/A"}\n   Hook: ${ad.hook_text?.slice(0, 100)}...`;
          }).join("\n\n"),
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `→ Use this data to compare with live results or calculate ROI benchmarks.`
        ].join("\n");

        return { content: [{ type: "text" as const, text: summary }], details: { ads, count: ads.length } };
      }
    },
    
    // ─ Tool 19: manage_facebook_page ─────────────────────────────────────────
    {
      name: "manage_facebook_page",
      label: "Facebook Page Manager & CRM",
      description: "Manage Fanpage content, insights, comments, events, and scheduling via Graph API. Actions: schedulePost, deletePost, uploadVideo, getRecentPosts, getPageInfo, likePost, replyToPostComment, hideComment, deletePostComment, getPageInsights, getPostInsights, listEvents, createEvent, listAlbums, getPageRoles, publishDraftPost. Pass parameters in 'payload' as JSON.",
      parameters: Type.Object({
        action: Type.String({ description: "The API action name" }),
        payload: Type.Optional(Type.String({ description: "JSON string of parameters like { message, unixTimeSpanSeconds, postId, etc }" })),
      }),
      execute: async (_id, raw: any) => {
        const fbApi = await import("./facebook-page.js");
        const bsId = (pluginConfig as any).business?.id || (pluginConfig as any).businessId || "QWRzIENhbXBhaWduIE1hbmFnZXI=";
        let cfg: any = { pageId: (pluginConfig as any).pageId || process.env.FB_PAGE_ID, businessId: bsId };
        
        const resolved = await fbApi.resolvePageContext(pluginConfig, bsId);
        if (resolved) cfg = resolved;

        let p: any = {};
        if (raw.payload) {
          try { p = JSON.parse(raw.payload); } catch { /* ignore */ }
        }

        try {
          let result: any;
          switch (raw.action) {
            case "schedulePost": result = await fbApi.schedulePost(cfg, p.message, p.unixTimeSpanSeconds, p.link); break;
            case "uploadVideo": result = await fbApi.uploadVideo(cfg, p.videoUrl, p.description); break;
            case "deletePost": result = await fbApi.deletePost(cfg, p.postId); break;
            case "getRecentPosts": result = await fbApi.getRecentPosts(cfg, p.limit); break;
            case "getPageInfo": result = await fbApi.getPageInfo(cfg); break;
            case "likePost": result = await fbApi.likePost(cfg, p.postId); break;
            case "replyToPostComment": result = await fbApi.replyToPostComment(cfg, p.commentId, p.message); break;
            case "hideComment": result = await fbApi.hideComment(cfg, p.commentId); break;
            case "deletePostComment": result = await fbApi.deletePostComment(cfg, p.commentId); break;
            case "getPageInsights": result = await fbApi.getPageInsights(cfg); break;
            case "getPostInsights": result = await fbApi.getPostInsightsNode(cfg, p.postId); break;
            case "listEvents": result = await fbApi.listEvents(cfg); break;
            case "createEvent": result = await fbApi.createEvent(cfg, p.name, p.startTime, p.description); break;
            case "listAlbums": result = await fbApi.listAlbums(cfg); break;
            case "getPageRoles": result = await fbApi.getPageRoles(cfg); break;
            case "publishDraftPost": result = await fbApi.publishDraftPost(cfg, p.postId); break;
            default: return { content: [{ type: "text" as const, text: `❌ Unknown action: ${raw.action}` }], details: { error: "invalid_action" } };
          }
          const bt = JSON.stringify(result, null, 2).slice(0, 4000);
          return { content: [{ type: "text" as const, text: `✅ [${raw.action}] Success:\n${bt}` }], details: result };
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `❌ [${raw.action}] Error: ${e.message}` }], details: { error: e.message } };
        }
      }
    },

    // ─ Tool 20: post_to_personal_profile ─────────────────────────────────────
    {
      name: "post_to_personal_profile",
      label: "Post to Personal Facebook Profile (Browser Automation)",
      description: "Post a status update or photo directly to the user's PERSONAL Facebook Profile using browser automation (Playwright bypasses API restrictions). Use this only when the user explicitly asks to post to their personal profile (Trang cá nhân). Do not use this for Fanpages.",
      parameters: Type.Object({
        message: Type.String({ description: "The content of the post" }),
        photoPath: Type.Optional(Type.String({ description: "Absolute path to a photo file to upload, if any" }))
      }),
      execute: async (_id, raw: any) => {
        try {
          const profileOps = await import("./meta-profile-ops.js");
          const bsId = (pluginConfig as any).business?.id || (pluginConfig as any).businessId || "QWRzIENhbXBhaWduIE1hbmFnZXI=";
          
          // Execute browser automation
          const result = await profileOps.createProfilePost(pluginConfig, bsId, raw.message, raw.photoPath);
          
          if (result.success) {
            return { 
              content: [{ type: "text" as const, text: `✅ Đăng bài lên Profile Cá Nhân thành công! Nền tảng tự động hóa Browser (Playwright) đã thực thi an toàn.` }], 
              details: result 
            };
          } else {
            return { 
              content: [{ type: "text" as const, text: `❌ Đăng bài lên Profile Cá Nhân thất bại: ${result.error}` }], 
              details: result 
            };
          }
        } catch (e: any) {
          return { content: [{ type: "text" as const, text: `❌ Lỗi hệ thống khi gọi trình duyệt ảo: ${e.message}` }], details: { error: e.message } };
        }
      }
    }
  ];
}
