import { createHash } from "node:crypto";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { readJsonFile, writeJsonFile } from "./state-files.js";
import type { AdsManagerPluginConfig } from "./types.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

const TELEGRAM_PROFILE_HASH_FILENAME = "telegram-profile-hash.json";

type TelegramProfileHashState = {
  version: 1;
  hash: string;
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveTelegramProfileStatePath(runtime: PluginRuntime): string {
  return path.join(runtime.state.resolveStateDir(), "plugins", "ads-campaign-manager", TELEGRAM_PROFILE_HASH_FILENAME);
}

function resolveTelegramBotToken(config: unknown): string | undefined {
  const root = readRecord(config);
  const telegram = readRecord(readRecord(root?.channels)?.telegram);
  const directToken = readString(telegram?.botToken);
  if (directToken) {
    return directToken;
  }
  const accounts = readRecord(telegram?.accounts);
  const defaultAccountId = readString(telegram?.defaultAccount) ?? "default";
  const accountToken = readString(readRecord(accounts?.[defaultAccountId])?.botToken);
  if (accountToken) {
    return accountToken;
  }
  const defaultToken = readString(readRecord(accounts?.default)?.botToken);
  if (defaultToken) {
    return defaultToken;
  }
  const envToken = process.env.TELEGRAM_BOT_TOKEN;
  return typeof envToken === "string" && envToken.trim() ? envToken.trim() : undefined;
}

function profileHash(config: AdsManagerPluginConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        description: config.telegram.description,
        shortDescription: config.telegram.shortDescription,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

async function loadCachedHash(runtime: PluginRuntime): Promise<string | undefined> {
  const parsed = await readJsonFile(resolveTelegramProfileStatePath(runtime));
  const record = readRecord(parsed);
  return readString(record?.hash);
}

async function saveCachedHash(runtime: PluginRuntime, hash: string): Promise<void> {
  const state: TelegramProfileHashState = {
    version: 1,
    hash,
  };
  await writeJsonFile(resolveTelegramProfileStatePath(runtime), state);
}

async function callTelegramBotApi(
  token: string,
  method: string,
  payload: Record<string, string>,
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  if (rawText.trim()) {
    try {
      parsed = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      throw new Error(`Telegram Bot API ${method} returned non-JSON response (${response.status}).`);
    }
  }
  if (!response.ok || parsed.ok === false) {
    throw new Error(
      `Telegram Bot API ${method} failed: ${readString(parsed.description) ?? rawText.trim() ?? `HTTP ${response.status}`}`,
    );
  }
}

export async function syncTelegramBotProfile(params: {
  config: unknown;
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
}): Promise<{ updated: boolean }> {
  if (!params.pluginConfig.telegram.syncBotProfile) {
    return { updated: false };
  }

  const token = resolveTelegramBotToken(params.config);
  if (!token) {
    params.logger.warn("[ads-campaign-manager] skipped Telegram profile sync because no bot token was configured.");
    return { updated: false };
  }

  const nextHash = profileHash(params.pluginConfig);
  const cachedHash = await loadCachedHash(params.runtime);
  if (cachedHash === nextHash) {
    return { updated: false };
  }

  await callTelegramBotApi(token, "setMyDescription", {
    description: params.pluginConfig.telegram.description,
  });
  await callTelegramBotApi(token, "setMyShortDescription", {
    short_description: params.pluginConfig.telegram.shortDescription,
  });
  await saveCachedHash(params.runtime, nextHash);
  params.logger.info("[ads-campaign-manager] synced Telegram bot profile metadata.");
  return { updated: true };
}
