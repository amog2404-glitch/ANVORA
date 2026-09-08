// src/lib/history-manager.ts
import { callGemini } from './litellm-client';
import type { LLMMessage, LLMConfig } from './litellm-client';
import { logger } from './logger';

export interface CompactionEvent {
  type: 'summarized' | 'truncated' | 'compressed_memories';
  before: number;
  after: number;
}

export class HistoryManager {
  private history: LLMMessage[] = [];
  private longTermMemories: string[] = [];

  // Private constructor — use HistoryManager.create() to get an initialized instance.
  // This prevents the async constructor race condition where loadHistory() was fire-and-forget.
  private constructor() {}

  public static async create(): Promise<HistoryManager> {
    const mgr = new HistoryManager();
    await mgr.loadHistory();
    return mgr;
  }

  private async loadHistory() {
    const data = await chrome.storage.session.get(['chatHistory']);
    if (data && Array.isArray(data.chatHistory)) {
      this.history = data.chatHistory;
    }
    const local = await chrome.storage.local.get(['longTermMemories']);
    if (local && Array.isArray(local.longTermMemories)) {
      this.longTermMemories = local.longTermMemories;
    }
  }

  private async saveHistory() {
    await chrome.storage.session.set({ chatHistory: this.history });
    await chrome.storage.local.set({ longTermMemories: this.longTermMemories });
  }

  public getHistory(): LLMMessage[] {
    if (this.longTermMemories.length > 0) {
      const memText = this.longTermMemories.map((m, i) => `${i + 1}. ${m}`).join('\n');
      const memMsg: LLMMessage = { role: 'system', content: `Long Term Memories:\n${memText}` };
      return [memMsg, ...this.history];
    }
    return this.history;
  }

  private isCompacting = false;
  private compactionEpoch = 0;

  /** Clears the in-memory history and persists the cleared state. Always await this. */
  public async clear(): Promise<void> {
    this.compactionEpoch++;
    this.isCompacting = false;
    this.history = [];
    this.longTermMemories = [];
    await this.saveHistory();
  }

  /**
   * Add a turn to history. Immediately persists to session storage.
   * Compaction runs asynchronously in background without blocking the execution hot path.
   */
  public async addTurn(role: 'user' | 'assistant', content: string, llmConfig?: LLMConfig): Promise<CompactionEvent | null> {
    this.history.push({ role, content });
    await chrome.storage.session.set({ chatHistory: this.history });

    if (this.history.length > 20 && llmConfig && !this.isCompacting) {
      // ponytail: non-blocking background compaction so the voice agent hot path never pauses
      this.runBackgroundCompaction(llmConfig).catch(err => {
        logger.warn('HistoryManager', 'Background compaction failed', err);
      });
    } else if (this.history.length > 30) {
      // Hard fallback if compaction failed repeatedly or no config: keep last 20
      this.history = this.history.slice(-20);
      await this.saveHistory();
    }

    return null;
  }

  private async runBackgroundCompaction(config: LLMConfig): Promise<void> {
    if (this.isCompacting || this.history.length <= 20) return;
    this.isCompacting = true;
    const currentEpoch = this.compactionEpoch;

    try {
      const toSummarize = this.history.slice(0, 4);
      let summaryText = '';
      try {
        summaryText = await this.summarizeTurns(toSummarize, config);
      } catch (e) {
        if (this.compactionEpoch !== currentEpoch) return;
        logger.warn('HistoryManager', 'Summarization failed, retrying once...', e);
        summaryText = await this.summarizeTurns(toSummarize, config);
      }

      // Discard if clear() was called while awaiting summarization
      if (this.compactionEpoch !== currentEpoch) return;

      this.longTermMemories.push(summaryText);
      this.history = this.history.slice(4);

      if (this.longTermMemories.length > 5) {
        try {
          const compressed = await this.compressMemories(this.longTermMemories, config);
          if (this.compactionEpoch !== currentEpoch) return;
          this.longTermMemories = [compressed];
        } catch (compErr) {
          logger.warn('HistoryManager', 'Memory compression failed', compErr);
        }
      }

      if (this.compactionEpoch !== currentEpoch) return;
      await this.saveHistory();
      logger.info('HistoryManager', 'Background memory compaction completed');
    } catch (err) {
      if (this.compactionEpoch !== currentEpoch) return;
      logger.warn('HistoryManager', 'Background compaction failed, pruning oldest turns', err);
      if (this.history.length > 20) {
        this.history = this.history.slice(4);
        await this.saveHistory();
      }
    } finally {
      if (this.compactionEpoch === currentEpoch) {
        this.isCompacting = false;
      }
    }
  }

  private async summarizeTurns(turns: LLMMessage[], config: LLMConfig): Promise<string> {
    const prompt = `Summarize these conversation turns in 2-3 sentences, preserving task context and any important decisions made:\n${JSON.stringify(turns)}`;
    return callGemini([{ role: 'user', content: prompt }], config, false);
  }

  private async compressMemories(memories: string[], config: LLMConfig): Promise<string> {
    const prompt = `Synthesize and compress the following long-term memories into a single, concise, cohesive master memory document. Retain all important facts, preferences, and context about the user, but eliminate redundancy:\n${JSON.stringify(memories)}`;
    return callGemini([{ role: 'user', content: prompt }], config, false);
  }
}
