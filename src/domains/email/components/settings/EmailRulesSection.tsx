import React, { useEffect, useState } from 'react';
import { FolderPlus, Plus, Trash2, Loader2, Wand2, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn, generateId } from '../../../../lib/utils';
import { useEmail } from '../../../../contexts/EmailContext';
import { useEmailFolders } from '../../hooks/useEmailFolders';
import { EmailService } from '../../../../services/EmailService';
import { DataService } from '../../../../services/DataService';
import { dataApiClient } from '../../../../lib/dataApiClient';
import { where } from '../../../../lib/queryConstraints';
import { SEGURADORAS } from '../../../../lib/seguradoras';

interface EmailRule {
  id: string;
  accountId: string;
  nome: string;
  matchTipo: 'dominio' | 'remetente_contem' | 'assunto_contem';
  matchValor: string;
  pastaDestinoId: string;
  pastaDestinoNome: string;
  ativo: boolean;
}

// Domínios reais confirmados nesta sessão (mesma pesquisa usada pra baixar os
// logos das seguradoras) — só uma sugestão pro botão de criação em massa; o
// usuário sempre pode criar/editar regras manuais pra qualquer remetente.
const DOMINIO_SEGURADORA: Record<string, string> = {
  porto: 'portoseguro.com.br',
  allianz: 'allianz.com.br',
  zurich: 'zurich.com.br',
  tokio: 'tokiomarine.com.br',
  bradesco: 'bradescoseguros.com.br',
  mapfre: 'mapfre.com.br',
  hdi: 'hdiseguros.com.br',
  azul: 'azulseguros.com.br',
  suhai: 'suhaiseguradora.com',
  yelum: 'yelum.com.br',
  aliro: 'aliro.com.br',
};

const MATCH_LABELS: Record<EmailRule['matchTipo'], string> = {
  dominio: 'Domínio do remetente',
  remetente_contem: 'Remetente contém',
  assunto_contem: 'Assunto contém',
};

const SYSTEM_FOLDER_IDS = new Set(['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'archived']);

const inputCls = "w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-[12px] font-medium focus:border-[#1B4D8F]/60 focus:ring-2 focus:ring-[#1B4D8F]/15 transition-all placeholder:text-slate-300";

export const EmailRulesSection: React.FC = () => {
  const { state } = useEmail();
  const { selectedAccountId, accounts } = state;
  const { folders, refetch: refetchFolders } = useEmailFolders(selectedAccountId);

  const [rules, setRules] = useState<EmailRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [form, setForm] = useState<{ nome: string; matchTipo: EmailRule['matchTipo']; matchValor: string; pastaDestinoId: string }>({
    nome: '', matchTipo: 'dominio', matchValor: '', pastaDestinoId: '',
  });

  useEffect(() => {
    if (!selectedAccountId) { setRules([]); setLoading(false); return; }
    setLoading(true);
    const unsub = DataService.subscribeCollection(
      'email_rules',
      [where('accountId', '==', selectedAccountId)],
      (data: EmailRule[]) => { setRules(data); setLoading(false); },
    );
    return unsub;
  }, [selectedAccountId]);

  const customFolders = folders.filter(f => !SYSTEM_FOLDER_IDS.has(f.id));

  const handleBulkCreate = async () => {
    if (!selectedAccountId) return;
    setBulkRunning(true);
    setBulkMessage(null);
    let pastasCriadas = 0;
    let regrasCriadas = 0;
    try {
      let currentFolders = folders;
      for (const seguradora of SEGURADORAS) {
        let folder = currentFolders.find(f => f.name.toLowerCase() === seguradora.nome.toLowerCase());
        if (!folder) {
          const result = await EmailService.createFolder(selectedAccountId, seguradora.nome, null);
          folder = { id: result.folder.id, name: result.folder.name, parentId: null, unreadCount: 0 };
          currentFolders = [...currentFolders, folder];
          pastasCriadas++;
        }
        const dominio = DOMINIO_SEGURADORA[seguradora.id];
        const jaTemRegra = rules.some(r => r.pastaDestinoId === folder!.id) || !dominio;
        if (!jaTemRegra) {
          await dataApiClient.create('email_rules', {
            id: generateId(),
            accountId: selectedAccountId,
            nome: seguradora.nome,
            matchTipo: 'dominio',
            matchValor: dominio,
            pastaDestinoId: folder.id,
            pastaDestinoNome: folder.name,
            ativo: true,
          });
          regrasCriadas++;
        }
      }
      await refetchFolders();
      setBulkMessage({
        type: 'success',
        text: `${pastasCriadas} pasta(s) nova(s), ${regrasCriadas} regra(s) nova(s). Seguradoras sem domínio confirmado (MSIG) ficaram só com a pasta — crie a regra manualmente abaixo.`,
      });
    } catch (e: any) {
      setBulkMessage({ type: 'error', text: e.message ?? 'Falha ao criar pastas/regras.' });
    } finally {
      setBulkRunning(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!selectedAccountId || !newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await EmailService.createFolder(selectedAccountId, newFolderName.trim(), null);
      setNewFolderName('');
      await refetchFolders();
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleCreateRule = async () => {
    if (!selectedAccountId || !form.nome.trim() || !form.matchValor.trim() || !form.pastaDestinoId) return;
    setSavingRule(true);
    try {
      const pasta = folders.find(f => f.id === form.pastaDestinoId);
      await dataApiClient.create('email_rules', {
        id: generateId(),
        accountId: selectedAccountId,
        nome: form.nome.trim(),
        matchTipo: form.matchTipo,
        matchValor: form.matchValor.trim(),
        pastaDestinoId: form.pastaDestinoId,
        pastaDestinoNome: pasta?.name ?? form.pastaDestinoId,
        ativo: true,
      });
      setForm({ nome: '', matchTipo: 'dominio', matchValor: '', pastaDestinoId: '' });
      setShowForm(false);
    } finally {
      setSavingRule(false);
    }
  };

  const toggleRule = (rule: EmailRule) => dataApiClient.update('email_rules', rule.id, { ativo: !rule.ativo });

  const deleteRule = (rule: EmailRule) => {
    if (!window.confirm(`Excluir a regra "${rule.nome}"?`)) return;
    dataApiClient.remove('email_rules', rule.id);
  };

  if (!selectedAccountId) {
    return <p className="text-slate-500 text-sm">{accounts.length === 0 ? 'Conecte uma conta de e-mail primeiro.' : 'Selecione uma conta de e-mail.'}</p>;
  }

  return (
    <div className="space-y-5">
      {/* Criação em massa pras seguradoras */}
      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-gold-deep/10 flex items-center justify-center text-gold-deep shrink-0">
            <Wand2 className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-slate-800 text-sm font-semibold">Criar pastas e regras para as seguradoras</p>
            <p className="text-slate-500 text-xs mt-0.5">
              Cria uma pasta real na sua caixa de e-mail para cada seguradora e uma regra que move
              automaticamente os e-mails recebidos do domínio de cada uma para a pasta correspondente.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleBulkCreate}
          disabled={bulkRunning}
          className="flex items-center gap-2 px-4 py-2 bg-[#1B4D8F] text-white rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-[#153E73] transition-colors disabled:opacity-50"
        >
          {bulkRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          {bulkRunning ? 'Criando...' : 'Criar pastas e regras das seguradoras'}
        </button>
        {bulkMessage && (
          <div className={cn(
            'flex items-start gap-2 text-[12px] p-2.5 rounded-lg',
            bulkMessage.type === 'success' ? 'bg-[#E4F5EA] text-[#1F8A4C]' : 'bg-[#FDE4E4] text-[#C0392B]',
          )}>
            {bulkMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-px" />}
            {bulkMessage.text}
          </div>
        )}
      </div>

      {/* Criar pasta avulsa */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nova pasta (qualquer nome)</label>
          <input
            className={inputCls}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="Ex: Financeiro, Fornecedores..."
          />
        </div>
        <button
          type="button"
          onClick={handleCreateFolder}
          disabled={creatingFolder || !newFolderName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-[#1B4D8F]/40 hover:text-[#1B4D8F] transition-colors disabled:opacity-40 shrink-0"
        >
          {creatingFolder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />} Criar pasta
        </button>
      </div>

      {/* Lista de regras */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-slate-700 text-sm font-medium">Regras ({rules.length})</p>
          <button
            type="button"
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#1B4D8F] hover:text-[#153E73] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova regra
          </button>
        </div>

        {showForm && (
          <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome da regra</label>
                <input className={inputCls} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Porto Seguro" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Critério</label>
                <select className={inputCls} value={form.matchTipo} onChange={e => setForm(f => ({ ...f, matchTipo: e.target.value as EmailRule['matchTipo'] }))}>
                  {Object.entries(MATCH_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Valor</label>
                <input
                  className={inputCls}
                  value={form.matchValor}
                  onChange={e => setForm(f => ({ ...f, matchValor: e.target.value }))}
                  placeholder={form.matchTipo === 'dominio' ? 'ex: portoseguro.com.br' : form.matchTipo === 'assunto_contem' ? 'ex: apólice' : 'ex: contato@seguradora.com'}
                />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest ml-1">Mover para a pasta</label>
                <select className={inputCls} value={form.pastaDestinoId} onChange={e => setForm(f => ({ ...f, pastaDestinoId: e.target.value }))}>
                  <option value="">Selecione...</option>
                  {customFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700">Cancelar</button>
              <button
                type="button"
                onClick={handleCreateRule}
                disabled={savingRule || !form.nome.trim() || !form.matchValor.trim() || !form.pastaDestinoId}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1B4D8F] text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-[#153E73] transition-colors disabled:opacity-40"
              >
                {savingRule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Salvar regra
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-slate-400 text-xs">Carregando regras...</p>
        ) : rules.length === 0 ? (
          <p className="text-slate-400 text-xs">Nenhuma regra criada ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleRule(rule)}
                  className={cn(
                    'relative inline-flex items-center w-9 h-5 rounded-full transition-colors shrink-0',
                    rule.ativo ? 'bg-[#1B4D8F]' : 'bg-slate-200',
                  )}
                  title={rule.ativo ? 'Desativar regra' : 'Ativar regra'}
                >
                  <span className={cn('absolute w-4 h-4 bg-white rounded-full shadow transition-transform', rule.ativo ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-800 text-[12px] font-semibold truncate">{rule.nome}</p>
                  <p className="text-slate-400 text-[11px] truncate">
                    {MATCH_LABELS[rule.matchTipo]}: <span className="font-mono">{rule.matchValor}</span> → <span className="font-medium text-slate-600">{rule.pastaDestinoNome}</span>
                  </p>
                </div>
                <button type="button" onClick={() => deleteRule(rule)} className="p-1.5 text-slate-300 hover:text-[#C0392B] transition-colors shrink-0" title="Excluir regra">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
