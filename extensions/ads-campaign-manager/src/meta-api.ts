import type {
  AdsManagerPluginConfig,
  AdsSnapshot,
  CampaignBudgetKind,
  CampaignSnapshot,
  DerivedProposal,
} from "./types.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type MetaApiListResponse<T> = {
  data?: T[];
  paging?: {
    next?: string;
  };
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

type MetaAccountRow = Record<string, unknown>;
type MetaCampaignRow = Record<string, unknown>;
type MetaInsightsRow = Record<string, unknown>;

type MetaFetchResult = {
  snapshot: AdsSnapshot;
  warnings: string[];
};

const GRAPH_BASE_URL = "https://graph.facebook.com";
const PURCHASE_ACTION_HINTS = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
];

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeMetaAccountId(accountId: string): string {
  const trimmed = accountId.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

export function resolveMetaSecret(directValue?: string, envVarName?: string): string | undefined {
  if (directValue?.trim()) {
    return directValue.trim();
  }
  if (envVarName?.trim()) {
    const envValue = process.env[envVarName.trim()];
    if (typeof envValue === "string" && envValue.trim()) {
      return envValue.trim();
    }
  }
  return undefined;
}

function buildGraphUrl(params: {
  graphVersion: string;
  pathOrUrl: string;
  accessToken: string;
  query?: Record<string, string>;
}): string {
  if (/^https?:\/\//i.test(params.pathOrUrl)) {
    return params.pathOrUrl;
  }
  const url = new URL(`${GRAPH_BASE_URL}/${params.graphVersion}${params.pathOrUrl}`);
  url.searchParams.set("access_token", params.accessToken);
  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function requestGraphJson<T>(params: {
  config: AdsManagerPluginConfig;
  accessToken: string;
  pathOrUrl: string;
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, string>;
}): Promise<T> {
  const method = params.method ?? "GET";
  const url = buildGraphUrl({
    graphVersion: params.config.meta.graphVersion,
    pathOrUrl: params.pathOrUrl,
    accessToken: params.accessToken,
    query: method === "GET" ? params.query : undefined,
  });
  const response = await fetch(url, {
    method,
    headers:
      method === "POST"
        ? {
            "content-type": "application/x-www-form-urlencoded",
          }
        : undefined,
    body:
      method === "POST"
        ? new URLSearchParams({
            access_token: params.accessToken,
            ...(params.body ?? {}),
          }).toString()
        : undefined,
  });
  const rawText = await response.text();
  let payload: Record<string, unknown> = {};
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new Error(`Meta Graph API returned non-JSON response (${response.status}).`);
    }
  }
  const apiError = readRecord(payload.error);
  if (!response.ok || apiError) {
    const message =
      readString(apiError?.message) ??
      (rawText.trim() ? rawText.trim() : `HTTP ${response.status}`);
    throw new Error(`Meta Graph API request failed: ${message}`);
  }
  return payload as T;
}

async function requestGraphPages<T>(params: {
  config: AdsManagerPluginConfig;
  accessToken: string;
  path: string;
  query: Record<string, string>;
  maxItems: number;
}): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let nextUrl: string | undefined = buildGraphUrl({
    graphVersion: params.config.meta.graphVersion,
    pathOrUrl: params.path,
    accessToken: params.accessToken,
    query: params.query,
  });
  let truncated = false;

  while (nextUrl && items.length < params.maxItems) {
    const page = await requestGraphJson<MetaApiListResponse<T>>({
      config: params.config,
      accessToken: params.accessToken,
      pathOrUrl: nextUrl,
    });
    const pageItems = Array.isArray(page.data) ? page.data : [];
    for (const item of pageItems) {
      items.push(item);
      if (items.length >= params.maxItems) {
        truncated = Boolean(page.paging?.next) || pageItems.length > 0;
        break;
      }
    }
    if (items.length >= params.maxItems) {
      break;
    }
    nextUrl = page.paging?.next;
  }

  return { items, truncated: truncated || Boolean(nextUrl) };
}

function normalizePercentFraction(value: unknown): number | undefined {
  const number = readNumber(value);
  return number !== undefined ? number / 100 : undefined;
}

function normalizeBudgetValue(value: unknown): number | undefined {
  const number = readNumber(value);
  return number !== undefined ? Math.round(number) : undefined;
}

function isPurchaseActionType(actionType: string | undefined): boolean {
  if (!actionType) {
    return false;
  }
  const normalized = actionType.trim().toLowerCase();
  return PURCHASE_ACTION_HINTS.some((hint) => normalized.includes(hint));
}

function sumMatchingActionValues(entries: unknown, matcher: (actionType: string | undefined) => boolean) {
  let total = 0;
  let matched = false;
  for (const entry of readArray(entries)) {
    const record = readRecord(entry);
    if (!record || !matcher(readString(record.action_type))) {
      continue;
    }
    const value = readNumber(record.value);
    if (value === undefined) {
      continue;
    }
    total += value;
    matched = true;
  }
  return matched ? total : undefined;
}

function extractPurchaseRoas(row: MetaInsightsRow): number | undefined {
  const entries = readArray(row.purchase_roas);
  for (const entry of entries) {
    const record = readRecord(entry);
    const direct = readNumber(record?.value ?? entry);
    if (direct !== undefined) {
      return direct;
    }
  }
  return readNumber(row.purchase_roas);
}

function extractPurchaseCpa(row: MetaInsightsRow): number | undefined {
  const explicit = sumMatchingActionValues(row.cost_per_action_type, isPurchaseActionType);
  if (explicit !== undefined) {
    return explicit;
  }
  const spend = readNumber(row.spend);
  const purchases = sumMatchingActionValues(row.actions, isPurchaseActionType);
  if (spend !== undefined && purchases && purchases > 0) {
    return spend / purchases;
  }
  return undefined;
}

function normalizeMetaCampaign(row: MetaCampaignRow): CampaignSnapshot | null {
  const id = readString(row.id);
  const name = readString(row.name);
  if (!id || !name) {
    return null;
  }
  const dailyBudget = normalizeBudgetValue(row.daily_budget);
  const lifetimeBudget = normalizeBudgetValue(row.lifetime_budget);
  const budgetKind: CampaignBudgetKind | undefined =
    dailyBudget !== undefined ? "daily" : lifetimeBudget !== undefined ? "lifetime" : undefined;
  return {
    id,
    name,
    objective: readString(row.objective),
    status: readString(row.effective_status) ?? readString(row.status),
    budget: dailyBudget ?? lifetimeBudget ?? normalizeBudgetValue(row.budget_remaining),
    budgetKind,
  };
}

function applyInsightsToCampaign(campaign: CampaignSnapshot, row: MetaInsightsRow): CampaignSnapshot {
  return {
    ...campaign,
    spendToday: readNumber(row.spend),
    ctr: normalizePercentFraction(row.ctr),
    cpa: extractPurchaseCpa(row),
    roas: extractPurchaseRoas(row),
  };
}

function buildMetaCampaigns(params: {
  campaignRows: MetaCampaignRow[];
  insightRows: MetaInsightsRow[];
}): CampaignSnapshot[] {
  const campaigns = new Map<string, CampaignSnapshot>();

  for (const row of params.campaignRows) {
    const campaign = normalizeMetaCampaign(row);
    if (!campaign) {
      continue;
    }
    campaigns.set(campaign.id, campaign);
  }

  for (const row of params.insightRows) {
    const campaignId = readString(row.campaign_id);
    if (!campaignId) {
      continue;
    }
    const existing = campaigns.get(campaignId) ?? {
      id: campaignId,
      name: readString(row.campaign_name) ?? campaignId,
    };
    campaigns.set(campaignId, applyInsightsToCampaign(existing, row));
  }

  return [...campaigns.values()].toSorted(
    (left, right) => (right.spendToday ?? 0) - (left.spendToday ?? 0),
  );
}

export async function fetchMetaAdsSnapshot(params: {
  config: AdsManagerPluginConfig;
  logger: Logger;
}): Promise<MetaFetchResult> {
  const accessToken = resolveMetaSecret(
    params.config.meta.accessToken,
    params.config.meta.accessTokenEnvVar,
  );
  const adAccountId = params.config.meta.adAccountId?.trim();
  if (!accessToken) {
    throw new Error("Meta access token is not configured.");
  }
  if (!adAccountId) {
    throw new Error("Meta adAccountId is not configured.");
  }

  const normalizedAccountId = normalizeMetaAccountId(adAccountId);
  const warnings: string[] = [];
  const [accountRow, campaignPage, insightPage, accountInsightPage] = await Promise.all([
    requestGraphJson<MetaAccountRow>({
      config: params.config,
      accessToken,
      pathOrUrl: `/${normalizedAccountId}`,
      query: {
        fields: "id,name,account_status,currency,amount_spent,spend_cap",
      },
    }),
    requestGraphPages<MetaCampaignRow>({
      config: params.config,
      accessToken,
      path: `/${normalizedAccountId}/campaigns`,
      query: {
        fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,budget_remaining",
        limit: String(Math.min(params.config.meta.campaignLimit, 100)),
      },
      maxItems: params.config.meta.campaignLimit,
    }),
    requestGraphPages<MetaInsightsRow>({
      config: params.config,
      accessToken,
      path: `/${normalizedAccountId}/insights`,
      query: {
        level: "campaign",
        date_preset: params.config.meta.insightsDatePreset,
        fields:
          "campaign_id,campaign_name,spend,ctr,actions,cost_per_action_type,purchase_roas",
        limit: String(Math.min(params.config.meta.campaignLimit, 100)),
      },
      maxItems: params.config.meta.campaignLimit,
    }),
    requestGraphPages<MetaInsightsRow>({
      config: params.config,
      accessToken,
      path: `/${normalizedAccountId}/insights`,
      query: {
        level: "account",
        date_preset: params.config.meta.insightsDatePreset,
        fields: "spend,ctr,actions,cost_per_action_type,purchase_roas",
        limit: "1",
      },
      maxItems: 1,
    }),
  ]);

  if (campaignPage.truncated) {
    warnings.push(
      `Meta campaign list reached the configured cap (${params.config.meta.campaignLimit}). Increase meta.campaignLimit if needed.`,
    );
  }
  if (insightPage.truncated) {
    warnings.push(
      `Meta insights list reached the configured cap (${params.config.meta.campaignLimit}). Increase meta.campaignLimit if needed.`,
    );
  }

  const campaigns = buildMetaCampaigns({
    campaignRows: campaignPage.items,
    insightRows: insightPage.items,
  });
  const accountInsights = accountInsightPage.items[0];
  const totalBudget = campaigns.reduce((sum, campaign) => sum + (campaign.budget ?? 0), 0);

  params.logger.info(
    `[ads-campaign-manager] meta live sync account=${normalizedAccountId} campaigns=${campaigns.length}`,
  );

  return {
    snapshot: {
      generatedAt: new Date().toISOString(),
      account: {
        id: readString(accountRow.id),
        name: readString(accountRow.name),
        status: readString(accountRow.account_status),
        currency: readString(accountRow.currency) ?? params.config.business.currency,
        spendToday:
          readNumber(accountInsights?.spend) ?? campaigns.reduce((sum, campaign) => sum + (campaign.spendToday ?? 0), 0),
        budgetToday: totalBudget > 0 ? totalBudget : undefined,
        ctr: normalizePercentFraction(accountInsights?.ctr),
        cpa: accountInsights ? extractPurchaseCpa(accountInsights) : undefined,
        roas: accountInsights ? extractPurchaseRoas(accountInsights) : undefined,
      },
      campaigns,
      notes: [
        `Live data source: Meta Marketing API (${normalizedAccountId})`,
        `Date preset: ${params.config.meta.insightsDatePreset}`,
      ],
    },
    warnings,
  };
}

function mergeCampaignMetadata(
  primary: CampaignSnapshot,
  fallback: CampaignSnapshot | undefined,
): CampaignSnapshot {
  if (!fallback) {
    return primary;
  }
  return {
    ...primary,
    region: primary.region ?? fallback.region,
    audience: primary.audience ?? fallback.audience,
    notes:
      primary.notes && primary.notes.length > 0
        ? primary.notes
        : fallback.notes,
    learningPhase: primary.learningPhase ?? fallback.learningPhase,
  };
}

export function mergeSnapshotSources(params: {
  primary: AdsSnapshot | null;
  fallback: AdsSnapshot | null;
}): AdsSnapshot | null {
  if (!params.primary) {
    return params.fallback;
  }
  if (!params.fallback) {
    return params.primary;
  }
  const fallbackCampaigns = new Map(params.fallback.campaigns.map((campaign) => [campaign.id, campaign]));
  return {
    ...params.primary,
    competitors:
      params.primary.competitors && params.primary.competitors.length > 0
        ? params.primary.competitors
        : params.fallback.competitors,
    notes: [...new Set([...(params.primary.notes ?? []), ...(params.fallback.notes ?? [])])],
    campaigns: params.primary.campaigns.map((campaign) =>
      mergeCampaignMetadata(campaign, fallbackCampaigns.get(campaign.id)),
    ),
  };
}

async function updateMetaCampaignBudget(params: {
  config: AdsManagerPluginConfig;
  campaignId: string;
  budgetKind: CampaignBudgetKind;
  budget: number;
}): Promise<void> {
  const accessToken = resolveMetaSecret(
    params.config.meta.accessToken,
    params.config.meta.accessTokenEnvVar,
  );
  if (!accessToken) {
    throw new Error("Meta access token is not configured.");
  }
  const fieldName = params.budgetKind === "lifetime" ? "lifetime_budget" : "daily_budget";
  await requestGraphJson<{ success?: boolean }>({
    config: params.config,
    accessToken,
    pathOrUrl: `/${params.campaignId}`,
    method: "POST",
    body: {
      [fieldName]: String(Math.max(0, Math.round(params.budget))),
    },
  });
}

function resolveProposalAction(proposal: DerivedProposal): string {
  return proposal.id.split("_")[0] ?? proposal.id;
}

export async function applyMetaProposalAction(params: {
  config: AdsManagerPluginConfig;
  snapshot: AdsSnapshot | null;
  proposal: DerivedProposal;
}): Promise<string> {
  if (params.config.safeMode) {
    return "Safe mode is enabled, so approval stayed internal-only.";
  }
  if (!params.config.execution.enableMetaWrites) {
    return "Live Meta execution is disabled, so approval stayed internal-only.";
  }
  if (!params.config.meta.enabled) {
    return "Meta live connector is disabled, so approval stayed internal-only.";
  }
  if (!params.proposal.campaignId) {
    return "Proposal has no linked campaign, so there was no live action to execute.";
  }

  const campaign = params.snapshot?.campaigns.find((entry) => entry.id === params.proposal.campaignId);
  if (!campaign) {
    return `Campaign ${params.proposal.campaignId} was not found in the latest snapshot.`;
  }

  const action = resolveProposalAction(params.proposal);
  if (action !== "tangngansach" && action !== "giamngansach") {
    return `No live executor is implemented yet for proposal type "${action}".`;
  }
  if (!campaign.budgetKind || !campaign.budget || campaign.budget <= 0) {
    return `Campaign ${campaign.name} does not expose a writable ${action} budget in the current snapshot.`;
  }

  const multiplier =
    action === "tangngansach"
      ? params.config.execution.scaleUpMultiplier
      : params.config.execution.scaleDownMultiplier;
  const nextBudget = Math.max(
    params.config.execution.minimumBudget,
    Math.round(campaign.budget * multiplier),
  );
  if (nextBudget === campaign.budget) {
    return `Campaign ${campaign.name} already matches the computed target budget.`;
  }

  await updateMetaCampaignBudget({
    config: params.config,
    campaignId: campaign.id,
    budgetKind: campaign.budgetKind,
    budget: nextBudget,
  });
  return `${campaign.name}: applied live ${campaign.budgetKind} budget update ${campaign.budget} -> ${nextBudget}.`;
}
