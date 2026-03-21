import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { readJsonFile, resolveAdsManagerStateDir, writeJsonFile } from "./state-files.js";
import type { MetaWebhookEvent, MetaWebhookEventStore } from "./types.js";

const META_WEBHOOK_EVENTS_FILENAME = "meta-webhook-events.json";
const MAX_META_WEBHOOK_EVENTS = 50;

function defaultStore(): MetaWebhookEventStore {
  return {
    version: 1,
    events: [],
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeMetaWebhookEvent(value: unknown): MetaWebhookEvent | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }
  const id = readString(record.id);
  const receivedAt = readString(record.receivedAt);
  if (!id || !receivedAt) {
    return null;
  }
  return {
    id,
    receivedAt,
    object: readString(record.object),
    entryCount: readNumber(record.entryCount) ?? 0,
    changeCount: readNumber(record.changeCount) ?? 0,
    sampleFields: readStringArray(record.sampleFields).slice(0, 8),
  };
}

function resolveMetaWebhookEventStorePath(runtime: PluginRuntime): string {
  return path.join(resolveAdsManagerStateDir(runtime), META_WEBHOOK_EVENTS_FILENAME);
}

export async function loadMetaWebhookEventStore(
  runtime: PluginRuntime,
): Promise<MetaWebhookEventStore> {
  const parsed = await readJsonFile(resolveMetaWebhookEventStorePath(runtime));
  const record = readRecord(parsed);
  if (!record) {
    return defaultStore();
  }
  const events = Array.isArray(record.events)
    ? record.events
        .map(normalizeMetaWebhookEvent)
        .filter((event): event is MetaWebhookEvent => event !== null)
    : [];
  return {
    version: 1,
    events,
  };
}

export async function appendMetaWebhookEvent(
  runtime: PluginRuntime,
  event: MetaWebhookEvent,
): Promise<MetaWebhookEventStore> {
  const store = await loadMetaWebhookEventStore(runtime);
  store.events.unshift(event);
  store.events = store.events.slice(0, MAX_META_WEBHOOK_EVENTS);
  await writeJsonFile(resolveMetaWebhookEventStorePath(runtime), store);
  return store;
}

export function summarizeMetaWebhookPayload(payload: unknown): Omit<MetaWebhookEvent, "id" | "receivedAt"> {
  const record = readRecord(payload);
  const entries = Array.isArray(record?.entry) ? record.entry : [];
  const sampleFields = entries
    .flatMap((entry) => {
      const next = readRecord(entry);
      return Array.isArray(next?.changes) ? next.changes : [];
    })
    .map((change) => readString(readRecord(change)?.field))
    .filter((field): field is string => Boolean(field));

  return {
    object: readString(record?.object),
    entryCount: entries.length,
    changeCount: sampleFields.length,
    sampleFields: [...new Set(sampleFields)].slice(0, 8),
  };
}
