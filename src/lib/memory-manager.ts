// src/lib/memory-manager.ts
import { logger } from './logger';
import type { UserMemory, TaskContinuityState } from '../sidepanel/types';

const STORAGE_KEY_MEMORIES = 'anvora_user_memories';
const STORAGE_KEY_MEMORY_SETTINGS = 'anvora_memory_settings';
const STORAGE_KEY_TASK_CONTINUITY = 'anvora_last_task_continuity';

// Patterns to identify and strictly block sensitive information from being stored in memory
const SENSITIVE_PATTERNS = [
  /\bAIza[0-9A-Za-z-_]{25,50}\b/i,                   // Google API keys
  /\bsk-[0-9A-Za-z-_]{20,}\b/i,                     // OpenAI/Groq API keys
  /\bghp_[0-9A-Za-z]{36}\b/i,                       // GitHub tokens
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/,                   // Generic base64 tokens/secrets
  /\b(password|passwd|pwd)\b/i,                     // Any password mention
  /\b(api[_-]?key|secret[_-]?key|auth[_-]?token)\s*(is|[:=])\s*\S+/i, // API key assignments
  /\b(private[_-]?key)\b/i,                         // Private keys
  /\b(pin|cvv|cvc)\s*(is|[:=])?\s*\d{3,4}\b/i,     // Card security codes
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/,       // Credit card numbers
  /\b\d{3}-\d{2}-\d{4}\b/,                          // SSNs
  /\b(ssn|social\s+security\s+number)\b/i,          // SSN mentions
  /\bbearer\s+[a-zA-Z0-9_\-\.]+/i,                  // Bearer auth tokens
];

// Patterns to identify adversarial prompt injection payloads
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all)\s+instructions/i,
  /system\s*:/i,
  /assistant\s*:/i,
  /override\s+(all|system|security|rules)/i,
  /you\s+are\s+now/i,
  /forget\s+(all|previous|everything)/i,
  /new\s+instructions/i,
];

export class MemoryManager {
  private static instance: MemoryManager | null = null;
  private memories: UserMemory[] = [];
  private memoryEnabled: boolean = true;
  private isLoaded: boolean = false;

  private constructor() {}

  public static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  public async load(): Promise<void> {
    if (this.isLoaded) return;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = (await chrome.storage.local.get([
          STORAGE_KEY_MEMORIES,
          STORAGE_KEY_MEMORY_SETTINGS,
          'memoryEnabled',
        ])) as Record<string, any>;
        if (Array.isArray(data[STORAGE_KEY_MEMORIES])) {
          this.memories = data[STORAGE_KEY_MEMORIES];
        }
        if (data.memoryEnabled !== undefined) {
          this.memoryEnabled = Boolean(data.memoryEnabled);
        } else if (data[STORAGE_KEY_MEMORY_SETTINGS]?.memoryEnabled !== undefined) {
          this.memoryEnabled = Boolean(data[STORAGE_KEY_MEMORY_SETTINGS].memoryEnabled);
        }
      }
      this.isLoaded = true;
      logger.info('MemoryManager', 'Memories loaded', {
        count: this.memories.length,
        enabled: this.memoryEnabled,
      });
    } catch (err) {
      logger.warn('MemoryManager', 'Failed to load memories from storage', err);
      this.isLoaded = true;
    }
  }

  public isEnabled(): boolean {
    return this.memoryEnabled;
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.memoryEnabled = enabled;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({
          [STORAGE_KEY_MEMORY_SETTINGS]: { memoryEnabled: enabled },
          memoryEnabled: enabled,
        });
      }
      logger.info('MemoryManager', `Memory enabled state set to: ${enabled}`);
    } catch (err) {
      logger.error('MemoryManager', 'Failed to persist memory enabled state', err);
    }
  }

  public getAllMemories(): UserMemory[] {
    return [...this.memories];
  }

  /**
   * Validates whether content contains sensitive information or injection payloads.
   * Returns true if safe to store, false if sensitive or adversarial.
   */
  public isContentSafe(content: string): boolean {
    if (!content || typeof content !== 'string') return false;
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(content)) {
        return false;
      }
    }
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Adds an explicit or learned memory after strict safety inspection.
   */
  public async addMemory(
    content: string,
    category: UserMemory['category'] = 'preference',
    source: 'explicit_user' | 'learned_task' = 'explicit_user',
    pinned = false
  ): Promise<UserMemory | null> {
    if (!this.memoryEnabled) {
      logger.info('MemoryManager', 'Blocked memory creation because memory is disabled');
      return null;
    }

    const trimmed = content.trim();
    if (!trimmed || trimmed.length < 3) {
      return null;
    }

    // Security Gate: Reject passwords, tokens, API keys
    if (!this.isContentSafe(trimmed)) {
      logger.warn('MemoryManager', 'Blocked attempt to save sensitive memory', {
        category,
        length: trimmed.length,
      });
      return null;
    }

    // Truncate to maximum safe length to protect context budget
    const sanitizedContent = trimmed.slice(0, 300);

    // Prevent duplicate memories
    const duplicate = this.memories.find(
      (m) => m.content.toLowerCase() === sanitizedContent.toLowerCase()
    );
    if (duplicate) {
      duplicate.updatedAt = Date.now();
      await this.saveMemories();
      return duplicate;
    }

    const newMemory: UserMemory = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      category,
      content: sanitizedContent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source,
      pinned,
    };

    this.memories.unshift(newMemory);

    // Keep memory collection bounded (maximum 50 items)
    if (this.memories.length > 50) {
      // Remove oldest unpinned items
      const unpinned = this.memories.filter((m) => !m.pinned);
      if (unpinned.length > 0) {
        const oldest = unpinned[unpinned.length - 1];
        this.memories = this.memories.filter((m) => m.id !== oldest.id);
      }
    }

    await this.saveMemories();
    logger.info('MemoryManager', 'New memory stored', { id: newMemory.id, category });
    return newMemory;
  }

  public async updateMemory(id: string, newContent: string): Promise<boolean> {
    const trimmed = newContent.trim();
    if (!trimmed || !this.isContentSafe(trimmed)) return false;

    const memory = this.memories.find((m) => m.id === id);
    if (!memory) return false;

    memory.content = trimmed.slice(0, 300);
    memory.updatedAt = Date.now();
    await this.saveMemories();
    return true;
  }

  public async deleteMemory(id: string): Promise<boolean> {
    const beforeCount = this.memories.length;
    this.memories = this.memories.filter((m) => m.id !== id);
    if (this.memories.length !== beforeCount) {
      await this.saveMemories();
      logger.info('MemoryManager', 'Memory deleted', { id });
      return true;
    }
    return false;
  }

  public async clearAllMemories(): Promise<void> {
    this.memories = [];
    await this.saveMemories();
    logger.info('MemoryManager', 'All memories cleared');
  }

  private async saveMemories(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY_MEMORIES]: this.memories });
      }
    } catch (err) {
      logger.error('MemoryManager', 'Failed to save memories to storage', err);
    }
  }

  /**
   * Retrieves relevant memories for the current directive and page context.
   * Efficiently filters top matches without overwhelming the LLM context.
   */
  public getRelevantMemories(query: string, currentUrl = '', maxCount = 5): UserMemory[] {
    if (!this.memoryEnabled || this.memories.length === 0) {
      return [];
    }

    const queryLower = (query || '').toLowerCase();
    const urlLower = (currentUrl || '').toLowerCase();

    // Score memories based on keyword relevance and pinned status
    const scored = this.memories.map((m) => {
      let score = 0;
      if (m.pinned) score += 5;

      const contentLower = m.content.toLowerCase();

      // Category matching
      if (m.category === 'preference') score += 2;

      // URL / domain matching for frequent sites and workflows
      if (urlLower && m.category === 'frequent_site') {
        const tokens = contentLower.split(/[\s(),]+/);
        for (const token of tokens) {
          if (token.includes('.') && urlLower.includes(token)) {
            score += 8;
            break;
          }
        }
      }

      // Keyword matching from user query (full word and 4-letter root stem matching)
      const words = queryLower.split(/\s+/).filter((w) => w.length > 2);
      for (const word of words) {
        const stem = word.length >= 4 ? word.slice(0, 4) : word;
        if (contentLower.includes(word) || contentLower.includes(stem)) {
          score += 3;
        }
      }

      return { memory: m, score };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored
      .filter((s) => s.score > 0 || s.memory.pinned || s.memory.category === 'preference')
      .slice(0, maxCount)
      .map((s) => s.memory);
  }

  /**
   * Formats relevant memories into a clean, safe system prompt block.
   */
  public formatMemoriesForPrompt(memories: UserMemory[]): string {
    if (!memories || memories.length === 0) return '';

    const lines = memories.map((m) => `- [${m.category}] ${m.content}`);
    return `\n[USER PREFERENCES & CONTEXT MEMORY]\n(Note: These are learned preferences to personalize response style and workflows. Current user instructions ALWAYS take precedence over remembered preferences):\n${lines.join('\n')}\n`;
  }

  /**
   * Task Continuity: Persists the active or interrupted task state
   * so it can be resumed seamlessly on instructions like "continue where you stopped".
   */
  public async saveTaskContinuity(state: TaskContinuityState): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ [STORAGE_KEY_TASK_CONTINUITY]: state });
      }
      logger.info('MemoryManager', 'Task continuity state saved', {
        directive: state.directive,
        status: state.status,
      });
    } catch (err) {
      logger.warn('MemoryManager', 'Failed to save task continuity state', err);
    }
  }

  public async getLastTaskContinuity(): Promise<TaskContinuityState | null> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = (await chrome.storage.local.get([STORAGE_KEY_TASK_CONTINUITY])) as Record<string, any>;
        return (data[STORAGE_KEY_TASK_CONTINUITY] as TaskContinuityState) || null;
      }
    } catch (err) {
      logger.warn('MemoryManager', 'Failed to retrieve task continuity state', err);
    }
    return null;
  }

  public async clearTaskContinuity(): Promise<void> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.remove([STORAGE_KEY_TASK_CONTINUITY]);
      }
    } catch (err) {
      logger.warn('MemoryManager', 'Failed to clear task continuity state', err);
    }
  }
}
