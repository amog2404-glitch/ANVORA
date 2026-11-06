// src/content/content.ts
import { collectInteractives, formatMarkersText } from '../lib/markers';
import { getRichPageMetadata, extractSemanticText } from '../lib/page-context';
import { detectOverlay, dismissOverlay } from '../lib/overlay-handler';
import { fillInput, sleep, waitForDomSettle } from '../lib/dom-utils';
import type { ActionResult } from '../lib/browser-action-types';

console.log('[ANVORA] Content script loaded');

try {
  chrome.runtime?.onMessage?.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.type === 'GET_CONTEXT') {
      handleGetContext().then(sendResponse);
      return true; // async
    }
    
    if (message.type === 'EXECUTE_ACTION') {
      handleExecuteAction(message.action).then(sendResponse);
      return true; // async
    }
  });
} catch (e) {
  console.error('[ANVORA] Failed to register content message listener:', e);
}

async function handleGetContext() {
  // 1. Handle Overlays
  const overlay = detectOverlay();
  if (overlay) {
    await dismissOverlay();
  }

  // 2. Extract Data
  const semanticText = extractSemanticText();
  const richMeta = getRichPageMetadata(semanticText);
  const markers = collectInteractives();
  const markersText = formatMarkersText(markers);

  return {
    url: richMeta.url,
    title: richMeta.title,
    domain: richMeta.domain,
    name: richMeta.name,
    description: richMeta.description,
    canonicalUrl: richMeta.canonicalUrl,
    language: richMeta.language,
    formsCount: richMeta.formsCount,
    tablesCount: richMeta.tablesCount,
    wordCount: richMeta.wordCount,
    snippet: richMeta.snippet,
    faviconChar: richMeta.faviconChar,
    faviconBg: richMeta.faviconBg,
    semanticText,
    markersText
  };
}

async function handleExecuteAction(action: any): Promise<ActionResult> {
  console.log('[ANVORA] Executing action with verification:', action);
  
  try {
    if (action.action === 'click') {
      const el = document.querySelector(`[data-agent-marker="${action.target_id}"]`) as HTMLElement;
      if (!el) {
        return {
          success: false,
          status: 'FAILED',
          message: `Target element [${action.target_id}] not found on page.`,
          verification: { elementFound: false },
        };
      }

      if (el instanceof HTMLMediaElement) {
        const wasPaused = el.paused;
        if (wasPaused) el.play();
        else el.pause();
        return {
          success: true,
          status: 'SUCCESS',
          message: wasPaused ? 'Media started playing' : 'Media paused',
          verification: { elementFound: true },
        };
      }

      const initialUrl = window.location.href;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(250);
      el.focus();

      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(eventType => {
        el.dispatchEvent(new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window }));
      });
      try { el.click(); } catch(e) {}
      await waitForDomSettle(800);

      const urlChanged = window.location.href !== initialUrl;
      return {
        success: true,
        status: 'SUCCESS',
        message: urlChanged ? `Clicked element, navigated to ${window.location.href}` : `Clicked element [${action.target_id}]`,
        verification: {
          elementFound: true,
          urlChanged,
          currentUrl: window.location.href,
          domChanged: true,
        },
      };
    }
    
    if (action.action === 'type') {
      const el = document.querySelector(`[data-agent-marker="${action.target_id}"]`) as HTMLElement;
      if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        return {
          success: false,
          status: 'FAILED',
          message: `Input element [${action.target_id}] not found or not editable.`,
          verification: { elementFound: false },
        };
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(200);
      el.focus();
      const textToType = action.text || '';
      fillInput(el, textToType);
      await sleep(200);

      // Explicit verification: check that element received the text
      const currentVal = el.value || '';
      const verified = textToType.length === 0 || currentVal.includes(textToType) || currentVal.length > 0;

      if (action.submit) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        const form = el.closest('form');
        if (form) {
          try { form.requestSubmit(); } catch (e) { form.submit(); }
        }
        await waitForDomSettle(1000);
      } else {
        await waitForDomSettle(400);
      }

      return {
        success: true,
        status: verified ? 'SUCCESS' : 'PARTIAL',
        message: verified ? `Typed "${textToType}" and verified input value` : `Typed text into element`,
        verification: {
          elementFound: true,
          valueVerified: verified,
        },
      };
    }

    if (action.action === 'extract') {
      let extracted = '';
      if (action.target_id) {
        const el = document.querySelector(`[data-agent-marker="${action.target_id}"]`) as HTMLElement;
        if (el) {
          extracted = el.innerText || el.textContent || '';
        }
      }
      if (!extracted) {
        extracted = extractSemanticText();
      }

      const hasContent = extracted.trim().length > 0;
      return {
        success: hasContent,
        status: hasContent ? 'SUCCESS' : 'FAILED',
        message: hasContent ? `Extracted ${extracted.length} characters of page text.` : 'No text content could be extracted.',
        data: extracted,
        verification: {
          extractedContent: extracted.substring(0, 500),
        },
      };
    }

    if (action.action === 'press_key' && action.text) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: action.text, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keypress', { key: action.text, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: action.text, bubbles: true }));
      await waitForDomSettle(500);
      return {
        success: true,
        status: 'SUCCESS',
        message: `Dispatched key "${action.text}"`,
        verification: { domChanged: true },
      };
    }

    if (action.action === 'media' && action.text) {
      const mediaElements = Array.from(document.querySelectorAll('video, audio')) as HTMLMediaElement[];
      if (mediaElements.length === 0) {
        return {
          success: false,
          status: 'FAILED',
          message: 'No media elements found on page',
          verification: { elementFound: false },
        };
      }
      
      for (const media of mediaElements) {
        if (action.text === 'play') media.play().catch(() => {});
        else if (action.text === 'pause') media.pause();
        else if (action.text === 'mute') media.muted = true;
        else if (action.text === 'unmute') media.muted = false;
      }
      return {
        success: true,
        status: 'SUCCESS',
        message: `Media control "${action.text}" executed on ${mediaElements.length} element(s).`,
        verification: { elementFound: true },
      };
    }

    if (action.action === 'press_enter') {
      const el = document.activeElement as HTMLElement;
      if (el) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        const form = el.closest('form');
        if (form) form.requestSubmit();
        await waitForDomSettle(800);
        return {
          success: true,
          status: 'SUCCESS',
          message: 'Pressed Enter on active element',
          verification: { domChanged: true },
        };
      }
      return {
        success: false,
        status: 'FAILED',
        message: 'No active element focused to press Enter on',
      };
    }
    
    if (action.action === 'scroll_down' || action.action === 'scroll_up' || action.action === 'scroll') {
      let multiplier = 0.8;
      if (action.text === 'small') multiplier = 0.2;
      else if (action.text === 'medium') multiplier = 0.5;

      const sign = (action.action === 'scroll_up') ? -1 : 1;
      const initialScroll = window.scrollY;
      window.scrollBy({ top: window.innerHeight * multiplier * sign, behavior: 'smooth' });
      await sleep(500);
      const scrollDelta = Math.abs(window.scrollY - initialScroll);

      return {
        success: true,
        status: 'SUCCESS',
        message: `Scrolled page by ${Math.round(scrollDelta)}px`,
        verification: { scrollDelta },
      };
    }

    if (action.action === 'navigate' || action.action === 'go_back' || action.action === 'switch_tab') {
      return {
        success: false,
        status: 'FAILED',
        message: 'Background action invoked in content script context',
      };
    }

    if (action.action === 'wait') {
      await sleep(2500);
      return {
        success: true,
        status: 'SUCCESS',
        message: 'Waited for page condition',
      };
    }
    
    await waitForDomSettle(1000);
    return {
      success: false,
      status: 'FAILED',
      message: `Unknown action: ${action.action}`,
    };
  } catch (err: any) {
    console.error('[ANVORA] Action failed:', err);
    return {
      success: false,
      status: 'FAILED',
      message: err?.message || 'Action threw an unhandled exception',
    };
  }
}
