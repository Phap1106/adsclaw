/**
 * knowledge-base.ts — Phase 21: DB Models for User Documents
 * ────────────────────────────────────────────────────────────────
 * Lưu trữ tài liệu riêng tư (Knowledge Base) theo từng telegram_id.
 */

import type { AdsManagerPluginConfig, FileType, UserKnowledgeDoc } from "./types.js";
import { executeQuery } from "./db.js";

// ─── 1. Init Table ───────────────────────────────────────────────────────────
export async function initKnowledgeBaseTable(config: AdsManagerPluginConfig): Promise<void> {
  if (!config.database?.enabled) return;
  await executeQuery(config, `
    CREATE TABLE IF NOT EXISTS user_knowledge_docs (
      id VARCHAR(128) PRIMARY KEY,
      telegram_id VARCHAR(64) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      file_type ENUM('pdf','txt','docx','md','other') DEFAULT 'other',
      raw_size_bytes INT DEFAULT 0,
      extracted_text MEDIUMTEXT,
      summary TEXT,
      tags VARCHAR(512),
      processing_model VARCHAR(64) DEFAULT 'mistral',
      processing_status ENUM('pending','done','failed') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_telegram (telegram_id),
      INDEX idx_status (telegram_id, processing_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// ─── 2. Save Document ────────────────────────────────────────────────────────
export async function saveUserDocument(
  config: AdsManagerPluginConfig,
  doc: UserKnowledgeDoc
): Promise<void> {
  if (!config.database?.enabled) return;
  await executeQuery(
    config,
    `INSERT INTO user_knowledge_docs 
     (id, telegram_id, filename, file_type, raw_size_bytes, extracted_text, summary, tags, processing_model, processing_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE 
       filename = VALUES(filename),
       raw_size_bytes = VALUES(raw_size_bytes),
       extracted_text = VALUES(extracted_text),
       summary = VALUES(summary),
       processing_status = VALUES(processing_status),
       updated_at = CURRENT_TIMESTAMP`,
    [
      doc.id, doc.telegramId, doc.filename, doc.fileType, doc.rawSizeBytes || 0,
      doc.extractedText || null, doc.summary || null, doc.tags || null,
      doc.processingModel || null, doc.processingStatus
    ]
  );
}

// ─── 3. Get Documents ────────────────────────────────────────────────────────
export async function getUserDocuments(
  config: AdsManagerPluginConfig,
  telegramId: string
): Promise<UserKnowledgeDoc[]> {
  if (!config.database?.enabled) return [];
  const rows = await executeQuery<any[]>(
    config,
    `SELECT * FROM user_knowledge_docs WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 50`,
    [telegramId]
  ) ?? [];

  return rows.map(r => ({
    id: r.id,
    telegramId: r.telegram_id,
    filename: r.filename,
    fileType: r.file_type as FileType,
    rawSizeBytes: r.raw_size_bytes,
    extractedText: r.extracted_text,
    summary: r.summary,
    tags: r.tags,
    processingModel: r.processing_model,
    processingStatus: r.processing_status,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
    updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
  }));
}

// ─── 4. Delete Document ──────────────────────────────────────────────────────
export async function deleteUserDocument(
  config: AdsManagerPluginConfig,
  id: string,
  telegramId: string
): Promise<boolean> {
  if (!config.database?.enabled) return false;
  const res = await executeQuery<any>(
    config,
    `DELETE FROM user_knowledge_docs WHERE id = ? AND telegram_id = ?`,
    [id, telegramId]
  );
  return (res?.affectedRows && res.affectedRows > 0) || false;
}

// ─── 5. Inject Context into AI ───────────────────────────────────────────────
export async function getUserKnowledgeContext(
  config: AdsManagerPluginConfig,
  telegramId: string
): Promise<string> {
  const docs = await getUserDocuments(config, telegramId);
  const doneDocs = docs.filter(d => d.processingStatus === "done");
  if (doneDocs.length === 0) return "";

  const lines = doneDocs.map(d => {
    return `[Tài liệu: ${d.filename}]\nNội dung/Tóm tắt: ${d.summary || d.extractedText?.slice(0, 500)}`;
  });

  return `📚 TÀI LIỆU RIÊNG CỦA DOANH NGHIỆP:\n${lines.join("\n\n---\n")}\n\nLƯU Ý: Nếu Sếp hỏi về quy trình, báo giá, hoặc cách làm, hãy DỰA VÀO CÁC TÀI LIỆU TRÊN để trả lời.`;
}
