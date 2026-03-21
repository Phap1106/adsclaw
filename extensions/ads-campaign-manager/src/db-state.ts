import type { AdsManagerPluginConfig, AssistantState, DerivedProposal, BossInstruction, AdsSnapshot } from "./types.js";
import { executeQuery } from "./db.js";

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
