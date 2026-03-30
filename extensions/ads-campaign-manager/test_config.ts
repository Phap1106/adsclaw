import { resolveAdsManagerPluginConfig } from './src/config.ts';
import fs from 'fs';

const p1 = '../../.openclaw/openclaw.json';
const p2 = 'C:/Users/Admin/.openclaw/openclaw.json';

try {
  console.log("--- Testing Project openclaw.json ---");
  const cfg1 = JSON.parse(fs.readFileSync(p1, 'utf8')).plugins.entries['ads-campaign-manager'].config;
  console.log('Raw config database:', cfg1.database);
  const resolved1 = resolveAdsManagerPluginConfig({ pluginConfig: cfg1, workspaceDir: '.' });
  console.log('Resolved config database.enabled:', resolved1.database?.enabled);
  console.log('Resolved config database:', resolved1.database);
  console.log('Resolved config business.name:', resolved1.business?.name);
} catch (e: any) {
  console.log("Error reading p1", e.message);
}

try {
  console.log("\n--- Testing Global openclaw.json ---");
  const cfg2 = JSON.parse(fs.readFileSync(p2, 'utf8')).plugins.entries['ads-campaign-manager'].config;
  console.log('Raw config database:', cfg2.database);
  const resolved2 = resolveAdsManagerPluginConfig({ pluginConfig: cfg2, workspaceDir: '.' });
  console.log('Resolved config database.enabled:', resolved2.database?.enabled);
  console.log('Resolved config business.name:', resolved2.business?.name);
} catch (e: any) {
  console.log("Error reading p2", e.message);
}
