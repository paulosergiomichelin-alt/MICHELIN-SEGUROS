import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  Bell,
  User,
  PenLine,
  ToggleRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Mail,
  FolderTree,
  ArrowLeft,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useEmail } from '../../contexts/EmailContext';
import { EmailSettings } from '../../services/EmailService';
import { Button, Input, Select, Textarea } from '../../components/ui';
import { EmailRulesSection } from './components/settings/EmailRulesSection';
import { SignatureEditor } from './components/settings/SignatureEditor';

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle: React.FC<{
  enabled: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}> = ({ enabled, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={cn(
      'relative inline-flex items-center w-10 h-5 rounded-full transition-colors shrink-0',
      enabled ? 'bg-[#1B4D8F]' : 'bg-slate-200',
    )}
    aria-pressed={enabled}
  >
    <span
      className={cn(
        'absolute w-4 h-4 bg-white rounded-full shadow transition-transform',
        enabled ? 'translate-x-5' : 'translate-x-0.5',
      )}
    />
  </button>
);

// ─── SectionCard ──────────────────────────────────────────────────────────────

const SectionCard: React.FC<{
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, children, className }) => (
  <div className={cn('bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col', className)}>
    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
      <div className="w-8 h-8 rounded-lg bg-gold-deep/10 flex items-center justify-center text-gold-deep shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-slate-800 font-semibold text-sm">{title}</h2>
        {description && <p className="text-slate-500 text-xs mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="px-6 py-5 space-y-4 flex-1">
      {children}
    </div>
  </div>
);

// ─── EmailSettingsPage ────────────────────────────────────────────────────────

export const EmailSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, loadSettings, saveSettings } = useEmail();
  const { settings, accounts, loading } = state;

  const [form, setForm] = useState<Partial<EmailSettings>>({
    displayName: '',
    signature: '',
    defaultAccountId: '',
    autoReply: { enabled: false, subject: '', body: '' },
    notifications: { newEmail: true, desktop: false },
  });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Sync form with loaded settings
  useEffect(() => {
    if (settings) {
      setForm({
        displayName: settings.displayName ?? '',
        signature: settings.signature ?? '',
        defaultAccountId: settings.defaultAccountId ?? accounts[0]?.id ?? '',
        autoReply: settings.autoReply ?? { enabled: false, subject: '', body: '' },
        notifications: settings.notifications ?? { newEmail: true, desktop: false },
      });
    }
  }, [settings, accounts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus('idle');
    try {
      await saveSettings(form);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const updateAutoReply = (key: string, value: string | boolean) => {
    setForm(prev => ({
      ...prev,
      autoReply: { ...(prev.autoReply ?? { enabled: false, subject: '', body: '' }), [key]: value },
    }));
  };

  const updateNotifications = (key: string, value: boolean) => {
    setForm(prev => ({
      ...prev,
      notifications: { ...(prev.notifications ?? { newEmail: true, desktop: false }), [key]: value },
    }));
  };

  if (loading && !settings) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <form onSubmit={handleSave} className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/email')}
            title="Voltar para E-mails"
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-[#1B4D8F] hover:border-[#1B4D8F]/30 transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gold-deep/10 border border-gold-deep/25 flex items-center justify-center shrink-0">
            <Mail className="w-4 h-4 text-gold-deep" />
          </div>
          <div>
            <h1 className="text-[15px] font-black text-slate-900 uppercase tracking-widest">Configurações de E-mail</h1>
            <p className="text-[10px] text-slate-500 font-medium">Personalize o comportamento do módulo de e-mail</p>
          </div>
        </div>

        {/* Status feedback */}
        <AnimatePresence>
          {saveStatus !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn(
                'flex items-center gap-2 px-4 py-3 rounded-xl text-sm border',
                saveStatus === 'success'
                  ? 'bg-[#E4F5EA] border-[#1F8A4C]/20 text-[#1F8A4C]'
                  : 'bg-[#FDE4E4] border-[#C0392B]/20 text-[#C0392B]',
              )}
            >
              {saveStatus === 'success' ? (
                <><CheckCircle className="w-4 h-4 shrink-0" /> Configurações salvas com sucesso.</>
              ) : (
                <><AlertCircle className="w-4 h-4 shrink-0" /> Falha ao salvar configurações.</>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Account defaults */}
          <SectionCard
            title="Conta Padrão"
            description="Conta usada por padrão ao enviar novos e-mails"
            icon={<Mail className="w-4 h-4" />}
          >
            {accounts.length === 0 ? (
              <p className="text-slate-500 text-sm">Nenhuma conta conectada.</p>
            ) : (
              <Select
                label="Conta padrão para envio"
                value={form.defaultAccountId ?? ''}
                onChange={e => setForm(prev => ({ ...prev, defaultAccountId: e.target.value }))}
              >
                <option value="">Selecionar conta...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.email} {acc.isDefault ? '(padrão atual)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </SectionCard>

          {/* Display name */}
          <SectionCard
            title="Identidade do Remetente"
            description="Nome exibido quando você envia e-mails"
            icon={<User className="w-4 h-4" />}
          >
            <Input
              label="Nome do remetente"
              type="text"
              value={form.displayName ?? ''}
              onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder="Ex: Paulo Michelin"
            />
            <p className="text-slate-400 text-[11px] -mt-2 ml-1">Deixe em branco para usar o nome da conta</p>
          </SectionCard>

          {/* Signature — editor rico precisa de mais espaço horizontal, ocupa as 2 colunas */}
          <SectionCard
            title="Assinatura"
            description="Adicionada automaticamente ao final dos e-mails enviados"
            icon={<PenLine className="w-4 h-4" />}
            className="lg:col-span-2"
          >
            <SignatureEditor
              value={form.signature ?? ''}
              onChange={html => setForm(prev => ({ ...prev, signature: html }))}
            />
          </SectionCard>

          {/* Pastas e regras — também precisa de mais espaço (lista de regras, formulário) */}
          <SectionCard
            title="Pastas e Regras"
            description="Organize e-mails automaticamente em pastas por seguradora ou remetente"
            icon={<FolderTree className="w-4 h-4" />}
            className="lg:col-span-2"
          >
            <EmailRulesSection />
          </SectionCard>

          {/* Auto-reply */}
          <SectionCard
            title="Resposta Automática"
            description="Responda automaticamente a e-mails recebidos"
            icon={<ToggleRight className="w-4 h-4" />}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-700 text-sm font-medium">Ativar resposta automática</p>
                <p className="text-slate-400 text-xs mt-0.5">Responde automaticamente a novos e-mails recebidos</p>
              </div>
              <Toggle
                enabled={form.autoReply?.enabled ?? false}
                onChange={v => updateAutoReply('enabled', v)}
              />
            </div>

            <AnimatePresence>
              {form.autoReply?.enabled && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-2 space-y-4">
                    <Input
                      label="Assunto da resposta automática"
                      type="text"
                      value={form.autoReply?.subject ?? ''}
                      onChange={e => updateAutoReply('subject', e.target.value)}
                      placeholder="Ex: Recebi sua mensagem"
                    />
                    <Textarea
                      label="Corpo da resposta automática"
                      value={form.autoReply?.body ?? ''}
                      onChange={e => updateAutoReply('body', e.target.value)}
                      rows={4}
                      placeholder="Ex: Olá! Recebi sua mensagem e responderei em breve. Obrigado."
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </SectionCard>

          {/* Notifications */}
          <SectionCard
            title="Notificações"
            description="Configure como você quer ser notificado sobre novos e-mails"
            icon={<Bell className="w-4 h-4" />}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-700 text-sm font-medium">Notificações de novos e-mails</p>
                  <p className="text-slate-400 text-xs mt-0.5">Exibe uma notificação quando novos e-mails chegam</p>
                </div>
                <Toggle
                  enabled={form.notifications?.newEmail ?? true}
                  onChange={v => updateNotifications('newEmail', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-700 text-sm font-medium">Notificações do sistema</p>
                  <p className="text-slate-400 text-xs mt-0.5">Notificações push no navegador (requer permissão)</p>
                </div>
                <Toggle
                  enabled={form.notifications?.desktop ?? false}
                  onChange={v => updateNotifications('desktop', v)}
                />
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Save button */}
        <div className="flex justify-end pb-8">
          <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>
      </form>
    </div>
  );
};
