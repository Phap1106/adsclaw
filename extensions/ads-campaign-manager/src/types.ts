export type AdsManagerLocale = "vi" | "en";
export type AdsManagerSyncMode = "snapshot" | "meta_api" | "hybrid";
export type MetaInsightsDatePreset = "today" | "yesterday" | "last_3d" | "last_7d";
export type HealthLevel = "good" | "watch" | "risk";
export type AlertSeverity = "high" | "medium" | "low";
export type ProposalStatus = "pending" | "approved" | "rejected";
export type ProposalImpact = "high" | "medium" | "low";
export type SourceTier = "tier1_official" | "tier2_practitioner" | "tier3_watch_only";
export type SourceUsageMode =
  | "platform_rule"
  | "policy_boundary"
  | "tactic_heuristic"
  | "ops_watch";
export type CampaignBudgetKind = "daily" | "lifetime";

export type AdsManagerPluginConfig = {
  locale: AdsManagerLocale;
  safeMode: boolean;
  syncMode: AdsManagerSyncMode;
  refreshIntervalMinutes: number;
  snapshotPath?: string;
  sourceRegistryPath: string;
  business: {
    name: string;
    industry: string;
    ownerName: string;
    primaryObjective: string;
    currency: string;
    timezone: string;
  };
  thresholds: {
    minCtr: number;
    maxCpa: number;
    minRoas: number;
    scaleRoas: number;
    minSpendForDecision: number;
    budgetPacingTolerance: number;
  };
  execution: {
    enableMetaWrites: boolean;
    scaleUpMultiplier: number;
    scaleDownMultiplier: number;
    minimumBudget: number;
  };
  meta: {
    enabled: boolean;
    accessToken?: string;
    accessTokenEnvVar?: string;
    appSecret?: string;
    appSecretEnvVar?: string;
    adAccountId?: string;
    graphVersion: string;
    insightsDatePreset: MetaInsightsDatePreset;
    campaignLimit: number;
    webhookVerifyToken?: string;
    webhookVerifyTokenEnvVar?: string;
    webhookPath: string;
    syncOnWebhook: boolean;
  };
  telegram: {
    showDashboardButtons: boolean;
    maxProposalButtons: number;
    syncBotProfile: boolean;
    description: string;
    shortDescription: string;
  };
  database?: {
    enabled: boolean;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
  aiAnalysis?: {
    enabled: boolean;
    model?: string;
    intervalHours?: number;
  };
  intelligence?: {
    search?: {
      enabled: boolean;
      provider: "serper" | "google";
      apiKey?: string;
      apiKeyEnvVar?: string;
    };
    scrape?: {
      enabled: boolean;
      provider: "playwright" | "fetch";
    };
    apify?: {
      enabled: boolean;
      apiToken?: string;
      apiTokenEnvVar?: string;
    };
  };
  fptAi?: {
    enabled: boolean;
    apiKey?: string;
    apiKeyEnvVar?: string;
  };
};

export type SourceRegistryEntry = {
  id: string;
  enabled: boolean;
  tier: SourceTier;
  organization: string;
  author?: string;
  title: string;
  url: string;
  topics: string[];
  usageMode: SourceUsageMode;
  reviewCadence: string;
  trustReason: string;
  notes?: string;
  actionNotes?: string[];
};

export type SourceRegistry = {
  version: number;
  id: string;
  name: string;
  description?: string;
  updatedAt?: string;
  sources: SourceRegistryEntry[];
};

export type SourceRegistrySummary = {
  totalSources: number;
  enabledSources: number;
  byTier: Record<SourceTier, number>;
  byUsageMode: Record<SourceUsageMode, number>;
};

export type AccountSnapshot = {
  id?: string;
  name?: string;
  objective?: string;
  currency?: string;
  status?: string;
  spendToday?: number;
  spendYesterday?: number;
  budgetToday?: number;
  roas?: number;
  ctr?: number;
  cpa?: number;
};

export type CampaignSnapshot = {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  spendToday?: number;
  budget?: number;
  budgetKind?: CampaignBudgetKind;
  roas?: number;
  ctr?: number;
  cpa?: number;
  cvr?: number;
  learningPhase?: boolean;
  region?: string;
  audience?: string;
  notes?: string[];
};

export type CompetitorSnapshot = {
  id?: string;
  name: string;
  region?: string;
  angle?: string;
  observedAt?: string;
  note?: string;
  sourceUrl?: string;
};

export type AdsSnapshot = {
  generatedAt?: string;
  account?: AccountSnapshot;
  campaigns: CampaignSnapshot[];
  competitors?: CompetitorSnapshot[];
  notes?: string[];
};

export type DerivedAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  campaignId?: string;
};

export type DerivedProposal = {
  id: string;
  status: ProposalStatus;
  impact: ProposalImpact;
  title: string;
  summary: string;
  reason: string;
  campaignId?: string;
  commandHint?: string;
  createdAt: string;
  updatedAt: string;
};

export type BossInstruction = {
  id: string;
  text: string;
  createdAt: string;
  status: "queued" | "acknowledged";
};

export type AssistantState = {
  version: number;
  lastSyncAt?: string;
  lastAiAnalysisAt?: string;
  proposals: DerivedProposal[];
  instructions: BossInstruction[];
  competitors?: CompetitorSnapshot[];
};

export type DerivedCampaignView = {
  campaign: CampaignSnapshot;
  health: HealthLevel;
  reasons: string[];
};

export type BudgetSummary = {
  spendToday: number;
  budgetToday: number;
  utilization: number;
  overspending: boolean;
};

export type DerivedAssistantView = {
  generatedAt: string;
  health: HealthLevel;
  alerts: DerivedAlert[];
  generatedProposals: DerivedProposal[];
  winners: DerivedCampaignView[];
  atRisk: DerivedCampaignView[];
  watchlist: DerivedCampaignView[];
  dailyTasks: string[];
  budget: BudgetSummary;
};

export type MetaWebhookEvent = {
  id: string;
  receivedAt: string;
  object?: string;
  entryCount: number;
  changeCount: number;
  sampleFields: string[];
};

export type MetaWebhookEventStore = {
  version: 1;
  events: MetaWebhookEvent[];
};

export type AssistantOperationalStatus = {
  dataSource: "none" | AdsManagerSyncMode;
  recentWebhookEvents: number;
  lastWebhookEventAt?: string;
  webhookPath?: string;
  liveWritesEnabled: boolean;
};

export type AssistantContext = {
  config: AdsManagerPluginConfig;
  registry: SourceRegistry;
  registrySummary: SourceRegistrySummary;
  snapshot: AdsSnapshot | null;
  state: AssistantState;
  derived: DerivedAssistantView;
  operations: AssistantOperationalStatus;
  warnings: string[];
};

export type TelegramButtons = Array<Array<{ text: string; callback_data: string }>>;

export type CommandReply = {
  text: string;
  channelData?: {
    telegram?: {
      buttons?: TelegramButtons;
    };
  };
};
