import { chromium } from "playwright";
import type { AdsManagerPluginConfig } from "./types.js";

export type ScrapeResult = {
  url: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
};

export async function scrapePage(params: {
  config: AdsManagerPluginConfig;
  url: string;
}): Promise<ScrapeResult> {
  const scrapeConfig = params.config.intelligence?.scrape;
  if (!scrapeConfig || !scrapeConfig.enabled) {
    throw new Error("Web scraping is not enabled in plugin configuration.");
  }

  if (scrapeConfig.provider === "fetch") {
    return await scrapeWithFetch(params.url);
  }

  return await scrapeWithPlaywright(params.url);
}

async function scrapeWithFetch(url: string): Promise<ScrapeResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  // Simple extraction (mocking for now, could use cheerio)
  return {
    url,
    title: "Page Title",
    content: html.slice(0, 1000), // Very basic
    metadata: {},
  };
}

async function scrapeWithPlaywright(url: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: true });
  // Add more realistic context
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  try {
    // Increase timeout and use domcontentloaded for faster initial feedback
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    // Wait for some common content or potential overlays
    await page.waitForTimeout(5000); // Wait for animations/popups

    // Try to close common Facebook dialogs (if any)
    try {
      const closeButtons = await page.$$('div[role="dialog"] div[aria-label="Close"]');
      for (const btn of closeButtons) {
        await btn.click().catch(() => {});
      }
    } catch (err) {
      // Ignore if no dialog found
    }

    const title = await page.title();
    
    // Extract main text content
    const content = await page.evaluate(() => {
      // Remove scripts and styles
      const scripts = document.querySelectorAll('script, style');
      scripts.forEach(s => s.remove());
      return document.body.innerText;
    });

    return {
      url,
      title,
      content: content.replace(/\s+/g, ' ').trim(),
      metadata: {
        engine: "playwright",
        scrapedAt: new Date().toISOString(),
      },
    };
  } finally {
    await browser.close();
  }
}
