import { useRef, useEffect, useState } from 'react';
import type { FC } from 'react';
import {
  Sparkles,
  User,
  Copy,
  Check,
  Volume2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { Message, LanguageCode } from '../types';
import { LOCALIZED_CONTENT } from '../localization';
import { BrowserActivity } from './BrowserActivity';
import { ActionConfirmation } from './ActionConfirmation';

interface ConversationViewProps {
  messages: Message[];
  onSelectSuggestion: (text: string) => void;
  onConfirmAction: (actionId: string) => void;
  onCancelAction: (actionId: string) => void;
  onPlaySpeech: (text: string) => void;
  isSpeaking: boolean;
  language: LanguageCode;
  isLoading: boolean;
}

export const ConversationView: FC<ConversationViewProps> = ({
  messages,
  onSelectSuggestion,
  onConfirmAction,
  onCancelAction,
  onPlaySpeech,
  isSpeaking,
  language,
  isLoading,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const content = LOCALIZED_CONTENT[language] || LOCALIZED_CONTENT.en;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeechToggle = (msg: Message) => {
    if (activeSpeechId === msg.id && isSpeaking) {
      setActiveSpeechId(null);
    } else {
      setActiveSpeechId(msg.id);
      onPlaySpeech(msg.text);
    }
  };

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3.5 py-2 space-y-3 scroll-smooth min-h-0"
    >
      {messages.length === 0 ? (
        <div className="py-4 px-2 flex flex-col items-center justify-center text-center">
          <div className="relative w-12 h-12 rounded-2xl apple-glass-card flex items-center justify-center mb-2.5 shadow-lg shadow-[#7772E8]/10 ring-1 ring-white/80">
            <div className="absolute top-0 inset-x-2 h-3.5 bg-gradient-to-b from-white/70 to-transparent pointer-events-none rounded-t-2xl" />
            <Sparkles className="w-5 h-5 text-[#7772E8] drop-shadow-xs" />
          </div>

          <h3 className="font-display font-bold text-xs text-[#1D1D26]">
            {content.greeting}
          </h3>
          <p className="text-[11px] text-[#777784] mt-0.5 max-w-xs leading-relaxed">
            {content.subGreeting}
          </p>

          <div className="mt-4 w-full space-y-1.5 text-left">
            <span className="text-[9.5px] font-bold tracking-widest text-[#777784] uppercase px-1">
              Autonomous Directives:
            </span>
            {content.suggestions.map((sug, idx) => (
              <button
                key={idx}
                onClick={() => onSelectSuggestion(sug)}
                className="w-full text-left p-2.5 rounded-xl apple-glass-card hover:border-white transition-all flex items-center justify-between group cursor-pointer"
              >
                <span className="text-[11.5px] font-semibold text-[#1D1D26] group-hover:text-[#524BC0] transition-colors">
                  {sug}
                </span>
                <div className="w-5 h-5 rounded-lg apple-glass-control flex items-center justify-center shrink-0 text-[#777784] group-hover:text-[#7772E8] group-hover:translate-x-0.5 transition-all">
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} transition-all`}
            >
              <div
                className={`flex items-center gap-1.5 mb-1 px-1 text-[10px] text-[#777784] ${
                  isUser ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`flex items-center justify-center w-4.5 h-4.5 rounded-full ${
                    isUser
                      ? 'bg-gradient-to-br from-[#7772E8] to-[#544EC3] text-white shadow-xs ring-1 ring-white/80'
                      : 'apple-glass-card text-[#7772E8] ring-1 ring-white/80 shadow-xs'
                  }`}
                >
                  {isUser ? (
                    <User className="w-2.5 h-2.5" />
                  ) : (
                    <Sparkles className="w-2.5 h-2.5" />
                  )}
                </div>
                <span className="font-bold text-[11px] text-[#1D1D26]/90">
                  {isUser ? 'You' : 'ANVORA'}
                </span>
                <span>·</span>
                <span className="text-[9.5px] text-[#777784] font-mono">{msg.timestamp}</span>
              </div>

              <div
                className={`relative rounded-2xl p-3 text-xs leading-relaxed max-w-[92%] transition-all ${
                  isUser
                    ? 'apple-bubble-user text-[#1D1D26] rounded-tr-xs'
                    : 'apple-bubble-assistant text-[#1D1D26] rounded-tl-xs'
                }`}
              >
                <div className="absolute top-0 inset-x-3 h-[1px] bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none" />

                <div className="whitespace-pre-wrap break-words font-medium text-[#1D1D26]/95 text-[11.5px]">
                  {msg.text}
                </div>

                {msg.activityTimeline && msg.activityTimeline.length > 0 && (
                  <BrowserActivity steps={msg.activityTimeline} />
                )}

                {msg.pendingAction && (
                  <ActionConfirmation
                    action={msg.pendingAction}
                    onConfirm={onConfirmAction}
                    onCancel={onCancelAction}
                    language={language}
                  />
                )}

                {!isUser && (
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/40 text-[9.5px] text-[#777784]">
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-[#7772E8]" />
                      <span className="font-semibold">Synthesis</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSpeechToggle(msg)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg apple-glass-control cursor-pointer transition-colors ${
                          activeSpeechId === msg.id && isSpeaking
                            ? 'text-[#7772E8] bg-[#EAE8FF] font-bold ring-1 ring-[#7772E8]/40'
                            : 'text-[#5D5D70] hover:text-[#1D1D26]'
                        }`}
                        title="Read response aloud"
                      >
                        <Volume2 className="w-2.5 h-2.5" />
                        <span>{msg.audioDuration || 'Listen'}</span>
                      </button>

                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg apple-glass-control cursor-pointer text-[#5D5D70] hover:text-[#1D1D26] transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-emerald-600" />
                            <span className="text-emerald-700 font-bold">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {isLoading && (
        <div className="flex items-start gap-2 text-xs">
          <div className="flex items-center justify-center w-4.5 h-4.5 rounded-full apple-glass-card text-[#7772E8] ring-1 ring-white/80 shadow-xs mt-0.5">
            <Sparkles className="w-2.5 h-2.5 animate-spin text-[#7772E8]" />
          </div>
          <div className="apple-bubble-assistant p-2.5 rounded-2xl rounded-tl-xs flex items-center gap-2 text-[#777784]">
            <span className="w-2 h-2 rounded-full bg-[#7772E8] animate-ping" />
            <span className="text-[11px] font-bold text-[#1D1D26]">
              ANVORA is thinking...
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
