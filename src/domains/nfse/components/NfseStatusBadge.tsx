import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, FileText } from 'lucide-react';
import type { NfseStatus } from '../../../types';
import { Badge } from '../../../components/ui';
import { cn } from '../../../lib/utils';

const STATUS_CFG: Record<NfseStatus, {
  label: string;
  className: string;
  Icon: React.ElementType;
  spin?: boolean;
}> = {
  rascunho:    { label: 'Rascunho',    className: 'bg-slate-100 text-slate-600 border-slate-200',       Icon: FileText },
  processando: { label: 'Processando', className: 'bg-[#EAF1F9] text-[#1B4D8F] border-[#1B4D8F]/20',    Icon: Loader2, spin: true },
  emitida:     { label: 'Emitida',     className: 'bg-[#E4F5EA] text-[#1F8A4C] border-[#1F8A4C]/20',    Icon: CheckCircle2 },
  cancelada:   { label: 'Cancelada',   className: 'bg-[#FDE4E4] text-[#C0392B] border-[#C0392B]/20',    Icon: XCircle },
  erro:        { label: 'Erro',        className: 'bg-[#FFF3DC] text-[#B8860B] border-[#B8860B]/20',    Icon: AlertTriangle },
};

interface Props {
  status: NfseStatus;
  size?: 'sm' | 'md';
}

export function NfseStatusBadge({ status, size = 'md' }: Props) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.rascunho;
  const Icon = cfg.Icon;
  const textCls = size === 'sm' ? 'text-[8px]' : 'text-[9.5px]';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-[0.12em] border',
        textCls,
        cfg.className,
      )}
    >
      <Icon className={cn('w-3 h-3 shrink-0', cfg.spin && 'animate-spin')} />
      {cfg.label}
    </span>
  );
}

export function NfseEnvironmentBadge({ env }: { env: 'homologacao' | 'producao' }) {
  return (
    <Badge variant={env === 'producao' ? 'success' : 'warning'}>
      {env === 'producao' ? 'Produção' : 'Homologação'}
    </Badge>
  );
}
