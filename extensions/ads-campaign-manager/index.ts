import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { resolveAdsManagerPluginConfig } from "./src/config.js";

/**
 * OpenClaw Ads Campaign Manager — v9 Production
 * ───────────────────────────────────────────────────
 * Cross-platform compatible (Windows fix)
 * - Removed top-level import.meta.url
 * - Defensive dynamic imports for heavy modules
 */

export const register = async (api: OpenClawPluginApi): Promise<void> => {
  let rawConfig = api.config as any;
  
  // Self-Healing: Bypass OpenClaw CLI schema caching/stripping if database is missing
  if (!rawConfig.database) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const configDir = process.env.OPENCLAW_CONFIG_DIR || "C:\\Users\\Admin\\.openclaw";
      const diskPath = path.resolve(configDir, "openclaw.json");
      if (fs.existsSync(diskPath)) {
        const diskJson = JSON.parse(fs.readFileSync(diskPath, "utf8"));
        const diskPluginCfg = diskJson?.plugins?.entries?.["ads-campaign-manager"]?.config;
        if (diskPluginCfg) {
          rawConfig = { ...rawConfig, ...diskPluginCfg };
          api.logger.info(`[ads-campaign-manager] Self-healed config directly from ${diskPath}`);
        }
      }
    } catch (e: any) {
      api.logger.warn(`[ads-campaign-manager] Failed to self-heal config: ${e.message}`);
    }
  }

  const config = resolveAdsManagerPluginConfig({
    pluginConfig: rawConfig,
    workspaceDir: undefined // Can be passed if needed
  });
  const isDebug = process.env.NODE_ENV === "development" || true; // Enable for user testing

  api.logger.info(`[ads-campaign-manager] initializing for business: ${config.business.name}`);

  try {
    // 1. Sync Logic (Shared)
    const runSync = async () => {
      const { runAssistantSync } = await import("./src/assistant.js");
      await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig: config,
      });
    };

    // 2. AI Tools
    const { createAdsManagerTool } = await import("./src/tool.js");
    const tools = createAdsManagerTool({ api, pluginConfig: config });
    for (const tool of tools) {
      api.registerTool(tool);
    }

    // 3. CLI Integration
    const { registerAdsManagerCli } = await import("./src/cli.js");
    api.registerCli(({ program }) => {
      registerAdsManagerCli({
        api,
        program,
        pluginConfig: config,
      });
    }, { commands: ["ads-manager"] });

    // 4. Commands Integration
    const { registerAdsManagerCommands } = await import("./src/commands.js");
    registerAdsManagerCommands({
      api,
      pluginConfig: config,
    });

    // 5. Cron & Self-Healing (Renew)
    const { startRenewCron } = await import("./src/renew-cron.js");
    startRenewCron(config);

    // 6. Webhooks & Testing
    if (config.meta.enabled) {
      const { createMetaWebhookHandler } = await import("./src/meta-webhook.js");
      api.registerHttpRoute({
        path: config.meta.webhookPath,
        auth: "plugin",
        match: "exact",
        handler: createMetaWebhookHandler({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig: config,
          onWebhookSync: runSync,
        }),
      });

      if (isDebug) {
        api.registerHttpRoute({
          path: "/test/meta-op",
          auth: "plugin", // "plugin" is often the public/default auth in this SDK
          match: "exact",
          handler: async (req: any, res: any) => {
            try {
              const body = await req.json();
              const { op, message, postId, pageId, token } = body;
              
              const pageService = await import("./src/facebook-page.js");
              const pageCfg = { 
                pageId: pageId || process.env.FB_PAGE_ID || "", 
                accessToken: token || process.env.FB_PAGE_ACCESS_TOKEN || "" 
              };

              if (op === "post") {
                const result = await pageService.createPost(pageCfg, message || "Test post from TomClaws");
                return res.json({ success: true, result });
              } else if (op === "edit") {
                if (!postId) throw new Error("postId required for edit");
                const result = await pageService.editPost(pageCfg, postId, message || "Edited by TomClaws");
                return res.json({ success: true, result });
              } else if (op === "login") {
                // Trigger background login
                const { performPlaywrightLogin } = await import("./src/meta-login.js");
                const { getUserMetaAuth } = await import("./src/db-state.js");
                const { encrypt } = await import("./src/crypto-utils.js");
                
                let loginPayload: any;
                if (body.email && body.password) {
                   loginPayload = {
                     business_id: body.businessId || config.business.name,
                     fb_email: body.email,
                     fb_password_enc: encrypt(body.password),
                     fb_2fa_secret_enc: body.otpSecret ? encrypt(body.otpSecret) : undefined
                   };
                } else {
                  const authRecord = await getUserMetaAuth(config, config.business.name);
                  loginPayload = {
                    business_id: config.business.name,
                    fb_email: authRecord.email,
                    fb_password_enc: authRecord.password_enc,
                    fb_2fa_secret_enc: authRecord.otp_secret_enc
                  };
                }
                
                // Fire and forget login
                void performPlaywrightLogin(config, loginPayload).catch((e: any) => api.logger.error(`[TEST LOGIN] Background login failed: ${e.message}`));

                return res.json({ success: true, message: `Login triggered for ${loginPayload.fb_email} in background.` });
              }
              
              throw new Error(`Unknown op: ${op}`);
            } catch (err: any) {
              return res.json({ success: false, error: err.message }, { status: 500 });
            }
          }
        });
      }
    }

    // 7. Background Service (Sync & Profile)
    let intervalHandle: any = undefined;
    api.registerService({
      id: "ads-campaign-manager-sync",
      start: async () => {
        if (intervalHandle) clearInterval(intervalHandle);

        // Initial run
        void (async () => {
          try {
            await runSync();
            const { syncTelegramBotProfile } = await import("./src/telegram-profile.js");
            await syncTelegramBotProfile({
              config: api.config,
              runtime: api.runtime,
              logger: api.logger,
              pluginConfig: config,
            });
          } catch (err: any) {
            api.logger.warn(`[ads-campaign-manager] Background init failed: ${err.message}`);
          }

          const intervalMs = config.refreshIntervalMinutes * 60 * 1000;
          intervalHandle = setInterval(() => {
            void runSync().catch(err => {
              api.logger.warn(`[ads-campaign-manager] Scheduled sync failed: ${err.message}`);
            });
          }, intervalMs);
          if (intervalHandle.unref) intervalHandle.unref();
        })();
      },
      stop: async () => {
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = undefined;
        }
      }
    });

    api.logger.info("[DEBUG] ads-campaign-manager registered OK!");

  } catch (err: any) {
    api.logger.error(`[ads-campaign-manager] Registration FAILED: ${err.message}`);
  }
};

export default { register };
