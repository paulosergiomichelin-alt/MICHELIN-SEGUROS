import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { getSeguradora } from '../lib/seguradoras';
import { ensureSeguradorasLogosLoaded, getSeguradoraLogo, subscribeSeguradoraLogos } from '../lib/seguradorasLogos';

interface SeguradoraBadgeProps {
  seguradoraId: string;
  size?: 'xs' | 'sm' | 'md';
  showName?: boolean;
  className?: string;
}

export const SeguradoraBadge: React.FC<SeguradoraBadgeProps> = ({
  seguradoraId,
  size = 'sm',
  showName = true,
  className,
}) => {
  const seg = getSeguradora(seguradoraId);
  const nome = seg?.nome ?? seguradoraId;
  const cor = seg?.cor ?? '#555';
  const inicial = nome.charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    ensureSeguradorasLogosLoaded();
    return subscribeSeguradoraLogos(() => forceUpdate(n => n + 1));
  }, []);

  const logo = getSeguradoraLogo(seguradoraId);

  // Se o logo mudar (ex: admin acabou de subir um novo), esquece um eventual erro anterior.
  useEffect(() => { setImgError(false); }, [logo]);

  const avatarSize = size === 'xs' ? 'w-5 h-5 text-[9px]' : size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';
  const textSize  = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {logo && !imgError ? (
        <div className={cn('rounded-md overflow-hidden shrink-0 bg-white flex items-center justify-center', avatarSize)}>
          <img
            src={logo}
            alt={nome}
            className="w-full h-full object-contain p-[2px]"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div
          className={cn('rounded-md flex items-center justify-center font-black text-white shrink-0', avatarSize)}
          style={{ backgroundColor: cor }}
        >
          {inicial}
        </div>
      )}
      {showName && (
        <span className={cn('font-semibold text-[var(--text-primary)] opacity-80 truncate', textSize)}>{nome}</span>
      )}
    </div>
  );
};
