import { fsGet, fsSet, fsUpdate } from '../lib/adminFirebase.js';
import { EvolutionAPI } from '../lib/evolutionApi.js';

// ── In-memory runner state ────────────────────────────────────────────────────

interface RunnerState {
  status: 'running' | 'paused' | 'cancelled';
}

const runners = new Map<string, RunnerState>();

export function getCampaignRunnerState(id: string): RunnerState | undefined {
  return runners.get(id);
}

export function setCampaignRunnerState(id: string, status: RunnerState['status']) {
  const s = runners.get(id);
  if (s) s.status = status;
  else runners.set(id, { status });
}

// ── Template engine (mirrors frontend) ───────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, (c: string) => c.toUpperCase());
}

function getPrimeiroNome(nome: string): string {
  return toTitleCase(nome?.trim()?.split(' ')[0] || '');
}

function renderTemplate(template: string, lead: Record<string, any>): string {
  return template
    .replace(/\{\{primeiroNome\}\}/g, getPrimeiroNome(lead.name || ''))
    .replace(/\{\{nome\}\}/g, toTitleCase(lead.name || ''));
}

// ── Campaign runner ───────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runCampaign(campaignId: string, campaign: Record<string, any>) {
  const state = runners.get(campaignId)!;
  const {
    targetLeads = [] as string[],
    sessionName,
    messageTemplate = '',
    imageUrl = '',
    imageOrder = 'before',
    interval = 10,
  } = campaign;

  let sentCount  = Number(campaign.sentCount  ?? 0);
  let errorCount = Number(campaign.errorCount ?? 0);

  for (const leadId of targetLeads as string[]) {
    if (state.status === 'cancelled') break;

    while (state.status === 'paused') {
      await sleep(1000);
      if (state.status === 'cancelled') break;
    }
    if (state.status === 'cancelled') break;

    const ts = new Date().toISOString();
    let lead: Record<string, any> | null = null;

    try {
      lead = await fsGet('leads', leadId);
    } catch { /* lead removido */ }

    if (!lead) {
      errorCount++;
      continue;
    }

    const text  = renderTemplate(messageTemplate, lead);
    const rawPhone = (lead.phone || '').replace(/\D/g, '');
    if (!rawPhone) { errorCount++; continue; }
    // Normaliza para formato Evolution API (DDI 55 obrigatório)
    const phone = rawPhone.startsWith('55') && rawPhone.length >= 12
      ? rawPhone
      : `55${rawPhone}`;

    let ok = false;
    let sendError = '';
    try {
      if (!imageUrl) {
        const result = await EvolutionAPI.sendText(sessionName, phone, text);
        ok = !!result;
        if (!ok) sendError = 'Evolution API retornou null (sendText)';
      } else if (imageOrder === 'after') {
        // texto primeiro, depois imagem
        const r1 = await EvolutionAPI.sendText(sessionName, phone, text);
        await sleep(1500);
        const r2 = await EvolutionAPI.sendImage(sessionName, phone, imageUrl, '');
        ok = !!r1 && !!r2;
        if (!ok) sendError = !r1 ? 'Falha no sendText' : 'Falha no sendImage';
      } else {
        // imagem primeiro (before ou padrão), depois texto
        const r1 = await EvolutionAPI.sendImage(sessionName, phone, imageUrl, '');
        await sleep(1500);
        const r2 = await EvolutionAPI.sendText(sessionName, phone, text);
        ok = !!r1 && !!r2;
        if (!ok) sendError = !r1 ? 'Falha no sendImage' : 'Falha no sendText';
      }
    } catch (e: any) {
      ok = false;
      sendError = e?.message ?? 'Exceção ao enviar';
    }
    console.log(`[CAMPAIGNS] ${ok ? '✓' : '✗'} ${sessionName}→${phone}: ${ok ? 'ok' : sendError}`);

    if (ok) {
      sentCount++;
      await fsUpdate('leads', leadId, {
        status: 'Em Atendimento',
        ultimaCampanha: campaign.name,
        ultimaCampanhaId: campaignId,
        updatedAt: ts,
      }).catch(() => {});
    } else {
      errorCount++;
    }

    // Persiste log da mensagem
    const logId = `clog_${campaignId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await fsSet('campaign_log', logId, {
      id: logId,
      campaignId,
      leadId,
      leadName: lead.name || phone,
      status:   ok ? 'sent' : 'error',
      message:  ok ? text   : '',
      error:    ok ? ''     : sendError || 'Falha ao enviar',
      timestamp: ts,
    }).catch(() => {});

    // Atualiza progresso da campanha
    await fsUpdate('campaigns', campaignId, {
      sentCount,
      errorCount,
      updatedAt: ts,
    }).catch(() => {});

    console.log(`[CAMPAIGNS] progresso: ${sentCount} enviados / ${errorCount} erros de ${targetLeads.length} leads`);

    if (state.status !== 'cancelled') {
      await sleep(interval * 1000);
    }
  }

  // Finaliza
  if (state.status !== 'cancelled') {
    await fsUpdate('campaigns', campaignId, {
      status:    'completed',
      sentCount,
      errorCount,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
    console.log(`[CAMPAIGNS] Campanha ${campaignId} concluída — enviados: ${sentCount}, erros: ${errorCount}`);
  }

  runners.delete(campaignId);
}

// ── HTTP Handler ──────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const campaignId = String(req.query?.campaignId ?? '');
    return res.status(200).json({
      status: runners.get(campaignId)?.status ?? 'idle',
    });
  }

  if (req.method === 'POST') {
    const { campaignId } = req.body ?? {};
    if (!campaignId) return res.status(400).json({ error: 'campaignId obrigatório' });

    const campaign = await fsGet('campaigns', campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (!campaign.sessionName) return res.status(400).json({ error: 'sessionName não definido na campanha' });

    const existing = runners.get(campaignId);
    if (existing?.status === 'running') {
      return res.status(200).json({ success: true, status: 'already_running' });
    }

    // Resume from paused
    if (existing?.status === 'paused') {
      existing.status = 'running';
      await fsUpdate('campaigns', campaignId, { status: 'running', updatedAt: new Date().toISOString() });
      return res.status(200).json({ success: true, status: 'resumed' });
    }

    // Fresh start
    runners.set(campaignId, { status: 'running' });
    await fsUpdate('campaigns', campaignId, { status: 'running', updatedAt: new Date().toISOString() });

    res.status(200).json({ success: true, status: 'started' });

    runCampaign(campaignId, campaign).catch(err => {
      console.error('[CAMPAIGNS/start] Erro no runner:', err);
      fsUpdate('campaigns', campaignId, { status: 'error', updatedAt: new Date().toISOString() }).catch(() => {});
      runners.delete(campaignId);
    });

    return;
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
