import type { AdsManagerPluginConfig, AssistantState, DerivedProposal, BossInstruction, AdsSnapshot, StrategicMemory } from "./types.js";
import { executeQuery } from "./db.js";
import { estimateCompetitorSpend } from "./ad-math.js";

export async function ensureBusinessConfig(config: AdsManagerPluginConfig): Promise<string> {
  const businessId = Buffer.from(config.business.name).toString("base64").slice(0, 64);
  await executeQuery(
    config,
    `INSERT INTO business_config (id, owner_name, business_name, primary_objective, currency, timezone) 
     VALUES (?, ?, ?, ?, ?, ?) 
     ON DUPLICATE KEY UPDATE owner_name = VALUES(owner_name), business_name = VALUES(business_name)`,
    [
      businessId,
      config.business.ownerName,
      config.business.name,
      config.business.primaryObjective,
      config.business.currency,
      config.business.timezone,
    ]
  );
  // Migration: Add columns if they don't exist
  try {
    const columns = await executeQuery<any[]>(config, "SHOW COLUMNS FROM business_config LIKE 'meta_access_token'");
    if (!columns || columns.length === 0) {
      await executeQuery(config, "ALTER TABLE business_config ADD COLUMN meta_access_token TEXT, ADD COLUMN meta_ad_account_id VARCHAR(255)");
    }
  } catch (e) {
    // ignore
  }
  return businessId;
}

export async function loadStateFromDb(config: AdsManagerPluginConfig): Promise<AssistantState> {
  const businessId = await ensureBusinessConfig(config);
  
  const businessRow = await executeQuery<any[]>(
    config,
    `SELECT last_ai_analysis_at FROM business_config WHERE id = ?`,
    [businessId]
  ) ?? [];
  const lastAiAnalysisAt = businessRow[0]?.last_ai_analysis_at;

  const proposalsRow = await executeQuery<any[]>(
    config,
    `SELECT id, status, impact, title, summary, reason, campaign_id as campaignId, command_hint as commandHint, created_at as createdAt, updated_at as updatedAt 
     FROM proposals WHERE business_id = ?`,
    [businessId]
  ) ?? [];

  const instructionsRow = await executeQuery<any[]>(
    config,
    `SELECT id, instruction_text as text, status, created_at as createdAt 
     FROM boss_instructions WHERE business_id = ? ORDER BY created_at DESC LIMIT 50`,
    [businessId]
  ) ?? [];

  const strategicMemoryRow = await executeQuery<any[]>(
    config,
    `SELECT category, insight, confidence_score as confidenceScore, created_at as createdAt 
     FROM strategic_memory WHERE business_id = ? ORDER BY created_at DESC LIMIT 10`,
    [businessId]
  ) ?? [];

  return {
    version: 1,
    lastSyncAt: new Date().toISOString(),
    lastAiAnalysisAt: lastAiAnalysisAt instanceof Date ? lastAiAnalysisAt.toISOString() : lastAiAnalysisAt,
    proposals: proposalsRow.map((row) => ({
      id: row.id,
      status: row.status,
      impact: row.impact,
      title: row.title,
      summary: row.summary,
      reason: row.reason,
      campaignId: row.campaignId,
      commandHint: row.commandHint,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    })),
    instructions: instructionsRow.map((row) => ({
      id: row.id,
      text: row.text,
      status: row.status,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    })),
    strategicMemory: strategicMemoryRow.map((row) => ({
      category: row.category,
      insight: row.insight,
      confidenceScore: row.confidenceScore,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    })),
  };
}

export async function saveStateToDb(config: AdsManagerPluginConfig, state: AssistantState): Promise<void> {
  const businessId = await ensureBusinessConfig(config);

  if (state.lastAiAnalysisAt) {
    await executeQuery(
      config,
      `UPDATE business_config SET last_ai_analysis_at = ? WHERE id = ?`,
      [new Date(state.lastAiAnalysisAt), businessId]
    );
  }
  
  for (const proposal of state.proposals) {
    await executeQuery(
      config,
      `INSERT INTO proposals (id, business_id, campaign_id, title, summary, reason, impact, status, command_hint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = VALUES(updated_at)`,
       [
         proposal.id, businessId, proposal.campaignId ?? null, proposal.title, proposal.summary,
         proposal.reason, proposal.impact, proposal.status, proposal.commandHint ?? null,
         new Date(proposal.createdAt), new Date(proposal.updatedAt)
       ]
    );
  }

  for (const instruction of state.instructions) {
    await executeQuery(
      config,
      `INSERT INTO boss_instructions (id, business_id, instruction_text, status, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
       [
         instruction.id, businessId, instruction.text, instruction.status,
         new Date(instruction.createdAt)
       ]
    );
  }
}

export async function saveSnapshotToDb(config: AdsManagerPluginConfig, snapshot: AdsSnapshot): Promise<void> {
  if (!snapshot || snapshot.campaigns.length === 0) return;
  const businessId = await ensureBusinessConfig(config);
  const snapshotDate = new Date();

  for (const campaign of snapshot.campaigns) {
    const id = `${snapshotDate.toISOString().split('T')[0]}_${campaign.id}`;
    await executeQuery(
      config,
      `INSERT INTO campaign_snapshots (id, campaign_id, campaign_name, business_id, spend_today, budget, roas, ctr, cpa, status, learning_phase, snapshot_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         spend_today = VALUES(spend_today), roas = VALUES(roas), ctr = VALUES(ctr), cpa = VALUES(cpa), status = VALUES(status)`,
       [
         id, campaign.id, campaign.name, businessId, campaign.spendToday ?? 0, campaign.budget ?? 0,
         campaign.roas ?? 0, campaign.ctr ?? 0, campaign.cpa ?? 0, campaign.status ?? 'unknown',
         campaign.learningPhase ?? false, snapshotDate
       ]
    );
  }
}

export async function saveCompetitorAdToDb(config: AdsManagerPluginConfig, ad: {
  id: string,
  pageName: string,
  hookText?: string,
  mediaUrl?: string,
  mediaType?: 'image' | 'video' | 'carousel' | 'other',
  ctaType?: string,
  startedAt?: string,
  durationDays?: number,
  isActive?: boolean
}): Promise<void> {
  const businessId = await ensureBusinessConfig(config);
  const estSpend = estimateCompetitorSpend(ad.durationDays ?? 0, ad.mediaType ?? 'other');
  
  await executeQuery(
    config,
    `INSERT INTO competitor_ads (id, business_id, page_name, hook_text, media_url, media_type, cta_type, started_at, duration_days, is_active, est_spend_vnd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       is_active = VALUES(is_active), 
       duration_days = VALUES(duration_days),
       est_spend_vnd = VALUES(est_spend_vnd)`,
    [
      ad.id, businessId, ad.pageName, ad.hookText || null, ad.mediaUrl || null, 
      ad.mediaType || 'other', ad.ctaType || null, ad.startedAt || null, 
      ad.durationDays || 0, ad.isActive ?? true, estSpend
    ]
  );
}

export async function getCompetitorAdsFromDb(config: AdsManagerPluginConfig, params: { pageName?: string, businessId?: string }): Promise<any[]> {
  const businessId = params.businessId ?? await ensureBusinessConfig(config);
  let sql = `SELECT * FROM competitor_ads WHERE business_id = ?`;
  const values: any[] = [businessId];

  if (params.pageName) {
    sql += ` AND page_name LIKE ?`;
    values.push(`%${params.pageName}%`);
  }

  sql += ` ORDER BY duration_days DESC, observed_at DESC LIMIT 100`;
  
  const rows = await executeQuery<any[]>(config, sql, values);
  return rows ?? [];
}

export async function saveMarketBenchmarkToDb(config: AdsManagerPluginConfig, data: {
  niche: string,
  avgCpa?: number,
  avgCpc?: number,
  avgRoas?: number,
  recordedAt: string,
  source?: string
}): Promise<void> {
  await executeQuery(
    config,
    `INSERT INTO market_benchmarks (niche, avg_cpa, avg_cpc, avg_roas, recorded_at, source)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       avg_cpa = VALUES(avg_cpa), avg_cpc = VALUES(avg_cpc), avg_roas = VALUES(avg_roas)`,
    [data.niche, data.avgCpa, data.avgCpc, data.avgRoas, data.recordedAt, data.source]
  );
}

export async function initPhase3Tables(config: AdsManagerPluginConfig): Promise<void> {
  await executeQuery(
    config,
    `CREATE TABLE IF NOT EXISTS business_config (
      id VARCHAR(64) PRIMARY KEY,
      owner_name VARCHAR(255) NOT NULL,
      business_name VARCHAR(255) NOT NULL,
      primary_objective TEXT,
      currency VARCHAR(10) DEFAULT 'VND',
      timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
      meta_access_token TEXT,
      meta_ad_account_id VARCHAR(255),
      last_ai_analysis_at DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await executeQuery(config, `
    CREATE TABLE IF NOT EXISTS competitor_ads (
      id VARCHAR(128) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL,
      page_name VARCHAR(128) NOT NULL,
      hook_text TEXT,
      media_url TEXT,
      media_type ENUM('image', 'video', 'carousel', 'other') DEFAULT 'other',
      cta_type VARCHAR(64),
      started_at DATE,
      duration_days INT DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      est_spend_vnd DECIMAL(15, 2) DEFAULT 0,
      INDEX idx_competitor_page (page_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await executeQuery(config, `
    CREATE TABLE IF NOT EXISTS market_benchmarks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      niche VARCHAR(128) NOT NULL,
      avg_cpa DECIMAL(15, 2),
      avg_cpc DECIMAL(15, 2),
      avg_roas DECIMAL(10, 2),
      recorded_at DATE NOT NULL,
      source VARCHAR(255),
      UNIQUE KEY uni_niche_date (niche, recorded_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const { initKnowledgeBaseTable } = await import("./knowledge-base.js");
  await initKnowledgeBaseTable(config);

  await initMetaAuthTable(config);
  await initStrategicMemoryTable(config);
  await initFacebookPagesTable(config);
}

export async function initFacebookPagesTable(config: AdsManagerPluginConfig): Promise<void> {
  const businessId = await ensureBusinessConfig(config);
  await executeQuery(config, `
    CREATE TABLE IF NOT EXISTS user_facebook_pages (
      id VARCHAR(128) PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL,
      fb_email VARCHAR(255) NOT NULL,
      page_name VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      access_token TEXT,
      perms JSON,
      is_selected BOOLEAN DEFAULT FALSE,
      observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE CASCADE,
      INDEX idx_business_email (business_id, fb_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function clearUserFacebookPages(config: AdsManagerPluginConfig, businessId: string): Promise<void> {
  await executeQuery(config, "DELETE FROM user_facebook_pages WHERE business_id = ?", [businessId]);
}

export async function saveUserFacebookPages(config: AdsManagerPluginConfig, businessId: string, email: string, pages: any[]): Promise<void> {
  // Clear existing pages for this business if we're doing a fresh sync from a new principal
  if (email !== "auto_renew") {
    await clearUserFacebookPages(config, businessId);
  }

  for (const page of pages) {
    await executeQuery(
      config,
      `INSERT INTO user_facebook_pages (id, business_id, fb_email, page_name, category, access_token, perms)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         page_name = VALUES(page_name), 
         category = VALUES(category),
         access_token = VALUES(access_token),
         perms = VALUES(perms)`,
      [
        page.id, businessId, email, page.name || page.page_name, page.category, 
        page.access_token, JSON.stringify(page.tasks || page.perms || [])
      ]
    );
  }
}

export async function getUserFacebookPages(config: AdsManagerPluginConfig, email?: string): Promise<any[]> {
  const businessId = await ensureBusinessConfig(config);
  let sql = `SELECT * FROM user_facebook_pages WHERE business_id = ?`;
  const vals = [businessId];
  if (email) {
    sql += ` AND fb_email = ?`;
    vals.push(email);
  }
  return await executeQuery<any[]>(config, sql, vals) ?? [];
}

export async function setSelectedPage(config: AdsManagerPluginConfig, pageId: string): Promise<void> {
  const businessId = await ensureBusinessConfig(config);
  // Reset previous
  await executeQuery(config, "UPDATE user_facebook_pages SET is_selected = FALSE WHERE business_id = ?", [businessId]);
  // Set new
  await executeQuery(config, "UPDATE user_facebook_pages SET is_selected = TRUE WHERE id = ?", [pageId]);
  
  // Also sync to business_config for legacy compatibility if needed
  const page = (await executeQuery<any[]>(config, "SELECT access_token FROM user_facebook_pages WHERE id = ?", [pageId]))?.[0];
  if (page?.access_token) {
     await executeQuery(config, "UPDATE business_config SET meta_access_token = ? WHERE id = ?", [page.access_token, businessId]);
  }
}

export async function initStrategicMemoryTable(config: AdsManagerPluginConfig): Promise<void> {
  const businessId = await ensureBusinessConfig(config);
  await executeQuery(config, `
    CREATE TABLE IF NOT EXISTS strategic_memory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL,
      campaign_id VARCHAR(128),
      category ENUM('scaling', 'creative', 'targeting', 'budget', 'auth') NOT NULL,
      insight TEXT NOT NULL,
      confidence_score DECIMAL(3, 2) DEFAULT 0.8,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE CASCADE,
      UNIQUE KEY uni_business_campaign_cat (business_id, campaign_id, category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function saveStrategicMemory(config: AdsManagerPluginConfig, data: {
  campaignId?: string,
  category: 'scaling' | 'creative' | 'targeting' | 'budget' | 'auth',
  insight: string,
  confidenceScore?: number
}): Promise<void> {
  const businessId = await ensureBusinessConfig(config);
  await executeQuery(
    config,
    `INSERT INTO strategic_memory (business_id, campaign_id, category, insight, confidence_score) VALUES (?, ?, ?, ?, ?)`,
    [businessId, data.campaignId || null, data.category, data.insight, data.confidenceScore ?? 0.8]
  );
}

export async function getStrategicMemory(config: AdsManagerPluginConfig): Promise<any[]> {
  const businessId = await ensureBusinessConfig(config);
  return await executeQuery<any[]>(
    config,
    `SELECT category, insight, confidence_score as confidenceScore, created_at as createdAt 
     FROM strategic_memory WHERE business_id = ? ORDER BY created_at DESC LIMIT 10`,
    [businessId]
  ) ?? [];
}

export async function initMetaAuthTable(config: AdsManagerPluginConfig): Promise<void> {
  await executeQuery(
    config,
    `CREATE TABLE IF NOT EXISTS user_meta_auth (
      id INT AUTO_INCREMENT PRIMARY KEY,
      business_id VARCHAR(64) NOT NULL,
      fb_email VARCHAR(255) NOT NULL,
      fb_password VARCHAR(512) NOT NULL,
      fb_2fa_secret VARCHAR(128),
      access_token TEXT,
      token_expires_at BIGINT,
      last_renew_at TIMESTAMP NULL,
      last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      cookies JSON,
      device_fingerprint JSON,
      proxy_url VARCHAR(512),
      is_marketing_standard BOOLEAN DEFAULT FALSE,
      success_count INT DEFAULT 0,
      fail_count INT DEFAULT 0,
      last_error TEXT,
      FOREIGN KEY (business_id) REFERENCES business_config(id) ON DELETE CASCADE,
      UNIQUE KEY uni_business_email (business_id, fb_email),
      INDEX idx_expires (token_expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

export async function saveUserMetaAuth(config: AdsManagerPluginConfig, businessId: string, data: {
  email: string,
  passwordEnc: string,
  otpSecretEnc?: string,
  accessToken?: string,
  expiresAt?: number,
  cookies?: any,
  deviceFingerprint?: any,
  proxyUrl?: string
}): Promise<void> {
  await executeQuery(
    config,
    `INSERT INTO user_meta_auth (business_id, fb_email, fb_password, fb_2fa_secret, access_token, token_expires_at, cookies, device_fingerprint, proxy_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       fb_email = VALUES(fb_email), 
       fb_password = VALUES(fb_password), 
       fb_2fa_secret = VALUES(fb_2fa_secret),
       access_token = VALUES(access_token),
       token_expires_at = VALUES(token_expires_at),
       cookies = VALUES(cookies),
       device_fingerprint = VALUES(device_fingerprint),
       proxy_url = VALUES(proxy_url)`,
    [
      businessId, 
      data.email, 
      data.passwordEnc, 
      data.otpSecretEnc || null, 
      data.accessToken || null, 
      data.expiresAt || null, 
      data.cookies ? JSON.stringify(data.cookies) : null,
      data.deviceFingerprint ? JSON.stringify(data.deviceFingerprint) : null,
      data.proxyUrl || null
    ]
  );

  // Sync back to business_config so UI and general systems see the token
  if (data.accessToken) {
    await executeQuery(
      config,
      "UPDATE business_config SET meta_access_token = ? WHERE id = ?",
      [data.accessToken, businessId]
    );
  }
}

export async function getUserMetaAuth(config: AdsManagerPluginConfig, businessId: string): Promise<any> {
  const rows = await executeQuery<any[]>(
    config,
    `SELECT * FROM user_meta_auth WHERE business_id = ?`,
    [businessId]
  );
  return rows?.[0] || null;
}

export async function incrementMetaSuccess(config: AdsManagerPluginConfig, businessId: string): Promise<void> {
  await executeQuery(
    config,
    `UPDATE user_meta_auth SET success_count = success_count + 1, last_error = NULL WHERE business_id = ?`,
    [businessId]
  );
}

export async function recordMetaFailure(config: AdsManagerPluginConfig, businessId: string, error: string): Promise<void> {
  await executeQuery(
    config,
    `UPDATE user_meta_auth SET fail_count = fail_count + 1, last_error = ? WHERE business_id = ?`,
    [error, businessId]
  );
}

export async function fetchMetaAccountsHealth(config: AdsManagerPluginConfig): Promise<any[]> {
  const businessId = await ensureBusinessConfig(config);
  const rows = await executeQuery<any[]>(
    config,
    `SELECT fb_email, access_token, success_count, fail_count, last_error, last_login_at, proxy_url 
     FROM user_meta_auth WHERE business_id = ?`,
    [businessId]
  );
  return rows || [];
}

