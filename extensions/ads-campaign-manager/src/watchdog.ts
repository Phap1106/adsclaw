/**
 * Competitor Watchdog (Radar)
 * Periodically called via cron to track changes in competitor active ads.
 */
import { apifyFacebookAdsScraper } from "./http-fetch.js";

// Dummy memory layer for demonstration
const memoryStore = new Map<string, string[]>();

export async function runCompetitorWatchdog(competitorNames: string[]) {
  const alerts: string[] = [];
  
  for (const name of competitorNames) {
    const previousAds = memoryStore.get(name) || [];
    
    // Simulate scraping
    console.log(`[Watchdog] Scanning radar for: ${name}...`);
    // const currentAdsData = await apifyFacebookAdsScraper({ searchQueries: [name] });
    
    // Mock diff logic
    const currentAds = [`Giảm giá 50%`, `Mua 1 tặng 1`]; // Mocked result
    const newAds = currentAds.filter(ad => !previousAds.includes(ad));
    
    if (newAds.length > 0) {
      const redAlertKeywords = ["giảm", "sale", "tặng", "50%", "thanh lý"];
      const isRedAlert = newAds.some(ad => redAlertKeywords.some(kw => ad.toLowerCase().includes(kw)));
      
      const alertMsg = `RADAR ALERT: [${name}] vừa lên ${newAds.length} chiến dịch mới. ${isRedAlert ? '🔴 NGUY HIỂM: GIẢM GIÁ/SALE!' : ''}`;
      alerts.push(alertMsg);
      console.log(alertMsg);
    }
    
    memoryStore.set(name, currentAds);
  }
  
  return alerts;
}
