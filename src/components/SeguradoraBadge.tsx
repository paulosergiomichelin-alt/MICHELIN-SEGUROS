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

  const hasLogo = !!logo && !imgError;

  // Logos reais das seguradoras já trazem o nome escrito (ver InsurerLogosSettings) — uma
  // altura fixa com largura livre (em vez de uma caixa quadrada) evita espremer um logotipo
  // largo numa miniatura ilegível, e o rótulo de texto ao lado fica redundante nesse caso.
  const logoBoxSize = size === 'xs' ? 'h-6 max-w-[84px]' : size === 'sm' ? 'h-8 max-w-[110px]' : 'h-10 max-w-[140px]';
  const avatarSize = size === 'xs' ? 'w-6 h-6 text-[9px]' : size === 'sm' ? 'w-8 h-8 text-[11px]' : 'w-10 h-10 text-sm';
  const textSize  = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {hasLogo ? (
        <div className={cn('rounded-md overflow-hidden shrink-0 bg-white flex items-center justify-center px-1', logoBoxSize)}>
          <img
            src={logo}
            alt={nome}
            className="h-full w-auto max-w-full object-contain"
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
      {showName && !hasLogo && (
        <span className={cn('font-semibold text-[var(--text-primary)] opacity-80 truncate', textSize)}>{nome}</span>
      )}
    </div>
  );
};
