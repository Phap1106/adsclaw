import mysql from "mysql2/promise";
import type { AdsManagerPluginConfig } from "./types.js";
import logger from "./logger.js";

let pool: mysql.Pool | null = null;

export function getDbPool(config: AdsManagerPluginConfig): mysql.Pool | null {
  if (!config.database?.enabled) {
    return null;
  }

  if (!pool) {
    pool = mysql.createPool({
      host: config.database.host ?? "127.0.0.1",
      port: config.database.port ?? 3306,
      user: config.database.user ?? "root",
      password: config.database.password ?? "",
      database: config.database.database ?? "ads_manager",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
      // FIX C1: Keep connections alive to prevent broken pool after idle
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    // FIX C1: Reset pool on any fatal error so next call auto-recreates
    (pool as any).on?.("error", (err: any) => {
      logger.error(`[DB] Pool connection error: ${err.message}. Pool will be reset on next query.`);
      pool = null;
    });
  }

  return pool;
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// FIX C3: Centralized business_id calculation
export function calculateBusinessId(businessName: string): string {
  return Buffer.from(businessName).toString("base64").slice(0, 64);
}

// Ensure table records map well
export async function executeQuery<T>(
  config: AdsManagerPluginConfig,
  sql: string,
  values?: any[]
): Promise<T | null> {
  const p = getDbPool(config);
  if (!p) {
    // FIX C2: Visible warning instead of silent null return
    logger.warn(`[DB] Database disabled or pool unavailable — query skipped: ${sql.substring(0, 80)}`);
    return null;
  }
  try {
    const [rows] = await p.execute(sql, values);
    return rows as T;
  } catch (error: any) {
    const errorMsg = `[ads-campaign-manager] DB Query Error: ${error.message} (SQL: ${sql.substring(0, 100)}...)`;
    console.error(errorMsg);
    throw new Error(errorMsg); // Throw so safeAutoLoginOrRenew catches it!
  }
}
