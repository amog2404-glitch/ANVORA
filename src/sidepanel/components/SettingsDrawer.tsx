import { useState, useEffect } from 'react';
import type { FC } from 'react';
import {
  X,
  Sliders,
  Volume2,
  Type,
  Key,
  RotateCcw,
  Sparkles,
  Eye,
  EyeOff,
  Check,
  Brain,
  Trash2,
  Plus,
  Edit3,
  ShieldCheck,
} from 'lucide-react';
import type { UserSettings, UserMemory } from '../types';
import { SUPPORTED_LANGUAGES } from '../localization';
import { MemoryManager } from '../../lib/memory-manager';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onResetSettings: () => void;
}

export const SettingsDrawer: FC<SettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(settings.geminiApiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Phase 6: Memory State
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [newMemoryInput, setNewMemoryInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const memoryManager = MemoryManager.getInstance();

  useEffect(() => {
    setApiKeyInput(settings.geminiApiKey || '');
  }, [settings.geminiApiKey]);

  useEffect(() => {
    if (isOpen) {
      memoryManager.load().then(() => {
        setMemories(memoryManager.getAllMemories());
      });
    }
  }, [isOpen]);

  const handleSaveKey = (val?: string) => {
    const raw = val !== undefined ? val : apiKeyInput;
    const trimmed = raw.trim();
    onUpdateSettings({ geminiApiKey: trimmed });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleToggleMemory = async (enabled: boolean) => {
    onUpdateSettings({ memoryEnabled: enabled });
    await memoryManager.setEnabled(enabled);
  };

  const handleAddMemory = async () => {
    const trimmed = newMemoryInput.trim();
    if (!trimmed) return;
    const added = await memoryManager.addMemory(trimmed, 'preference', 'explicit_user', true);
    if (added) {
      setMemories(memoryManager.getAllMemories());
      setNewMemoryInput('');
    }
  };

  const handleDeleteMemory = async (id: string) => {
    await memoryManager.deleteMemory(id);
    setMemories(memoryManager.getAllMemories());
  };

  const handleSaveEdit = async (id: string) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    await memoryManager.updateMemory(id, trimmed);
    setMemories(memoryManager.getAllMemories());
    setEditingId(null);
    setEditingText('');
  };

  const handleClearAll = async () => {
    await memoryManager.clearAllMemories();
    setMemories([]);
    setConfirmClear(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#1D1D26]/30 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-xs h-full apple-glass-sheet flex flex-col z-10 animate-in slide-in-from-right duration-250">
        <div className="absolute top-0 bottom-0 left-0 w-[1.5px] bg-gradient-to-b from-white/90 via-white/40 to-white/90 pointer-events-none" />

        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg apple-glass-control flex items-center justify-center text-[#7772E8]">
              <Sliders className="w-3.5 h-3.5" />
            </div>
            <h2 className="font-display font-bold text-sm text-[#1D1D26]">
              Assistant Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl apple-glass-control flex items-center justify-center text-[#777784] hover:text-[#1D1D26] cursor-pointer"
            title="Close Settings"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#777784] flex items-center gap-1.5">
              <span>Assistant Language</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = settings.language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => onUpdateSettings({ language: lang.code })}
                    className={`p-2 rounded-xl text-center transition-all cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white font-bold shadow-xs ring-1 ring-white/60'
                        : 'apple-glass-card text-[#5D5D70] hover:text-[#1D1D26]'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{lang.nativeName}</div>
                    <div className="text-[9px] opacity-80">{lang.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/40">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#777784] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#7772E8]" />
              <span>Gemini AI Engine</span>
            </label>
            <div className="space-y-2">
              <div>
                <label className="text-[10.5px] text-[#5D5D70] font-medium block mb-1">Model</label>
                <select
                  value={settings.geminiModel || 'gemini-3.1-flash-lite'}
                  onChange={(e) => onUpdateSettings({ geminiModel: e.target.value })}
                  className="w-full apple-glass-card p-2 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60"
                >
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
                  <option value="gemini-3.0-pro">gemini-3.0-pro (Reasoning)</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10.5px] text-[#5D5D70] font-medium flex items-center gap-1">
                    <Key className="w-2.5 h-2.5 text-[#7772E8]" />
                    <span>Gemini API Key</span>
                  </label>
                  {settings.geminiApiKey ? (
                    <span className="text-[9.5px] text-emerald-600 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Configured
                    </span>
                  ) : (
                    <span className="text-[9.5px] text-amber-600 font-medium">
                      Key Required
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="AIzaSy..."
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      onUpdateSettings({ geminiApiKey: e.target.value.trim() });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveKey();
                      }
                    }}
                    onBlur={() => handleSaveKey()}
                    className="w-full apple-glass-card py-2 pl-2.5 pr-18 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60 font-mono tracking-wider"
                  />
                  <div className="absolute right-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="p-1 text-[#777784] hover:text-[#1D1D26] transition-colors cursor-pointer"
                      title={showKey ? 'Hide API key' : 'Show API key'}
                    >
                      {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveKey()}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 font-bold'
                          : 'bg-[#7772E8]/15 hover:bg-[#7772E8]/25 text-[#544EC3]'
                      }`}
                    >
                      {isSaved ? (
                        <>
                          <Check className="w-2.5 h-2.5" />
                          <span>Saved</span>
                        </>
                      ) : (
                        <span>Save</span>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[9.5px] text-[#777784] mt-1 px-0.5">
                  <span>Press Enter to save</span>
                  {isSaved && <span className="text-emerald-600 font-medium">Saved to storage</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Phase 6: Memory & Personalization Section */}
          <div className="space-y-2.5 pt-2 border-t border-white/40">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#777784] flex items-center gap-1.5">
                <Brain className="w-3 h-3 text-[#7772E8]" />
                <span>Memory & Personalization</span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[#5D5D70]">
                  {settings.memoryEnabled !== false ? 'Active' : 'Disabled'}
                </span>
                <input
                  type="checkbox"
                  checked={settings.memoryEnabled !== false}
                  onChange={(e) => handleToggleMemory(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[#7772E8] cursor-pointer"
                />
              </div>
            </div>

            <p className="text-[10px] text-[#777784] leading-relaxed flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>ANVORA remembers user preferences and workflow habits locally. API keys, credentials, and passwords are never remembered.</span>
            </p>

            {settings.memoryEnabled !== false && (
              <div className="space-y-2 mt-2">
                {/* Add new memory */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. Prefers bullet points..."
                    value={newMemoryInput}
                    onChange={(e) => setNewMemoryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddMemory();
                      }
                    }}
                    className="flex-1 apple-glass-card py-1.5 px-2.5 rounded-xl text-xs text-[#1D1D26] outline-hidden border border-white/60 placeholder:text-[#9D9DA8]"
                  />
                  <button
                    type="button"
                    onClick={handleAddMemory}
                    disabled={!newMemoryInput.trim()}
                    className="p-1.5 rounded-xl apple-glass-control text-[#7772E8] hover:text-[#544EC3] disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title="Add Memory"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Stored memories list */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {memories.length === 0 ? (
                    <div className="p-2 rounded-xl apple-glass-card border border-white/40 text-center text-[10.5px] text-[#777784]">
                      No memories stored yet. Tell ANVORA &quot;remember that...&quot; or add one above.
                    </div>
                  ) : (
                    memories.map((m) => (
                      <div
                        key={m.id}
                        className="p-2 rounded-xl apple-glass-card border border-white/60 space-y-1 group transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[8.5px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md ${
                            m.category === 'preference'
                              ? 'bg-[#7772E8]/15 text-[#544EC3]'
                              : m.category === 'frequent_site'
                              ? 'bg-blue-500/15 text-blue-700'
                              : 'bg-emerald-500/15 text-emerald-700'
                          }`}>
                            {m.category.replace('_', ' ')}
                          </span>
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            {editingId === m.id ? (
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(m.id)}
                                className="p-0.5 text-emerald-600 hover:text-emerald-700 cursor-pointer"
                                title="Save"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(m.id);
                                  setEditingText(m.content);
                                }}
                                className="p-0.5 text-[#777784] hover:text-[#1D1D26] cursor-pointer"
                                title="Edit"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteMemory(m.id)}
                              className="p-0.5 text-[#777784] hover:text-red-600 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {editingId === m.id ? (
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveEdit(m.id);
                              }
                            }}
                            className="w-full text-[11px] p-1 rounded-lg border border-[#7772E8]/60 bg-white/70 text-[#1D1D26] outline-hidden"
                            autoFocus
                          />
                        ) : (
                          <p className="text-[11px] text-[#1D1D26] leading-snug">
                            {m.content}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Clear all memories button */}
                {memories.length > 0 && (
                  <div className="pt-1 flex justify-end">
                    {confirmClear ? (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-red-600 font-medium">Clear all?</span>
                        <button
                          type="button"
                          onClick={handleClearAll}
                          className="px-2 py-0.5 rounded-lg bg-red-600 text-white font-semibold cursor-pointer"
                        >
                          Yes, Clear
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClear(false)}
                          className="px-1.5 py-0.5 rounded-lg apple-glass-control text-[#5D5D70] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmClear(true)}
                        className="text-[10px] text-[#777784] hover:text-red-600 transition-colors cursor-pointer"
                      >
                        Clear All Memories
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-white/40">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-[#777784] flex items-center gap-1.5">
                <Volume2 className="w-3 h-3 text-[#7772E8]" />
                <span>Speech Speed</span>
              </label>
              <span className="text-[11px] font-mono font-bold text-[#7772E8]">
                {settings.speechSpeed.toFixed(1)}x
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.1"
              value={settings.speechSpeed}
              onChange={(e) => onUpdateSettings({ speechSpeed: parseFloat(e.target.value) })}
              className="w-full accent-[#7772E8] cursor-pointer"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-white/40">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#777784] flex items-center gap-1.5">
              <Type className="w-3 h-3 text-[#7772E8]" />
              <span>Text Size</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['normal', 'medium', 'large'] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => onUpdateSettings({ textSize: sz })}
                  className={`py-1.5 rounded-xl capitalize text-[11px] transition-all cursor-pointer ${
                    settings.textSize === sz
                      ? 'bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white font-bold shadow-xs'
                      : 'apple-glass-card text-[#5D5D70] hover:text-[#1D1D26]'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-white/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#1D1D26]">High Contrast Mode</span>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => onUpdateSettings({ highContrast: e.target.checked })}
                className="w-4 h-4 accent-[#7772E8] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#1D1D26]">Spoken Responses (TTS)</span>
              <input
                type="checkbox"
                checked={settings.spokenResponses}
                onChange={(e) => onUpdateSettings({ spokenResponses: e.target.checked })}
                className="w-4 h-4 accent-[#7772E8] cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-white/40">
          <button
            onClick={onResetSettings}
            className="w-full py-2 rounded-xl apple-glass-control text-[11px] font-semibold text-[#777784] hover:text-[#1D1D26] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset to Defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
};
