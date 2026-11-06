import { useState, useEffect } from 'react';
import type {
  VoiceState,
  Message,
  WebsiteContextData,
  UserSettings,
  HistoryItem,
} from './types';
import { voiceBridge } from './voiceBridge';
import { tabBridge } from './tabBridge';
import { AnvoraHeader } from './components/AnvoraHeader';
import { WebsiteContextCard } from './components/WebsiteContextCard';
import { ConversationView } from './components/ConversationView';
import { VoiceControl } from './components/VoiceControl';
import { MessageInput } from './components/MessageInput';
import { LanguageSelector } from './components/LanguageSelector';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ConversationHistoryDrawer } from './components/ConversationHistoryDrawer';
import { WorkflowDrawer } from './components/WorkflowDrawer';
import { WorkflowManager } from '../lib/workflow-manager';
import './liquid-glass.css';

export default function App() {
  // Website Context state (live active tab from TabBridge)
  const [currentContext, setCurrentContext] = useState<WebsiteContextData>(() =>
    tabBridge.getCurrentContext()
  );

  // Conversation & History State
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Real Voice Interaction State from VoiceBridge
  const [voiceState, setVoiceState] = useState<VoiceState>(() => voiceBridge.getState());
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string>(() => voiceBridge.getErrorMessage());
  const [recordingDuration, setRecordingDuration] = useState<string>('00:00');

  // Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);
  const [activeWorkflowCount, setActiveWorkflowCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState<UserSettings>({
    language: 'en',
    speechSpeed: 1.0,
    textSize: 'normal',
    highContrast: false,
    spokenResponses: true,
    handsFreeMode: false,
    soundEffects: true,
    geminiModel: 'gemini-3.1-flash-lite',
    geminiApiKey: '',
    groqApiKey: '',
    visionEnabled: true,
    memoryEnabled: true,
  });

  // Connect to VoiceBridge and TabBridge subscriptions
  useEffect(() => {
    const unsubState = voiceBridge.subscribeState((st, err) => {
      setVoiceState(st);
      if (err) setVoiceErrorMessage(err);
      else if (st !== 'error') setVoiceErrorMessage('');
      setIsLoading(st === 'processing');
    });

    const unsubMsg = voiceBridge.subscribeMessage((msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) {
          return prev.map((m) => (m.id === msg.id ? msg : m));
        }
        return [...prev, msg];
      });
    });

    const unsubContext = tabBridge.subscribeContext((ctx) => {
      setCurrentContext(ctx);
    });

    const unsubDuration = voiceBridge.subscribeDuration((_sec, formatted) => {
      setRecordingDuration(formatted);
    });

    return () => {
      unsubState();
      unsubMsg();
      unsubContext();
      unsubDuration();
    };
  }, []);

  // Load existing settings from chrome.storage
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get([
        'agentLanguage', 'speechRate', 'textSize', 'highContrast',
        'geminiModel', 'geminiApiKey', 'groqApiKey', 'visionEnabled', 'memoryEnabled'
      ]).then((data) => {
        const lang = (data.agentLanguage as any) || 'en';
        const rate = typeof data.speechRate === 'number' ? data.speechRate : 1.0;
        const groq = ((data.groqApiKey as string) || '').trim();
        const model = (data.geminiModel as string) || 'gemini-3.1-flash-lite';
        const apiKey = ((data.geminiApiKey as string) || '').trim();

        setSettings((prev) => ({
          ...prev,
          language: lang,
          speechSpeed: rate,
          textSize: (data.textSize as any) || prev.textSize,
          highContrast: data.highContrast === true,
          geminiModel: model,
          geminiApiKey: apiKey,
          groqApiKey: groq,
          visionEnabled: data.visionEnabled !== false,
          memoryEnabled: data.memoryEnabled !== false,
        }));

        voiceBridge.setLanguage(lang);
        voiceBridge.setSpeechRate(rate);
        voiceBridge.setGroqApiKey(groq);
        voiceBridge.setGeminiApiKey(apiKey);
      }).catch(console.warn);

      const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
        if (area === 'local') {
          if (typeof changes.geminiApiKey?.newValue === 'string') {
            voiceBridge.setGeminiApiKey(changes.geminiApiKey.newValue.trim());
          }
          if (typeof changes.groqApiKey?.newValue === 'string') {
            voiceBridge.setGroqApiKey(changes.groqApiKey.newValue.trim());
          }
          if (typeof changes.agentLanguage?.newValue === 'string') {
            voiceBridge.setLanguage(changes.agentLanguage.newValue as any);
          }
          setSettings((prev) => ({
            ...prev,
            geminiApiKey: typeof changes.geminiApiKey?.newValue === 'string' ? changes.geminiApiKey.newValue.trim() : prev.geminiApiKey,
            geminiModel: typeof changes.geminiModel?.newValue === 'string' ? changes.geminiModel.newValue : prev.geminiModel,
            groqApiKey: typeof changes.groqApiKey?.newValue === 'string' ? changes.groqApiKey.newValue.trim() : prev.groqApiKey,
            language: typeof changes.agentLanguage?.newValue === 'string' ? (changes.agentLanguage.newValue as any) : prev.language,
          }));
        }
      };
      chrome.storage.onChanged.addListener(storageListener);
      return () => chrome.storage.onChanged.removeListener(storageListener);
    }
  }, []);

  // Sync settings back to storage and VoiceBridge
  const handleUpdateSettings = (newSet: Partial<UserSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSet };

      if (newSet.language) voiceBridge.setLanguage(newSet.language);
      if (newSet.speechSpeed) voiceBridge.setSpeechRate(newSet.speechSpeed);
      if (newSet.groqApiKey !== undefined) voiceBridge.setGroqApiKey(newSet.groqApiKey.trim());
      if (newSet.geminiApiKey !== undefined) voiceBridge.setGeminiApiKey(newSet.geminiApiKey.trim());

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const payload: Record<string, any> = {
          agentLanguage: updated.language || 'en',
          speechRate: typeof updated.speechSpeed === 'number' ? updated.speechSpeed : 1.0,
          textSize: updated.textSize || 'normal',
          highContrast: Boolean(updated.highContrast),
          geminiModel: updated.geminiModel || 'gemini-3.1-flash-lite',
          geminiApiKey: (updated.geminiApiKey || '').trim(),
          groqApiKey: (updated.groqApiKey || '').trim(),
          visionEnabled: updated.visionEnabled !== false,
          memoryEnabled: updated.memoryEnabled !== false,
        };
        chrome.storage.local.set(payload).catch((err) => {
          console.error('Failed to save settings to chrome.storage.local:', err);
        });
      }
      return updated;
    });
  };

  const handleResetSettings = () => {
    const defaults: UserSettings = {
      language: 'en',
      speechSpeed: 1.0,
      textSize: 'normal',
      highContrast: false,
      spokenResponses: true,
      handsFreeMode: false,
      soundEffects: true,
      geminiModel: 'gemini-3.1-flash-lite',
      geminiApiKey: '',
      groqApiKey: '',
      visionEnabled: true,
      memoryEnabled: true,
    };
    setSettings(defaults);
    voiceBridge.setLanguage('en');
    voiceBridge.setSpeechRate(1.0);
    voiceBridge.setGroqApiKey('');
    voiceBridge.setGeminiApiKey('');
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({
        agentLanguage: 'en',
        speechRate: 1.0,
        textSize: 'normal',
        highContrast: false,
        geminiModel: 'gemini-3.1-flash-lite',
        geminiApiKey: '',
        groqApiKey: '',
        visionEnabled: true,
      }).catch(console.warn);
    }
  };

  // Keyboard shortcut listener (Esc to close drawers)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
        setIsHistoryOpen(false);
        setIsWorkflowOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Subscribe to workflow changes to update active count badge
  useEffect(() => {
    const wm = WorkflowManager.getInstance();
    wm.load().then((wfs) => {
      setActiveWorkflowCount(wfs.filter((w) => w.status === 'active' || w.status === 'running').length);
    });
    const unsub = wm.subscribe((wfs) => {
      setActiveWorkflowCount(wfs.filter((w) => w.status === 'active' || w.status === 'running').length);
    });
    return () => unsub();
  }, []);

  // Send Directive (User Message or Preset Suggestion)
  const handleSendDirective = async (userText: string) => {
    if (!userText.trim()) return;

    voiceBridge.addUserMessage(userText.trim());
    voiceBridge.setState('processing');

    if (voiceBridge.onTranscriptReady) {
      await voiceBridge.onTranscriptReady(userText.trim());
    }
  };

  const handleVoiceTrigger = () => {
    voiceBridge.toggleRecording();
  };

  const handleCancelVoice = () => {
    voiceBridge.cancelRecording();
  };

  const handlePlaySpeech = (text: string) => {
    if (voiceBridge.isSpeaking()) {
      voiceBridge.stopAudio();
    } else {
      voiceBridge.speak(text, settings.language).catch(console.error);
    }
  };

  const handleConfirmAction = (actionId: string) => {
    voiceBridge.confirmAction(actionId);
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.pendingAction && msg.pendingAction.id === actionId) {
          return {
            ...msg,
            pendingAction: { ...msg.pendingAction, status: 'confirmed' },
          };
        }
        return msg;
      })
    );
  };

  const handleCancelAction = (actionId: string) => {
    voiceBridge.cancelAction(actionId);
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.pendingAction && msg.pendingAction.id === actionId) {
          return {
            ...msg,
            pendingAction: { ...msg.pendingAction, status: 'cancelled' },
          };
        }
        return msg;
      })
    );
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleNewConversation = () => {
    if (messages.length > 0) {
      const newHistItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        title: messages[0]?.text.substring(0, 40) || 'Autonomous Browsing Session',
        date: 'Just now',
        timestamp: Date.now(),
        preview: messages[1]?.text.substring(0, 80) || messages[0]?.text || '',
        messageCount: messages.length,
        websiteTitle: currentContext.title,
      };
      setHistory((prev) => [newHistItem, ...prev]);
    }
    setMessages([]);
    voiceBridge.setState('idle');
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setMessages([
      {
        id: `hist-restore-1`,
        role: 'user',
        text: item.title,
        timestamp: item.date,
        language: settings.language,
      },
      {
        id: `hist-restore-2`,
        role: 'assistant',
        text: `Restored conversation archive from ${item.date}:\n\n${item.preview}`,
        timestamp: item.date,
        language: settings.language,
      },
    ]);
  };

  return (
    <div
      className={`h-screen w-full relative text-[#1D1D26] flex flex-col antialiased select-text overflow-hidden ${
        settings.highContrast ? 'contrast-125' : ''
      }`}
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #FAF9FE 0%, #F3F1FA 40%, #EDEAF6 100%)',
      }}
    >
      {/* LAYER 1: Deep ambient caustic light sources for glass refraction */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Primary violet caustic — upper right */}
        <div className="absolute top-[2%] right-[-5%] w-[420px] h-[420px] rounded-full bg-gradient-to-br from-[#7772E8]/30 via-[#C4B5FD]/40 to-transparent blur-3xl ambient-stream-1" />
        {/* Secondary indigo caustic — lower right */}
        <div className="absolute bottom-[5%] right-[0%] w-[380px] h-[380px] rounded-full bg-gradient-to-tl from-[#6366F1]/22 via-[#A78BFA]/30 to-transparent blur-3xl ambient-stream-2" />
        {/* Tertiary soft lavender wash — center left */}
        <div className="absolute top-[25%] left-[-8%] w-[400px] h-[400px] rounded-full bg-gradient-to-br from-[#8B5CF6]/18 via-[#DDD8FE]/45 to-transparent blur-3xl ambient-stream-3" />
        {/* Geometric refraction ring — restored from AI Studio export */}
        <div className="absolute top-[28%] -left-[15%] w-[340px] h-[340px] rounded-full border-[28px] border-[#7772E8]/10 blur-xl" />
        {/* Subtle cyan accent highlight — bottom left */}
        <div className="absolute bottom-[15%] left-[5%] w-[260px] h-[260px] rounded-full bg-gradient-to-tr from-[#67E8F9]/10 via-[#C4B5FD]/15 to-transparent blur-3xl" />
      </div>

      {/* LAYER 2: Floating Translucent Liquid Glass Assistant Panel */}
      <div
        className="relative z-10 flex flex-col w-full h-full overflow-hidden"
        style={{
          background: 'rgba(255, 255, 255, 0.18)',
          backdropFilter: 'blur(28px) saturate(190%)',
          WebkitBackdropFilter: 'blur(28px) saturate(190%)',
          boxShadow: 'inset 1.5px 0 2px 0 rgba(255, 255, 255, 0.75)',
        }}
      >
        <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-white/18 to-transparent pointer-events-none -z-10" />

        {/* 1. Translucent Liquid Glass Header */}
        <AnvoraHeader
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onOpenWorkflows={() => setIsWorkflowOpen(true)}
          historyCount={history.length}
          workflowCount={activeWorkflowCount}
          isConnected={currentContext.connectionState === 'connected'}
        />

        {/* 2. Layered Glass Website Context Card */}
        <WebsiteContextCard currentContext={currentContext} />

        {/* Floating Glass Language Selector Strip */}
        <div className="flex items-center justify-between px-3.5 mb-1 shrink-0">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#777784]/90 pl-1">
            Connected Intelligence
          </span>
          <LanguageSelector
            currentLanguage={settings.language}
            onSelectLanguage={(lang) => handleUpdateSettings({ language: lang })}
          />
        </div>

        {/* 3. Frosted Vitreous Conversation Stream */}
        <ConversationView
          messages={messages}
          onSelectSuggestion={(sug) => handleSendDirective(sug)}
          onConfirmAction={handleConfirmAction}
          onCancelAction={handleCancelAction}
          onPlaySpeech={handlePlaySpeech}
          isSpeaking={voiceState === 'speaking'}
          language={settings.language}
          isLoading={isLoading}
        />

        {/* 4. Centerpiece Physical Liquid Glass Voice Orb */}
        <VoiceControl
          voiceState={voiceState}
          onStateChange={(st) => voiceBridge.setState(st)}
          onVoiceTrigger={handleVoiceTrigger}
          onCancelVoice={handleCancelVoice}
          recordingDuration={recordingDuration}
          language={settings.language}
          errorMessage={voiceErrorMessage}
        />

        {/* 5. Liquid Glass Text Dock */}
        <MessageInput
          onSendMessage={(txt) => handleSendDirective(txt)}
          isLoading={isLoading}
          language={settings.language}
          voiceState={voiceState}
          onVoiceTrigger={handleVoiceTrigger}
        />
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onResetSettings={handleResetSettings}
      />

      {/* Conversation History Drawer */}
      <ConversationHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelectHistoryItem={handleSelectHistoryItem}
        onClearHistory={handleClearHistory}
        onNewConversation={handleNewConversation}
      />

      {/* Phase 7: Workflow Automation Drawer */}
      <WorkflowDrawer
        isOpen={isWorkflowOpen}
        onClose={() => setIsWorkflowOpen(false)}
        activeTabUrl={currentContext.url}
        activeTabTitle={currentContext.title}
        geminiApiKey={settings.geminiApiKey}
        geminiModel={settings.geminiModel}
      />
    </div>
  );
}
