import { speakText, stopAudio, configureSpeaker, onSpeechStateChange } from '../lib/speaker';
import { logger } from '../lib/logger';
import type { VoiceState, LanguageCode, Message } from './types';

export type StateListener = (state: VoiceState, errorMsg?: string) => void;
export type TranscriptListener = (transcript: string, isFinal: boolean) => void;
export type AudioDataListener = (frequencies: Uint8Array, volume: number) => void;
export type MessageListener = (msg: Message) => void;
export type DurationListener = (seconds: number, formatted: string) => void;

class VoiceBridge {
  private currentState: VoiceState = 'idle';
  private errorMessage = '';
  private currentLanguage: LanguageCode = 'en';
  private groqApiKey = '';
  private geminiApiKey = '';
  private speechRate = 1.0;

  private recognition: any = null;
  private isRecording = false;

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordedMimeType = 'audio/webm';
  private accumulatedWebSpeechText = '';

  private recordingStartTime: number | null = null;
  private durationTimerId: any = null;
  private durationSeconds = 0;
  private formattedDuration = '00:00';

  private animationFrameId: number | null = null;

  // Listeners
  private stateListeners: Set<StateListener> = new Set();
  private transcriptListeners: Set<TranscriptListener> = new Set();
  private audioListeners: Set<AudioDataListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private durationListeners: Set<DurationListener> = new Set();

  // Agent integration hook
  public onTranscriptReady?: (transcript: string) => Promise<void>;
  public onConfirmAction?: (actionId: string) => void;
  public onCancelAction?: (actionId: string) => void;
  private currentAssistantMessage: Message | null = null;

  constructor() {
    // Listen to real speech synthesis events from speaker.ts
    onSpeechStateChange((speaking) => {
      if (speaking) {
        this.setState('speaking');
      } else {
        if (this.currentState === 'speaking') {
          this.setState('idle');
        }
      }
    });
  }

  public getState(): VoiceState {
    return this.currentState;
  }

  public getErrorMessage(): string {
    return this.errorMessage;
  }

  public getLanguage(): LanguageCode {
    return this.currentLanguage;
  }

  public setLanguage(lang: LanguageCode) {
    this.currentLanguage = lang;
    configureSpeaker({ language: lang, speechRate: this.speechRate });
  }

  public setSpeechRate(rate: number) {
    this.speechRate = rate;
    configureSpeaker({ language: this.currentLanguage, speechRate: rate });
  }

  public setGroqApiKey(key: string) {
    this.groqApiKey = (key || '').trim();
  }

  public setGeminiApiKey(key: string) {
    this.geminiApiKey = (key || '').trim();
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.currentState, this.errorMessage);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeTranscript(listener: TranscriptListener): () => void {
    this.transcriptListeners.add(listener);
    return () => this.transcriptListeners.delete(listener);
  }

  public subscribeAudioData(listener: AudioDataListener): () => void {
    this.audioListeners.add(listener);
    return () => this.audioListeners.delete(listener);
  }

  public subscribeMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public subscribeDuration(listener: DurationListener): () => void {
    this.durationListeners.add(listener);
    listener(this.durationSeconds, this.formattedDuration);
    return () => this.durationListeners.delete(listener);
  }

  public getRecordingDuration(): { seconds: number; formatted: string } {
    return { seconds: this.durationSeconds, formatted: this.formattedDuration };
  }

  public setState(state: VoiceState, errorMsg = '') {
    this.currentState = state;
    this.errorMessage = errorMsg;
    this.stateListeners.forEach((fn) => fn(state, errorMsg));
  }

  public addUserMessage(text: string): Message {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      text,
      timestamp: timeStr,
      language: this.currentLanguage,
    };
    this.messageListeners.forEach((fn) => fn(msg));
    return msg;
  }

  public addAssistantMessage(text: string, activityTimeline?: any[], pendingAction?: any): Message {
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'assistant',
      text,
      timestamp: timeStr,
      language: this.currentLanguage,
      activityTimeline,
      pendingAction,
      audioDuration: `${Math.max(1, Math.round(text.split(' ').length / 3))}s`,
    };
    this.currentAssistantMessage = msg;
    this.messageListeners.forEach((fn) => fn(msg));
    return msg;
  }

  public updateCurrentTimeline(steps: any[], pendingAction?: any, textUpdate?: string): void {
    if (!this.currentAssistantMessage) {
      this.addAssistantMessage(textUpdate || 'Executing task...', steps, pendingAction);
      return;
    }
    const updated: Message = {
      ...this.currentAssistantMessage,
      activityTimeline: [...steps],
      ...(pendingAction !== undefined && { pendingAction }),
      ...(textUpdate && { text: textUpdate }),
    };
    this.currentAssistantMessage = updated;
    this.messageListeners.forEach((fn) => fn(updated));
  }

  public confirmAction(actionId: string): void {
    logger.info('VoiceBridge', 'User confirmed action via UI', { actionId });
    if (this.currentAssistantMessage?.pendingAction?.id === actionId) {
      this.currentAssistantMessage.pendingAction.status = 'confirmed';
      this.messageListeners.forEach((fn) => fn({ ...this.currentAssistantMessage! }));
    }
    this.onConfirmAction?.(actionId);
  }

  public cancelAction(actionId: string): void {
    logger.info('VoiceBridge', 'User cancelled action via UI', { actionId });
    if (this.currentAssistantMessage?.pendingAction?.id === actionId) {
      this.currentAssistantMessage.pendingAction.status = 'cancelled';
      this.messageListeners.forEach((fn) => fn({ ...this.currentAssistantMessage! }));
    }
    this.onCancelAction?.(actionId);
  }

  private getSTTLanguageCode(lang: LanguageCode): string {
    if (lang === 'hi') return 'hi-IN';
    if (lang === 'te') return 'te-IN';
    return 'en-IN';
  }

  private startDurationTimer(): void {
    this.recordingStartTime = Date.now();
    this.durationSeconds = 0;
    this.formattedDuration = '00:00';
    if (this.durationTimerId) {
      clearInterval(this.durationTimerId);
    }
    this.durationTimerId = setInterval(() => {
      if (!this.recordingStartTime) return;
      const elapsedMs = Date.now() - this.recordingStartTime;
      const totalSec = Math.floor(elapsedMs / 1000);
      this.durationSeconds = totalSec;
      const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const secs = (totalSec % 60).toString().padStart(2, '0');
      this.formattedDuration = `${mins}:${secs}`;
      this.durationListeners.forEach((fn) => fn(this.durationSeconds, this.formattedDuration));
    }, 200);
  }

  private stopDurationTimer(): void {
    if (this.durationTimerId) {
      clearInterval(this.durationTimerId);
      this.durationTimerId = null;
    }
    this.recordingStartTime = null;
    this.durationSeconds = 0;
    this.formattedDuration = '00:00';
    this.durationListeners.forEach((fn) => fn(0, '00:00'));
  }

  /**
   * ChatGPT-Style Push-to-Start / Push-to-Stop Toggle
   */
  public async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.stopAndTranscribe();
      return;
    }

    if (this.currentState === 'speaking') {
      this.stopAudio();
    }

    await this.startRecording();
  }

  /**
   * Start recording audio and background speech accumulation.
   * Does NOT auto-submit until user presses stop or toggles off.
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) return;

    // First ensure microphone permission is available or prompt user explicitly
    try {
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (permErr: any) {
      logger.warn('STT', 'getUserMedia failed or permission not granted', permErr);
      this.setState('error', 'Microphone access denied. Click to grant microphone permission.');
      if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
      return;
    }

    try {
      this.isRecording = true;
      this.audioChunks = [];
      this.accumulatedWebSpeechText = '';
      this.startDurationTimer();
      this.setState('listening');

      // Initialize MediaRecorder for full fidelity audio capture
      await this.startAudioAnalysis();

      // Initialize background speech recognition for live feedback & fallback
      this.initBackgroundRecognition();
    } catch (err: any) {
      logger.error('STT', 'Failed to start recording', err);
      this.setState('error', 'Microphone access failed. Please verify device permissions.');
      this.cancelRecording();
    }
  }

  private initBackgroundRecognition(): void {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      logger.debug('STT', 'Web Speech API unavailable, recording with MediaRecorder only');
      return;
    }

    try {
      this.recognition = new SpeechRecognitionAPI();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.getSTTLanguageCode(this.currentLanguage);

      this.recognition.onstart = () => {
        logger.debug('STT', 'Background speech recognition started');
      };

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            this.accumulatedWebSpeechText += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (interimTranscript) {
          this.transcriptListeners.forEach((fn) => fn(interimTranscript, false));
        }
        // NOTE: In ChatGPT-style dictation, we DO NOT submit on isFinal results while recording!
        // User is free to speak, pause naturally, continue speaking across multiple sentences.
      };

      this.recognition.onerror = (event: any) => {
        logger.debug('STT', 'Background recognition event', event.error);
        if (event.error === 'not-allowed') {
          this.setState('error', 'Microphone access denied. Please grant permission.');
          this.cancelRecording();
        }
      };

      this.recognition.onend = () => {
        // If recording is still active and recognition stopped due to silence, silently resume
        if (this.isRecording && this.recognition) {
          try {
            this.recognition.start();
          } catch (_) {}
        }
      };

      this.recognition.start();
    } catch (recErr) {
      logger.debug('STT', 'Web Speech API start skipped', recErr);
    }
  }

  private async startAudioAnalysis(): Promise<void> {
    try {
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);

      // Determine supported MIME type for MediaRecorder
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = '';
        }
      }
      this.recordedMimeType = mimeType || 'audio/webm';

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.audioChunks = [];
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };
      // Slice chunks every 250ms to ensure buffers are collected continuously
      this.mediaRecorder.start(250);

      this.startAudioLoop();
    } catch (err) {
      logger.warn('STT', 'AudioContext analyzer unavailable', err);
    }
  }

  private startAudioLoop(): void {
    const loop = () => {
      if (this.analyser && (this.isRecording || this.currentState === 'speaking')) {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const volume = sum / dataArray.length / 255;

        this.audioListeners.forEach((fn) => fn(dataArray, volume));
        this.animationFrameId = requestAnimationFrame(loop);
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stop recording, transcribe the complete captured audio, and submit automatically to ANVORA.
   */
  public async stopAndTranscribe(): Promise<void> {
    if (!this.isRecording) return;
    this.isRecording = false;

    this.stopDurationTimer();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
      this.recognition = null;
    }

    this.setState('processing');

    // Await MediaRecorder completion
    const rec = this.mediaRecorder;
    const stopPromise = new Promise<Blob>((resolve) => {
      if (!rec || rec.state === 'inactive') {
        resolve(new Blob(this.audioChunks, { type: this.recordedMimeType }));
        return;
      }
      const timeout = setTimeout(() => {
        resolve(new Blob(this.audioChunks, { type: this.recordedMimeType }));
      }, 1500);

      rec.addEventListener(
        'stop',
        () => {
          clearTimeout(timeout);
          resolve(new Blob(this.audioChunks, { type: this.recordedMimeType }));
        },
        { once: true }
      );

      try {
        rec.stop();
      } catch (_) {
        clearTimeout(timeout);
        resolve(new Blob(this.audioChunks, { type: this.recordedMimeType }));
      }
    });

    let audioBlob: Blob;
    try {
      audioBlob = await stopPromise;
    } catch (_) {
      audioBlob = new Blob(this.audioChunks, { type: this.recordedMimeType });
    }

    // Immediately stop and release all microphone media stream tracks
    this.releaseMediaStream();
    this.stopAudioAnalysis();

    // Transcribe audio using multi-tier provider pipeline:
    // 1. Groq Whisper (whisper-large-v3-turbo, preserves original language without English translation)
    // 2. Gemini Multimodal Audio Transcription (if Gemini API key configured)
    // 3. Web Speech API accumulated speech fallback
    let transcribedText = '';

    // Step 1: Groq Whisper
    if (this.groqApiKey && audioBlob.size > 200) {
      try {
        logger.info('STT', 'Transcribing full audio with Groq Whisper whisper-large-v3-turbo');
        const formData = new FormData();
        formData.append('file', audioBlob, 'dictation.webm');
        formData.append('model', 'whisper-large-v3-turbo');

        // Preserving original language: if explicit Hindi/Telugu, provide hint; otherwise auto-detect
        if (this.currentLanguage === 'hi') {
          formData.append('language', 'hi');
        } else if (this.currentLanguage === 'te') {
          formData.append('language', 'te');
        }

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.groqApiKey}` },
          body: formData,
        });

        if (res.ok) {
          const json = await res.json();
          if (json.text && json.text.trim()) {
            transcribedText = json.text.trim();
          }
        } else {
          logger.warn('STT', `Groq Whisper status: ${res.status}`);
        }
      } catch (whisperErr) {
        logger.warn('STT', 'Groq Whisper transcription failed, attempting fallback', whisperErr);
      }
    }

    // Step 2: Gemini Multimodal Audio Transcription fallback
    if (!transcribedText && this.geminiApiKey && audioBlob.size > 200) {
      try {
        logger.info('STT', 'Transcribing full audio with Gemini multimodal audio API');
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => {
            const result = (reader.result as string) || '';
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
          reader.readAsDataURL(audioBlob);
        });

        const base64Audio = await base64Promise;
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        mimeType: audioBlob.type || 'audio/webm',
                        data: base64Audio,
                      },
                    },
                    {
                      text: 'Transcribe this audio recording verbatim in its original spoken language (e.g. Hindi, Telugu, English). Do not translate. Output ONLY the exact transcribed text and nothing else.',
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (geminiRes.ok) {
          const gJson = await geminiRes.json();
          const candidateText = gJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidateText) {
            transcribedText = candidateText;
          }
        }
      } catch (geminiAudioErr) {
        logger.warn('STT', 'Gemini multimodal transcription failed', geminiAudioErr);
      }
    }

    // Step 3: Web Speech API accumulated fallback
    if (!transcribedText) {
      transcribedText = this.accumulatedWebSpeechText.trim();
    }

    // Automatic submission to ANVORA execution pipeline
    if (transcribedText) {
      logger.info('STT', 'Final voice dictation transcribed, automatically submitting to ANVORA', {
        transcribedText,
      });
      this.transcriptListeners.forEach((fn) => fn(transcribedText, true));
      this.addUserMessage(transcribedText);

      if (this.onTranscriptReady) {
        await this.onTranscriptReady(transcribedText);
      }
    } else {
      logger.info('STT', 'No speech detected in audio dictation, returning to idle');
      this.setState('idle');
    }
  }

  /**
   * Cancel an active recording without submitting.
   */
  public cancelRecording(): void {
    logger.info('VoiceBridge', 'Voice recording cancelled by user');
    this.isRecording = false;
    this.stopDurationTimer();

    if (this.recognition) {
      try {
        if (typeof this.recognition.abort === 'function') {
          this.recognition.abort();
        } else {
          this.recognition.stop();
        }
      } catch (_) {}
      this.recognition = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (_) {}
    }

    this.audioChunks = [];
    this.accumulatedWebSpeechText = '';

    this.releaseMediaStream();
    this.stopAudioAnalysis();
    this.setState('idle');
  }

  /**
   * Stop recording (alias for cancelRecording or backwards-compatible stop).
   */
  public stopRecording(): void {
    this.cancelRecording();
  }

  private releaseMediaStream(): void {
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (_) {}
      this.mediaStream = null;
    }
  }

  private stopAudioAnalysis(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
      this.analyser = null;
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'UNMUTE_ALL_TABS' }).catch(() => {});
    }
  }

  public async speak(text: string, langOverride?: string): Promise<void> {
    const targetLang = langOverride || this.currentLanguage;
    return speakText(text, targetLang);
  }

  public stopAudio(): void {
    stopAudio();
    if (this.currentState === 'speaking') {
      this.setState('idle');
    }
  }

  public isSpeaking(): boolean {
    return this.currentState === 'speaking';
  }

  public isMicActive(): boolean {
    return this.isRecording;
  }
}

export const voiceBridge = new VoiceBridge();
