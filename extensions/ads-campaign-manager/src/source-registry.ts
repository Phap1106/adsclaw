import fs from "node:fs/promises";
import { parse } from "yaml";
import type {
  SourceRegistry,
  SourceRegistryEntry,
  SourceRegistrySummary,
  SourceTier,
  SourceUsageMode,
} from "./types.js";

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function normalizeTier(value: unknown): SourceTier {
  const normalized = readString(value, "tier2_practitioner");
  if (
    normalized === "tier1_official" ||
    normalized === "tier2_practitioner" ||
    normalized === "tier3_watch_only"
  ) {
    return normalized;
  }
  return "tier2_practitioner";
}

function normalizeUsageMode(value: unknown): SourceUsageMode {
  const normalized = readString(value, "tactic_heuristic");
  if (
    normalized === "platform_rule" ||
    normalized === "policy_boundary" ||
    normalized === "tactic_heuristic" ||
    normalized === "ops_watch"
  ) {
    return normalized;
  }
  return "tactic_heuristic";
}

function normalizeEntry(value: unknown): SourceRegistryEntry | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const title = readString(record.title);
  const url = readString(record.url);
  const organization = readString(record.organization);
  if (!id || !title || !url || !organization) {
    return null;
  }
  return {
    id,
    enabled: record.enabled !== false,
    tier: normalizeTier(record.tier),
    organization,
    author: readString(record.author) || undefined,
    title,
    url,
    topics: readStringArray(record.topics),
    usageMode: normalizeUsageMode(record.usageMode),
    reviewCadence: readString(record.reviewCadence, "quarterly"),
    trustReason: readString(record.trustReason, "Curated source."),
    notes: readString(record.notes) || undefined,
    actionNotes: readStringArray(record.actionNotes),
  };
}

export async function loadSourceRegistry(filePath: string): Promise<SourceRegistry> {
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = parse(raw) as unknown;
  const record = readRecord(parsed);
  if (!record) {
    throw new Error("Source registry must be a YAML object.");
  }
  const sources = Array.isArray(record.sources)
    ? record.sources
        .map(normalizeEntry)
        .filter((entry): entry is SourceRegistryEntry => entry !== null)
    : [];
  if (sources.length === 0) {
    throw new Error("Source registry contains no valid sources.");
  }
  return {
    version: typeof record.version === "number" ? record.version : 1,
    id: readString(record.id, "ads-campaign-manager-source-registry"),
    name: readString(record.name, "Ads Campaign Manager Source Registry"),
    description: readString(record.description) || undefined,
    updatedAt: readString(record.updatedAt) || undefined,
    sources,
  };
}

export function summarizeSourceRegistry(registry: SourceRegistry): SourceRegistrySummary {
  const byTier: Record<SourceTier, number> = {
    tier1_official: 0,
    tier2_practitioner: 0,
    tier3_watch_only: 0,
  };
  const byUsageMode: Record<SourceUsageMode, number> = {
    platform_rule: 0,
    policy_boundary: 0,
    tactic_heuristic: 0,
    ops_watch: 0,
  };
  let enabledSources = 0;
  for (const source of registry.sources) {
    byTier[source.tier] += 1;
    byUsageMode[source.usageMode] += 1;
    if (source.enabled) {
      enabledSources += 1;
    }
  }
  return {
    totalSources: registry.sources.length,
    enabledSources,
    byTier,
    byUsageMode,
  };
}
