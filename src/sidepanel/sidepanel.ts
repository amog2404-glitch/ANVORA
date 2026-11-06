// src/sidepanel/sidepanel.ts
import { AgentManager } from '../lib/agent-manager';
import type { StateSnapshot } from '../lib/agent-manager';
import { logger } from '../lib/logger';
import { stopAudio, configureSpeaker, isAudioPlaying } from '../lib/speaker';
import { callGemini } from '../lib/litellm-client';
import { fetchUserLocation } from '../lib/ip-location';
import { voiceBridge } from './voiceBridge';
import { tabBridge } from './tabBridge';
import type { LanguageCode } from './types';
import SiriWave from 'siriwave';

let geminiModel = 'gemini-3.1-flash-lite';
let geminiApiKey = '';
let groqApiKey = '';
let visionEnabled = true;
let agentLanguage = 'en';
let speechRate = 1.0;
let textSize = 'normal';
let highContrast = false;

const indicator = document.getElementById('mic-indicator')!;
const stateText = document.getElementById('agent-state')!;
const chatLog = document.getElementById('chat-log')!;
const debugLog = document.getElementById('debug-log')!;
const resetBtn = document.getElementById('reset-btn')!;
const debugBtn = document.getElementById('debug-btn')!;
const settingsBtn = document.getElementById('settings-btn')!;
const settingsView = document.getElementById('settings-view')!;

let siriWave: any = null;
let greetingAbortController: AbortController | null = new AbortController();

setTimeout(() => {
  siriWave = new SiriWave({
    container: document.getElementById('siri-wave-mount')!,
    width: 70,
    height: 90,
    style: 'ios9',
    speed: 0.08,
    amplitude: 0.5,
    frequency: 6,
    color: '#ffffff',
    autostart: true
  });
}, 100);

let waveTargetAmp = 0.5;
let waveTargetSpeed = 0.08;
let currentScale = 1;

voiceBridge.subscribeAudioData((_frequencies, volumeLevel) => {
  if (siriWave && indicator.dataset.state === 'listening') {
    const rawAmp = volumeLevel > 0.01 ? volumeLevel * 15 : 0.5;
    waveTargetAmp = Math.min(rawAmp, 5);
    const rawSpeed = volumeLevel > 0.05 ? volumeLevel * 8 : 0.15;
    waveTargetSpeed = Math.min(rawSpeed, 2);
    const rawScale = 1 + (volumeLevel * 0.2);
    currentScale = Math.min(rawScale, 1.2);
  }
});

voiceBridge.subscribeState((st, errMsg) => {
  indicator.dataset.state = st;
  if (st === 'listening') {
    stateText.textContent = "I'm listening...";
  } else if (st === 'processing') {
    stateText.textContent = 'Understanding your request...';
  } else if (st === 'speaking') {
    stateText.textContent = 'ANVORA is speaking...';
  } else if (st === 'error') {
    stateText.textContent = errMsg ? `Error: ${errMsg}` : 'Error';
  } else {
    stateText.textContent = 'ANVORA is ready (Ctrl+Space)';
  }
});

const waveLoop = () => {
  if (siriWave) {
    const state = indicator.dataset.state || 'idle';
    let targetScale = 1;
    
    if (state === 'idle') {
      waveTargetAmp = 0.5;
      waveTargetSpeed = 0.08;
      targetScale = 1;
    } else if (state === 'listening') {
      targetScale = currentScale;
    } else {
      // Responding / Processing / Speaking
      const time = Date.now() / 300;
      const simVol = 0.5 + Math.sin(time) * 0.3;
      waveTargetAmp = simVol * 4;
      waveTargetSpeed = simVol * 3;
      targetScale = 1 + (simVol * 0.1);
    }
    
    currentScale += (targetScale - currentScale) * 0.1;
    indicator.style.transform = `scale(${currentScale})`;
    
    siriWave.setAmplitude(siriWave.amplitude + (waveTargetAmp - siriWave.amplitude) * 0.1);
    siriWave.setSpeed(siriWave.speed + (waveTargetSpeed - siriWave.speed) * 0.1);
  }
  requestAnimationFrame(waveLoop);
};
requestAnimationFrame(waveLoop);

const agentLanguageSelect = document.getElementById('agent-language') as HTMLSelectElement;
const geminiModelSelect = document.getElementById('gemini-model') as HTMLSelectElement;
const geminiApiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
const groqApiKeyInput = document.getElementById('groq-api-key') as HTMLInputElement;
const visionToggle = document.getElementById('vision-toggle') as HTMLInputElement;
const rateLimitToggle = document.getElementById('rate-limit-toggle') as HTMLInputElement;
const rateLimitDurationInput = document.getElementById('rate-limit-duration') as HTMLInputElement;
const speechRateInput = document.getElementById('speech-rate') as HTMLInputElement;
const speechRateVal = document.getElementById('speech-rate-val') as HTMLElement;
const textSizeSelect = document.getElementById('text-size-select') as HTMLSelectElement;
const highContrastToggle = document.getElementById('high-contrast-toggle') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
const exportDataBtn = document.getElementById('export-data-btn') as HTMLButtonElement;
const saveStatus = document.getElementById('save-status')!;

let isDebugVisible = false;
let isSettingsVisible = false;

speechRateInput?.addEventListener('input', () => {
  if (speechRateVal) {
    speechRateVal.textContent = `${parseFloat(speechRateInput.value).toFixed(1)}x`;
  }
});

debugBtn.addEventListener('click', () => {
  isDebugVisible = !isDebugVisible;
  if (isDebugVisible) {
    debugLog.classList.add('active');
    debugBtn.style.color = 'var(--text-color)';
    debugLog.scrollTop = debugLog.scrollHeight;
    
    isSettingsVisible = false;
    settingsView.classList.remove('active');
    settingsBtn.style.color = 'var(--text-muted)';
  } else {
    debugLog.classList.remove('active');
    debugBtn.style.color = 'var(--text-muted)';
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});

settingsBtn.addEventListener('click', () => {
  isSettingsVisible = !isSettingsVisible;
  if (isSettingsVisible) {
    settingsView.classList.add('active');
    settingsBtn.style.color = 'var(--text-color)';
    
    setTimeout(() => geminiModelSelect.focus(), 100);
    
    isDebugVisible = false;
    debugLog.classList.remove('active');
    debugBtn.style.color = 'var(--text-muted)';
  } else {
    settingsView.classList.remove('active');
    settingsBtn.style.color = 'var(--text-muted)';
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});

document.getElementById('close-settings-btn')?.addEventListener('click', () => {
  isSettingsVisible = false;
  settingsView.classList.remove('active');
  settingsBtn.style.color = 'var(--text-muted)';
  chatLog.scrollTop = chatLog.scrollHeight;
});

document.getElementById('close-debug-btn')?.addEventListener('click', () => {
  isDebugVisible = false;
  debugLog.classList.remove('active');
  debugBtn.style.color = 'var(--text-muted)';
  chatLog.scrollTop = chatLog.scrollHeight;
});

window.addEventListener('agent-log', (e: any) => {
  const entry = e.detail;
  const div = document.createElement('div');
  div.className = `log-entry ${entry.level}`;
  
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const dataStr = entry.data ? `\n${JSON.stringify(entry.data, null, 2)}` : '';
  
  div.innerHTML = `<span class="log-meta">[${time}] [${entry.level.toUpperCase()}] [${entry.component}]</span> ${entry.message} <pre style="margin:2px 0 0 0;font-size:10px;">${dataStr}</pre>`;
  
  debugLog.appendChild(div);
  
  if (isDebugVisible) {
    debugLog.scrollTop = debugLog.scrollHeight;
  }
});

resetBtn.addEventListener('click', async () => {
  stopAudio();
  voiceBridge.stopAudio();
  voiceBridge.stopRecording();
  voiceBridge.setState('idle');
  chatLog.innerHTML = `
    <div id="welcome-card" class="message agent">
      <div class="message-header">ANVORA</div>
      <div class="message-body">
        Hello! I'm <strong>ANVORA</strong>, your autonomous browsing assistant. Press <strong>Ctrl+Space</strong> or click the orb below to speak.
      </div>
    </div>
  `;
  await agent.clearHistory();
});

const agent = new AgentManager();
let userLocation: any = null;

// Asynchronously fetch user location in background without blocking settings or agent initialization
fetchUserLocation().then((loc) => {
  userLocation = loc;
  if (agent) {
    const bgCtx = { 
      name: '', role: '', preferences: [], shortcuts: {}, frequentSites: [], location: userLocation, 
      language: agentLanguage 
    };
    agent.configure({ 
      geminiModel, geminiApiKey: geminiApiKey.trim(), visionEnabled, rateLimitEnabled, rateLimitDurationMs 
    }, bgCtx).catch(() => {});
  }
}).catch(() => {});

let rateLimitEnabled = false;
let rateLimitDurationMs = 0;

function applyAccessibilitySettings() {
  document.body.classList.toggle('high-contrast', highContrast);
  document.body.classList.remove('text-large', 'text-xlarge');
  if (textSize === 'large') document.body.classList.add('text-large');
  if (textSize === 'xlarge') document.body.classList.add('text-xlarge');
  configureSpeaker({ language: agentLanguage, speechRate });
}

async function loadSettings() {
  const data = await chrome.storage.local.get([
    'geminiModel', 'geminiApiKey', 'groqApiKey', 'visionEnabled', 
    'rateLimitEnabled', 'rateLimitDurationMs', 'agentLanguage', 
    'speechRate', 'textSize', 'highContrast'
  ]);

  geminiModel = (data.geminiModel as string) || 'gemini-3.1-flash-lite';
  geminiApiKey = ((data.geminiApiKey as string) || '').trim();
  groqApiKey = ((data.groqApiKey as string) || '').trim();
  visionEnabled = data.visionEnabled !== false;
  rateLimitEnabled = data.rateLimitEnabled === true;
  rateLimitDurationMs = data.rateLimitDurationMs !== undefined ? (data.rateLimitDurationMs as number) : 0;
  agentLanguage = (data.agentLanguage as string) || 'en';
  speechRate = typeof data.speechRate === 'number' ? data.speechRate : 1.0;
  textSize = (data.textSize as string) || 'normal';
  highContrast = data.highContrast === true;

  if (agentLanguageSelect) agentLanguageSelect.value = agentLanguage;
  if (geminiModelSelect) geminiModelSelect.value = geminiModel;
  if (geminiApiKeyInput) geminiApiKeyInput.value = geminiApiKey;
  if (groqApiKeyInput) groqApiKeyInput.value = groqApiKey;
  if (visionToggle) visionToggle.checked = visionEnabled;
  if (rateLimitToggle) rateLimitToggle.checked = rateLimitEnabled;
  if (rateLimitDurationInput) rateLimitDurationInput.value = rateLimitDurationMs.toString();
  if (speechRateInput) speechRateInput.value = speechRate.toString();
  if (speechRateVal) speechRateVal.textContent = `${speechRate.toFixed(1)}x`;
  if (textSizeSelect) textSizeSelect.value = textSize;
  if (highContrastToggle) highContrastToggle.checked = highContrast;

  applyAccessibilitySettings();

  // Synchronize settings with VoiceBridge
  voiceBridge.setLanguage(agentLanguage as LanguageCode);
  voiceBridge.setSpeechRate(speechRate);
  voiceBridge.setGroqApiKey(groqApiKey);

  const bgCtx = { 
    name: '', role: '', preferences: [], shortcuts: {}, frequentSites: [], location: userLocation, 
    language: agentLanguage 
  };
  await agent.configure({ 
    geminiModel, geminiApiKey, visionEnabled, rateLimitEnabled, rateLimitDurationMs 
  }, bgCtx);
  logger.info('SidePanel', 'Agent configured on startup', { 
    model: geminiModel, hasKey: Boolean(geminiApiKey) 
  });
}

await loadSettings();

saveSettingsBtn.addEventListener('click', async () => {
  geminiModel = geminiModelSelect.value;
  geminiApiKey = geminiApiKeyInput.value.trim();
  groqApiKey = groqApiKeyInput.value.trim();
  visionEnabled = visionToggle.checked;
  rateLimitEnabled = rateLimitToggle.checked;
  rateLimitDurationMs = parseInt(rateLimitDurationInput.value, 10) || 0;
  if (agentLanguageSelect) agentLanguage = agentLanguageSelect.value;
  if (speechRateInput) speechRate = parseFloat(speechRateInput.value) || 1.0;
  if (textSizeSelect) textSize = textSizeSelect.value;
  if (highContrastToggle) highContrast = highContrastToggle.checked;

  await chrome.storage.local.set({
    geminiModel, geminiApiKey, groqApiKey, visionEnabled, rateLimitEnabled, rateLimitDurationMs,
    agentLanguage, speechRate, textSize, highContrast
  });

  applyAccessibilitySettings();

  // Synchronize settings with VoiceBridge
  voiceBridge.setLanguage(agentLanguage as LanguageCode);
  voiceBridge.setSpeechRate(speechRate);
  voiceBridge.setGroqApiKey(groqApiKey);

  const bgCtx = { 
    name: '', role: '', preferences: [], shortcuts: {}, frequentSites: [], location: userLocation, 
    language: agentLanguage 
  };
  await agent.configure({ 
    geminiModel, geminiApiKey, visionEnabled, rateLimitEnabled, rateLimitDurationMs 
  }, bgCtx);

  saveStatus.textContent = 'Settings saved!';
  setTimeout(() => saveStatus.textContent = '', 2000);
});

chrome.storage.onChanged.addListener(async (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
  if (areaName === 'local') {
    let reconfigureNeeded = false;

    if (typeof changes.agentLanguage?.newValue === 'string') {
      agentLanguage = changes.agentLanguage.newValue;
      voiceBridge.setLanguage(agentLanguage as LanguageCode);
      reconfigureNeeded = true;
    }
    if (typeof changes.speechRate?.newValue === 'number') {
      speechRate = changes.speechRate.newValue;
      voiceBridge.setSpeechRate(speechRate);
    }
    if (typeof changes.groqApiKey?.newValue === 'string') {
      groqApiKey = changes.groqApiKey.newValue.trim();
      voiceBridge.setGroqApiKey(groqApiKey);
    }
    if (typeof changes.geminiModel?.newValue === 'string') {
      geminiModel = changes.geminiModel.newValue;
      if (geminiModelSelect) geminiModelSelect.value = geminiModel;
      reconfigureNeeded = true;
    }
    if (typeof changes.geminiApiKey?.newValue === 'string') {
      geminiApiKey = changes.geminiApiKey.newValue.trim();
      if (geminiApiKeyInput) geminiApiKeyInput.value = geminiApiKey;
      reconfigureNeeded = true;
    }
    if (typeof changes.visionEnabled?.newValue === 'boolean') {
      visionEnabled = changes.visionEnabled.newValue;
      if (visionToggle) visionToggle.checked = visionEnabled;
      reconfigureNeeded = true;
    }
    if (typeof changes.rateLimitEnabled?.newValue === 'boolean') {
      rateLimitEnabled = changes.rateLimitEnabled.newValue;
      reconfigureNeeded = true;
    }
    if (typeof changes.rateLimitDurationMs?.newValue === 'number') {
      rateLimitDurationMs = changes.rateLimitDurationMs.newValue;
      reconfigureNeeded = true;
    }
    if (typeof changes.memoryEnabled?.newValue === 'boolean' || changes.anvora_memory_settings) {
      reconfigureNeeded = true;
    }

    if (reconfigureNeeded) {
      const bgCtx = { 
        name: '', role: '', preferences: [], shortcuts: {}, frequentSites: [], location: userLocation, 
        language: agentLanguage 
      };
      await agent.configure({ 
        geminiModel, geminiApiKey, visionEnabled, rateLimitEnabled, rateLimitDurationMs 
      }, bgCtx);
      logger.info('SidePanel', 'Agent dynamically reconfigured from storage change', { 
        model: geminiModel, hasKey: Boolean(geminiApiKey) 
      });
    }
  }
});

exportDataBtn.addEventListener('click', async () => {
  const localData = await chrome.storage.local.get(null);
  const sessionData = await chrome.storage.session.get(null);
  
  const payload = {
    settings: {
      geminiModel: localData.geminiModel,
      visionEnabled: localData.visionEnabled,
      rateLimitEnabled: localData.rateLimitEnabled,
      rateLimitDurationMs: localData.rateLimitDurationMs,
      agentLanguage: localData.agentLanguage,
      speechRate: localData.speechRate,
      textSize: localData.textSize,
      highContrast: localData.highContrast
    },
    userMemories: localData.anvora_user_memories || [],
    longTermMemories: localData.longTermMemories || [],
    chatHistory: sessionData.chatHistory || []
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `anvora-data-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
});

// Configure Agent Callbacks
agent.onStateChange = (snap: StateSnapshot) => {
  let statusText = snap.message;
  if (snap.waitReason) statusText += ` (${snap.waitReason})`;
  if (snap.stepCount > 0) statusText += ` [Step ${snap.stepCount}]`;
  if (snap.consecutiveFailures > 0) statusText += ` (Failures: ${snap.consecutiveFailures})`;
  
  stateText.textContent = statusText;
  indicator.dataset.state = snap.state.toLowerCase();

  // Synchronize state with voiceBridge, avoiding premature overwrites of speaking or listening
  if (snap.state === 'IDLE' || snap.state === 'COMPLETE' || snap.state === 'WAITING_FOR_REPLY') {
    if (voiceBridge.getState() === 'processing' && !voiceBridge.isSpeaking() && !isAudioPlaying()) {
      voiceBridge.setState('idle');
    }
  } else if (
    snap.state === 'CLASSIFYING' ||
    snap.state === 'PLANNING' ||
    snap.state === 'EXECUTING' ||
    snap.state === 'RESPONDING' ||
    snap.state === 'REPLANNING' ||
    snap.state === 'RECOVERING' ||
    snap.state === 'WAITING_FOR_WORKER'
  ) {
    if (!voiceBridge.isSpeaking() && !isAudioPlaying() && !voiceBridge.isMicActive()) {
      voiceBridge.setState('processing');
    }
  }
};

agent.onSpeak = (text: string) => {
  appendLog('Agent', text);
  // Emit assistant response to React conversation feed
  voiceBridge.addAssistantMessage(text);
  // Authoritative speech synthesis with active language and speech rate
  voiceBridge.speak(text, agentLanguage).catch((err) => {
    logger.warn('SidePanel', 'Speech synthesis error in onSpeak', err);
  });
};

// Wire task progress updates from AgentManager to React Liquid Glass UI
agent.onProgressUpdate = (steps, pendingAction, text) => {
  voiceBridge.updateCurrentTimeline(steps, pendingAction, text);
};

// Wire UI confirmation / cancellation buttons to AgentManager
voiceBridge.onConfirmAction = async (actionId) => {
  await agent.confirmPendingAction(actionId);
};

voiceBridge.onCancelAction = (actionId) => {
  agent.cancelPendingAction(actionId);
};

// Wire VoiceBridge transcript events directly to AgentManager
voiceBridge.onTranscriptReady = async (transcript: string) => {
  if (!transcript || !transcript.trim()) return;

  if (greetingAbortController) {
    greetingAbortController.abort();
    greetingAbortController = null;
  }

  logger.info('SidePanel', 'Dispatching transcript from VoiceBridge to AgentManager', { transcript });
  try {
    appendLog('User', transcript);
    await agent.handleTranscript(transcript);
  } catch (err) {
    logger.error('SidePanel', 'Error handling transcript in AgentManager', err);
    voiceBridge.setState('error', 'Error executing request.');
  }
};

async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts?.[0]?.js;
    if (contentScripts && contentScripts.length > 0) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: contentScripts
      });
      await new Promise(r => setTimeout(r, 120));
      return true;
    }
  } catch (err) {
    logger.warn('SidePanel', 'Dynamic script injection failed', err);
  }
  return false;
}

agent.onGetContext = async (boundTabId?: number | null) => {
  return tabBridge.getContextForAgent(boundTabId);
};

agent.onGetScreenshot = async () => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const windowId = tabs[0]?.windowId;
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 50 });
    return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  } catch (err) {
    console.warn('Screenshot capture failed:', err);
    return null;
  }
};

agent.onExecuteAction = async (action: any) => {
  let actionText = '';
  switch (action.action) {
    case 'navigate': actionText = `Navigating to ${action.url}`; break;
    case 'click': actionText = `Clicking element [${action.target_id || ''}]`; break;
    case 'type': actionText = `Typing "${action.text || ''}"`; break;
    case 'extract': actionText = `Extracting page content`; break;
    case 'scroll_down': actionText = `Scrolling down`; break;
    case 'scroll_up': actionText = `Scrolling up`; break;
    case 'scroll': actionText = `Scrolling page`; break;
    case 'wait': actionText = `Waiting for page settle`; break;
    case 'go_back': actionText = `Going back`; break;
    case 'go_forward': actionText = `Going forward`; break;
    case 'reload': actionText = `Reloading page`; break;
    case 'switch_tab': actionText = `Switching tab`; break;
    case 'close_tab': actionText = `Closing tab`; break;
    default: actionText = `Executing: ${action.action}`; break;
  }
  appendLog('Action', actionText);

  if (action.action === 'wait') {
    await new Promise(resolve => setTimeout(resolve, 2500));
    return {
      success: true,
      status: 'SUCCESS',
      message: 'Waited for page settle',
    };
  }

  const bgActions = ['navigate', 'go_back', 'go_forward', 'reload', 'switch_tab_relative', 'list_tabs', 'switch_tab', 'close_tab', 'new_tab'];
  if (bgActions.includes(action.action)) {
    if (action.targetTabId && action.action !== 'new_tab' && action.action !== 'list_tabs') {
      const tabExists = await chrome.tabs.get(action.targetTabId).catch(() => null);
      if (!tabExists) {
        return {
          success: false,
          status: 'FAILED',
          message: `Task-bound tab [${action.targetTabId}] was closed or is unavailable.`,
        };
      }
    }
    const result = await chrome.runtime.sendMessage({ type: 'EXECUTE_BG_ACTION', action });
    // Trigger context refresh after navigation or tab action
    setTimeout(() => tabBridge.refreshContext(), 350);
    return result || { success: true, status: 'SUCCESS', message: 'Executed background action' };
  } else {
    let tabId = action.targetTabId;
    if (tabId) {
      const tabExists = await chrome.tabs.get(tabId).catch(() => null);
      if (!tabExists) {
        return {
          success: false,
          status: 'FAILED',
          message: `Task-bound tab [${tabId}] was closed or is unavailable.`,
        };
      }
    } else {
      tabId = tabBridge.getActiveTabId();
      if (!tabId) {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tabs[0]?.id || null;
      }
    }
    if (!tabId) {
      return {
        success: false,
        status: 'FAILED',
        message: 'No active tab found to execute action on',
      };
    }

    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', action });
      // Trigger context refresh after DOM interaction to capture new state
      setTimeout(() => tabBridge.refreshContext(), 400);
      return result || { success: true, status: 'SUCCESS', message: 'Executed DOM action' };
    } catch (err: any) {
      if (err.message && err.message.includes('Receiving end does not exist')) {
        logger.info('SidePanel', 'Injecting content script before action retry...', { tabId });
        const injected = await ensureContentScriptInjected(tabId);
        if (injected) {
          try {
            const retryRes = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', action });
            setTimeout(() => tabBridge.refreshContext(), 400);
            return retryRes || { success: true, status: 'SUCCESS', message: 'Executed DOM action after injection' };
          } catch (retryErr) {
            logger.warn('SidePanel', 'Action retry after injection failed', retryErr);
          }
        }
      }
      logger.error('SidePanel', 'Failed to send EXECUTE_ACTION to tab', err);
      return {
        success: false,
        status: 'FAILED',
        message: err?.message || 'Could not communicate with tab content script',
      };
    }
  }
};

chrome.runtime.onMessage.addListener((message: any) => {
  if (message.type === 'HOTKEY_PRESSED') {
    toggleRecording();
  }
});

function appendLog(role: string, text: string, isInterim = false) {
  const displayRole = role === 'Agent' ? 'ANVORA' : (role === 'Action' ? '' : role);
  const div = document.createElement('div');
  
  if (role === 'Action') {
    div.className = 'message action';
    div.innerHTML = `<div class="message-body"><i>${text}</i></div>`;
  } else {
    div.className = `message ${role.toLowerCase()} ${isInterim ? 'interim' : ''}`;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = displayRole;
    
    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = text;
    
    div.appendChild(header);
    div.appendChild(body);
  }
  
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

async function toggleRecording() {
  if (greetingAbortController) {
    greetingAbortController.abort();
    greetingAbortController = null;
  }
  await voiceBridge.toggleRecording();
}

indicator?.addEventListener('click', () => {
  toggleRecording().catch(console.error);
});

setTimeout(async () => {
  if (greetingAbortController?.signal.aborted) return;
  try {
    const ctx = await agent.onGetContext?.();
    if (!ctx || !ctx.url || tabBridge.isRestrictedUrl(ctx.url) || greetingAbortController?.signal.aborted) return;
    
    let langPrompt = 'Say a very short, friendly greeting (1 sentence) acknowledging what website they are currently looking at.';
    if (agentLanguage === 'hi') {
      langPrompt += ' Greet concisely in clean conversational Hindi.';
    } else if (agentLanguage === 'te') {
      langPrompt += ' Greet concisely in clean conversational Telugu.';
    }

    const sysPrompt = `You are ANVORA, an intelligent autonomous browser assistant. The user just opened your panel. ${langPrompt} Do not ask how you can help, just say hi and acknowledge the page.`;
    const llmMessages: any = [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: `Current URL: ${ctx.url}\nPage Title: ${ctx.title}` }
    ];
    const greeting = await callGemini(
      llmMessages,
      { geminiModel, geminiApiKey, rateLimitEnabled, rateLimitDurationMs, visionEnabled },
      false,
      greetingAbortController?.signal
    );
    if (greeting && !greetingAbortController?.signal.aborted) {
      agent.onSpeak?.(greeting);
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      console.error('Failed to generate greeting', err);
    }
  } finally {
    greetingAbortController = null;
  }
}, 1000);
