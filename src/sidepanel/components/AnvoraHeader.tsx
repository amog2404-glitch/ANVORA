import type { FC } from 'react';
import { History, Settings, Sparkles, Workflow } from 'lucide-react';

interface AnvoraHeaderProps {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenWorkflows?: () => void;
  historyCount: number;
  workflowCount?: number;
  isConnected: boolean;
}

export const AnvoraHeader: FC<AnvoraHeaderProps> = ({
  onOpenSettings,
  onOpenHistory,
  onOpenWorkflows,
  historyCount,
  workflowCount = 0,
  isConnected,
}) => {
  return (
    <header className="sticky top-0 z-30 px-3.5 py-2.5 apple-glass-panel border-b border-white/40 transition-all duration-300 shrink-0">
      <div className="flex items-center justify-between gap-3">
        {/* Brand Lockup */}
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Luminous Gem Icon */}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[#7772E8] to-[#544EC3] text-white shadow-md shadow-[#7772E8]/30 ring-1 ring-white/80 shrink-0">
            {/* Top specular reflection */}
            <div className="absolute top-0 inset-x-1 h-3 rounded-t-xl bg-gradient-to-b from-white/70 to-transparent pointer-events-none" />
            <Sparkles className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-extrabold tracking-tight text-[#1D1D26] text-base leading-none">
                ANVORA
              </span>
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wider ${
                  isConnected
                    ? 'bg-[#EAE8FF]/70 text-[#524BC0] ring-1 ring-[#7772E8]/40 shadow-2xs'
                    : 'bg-amber-500/20 text-amber-700 ring-1 ring-amber-400'
                }`}
                title={isConnected ? 'Active Tab Connected & Ready' : 'Connecting to tab...'}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? 'bg-[#7772E8] animate-pulse' : 'bg-amber-500'
                  }`}
                />
                <span>ONLINE</span>
              </span>
            </div>
            <span className="text-[8.5px] font-semibold tracking-widest text-[#777784] uppercase mt-0.5 leading-none">
              AUTONOMOUS INTELLIGENCE
            </span>
          </div>
        </div>

        {/* Action Controls (Floating Glass Buttons) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Workflows Automation Drawer Button */}
          {onOpenWorkflows && (
            <button
              onClick={onOpenWorkflows}
              className="relative flex items-center justify-center w-8 h-8 rounded-xl apple-glass-control text-[#5D5D70] hover:text-[#1D1D26] active:scale-95 transition-all cursor-pointer"
              title="Workflow Automation"
              aria-label="Open workflows"
            >
              <Workflow className="w-3.5 h-3.5 text-[#524BC0]" />
              {workflowCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#7772E8] ring-2 ring-white" />
              )}
            </button>
          )}

          {/* Conversation History Drawer Button */}
          <button
            onClick={onOpenHistory}
            className="relative flex items-center justify-center w-8 h-8 rounded-xl apple-glass-control text-[#5D5D70] hover:text-[#1D1D26] active:scale-95 transition-all cursor-pointer"
            title="Conversation History"
            aria-label="Open conversation history"
          >
            <History className="w-3.5 h-3.5" />
            {historyCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#7772E8] ring-2 ring-white" />
            )}
          </button>

          {/* Settings Drawer Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center w-8 h-8 rounded-xl apple-glass-control text-[#5D5D70] hover:text-[#1D1D26] active:scale-95 transition-all cursor-pointer"
            title="Assistant Settings"
            aria-label="Open settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
