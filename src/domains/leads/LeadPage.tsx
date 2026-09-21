import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { UserCheck, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { useLeads } from '../../contexts/LeadRealtimeContext';
import { DataService } from '../../services/DataService';
import { ClienteService } from '../../services/ClienteService';
import { usePermissions } from '../../contexts/PermissionsContext';
import { Lead } from '../../types';
import { LeadForm } from './LeadForm';

export const LeadPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { leads } = useLeads();
  const { userProfile } = usePermissions();
  const [converting, setConverting] = useState(false);

  const isNew = !id || id === 'new';
  const lead = isNew ? null : (leads.find(l => l.id === id) ?? null);

  const handleSave = async (savedLead: Lead, options?: { silent?: boolean }) => {
    try {
      let persisted: any;
      if (savedLead.id && leads.find(l => l.id === savedLead.id)) {
        persisted = await DataService.update('lead', savedLead.id, savedLead);
      } else {
        persisted = await DataService.create('lead', savedLead);
      }
      if (!options?.silent) navigate('/leads');
      return persisted;
    } catch (error) {
      console.error('Error saving lead:', error);
    }
  };

  const handleConvert = async () => {
    if (!lead || converting) return;
    if (!window.confirm(`Converter "${lead.name}" em Cliente?\nO lead será marcado como "Fechado" e os dados serão copiados.`)) return;
    setConverting(true);
    try {
      const clienteId = await ClienteService.convertLeadToCliente(
        lead,
        userProfile?.uid,
        userProfile?.organizationId,
      );
      navigate('/clientes/' + clienteId);
    } catch (e) {
      console.error('Erro ao converter lead:', e);
      alert('Erro ao converter. Tente novamente.');
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Conversion banner — only for existing leads */}
      {!isNew && lead && (
        <div className="shrink-0 bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3">
          {lead.clienteId ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1F8A4C]" />
              <span className="text-[10px] text-slate-500 font-medium">Convertido em cliente</span>
              <Link
                to={`/clientes/${lead.clienteId}`}
                className="flex items-center gap-1 text-[10px] font-black text-gold-deep uppercase tracking-widest hover:text-gold-light transition-colors"
              >
                Ver Cliente <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-[10px] text-slate-400">Lead não convertido em cliente</span>
              <button
                onClick={handleConvert}
                disabled={converting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E4F5EA] border border-[#1F8A4C]/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#1F8A4C] hover:bg-[#1F8A4C]/20 transition-all disabled:opacity-40"
              >
                {converting
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <UserCheck className="w-3 h-3" />}
                Converter para Cliente
              </button>
            </div>
          )}
        </div>
      )}

      <LeadForm
        key={isNew ? 'new' : id}
        lead={lead}
        onSave={handleSave}
        onCancel={() => navigate(-1)}
        onNavigateToLead={(target) => navigate('/leads/' + target.id)}
        pageMode
      />
    </div>
  );
};
