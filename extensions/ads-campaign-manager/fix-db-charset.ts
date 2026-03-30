import mysql from "mysql2/promise";
import fs from "fs";

async function run() {
  const globalConfigRaw = fs.readFileSync('C:/Users/Admin/.openclaw/openclaw.json', 'utf8');
  const parsed = JSON.parse(globalConfigRaw);
  const config = parsed.plugins?.entries?.['ads-campaign-manager']?.config?.database;

  if (!config) {
    console.error("No database config found.");
    return;
  }

  const pool = mysql.createPool({
    host: config.host || "127.0.0.1",
    port: config.port || 3306,
    user: config.user || "root",
    password: config.password || "",
    database: config.database || "ads_manager",
  });

  try {
    console.log("Fetching all tables...");
    const [rows] = await pool.execute("SHOW TABLES");
    const tables = (rows as any[]).map(row => Object.values(row)[0] as string);
    console.log("Found tables:", tables.join(', '));

    console.log("Fixing character sets...");
    await pool.execute("SET FOREIGN_KEY_CHECKS=0");
    
    for (const table of tables) {
      try {
        await pool.execute(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`Success: ${table}`);
      } catch (e: any) {
        console.log(`Failed for ${table}: ${e.message}`);
      }
    }
    await pool.execute("SET FOREIGN_KEY_CHECKS=1");
    console.log("All tables fixed perfectly!");
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
