import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { resolveMetaSecret } from "./meta-api.js";
import { appendMetaWebhookEvent, summarizeMetaWebhookPayload } from "./meta-webhook-store.js";
import type { AdsManagerPluginConfig } from "./types.js";

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function readHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (typeof raw === "string") {
    return raw;
  }
  return Array.isArray(raw) && raw.length > 0 ? raw[0] : undefined;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length != rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookSignature(params: {
  body: Buffer;
  signatureHeader?: string;
  appSecret?: string;
}): boolean {
  if (!params.appSecret) {
    return true;
  }
  const signature = params.signatureHeader?.trim();
  if (!signature?.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", params.appSecret).update(params.body).digest("hex");
  return safeCompare(signature.slice("sha256=".length), expected);
}

export function createMetaWebhookHandler(params: {
  runtime: PluginRuntime;
  logger: Logger;
  pluginConfig: AdsManagerPluginConfig;
  onWebhookSync?: () => Promise<void>;
}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET") {
      const verifyToken = resolveMetaSecret(
        params.pluginConfig.meta.webhookVerifyToken,
        params.pluginConfig.meta.webhookVerifyTokenEnvVar,
      );
      if (!verifyToken) {
        res.statusCode = 503;
        res.end("meta webhook verify token is not configured");
        return true;
      }
      const mode = url.searchParams.get("hub.mode");
      const challenge = url.searchParams.get("hub.challenge");
      const token = url.searchParams.get("hub.verify_token");
      if (mode === "subscribe" && challenge && token === verifyToken) {
        res.statusCode = 200;
        res.end(challenge);
        return true;
      }
      res.statusCode = 403;
      res.end("forbidden");
      return true;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, POST");
      res.end("Method Not Allowed");
      return true;
    }

    const body = await readRequestBody(req);
    const appSecret = resolveMetaSecret(
      params.pluginConfig.meta.appSecret,
      params.pluginConfig.meta.appSecretEnvVar,
    );
    if (
      !verifyWebhookSignature({
        body,
        signatureHeader: readHeader(req, "x-hub-signature-256"),
        appSecret,
      })
    ) {
      res.statusCode = 401;
      res.end("invalid signature");
      return true;
    }

    let payload: unknown;
    try {
      payload = body.length > 0 ? (JSON.parse(body.toString("utf8")) as unknown) : {};
    } catch {
      res.statusCode = 400;
      res.end("invalid json");
      return true;
    }

    const summary = summarizeMetaWebhookPayload(payload);
    const event = {
      id: `wh_${Date.now().toString(36)}`,
      receivedAt: new Date().toISOString(),
      ...summary,
    };
    await appendMetaWebhookEvent(params.runtime, event);
    params.logger.info(
      `[ads-campaign-manager] received Meta webhook entries=${event.entryCount} changes=${event.changeCount}`,
    );

    if (params.pluginConfig.meta.syncOnWebhook && params.onWebhookSync) {
      void params.onWebhookSync().catch((error) => {
        params.logger.warn(
          `[ads-campaign-manager] webhook-triggered sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    res.statusCode = 200;
    res.end("EVENT_RECEIVED");
    return true;
  };
}
