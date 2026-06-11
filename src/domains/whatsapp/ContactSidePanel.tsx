import React, { useState, useEffect } from 'react';
import {
  User, Phone, Mail, FileText, RefreshCw, ExternalLink, ChevronRight,
  AlertTriangle, CheckCircle2, Clock, Briefcase, UserPlus,
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Lead, Cliente, Apolice } from '../../types';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { SeguradoraBadge } from '../../components/SeguradoraBadge';
import { usePermissions } from '../../contexts/PermissionsContext';

interface ContactSidePanelProps {
  phone: string;
  leadId?: string;
  clienteId?: string;
  contactName?: string;
  onLeadCreated?: (leadId: string) => void;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return iso; }
}

function fmtMoney(cents?: number) {
  if (!cents) return '—';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCPF(cpf?: string) {
  if (!cpf) return '—';
  const n = cpf.replace(/\D/g, '');
  return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

const APOLICE_STATUS_COLOR: Record<string, string> = {
  ativo: 'text-emerald-400', em_renovacao: 'text-amber-300',
  expirado: 'text-red-400', cancelado: 'text-white/20',
};

export const ContactSidePanel: React.FC<ContactSidePanelProps> = ({
  phone, leadId, clienteId, contactName, onLeadCreated,
}) => {
  const navigate = useNavigate();
  const { userProfile } = usePermissions();
  const [lead, setLead] = useState<Lead | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [apolices, setApolices] = useState<Apolice[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingLead, setCreatingLead] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLead(null); setCliente(null); setApolices([]);

    async function load() {
      // Load lead
      if (leadId) {
        const l = await DataService.get('lead', leadId).catch(() => null);
        if (!cancelled && l) setLead(l as Lead);
      }
      // Load cliente
      if (clienteId) {
        const c = await DataService.get('cliente', clienteId).catch(() => null);
        if (!cancelled && c) setCliente(c as Cliente);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [leadId, clienteId]);

  // Subscribe to apólices if we have a cliente
  useEffect(() => {
    if (!clienteId) { setApolices([]); return; }
    return ClienteService.subscribeApolices(clienteId, setApolices);
  }, [clienteId]);

  const handleCreateLead = async () => {
    setCreatingLead(true);
    try {
      const now = new Date().toISOString();
      const newId = await DataService.create('lead', {
        name: contactName || `WhatsApp ${phone}`,
        phone, phone2: '', email: '', cpf: '', rg: '',
        birthDate: '', civilStatus: '', plate: '', chassis: '',
        hasInsurance: false, fiduciaryAlienation: false,
        isDifferentResidenceZip: false, serviceUsage: false,
        youngDriverHousehold: false, isOwnerDriver: true,
        zipCodeOvernight: '', documents: {},
        status: 'Novo Lead', origin: 'WhatsApp QR',
        iaActive: false, responsibleAgentType: 'humano',
        organizationId: userProfile?.organizationId,
        vendedorId: userProfile?.uid,
        createdAt: now, updatedAt: now,
      });
      onLeadCreated?.(String(newId));
    } finally {
      setCreatingLead(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-gold-deep/30 border-t-gold-deep rounded-full animate-spin" />
      </div>
    );
  }

  const hasContact = lead || cliente;

  return (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">

      {/* Contact header */}
      <div className="shrink-0 p-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-white/30" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-white truncate">{contactName || `+${phone}`}</p>
            <p className="text-[10px] text-white/40 font-mono">{phone}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-4">

        {/* No contact — offer to create lead */}
        {!hasContact && (
          <div className="bg-brand-black/50 border border-white/5 rounded-xl p-4 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-white/10 mx-auto" />
            <p className="text-[10px] text-white/40">Contato não identificado no CRM</p>
            <button
              onClick={handleCreateLead}
              disabled={creatingLead}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gold-deep text-brand-dark rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-gold-light transition-all disabled:opacity-50"
            >
              <UserPlus className="w-3.5 h-3.5" />
              {creatingLead ? 'Criando...' : 'Criar Lead'}
            </button>
          </div>
        )}

        {/* Lead info */}
        {lead && !cliente && (
          <div className="bg-brand-black/50 border border-amber-500/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Lead</span>
              </div>
              <button onClick={() => navigate(`/leads/${lead.id}`)} className="text-white/20 hover:text-gold-deep transition-colors">
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div>
              <p className="text-[12px] font-bold text-white">{lead.name}</p>
              <p className="text-[10px] text-white/40 font-mono mt-0.5">{fmtCPF(lead.cpf)}</p>
            </div>
            {[
              ['Status', lead.status],
              ['Temperatura', lead.temperature],
              ['Origem', lead.origin],
              ['E-mail', lead.email],
              ['Placa', lead.plate],
            ].map(([k, v]) => v ? (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-[9px] text-white/30 uppercase font-black tracking-widest">{k}</span>
                <span className="text-[10px] text-white/70 font-medium text-right capitalize">{v}</span>
              </div>
            ) : null)}
            {/* Actions */}
            <div className="pt-2 space-y-1.5">
              <button
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <span>Abrir Cadastro</span><ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Cliente info */}
        {cliente && (
          <div className="bg-brand-black/50 border border-emerald-500/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Cliente</span>
              </div>
              <button onClick={() => navigate(`/clientes/${cliente.id}`)} className="text-white/20 hover:text-gold-deep transition-colors">
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div>
              <p className="text-[12px] font-bold text-white">{cliente.nome}</p>
              <p className="text-[10px] text-white/40 font-mono mt-0.5">{fmtCPF(cliente.cpf)}</p>
            </div>
            {[
              ['E-mail', cliente.email],
              ['Cidade', [cliente.cidade, cliente.estado].filter(Boolean).join(' / ')],
            ].map(([k, v]) => v ? (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-[9px] text-white/30 uppercase font-black tracking-widest">{k}</span>
                <span className="text-[10px] text-white/70 font-medium text-right">{v}</span>
              </div>
            ) : null)}
            <button
              onClick={() => navigate(`/clientes/${cliente.id}`)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <span>Ver Cadastro Completo</span><ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Apólices */}
        {apolices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-gold-deep" />
              <span className="text-[9px] font-black text-gold-light uppercase tracking-widest">Apólices ({apolices.length})</span>
            </div>
            {apolices.map(a => {
              const daysToRenew = a.dataRenovacao
                ? differenceInDays(parseISO(a.dataRenovacao), new Date())
                : null;
              return (
                <div key={a.id} className="bg-brand-black/50 border border-white/5 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-white">{a.produto}</p>
                    <SeguradoraBadge seguradoraId={a.seguradoraId} size="xs" />
                  </div>
                  {a.numeroApolice && <p className="text-[9px] text-white/30 font-mono">#{a.numeroApolice}</p>}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <p className="text-[8px] text-white/20 uppercase font-black">Vigência</p>
                      <p className="text-[9px] text-white/60">{fmtDate(a.fimVigencia)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-white/20 uppercase font-black">Renovação</p>
                      <p className={cn('text-[9px] font-bold',
                        daysToRenew !== null && daysToRenew <= 7 ? 'text-red-400' :
                        daysToRenew !== null && daysToRenew <= 30 ? 'text-amber-300' : 'text-white/60'
                      )}>
                        {fmtDate(a.dataRenovacao)}
                        {daysToRenew !== null && daysToRenew >= 0 && (
                          <span className="ml-1 text-[8px] opacity-70">({daysToRenew}d)</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-white/20 uppercase font-black">Prêmio</p>
                      <p className="text-[9px] text-white/60">{fmtMoney(a.valorTotal)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-white/20 uppercase font-black">Status</p>
                      <p className={cn('text-[9px] font-black uppercase', APOLICE_STATUS_COLOR[a.status])}>
                        {a.status.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  {daysToRenew !== null && daysToRenew <= 30 && daysToRenew >= 0 && (
                    <div className={cn('flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[9px] font-black',
                      daysToRenew <= 7 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-300'
                    )}>
                      <AlertTriangle className="w-3 h-3" />
                      Renovação em {daysToRenew === 0 ? 'HOJE' : `${daysToRenew} dias`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Quick actions */}
        {hasContact && (
          <div className="space-y-2">
            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">Ações Rápidas</p>
            {cliente && (
              <button
                onClick={() => navigate(`/clientes/${cliente.id}?tab=apolices`)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <span>Nova Apólice</span><ChevronRight className="w-3 h-3" />
              </button>
            )}
            {lead && !cliente && (
              <button
                onClick={() => navigate(`/leads/${lead.id}`)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
              >
                <span>Converter em Cliente</span><ChevronRight className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => navigate('/renovacoes')}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              <span>Ver Renovações</span><ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
