// src/background/background.ts
import type { ActionResult } from '../lib/browser-action-types';
import { WorkflowManager } from '../lib/workflow-manager';

try {
  chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch?.((error: any) => console.error(error));
} catch (e) {
  console.warn('[ANVORA Background] Side panel API unavailable:', e);
}

try {
  chrome.commands?.onCommand?.addListener((command: string) => {
    if (command === 'toggle-listening') {
      chrome.runtime?.sendMessage?.({ type: 'HOTKEY_PRESSED' })?.catch?.(() => {});
    }
  });
} catch (e) {
  console.warn('[ANVORA Background] Commands API unavailable:', e);
}

// Phase 7: Chrome Alarms handler for proactive workflow automation
chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('anvora_wf_')) {
    const workflowId = alarm.name.replace('anvora_wf_', '');
    try {
      const wm = WorkflowManager.getInstance();
      const execution = await wm.executeWorkflow(workflowId, 'alarm');
      chrome.runtime.sendMessage({
        type: 'WORKFLOW_EXECUTED',
        workflowId,
        execution,
      }).catch(() => {});
    } catch (err) {
      console.error('[ANVORA Background] Alarm workflow execution failed:', err);
    }
  }
});

// Phase 7: Notifications clicked handler
chrome.notifications?.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('anvora_notif_')) {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId && (chrome.sidePanel as any)?.open) {
        (chrome.sidePanel as any).open({ tabId }).catch(() => {});
      }
    }).catch(() => {});
  }
});

let previouslyMutedTabIds = new Set<number>();

try {
  chrome.tabs?.onRemoved?.addListener((tabId) => {
    previouslyMutedTabIds.delete(tabId);
  });
} catch {}

try {
  chrome.runtime?.onMessage?.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'EXECUTE_BG_ACTION') {
    handleBgAction(message.action).then(sendResponse);
    return true; // async
  }
  
  if (message.type === 'MUTE_ALL_TABS') {
    chrome.tabs.query({}).then(tabs => {
      previouslyMutedTabIds.clear();
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        if (tab.mutedInfo?.muted) {
          previouslyMutedTabIds.add(tab.id);
        } else {
          chrome.tabs.update(tab.id, { muted: true });
        }
      }
      sendResponse(true);
    });
    return true;
  }

  if (message.type === 'UNMUTE_ALL_TABS') {
    chrome.tabs.query({}).then(tabs => {
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        if (!previouslyMutedTabIds.has(tab.id)) {
          chrome.tabs.update(tab.id, { muted: false });
        }
      }
      previouslyMutedTabIds.clear();
      sendResponse(true);
    });
    return true;
  }
});
} catch {}

async function handleBgAction(action: any): Promise<ActionResult> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = action.targetTabId || tabs[0]?.id;

    if (action.action === 'list_tabs') {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      const tabList = allTabs.map(t => `[Tab ${t.id}] ${t.title || 'Untitled'} - ${t.url || ''}`).join('\n');
      return {
        success: true,
        status: 'SUCCESS',
        message: `Found ${allTabs.length} open tab(s).`,
        data: tabList,
      };
    }

    if (action.action === 'switch_tab' && action.tab_id) {
      await chrome.tabs.update(action.tab_id, { active: true });
      return {
        success: true,
        status: 'SUCCESS',
        message: `Switched to Tab [${action.tab_id}]`,
        verification: { tabChanged: true },
      };
    }

    if (action.action === 'close_tab') {
      const targetId = action.tab_id || tabId;
      if (targetId) {
        await chrome.tabs.remove(targetId);
        return {
          success: true,
          status: 'SUCCESS',
          message: `Closed Tab [${targetId}]`,
        };
      }
    }

    if (action.action === 'new_tab') {
      let url = action.url;
      if (url && !url.startsWith('http')) url = 'https://' + url;
      const createdTab = await chrome.tabs.create({ url: url || 'chrome://newtab' });
      return {
        success: true,
        status: 'SUCCESS',
        message: `Opened new tab: ${url || 'New Tab'}`,
        data: { tabId: createdTab.id },
        verification: { tabChanged: true },
      };
    }

    if (!tabId) {
      return {
        success: false,
        status: 'FAILED',
        message: 'No active browser tab found to execute action on.',
      };
    }

    if (action.action === 'navigate') {
      let url = action.url;
      if (!url.startsWith('http')) url = 'https://' + url;
      
      const currentTab = await chrome.tabs.get(tabId).catch(() => null);
      const initialUrl = currentTab?.url || '';

      // Direct Chrome tab update
      await chrome.tabs.update(tabId, { url });

      // Fast-path navigation: do not block for full DOM completion and mutation observers
      if (action.fastPath) {
        return {
          success: true,
          status: 'SUCCESS',
          message: `Navigation initiated to ${url}`,
          verification: {
            urlChanged: true,
            currentUrl: url,
          },
        };
      }
      
      // Standard navigation for autonomous agent: bounded wait (2500ms max instead of 12000ms)
      const navigationSuccess = await new Promise<boolean>((resolve) => {
        let settled = false;
        const listener = (uTabId: number, info: any) => {
          if (uTabId === tabId && info.status === 'complete') {
            if (settled) return;
            settled = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(true);
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          if (!settled) {
            settled = true;
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(false);
          }
        }, 2500);
      });

      const updatedTab = await chrome.tabs.get(tabId).catch(() => null);
      const finalUrl = updatedTab?.url || url;
      const urlChanged = finalUrl !== initialUrl || navigationSuccess;

      return {
        success: urlChanged || navigationSuccess,
        status: navigationSuccess ? 'SUCCESS' : (urlChanged ? 'PARTIAL' : 'TIMED_OUT'),
        message: navigationSuccess
          ? `Successfully navigated to ${finalUrl}`
          : `Navigation initiated to ${finalUrl}`,
        verification: {
          urlChanged: true,
          currentUrl: finalUrl,
        },
      };
    }

    if (action.action === 'go_back') {
      await chrome.tabs.goBack(tabId).catch(() => {});
      await new Promise(r => setTimeout(r, 300));
      const updatedTab = await chrome.tabs.get(tabId).catch(() => null);
      return {
        success: true,
        status: 'SUCCESS',
        message: 'Navigated back in browser history',
        verification: {
          urlChanged: true,
          currentUrl: updatedTab?.url,
        },
      };
    }

    if (action.action === 'go_forward') {
      await chrome.tabs.goForward(tabId).catch(() => {});
      await new Promise(r => setTimeout(r, 300));
      const updatedTab = await chrome.tabs.get(tabId).catch(() => null);
      return {
        success: true,
        status: 'SUCCESS',
        message: 'Navigated forward in browser history',
        verification: {
          urlChanged: true,
          currentUrl: updatedTab?.url,
        },
      };
    }

    if (action.action === 'reload') {
      await chrome.tabs.reload(tabId);
      return {
        success: true,
        status: 'SUCCESS',
        message: 'Reloaded current page',
      };
    }

    if (action.action === 'switch_tab_relative') {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      if (allTabs.length <= 1) {
        return {
          success: true,
          status: 'SUCCESS',
          message: 'Only one tab open in this window',
        };
      }
      const currentIndex = allTabs.findIndex(t => t.id === tabId);
      let nextIndex = 0;
      if (action.direction === 'next') {
        nextIndex = (currentIndex + 1) % allTabs.length;
      } else {
        nextIndex = (currentIndex - 1 + allTabs.length) % allTabs.length;
      }
      const target = allTabs[nextIndex];
      if (target?.id) {
        await chrome.tabs.update(target.id, { active: true });
        return {
          success: true,
          status: 'SUCCESS',
          message: `Switched to tab: ${target.title || target.id}`,
          verification: { tabChanged: true },
        };
      }
    }

    return {
      success: false,
      status: 'FAILED',
      message: `Unknown background action: ${action.action}`,
    };
  } catch (err: any) {
    console.error('[ANVORA] BG action failed:', err);
    return {
      success: false,
      status: 'FAILED',
      message: err?.message || 'Background action execution failed',
    };
  }
}
