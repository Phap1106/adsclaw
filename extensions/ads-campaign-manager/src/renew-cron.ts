// Use a dynamic import to avoid module-not-found errors during TypeScript checks
// when node-cron types haven't been installed yet.
import logger from "./logger.js";
import { executeQuery } from "./db.js";
import { safeAutoLoginOrRenew } from "./meta-login.js";
import type { AdsManagerPluginConfig } from "./types.js";

/**
 * Starts the 12-hour token renewal cron job.
 * Uses `safeAutoLoginOrRenew` which first tries a cheap Graph API extension
 * before falling back to cookie-based or full Playwright login.
 */
export async function startRenewCron(config: AdsManagerPluginConfig): Promise<void> {
  // Dynamic import of node-cron to avoid hard compile-time dep
  let cron: any;
  try {
    const mod = await import("node-cron");
    cron = mod.default ?? mod;
  } catch {
    logger.warn("[CRON] node-cron not available – token renewal cron disabled.");
    return;
  }

  logger.info("[CRON] Initializing Meta Token Renewal Cron Job (every 12 hours).");

  cron.schedule("0 */12 * * *", async () => {
    logger.info("[CRON START] Auto-renew token check started.");

    try {
      const tenDaysFromNow = Date.now() + 10 * 24 * 60 * 60 * 1000;
      const expiringUsers = (await executeQuery<any[]>(
        config,
        "SELECT * FROM user_meta_auth WHERE token_expires_at < ?",
        [tenDaysFromNow]
      )) || [];

      logger.info(`[CRON] Found ${expiringUsers.length} business(es) with token expiring soon.`);

      for (const user of expiringUsers) {
        try {
          logger.info(`[CRON] Attempting renewal for: ${user.business_id}`);

          await safeAutoLoginOrRenew(config, {
            business_id: user.business_id,
            fb_email: user.fb_email,
            fb_password_enc: user.fb_password, // already encrypted in DB
            fb_2fa_secret_enc: user.fb_2fa_secret ?? undefined,
          });

          logger.info(`[CRON SUCCESS] Token renewed for ${user.business_id}.`);
        } catch (err: any) {
          logger.error(`[CRON FAILED] ${user.business_id}: ${err.message}`, {
            businessId: user.business_id,
            phase: "cron_renewal",
            stack: err.stack,
          });
          // TODO: sendScreenshotToTelegram(user.business_id)
        }
      }
    } catch (err: any) {
      logger.error(`[CRON FATAL] ${err.message}`, { stack: err.stack });
    }
  });
}
