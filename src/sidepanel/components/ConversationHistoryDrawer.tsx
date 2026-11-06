import { useState } from 'react';
import type { FC } from 'react';
import {
  X,
  History,
  Search,
  Trash2,
  MessageSquare,
  Plus,
} from 'lucide-react';
import type { HistoryItem } from '../types';

interface ConversationHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelectHistoryItem: (item: HistoryItem) => void;
  onClearHistory: () => void;
  onNewConversation: () => void;
}

export const ConversationHistoryDrawer: FC<ConversationHistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onSelectHistoryItem,
  onClearHistory,
  onNewConversation,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!isOpen) return null;

  const filteredHistory = history.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.websiteTitle && item.websiteTitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#1D1D26]/30 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-xs h-full apple-glass-sheet flex flex-col z-10 animate-in slide-in-from-right duration-250">
        <div className="absolute top-0 bottom-0 left-0 w-[1.5px] bg-gradient-to-b from-white/90 via-white/40 to-white/90 pointer-events-none" />

        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg apple-glass-control flex items-center justify-center text-[#7772E8]">
              <History className="w-3.5 h-3.5" />
            </div>
            <h2 className="font-display font-bold text-sm text-[#1D1D26]">
              Conversation History
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-xl apple-glass-control flex items-center justify-center text-[#777784] hover:text-[#1D1D26] cursor-pointer"
            title="Close History"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2 border-b border-white/40">
          <button
            onClick={() => {
              onNewConversation();
              onClose();
            }}
            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#7772E8] to-[#544EC3] text-white text-xs font-bold shadow-md shadow-[#7772E8]/30 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Conversation</span>
          </button>

          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#777784] absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl apple-glass-card text-xs text-[#1D1D26] placeholder-[#777784] outline-hidden border border-white/60 font-medium"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredHistory.length === 0 ? (
            <div className="py-8 text-center text-[#777784]">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-medium">No past conversations</p>
              <p className="text-[10px] mt-0.5 opacity-80">
                Directives you speak or type will appear here.
              </p>
            </div>
          ) : (
            filteredHistory.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectHistoryItem(item);
                  onClose();
                }}
                className="w-full text-left p-2.5 rounded-xl apple-glass-card hover:border-white transition-all group cursor-pointer"
              >
                <div className="flex items-center justify-between text-[10px] text-[#777784]">
                  <span className="font-mono">{item.date}</span>
                  <span className="font-medium">{item.messageCount} msg</span>
                </div>
                <h4 className="font-bold text-xs text-[#1D1D26] group-hover:text-[#524BC0] transition-colors truncate mt-1">
                  {item.title}
                </h4>
                {item.preview && (
                  <p className="text-[10.5px] text-[#5D5D70] line-clamp-2 mt-0.5 leading-snug">
                    {item.preview}
                  </p>
                )}
              </button>
            ))
          )}
        </div>

        {history.length > 0 && (
          <div className="p-3 border-t border-white/40">
            {showClearConfirm ? (
              <div className="space-y-1.5">
                <p className="text-[10px] text-center text-[#1D1D26] font-semibold">
                  Clear all conversation records?
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-1 rounded-lg apple-glass-control text-[11px] font-medium text-[#5D5D70]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      onClearHistory();
                      setShowClearConfirm(false);
                    }}
                    className="flex-1 py-1 rounded-lg bg-rose-500 text-white text-[11px] font-bold"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-1.5 rounded-xl apple-glass-control text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
