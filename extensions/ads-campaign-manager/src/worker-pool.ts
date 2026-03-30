import logger from "./logger.js";

/**
 * Enterprise Worker Pool (Phase 28)
 * Handles high-concurrency Meta operations with retries, jitter, and prioritization.
 * 
 * FIX: Thêm NON_RETRYABLE flag — các lỗi Facebook Checkpoint sẽ không retry
 * để tránh user nhận nhiều error message lặp lại.
 */

export interface MetaTask {
  id: string;
  type: "auth" | "sync" | "write";
  priority: number; // 0 (low) to 10 (high)
  execute: () => Promise<any>;
  retries?: number;
  maxRetries?: number;
}

class WorkerPool {
  private queue: MetaTask[] = [];
  private activeWorkers = 0;
  private maxConcurrency = 5;
  private fastConcurrency = 20;

  constructor() {}

  async addTask(task: MetaTask): Promise<any> {
    task.retries = task.retries || 0;
    task.maxRetries = task.maxRetries ?? 3;

    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await task.execute();
          resolve(result);
        } catch (err: any) {
          // FIX: Không retry nếu error được đánh dấu NON_RETRYABLE
          // (ví dụ: Facebook Checkpoint cần user xác minh thủ công)
          const isNonRetryable = (err as any).NON_RETRYABLE === true;

          if (!isNonRetryable && task.retries! < task.maxRetries!) {
            task.retries!++;
            const delay = Math.pow(2, task.retries!) * 1000 + Math.random() * 1000;
            logger.warn(
              `[WORKER] Task ${task.id} failed. Retrying in ${Math.round(delay)}ms ` +
              `(${task.retries}/${task.maxRetries}). Error: ${err.message}`
            );
            setTimeout(() => this.enqueue(wrappedTask, task.priority), delay);
          } else {
            if (isNonRetryable) {
              logger.warn(`[WORKER] Task ${task.id} marked NON_RETRYABLE — skipping retries.`);
            } else {
              logger.error(`[WORKER] Task ${task.id} failed after ${task.maxRetries} retries.`);
            }
            reject(err);
          }
        } finally {
          this.activeWorkers--;
          this.processNext();
        }
      };

      this.enqueue(wrappedTask, task.priority);
    });
  }

  private enqueue(taskFn: () => Promise<void>, priority: number) {
    this.queue.push({ fn: taskFn, priority } as any);
    this.queue.sort((a: any, b: any) => b.priority - a.priority);
    this.processNext();
  }

  private processNext() {
    const limit = this.maxConcurrency;
    while (this.activeWorkers < limit && this.queue.length > 0) {
      const task: any = this.queue.shift();
      this.activeWorkers++;
      task.fn();
    }
  }

  setConcurrency(max: number) {
    this.maxConcurrency = max;
    this.processNext();
  }
}

export const globalWorkerPool = new WorkerPool();
