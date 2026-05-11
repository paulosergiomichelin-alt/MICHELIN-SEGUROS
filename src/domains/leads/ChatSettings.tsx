
import React from 'react';
import { 
  Type, 
  ZoomIn, 
  Maximize2, 
  RotateCcw,
  Settings,
  Plus,
  Minus,
  Layout
} from 'lucide-react';
import { useChatPreferences } from '../../hooks/useAppContexts';
import { cn } from '../../lib/utils';

export const ChatSettings: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { preferences, updatePreferences, resetPreferences, isUpdating } = useChatPreferences();

  if (!isOpen) return null;

  return (
    <div className="absolute right-4 top-16 w-72 bg-white rounded-3xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-gold-deep" />
          <h3 className="text-xs font-black uppercase text-slate-900 tracking-widest">Visualização</h3>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-white rounded-lg transition-colors"
        >
          <RotateCcw 
            className={cn("w-3.5 h-3.5 text-slate-400 hover:text-gold-deep transition-all", isUpdating && "animate-spin")}
            onClick={(e) => {
              e.stopPropagation();
              resetPreferences();
            }}
          />
        </button>
      </div>

      <div className="p-5 space-y-6">
        {/* Font Size */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 tracking-wider">
              <Type className="w-3 h-3" />
              Tamanho da Fonte
            </span>
            <span className="text-[10px] font-bold text-gold-deep">{preferences.fontSize}px</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => updatePreferences({ fontSize: Math.max(10, preferences.fontSize - 1) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input 
              type="range"
              min="10"
              max="24"
              value={preferences.fontSize}
              onChange={(e) => updatePreferences({ fontSize: parseInt(e.target.value) })}
              className="flex-1 accent-gold-deep h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
            />
            <button 
              onClick={() => updatePreferences({ fontSize: Math.min(24, preferences.fontSize + 1) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Zoom */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 tracking-wider">
              <ZoomIn className="w-3 h-3" />
              Zoom Interface
            </span>
            <span className="text-[10px] font-bold text-gold-deep">{preferences.chatZoom}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => updatePreferences({ chatZoom: Math.max(80, preferences.chatZoom - 5) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input 
              type="range"
              min="80"
              max="150"
              step="5"
              value={preferences.chatZoom}
              onChange={(e) => updatePreferences({ chatZoom: parseInt(e.target.value) })}
              className="flex-1 accent-gold-deep h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
            />
            <button 
              onClick={() => updatePreferences({ chatZoom: Math.min(150, preferences.chatZoom + 5) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Message Spacing */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 tracking-wider">
              <Maximize2 className="w-3 h-3" />
              Espaçamento
            </span>
            <span className="text-[10px] font-bold text-gold-deep">{preferences.messageSpacing}px</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => updatePreferences({ messageSpacing: Math.max(4, preferences.messageSpacing - 2) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input 
              type="range"
              min="4"
              max="32"
              step="2"
              value={preferences.messageSpacing}
              onChange={(e) => updatePreferences({ messageSpacing: parseInt(e.target.value) })}
              className="flex-1 accent-gold-deep h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
            />
            <button 
              onClick={() => updatePreferences({ messageSpacing: Math.min(32, preferences.messageSpacing + 2) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Bubble Size */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2 tracking-wider">
              <Layout className="w-3 h-3" />
              Largura das Bolhas
            </span>
            <span className="text-[10px] font-bold text-gold-deep">{preferences.bubbleSize}%</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => updatePreferences({ bubbleSize: Math.max(50, preferences.bubbleSize - 5) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input 
              type="range"
              min="50"
              max="130"
              step="5"
              value={preferences.bubbleSize}
              onChange={(e) => updatePreferences({ bubbleSize: parseInt(e.target.value) })}
              className="flex-1 accent-gold-deep h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
            />
            <button 
              onClick={() => updatePreferences({ bubbleSize: Math.min(130, preferences.bubbleSize + 5) })}
              className="p-2 bg-slate-100 hover:bg-gold-light/20 rounded-xl text-slate-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Layout Reset */}
        <div className="pt-2 border-t border-slate-100">
           <button 
            onClick={() => updatePreferences({ leftWidth: 320, rightWidth: 320 })}
            className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-500 text-[9px] font-bold uppercase rounded-xl transition-all border border-slate-200 flex items-center justify-center gap-2 tracking-widest"
          >
            <Layout className="w-3 h-3" />
            Restaurar Layout Padrão
          </button>
        </div>

        {/* Restore Defaults */}
        <button 
          onClick={resetPreferences}
          className="w-full py-3 bg-brand-dark hover:bg-brand-black text-gold-deep text-[9px] font-black uppercase rounded-2xl transition-all border border-gold-deep/20 flex items-center justify-center gap-2 tracking-[0.2em]"
        >
          <RotateCcw className="w-3 h-3" />
          Restaurar Padrão
        </button>
      </div>
    </div>
  );
};
