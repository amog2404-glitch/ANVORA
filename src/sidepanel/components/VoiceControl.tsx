import type { FC, KeyboardEvent } from 'react';
import { Mic, RefreshCw, Loader2, Volume2, AlertCircle, Square, X } from 'lucide-react';
import type { VoiceState, LanguageCode } from '../types';
import { LOCALIZED_CONTENT } from '../localization';
import { VoiceWaveform } from './VoiceWaveform';

interface VoiceControlProps {
  voiceState: VoiceState;
  onStateChange: (state: VoiceState) => void;
  onVoiceTrigger: () => void;
  onCancelVoice?: () => void;
  recordingDuration?: string;
  language: LanguageCode;
  errorMessage?: string;
}

export const VoiceControl: FC<VoiceControlProps> = ({
  voiceState,
  onStateChange,
  onVoiceTrigger,
  onCancelVoice,
  recordingDuration = '00:00',
  language,
  errorMessage = 'Voice recognition interrupted. Tap to retry.',
}) => {
  const content = LOCALIZED_CONTENT[language] || LOCALIZED_CONTENT.en;

  const getLabel = () => {
    switch (voiceState) {
      case 'listening':
        return content.voiceRecordingStop || 'Tap to finish & send';
      case 'processing':
        return content.voiceStatusTranscribing || 'Transcribing complete audio...';
      case 'speaking':
        return content.voiceStatusSpeaking;
      case 'error':
        return content.voiceStatusError;
      case 'idle':
      default:
        return content.voiceStatusIdle;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onVoiceTrigger();
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center py-2 px-3 select-none shrink-0">
      {/* Waveform Visualization when Listening or Speaking */}
      <div
        className={`transition-all duration-300 overflow-hidden ${
          voiceState === 'listening' || voiceState === 'speaking'
            ? 'h-11 opacity-100 mb-1 scale-100'
            : 'h-0 opacity-0 mb-0 scale-95 pointer-events-none'
        }`}
      >
        <VoiceWaveform
          isActive={voiceState === 'listening' || voiceState === 'speaking'}
          mode={voiceState === 'speaking' ? 'speaking' : 'listening'}
        />
      </div>

      {/* ChatGPT-style Recording Duration & Cancel Control Strip */}
      {voiceState === 'listening' && (
        <div className="flex items-center gap-2 mb-1.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-400/30 backdrop-blur-md shadow-xs">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
            <span className="text-[11px] font-mono font-bold text-rose-700 tracking-wider">
              {recordingDuration}
            </span>
          </div>

          {onCancelVoice && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancelVoice();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/40 hover:bg-white/70 border border-white/60 text-[10px] font-semibold text-[#777784] hover:text-[#1D1D26] transition-all cursor-pointer backdrop-blur-md shadow-xs active:scale-95"
              title={content.voiceRecordingCancel || 'Cancel recording'}
              aria-label={content.voiceRecordingCancel || 'Cancel recording'}
            >
              <X className="w-3 h-3 text-[#777784]" />
              <span>{content.voiceRecordingCancel || 'Cancel'}</span>
            </button>
          )}
        </div>
      )}

      {/* Signature 3D Liquid Glass Sphere Assembly */}
      <div className="relative flex items-center justify-center p-1.5 group">
        {/* Translucent Violet Ambient Aura — allows glass transmission */}
        <div
          className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 pointer-events-none ${
            voiceState === 'listening'
              ? 'bg-rose-500/25 scale-135'
              : voiceState === 'speaking'
              ? 'bg-[#6366F1]/45 scale-140'
              : voiceState === 'processing'
              ? 'bg-[#A78BFA]/35 scale-120'
              : voiceState === 'error'
              ? 'bg-rose-400/30 scale-110'
              : 'bg-[#7772E8]/18 scale-100 group-hover:scale-115'
          }`}
        />

        {/* Concentric Fluid Ripples in Listening State */}
        {voiceState === 'listening' && (
          <>
            <span className="absolute w-28 h-28 rounded-full border border-rose-400/35 animate-ping pointer-events-none" />
            <span className="absolute w-32 h-32 rounded-full border border-white/70 animate-pulse pointer-events-none" />
          </>
        )}

        {/* 1. Transparent Outer Glass Sphere Shell */}
        <button
          onClick={onVoiceTrigger}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="button"
          aria-pressed={voiceState === 'listening'}
          aria-label={getLabel()}
          className={`relative flex items-center justify-center w-22 h-22 rounded-full transition-all duration-300 cursor-pointer active:scale-95 overflow-hidden focus:outline-hidden focus-visible:ring-3 focus-visible:ring-[#7772E8] ${
            voiceState === 'error'
              ? 'bg-rose-500/15 border border-rose-300/80 shadow-lg shadow-rose-300/30 backdrop-blur-xl'
              : voiceState === 'listening'
              ? 'glass-sphere-shell hover:scale-103 ring-2 ring-rose-400/40'
              : 'glass-sphere-shell hover:scale-103'
          }`}
          title={
            voiceState === 'listening'
              ? content.voiceRecordingStop || 'Tap to finish & send'
              : voiceState === 'idle'
              ? 'Tap to speak (or press Ctrl+Space)'
              : 'Cancel voice interaction'
          }
        >
          {/* Animated Light Refraction Ring */}
          <div className="absolute inset-0 rounded-full p-[1px] glass-light-ring opacity-80 pointer-events-none" />

          {/* 3D Specular Highlight Apex */}
          <div className="absolute inset-0 rounded-full glass-specular-apex pointer-events-none z-20" />

          {/* Upper Hemisphere Reflection */}
          <div className="absolute top-1 inset-x-3 h-6 rounded-t-full bg-gradient-to-b from-white/75 via-white/20 to-transparent pointer-events-none z-20" />

          {/* Secondary Fresnel Reflection */}
          <div className="absolute inset-0 rounded-full glass-fresnel-bounce pointer-events-none z-10" />

          {/* 2. Intermediate Transparent Vitreous Lens Layer */}
          <div
            className={`relative flex items-center justify-center w-16 h-16 rounded-full border border-white/60 transition-all duration-300 z-10 ${
              voiceState === 'error'
                ? 'bg-rose-100/30'
                : voiceState === 'listening'
                ? 'bg-rose-500/10 backdrop-blur-md shadow-inner'
                : 'bg-white/10 backdrop-blur-md shadow-inner'
            }`}
          >
            {/* Spinning Refraction Ring when Processing */}
            {voiceState === 'processing' && (
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white border-r-[#C4B5FD] animate-spin" />
            )}

            {/* 3. Luminous Inner Core */}
            <div
              className={`relative flex items-center justify-center w-11 h-11 rounded-full transition-transform duration-300 ${
                voiceState === 'error'
                  ? 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-lg shadow-rose-500/40'
                  : voiceState === 'listening'
                  ? 'bg-gradient-to-br from-rose-500 to-[#7772E8] shadow-lg shadow-rose-500/40 hover:scale-105'
                  : 'glass-luminous-core group-hover:scale-105'
              }`}
            >
              {/* Internal Glass Highlight Bead */}
              <div className="absolute top-1 left-2 w-3 h-1.5 rounded-full bg-white/70 blur-2xs pointer-events-none" />

              {/* State Glyphs */}
              {voiceState === 'idle' && (
                <Mic className="w-5 h-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform group-hover:scale-110" />
              )}

              {/* Listening: Universal Stop / Finish Recording Icon */}
              {voiceState === 'listening' && (
                <div className="relative flex items-center justify-center">
                  <Square className="w-4 h-4 fill-white text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-pulse" />
                </div>
              )}

              {voiceState === 'processing' && (
                <Loader2 className="w-5 h-5 text-white animate-spin drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              )}

              {voiceState === 'speaking' && (
                <Volume2 className="w-5 h-5 text-white animate-pulse drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
              )}

              {voiceState === 'error' && (
                <AlertCircle className="w-5 h-5 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]" />
              )}
            </div>
          </div>

          <span className="absolute bottom-1 right-2.5 w-2 h-2 rounded-full bg-white/60 blur-2xs pointer-events-none z-20" />
        </button>
      </div>

      {/* State Label & Sub-Indicator */}
      <div className="mt-1 text-center">
        <p className="text-xs font-bold tracking-tight text-[#1D1D26]">
          {getLabel()}
        </p>

        {voiceState === 'error' ? (
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-rose-600 font-semibold">{errorMessage}</span>
            <button
              onClick={() => onStateChange('idle')}
              className="inline-flex items-center gap-1 text-[10px] text-[#7772E8] font-bold hover:underline cursor-pointer"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Retry
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-[#777784] mt-0.5 tracking-wide font-medium">
            {voiceState === 'idle'
              ? 'Click orb or press Ctrl+Space to dictate'
              : voiceState === 'listening'
              ? 'Speak naturally. Tap orb when finished to send.'
              : voiceState === 'processing'
              ? 'Transcribing and understanding your request...'
              : 'Speaking response...'}
          </p>
        )}
      </div>
    </div>
  );
};
