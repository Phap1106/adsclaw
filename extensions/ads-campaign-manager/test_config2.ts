import { resolveAdsManagerPluginConfig } from './src/config.ts';
import fs from 'fs';

const p1 = '../../.openclaw/openclaw.json';

try {
  const cfg1 = JSON.parse(fs.readFileSync(p1, 'utf8')).plugins.entries['ads-campaign-manager'].config;
  const resolved1 = resolveAdsManagerPluginConfig({ pluginConfig: cfg1, workspaceDir: '.' });
  
  const output = {
    rawDatabase: cfg1.database,
    resolvedDatabase: resolved1.database,
    businessName: resolved1.business?.name
  };
  
  fs.writeFileSync('config-debug-output.json', JSON.stringify(output, null, 2));
  console.log("Wrote debug output to config-debug-output.json");
} catch (e: any) {
  console.log("Error:", e.message);
}
