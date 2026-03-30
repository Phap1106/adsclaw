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
      provider: "serper" | "google" | "searchapi";
      apiKey?: string;
      apiKeyEnvVar?: string;
    };
    scrape?: {
      enabled: boolean;
      provider: "playwright" | "fetch" | "scrapecreators" | "apify";
    };
    apify?: {
      enabled: boolean;
      apiToken?: string;
      apiTokenEnvVar?: string;
    };
    mistral?: {
      enabled?: boolean;
      apiTokenEnvVar?: string;
    };
  };
  fptAi?: {
    enabled: boolean;
    apiKey?: string;
    apiKeyEnvVar?: string;
  };
  facebookPage?: {
    enabled: boolean;
    pageId?: string;
    pageIdEnvVar?: string;
    pageAccessToken?: string;
    pageAccessTokenEnvVar?: string;
    apiVersion: string;
  };
};

export type FacebookPage = {
  id: string;
  business_id: string;
  fb_email: string;
  page_name: string;
  category?: string;
  access_token: string;
  perms?: any;
  is_selected: boolean;
  observed_at: string;
};

// ─── Phase 19: Competitor Ad Intelligence ─────────────────────────────────

export type HookType = "number" | "question" | "painpoint" | "generic";
export type ScoreLabel = "excellent" | "good" | "average" | "skip";
export type EngagementSource = "apify" | "proxy_model";
export type ImpressionsBand = "< 1K" | "1K-5K" | "5K-20K" | "20K-100K" | "100K-500K" | "> 500K";

export type PostEngagementData = {
  postUrl: string;
  likes: number;
  comments: number;
  shares: number;
  isVideo: boolean;
  postText: string;
  scrapedAt: string;
  source: EngagementSource;
};

export type RawCompetitorAd = {
  adLibraryId: string;
  adText: string;
  pageName: string;
  postUrl?: string;
  adLibraryUrl: string;
  startDate: string;
  daysLive: number;
  isActive: boolean;
  platforms: string[];
  mediaType: "image" | "video" | "carousel" | "other";
  impressionsBand?: ImpressionsBand;
  ctaButton?: string;
};

export type AdScoreBreakdown = {
  socialSignals: number;      // max 40
  longevitySignals: number;   // max 30
  creativeQuality: number;    // max 30
};

export type AdAnalysisFlags = {
  commentLikeRatio: number;
  suspectedFakeEngagement: boolean;
  hookType: HookType;
  hasCTA: boolean;
  hasSocialProof: boolean;
  hasPrice: boolean;
};

export type ScoredCompetitorAd = RawCompetitorAd & {
  engagement: PostEngagementData;
  trustScore: number;
  scoreLabel: ScoreLabel;
  scoringVersion: "v2";
  scoreBreakdown: AdScoreBreakdown;
  analysisFlags: AdAnalysisFlags;
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

export type DailyPoint = {
  date: string;
  spend: number;
  cpa: number;
  roas: number;
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
  historicalData?: DailyPoint[];
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

export type StrategicMemory = {
  category: "scaling" | "creative" | "targeting" | "budget" | "auth";
  insight: string;
  confidenceScore: number;
  createdAt: string;
};

export type FileType = "pdf" | "txt" | "docx" | "md" | "other";

export interface UserKnowledgeDoc {
  id: string;
  telegramId: string;
  filename: string;
  fileType: FileType;
  rawSizeBytes?: number;
  extractedText?: string;
  summary?: string;
  tags?: string;
  processingModel?: string;
  processingStatus: "pending" | "done" | "failed";
  createdAt?: string;
  updatedAt?: string;
}

export type AssistantState = {
  version: number;
  lastSyncAt?: string;
  lastAiAnalysisAt?: string;
  proposals: DerivedProposal[];
  instructions: BossInstruction[];
  competitors?: CompetitorSnapshot[];
  strategicMemory?: StrategicMemory[];
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

export type MetaAccountHealth = {
  fb_email: string;
  access_token?: string;
  success_count: number;
  fail_count: number;
  last_error?: string;
  last_login_at?: string;
  proxy_url?: string;
};

export type AssistantOperationalStatus = {
  dataSource: "none" | AdsManagerSyncMode;
  recentWebhookEvents: number;
  lastWebhookEventAt?: string;
  webhookPath?: string;
  liveWritesEnabled: boolean;
  accounts?: MetaAccountHealth[];
  pages?: FacebookPage[];
  selectedPageId?: string;
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
