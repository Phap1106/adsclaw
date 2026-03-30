/**
 * Inbox Forwarder — Native TypeScript polling service
 * Based on fb-inbox-forward worker.ps1 patterns
 * 
 * WHAT IS READ: Page token from resolvePageContext()
 * WHAT IS TRANSMITTED: sender name + message text + conv ID via Telegram
 * WHAT IS LOGGED: sender name + conv ID only (no message content, no tokens)
 */
import logger from "./logger.js";

interface ForwarderConfig {
  pollIntervalMs: number;   // default 15000 (15s)
  telegramChatId: string;   // destination Telegram chat/group
  maxConvs: number;         // default 20
  lookbackSec: number;      // default 60
}

interface ForwarderState {
  isRunning: boolean;
  timer: ReturnType<typeof setInterval> | null;
  lastSeen: Map<string, string>;  // convId → lastSeenTimestamp
  forwardedCount: number;
  startedAt: Date | null;
  lastPollAt: Date | null;
  errors: Array<{ time: Date; message: string }>;  // last 10 errors
}

export class InboxForwarder {
  private state: ForwarderState = {
    isRunning: false, timer: null,
    lastSeen: new Map(), forwardedCount: 0,
    startedAt: null, lastPollAt: null, errors: [],
  };

  constructor(
    private config: ForwarderConfig,
    private getPageConfig: () => Promise<any>,  // resolvePageContext wrapper
    private sendNotification: (text: string) => Promise<void>,  // Telegram send wrapper
  ) {}

  async start(): Promise<string> {
    if (this.state.isRunning) return "⚠️ Đã đang chạy rồi.";
    this.state.isRunning = true;
    this.state.startedAt = new Date();
    this.state.forwardedCount = 0;
    this.state.errors = [];
    
    this.state.timer = setInterval(() => this.poll(), this.config.pollIntervalMs);
    // Initial poll
    this.poll().catch(e => logger.error(`[INBOX-FWD] Initial poll error: ${e.message}`));

    logger.info(`[INBOX-FWD] Started | interval=${this.config.pollIntervalMs}ms target=${this.config.telegramChatId}`);
    return `✅ Inbox forwarding đã bật! Poll mỗi ${this.config.pollIntervalMs / 1000}s`;
  }

  stop(): string {
    if (!this.state.isRunning) return "⚠️ Chưa chạy.";
    if (this.state.timer) {
      clearInterval(this.state.timer);
      this.state.timer = null;
    }
    this.state.isRunning = false;
    logger.info(`[INBOX-FWD] Stopped | forwarded=${this.state.forwardedCount}`);
    return `⏹ Đã dừng. Tổng tin đã chuyển tiếp: ${this.state.forwardedCount}`;
  }

  getStatus(): string {
    if (!this.state.isRunning) return "⏹ Inbox forwarding chưa bật.";
    const uptime = this.state.startedAt
      ? Math.round((Date.now() - this.state.startedAt.getTime()) / 60000)
      : 0;
    const lastErr = this.state.errors.length > 0
      ? `\n⚠️ Lỗi gần nhất: ${this.state.errors[this.state.errors.length - 1]!.message}`
      : "";
    return [
      `🟢 **INBOX FORWARDING — ĐANG CHẠY**`,
      `⏱ Uptime: ${uptime} phút`,
      `📩 Tin đã chuyển: ${this.state.forwardedCount}`,
      `🕐 Poll gần nhất: ${this.state.lastPollAt?.toLocaleTimeString("vi-VN") || "N/A"}`,
      `🔄 Interval: ${this.config.pollIntervalMs / 1000}s`,
      lastErr,
    ].join("\n");
  }

  private async poll(): Promise<void> {
    try {
      const pageCfg = await this.getPageConfig();
      if (!pageCfg || !pageCfg.accessToken) { 
        this.recordError("No page context or token"); 
        return; 
      }
      
      const { getPageInbox } = await import("./facebook-page.js");
      const threads = await getPageInbox(pageCfg, this.config.maxConvs);
      
      this.state.lastPollAt = new Date();
      
      for (const thread of threads) {
        // Simple heuristic: forward if unread > 0 OR updated_time is newer than our last check
        const lastSeenTime = this.state.lastSeen.get(thread.id);
        
        if (!lastSeenTime || thread.updatedAt > lastSeenTime) {
          if (thread.unread > 0 || !lastSeenTime) {
             // Avoid flooding on first run
             if (lastSeenTime) {
                const notifyText = [
                  `📩 **TIN NHẮN MỚI TỪ PAGE**`,
                  `👤 Người gửi: ${thread.participants.join(", ")}`,
                  `💬 Nội dung: ${thread.snippet}`,
                  `🆔 Conv ID: \`${thread.id}\``,
                  `🔗 Trả lời: \`/tra_loi ${thread.id} <nội dung>\``
                ].join("\n");
                
                await this.sendNotification(notifyText);
                this.state.forwardedCount++;
                logger.info(`[INBOX-FWD] FORWARD | sender=${thread.participants[0]} | convId=${thread.id}`);
             }
          }
          this.state.lastSeen.set(thread.id, thread.updatedAt);
        }
      }
    } catch (err: any) {
      this.recordError(err.message?.slice(0, 100) || "Unknown error");
      logger.error(`[INBOX-FWD] Poll error: ${err.message}`);
    }
  }

  private recordError(msg: string): void {
    this.state.errors.push({ time: new Date(), message: msg });
    if (this.state.errors.length > 10) this.state.errors.shift();
  }
}

// Global instance to maintain state across command calls
export let globalForwarder: InboxForwarder | null = null;

export function getOrInitForwarder(
  config: ForwarderConfig,
  getPageConfig: () => Promise<any>,
  sendNotification: (text: string) => Promise<void>
): InboxForwarder {
  if (!globalForwarder) {
    globalForwarder = new InboxForwarder(config, getPageConfig, sendNotification);
  }
  return globalForwarder;
}
