import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const SensitiveContent = ({ 
  value, 
  maskFn, 
  canView 
}: { 
  value: string; 
  maskFn: (v: string) => string; 
  canView: boolean;
}) => {
  const [show, setShow] = useState(false);
  
  if (!value) return <span className="text-white/20">---</span>;

  if (canView) {
    return (
      <div className="flex items-center gap-2 group">
        <span className="truncate">{show ? value : maskFn(value)}</span>
        <button 
          onClick={(e) => { e.stopPropagation(); setShow(!show); }} 
          className="p-1 hover:bg-white/10 rounded-lg transition-colors shrink-0"
          title={show ? "Ocultar dado" : "Ver dado completo"}
        >
          {show ? <EyeOff className="w-3.5 h-3.5 text-white/30" /> : <Eye className="w-3.5 h-3.5 text-white/30" />}
        </button>
      </div>
    );
  }

  return (
    <span className="truncate font-mono">{maskFn(value)}</span>
  );
};
