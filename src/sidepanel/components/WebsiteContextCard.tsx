import { useState } from 'react';
import type { FC } from 'react';
import { Globe, ExternalLink, Layers, FileText } from 'lucide-react';
import type { WebsiteContextData } from '../types';

interface WebsiteContextCardProps {
  currentContext: WebsiteContextData;
}

export const WebsiteContextCard: FC<WebsiteContextCardProps> = ({
  currentContext,
}) => {
  const [showMetrics, setShowMetrics] = useState(false);

  return (
    <div className="relative mx-3.5 mt-2.5 mb-1.5 rounded-2xl apple-glass-card p-2.5 transition-all shrink-0">
      <div className="absolute top-0 inset-x-4 h-[1px] bg-gradient-to-r from-transparent via-white/90 to-transparent pointer-events-none" />

      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div
            className="relative flex items-center justify-center w-7 h-7 rounded-xl text-white font-bold text-xs shadow-md shrink-0 mt-0.5 overflow-hidden ring-1 ring-white/90"
            style={{ backgroundColor: currentContext.faviconBg || '#7772E8' }}
            title={`${currentContext.name || 'Webpage'} Favicon`}
          >
            <div className="absolute top-0 inset-x-0 h-3 bg-gradient-to-b from-white/75 via-white/20 to-transparent pointer-events-none" />
            <span className="relative z-10 drop-shadow-xs">{currentContext.faviconChar || 'W'}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[#1D1D26] tracking-tight truncate">
                {currentContext.name || 'Active Webpage'}
              </span>
              <span className="text-[10px] text-[#777784] font-mono truncate">
                {currentContext.domain}
              </span>
              {currentContext.connectionState === 'syncing' ? (
                <span className="inline-flex items-center gap-1 text-[8.5px] text-amber-700 bg-amber-100/80 ring-1 ring-amber-400/50 px-1.5 py-0.2 rounded-full font-semibold ml-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  Syncing
                </span>
              ) : currentContext.connectionState === 'unsupported' ? (
                <span className="inline-flex items-center gap-1 text-[8.5px] text-slate-600 bg-slate-100/80 ring-1 ring-slate-400/50 px-1.5 py-0.2 rounded-full font-semibold ml-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Internal Page
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[8.5px] text-[#524BC0] bg-[#EAE8FF]/70 ring-1 ring-[#7772E8]/30 px-1.5 py-0.2 rounded-full font-semibold ml-auto">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#7772E8] animate-pulse" />
                  Active Context
                </span>
              )}
            </div>

            <h2
              className="text-[11.5px] font-semibold text-[#1D1D26]/90 line-clamp-1 mt-0.5"
              title={currentContext.title}
            >
              {currentContext.title || 'Browsing session'}
            </h2>

            {currentContext.url && (
              <div className="flex items-center gap-1 text-[9.5px] text-[#777784] mt-0.5">
                <Globe className="w-3 h-3 text-[#7772E8] shrink-0" />
                <span className="truncate font-mono">{currentContext.url}</span>
                <a
                  href={currentContext.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#777784] hover:text-[#7772E8] transition-colors shrink-0"
                  title="Open URL in new tab"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/40 text-[9.5px] text-[#777784]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3 text-[#7772E8]" />
            <span className="font-medium">{currentContext.wordCount ? currentContext.wordCount.toLocaleString() : '0'} words</span>
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3 text-[#7772E8]" />
            <span className="font-medium">{currentContext.tablesCount || 0} tables</span>
          </span>
          <span>·</span>
          <span className="font-medium">{currentContext.formsCount || 0} forms</span>
        </div>
        {currentContext.snippet && (
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="text-[#7772E8] hover:text-[#524BC0] font-bold cursor-pointer transition-colors"
          >
            {showMetrics ? 'Hide' : 'Inspect'}
          </button>
        )}
      </div>

      {showMetrics && currentContext.snippet && (
        <div className="mt-2 p-2 rounded-xl apple-glass-card border border-white/60 text-[10.5px] text-[#1D1D26]/85 leading-relaxed shadow-inner">
          <div className="font-bold text-[#524BC0] mb-1 flex items-center justify-between text-[9.5px]">
            <span className="uppercase tracking-wider">DOM Semantic Snapshot</span>
            <span className="text-[9px] text-[#777784] font-mono">In-memory</span>
          </div>
          <p className="text-[10.5px] text-[#474553] line-clamp-3">{currentContext.snippet}</p>
        </div>
      )}
    </div>
  );
};
