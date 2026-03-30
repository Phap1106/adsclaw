/**
 * file-processor.ts — Phase 21: File Processing Pipeline
 * ──────────────────────────────────────────────────────────
 * Tải file từ Telegram/URL, detect loại file, OCR qua Mistral, fallbacks.
 */

import { fetch } from "undici";
import type { FileType } from "./types.js";

// ─── 1. Download File ────────────────────────────────────────────────────────
export async function downloadFileToBuffer(url: string): Promise<Buffer> {
  const rs = await fetch(url);
  if (!rs.ok) throw new Error(`Download failed: ${rs.status} ${rs.statusText}`);
  const arrayBuffer = await rs.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── 2. Detect Type ──────────────────────────────────────────────────────────
export function detectFileType(filename: string, mimeType?: string): FileType {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf" || mimeType === "application/pdf") return "pdf";
  if (ext === "txt" || mimeType === "text/plain") return "txt";
  if (ext === "md" || mimeType === "text/markdown") return "md";
  if (ext === "docx" || mimeType?.includes("wordprocessingml")) return "docx";
  return "other";
}

// ─── 3. Extract Text via Mistral (PDF only) ──────────────────────────────────
async function extractViaMistralOcr(fileBuffer: Buffer, mistralToken: string): Promise<string> {
  // Mistral document OCR requires uploading a file or passing base64.
  // Using Document API: https://docs.mistral.ai/capabilities/document/ 
  // For simplicity since we have buffer, we could send base64 if supported, 
  // but Mistral OCR currently needs either a URL or an uploaded file ID.
  
  // HACK for direct Buffer OCR (Assuming standard /v1/ocr accepts base64 via document struct)
  const base64Str = fileBuffer.toString("base64");
  const dataUri = `data:application/pdf;base64,${base64Str}`;

  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${mistralToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: dataUri,
      },
      include_image_base64: false,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Mistral OCR failed: ${res.status} - ${txt.slice(0, 100)}`);
  }

  const json = await res.json() as any;
  // Combine all pages' markdown
  let fullText = "";
  if (json.pages && Array.isArray(json.pages)) {
    fullText = json.pages.map((p: any) => p.markdown).join("\n\n");
  }
  return fullText.trim();
}

// ─── 4. Master Extractor ─────────────────────────────────────────────────────
export async function extractTextFromFile(
  fileBuffer: Buffer,
  type: FileType,
  mistralToken?: string
): Promise<string> {
  let text = "";

  if (type === "txt" || type === "md") {
    text = fileBuffer.toString("utf8");
  } else if (type === "pdf") {
    if (mistralToken) {
      try {
        text = await extractViaMistralOcr(fileBuffer, mistralToken);
      } catch (err) {
        console.warn(`[KnowledgeBase] Mistral OCR fail, falling back: ${err}`);
      }
    }
    // PDF-parse fallback
    if (!text) {
      try {
        const m: any = await import("pdf-parse");
        const pdf = m.default || m;
        const parsed = await pdf(fileBuffer);
        text = parsed.text;
      } catch (err) {
        console.error(`[KnowledgeBase] PDF parse fallback failed: ${err}`);
        throw new Error("Không thể trích xuất nội dung PDF. Vui lòng gửi dạng chữ.");
      }
    }
  } else {
    throw new Error(`Định dạng ${type} hiện chưa được hỗ trợ extract.`);
  }

  // Chống tràn bộ nhớ: Cắt lấy 100KB (khoảng ~20.000 từ)
  if (text.length > 100000) {
    text = text.slice(0, 100000) + "\n\n... [ĐÃ CẮT BỚT VÌ QUÁ DÀI]";
  }

  return text.trim();
}

// ─── 5. Mistral Summarize ────────────────────────────────────────────────────
export async function summarizeWithMistral(text: string, token: string): Promise<string> {
  if (text.length < 500) return text; // Quá ngắn, lưu full luôn

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        {
          role: "user",
          content: `Bạn là trợ lý AI. Hãy TÓM TẮT ĐẦY ĐỦ NHƯNG NGẮN GỌN nội dung tài liệu sau trong tối đa 200 từ. Hãy giữ nguyên các khái niệm chuyên ngành, lưu ý quan trọng hoặc thông điệp cốt lõi.\n\n--- TÀI LIỆU ---\n${text.slice(0, 30000)}`, // pass up to ~10k tokens
        },
      ],
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    throw new Error(`Mistral Summarize failed: ${res.status}`);
  }

  const json = await res.json() as any;
  return json.choices?.[0]?.message?.content || "Không thể tóm tắt.";
}
