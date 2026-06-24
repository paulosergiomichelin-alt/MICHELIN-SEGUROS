import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertTriangle, Loader2, FileText } from 'lucide-react';
import type { NfseStatus } from '../../../types';

const STATUS_CFG: Record<NfseStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  Icon: React.ElementType;
  spin?: boolean;
}> = {
  rascunho:    { label: 'Rascunho',    color: '#8E8E93', bg: 'rgba(142,142,147,0.08)', border: 'rgba(142,142,147,0.25)', Icon: FileText },
  processando: { label: 'Processando', color: '#60A5FA', bg: 'rgba(96,165,250,0.08)',  border: 'rgba(96,165,250,0.25)',  Icon: Loader2, spin: true },
  emitida:     { label: 'Emitida',     color: '#4ADE80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.25)',  Icon: CheckCircle2 },
  cancelada:   { label: 'Cancelada',   color: '#F87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)', Icon: XCircle },
  erro:        { label: 'Erro',        color: '#FBBF24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)',  Icon: AlertTriangle },
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold uppercase tracking-[0.12em] ${textCls}`}
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <Icon className={`w-3 h-3 shrink-0 ${cfg.spin ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

export function NfseEnvironmentBadge({ env }: { env: 'homologacao' | 'producao' }) {
  if (env === 'producao') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-green-500/10 text-green-400 border border-green-500/20">
        PRODUÇÃO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
      HOMOLOGAÇÃO
    </span>
  );
}
