import React, { useEffect, useState } from 'react';
import { Package, Save, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dataApiClient } from '../../lib/dataApiClient';

export interface PacoteCobertura {
  codigoCobertura: string;
  codigoFranquia: string;
  percentualFranquia: string;
  tipoModalidade: string;
  danosMateriais: string;
  danosCorporais: string;
  danosMorais: string;
  appMorteInvalidez: string;
  tipoAssistencia: 'N' | 'C' | 'V';
  vidros: string;
  carroReserva: string;
  carroReservaAr: 'N' | 'S';
}

export type PacotesCobertura = Record<string, PacoteCobertura>;

export const PACOTE_NOMES = ['Bronze', 'Prata', 'Ouro', 'Diamante'];

const PACOTE_VAZIO: PacoteCobertura = {
  codigoCobertura: '1',
  codigoFranquia: '1',
  percentualFranquia: '100',
  tipoModalidade: 'A',
  danosMateriais: '',
  danosCorporais: '',
  danosMorais: '',
  appMorteInvalidez: '',
  tipoAssistencia: 'C',
  vidros: 'Básico',
  carroReserva: 'Básico 7 dias',
  carroReservaAr: 'N',
};

export const ENTITY_ID_PACOTES = 'multicalculo_pacotes';

const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[12px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all placeholder:text-slate-300";

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</label>
    {children}
  </div>
);

export const PacotesCoberturaSettings: React.FC = () => {
  const [pacotes, setPacotes] = useState<PacotesCobertura>(() =>
    Object.fromEntries(PACOTE_NOMES.map(n => [n, { ...PACOTE_VAZIO }]))
  );
  const [activePacote, setActivePacote] = useState('Bronze');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dataApiClient.get('settings', ENTITY_ID_PACOTES).then((row: any) => {
      if (row) {
        setPacotes(prev => {
          const merged = { ...prev };
          for (const nome of PACOTE_NOMES) {
            if (row[nome]) merged[nome] = { ...PACOTE_VAZIO, ...row[nome] };
          }
          return merged;
        });
      }
    }).finally(() => setLoading(false));
  }, []);

  const set = (field: keyof PacoteCobertura, value: string) => {
    setPacotes(prev => ({ ...prev, [activePacote]: { ...prev[activePacote], [field]: value } }));
  };

  const salvar = async () => {
    setSaving(true);
    try {
      await dataApiClient.save('settings', ENTITY_ID_PACOTES, pacotes);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-slate-400 text-[11px] p-6">Carregando...</div>;

  const p = pacotes[activePacote];

  return (
    <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 border-l-4 border-gold-deep pl-4">
          <Package className="w-5 h-5 text-gold-deep" />
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Pacotes de Cobertura</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Ao escolher um pacote no Multicálculo, esses campos são preenchidos automaticamente.</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {PACOTE_NOMES.map(nome => (
          <button
            key={nome}
            type="button"
            onClick={() => setActivePacote(nome)}
            className={cn(
              'px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all',
              activePacote === nome
                ? 'bg-[#1B4D8F] text-white border-[#1B4D8F]'
                : 'bg-white text-slate-500 border-slate-200 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F]',
            )}
          >
            {nome}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Tipo de Cobertura">
          <select className={inputCls} value={p.codigoCobertura} onChange={e => set('codigoCobertura', e.target.value)}>
            <option value="1">Compreensiva</option><option value="2">Incêndio e Roubo</option><option value="3">RCF-V</option>
            <option value="4">Colisão e Incêndio</option><option value="5">Indenização Integral</option><option value="6">Assistência Exclusiva</option>
          </select>
        </Field>
        <Field label="Tipo de Franquia">
          <select className={inputCls} value={p.codigoFranquia} onChange={e => set('codigoFranquia', e.target.value)}>
            <option value="1">Básica</option><option value="4">50% da Básica</option><option value="6">25% da Básica</option>
            <option value="7">75% da Básica</option><option value="2">150% da Básica</option><option value="3">200% da Básica</option>
          </select>
        </Field>
        <Field label="% Franquia">
          <input className={inputCls} value={p.percentualFranquia} onChange={e => set('percentualFranquia', e.target.value)} placeholder="100" />
        </Field>
        <Field label="Tipo de Modalidade">
          <select className={inputCls} value={p.tipoModalidade} onChange={e => set('tipoModalidade', e.target.value)}>
            <option value="A">Valor Ajustável</option><option value="D">Valor Determinado</option>
          </select>
        </Field>

        <div className="md:col-span-2 pt-2 mt-1 border-t border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">RCF / APP</p>
        </div>
        <Field label="Danos Materiais (R$)">
          <input className={inputCls} value={p.danosMateriais} onChange={e => set('danosMateriais', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Danos Corporais (R$)">
          <input className={inputCls} value={p.danosCorporais} onChange={e => set('danosCorporais', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Danos Morais (R$)">
          <input className={inputCls} value={p.danosMorais} onChange={e => set('danosMorais', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Morte/Invalidez (APP)">
          <input className={inputCls} value={p.appMorteInvalidez} onChange={e => set('appMorteInvalidez', e.target.value)} placeholder="0,00" />
        </Field>

        <div className="md:col-span-2 pt-2 mt-1 border-t border-slate-100">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Serviços</p>
        </div>
        <Field label="Assistência">
          <select className={inputCls} value={p.tipoAssistencia} onChange={e => set('tipoAssistencia', e.target.value)}>
            <option value="N">Não possui</option><option value="C">Básica</option><option value="V">VIP</option>
          </select>
        </Field>
        <Field label="Vidros">
          <select className={inputCls} value={p.vidros} onChange={e => set('vidros', e.target.value)}>
            <option value="Não">Não</option><option value="Básico">Básico</option><option value="Completo">Completo</option>
          </select>
        </Field>
        <Field label="Carro Reserva">
          <select className={inputCls} value={p.carroReserva} onChange={e => set('carroReserva', e.target.value)}>
            <option value="Não">Não</option><option value="Básico 7 dias">Básico 7 dias</option><option value="Básico 15 dias">Básico 15 dias</option>
          </select>
        </Field>
        <Field label="Carro Reserva c/ Ar">
          <select className={inputCls} value={p.carroReservaAr} onChange={e => set('carroReservaAr', e.target.value)}>
            <option value="N">Não</option><option value="S">Sim</option>
          </select>
        </Field>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={salvar}
          disabled={saving}
          className={cn(
            'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
            saved ? 'bg-[#E4F5EA] border border-[#1F8A4C]/40 text-[#1F8A4C]' : 'bg-[#1B4D8F] text-white hover:bg-[#153E73] disabled:opacity-40',
          )}
        >
          {saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Salvo</> : <><Save className="w-3.5 h-3.5" /> Salvar pacotes</>}
        </button>
      </div>
    </section>
  );
};
