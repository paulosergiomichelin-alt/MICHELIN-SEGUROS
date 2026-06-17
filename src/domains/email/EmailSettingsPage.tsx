import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { useEmail } from '../../contexts/EmailContext';
import { EmailSettings } from '../../services/EmailService';

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
      enabled ? 'bg-blue-600' : 'bg-white/15',
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
}> = ({ title, description, icon, children }) => (
  <div className="bg-[#1a1a1a] border border-white/8 rounded-2xl overflow-hidden">
    <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-white/80 font-semibold text-sm">{title}</h2>
        {description && <p className="text-white/35 text-xs mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="px-6 py-5 space-y-4">
      {children}
    </div>
  </div>
);

// ─── FieldLabel ───────────────────────────────────────────────────────────────

const FieldLabel: React.FC<{ label: string; hint?: string }> = ({ label, hint }) => (
  <div className="mb-1.5">
    <label className="block text-white/60 text-xs font-medium">{label}</label>
    {hint && <p className="text-white/25 text-[11px] mt-0.5">{hint}</p>}
  </div>
);

// ─── EmailSettingsPage ────────────────────────────────────────────────────────

export const EmailSettingsPage: React.FC = () => {
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
      <div className="flex-1 flex items-center justify-center bg-[#0f0f0f]">
        <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#0f0f0f] p-6">
      <form onSubmit={handleSave} className="max-w-2xl mx-auto space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-white/90 text-2xl font-bold mb-1">Configurações de E-mail</h1>
            <p className="text-white/40 text-sm">Personalize o comportamento do módulo de e-mail</p>
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
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/20 text-red-400',
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

        {/* Account defaults */}
        <SectionCard
          title="Conta Padrão"
          description="Conta usada por padrão ao enviar novos e-mails"
          icon={<Mail className="w-4 h-4" />}
        >
          {accounts.length === 0 ? (
            <p className="text-white/30 text-sm">Nenhuma conta conectada.</p>
          ) : (
            <div>
              <FieldLabel label="Conta padrão para envio" />
              <select
                value={form.defaultAccountId ?? ''}
                onChange={e => setForm(prev => ({ ...prev, defaultAccountId: e.target.value }))}
                className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 outline-none focus:border-blue-500/40 transition-colors appearance-none cursor-pointer"
              >
                <option value="">Selecionar conta...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.email} {acc.isDefault ? '(padrão atual)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </SectionCard>

        {/* Display name */}
        <SectionCard
          title="Identidade do Remetente"
          description="Nome exibido quando você envia e-mails"
          icon={<User className="w-4 h-4" />}
        >
          <div>
            <FieldLabel label="Nome do remetente" hint="Deixe em branco para usar o nome da conta" />
            <input
              type="text"
              value={form.displayName ?? ''}
              onChange={e => setForm(prev => ({ ...prev, displayName: e.target.value }))}
              placeholder="Ex: Paulo Michelin"
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/20 outline-none focus:border-blue-500/40 transition-colors"
            />
          </div>
        </SectionCard>

        {/* Signature */}
        <SectionCard
          title="Assinatura"
          description="Adicionada automaticamente ao final dos e-mails enviados"
          icon={<PenLine className="w-4 h-4" />}
        >
          <div>
            <FieldLabel label="Assinatura" hint="Suporta HTML básico" />
            <textarea
              value={form.signature ?? ''}
              onChange={e => setForm(prev => ({ ...prev, signature: e.target.value }))}
              rows={6}
              placeholder={`Ex:\n--\nPaulo Michelin\nCorretor de Seguros | Michelin Seguros\n(11) 99999-9999`}
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/15 outline-none focus:border-blue-500/40 transition-colors resize-none font-mono"
            />
            {form.signature && (
              <div className="mt-2 p-3 rounded-lg bg-white/3 border border-white/5">
                <p className="text-[11px] text-white/25 uppercase tracking-widest mb-2">Pré-visualização</p>
                <div
                  className="text-white/50 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: form.signature }}
                />
              </div>
            )}
          </div>
        </SectionCard>

        {/* Auto-reply */}
        <SectionCard
          title="Resposta Automática"
          description="Responda automaticamente a e-mails recebidos"
          icon={<ToggleRight className="w-4 h-4" />}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/70 text-sm font-medium">Ativar resposta automática</p>
              <p className="text-white/30 text-xs mt-0.5">Responde automaticamente a novos e-mails recebidos</p>
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
                  <div>
                    <FieldLabel label="Assunto da resposta automática" />
                    <input
                      type="text"
                      value={form.autoReply?.subject ?? ''}
                      onChange={e => updateAutoReply('subject', e.target.value)}
                      placeholder="Ex: Recebi sua mensagem"
                      className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/20 outline-none focus:border-blue-500/40 transition-colors"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Corpo da resposta automática" />
                    <textarea
                      value={form.autoReply?.body ?? ''}
                      onChange={e => updateAutoReply('body', e.target.value)}
                      rows={4}
                      placeholder="Ex: Olá! Recebi sua mensagem e responderei em breve. Obrigado."
                      className="w-full bg-[#0f0f0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/70 placeholder:text-white/20 outline-none focus:border-blue-500/40 transition-colors resize-none"
                    />
                  </div>
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
                <p className="text-white/70 text-sm font-medium">Notificações de novos e-mails</p>
                <p className="text-white/30 text-xs mt-0.5">Exibe uma notificação quando novos e-mails chegam</p>
              </div>
              <Toggle
                enabled={form.notifications?.newEmail ?? true}
                onChange={v => updateNotifications('newEmail', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/70 text-sm font-medium">Notificações do sistema</p>
                <p className="text-white/30 text-xs mt-0.5">Notificações push no navegador (requer permissão)</p>
              </div>
              <Toggle
                enabled={form.notifications?.desktop ?? false}
                onChange={v => updateNotifications('desktop', v)}
              />
            </div>
          </div>
        </SectionCard>

        {/* Save button */}
        <div className="flex justify-end pb-8">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-blue-900/20"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
  );
};
