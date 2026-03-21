import mysql from "mysql2/promise";
import type { AdsManagerPluginConfig } from "./types.js";

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
      connectTimeout: 5000,
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

// Ensure table records map well
export async function executeQuery<T>(
  config: AdsManagerPluginConfig,
  sql: string,
  values?: any[]
): Promise<T | null> {
  const p = getDbPool(config);
  if (!p) return null;
  try {
    const [rows] = await p.execute(sql, values);
    return rows as T;
  } catch (error) {
    console.error("[ads-campaign-manager] DB Query Error:", error);
    return null;
  }
}
