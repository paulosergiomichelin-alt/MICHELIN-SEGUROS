import React, { useEffect, useState, useCallback } from 'react';

interface StatusReport {
  ok: boolean;
  config: {
    phoneNumberId: string | null;
    wabaId: string | null;
    verifyToken: string | null;
    tokenPresent: boolean;
  };
  token: { valid: boolean; name?: string; id?: string; error?: string };
  phoneNumber: {
    id?: string;
    displayNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    throughput?: { level: string };
    error?: string;
  } | null;
  waba: { id?: string; name?: string; currency?: string; error?: string } | null;
  webhook: { verifyTokenSet: boolean; url: string };
  timestamp: string;
}

const PHONE_NUMBER_ID = '1137795116081177';
const WABA_ID = '1584620513220917';
const DISPLAY_NUMBER = '+55 (67) 99674-8603';

export default function WhatsAppOfficialSettings() {
  const [status, setStatus] = useState<StatusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Teste de mensagem — Michelin Seguros');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meta/status');
      const data = await res.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const sendTest = async () => {
    if (!testPhone.trim() || !testMsg.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/meta/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone.replace(/\D/g, ''), type: 'text', message: testMsg }),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult({ ok: true, msg: `Enviado! WAMID: ${data.wamid ?? 'N/A'}` });
      } else {
        setSendResult({ ok: false, msg: data.error ?? 'Erro desconhecido' });
      }
    } catch (err: any) {
      setSendResult({ ok: false, msg: err.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white p-6">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">💬</span>
              <h1 className="text-xl font-bold text-white">WhatsApp Oficial</h1>
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#CFA764] bg-[#CFA764]/10 border border-[#CFA764]/25 px-2 py-0.5 rounded">Meta Cloud API</span>
            </div>
            <p className="text-white/40 text-sm ml-11">Integração oficial com a Meta WhatsApp Business Cloud API</p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="text-xs font-semibold text-[#CFA764] border border-[#CFA764]/30 px-4 py-2 rounded-lg hover:bg-[#CFA764]/10 transition-colors disabled:opacity-40"
          >
            {loading ? 'Verificando…' : '↻ Atualizar'}
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl px-5 py-4 mb-6 text-red-300 text-sm">
            Erro ao carregar status: {error}
          </div>
        )}

        {/* Connection status bar */}
        <div className={`rounded-xl border px-5 py-4 mb-6 flex items-center gap-4 ${
          status?.ok
            ? 'bg-emerald-900/20 border-emerald-500/30'
            : status
            ? 'bg-amber-900/20 border-amber-500/30'
            : 'bg-white/5 border-white/10'
        }`}>
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${
            status?.ok ? 'bg-emerald-400 shadow-[0_0_8px_#4ade80]' :
            status ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]' : 'bg-white/20'
          }`} />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${
              status?.ok ? 'text-emerald-300' : status ? 'text-amber-300' : 'text-white/40'
            }`}>
              {loading ? 'Verificando conexão…' :
               status?.ok ? '✓ Integração ativa e funcionando' :
               status ? '⚠ Integração com problemas' : 'Status desconhecido'}
            </p>
            {status?.timestamp && (
              <p className="text-xs text-white/30 mt-0.5">
                Verificado em {new Date(status.timestamp).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        </div>

        {/* Config grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <ConfigCard
            title="Número WhatsApp"
            value={status?.phoneNumber?.displayNumber ?? DISPLAY_NUMBER}
            sub={status?.phoneNumber?.verifiedName ?? 'Michelin Seguros'}
            status={status?.phoneNumber?.displayNumber ? 'ok' : status?.phoneNumber?.error ? 'error' : 'pending'}
            detail={status?.phoneNumber?.error}
          />
          <ConfigCard
            title="Phone Number ID"
            value={status?.config.phoneNumberId ?? PHONE_NUMBER_ID}
            sub="Meta Business"
            status={status?.config.phoneNumberId ? 'ok' : 'pending'}
            mono
          />
          <ConfigCard
            title="WABA ID"
            value={status?.config.wabaId ?? WABA_ID}
            sub={status?.waba?.name ?? 'WhatsApp Business Account'}
            status={status?.waba?.id ? 'ok' : status?.waba?.error ? 'error' : 'pending'}
            detail={status?.waba?.error}
            mono
          />
          <ConfigCard
            title="Token de Acesso"
            value={status?.config.tokenPresent ? '●●●●●●●●●●●●●●●●' : 'Não configurado'}
            sub={status?.token.valid ? `✓ Válido — ${status.token.name ?? ''}` : status?.token.error ?? 'Inválido'}
            status={status?.token.valid ? 'ok' : status?.token.error ? 'error' : 'pending'}
            detail={status?.token.error}
            mono
          />
        </div>

        {/* Webhook */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-6 py-5 mb-6">
          <h2 className="text-sm font-bold text-[#CFA764] uppercase tracking-widest mb-4">Webhook</h2>
          <div className="space-y-3">
            <Row label="Callback URL" value={status?.webhook.url ?? 'https://michelin-seguros.vercel.app/api/webhook/whatsapp'} mono />
            <Row label="Verify Token" value={status?.webhook.verifyTokenSet ? '✓ Configurado' : '✗ Não configurado'} status={status?.webhook.verifyTokenSet ? 'ok' : 'error'} />
            <Row label="Campos assinados" value="messages" />
          </div>
          <div className="mt-4 bg-[#CFA764]/6 border border-[#CFA764]/15 rounded-lg px-4 py-3 text-xs text-white/50 leading-relaxed">
            Configure o webhook no <strong className="text-white/70">Meta Developer Console</strong> → App → WhatsApp → Configuração → Webhook URL e Verify Token: <code className="text-[#CFA764]">michelin_seguros_webhook_2026</code>
          </div>
        </div>

        {/* Quality */}
        {status?.phoneNumber?.qualityRating && (
          <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-6 py-5 mb-6">
            <h2 className="text-sm font-bold text-[#CFA764] uppercase tracking-widest mb-4">Qualidade do Número</h2>
            <div className="space-y-3">
              <Row label="Qualidade" value={status.phoneNumber.qualityRating} status={status.phoneNumber.qualityRating === 'GREEN' ? 'ok' : 'warning'} />
              {status.phoneNumber.throughput?.level && (
                <Row label="Throughput" value={status.phoneNumber.throughput.level} />
              )}
            </div>
          </div>
        )}

        {/* Test send */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-6 py-5 mb-6">
          <h2 className="text-sm font-bold text-[#CFA764] uppercase tracking-widest mb-4">Enviar Mensagem de Teste</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-white/40 font-semibold uppercase tracking-wide mb-1">Número destino</label>
              <input
                type="text"
                placeholder="5567999999999"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#CFA764]/50"
              />
            </div>
            <div>
              <label className="block text-xs text-white/40 font-semibold uppercase tracking-wide mb-1">Mensagem</label>
              <textarea
                value={testMsg}
                onChange={e => setTestMsg(e.target.value)}
                rows={2}
                className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#CFA764]/50 resize-none"
              />
            </div>
            <button
              onClick={sendTest}
              disabled={sending || !testPhone.trim() || !testMsg.trim()}
              className="bg-[#CFA764] hover:bg-[#E8C97A] disabled:opacity-40 text-[#0a0a0a] text-xs font-black uppercase tracking-wider px-6 py-2.5 rounded-lg transition-colors"
            >
              {sending ? 'Enviando…' : 'Enviar Teste'}
            </button>
            {sendResult && (
              <p className={`text-sm font-medium ${sendResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {sendResult.msg}
              </p>
            )}
          </div>
        </div>

        {/* Endpoints */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-6 py-5">
          <h2 className="text-sm font-bold text-[#CFA764] uppercase tracking-widest mb-4">Endpoints da API</h2>
          <div className="space-y-2 font-mono text-xs">
            {[
              ['GET',  '/api/webhook/whatsapp', 'Verificação do webhook (Meta)'],
              ['POST', '/api/webhook/whatsapp', 'Receber eventos (mensagens, status)'],
              ['GET',  '/api/meta/status',      'Diagnóstico da integração'],
              ['POST', '/api/meta/send',        'Enviar mensagens (text/image/document/audio/template)'],
            ].map(([method, path, desc]) => (
              <div key={path + method} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                <span className={`w-12 text-center text-[10px] font-black uppercase rounded px-1 py-0.5 ${
                  method === 'GET' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-blue-900/40 text-blue-400'
                }`}>{method}</span>
                <code className="text-[#CFA764] flex-shrink-0">{path}</code>
                <span className="text-white/30 text-[11px]">{desc}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function ConfigCard({ title, value, sub, status, detail, mono }: {
  title: string; value: string; sub: string;
  status?: 'ok' | 'error' | 'warning' | 'pending';
  detail?: string; mono?: boolean;
}) {
  const dot = status === 'ok' ? 'bg-emerald-400' :
              status === 'error' ? 'bg-red-400' :
              status === 'warning' ? 'bg-amber-400' : 'bg-white/20';
  return (
    <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
        <span className="text-[11px] font-bold uppercase tracking-widest text-white/30">{title}</span>
      </div>
      <p className={`text-sm font-semibold text-white break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
      <p className={`text-xs mt-1 ${status === 'error' ? 'text-red-400' : 'text-white/40'}`}>{detail ?? sub}</p>
    </div>
  );
}

function Row({ label, value, status, mono }: {
  label: string; value: string;
  status?: 'ok' | 'error' | 'warning';
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 text-sm">
      <span className="text-white/30 w-36 flex-shrink-0 text-xs uppercase tracking-wide font-semibold pt-0.5">{label}</span>
      <span className={`break-all ${mono ? 'font-mono text-[#CFA764]' : ''} ${
        status === 'ok' ? 'text-emerald-400' :
        status === 'error' ? 'text-red-400' :
        'text-white/70'
      }`}>{value}</span>
    </div>
  );
}
