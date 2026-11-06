import type { FC } from 'react';
import { ShieldAlert, Check, X, Lock } from 'lucide-react';
import type { ActionConfirmationData, LanguageCode } from '../types';
import { LOCALIZED_CONTENT } from '../localization';

interface ActionConfirmationProps {
  action: ActionConfirmationData;
  onConfirm: (actionId: string) => void;
  onCancel: (actionId: string) => void;
  language: LanguageCode;
}

export const ActionConfirmation: FC<ActionConfirmationProps> = ({
  action,
  onConfirm,
  onCancel,
  language,
}) => {
  const content = LOCALIZED_CONTENT[language] || LOCALIZED_CONTENT.en;

  if (action.status !== 'pending') {
    return (
      <div
        className={`p-3 rounded-2xl border text-xs transition-all apple-glass-card ${
          action.status === 'confirmed'
            ? 'bg-emerald-500/15 border-emerald-400/60 text-emerald-950'
            : 'bg-slate-500/15 border-slate-400/50 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {action.status === 'confirmed' ? (
            <>
              <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Check className="w-3 h-3" />
              </div>
              <span>Action confirmed and executed autonomously</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-slate-400 text-white flex items-center justify-center shrink-0 shadow-xs">
                <X className="w-3 h-3" />
              </div>
              <span>Action cancelled</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative my-2.5 p-3 rounded-2xl apple-glass-panel ring-1 ring-[#7772E8]/40 transition-all">
      <div className="absolute top-0 inset-x-4 h-[1.5px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />

      <div className="flex items-start gap-2.5 mb-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-amber-500/20 text-amber-600 border border-amber-300/80 shadow-xs shrink-0">
          <ShieldAlert className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-[#1D1D26]">
              {action.title}
            </span>
            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
              {action.impactLevel} risk
            </span>
          </div>
          <p className="text-[11px] text-[#5D5D70] mt-0.5 leading-snug">
            {action.description}
          </p>
        </div>
      </div>

      {action.payload && Object.keys(action.payload).length > 0 && (
        <div className="my-2 p-2.5 rounded-xl apple-glass-card border border-white/60 space-y-1 text-xs">
          <div className="flex items-center gap-1 text-[10px] font-bold text-[#524BC0] uppercase tracking-wider mb-1">
            <Lock className="w-3 h-3" />
            <span>Action Parameters</span>
          </div>

          {Object.entries(action.payload).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between text-[11px] gap-2">
              <span className="text-[#777784] font-medium shrink-0">{k}:</span>
              <span className="text-[#1D1D26] font-mono text-[10.5px] truncate">{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/40">
        <button
          onClick={() => onCancel(action.id)}
          className="flex-1 py-1.5 px-3 rounded-xl apple-glass-control text-xs font-semibold text-[#5D5D70] hover:text-[#1D1D26] transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          <span>{content.cancelButton}</span>
        </button>

        <button
          onClick={() => onConfirm(action.id)}
          className="flex-1 py-1.5 px-3 rounded-xl bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white text-xs font-bold shadow-md shadow-[#7772E8]/30 ring-1 ring-white/60 hover:brightness-105 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{content.confirmButton}</span>
        </button>
      </div>
    </div>
  );
};
