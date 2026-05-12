import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Key,
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Save,
  RefreshCcw,
  Eye,
  EyeOff,
  Zap,
  Upload,
  Database,
  Shield,
  Clock,
  TrendingUp,
  FileText,
  Trash2,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { AIOCRConfigService, AIOCRConfig, DEFAULT_AI_OCR_CONFIG } from '../../services/AIOCRConfigService';
import { AIOCRMetricsService, AIOCRLogEntry, AIOCRStats } from '../../services/AIOCRMetricsService';
import { OpenRouterOCRClient } from '../../services/document-engine/OpenRouterOCRClient';
import { AIHybridOCRService } from '../../services/AIHybridOCRService';
import { auth } from '../../lib/firebase';

type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error';

interface TestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  modelEcho?: string;
}

const SECTION_HEADER_CLASS = 'flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gold-deep';
const CARD_CLASS = 'p-6 bg-brand-dark rounded-3xl border border-white/5 shadow-lg space-y-5';
const INPUT_CLASS = 'w-full px-4 py-2.5 bg-brand-black border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:border-gold-deep focus:outline-none transition-colors font-mono';

export function AIDocumentExtractionPanel() {
  const [config, setConfig] = useState<AIOCRConfig>(DEFAULT_AI_OCR_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [logs, setLogs] = useState<AIOCRLogEntry[]>([]);
  const [stats, setStats] = useState<AIOCRStats>(AIOCRMetricsService.getStats());
  const [testFile, setTestFile] = useState<File | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<any | null>(null);
  const [testType, setTestType] = useState<'cnh' | 'crv' | 'policy'>('cnh');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load config + subscribe to metrics
  useEffect(() => {
    let cancelled = false;
    AIOCRConfigService.load().then((cfg) => {
      if (!cancelled) {
        setConfig(cfg);
        setLoadingConfig(false);
      }
    }).catch((err) => {
      console.error('[AI_OCR_PANEL] load config failed', err);
      if (!cancelled) setLoadingConfig(false);
    });

    AIOCRMetricsService.ensureLoaded();
    setLogs(AIOCRMetricsService.getLogs());
    setStats(AIOCRMetricsService.getStats());
    const unsub = AIOCRMetricsService.subscribe((newLogs, newStats) => {
      setLogs([...newLogs]);
      setStats({ ...newStats });
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  const handleConfigChange = useCallback(<K extends keyof AIOCRConfig>(key: K, value: AIOCRConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    setSavingConfig(true);
    try {
      const actor = auth.currentUser?.email || auth.currentUser?.uid || 'admin';
      const saved = await AIOCRConfigService.save(config, actor);
      setConfig(saved);
    } catch (err: any) {
      alert(`Erro ao salvar configuração: ${err.message || err}`);
    } finally {
      setSavingConfig(false);
    }
  }, [config]);

  const handleRestoreDefaults = useCallback(() => {
    if (!confirm('Restaurar valores padrão? A API key será mantida.')) return;
    setConfig((prev) => ({ ...DEFAULT_AI_OCR_CONFIG, apiKey: prev.apiKey }));
  }, []);

  const handleClearCache = useCallback(() => {
    if (!confirm('Limpar todo o cache de resultados OCR? Próximas execuções farão nova chamada à IA.')) return;
    let removed = 0;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ai_ocr_cache_')) toRemove.push(k);
      }
      toRemove.forEach((k) => { localStorage.removeItem(k); removed++; });
    } catch (e) { /* noop */ }
    alert(`Cache limpo: ${removed} entradas removidas.`);
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!config.apiKey || config.apiKey.length < 12) {
      setTestResult({ ok: false, message: 'API key inválida ou ausente.' });
      setConnection('error');
      return;
    }
    setConnection('testing');
    setTestResult(null);
    const start = Date.now();
    try {
      const res = await OpenRouterOCRClient.chatCompletion(config.apiKey, {
        model: config.model,
        max_tokens: 10,
        messages: [
          { role: 'system', content: 'Responda apenas: pong' },
          { role: 'user', content: 'ping' }
        ]
      }, 10000);
      const latency = Date.now() - start;
      const echo = res.choices?.[0]?.message?.content || '';
      setTestResult({
        ok: true,
        message: `Conexão OK. Modelo respondeu em ${latency}ms.`,
        latencyMs: latency,
        modelEcho: echo.substring(0, 60)
      });
      setConnection('success');
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || 'Falha na conexão.', latencyMs: Date.now() - start });
      setConnection('error');
    }
  }, [config.apiKey, config.model]);

  const handleTestOCR = useCallback(async () => {
    if (!testFile) return;
    setTestRunning(true);
    setTestOutput(null);
    try {
      // Render file to canvas
      const url = URL.createObjectURL(testFile);
      const isPDF = testFile.type === 'application/pdf' || testFile.name.toLowerCase().endsWith('.pdf');
      let canvas: HTMLCanvasElement;
      if (isPDF) {
        // Use the existing PDFResourceManager from the project
        const { PDFResourceManager } = await import('../../services/PDFResourceManager');
        const buf = await testFile.arrayBuffer();
        const pdf = await PDFResourceManager.getDocument(new Uint8Array(buf), testFile.name);
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.5 });
        canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d', { alpha: false })!;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, intent: 'display' }).promise;
      } else {
        canvas = await new Promise<HTMLCanvasElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            c.getContext('2d')!.drawImage(img, 0, 0);
            resolve(c);
          };
          img.onerror = () => reject(new Error('IMG_LOAD'));
          img.src = url;
        });
      }
      URL.revokeObjectURL(url);

      const result = await AIHybridOCRService.getInstance().extractFromCanvas(canvas, testType);
      setTestOutput(result);
    } catch (err: any) {
      setTestOutput({ success: false, error: err.message });
    } finally {
      setTestRunning(false);
    }
  }, [testFile, testType]);

  const avgLatency = useMemo(() => AIOCRMetricsService.getAverageLatency(), [stats]);
  const avgConfidence = useMemo(() => AIOCRMetricsService.getAverageConfidence(), [stats]);
  const successRate = useMemo(() => AIOCRMetricsService.getSuccessRate(), [stats]);

  const systemStatus: 'operational' | 'unstable' | 'offline' = useMemo(() => {
    if (!config.enabled) return 'offline';
    if (!config.apiKey || config.apiKey.length < 12) return 'offline';
    if (connection === 'error') return 'unstable';
    if (successRate > 0 && successRate < 60) return 'unstable';
    return 'operational';
  }, [config.enabled, config.apiKey, connection, successRate]);

  if (loadingConfig) {
    return (
      <div className="p-12 text-center text-slate-400 text-sm">Carregando configuração...</div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3 px-1">
        <h2 className="text-xl font-bold text-gold-deep font-display uppercase tracking-tight flex items-center gap-2">
          <Bot className="w-5 h-5" /> Extração de Documento IA
        </h2>
      </div>

      {/* SECTION 1: STATUS GERAL */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Activity className="w-3.5 h-3.5" /> Status OCR IA
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusBadge
            label="Status"
            value={systemStatus === 'operational' ? 'Operacional' : systemStatus === 'unstable' ? 'Instável' : 'Offline'}
            color={systemStatus === 'operational' ? 'green' : systemStatus === 'unstable' ? 'yellow' : 'red'}
          />
          <StatusBadge label="Modelo" value={config.model.split('/').pop() || config.model} color="gold" />
          <StatusBadge label="API" value={connection === 'success' ? 'Conectada' : connection === 'error' ? 'Falha' : 'Não testada'} color={connection === 'success' ? 'green' : connection === 'error' ? 'red' : 'slate'} />
          <StatusBadge label="Fallback" value={config.fallbackEnabled ? 'Ativo' : 'Desativado'} color={config.fallbackEnabled ? 'green' : 'slate'} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-white/5">
          <Metric icon={<Clock className="w-3 h-3" />} label="Latência média" value={`${avgLatency}ms`} />
          <Metric icon={<TrendingUp className="w-3 h-3" />} label="Taxa de sucesso" value={`${successRate}%`} />
          <Metric icon={<CheckCircle2 className="w-3 h-3" />} label="Confidence média" value={`${avgConfidence}%`} />
          <Metric icon={<FileText className="w-3 h-3" />} label="Total processado" value={String(stats.totalProcessed)} />
        </div>
      </div>

      {/* SECTION 2: OPENROUTER CONFIG */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Key className="w-3.5 h-3.5" /> Configuração OpenRouter
        </h3>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Modelo</label>
          <input
            type="text"
            className={INPUT_CLASS}
            value={config.model}
            onChange={(e) => handleConfigChange('model', e.target.value)}
            placeholder="baidu/qianfan-ocr-fast:free"
          />
          <p className="text-[10px] text-slate-500">Padrão: <span className="text-gold-light/70 font-mono">baidu/qianfan-ocr-fast:free</span></p>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">OPENROUTER_API_KEY</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? 'text' : 'password'}
                className={INPUT_CLASS}
                value={config.apiKey}
                onChange={(e) => handleConfigChange('apiKey', e.target.value)}
                placeholder="sk-or-v1-..."
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-gold-deep"
                title={showApiKey ? 'Ocultar' : 'Mostrar'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {config.apiKey && (
            <p className="text-[10px] text-slate-500 font-mono">Mascarado: <span className="text-gold-light/70">{AIOCRConfigService.maskApiKey(config.apiKey)}</span></p>
          )}
          <p className="text-[10px] text-slate-500">A chave é gravada apenas no Firestore com permissão de admin. Nunca aparece nos logs.</p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handleTestConnection}
            disabled={connection === 'testing'}
            className="flex items-center gap-2 px-4 py-2 bg-gold-deep text-brand-black rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-gold-light disabled:opacity-50 transition-all"
          >
            {connection === 'testing' ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Testar conexão
          </button>
          <button
            onClick={handleSave}
            disabled={savingConfig}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-50 transition-all"
          >
            {savingConfig ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar configuração
          </button>
          <button
            onClick={handleRestoreDefaults}
            className="flex items-center gap-2 px-4 py-2 bg-brand-black text-slate-300 border border-white/10 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-white/5 transition-all"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> Restaurar padrão
          </button>
          <button
            onClick={handleClearCache}
            className="flex items-center gap-2 px-4 py-2 bg-amber-900/30 text-amber-300 border border-amber-500/20 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-amber-900/50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar cache OCR
          </button>
        </div>

        {testResult && (
          <div className={cn(
            'p-3 rounded-xl border text-xs',
            testResult.ok ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-red-950/40 border-red-500/30 text-red-300'
          )}>
            <div className="flex items-center gap-2 font-bold">
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.message}
            </div>
            {testResult.modelEcho && <p className="mt-1 text-[10px] font-mono opacity-70">Echo: {testResult.modelEcho}</p>}
          </div>
        )}
      </div>

      {/* SECTION 3: TOGGLES */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Shield className="w-3.5 h-3.5" /> Configuração OCR IA
        </h3>
        <p className="text-[10px] text-slate-500 -mt-2">
          <strong className="text-amber-400">Fallback local desligado</strong> = modo AI-only: se a IA falhar, o sistema retorna erro
          em vez de rodar o pipeline Tesseract (mais lento, ~10s).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Toggle label="IA OCR Ativo" checked={config.enabled} onChange={(v) => handleConfigChange('enabled', v)} />
          <Toggle label="Fallback local habilitado" checked={config.fallbackEnabled} onChange={(v) => handleConfigChange('fallbackEnabled', v)} />
          <Toggle label="Pré-processamento" checked={config.preprocessEnabled} onChange={(v) => handleConfigChange('preprocessEnabled', v)} />
          <Toggle label="Validação semântica" checked={config.semanticValidation} onChange={(v) => handleConfigChange('semanticValidation', v)} />
          <Toggle label="Validar CPF" checked={config.validateCpf} onChange={(v) => handleConfigChange('validateCpf', v)} />
          <Toggle label="Validar placa" checked={config.validatePlate} onChange={(v) => handleConfigChange('validatePlate', v)} />
          <Toggle label="Validar chassi" checked={config.validateChassis} onChange={(v) => handleConfigChange('validateChassis', v)} />
          <Toggle label="Retry automático" checked={config.retryEnabled} onChange={(v) => handleConfigChange('retryEnabled', v)} />
        </div>
      </div>

      {/* SECTION 5: PERFORMANCE */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Clock className="w-3.5 h-3.5" /> Performance OCR
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <NumberInput label="Timeout (ms)" value={config.timeout} min={5000} max={60000} step={1000} onChange={(v) => handleConfigChange('timeout', v)} />
          <NumberInput label="Retries" value={config.retries} min={0} max={5} step={1} onChange={(v) => handleConfigChange('retries', v)} />
          <NumberInput label="JPEG Quality" value={config.jpegQuality} min={50} max={95} step={5} onChange={(v) => handleConfigChange('jpegQuality', v)} />
          <NumberInput label="Max Width (px)" value={config.maxWidth} min={800} max={2400} step={100} onChange={(v) => handleConfigChange('maxWidth', v)} />
        </div>
      </div>

      {/* SECTION 5b: PROVIDER ROUTING */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Zap className="w-3.5 h-3.5" /> Provider Routing (OpenRouter)
        </h3>
        <p className="text-[10px] text-slate-500 -mt-2">
          OpenRouter escolhe automaticamente o provider mais rápido para o modelo. Estes filtros guiam essa escolha.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Sort por</label>
            <select
              value={config.routingSort}
              onChange={(e) => handleConfigChange('routingSort', e.target.value as any)}
              className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-xl text-sm text-white focus:border-gold-deep focus:outline-none transition-colors"
            >
              <option value="throughput">Throughput (rápido)</option>
              <option value="latency">Latência (menor)</option>
              <option value="price">Preço (menor)</option>
            </select>
          </div>
          <NumberInput label="Max latency p90 (s)" value={config.routingMaxLatencyP90} min={1} max={30} step={1} onChange={(v) => handleConfigChange('routingMaxLatencyP90', v)} />
          <NumberInput label="Min throughput p90 (t/s)" value={config.routingMinThroughputP90} min={10} max={500} step={10} onChange={(v) => handleConfigChange('routingMinThroughputP90', v)} />
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Data Collection</label>
            <select
              value={config.routingDataCollection}
              onChange={(e) => handleConfigChange('routingDataCollection', e.target.value as any)}
              className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-xl text-sm text-white focus:border-gold-deep focus:outline-none transition-colors"
            >
              <option value="deny">Deny (recomendado)</option>
              <option value="allow">Allow</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Toggle label="Allow fallbacks (failover entre providers)" checked={config.routingAllowFallbacks} onChange={(v) => handleConfigChange('routingAllowFallbacks', v)} />
          <Toggle label="ZDR (Zero Data Retention)" checked={config.routingZdr} onChange={(v) => handleConfigChange('routingZdr', v)} />
        </div>
      </div>

      {/* SECTION 4: SUPPORTED DOCS */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Database className="w-3.5 h-3.5" /> Documentos suportados
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DocCard type="CNH" mandatory={['nome', 'cpf', 'data_nascimento']} optional={['registro', 'categoria', 'validade', 'filiacao']} />
          <DocCard type="CRLV" mandatory={['nome', 'cpf', 'placa', 'chassi', 'alienacao_fiduciaria']} optional={['renavam', 'marca_modelo', 'categoria', 'ano_modelo', 'combustivel']} />
          <DocCard type="APÓLICE" mandatory={['segurado_nome', 'segurado_cpf', 'placa', 'chassi', 'fim_vigencia', 'numero_apolice']} optional={['cep', 'corretora_susep', 'uso_comercial', 'alienacao_fiduciaria']} />
        </div>
      </div>

      {/* SECTION 8: TEST OCR */}
      <div className={CARD_CLASS}>
        <h3 className={SECTION_HEADER_CLASS}>
          <Play className="w-3.5 h-3.5" /> Testar OCR IA
        </h3>
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              {(['cnh', 'crv', 'policy'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTestType(t)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all',
                    testType === t ? 'bg-gold-deep text-brand-black' : 'bg-brand-black text-slate-400 hover:text-white'
                  )}
                >
                  {t === 'cnh' ? 'CNH' : t === 'crv' ? 'CRLV' : 'Apólice'}
                </button>
              ))}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => setTestFile(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-black border border-white/10 rounded-xl text-[11px] font-bold uppercase tracking-widest text-slate-300 hover:bg-white/5 transition-all"
            >
              <Upload className="w-3.5 h-3.5" /> {testFile ? testFile.name.substring(0, 40) : 'Selecionar documento'}
            </button>
            <button
              onClick={handleTestOCR}
              disabled={!testFile || testRunning}
              className="flex items-center gap-2 px-4 py-2 bg-gold-deep text-brand-black rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-gold-light disabled:opacity-50 transition-all"
            >
              {testRunning ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Executar OCR
            </button>
          </div>
          <div className="flex-1 w-full">
            {testOutput ? (
              <pre className="text-[10px] font-mono p-3 bg-brand-black rounded-xl border border-white/10 text-emerald-300 max-h-80 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(testOutput, (k, v) => (k === 'rawText' && typeof v === 'string' ? v.substring(0, 200) + '…' : v), 2)}
              </pre>
            ) : (
              <div className="text-[10px] text-slate-600 italic p-3 border border-dashed border-white/10 rounded-xl text-center">
                Aguardando execução do teste...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 7: LOGS */}
      <div className={CARD_CLASS}>
        <div className="flex items-center justify-between">
          <h3 className={SECTION_HEADER_CLASS}>
            <FileText className="w-3.5 h-3.5" /> Logs OCR (realtime)
          </h3>
          <button
            onClick={() => { if (confirm('Limpar logs e estatísticas locais?')) AIOCRMetricsService.reset(); }}
            className="flex items-center gap-1 px-2 py-1 bg-red-900/30 text-red-300 border border-red-500/20 rounded-lg text-[10px] font-bold uppercase hover:bg-red-900/50 transition-all"
          >
            <Trash2 className="w-3 h-3" /> Limpar
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto bg-brand-black rounded-xl border border-white/5 divide-y divide-white/5">
          {logs.length === 0 ? (
            <div className="text-[10px] text-slate-600 italic p-3 text-center">Nenhum evento registrado ainda.</div>
          ) : (
            logs.map((log) => <LogRow key={log.id} log={log} />)
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ───────────────── Sub-components ───────────────── */

function StatusBadge({ label, value, color }: { label: string; value: string; color: 'green' | 'yellow' | 'red' | 'gold' | 'slate' }) {
  const tone: Record<string, string> = {
    green: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
    yellow: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
    red: 'bg-red-950/40 text-red-300 border-red-500/30',
    gold: 'bg-gold-deep/15 text-gold-deep border-gold-deep/30',
    slate: 'bg-brand-black text-slate-400 border-white/10'
  };
  return (
    <div className={cn('px-3 py-2 rounded-xl border', tone[color])}>
      <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">{label}</p>
      <p className="text-sm font-bold truncate">{value}</p>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-xl bg-brand-black border border-white/5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">{icon} {label}</p>
      <p className="text-base font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left',
        checked ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-brand-black border-white/10'
      )}
    >
      <span className="text-xs font-bold text-white">{label}</span>
      <span className={cn(
        'relative w-10 h-5 rounded-full transition-colors flex items-center',
        checked ? 'bg-emerald-500' : 'bg-slate-700'
      )}>
        <span className={cn(
          'absolute w-4 h-4 rounded-full bg-white transition-transform shadow-md',
          checked ? 'translate-x-5' : 'translate-x-0.5'
        )} />
      </span>
    </button>
  );
}

function NumberInput({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 bg-brand-black border border-white/10 rounded-xl text-sm text-white focus:border-gold-deep focus:outline-none transition-colors tabular-nums"
      />
    </div>
  );
}

function DocCard({ type, mandatory, optional }: { type: string; mandatory: string[]; optional: string[] }) {
  return (
    <div className="p-4 bg-brand-black rounded-2xl border border-white/5 space-y-3">
      <h4 className="text-sm font-black text-gold-deep uppercase">{type}</h4>
      <div>
        <p className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-wider mb-1">Obrigatórios</p>
        <div className="flex flex-wrap gap-1">
          {mandatory.map((f) => (
            <span key={f} className="px-2 py-0.5 rounded-md bg-emerald-950/40 text-emerald-300 text-[10px] font-mono">{f}</span>
          ))}
        </div>
      </div>
      {optional.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Opcionais</p>
          <div className="flex flex-wrap gap-1">
            {optional.map((f) => (
              <span key={f} className="px-2 py-0.5 rounded-md bg-white/5 text-slate-400 text-[10px] font-mono">{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogRow({ log }: { log: AIOCRLogEntry }) {
  const icon: Record<string, React.ReactNode> = {
    info: <Activity className="w-3 h-3 text-sky-400" />,
    success: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
    warn: <AlertCircle className="w-3 h-3 text-amber-400" />,
    error: <XCircle className="w-3 h-3 text-red-400" />
  };
  const time = new Date(log.ts).toLocaleTimeString('pt-BR', { hour12: false });
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-[11px]">
      <span className="text-slate-600 tabular-nums">{time}</span>
      {icon[log.level]}
      <span className="text-gold-light/70 font-mono font-bold w-40 truncate">[{log.tag}]</span>
      <span className="text-slate-300 truncate flex-1">{log.message}</span>
    </div>
  );
}
