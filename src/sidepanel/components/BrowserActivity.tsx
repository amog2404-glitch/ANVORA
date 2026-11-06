import { useState } from 'react';
import type { FC } from 'react';
import {
  BrainCircuit,
  Search,
  Eye,
  Globe2,
  PlayCircle,
  HelpCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
} from 'lucide-react';
import type { BrowserActivityStep, ActivityState } from '../types';

interface BrowserActivityProps {
  steps: BrowserActivityStep[];
  currentActiveState?: ActivityState;
  isProcessing?: boolean;
}

export const BrowserActivity: FC<BrowserActivityProps> = ({
  steps,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!steps || steps.length === 0) return null;

  const getStateIcon = (state: ActivityState) => {
    switch (state) {
      case 'understanding':
        return <BrainCircuit className="w-3.5 h-3.5 text-[#7772E8] animate-pulse" />;
      case 'analyzing':
        return <Layers className="w-3.5 h-3.5 text-[#544EC3]" />;
      case 'reading':
        return <Eye className="w-3.5 h-3.5 text-blue-500" />;
      case 'searching':
        return <Search className="w-3.5 h-3.5 text-violet-500" />;
      case 'navigating':
        return <Globe2 className="w-3.5 h-3.5 text-indigo-500" />;
      case 'executing':
        return <PlayCircle className="w-3.5 h-3.5 text-purple-600 animate-spin" />;
      case 'waiting_confirmation':
        return <HelpCircle className="w-3.5 h-3.5 text-amber-500" />;
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-rose-500" />;
      default:
        return <Activity className="w-3.5 h-3.5 text-[#7772E8]" />;
    }
  };

  const getStateBadgeColor = (state: ActivityState) => {
    switch (state) {
      case 'completed':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200/80';
      case 'executing':
      case 'analyzing':
        return 'text-[#524BC0] bg-[#EAE8FF] border-[#7772E8]/40';
      case 'waiting_confirmation':
        return 'text-amber-800 bg-amber-50 border-amber-300';
      case 'failed':
        return 'text-rose-700 bg-rose-50 border-rose-200';
      default:
        return 'text-[#5D5D70] bg-white/40 border-white/80';
    }
  };

  return (
    <div className="my-2.5 rounded-2xl apple-glass-card border border-white/60 p-2.5 transition-all">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between text-left cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-lg apple-glass-control flex items-center justify-center text-[#7772E8]">
            <Activity className="w-3 h-3" />
          </div>
          <span className="text-xs font-bold text-[#1D1D26]">
            Browser Activity
          </span>
          <span className="text-[10px] text-[#777784] font-mono">
            ({steps.length} step{steps.length !== 1 ? 's' : ''})
          </span>
        </div>

        <div className="text-[#777784] hover:text-[#1D1D26] p-0.5">
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-white/40 space-y-2">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1;
            return (
              <div key={step.id} className="relative flex items-start gap-2.5 text-xs">
                {!isLast && (
                  <div className="absolute left-2.5 top-5 bottom-[-8px] w-[1px] bg-gradient-to-b from-[#7772E8]/40 to-transparent pointer-events-none" />
                )}

                <div className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full apple-glass-control shrink-0 mt-0.5">
                  {getStateIcon(step.state)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-[#1D1D26] leading-tight">
                      {step.title}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full border shrink-0 ${getStateBadgeColor(
                        step.state
                      )}`}
                    >
                      {step.state.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#5D5D70] mt-0.5 leading-snug">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
