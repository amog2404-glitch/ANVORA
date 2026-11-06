// src/lib/webpage-monitor.ts
import type { WebpageSnapshot, WorkflowCondition } from '../sidepanel/types';

export interface ChangeDetectionResult {
  hasChanged: boolean;
  conditionMet: boolean;
  changeType?: 'price' | 'content' | 'announcement';
  summary: string;
  previousValue?: string;
  newValue?: string;
  detectedPrice?: number;
  detectedCurrency?: string;
  isAccessBlocked?: boolean;
  blockReason?: string;
}

export class WebpageMonitor {
  /**
   * Deterministic 32-bit FNV-1a hash formatted as hex string
   */
  public static hashContent(content: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Remove noisy elements such as timestamps, dynamic ad tokens, and live counters
   */
  public static normalizeContent(rawText: string): string {
    if (!rawText) return '';

    return rawText
      // Remove ISO timestamps / standard dates
      .replace(/\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?\b/g, '')
      .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi, '')
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, '')
      // Remove copyright notices with fluctuating years
      .replace(/©\s*\d{4}[-\d]*/g, '')
      // Remove dynamic counter phrases (e.g. "12 people viewing now", "updated 2 minutes ago")
      .replace(/\b\d+\s+(people|users|visitors)\s+(viewing|watching|online)(\s+now)?\b/gi, '')
      .replace(/\b(updated|posted|modified)\s+\d+\s+(seconds?|minutes?|hours?|days?)\s+ago\b/gi, '')
      // Clean up orphaned punctuation and redundant whitespace
      .replace(/[.,;:]\s*[.,;:]+/g, '.')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check whether the page appears to be a login wall, CAPTCHA, or access restriction
   */
  public static detectAccessBlock(rawText: string, title = ''): { blocked: boolean; reason?: string } {
    const combined = `${title} ${rawText}`.toLowerCase();

    if (
      combined.includes('verify you are human') ||
      combined.includes('cloudflare') && (combined.includes('turnstile') || combined.includes('challenge')) ||
      combined.includes('recaptcha') ||
      combined.includes('bot detection') ||
      combined.includes('unusual traffic from your computer')
    ) {
      return { blocked: true, reason: 'Page is protected by a CAPTCHA or bot challenge gate.' };
    }

    if (
      (combined.includes('sign in to your account') || combined.includes('please log in to continue')) &&
      !combined.includes('welcome back') &&
      rawText.length < 500
    ) {
      return { blocked: true, reason: 'Page requires user authentication or login credentials.' };
    }

    if (rawText.length < 30 && !title) {
      return { blocked: true, reason: 'Page returned empty content or failed to load.' };
    }

    return { blocked: false };
  }

  /**
   * Price extraction heuristic for Indian Rupees (₹/Rs./INR), USD ($), EUR (€), GBP (£)
   */
  public static extractPrice(text: string): { price: number; currency: string } | null {
    if (!text) return null;

    // Pattern matching currency symbols followed by numbers: ₹5,000 | Rs. 4,999 | $199.99 | €45.50
    const priceRegex = /(?:(₹|rs\.?|inr|\$|€|£)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(₹|rs\.?|inr|\$|€|£))/i;
    const match = text.match(priceRegex);

    if (match) {
      const rawCurrency = (match[1] || match[4] || '').toUpperCase();
      const rawNumber = match[2] || match[3] || '';
      const cleanNumber = parseFloat(rawNumber.replace(/,/g, ''));

      if (!isNaN(cleanNumber) && cleanNumber > 0 && cleanNumber < 100_000_000) {
        let currency = 'INR';
        if (rawCurrency.includes('₹') || rawCurrency.includes('RS') || rawCurrency.includes('INR')) currency = 'INR';
        else if (rawCurrency.includes('$')) currency = 'USD';
        else if (rawCurrency.includes('€')) currency = 'EUR';
        else if (rawCurrency.includes('£')) currency = 'GBP';

        return { price: cleanNumber, currency };
      }
    }

    return null;
  }

  /**
   * Extract potential announcements or top headlines from text
   */
  public static extractAnnouncements(text: string): string[] {
    const lines = text
      .split(/\n|\. |\! /)
      .map(l => l.trim())
      .filter(l => l.length >= 20 && l.length <= 160);

    const announcements: string[] = [];
    const keywords = ['announce', 'update', 'launch', 'release', 'new', 'important', 'notice', 'schedule', 'alert'];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (keywords.some(k => lower.includes(k))) {
        announcements.push(line);
        if (announcements.length >= 3) break;
      }
    }

    return announcements;
  }

  /**
   * Create a WebpageSnapshot from raw extracted text
   */
  public static createSnapshot(
    workflowId: string,
    url: string,
    rawText: string,
    _title = ''
  ): WebpageSnapshot {
    const normalized = this.normalizeContent(rawText);
    const contentHash = this.hashContent(normalized);
    const priceData = this.extractPrice(rawText);
    const announcements = this.extractAnnouncements(rawText);

    return {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workflowId,
      url,
      timestamp: Date.now(),
      contentHash,
      snippet: normalized.slice(0, 300),
      detectedPrice: priceData?.price,
      currency: priceData?.currency,
      announcements: announcements.length > 0 ? announcements : undefined,
      rawTextLength: rawText.length,
    };
  }

  /**
   * Compare a fresh snapshot against a previous baseline and evaluate workflow condition
   */
  public static evaluateChange(
    currentSnapshot: WebpageSnapshot,
    previousSnapshot: WebpageSnapshot | null | undefined,
    condition?: WorkflowCondition,
    pageTitle = '',
    rawText = ''
  ): ChangeDetectionResult {
    // 1. Guard against blocked / login / captcha pages
    const blockCheck = this.detectAccessBlock(rawText, pageTitle);
    if (blockCheck.blocked) {
      return {
        hasChanged: false,
        conditionMet: false,
        isAccessBlocked: true,
        blockReason: blockCheck.reason,
        summary: `Page monitoring failed: ${blockCheck.reason}`,
      };
    }

    // First run baseline established
    if (!previousSnapshot) {
      const initialPrice = currentSnapshot.detectedPrice;
      const initialPriceStr = initialPrice !== undefined
        ? `${currentSnapshot.currency || 'INR'} ${initialPrice.toLocaleString()}`
        : 'None detected';

      return {
        hasChanged: false,
        conditionMet: false,
        summary: `Initial baseline snapshot created for ${currentSnapshot.url}. Recorded price: ${initialPriceStr}.`,
        detectedPrice: currentSnapshot.detectedPrice,
        detectedCurrency: currentSnapshot.currency,
      };
    }

    const hashMatch = currentSnapshot.contentHash === previousSnapshot.contentHash;
    const hasChanged = !hashMatch;

    // Evaluate Condition
    if (!condition || condition.type === 'always') {
      return {
        hasChanged,
        conditionMet: true,
        summary: hasChanged
          ? `Webpage content updated on ${currentSnapshot.url}.`
          : `Webpage checked on ${currentSnapshot.url}; no content changes detected.`,
      };
    }

    // Condition: Price Below
    if (condition.type === 'price_below') {
      const curPrice = currentSnapshot.detectedPrice;
      const prevPrice = previousSnapshot.detectedPrice;
      const targetThreshold = condition.threshold || Number(condition.targetValue) || 0;

      if (curPrice === undefined) {
        return {
          hasChanged,
          conditionMet: false,
          summary: `Could not detect a numeric price on ${currentSnapshot.url} to evaluate threshold ${condition.currency || '₹'}${targetThreshold}.`,
        };
      }

      const meetsThreshold = curPrice <= targetThreshold;
      const priceDropped = prevPrice !== undefined ? curPrice < prevPrice : false;
      // Deduplicate notifications: only trigger when entering target threshold or price drops further
      const isNewlySatisfied = meetsThreshold && (prevPrice === undefined || prevPrice > targetThreshold || priceDropped);

      let summary = '';
      if (meetsThreshold) {
        summary = `Target price satisfied! Current price is ${currentSnapshot.currency || 'INR'} ${curPrice.toLocaleString()} (Threshold: ≤ ${targetThreshold}).`;
      } else {
        summary = `Price is currently ${currentSnapshot.currency || 'INR'} ${curPrice.toLocaleString()}, which is above threshold ${targetThreshold}.`;
      }

      return {
        hasChanged: priceDropped || hasChanged,
        conditionMet: isNewlySatisfied,
        changeType: 'price',
        detectedPrice: curPrice,
        detectedCurrency: currentSnapshot.currency,
        previousValue: prevPrice !== undefined ? `${prevPrice}` : undefined,
        newValue: `${curPrice}`,
        summary,
      };
    }

    // Condition: Price Change (Any Drop or Rise)
    if (condition.type === 'price_change') {
      const curPrice = currentSnapshot.detectedPrice;
      const prevPrice = previousSnapshot.detectedPrice;

      if (curPrice === undefined) {
        return {
          hasChanged,
          conditionMet: false,
          summary: `No price detected on ${currentSnapshot.url}.`,
        };
      }

      const priceChanged = prevPrice !== undefined && curPrice !== prevPrice;

      return {
        hasChanged: priceChanged,
        conditionMet: priceChanged,
        changeType: 'price',
        detectedPrice: curPrice,
        detectedCurrency: currentSnapshot.currency,
        previousValue: prevPrice !== undefined ? `${prevPrice}` : undefined,
        newValue: `${curPrice}`,
        summary: priceChanged
          ? `Price changed from ${currentSnapshot.currency || 'INR'} ${prevPrice} to ${curPrice}.`
          : `Price remains unchanged at ${currentSnapshot.currency || 'INR'} ${curPrice}.`,
      };
    }

    // Condition: Availability Change (In Stock / Out of Stock)
    if (condition.type === 'availability_change') {
      const parseAvailability = (txt: string) => {
        const lower = (txt || '').toLowerCase();
        if (lower.includes('out of stock') || lower.includes('sold out') || lower.includes('currently unavailable')) {
          return 'Out of Stock';
        }
        if (lower.includes('in stock') || lower.includes('available') || lower.includes('buy now') || lower.includes('add to cart')) {
          return 'In Stock';
        }
        return 'Unknown';
      };

      const curStatus = parseAvailability(currentSnapshot.snippet + ' ' + rawText);
      const prevStatus = parseAvailability(previousSnapshot.snippet);

      const statusChanged = prevStatus !== 'Unknown' && curStatus !== 'Unknown' && curStatus !== prevStatus;
      const becameAvailable = curStatus === 'In Stock' && prevStatus === 'Out of Stock';

      return {
        hasChanged: statusChanged,
        conditionMet: becameAvailable || statusChanged,
        changeType: 'content',
        previousValue: prevStatus,
        newValue: curStatus,
        summary: statusChanged
          ? `Availability status updated: ${prevStatus} → ${curStatus}.`
          : `Availability remains: ${curStatus}.`,
      };
    }

    // Condition: Text Contains
    if (condition.type === 'text_contains') {
      const targetStr = String(condition.targetValue || '').toLowerCase();
      const contains = currentSnapshot.snippet.toLowerCase().includes(targetStr) ||
        rawText.toLowerCase().includes(targetStr);

      return {
        hasChanged,
        conditionMet: contains,
        changeType: 'content',
        summary: contains
          ? `Matching phrase "${condition.targetValue}" detected on page.`
          : `Phrase "${condition.targetValue}" was not found on page.`,
      };
    }

    // Condition: Content Diff (Generic Significant Change)
    if (condition.type === 'content_diff') {
      const newAnnouncements = (currentSnapshot.announcements || []).filter(
        a => !(previousSnapshot.announcements || []).includes(a)
      );

      if (newAnnouncements.length > 0) {
        return {
          hasChanged: true,
          conditionMet: true,
          changeType: 'announcement',
          newValue: newAnnouncements[0],
          summary: `New announcement found: "${newAnnouncements[0]}"`,
        };
      }

      return {
        hasChanged,
        conditionMet: hasChanged,
        changeType: 'content',
        summary: hasChanged
          ? `Webpage content modified (hash ${previousSnapshot.contentHash} → ${currentSnapshot.contentHash}).`
          : `No significant content differences detected on ${currentSnapshot.url}.`,
      };
    }

    return {
      hasChanged,
      conditionMet: hasChanged,
      summary: hasChanged ? `Page updated on ${currentSnapshot.url}.` : `No updates detected.`,
    };
  }
}

