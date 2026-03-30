import path from "node:path";
import type {
  AdsManagerPluginConfig,
  AdsManagerSyncMode,
  MetaInsightsDatePreset,
} from "./types.js";

type ResolvePluginConfigParams = {
  pluginConfig?: Record<string, unknown>;
  workspaceDir?: string;
};

const DEFAULT_SOURCE_REGISTRY_PATH = path.resolve(
  process.cwd(),
  "extensions/ads-campaign-manager/references/source-registry.yaml",
);
const DEFAULT_META_WEBHOOK_PATH = "/plugins/ads-campaign-manager/meta/webhook";
const DEFAULT_META_GRAPH_VERSION = "v24.0";

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveOptionalPath(
  input: unknown,
  params: ResolvePluginConfigParams,
): string | undefined {
  if (typeof input !== "string" || !input.trim()) {
    return undefined;
  }
  const trimmed = input.trim();
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  const baseDir = params.workspaceDir ?? process.cwd();
  return path.resolve(baseDir, trimmed);
}

function readSyncMode(value: unknown): AdsManagerSyncMode {
  if (value === "meta_api" || value === "hybrid") {
    return value;
  }
  return "snapshot";
}

function readInsightsDatePreset(value: unknown): MetaInsightsDatePreset {
  if (value === "yesterday" || value === "last_3d" || value === "last_7d") {
    return value;
  }
  return "today";
}

export function resolveAdsManagerPluginConfig(
  params: ResolvePluginConfigParams,
): AdsManagerPluginConfig {
  const raw = readRecord(params.pluginConfig) ?? {};
  const rawBusiness = readRecord(raw.business) ?? {};
  const rawThresholds = readRecord(raw.thresholds) ?? {};
  const rawTelegram = readRecord(raw.telegram) ?? {};
  const rawMeta = readRecord(raw.meta) ?? {};
  const rawExecution = readRecord(raw.execution) ?? {};

  return {
    locale: readString(raw.locale, "vi") === "en" ? "en" : "vi",
    safeMode: readBoolean(raw.safeMode, true),
    syncMode: readSyncMode(raw.syncMode),
    refreshIntervalMinutes: Math.max(1, Math.min(1440, readNumber(raw.refreshIntervalMinutes, 15))),
    snapshotPath: resolveOptionalPath(raw.snapshotPath, params),
    sourceRegistryPath:
      resolveOptionalPath(raw.sourceRegistryPath, params) ?? DEFAULT_SOURCE_REGISTRY_PATH,
    business: {
      name: readString(rawBusiness.name, "Ads Campaign Manager"),
      industry: readString(rawBusiness.industry, ""),
      ownerName: readString(rawBusiness.ownerName, "Boss"),
      primaryObjective: readString(
        rawBusiness.primaryObjective,
        "Scale profitable campaigns safely",
      ),
      currency: readString(rawBusiness.currency, "VND"),
      timezone: readString(rawBusiness.timezone, "Asia/Ho_Chi_Minh"),
    },
    thresholds: {
      minCtr: Math.max(0, readNumber(rawThresholds.minCtr, 0.012)),
      maxCpa: Math.max(0, readNumber(rawThresholds.maxCpa, 250000)),
      minRoas: Math.max(0, readNumber(rawThresholds.minRoas, 1.5)),
      scaleRoas: Math.max(0, readNumber(rawThresholds.scaleRoas, 2.6)),
      minSpendForDecision: Math.max(0, readNumber(rawThresholds.minSpendForDecision, 300000)),
      budgetPacingTolerance: Math.max(
        1,
        Math.min(3, readNumber(rawThresholds.budgetPacingTolerance, 1.15)),
      ),
    },
    execution: {
      enableMetaWrites: readBoolean(rawExecution.enableMetaWrites, false),
      scaleUpMultiplier: Math.max(1.01, Math.min(3, readNumber(rawExecution.scaleUpMultiplier, 1.15))),
      scaleDownMultiplier: Math.max(
        0.1,
        Math.min(0.99, readNumber(rawExecution.scaleDownMultiplier, 0.85)),
      ),
      minimumBudget: Math.max(0, readNumber(rawExecution.minimumBudget, 100000)),
    },
    meta: {
      enabled: readBoolean(rawMeta.enabled, false),
      accessToken: readOptionalString(rawMeta.accessToken),
      accessTokenEnvVar: readOptionalString(rawMeta.accessTokenEnvVar),
      appSecret: readOptionalString(rawMeta.appSecret),
      appSecretEnvVar: readOptionalString(rawMeta.appSecretEnvVar),
      adAccountId: readOptionalString(rawMeta.adAccountId),
      graphVersion: readString(rawMeta.graphVersion, DEFAULT_META_GRAPH_VERSION),
      insightsDatePreset: readInsightsDatePreset(rawMeta.insightsDatePreset),
      campaignLimit: Math.max(1, Math.min(1000, readNumber(rawMeta.campaignLimit, 250))),
      webhookVerifyToken: readOptionalString(rawMeta.webhookVerifyToken),
      webhookVerifyTokenEnvVar: readOptionalString(rawMeta.webhookVerifyTokenEnvVar),
      webhookPath: readString(rawMeta.webhookPath, DEFAULT_META_WEBHOOK_PATH),
      syncOnWebhook: readBoolean(rawMeta.syncOnWebhook, true),
    },
    telegram: {
      showDashboardButtons: readBoolean(rawTelegram.showDashboardButtons, true),
      maxProposalButtons: Math.max(1, Math.min(6, readNumber(rawTelegram.maxProposalButtons, 3))),
      syncBotProfile: readBoolean(rawTelegram.syncBotProfile, true),
      description: readString(
        rawTelegram.description,
        "Senior ads assistant for reports, alerts, and daily execution support.",
      ),
      shortDescription: readString(rawTelegram.shortDescription, "Ads assistant"),
    },
    database: raw.database
      ? {
          enabled: readBoolean((raw.database as Record<string, unknown>).enabled, false),
          host: readOptionalString((raw.database as Record<string, unknown>).host),
          port: readNumber((raw.database as Record<string, unknown>).port, 3306),
          user: readOptionalString((raw.database as Record<string, unknown>).user),
          password: readOptionalString((raw.database as Record<string, unknown>).password),
          database: readOptionalString((raw.database as Record<string, unknown>).database),
        }
      : undefined,
    aiAnalysis: raw.aiAnalysis
      ? {
          enabled: readBoolean((raw.aiAnalysis as Record<string, unknown>).enabled, false),
          model: readString((raw.aiAnalysis as Record<string, unknown>).model, "openai/gpt-4o-mini"),
          intervalHours: readNumber((raw.aiAnalysis as Record<string, unknown>).intervalHours, 6),
        }
      : undefined,
    intelligence: raw.intelligence
      ? {
          search: (raw.intelligence as any).search
            ? {
                enabled: readBoolean((raw.intelligence as any).search.enabled, false),
                provider: (raw.intelligence as any).search.provider === "searchapi" ? "searchapi" : (raw.intelligence as any).search.provider === "google" ? "google" : "serper",
                apiKey: readOptionalString((raw.intelligence as any).search.apiKey),
                apiKeyEnvVar: readOptionalString((raw.intelligence as any).search.apiKeyEnvVar),
              }
            : undefined,
          scrape: (raw.intelligence as any).scrape
            ? {
                enabled: readBoolean((raw.intelligence as any).scrape.enabled, false),
                provider: (raw.intelligence as any).scrape.provider === "scrapecreators" ? "scrapecreators" : (raw.intelligence as any).scrape.provider === "apify" ? "apify" : (raw.intelligence as any).scrape.provider === "fetch" ? "fetch" : "playwright",
              }
            : undefined,
          apify: (raw.intelligence as any).apify
            ? {
                enabled: readBoolean((raw.intelligence as any).apify.enabled, false),
                apiToken: readOptionalString((raw.intelligence as any).apify.apiToken),
                apiTokenEnvVar: readOptionalString((raw.intelligence as any).apify.apiTokenEnvVar),
              }
            : undefined,
        }
      : undefined,
    fptAi: raw.fptAi
      ? {
          enabled: readBoolean((raw.fptAi as Record<string, unknown>).enabled, false),
          apiKey: readOptionalString((raw.fptAi as Record<string, unknown>).apiKey),
          apiKeyEnvVar: readOptionalString((raw.fptAi as Record<string, unknown>).apiKeyEnvVar),
        }
      : undefined,
  };
}

export function validatePluginConfig(config: AdsManagerPluginConfig): string[] {
  const errors: string[] = [];
  if (!config.business.industry) {
    errors.push("Lĩnh vực kinh doanh (business.industry) chưa được cấu hình. BOT cần biết bạn đang chạy ads ngành nào để tối ưu chính xác.");
  }
  if (config.meta.enabled) {
    if (!config.meta.accessToken && !config.meta.accessTokenEnvVar) {
      errors.push("Meta API đang bật nhưng thiếu Access Token (meta.accessToken hoặc meta.accessTokenEnvVar).");
    }
    if (!config.meta.adAccountId) {
      errors.push("Thiếu ID tài khoản quảng cáo Meta (meta.adAccountId).");
    }
  }
  if (config.syncMode === "snapshot" && !config.snapshotPath) {
    errors.push("Chế độ snapshot đang bật nhưng thiếu đường dẫn file (snapshotPath).");
  }
  if (config.intelligence?.search?.enabled) {
    if (!config.intelligence.search.apiKey && !config.intelligence.search.apiKeyEnvVar) {
      errors.push("Công cụ Tìm kiếm (search) đang bật nhưng thiếu API Key (intelligence.search.apiKey hoặc apiKeyEnvVar).");
    }
  }
  return errors;
}
