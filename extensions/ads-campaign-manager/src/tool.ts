import { Static, Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { loadAssistantContext, setProposalStatus, acknowledgeInstruction, createProposal, appendCompetitorInsight } from "./assistant.js";
import { performWebSearch } from "./web-search.js";
import { scrapePage } from "./scraper.js";
import { analyzeCompetitorAdsWithApify } from "./apify-service.js";
import { httpFetch, serperSearch, fetchFacebookAdLibrary, apifyFacebookAdsScraper } from "./http-fetch.js";
import type { AdsManagerPluginConfig } from "./types.js";

type BriefMode = "report" | "overview" | "alerts" | "budget" | "plan" | "proposals" | "competitors";

function stringEnum<T extends readonly string[]>(values: T, description: string) {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    description,
  });
}

const BRIEF_MODES = [
  "report",
  "overview",
  "alerts",
  "budget",
  "plan",
  "proposals",
  "competitors",
] as const;

const AdsManagerBriefSchema = Type.Object(
  {
    mode: Type.Optional(stringEnum(BRIEF_MODES, "Assistant view to return.")),
  },
  { additionalProperties: false },
);

type AdsManagerBriefParams = Static<typeof AdsManagerBriefSchema>;

function buildPayload(mode: BriefMode, context: Awaited<ReturnType<typeof loadAssistantContext>>) {
  const pending = context.state.proposals.filter((proposal) => proposal.status === "pending");
  switch (mode) {
    case "overview":
      return {
        mode,
        health: context.derived.health,
        generatedAt: context.derived.generatedAt,
        lastSyncAt: context.state.lastSyncAt,
        alerts: context.derived.alerts.length,
        winners: context.derived.winners.length,
        watchlist: context.derived.watchlist.length,
        atRisk: context.derived.atRisk.length,
        operations: context.operations,
        warnings: context.warnings,
      };
    case "alerts":
      return {
        mode,
        alerts: context.derived.alerts,
        operations: context.operations,
        warnings: context.warnings,
      };
    case "budget":
      return {
        mode,
        budget: context.derived.budget,
        operations: context.operations,
        winners: context.derived.winners.map((view) => ({
          id: view.campaign.id,
          name: view.campaign.name,
          roas: view.campaign.roas,
          ctr: view.campaign.ctr,
        })),
      };
    case "plan":
      return {
        mode,
        dailyTasks: context.derived.dailyTasks,
        bossInstructions: context.state.instructions.slice(0, 5),
        operations: context.operations,
      };
    case "proposals":
      return {
        mode,
        pending,
        all: context.state.proposals,
        operations: context.operations,
      };
    case "competitors":
      return {
        mode,
        competitors: context.snapshot?.competitors ?? [],
        notes: context.snapshot?.notes ?? [],
        operations: context.operations,
      };
    case "report":
    default:
      return {
        mode: "report",
        business: context.config.business,
        health: context.derived.health,
        generatedAt: context.derived.generatedAt,
        budget: context.derived.budget,
        alerts: context.derived.alerts,
        pendingProposals: pending,
        topWinner: context.derived.winners[0]?.campaign,
        topRisk: context.derived.atRisk[0]?.campaign,
        dailyTasks: context.derived.dailyTasks,
        operations: context.operations,
        warnings: context.warnings,
      };
  }
}


export function createAdsManagerTool(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): AnyAgentTool[] {
  const briefTool: AnyAgentTool = {
    name: "ads_manager_brief",
    label: "Ads Manager Brief",
    description:
      "Read-only ads assistant brief for reports, alerts, budget status, proposals, competitor notes, and live ops status.",
    parameters: AdsManagerBriefSchema,
    execute: async (_toolCallId, rawParams) => {
      const toolParams = rawParams as AdsManagerBriefParams;
      const mode = (toolParams.mode ?? "report") as BriefMode;
      const context = await loadAssistantContext({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
      });
      const payload = buildPayload(mode, context);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(payload, null, 2),
          },
        ],
        details: payload,
      };
    },
  };

  const createProposalSchema = Type.Object({
    title: Type.String({ description: "Short title of the proposal" }),
    summary: Type.String({ description: "Brief summary of what to do" }),
    reason: Type.String({ description: "Why this proposal is relevant" }),
    impact: Type.String({ description: "Anticipated impact (high/medium/low)" }),
    campaignId: Type.Optional(Type.String({ description: "Optional Meta Campaign ID" })),
    commandHint: Type.Optional(Type.String({ description: "Optional CLI command hint for approval" })),
  });

  const createProposalTool: AnyAgentTool = {
    name: "ads_manager_create_proposal",
    label: "Create Ads Proposal",
    description: "Create a new AI-driven proposal for the boss to review.",
    parameters: createProposalSchema,
    execute: async (_toolCallId, rawParams: any) => {
      const context = await createProposal({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        proposal: rawParams,
      });
      return {
        content: [{ type: "text", text: `Proposal created. Total pending: ${context.state.proposals.filter(p => p.status === 'pending').length}` }],
        details: context.state.proposals[0],
      };
    },
  };

  const executeActionSchema = Type.Object({
    proposalId: Type.String({ description: "ID of the proposal to act upon" }),
    status: stringEnum(["approved", "rejected"], "Target status for the proposal"),
  });

  const executeActionTool: AnyAgentTool = {
    name: "ads_manager_execute_action",
    label: "Execute Ads Action",
    description: "Approve or reject a pending ads proposal. Approving may trigger live changes on Meta.",
    parameters: executeActionSchema,
    execute: async (_toolCallId, rawParams: any) => {
      const context = await setProposalStatus({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        proposalId: rawParams.proposalId,
        status: rawParams.status,
      });
      return {
        content: [{ type: "text", text: `Proposal ${rawParams.proposalId} status set to ${rawParams.status}.` }],
        details: context.state.proposals.find(p => p.id === rawParams.proposalId),
      };
    },
  };

  const ackInstructionSchema = Type.Object({
    instructionId: Type.String({ description: "ID of the boss instruction to acknowledge" }),
  });

  const ackInstructionTool: AnyAgentTool = {
    name: "ads_manager_ack_instruction",
    label: "Acknowledge Boss Instruction",
    description: "Mark a boss instruction as acknowledged after you have analyzed or acted upon it.",
    parameters: ackInstructionSchema,
    execute: async (_toolCallId, rawParams: any) => {
      const context = await acknowledgeInstruction({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        instructionId: rawParams.instructionId,
      });
      return {
        content: [{ type: "text", text: `Instruction ${rawParams.instructionId} marked as acknowledged.` }],
        details: context.state.instructions.find(i => i.id === rawParams.instructionId),
      };
    },
  };

  const searchTool: AnyAgentTool = {
    name: "ads_manager_search",
    label: "Professional Web Search",
    description: "Perform a professional web search for competitor fanpages, industry trends, and market intelligence.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      limit: Type.Optional(Type.Number({ description: "Number of results to return", default: 5 })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      const results = await performWebSearch({
        config: params.pluginConfig,
        query: rawParams.query,
        limit: rawParams.limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        details: results,
      };
    },
  };

  const scrapeTool: AnyAgentTool = {
    name: "ads_manager_scrape",
    label: "Professional Scraper",
    description: "Scrape content from a competitor fanpage or landing page for deep analysis.",
    parameters: Type.Object({
      url: Type.String({ description: "URL to scrape" }),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      const result = await scrapePage({
        config: params.pluginConfig,
        url: rawParams.url,
      });
      return {
        content: [{ type: "text", text: `Scraped: ${result.title}\n\n${result.content.slice(0, 1000)}...` }],
        details: result,
      };
    },
  };

  const analyzeAdsTool: AnyAgentTool = {
    name: "ads_manager_analyze_ads",
    label: "Professional Ad Analyzer (Apify)",
    description: "Deeply analyze all active ads of a competitor from Facebook Ad Library using Apify. Returns ad text, images, videos, and start dates.",
    parameters: Type.Object({
      url: Type.String({ description: "Facebook Page URL or Ad Library URL" }),
      limit: Type.Optional(Type.Number({ description: "Number of ads to analyze", default: 10 })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      const results = await analyzeCompetitorAdsWithApify({
        config: params.pluginConfig,
        url: rawParams.url,
        limit: rawParams.limit,
      });
      return {
        content: [{ type: "text", text: `Found ${results.length} active ads for this competitor.` }],
        details: results,
      };
    },
  };

  const saveCompetitorTool: AnyAgentTool = {
    name: "ads_manager_save_competitor",
    label: "Save Competitor to Memory",
    description: "Save insights about a competitor (ad strategy, landing page info, etc.) to your long-term memory for future reference.",
    parameters: Type.Object({
      name: Type.String({ description: "Competitor name" }),
      angle: Type.String({ description: "Key advertising angle or offer observed" }),
      note: Type.Optional(Type.String({ description: "Additional notes" })),
      sourceUrl: Type.Optional(Type.String({ description: "URL where the competitor was found" })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      await appendCompetitorInsight({
        runtime: params.api.runtime,
        logger: params.api.logger,
        pluginConfig: params.pluginConfig,
        competitor: {
          name: rawParams.name,
          angle: rawParams.angle,
          note: rawParams.note,
          sourceUrl: rawParams.sourceUrl,
        },
      });
      return {
        content: [{ type: "text", text: `Saved competitor "${rawParams.name}" to memory.` }],
        details: { success: true, name: rawParams.name },
      };
    },
  };

  // ─── New Autonomous API Tools ─────────────────────────────────────────────

  /**
   * Generic HTTP request tool — lets the AI call ANY external API directly.
   * This eliminates the "I don't have access" problem for REST APIs.
   */
  const httpRequestTool: AnyAgentTool = {
    name: "http_request",
    label: "HTTP API Request",
    description:
      "Make a direct HTTP request to any external API or URL and return the response. Auth and keys are handled automatically by the system. You just provide the URL.",
    parameters: Type.Object({
      url: Type.String({ description: "Full URL to request including query parameters" }),
      method: Type.Optional(Type.String({ description: "HTTP method: GET, POST, PUT, DELETE (default: GET)" })),
      headers: Type.Optional(Type.String({ description: "Request headers as JSON string" })),
      body: Type.Optional(Type.String({ description: "Request body (will be sent as is)" })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      let headersObj = {};
      if (rawParams.headers) {
        try { headersObj = JSON.parse(rawParams.headers); } catch { /* ignore */ }
      }
      const result = await httpFetch({
        url: rawParams.url,
        method: rawParams.method ?? "GET",
        headers: headersObj,
        body: rawParams.body,
      });
      return {
        content: [{
          type: "text" as const,
          text: result.ok
            ? `✅ ${rawParams.method ?? "GET"} ${rawParams.url}\nStatus: ${result.status} ${result.statusText}\n\n${typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2)}`.slice(0, 8000)
            : `❌ Request failed: ${result.status} ${result.statusText}\nError: ${result.error ?? result.rawText.slice(0, 500)}`,
        }],
        details: result,
      };
    },
  };

  /**
   * Direct Serper Google Search — always uses SERPER_API_KEY from env.
   * More powerful than ads_manager_search: supports news and image search.
   */
  const serperSearchTool: AnyAgentTool = {
    name: "serper_search",
    label: "Google Search (Serper Direct)",
    description:
      "Search Google directly using Serper. Auth is handled automatically by the system. You DO NOT need an API key. Supports web, news, and image searches. Use this to find competitor information or industry news.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      type: Type.Optional(Type.String({ description: "Search type: search (default), news, images" })),
      limit: Type.Optional(Type.Number({ description: "Number of results to return (default: 10)" })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      const results = await serperSearch({
        query: rawParams.query,
        type: rawParams.type,
        limit: rawParams.limit ?? 10,
      });
      return {
        content: [{
          type: "text" as const,
          text: `🔍 Search results for "${rawParams.query}":\n\n` +
            results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`).join("\n\n"),
        }],
        details: results,
      };
    },
  };

  /**
   * Direct Facebook Ad Library API call.
   * Uses public Meta Graph API to fetch active ads for a competitor page.
   */
  const metaAdLibraryTool: AnyAgentTool = {
    name: "meta_ad_library",
    label: "Facebook Ad Library (Direct API)",
    description:
      "Fetch active ads directly from the Facebook Ad Library API. Auth is fully automatic, you DO NOT need a token. Provide a Facebook page URL or page ID. Returns ad copy, dates, platforms, and impressions. Just call the tool.",
    parameters: Type.Object({
      pageUrl: Type.Optional(Type.String({ description: "Full Facebook page URL (e.g. https://www.facebook.com/taxprovietnam)" })),
      pageId: Type.Optional(Type.String({ description: "Facebook Page ID (numeric or username)" })),
      country: Type.Optional(Type.String({ description: "2-letter country code (default: VN)" })),
      limit: Type.Optional(Type.Number({ description: "Max number of ads to return (default: 20)" })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      const ads = await fetchFacebookAdLibrary({
        pageUrl: rawParams.pageUrl,
        pageId: rawParams.pageId,
        country: rawParams.country ?? "VN",
        limit: rawParams.limit ?? 20,
      });
      if (ads.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No active ads found for this page in the Ad Library. The page may not be running ads currently, or it is not visible in the public library." }],
          details: { ads: [], count: 0 },
        };
      }
      const summary = ads.map((ad: any, i: number) =>
        `Ad ${i + 1}: ${(ad.adText ?? "No text").slice(0, 200)}\n  From: ${ad.startDate ?? "unknown date"}\n  Platforms: ${Array.isArray(ad.platforms) ? ad.platforms.join(", ") : "unknown"}`,
      );
      return {
        content: [{
          type: "text" as const,
          text: `📊 Found ${ads.length} active ads:\n\n${summary.join("\n\n")}`,
        }],
        details: { ads, count: ads.length },
      };
    },
  };

  /**
   * Direct Apify Facebook Ads Scraper — always uses APIFY_TOKEN from env.
   * More reliable than meta_ad_library for deep ad content extraction.
   */
  const apifyScraperTool: AnyAgentTool = {
    name: "apify_facebook_ads",
    label: "Apify Facebook Ads Deep Scraper",
    description:
      "Deeply scrape Facebook Ads for ANY competitor page using Apify. Auth is fully automatic, the system already has the token. You DO NOT need to ask the user for a token. Just provide the URL and call the tool.",
    parameters: Type.Object({
      url: Type.String({ description: "Facebook page URL or Ad Library URL to analyze" }),
      limit: Type.Optional(Type.Number({ description: "Max number of ads to retrieve (default: 15)" })),
    }),
    execute: async (_toolCallId, rawParams: any) => {
      const ads = await apifyFacebookAdsScraper({
        url: rawParams.url,
        limit: rawParams.limit ?? 15,
      });
      if (ads.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Apify returned no ads for this URL. The page may not be running ads, or try a different URL format." }],
          details: { ads: [], count: 0 },
        };
      }
      const summary = ads.map((ad: any, i: number) =>
        `Ad ${i + 1}: ${(ad.adText ?? "No text").slice(0, 300)}\n  Page: ${ad.pageName}\n  Start: ${ad.startDate}\n  Image: ${ad.imageUrl ?? "none"}`,
      );
      return {
        content: [{
          type: "text" as const,
          text: `🎯 Apify found ${ads.length} ads:\n\n${summary.join("\n\n")}`,
        }],
        details: { ads, count: ads.length },
      };
    },
  };

  return [
    briefTool,
    createProposalTool,
    executeActionTool,
    ackInstructionTool,
    searchTool,
    scrapeTool,
    analyzeAdsTool,
    saveCompetitorTool,
    // New autonomous tools
    httpRequestTool,
    serperSearchTool,
    metaAdLibraryTool,
    apifyScraperTool,
  ];
}
