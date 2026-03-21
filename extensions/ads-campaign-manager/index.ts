import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { runAssistantSync } from "./src/assistant.js";
import { registerAdsManagerCli } from "./src/cli.js";
import { registerAdsManagerCommands } from "./src/commands.js";
import { resolveAdsManagerPluginConfig } from "./src/config.js";
import { createMetaWebhookHandler } from "./src/meta-webhook.js";
import { syncTelegramBotProfile } from "./src/telegram-profile.js";
import { createAdsManagerTool } from "./src/tool.js";

const plugin = {
  id: "ads-campaign-manager",
  name: "Ads Campaign Manager",
  description:
    "Telegram-first ads assistant with governed learning sources, Meta live sync, webhooks, and approval-safe proposals.",
  register(api: OpenClawPluginApi) {
    const pluginConfig = resolveAdsManagerPluginConfig({
      pluginConfig: api.pluginConfig,
      workspaceDir: undefined,
    });

    const tools = createAdsManagerTool({ api, pluginConfig });
    for (const tool of tools) {
      api.registerTool(tool);
    }
    registerAdsManagerCommands({ api, pluginConfig });
    api.registerCli(
      ({ program }) =>
        registerAdsManagerCli({
          api,
          program,
          pluginConfig,
        }),
      { commands: ["ads-manager"] },
    );

    const runSync = async () => {
      await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
    };

    if (pluginConfig.meta.enabled) {
      api.registerHttpRoute({
        path: pluginConfig.meta.webhookPath,
        auth: "plugin",
        match: "exact",
        handler: createMetaWebhookHandler({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
          onWebhookSync: runSync,
        }),
      });
    }

    let intervalHandle: ReturnType<typeof setInterval> | undefined;
    api.registerService({
      id: "ads-campaign-manager-sync",
      start: async () => {
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = undefined;
        }

        // Run background initialization (sync + telegram profile)
        void (async () => {
          try {
            await runSync();
            await syncTelegramBotProfile({
              config: api.config,
              runtime: api.runtime,
              logger: api.logger,
              pluginConfig,
            });
          } catch (error) {
            api.logger.warn(
              `[ads-campaign-manager] Background initialization failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          const intervalMs = pluginConfig.refreshIntervalMinutes * 60 * 1000;
          intervalHandle = setInterval(() => {
            void runSync().catch((error) => {
              api.logger.warn(
                `[ads-campaign-manager] scheduled sync failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
          }, intervalMs);
          intervalHandle.unref?.();
        })();
      },
      stop: async () => {
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = undefined;
        }
      },
    });
  },
};

export default plugin;
