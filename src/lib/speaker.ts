// src/lib/speaker.ts
import { logger } from './logger';

export interface SpeakerOptions {
  language?: string; // 'en' | 'hi' | 'te'
  speechRate?: number; // 0.8 - 1.5
}

export type SpeechStateListener = (isSpeaking: boolean) => void;

let activeLanguage = 'en';
let activeSpeechRate = 1.0;
let isPlaying = false;
let isQueueBusy = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
const speechListeners: Set<SpeechStateListener> = new Set();

export function onSpeechStateChange(listener: SpeechStateListener): () => void {
  speechListeners.add(listener);
  return () => {
    speechListeners.delete(listener);
  };
}

export function isAudioPlaying(): boolean {
  return isPlaying || activeUtterance !== null;
}

export function getActiveUtterance(): SpeechSynthesisUtterance | null {
  return activeUtterance;
}

export function configureSpeaker(options: SpeakerOptions) {
  if (options.language) activeLanguage = options.language;
  if (typeof options.speechRate === 'number' && options.speechRate > 0) {
    activeSpeechRate = options.speechRate;
  }
}

/**
 * Cleans markdown formatting, links, and code blocks for natural speech synthesis
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, ' ')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Convert markdown links [text](url) to text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bare URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove markdown headers and hash symbols
    .replace(/#+/g, '')
    // Remove bold, italics, strikethrough, backticks
    .replace(/(\*\*|\*|__|_|~~|`)/g, '')
    // Remove list markers and blockquotes
    .replace(/^[*\-+>]\s*/gm, '')
    // Collapse excess whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export function browserTTS(text: string, langOverride?: string): Promise<void> {
  const speechText = cleanTextForSpeech(text);
  if (!speechText) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(speechText);
    const targetLang = langOverride || activeLanguage;
    
    let voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      let fallbackTimer: any = null;
      const handleVoices = () => {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        speechSynthesis.removeEventListener('voiceschanged', handleVoices);
        voices = speechSynthesis.getVoices();
        executeSpeech(utterance, voices, targetLang, resolve);
      };
      speechSynthesis.addEventListener('voiceschanged', handleVoices);
      
      // Fallback timeout in case voiceschanged never fires
      fallbackTimer = setTimeout(() => {
        speechSynthesis.removeEventListener('voiceschanged', handleVoices);
        voices = speechSynthesis.getVoices();
        executeSpeech(utterance, voices, targetLang, resolve);
      }, 600);
    } else {
      executeSpeech(utterance, voices, targetLang, resolve);
    }
  });
}

function findVoiceForLanguage(voices: SpeechSynthesisVoice[], langCode: string): SpeechSynthesisVoice | undefined {
  if (langCode === 'hi') {
    return voices.find(v => v.lang.toLowerCase().startsWith('hi')) ||
           voices.find(v => /hindi|swara|madhur|kalpana|hemant/i.test(v.name));
  }
  if (langCode === 'te') {
    return voices.find(v => v.lang.toLowerCase().startsWith('te')) ||
           voices.find(v => /telugu|shruti|chitra|mohan/i.test(v.name));
  }
  // Default to English
  return voices.find(v => v.name.includes('Google US English')) ||
         voices.find(v => v.name.includes('Google UK English Female')) ||
         voices.find(v => v.name.includes('Natural') && v.name.includes('Female')) ||
         voices.find(v => v.name.includes('Microsoft Zira') || v.name.includes('Microsoft Jenny')) ||
         voices.find(v => v.lang.toLowerCase().startsWith('en'));
}

function executeSpeech(
  utterance: SpeechSynthesisUtterance,
  voices: SpeechSynthesisVoice[],
  lang: string,
  resolve: (value: void | PromiseLike<void>) => void
) {
  const preferredVoice = findVoiceForLanguage(voices, lang);
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
    utterance.lang = preferredVoice.lang;
    logger.debug('TTS', `Selected voice: ${preferredVoice.name} (${preferredVoice.lang}) for language ${lang}`);
  } else {
    if (lang === 'hi') utterance.lang = 'hi-IN';
    else if (lang === 'te') utterance.lang = 'te-IN';
    else utterance.lang = 'en-US';
    logger.debug('TTS', `No specific voice found for ${lang}, using default voice with tag ${utterance.lang}`);
  }
  
  utterance.rate = activeSpeechRate;
  utterance.pitch = 1.0;
  
  // Retain utterance reference at module scope to prevent Chrome GC mid-speech
  activeUtterance = utterance;

  utterance.onstart = () => {
    isPlaying = true;
    speechListeners.forEach(fn => fn(true));
  };

  utterance.onend = () => {
    logger.info('TTS', 'Speech synthesis ended');
    activeUtterance = null;
    isPlaying = false;
    speechListeners.forEach(fn => fn(false));
    resolve();
  };

  utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
    logger.error('TTS', `Speech synthesis error: code=${e.error}, charIndex=${e.charIndex}, elapsedTime=${e.elapsedTime}ms`, {
      error: e.error,
      charIndex: e.charIndex,
      elapsedTime: e.elapsedTime,
    });
    // In Chrome, if audio is cancelled via speechSynthesis.cancel(), 'canceled' or 'interrupted' is fired.
    // This is expected and not an abnormal fault.
    activeUtterance = null;
    isPlaying = false;
    speechListeners.forEach(fn => fn(false));
    resolve();
  };
  
  logger.info('TTS', `Starting speech synthesis (lang: ${utterance.lang}, rate: ${utterance.rate})`);
  speechSynthesis.speak(utterance);
}

let audioQueue: (() => Promise<void>)[] = [];

export function stopAudio() {
  audioQueue = []; // Clear queue
  isQueueBusy = false;
  activeUtterance = null;
  speechSynthesis.cancel();
  isPlaying = false;
  speechListeners.forEach(fn => fn(false));
  logger.info('TTS', 'Audio playback stopped and queue cleared');
}

export async function speakText(text: string, langOverride?: string): Promise<void> {
  return new Promise((resolve) => {
    audioQueue.push(async () => {
      try {
        await browserTTS(text, langOverride);
      } catch (err) {
        logger.error('TTS', 'Browser TTS failed', err);
      } finally {
        resolve();
        isQueueBusy = false;
        processQueue();
      }
    });
    
    processQueue();
  });
}

function processQueue() {
  if (audioQueue.length > 0 && !isQueueBusy) {
    const next = audioQueue.shift();
    if (next) {
      isQueueBusy = true;
      next();
    }
  }
}
