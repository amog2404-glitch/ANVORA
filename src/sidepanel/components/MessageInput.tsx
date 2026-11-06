import { useState, useRef, useEffect } from 'react';
import type { FC, KeyboardEvent } from 'react';
import { ArrowUp, CornerDownLeft, Mic, Square } from 'lucide-react';
import type { LanguageCode, VoiceState } from '../types';
import { LOCALIZED_CONTENT } from '../localization';

interface MessageInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  language: LanguageCode;
  voiceState?: VoiceState;
  onVoiceTrigger?: () => void;
}

export const MessageInput: FC<MessageInputProps> = ({
  onSendMessage,
  isLoading,
  language,
  voiceState = 'idle',
  onVoiceTrigger,
}) => {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const content = LOCALIZED_CONTENT[language] || LOCALIZED_CONTENT.en;

  const handleSend = () => {
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText.trim());
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        100
      )}px`;
    }
  }, [inputText]);

  const isRecording = voiceState === 'listening';

  return (
    <div className="relative px-3 pb-2.5 pt-0.5 shrink-0">
      <div
        className={`relative flex items-end gap-2 rounded-2xl apple-glass-dock p-1.5 shadow-sm transition-all duration-300 ${
          isRecording ? 'ring-1.5 ring-rose-400/50 bg-rose-500/5' : ''
        }`}
      >
        <div className="absolute top-0 inset-x-3 h-[1px] bg-gradient-to-r from-transparent via-white/90 to-transparent pointer-events-none" />

        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording
              ? 'Listening... Speak naturally or tap square to send'
              : content.inputPlaceholder
          }
          disabled={isLoading}
          rows={1}
          className="flex-1 bg-transparent border-0 outline-hidden resize-none text-xs text-[#1D1D26] placeholder-[#777784] py-1.5 px-2 max-h-24 leading-relaxed font-medium"
        />

        <div className="flex items-center gap-1 shrink-0 pb-0.5">
          {inputText.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-0.5 text-[9px] text-[#777784] mr-0.5 font-mono">
              <span>Enter</span>
              <CornerDownLeft className="w-2.5 h-2.5" />
            </span>
          )}

          {/* ChatGPT-style Mic Dictation Toggle Button in Chat Dock */}
          {onVoiceTrigger && (
            <button
              type="button"
              onClick={onVoiceTrigger}
              disabled={isLoading || voiceState === 'processing'}
              className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-200 cursor-pointer ${
                isRecording
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/40 ring-1 ring-white/70 animate-pulse hover:scale-105 active:scale-95'
                  : 'apple-glass-control text-[#777784] hover:text-[#7772E8] hover:scale-105 active:scale-95'
              }`}
              title={
                isRecording
                  ? content.voiceRecordingStop || 'Finish recording & send'
                  : content.voiceStatusIdle || 'Voice dictation'
              }
              aria-label={
                isRecording
                  ? content.voiceRecordingStop || 'Finish recording & send'
                  : content.voiceStatusIdle || 'Voice dictation'
              }
            >
              {isRecording ? (
                <Square className="w-3.5 h-3.5 fill-white" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Send Message Button */}
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className={`flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-200 cursor-pointer ${
              inputText.trim() && !isLoading
                ? 'bg-gradient-to-br from-[#7772E8] to-[#544EC3] text-white shadow-md shadow-[#7772E8]/40 ring-1 ring-white/70 hover:scale-105 active:scale-95'
                : 'apple-glass-control text-[#777784]/60 cursor-not-allowed'
            }`}
            title="Send Message"
            aria-label="Send message"
          >
            {isLoading ? (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
