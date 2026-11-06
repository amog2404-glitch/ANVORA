// src/sidepanel/tabBridge.ts
import { logger } from '../lib/logger';
import type { WebsiteContextData } from './types';

export type ContextListener = (ctx: WebsiteContextData) => void;

export interface AgentContextPayload {
  url: string;
  title: string;
  semanticText: string;
  markersText: string;
  tabId?: number;
  domain?: string;
  wordCount?: number;
}

class TabBridge {
  private currentContext: WebsiteContextData = {
    id: 'initial',
    domain: 'active-tab.browser',
    name: 'Active Webpage',
    title: 'Ready for Autonomous Directives',
    url: '',
    connectionState: 'syncing',
    faviconChar: 'A',
    faviconBg: '#7772E8',
    wordCount: 0,
    formsCount: 0,
    tablesCount: 0,
    snippet: '',
  };

  private activeTabId: number | null = null;
  private activeWindowId: number | null = null;
  private currentExtractionId = 0;
  private isExtracting = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // In-memory cache for AgentManager
  private cachedSemanticText = '';
  private cachedMarkersText = '';

  private listeners: Set<ContextListener> = new Set();

  constructor() {
    this.initListeners();
    // Immediate initial sync
    this.refreshContext();
  }

  private initListeners() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      logger.warn('TabBridge', 'Chrome tabs API not available');
      return;
    }

    // 1. Tab Activated (user clicks a different tab)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.activeTabId = activeInfo.tabId;
      this.activeWindowId = activeInfo.windowId;
      this.currentExtractionId++;

      // Optimistically update connection state to syncing
      this.setPartialContext({
        connectionState: 'syncing',
        name: 'Connecting...',
        title: 'Synchronizing tab context...',
      });

      this.scheduleRefresh(80);
    });

    // 2. Tab Updated (URL navigation, title change, reload, or status complete)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tabId === this.activeTabId || tab.active) {
        if (changeInfo.url) {
          this.currentExtractionId++;
          this.setPartialContext({
            url: changeInfo.url,
            connectionState: 'syncing',
            name: 'Navigating...',
            title: 'Loading new page...',
          });
          this.scheduleRefresh(150);
        } else if (changeInfo.status === 'complete') {
          this.scheduleRefresh(100);
        } else if (changeInfo.title && this.currentContext.connectionState === 'connected') {
          this.setPartialContext({ title: changeInfo.title });
        }
      }
    });

    // 3. Tab Closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.activeTabId) {
        this.activeTabId = null;
        this.currentExtractionId++;
        this.scheduleRefresh(100);
      }
    });

    // 4. Window Focus Changed
    if (chrome.windows?.onFocusChanged) {
      chrome.windows.onFocusChanged.addListener((windowId) => {
        if (windowId !== chrome.windows.WINDOW_ID_NONE) {
          this.activeWindowId = windowId;
          this.scheduleRefresh(120);
        }
      });
    }
  }

  private scheduleRefresh(delayMs = 120) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refreshContext();
    }, delayMs);
  }

  public subscribeContext(listener: ContextListener): () => void {
    this.listeners.add(listener);
    listener(this.currentContext);
    return () => this.listeners.delete(listener);
  }

  public getCurrentContext(): WebsiteContextData {
    return this.currentContext;
  }

  public getActiveTabId(): number | null {
    return this.activeTabId;
  }

  public getActiveWindowId(): number | null {
    return this.activeWindowId;
  }

  public getIsExtracting(): boolean {
    return this.isExtracting;
  }

  private setPartialContext(partial: Partial<WebsiteContextData>) {
    this.currentContext = { ...this.currentContext, ...partial };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn(this.currentContext));
  }

  public isRestrictedUrl(url: string): boolean {
    if (!url) return true;
    const lower = url.toLowerCase();
    return (
      lower.startsWith('chrome://') ||
      lower.startsWith('edge://') ||
      lower.startsWith('about:') ||
      lower.startsWith('chrome-extension://') ||
      lower.startsWith('devtools://') ||
      lower.startsWith('view-source:') ||
      lower.includes('chromewebstore.google.com')
    );
  }

  public async refreshContext(): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    const extractionId = ++this.currentExtractionId;

    try {
      // Find the current active tab
      const queryOptions: chrome.tabs.QueryInfo = { active: true, currentWindow: true };
      const tabs = await chrome.tabs.query(queryOptions);
      const tab = tabs[0];

      if (!tab || !tab.id) {
        if (extractionId !== this.currentExtractionId) return; // Stale check
        this.currentContext = {
          id: 'no-tab',
          domain: 'none',
          name: 'No Active Tab',
          title: 'Select a tab to begin',
          url: '',
          connectionState: 'idle',
          faviconChar: '—',
          faviconBg: '#94A3B8',
          wordCount: 0,
          formsCount: 0,
          tablesCount: 0,
          snippet: 'Open or focus a webpage tab to enable connected autonomous intelligence.',
        };
        this.cachedSemanticText = '';
        this.cachedMarkersText = '';
        this.notifyListeners();
        return;
      }

      this.activeTabId = tab.id;
      this.activeWindowId = tab.windowId;
      const url = tab.url || '';
      const title = tab.title || 'Untitled Webpage';

      // Handle restricted/internal browser pages
      if (this.isRestrictedUrl(url)) {
        if (extractionId !== this.currentExtractionId) return; // Stale check
        this.currentContext = {
          id: `tab-${tab.id}`,
          domain: 'browser.internal',
          name: 'Internal Browser Page',
          title: title || 'Browser System Page',
          url: url,
          connectionState: 'unsupported' as any,
          faviconChar: 'B',
          faviconBg: '#64748B',
          wordCount: 0,
          formsCount: 0,
          tablesCount: 0,
          snippet: 'Browser security policies prevent extensions from interacting with internal settings, devtools, or web store pages.',
        };
        this.cachedSemanticText = 'This is an internal browser page. Extensions cannot interact with internal browser pages due to security policies. Please navigate to a standard website.';
        this.cachedMarkersText = '';
        this.notifyListeners();
        return;
      }

      // Mark syncing
      this.isExtracting = true;
      if (this.currentContext.connectionState !== 'syncing') {
        this.setPartialContext({ connectionState: 'syncing' });
      }

      // Extract context from tab
      const result = await this.extractFromTab(tab.id, url);

      // Verify sequence: discard if user switched tabs during async extraction
      if (extractionId !== this.currentExtractionId) {
        logger.debug('TabBridge', 'Discarding stale context extraction result', { extractionId });
        return;
      }

      if (result) {
        this.cachedSemanticText = result.semanticText || '';
        this.cachedMarkersText = result.markersText || '';

        const domain = result.domain || this.extractDomain(url);
        const name = result.name || this.cleanSiteName(domain, result.title || title);

        this.currentContext = {
          id: `tab-${tab.id}`,
          domain,
          name,
          title: result.title || title,
          url,
          connectionState: 'connected',
          faviconChar: result.faviconChar || name.charAt(0).toUpperCase() || 'W',
          faviconBg: result.faviconBg || '#7772E8',
          wordCount: result.wordCount || 0,
          formsCount: result.formsCount || 0,
          tablesCount: result.tablesCount || 0,
          snippet: result.snippet || '',
        };
      } else {
        // Fallback for reachable tabs where content script could not provide full semantic data
        const domain = this.extractDomain(url);
        const name = this.cleanSiteName(domain, title);
        this.currentContext = {
          id: `tab-${tab.id}`,
          domain,
          name,
          title,
          url,
          connectionState: 'connected',
          faviconChar: name.charAt(0).toUpperCase() || 'W',
          faviconBg: '#7772E8',
          wordCount: 0,
          formsCount: 0,
          tablesCount: 0,
          snippet: 'Webpage connected. Ready for directives.',
        };
      }

      this.isExtracting = false;
      this.notifyListeners();
    } catch (err) {
      if (extractionId !== this.currentExtractionId) return;
      logger.error('TabBridge', 'Error refreshing tab context', err);
      this.isExtracting = false;
      this.setPartialContext({ connectionState: 'idle' });
    }
  }

  private async extractFromTab(tabId: number, url: string): Promise<any> {
    try {
      return await chrome.tabs.sendMessage(tabId, { type: 'GET_CONTEXT' });
    } catch (err: any) {
      if (err.message && err.message.includes('Receiving end does not exist')) {
        logger.info('TabBridge', 'Injecting content script dynamically', { tabId, url });
        const injected = await this.ensureContentScriptInjected(tabId);
        if (injected) {
          try {
            return await chrome.tabs.sendMessage(tabId, { type: 'GET_CONTEXT' });
          } catch (retryErr) {
            logger.warn('TabBridge', 'Retry GET_CONTEXT after injection failed', retryErr);
          }
        }
      }
      return null;
    }
  }

  private async ensureContentScriptInjected(tabId: number): Promise<boolean> {
    try {
      const manifest = chrome.runtime.getManifest();
      const contentScripts = manifest.content_scripts?.[0]?.js;
      if (contentScripts && contentScripts.length > 0) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: contentScripts,
        });
        await new Promise((r) => setTimeout(r, 120));
        return true;
      }
    } catch (err) {
      logger.warn('TabBridge', 'Failed to inject content script', err);
    }
    return false;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch {
      return 'active.tab';
    }
  }

  private cleanSiteName(domain: string, title: string): string {
    const parts = domain.split('.');
    if (parts.length > 0 && parts[0]) {
      const raw = parts[0];
      if (raw.toLowerCase() === 'github') return 'GitHub';
      if (raw.toLowerCase() === 'youtube') return 'YouTube';
      if (raw.toLowerCase() === 'google') return 'Google';
      if (raw.toLowerCase() === 'wikipedia') return 'Wikipedia';
      if (raw.toLowerCase() === 'reddit') return 'Reddit';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return title.split(/[-|—]/)[0]?.trim() || domain;
  }

  /**
   * Safe, sanitized context for AgentManager and LLM reasoning.
   * Wraps webpage content in explicit security prompt delimiters to isolate untrusted input.
   * If targetTabId is provided, validates that the tab still exists and extracts from it directly.
   */
  public async getContextForAgent(targetTabId?: number | null): Promise<AgentContextPayload | null> {
    if (targetTabId) {
      const targetTab = await chrome.tabs.get(targetTabId).catch(() => null);
      if (!targetTab || !targetTab.id) {
        logger.warn('TabBridge', `Task-bound tab ${targetTabId} does not exist or was closed`);
        return null;
      }
      if (targetTab.id !== this.activeTabId) {
        const url = targetTab.url || '';
        const title = targetTab.title || 'Untitled Webpage';
        if (this.isRestrictedUrl(url)) {
          return {
            tabId: targetTab.id,
            url,
            title,
            domain: 'browser.internal',
            wordCount: 0,
            semanticText: 'This is an internal browser page. Extensions cannot interact with internal browser pages due to security policies.',
            markersText: '',
          };
        }
        const result = await this.extractFromTab(targetTab.id, url);
        const semantic = result?.semanticText || '';
        const safeUntrustedContent = semantic
          ? `=== ACTIVE WEBPAGE CONTEXT: ${title} (${url}) ===\n[UNTRUSTED WEBPAGE CONTENT START]\n${semantic}\n[UNTRUSTED WEBPAGE CONTENT END]\n=== END ACTIVE WEBPAGE CONTEXT ===`
          : 'No readable text content extracted from this page.';
        return {
          tabId: targetTab.id,
          url,
          title: result?.title || title,
          domain: result?.domain || this.extractDomain(url),
          wordCount: result?.wordCount || 0,
          semanticText: safeUntrustedContent,
          markersText: result?.markersText || '',
        };
      }
    }

    // Default: use active tab context
    if (!this.cachedSemanticText || this.currentContext.connectionState === 'syncing') {
      await this.refreshContext();
    }

    const { url, title, domain, wordCount } = this.currentContext;

    // Isolate untrusted web content with explicit security boundaries
    const safeUntrustedContent = this.cachedSemanticText
      ? `=== ACTIVE WEBPAGE CONTEXT: ${title} (${url}) ===\n[UNTRUSTED WEBPAGE CONTENT START]\n${this.cachedSemanticText}\n[UNTRUSTED WEBPAGE CONTENT END]\n=== END ACTIVE WEBPAGE CONTEXT ===`
      : 'No readable text content extracted from this page.';

    return {
      tabId: this.activeTabId || undefined,
      url,
      title,
      domain,
      wordCount,
      semanticText: safeUntrustedContent,
      markersText: this.cachedMarkersText,
    };
  }
}

export const tabBridge = new TabBridge();
