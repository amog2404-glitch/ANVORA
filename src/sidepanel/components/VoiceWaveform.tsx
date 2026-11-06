import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { voiceBridge } from '../voiceBridge';

interface VoiceWaveformProps {
  isActive: boolean;
  mode?: 'listening' | 'speaking' | 'subtle';
  barCount?: number;
}

export const VoiceWaveform: FC<VoiceWaveformProps> = ({
  isActive,
  mode = 'listening',
  barCount = 18,
}) => {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 8)
  );

  useEffect(() => {
    if (!isActive) {
      setHeights(Array.from({ length: barCount }, () => 6));
      return;
    }

    // Connect to real audio analyzer data from VoiceBridge during microphone listening
    if (mode === 'listening') {
      const unsubscribe = voiceBridge.subscribeAudioData((frequencies, volume) => {
        const step = Math.max(1, Math.floor(frequencies.length / barCount));
        const newHeights = Array.from({ length: barCount }, (_, i) => {
          const raw = frequencies[i * step] || 0;
          const normalized = raw / 255;
          const boosted = Math.max(volume * 0.8, normalized);
          const minH = 6;
          const maxH = 42;
          return Math.round(minH + boosted * (maxH - minH));
        });
        setHeights(newHeights);
      });

      return () => {
        unsubscribe();
      };
    } else {
      // Harmonic voice cadence for TTS speaking
      const interval = setInterval(() => {
        setHeights(() =>
          Array.from({ length: barCount }, (_, i) => {
            const center = barCount / 2;
            const dist = Math.abs(i - center) / center;
            const baseWeight = 1 - dist * 0.4;
            const harmonic = Math.sin((Date.now() / 150) + (i * 0.5)) * 0.35 + 0.65;
            const maxH = 46;
            const minH = 8;
            return Math.round(Math.max(minH, Math.min(maxH, baseWeight * harmonic * maxH)));
          })
        );
      }, 75);

      return () => clearInterval(interval);
    }
  }, [isActive, mode, barCount]);

  return (
    <div
      className="flex items-center justify-center gap-1.5 h-12 px-4 py-1"
      aria-hidden="true"
    >
      {heights.map((h, idx) => (
        <div
          key={idx}
          className="w-1.5 rounded-full transition-all duration-75 ease-out origin-center"
          style={{
            height: `${h}px`,
            background: isActive
              ? 'linear-gradient(180deg, #7772E8 0%, #B8B5F6 60%, #EAE8FF 100%)'
              : 'rgba(119, 114, 232, 0.25)',
            boxShadow: isActive
              ? '0 0 8px rgba(119, 114, 232, 0.4)'
              : 'none',
          }}
        />
      ))}
    </div>
  );
};
