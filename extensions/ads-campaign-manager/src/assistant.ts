import fs from "node:fs/promises";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { buildDerivedAssistantView } from "./analysis.js";
import { applyMetaProposalAction, fetchMetaAdsSnapshot, mergeSnapshotSources } from "./meta-api.js";
import { loadMetaWebhookEventStore } from "./meta-webhook-store.js";
import { loadSourceRegistry, summarizeSourceRegistry } from "./source-registry.js";
import { readJsonFile, resolveAdsManagerStateDir, writeJsonFile } from "./state-files.js";
import type {
  AdsSnapshot,
  AssistantContext,
  AssistantState,
  BossInstruction,
  DerivedProposal,
  ProposalStatus,
  AdsManagerPluginConfig,
} from "./types.js";
import { validatePluginConfig } from "./config.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

const STATE_FILENAME = "assistant-state.json";

function defaultState(): AssistantState {
  return {
    version: 1,
    proposals: [],
    instructions: [],
    competitors: [],
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeSnapshotCampaign(value: unknown): AdsSnapshot["campaigns"][number] | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const name = readString(record.name);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    objective: readString(record.objective),
    status: readString(record.status),
    spendToday: readNumber(record.spendToday),
    budget: readNumber(record.budget),
    budgetKind:
      record.budgetKind === "daily" || record.budgetKind === "lifetime"
        ? record.budgetKind
        : undefined,
    roas: readNumber(record.roas),
    ctr: readNumber(record.ctr),
    cpa: readNumber(record.cpa),
    cvr: readNumber(record.cvr),
    learningPhase: typeof record.learningPhase === "boolean" ? record.learningPhase : undefined,
    region: readString(record.region),
    audience: readString(record.audience),
    notes: readStringArray(record.notes),
  };
}

function normalizeSnapshotCompetitor(
  value: unknown,
): NonNullable<AdsSnapshot["competitors"]>[number] | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const name = readString(record.name);
  if (!name) {
    return null;
  }
  return {
    id: readString(record.id),
    name,
    region: readString(record.region),
    angle: readString(record.angle),
    observedAt: readString(record.observedAt),
    note: readString(record.note),
    sourceUrl: readString(record.sourceUrl),
  };
}

function normalizeSnapshot(value: unknown): AdsSnapshot | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const accountRecord = readRecord(record.account);
  const campaigns = Array.isArray(record.campaigns)
    ? record.campaigns
        .map(normalizeSnapshotCampaign)
        .filter((campaign): campaign is NonNullable<typeof campaign> => campaign !== null)
    : [];

  return {
    generatedAt: readString(record.generatedAt),
    account: accountRecord
      ? {
          id: readString(accountRecord.id),
          name: readString(accountRecord.name),
          objective: readString(accountRecord.objective),
          currency: readString(accountRecord.currency),
          status: readString(accountRecord.status),
          spendToday: readNumber(accountRecord.spendToday),
          spendYesterday: readNumber(accountRecord.spendYesterday),
          budgetToday: readNumber(accountRecord.budgetToday),
          roas: readNumber(accountRecord.roas),
          ctr: readNumber(accountRecord.ctr),
          cpa: readNumber(accountRecord.cpa),
        }
      : undefined,
    campaigns,
    competitors: Array.isArray(record.competitors)
      ? record.competitors
          .map(normalizeSnapshotCompetitor)
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : undefined,
    notes: readStringArray(record.notes),
  };
}

function normalizeProposal(value: unknown): DerivedProposal | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const title = readString(record.title);
  const summary = readString(record.summary);
  const reason = readString(record.reason);
  const status = readString(record.status);
  const impact = readString(record.impact);
  if (!id || !title || !summary || !reason) {
    return null;
  }
  if (status !== "pending" && status !== "approved" && status !== "rejected") {
    return null;
  }
  if (impact !== "high" && impact !== "medium" && impact !== "low") {
    return null;
  }
  return {
    id,
    status,
    impact,
    title,
    summary,
    reason,
    campaignId: readString(record.campaignId),
    commandHint: readString(record.commandHint),
    createdAt: readString(record.createdAt) ?? new Date().toISOString(),
    updatedAt: readString(record.updatedAt) ?? new Date().toISOString(),
  };
}

function normalizeInstruction(value: unknown): BossInstruction | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const text = readString(record.text);
  const createdAt = readString(record.createdAt);
  const status = readString(record.status);
  if (!id || !text || !createdAt) {
    return null;
  }
  if (status !== "queued" && status !== "acknowledged") {
    return null;
  }
  return {
    id,
    text,
    createdAt,
    status,
  };
}

function resolveStateFile(runtime: PluginRuntime): string {
  return path.join(resolveAdsManagerStateDir(runtime), STATE_FILENAME);
}

import { loadStateFromDb, saveStateToDb, saveSnapshotToDb } from "./db-state.js";

async function loadAssistantState(runtime: PluginRuntime, config: AdsManagerPluginConfig): Promise<AssistantState> {
  if (config.database?.enabled) {
    return loadStateFromDb(config);
  }
  const parsed = await readJsonFile(resolveStateFile(runtime));
  const record = readRecord(parsed);
  if (!record) {
    return defaultState();
  }
  const proposals = Array.isArray(record.proposals)
    ? record.proposals
        .map(normalizeProposal)
        .filter((proposal): proposal is DerivedProposal => proposal !== null)
    : [];
  const instructions = Array.isArray(record.instructions)
    ? record.instructions
        .map(normalizeInstruction)
        .filter((instruction): instruction is BossInstruction => instruction !== null)
    : [];
  return {
    version: 1,
    lastSyncAt: readString(record.lastSyncAt),
    lastAiAnalysisAt: readString(record.lastAiAnalysisAt),
    proposals: proposals,
    instructions: instructions,
    competitors: Array.isArray(record.competitors)
      ? record.competitors
          .map(normalizeSnapshotCompetitor)
          .filter((c): c is NonNullable<typeof c> => c !== null)
      : [],
  };
}

async function saveAssistantState(runtime: PluginRuntime, config: AdsManagerPluginConfig, state: AssistantState): Promise<void> {
  if (config.database?.enabled) {
    await saveStateToDb(config, state);
    return;
  }
  await fs.mkdir(resolveAdsManagerStateDir(runtime), { recursive: true });
  await writeJsonFile(resolveStateFile(runtime), state);
}

async function loadLocalSnapshot(snapshotPath: string | undefined): Promise<AdsSnapshot | null> {
  if (!snapshotPath) {
    return null;
  }
  const raw = await fs.readFile(snapshotPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return normalizeSnapshot(parsed);
}

async function loadConfiguredSnapshot(params: {
  pluginConfig: AdsManagerPluginConfig;
  logger: Logger;
}): Promise<{
  snapshot: AdsSnapshot | null;
  warnings: string[];
  dataSource: AssistantContext["operations"]["dataSource"];
}> {
  const warnings: string[] = [];
  const wantsLocal =
    params.pluginConfig.syncMode === "snapshot" || params.pluginConfig.syncMode === "hybrid";
  const wantsMeta =
    params.pluginConfig.syncMode === "meta_api" || params.pluginConfig.syncMode === "hybrid";

  let localSnapshot: AdsSnapshot | null = null;
  let metaSnapshot: AdsSnapshot | null = null;

  if (wantsLocal) {
    if (!params.pluginConfig.snapshotPath) {
      warnings.push("snapshotPath is not configured yet.");
    } else {
      try {
        localSnapshot = await loadLocalSnapshot(params.pluginConfig.snapshotPath);
        if (!localSnapshot) {
          warnings.push("Snapshot file exists but could not be normalized.");
        }
      } catch (error) {
        warnings.push(
          `Snapshot load failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (wantsMeta) {
    if (!params.pluginConfig.meta.enabled) {
      warnings.push("Meta live sync is disabled in plugin config.");
    } else {
      try {
        const result = await fetchMetaAdsSnapshot({
          config: params.pluginConfig,
          logger: params.logger,
        });
        metaSnapshot = result.snapshot;
        warnings.push(...result.warnings);
      } catch (error) {
        warnings.push(
          `Meta live sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (params.pluginConfig.syncMode === "snapshot") {
    return {
      snapshot: localSnapshot,
      warnings,
      dataSource: localSnapshot ? "snapshot" : "none",
    };
  }

  if (params.pluginConfig.syncMode === "meta_api") {
    if (metaSnapshot) {
      return {
        snapshot: metaSnapshot,
        warnings,
        dataSource: "meta_api",
      };
    }
    return {
      snapshot: localSnapshot,
      warnings,
      dataSource: localSnapshot ? "snapshot" : "none",
    };
  }

  const merged = mergeSnapshotSources({
    primary: metaSnapshot,
    fallback: localSnapshot,
  });
  return {
    snapshot: merged,
    warnings,
    dataSource: metaSnapshot && localSnapshot ? "hybrid" : metaSnapshot ? "meta_api" : localSnapshot ? "snapshot" : "none",
  };
}

function mergeProposals(params: {
  generated: DerivedProposal[];
  existing: DerivedProposal[];
}): DerivedProposal[] {
  const existingById = new Map(params.existing.map((proposal) => [proposal.id, proposal]));
  const merged: DerivedProposal[] = [];

  for (const proposal of params.generated) {
    const previous = existingById.get(proposal.id);
    if (previous) {
      merged.push({
        ...proposal,
        status: previous.status,
        createdAt: previous.createdAt,
        updatedAt: previous.updatedAt,
      });
      existingById.delete(proposal.id);
    } else {
      merged.push(proposal);
    }
  }

  for (const proposal of existingById.values()) {
    if (proposal.status !== "pending") {
      merged.push(proposal);
    }
  }

  return merged;
}

export async function loadAssistantContext(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
}): Promise<AssistantContext> {
  const registry = await loadSourceRegistry(params.pluginConfig.sourceRegistryPath);
  const registrySummary = summarizeSourceRegistry(registry);

  const configErrors = validatePluginConfig(params.pluginConfig);
  const warnings = [...configErrors];

  let state: AssistantState;
  let snapshotResult: Awaited<ReturnType<typeof loadConfiguredSnapshot>>;
  let eventStore: Awaited<ReturnType<typeof loadMetaWebhookEventStore>>;

  if (configErrors.length > 0) {
    state = defaultState();
    snapshotResult = { snapshot: null, warnings: [], dataSource: "none" };
    eventStore = { version: 1, events: [] };
  } else {
    state = await loadAssistantState(params.runtime, params.pluginConfig);
    snapshotResult = await loadConfiguredSnapshot({
      pluginConfig: params.pluginConfig,
      logger: params.logger,
    });
    eventStore = await loadMetaWebhookEventStore(params.runtime);
  }

  const derived = buildDerivedAssistantView({
    snapshot: snapshotResult.snapshot,
    state,
    config: params.pluginConfig,
  });

  state.proposals = mergeProposals({
    generated: derived.generatedProposals,
    existing: state.proposals,
  });
  derived.generatedProposals = state.proposals;

  return {
    config: params.pluginConfig,
    registry,
    registrySummary,
    snapshot: snapshotResult.snapshot,
    state,
    derived,
    operations: {
      dataSource: snapshotResult.dataSource,
      recentWebhookEvents: eventStore.events.length,
      lastWebhookEventAt: eventStore.events[0]?.receivedAt,
      webhookPath: params.pluginConfig.meta.enabled ? params.pluginConfig.meta.webhookPath : undefined,
      liveWritesEnabled:
        !params.pluginConfig.safeMode &&
        params.pluginConfig.meta.enabled &&
        params.pluginConfig.execution.enableMetaWrites,
    },
    warnings,
  };
}

export async function runAssistantSync(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  if (context.warnings.some(w => w.includes("chưa được cấu hình") || w.includes("thiếu"))) {
    params.logger.warn(`[ads-campaign-manager] sync skipped due to configuration errors: ${context.warnings.join(", ")}`);
    return context;
  }
  context.state.lastSyncAt = new Date().toISOString();
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  
  if (params.pluginConfig.database?.enabled && context.snapshot) {
    await saveSnapshotToDb(params.pluginConfig, context.snapshot);
  }

  // Trigger AI-Driven analysis if enabled and interval has passed
  if (params.pluginConfig.aiAnalysis?.enabled) {
    const now = Date.now();
    const lastAt = context.state.lastAiAnalysisAt ? new Date(context.state.lastAiAnalysisAt).getTime() : 0;
    const intervalMs = (params.pluginConfig.aiAnalysis.intervalHours ?? 6) * 60 * 60 * 1000;
    
    if (now - lastAt >= intervalMs) {
      await runAiAnalysis({ ...params, context });
      context.state.lastAiAnalysisAt = new Date().toISOString();
      await saveAssistantState(params.runtime, params.pluginConfig, context.state);
    } else {
      const remainingMins = Math.round((intervalMs - (now - lastAt)) / 60000);
      params.logger.info(`[ads-campaign-manager] skipping AI analysis (next in ~${remainingMins} mins)`);
    }
  }

  params.logger.info(
    `[ads-campaign-manager] sync completed alerts=${context.derived.alerts.length} proposals=${context.state.proposals.length} source=${context.operations.dataSource}`,
  );
  return await loadAssistantContext(params);
}

async function runAiAnalysis(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  context: AssistantContext;
}): Promise<void> {
  const prompt = `
You are the Senior Ads Specialist and AI Analyst. 
Business Name: ${params.context.config.business.name}
Industry/Niche: ${params.context.config.business.industry}
Primary Objective: ${params.context.config.business.primaryObjective}
Currency: ${params.context.config.business.currency}

Performance Thresholds:
- Min CTR: ${params.context.config.thresholds.minCtr}
- Max CPA: ${params.context.config.thresholds.maxCpa}
- Min ROAS: ${params.context.config.thresholds.minRoas}

Data Snapshot:
${JSON.stringify(params.context.snapshot, null, 2)}

Knowledge Base Summary:
${JSON.stringify(params.context.registrySummary, null, 2)}

Current Proposals:
${params.context.state.proposals.slice(0, 10).map(p => `- [${p.status}] ${p.title} (${p.impact})`).join("\n")}

Competitor Memory (Historical):
${params.context.state.competitors?.slice(0, 10).map(c => `- ${c.name}: ${c.angle} (Observed: ${c.observedAt})`).join("\n") ?? "No competitor data saved yet."}

Recent Instructions:
${params.context.state.instructions.filter(i => i.status === "queued").map(i => `- ${i.text}`).join("\n")}

Your Task:
1. Review the data and instructions.
2. If any campaign needs action (scale, kill, optimize), use "ads_manager_create_proposal".
3. If an existing instruction can be addressed now, do so and then use "ads_manager_ack_instruction".
6. Use "ads_manager_analyze_ads" to deeply analyze all active ads of a competitor from Facebook Ad Library. This is the best way to see their current running creative.
7. Use "ads_manager_save_competitor" to save insights about a competitor to your long-term memory.
8. Be precise, strategic, and proactive.
`;

  try {
    params.logger.info(`[ads-campaign-manager] spawning AI analyst subagent...`);
    await params.runtime.subagent.run({
      sessionKey: `ads-analyst-${params.context.config.business.name.replace(/\s+/g, "-").toLowerCase()}`,
      message: "Analyze the latest campaign metrics and boss instructions. Take appropriate actions.",
      extraSystemPrompt: prompt,
      lane: "proactive-optimization",
    });
  } catch (error) {
    params.logger.warn(`[ads-campaign-manager] failed to spawn AI analyst: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function setProposalStatus(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  proposalId: string;
  status: ProposalStatus;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  const proposal = context.state.proposals.find((entry) => entry.id === params.proposalId);
  if (!proposal) {
    throw new Error(`Proposal ${params.proposalId} was not found.`);
  }
  proposal.status = params.status;
  proposal.updatedAt = new Date().toISOString();
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);

  let executionNote: string | undefined;
  if (params.status === "approved") {
    try {
      executionNote = await applyMetaProposalAction({
        config: params.pluginConfig,
        snapshot: context.snapshot,
        proposal,
      });
    } catch (error) {
      executionNote = `Live execution failed: ${error instanceof Error ? error.message : String(error)}`;
      params.logger.warn(`[ads-campaign-manager] ${executionNote}`);
    }
  }

  const refreshed = await loadAssistantContext(params);
  if (executionNote) {
    refreshed.warnings.push(executionNote);
  }
  return refreshed;
}

export async function appendBossInstruction(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  text: string;
}): Promise<{ context: AssistantContext; instruction: BossInstruction }> {
  const context = await loadAssistantContext(params);
  const instruction: BossInstruction = {
    id: `cmd_${Date.now().toString(36)}`,
    text: params.text.trim(),
    createdAt: new Date().toISOString(),
    status: "queued",
  };
  context.state.instructions.unshift(instruction);
  context.state.instructions = context.state.instructions.slice(0, 50);
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  const refreshed = await loadAssistantContext(params);
  return {
    context: refreshed,
    instruction:
      refreshed.state.instructions.find((entry) => entry.id === instruction.id) ?? instruction,
  };
}

export async function createProposal(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  proposal: Omit<DerivedProposal, "id" | "status" | "createdAt" | "updatedAt">;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  const now = new Date().toISOString();
  const id = `ai_${Date.now().toString(36)}`;
  const proposal: DerivedProposal = {
    ...params.proposal,
    id,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  context.state.proposals.unshift(proposal);
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  return await loadAssistantContext(params);
}

export async function acknowledgeInstruction(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  instructionId: string;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  const instruction = context.state.instructions.find((entry) => entry.id === params.instructionId);
  if (instruction) {
    instruction.status = "acknowledged";
    await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  }
  return await loadAssistantContext(params);
}

export async function appendCompetitorInsight(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  competitor: Omit<NonNullable<AdsSnapshot["competitors"]>[number], "observedAt">;
}): Promise<AssistantContext> {
  const context = await loadAssistantContext(params);
  if (!context.state.competitors) {
    context.state.competitors = [];
  }
  
  const entry = {
    ...params.competitor,
    observedAt: new Date().toISOString(),
  };

  // Prevent duplicates by name or URL
  const existing = context.state.competitors.find(c => c.name === entry.name || (c.sourceUrl && c.sourceUrl === entry.sourceUrl));
  if (existing) {
    Object.assign(existing, entry);
  } else {
    context.state.competitors.unshift(entry);
  }
  
  context.state.competitors = context.state.competitors.slice(0, 50);
  await saveAssistantState(params.runtime, params.pluginConfig, context.state);
  return await loadAssistantContext(params);
}
