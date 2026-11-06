import type { FC } from 'react';
import { Languages, Check } from 'lucide-react';
import type { LanguageCode } from '../types';
import { SUPPORTED_LANGUAGES } from '../localization';

interface LanguageSelectorProps {
  currentLanguage: LanguageCode;
  onSelectLanguage: (lang: LanguageCode) => void;
  compact?: boolean;
}

export const LanguageSelector: FC<LanguageSelectorProps> = ({
  currentLanguage,
  onSelectLanguage,
  compact = false,
}) => {
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-xl apple-glass-card shadow-2xs">
      <div className="flex items-center gap-1 text-[10px] text-[#777784] font-medium pl-1.5 pr-0.5">
        <Languages className="w-3 h-3 text-[#7772E8]" />
        {!compact && <span className="hidden sm:inline">Lang:</span>}
      </div>

      <div className="flex items-center gap-0.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = lang.code === currentLanguage;
          return (
            <button
              key={lang.code}
              onClick={() => onSelectLanguage(lang.code)}
              className={`px-2 py-0.5 rounded-lg text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white font-bold shadow-xs ring-1 ring-white/60'
                  : 'text-[#5D5D70] hover:text-[#1D1D26] hover:bg-white/40'
              }`}
              title={`${lang.label} (${lang.nativeName})`}
            >
              <span>{lang.nativeName}</span>
              {isActive && <Check className="w-2.5 h-2.5 text-white" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};
