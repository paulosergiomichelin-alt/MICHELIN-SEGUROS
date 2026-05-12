/**
 * AIHybridOCRService.ts
 *
 * Unified AI-driven OCR pipeline for all document types (CNH, CRLV, APOLICE).
 *
 * Pipeline:
 *   1. Light canvas preprocessing (resize, grayscale, contrast) → JPEG base64.
 *   2. Hash-based cache lookup (localStorage, 7d TTL).
 *   3. OpenRouter chat completion with a vision-capable OCR model + per-type
 *      structured prompt (forces JSON output, no markdown, no invention).
 *   4. Parse + Brazilian semantic validation (CPF/CNPJ/plate/chassis/date).
 *   5. Hybrid confidence (model + semantic + completeness).
 *   6. Cache + return structured result; mask sensitive data in logs.
 *
 * The service does NOT replace the existing Tesseract-based pipelines; it sits
 * in front of them. Callers (OCRService) fall back to the local pipeline if
 * the AI path is unavailable (no key / timeout / API error / parse failure).
 */

import { ImagePreprocessor, PreprocessedImage } from './document-engine/ImagePreprocessor';
import { OpenRouterOCRClient, OpenRouterChatRequest } from './document-engine/OpenRouterOCRClient';
import { DocumentValidator, FieldValidation } from './document-engine/DocumentValidator';
import { AIOCRConfigService } from './AIOCRConfigService';
import { AIOCRMetricsService } from './AIOCRMetricsService';

export type AIDocumentType = 'cnh' | 'crv' | 'crlv' | 'policy' | 'apolice';

export interface AIExtractionResult {
  success: boolean;
  documentType: string;
  provider: string;
  confidence: number; // 0-100
  fields: Record<string, any>;
  rawText: string;
  cached?: boolean;
  fallback?: boolean;
  metrics: {
    latency: number;
    tokens?: number;
    imageBytes: number;
    semanticScore?: number;
  };
  validation?: Record<string, FieldValidation>;
  error?: string;
}

const MODEL_ID = 'baidu/qianfan-ocr-fast:free';
// Cache version: bump this whenever the prompt, model, or output schema changes so
// old cached responses (which may miss fields) are invalidated automatically.
const CACHE_VERSION = 'v4';
const CACHE_PREFIX = `ai_ocr_cache_${CACHE_VERSION}:`;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AIHybridOCRService {
  private static instance: AIHybridOCRService;

  private constructor() {}

  public static getInstance(): AIHybridOCRService {
    if (!this.instance) this.instance = new AIHybridOCRService();
    return this.instance;
  }

  /** Top-level entry point — accepts an already-rendered canvas (PDF or image). */
  public async extractFromCanvas(canvas: HTMLCanvasElement, documentType: AIDocumentType): Promise<AIExtractionResult> {
    const start = Date.now();
    const type = this.normalizeType(documentType);

    // Apply persisted config (model, timeout, toggles) if available
    const cfg = AIOCRConfigService.peek();
    if (cfg && cfg.enabled === false) {
      console.warn('[AI_OCR_DISABLED] Pipeline disabled in settings; signalling caller to fall back.');
      AIOCRMetricsService.recordEvent('AI_OCR_DISABLED', 'AI pipeline disabled in settings', { type });
      return this.failure(type, 'AI_DISABLED', start, 0);
    }

    console.log(`[AI_OCR_START] type=${type}`);
    AIOCRMetricsService.recordStart(type);

    // Prefer config-resolved key (Firestore-backed); fallback to env/legacy storage.
    const apiKey = AIOCRConfigService.resolveApiKey() || OpenRouterOCRClient.resolveApiKey();
    if (!apiKey) {
      console.warn('[AI_OCR_NO_KEY] OpenRouter API key not configured; signalling caller to fall back.');
      AIOCRMetricsService.recordFailure(type, 'NO_API_KEY', Date.now() - start);
      return this.failure(type, 'NO_API_KEY', start, 0);
    }

    let preprocessed: PreprocessedImage;
    try {
      preprocessed = await ImagePreprocessor.fromCanvas(canvas);
      console.log(`[IMAGE_PREPROCESS] ${preprocessed.width}x${preprocessed.height} ${Math.round(preprocessed.bytes / 1024)}KB`);
    } catch (err: any) {
      console.error('[IMAGE_PREPROCESS_FAIL]', err.message);
      return this.failure(type, 'PREPROCESS_FAILED', start, 0);
    }

    // Cache lookup
    const hash = await ImagePreprocessor.hash(preprocessed.rawBase64).catch(() => '');
    const cacheKey = hash ? `${CACHE_PREFIX}${type}:${hash}` : '';
    if (cacheKey) {
      const cached = this.cacheGet(cacheKey);
      if (cached) {
        console.log(`[AI_OCR_CACHE_HIT] ${type}`);
        return { ...cached, cached: true, metrics: { ...cached.metrics, latency: Date.now() - start } };
      }
    }

    // AI call
    const prompt = this.buildPrompt(type);
    const activeModel = cfg?.model || MODEL_ID;
    const activeTimeout = cfg?.timeout || 20000;
    const maxRetries = cfg?.retryEnabled === false ? 0 : Math.min(2, cfg?.retries ?? 2);

    // Build the provider routing block from settings. This sorts by throughput by
    // default, prefers fast providers (p90 latency < 3s, throughput > 40 tok/s),
    // denies data collection, and optionally enforces ZDR.
    const routing = {
      sort: (cfg?.routingSort ?? 'throughput') as 'throughput' | 'latency' | 'price',
      allow_fallbacks: cfg?.routingAllowFallbacks ?? true,
      require_parameters: cfg?.routingRequireParameters ?? false,
      data_collection: (cfg?.routingDataCollection ?? 'deny') as 'allow' | 'deny',
      ...(cfg?.routingZdr ? { zdr: true } : {}),
      preferred_max_latency: { p90: cfg?.routingMaxLatencyP90 ?? 3 },
      preferred_min_throughput: { p90: cfg?.routingMinThroughputP90 ?? 40 }
    };

    const payload: OpenRouterChatRequest = {
      model: activeModel,
      temperature: 0,
      max_tokens: 1024,
      provider: routing,
      messages: [
        { role: 'system', content: prompt.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.user },
            { type: 'image_url', image_url: { url: preprocessed.base64 } }
          ]
        }
      ]
    };

    console.log(`[AI_PIPELINE_PRIMARY] model=${activeModel} type=${type}`);
    console.log(`[OPENROUTER_ROUTING] sort=${routing.sort} maxLatencyP90=${routing.preferred_max_latency.p90}s minThroughputP90=${routing.preferred_min_throughput.p90}t/s data=${routing.data_collection}${routing.zdr ? ' zdr=on' : ''}`);
    console.log(`[QIANFAN_REQUEST] model=${activeModel} bytes=${preprocessed.bytes}`);
    AIOCRMetricsService.recordEvent('OPENROUTER_ROUTING', `sort=${routing.sort} lat<=${routing.preferred_max_latency.p90}s thr>=${routing.preferred_min_throughput.p90}t/s`, { type, sort: routing.sort });
    AIOCRMetricsService.recordEvent('QIANFAN_REQUEST', `model=${activeModel}`, { type, bytes: preprocessed.bytes });
    let raw = '';
    let tokensUsed = 0;
    // Retry loop: provider routing lets OpenRouter switch providers on its end,
    // but if the whole request errors we retry once or twice with exponential backoff.
    let lastError: any = null;
    let modelEcho = '';
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await OpenRouterOCRClient.chatCompletion(apiKey, payload, activeTimeout);
        raw = response.choices?.[0]?.message?.content || '';
        tokensUsed = response.usage?.total_tokens || 0;
        modelEcho = response.model || activeModel;
        console.log(`[OPENROUTER_SUCCESS] provider-resolved-model=${modelEcho} attempt=${attempt + 1}`);
        console.log(`[QIANFAN_RESPONSE] tokens=${tokensUsed} finish=${response.choices?.[0]?.finish_reason}`);
        AIOCRMetricsService.recordEvent('OPENROUTER_SUCCESS', `model=${modelEcho} attempt=${attempt + 1}`, { type, attempts: attempt + 1 });
        AIOCRMetricsService.recordEvent('QIANFAN_RESPONSE', `tokens=${tokensUsed}`, { type, tokens: tokensUsed });
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        const isTransient = err.message?.includes('TIMEOUT') || err.message?.includes('HTTP_5') || err.message?.includes('HTTP_429');
        if (attempt < maxRetries && isTransient) {
          const backoff = 500 * Math.pow(2, attempt);
          console.warn(`[OPENROUTER_RETRY] attempt ${attempt + 1} failed: ${err.message}. Retrying in ${backoff}ms.`);
          AIOCRMetricsService.recordEvent('OPENROUTER_RETRY', `attempt=${attempt + 1} reason=${err.message}`, { type });
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        break;
      }
    }
    if (lastError) {
      console.error('[OCR_FALLBACK]', lastError.message);
      AIOCRMetricsService.recordFailure(type, lastError.message || 'AI_REQUEST_FAILED', Date.now() - start);
      return this.failure(type, lastError.message || 'AI_REQUEST_FAILED', start, preprocessed.bytes);
    }

    // Parse
    const parsed = this.parseJSON(raw);
    if (!parsed) {
      console.warn('[JSON_PARSE] failed; falling back. raw head:', raw.substring(0, 200));
      return this.failure(type, 'JSON_PARSE_FAILED', start, preprocessed.bytes);
    }
    console.log('[JSON_PARSE] fields=', Object.keys(parsed));

    // Validate
    const { validation, semanticScore, normalizedFields } = this.validate(parsed, type);
    console.log(`[SEMANTIC_VALIDATION] score=${(semanticScore * 100).toFixed(0)}%`, this.summarizeValidation(validation));
    AIOCRMetricsService.recordEvent('SEMANTIC_VALIDATION', `score=${(semanticScore * 100).toFixed(0)}%`, { type, score: Math.round(semanticScore * 100) });

    // New hybrid confidence (per spec):
    //   final = AI * 0.5 + Semantic * 0.3 + Document * 0.2
    // AI confidence: heuristic over output (JSON well-formed, mandatory fields present, no hallucination markers)
    // Semantic: aggregated FieldValidation.score
    // Document: completeness ratio of mandatory fields
    const aiConfidence = this.computeAIConfidence(parsed, type);
    const documentConfidence = this.computeCompleteness(type, normalizedFields);
    const finalConfidence = Math.round(Math.min(1, aiConfidence * 0.5 + semanticScore * 0.3 + documentConfidence * 0.2) * 100);
    const confidence = finalConfidence;
    console.log(`[CONFIDENCE_SCORE] final=${confidence}% (ai=${(aiConfidence * 100).toFixed(0)}% semantic=${(semanticScore * 100).toFixed(0)}% document=${(documentConfidence * 100).toFixed(0)}%)`);
    AIOCRMetricsService.recordEvent('CONFIDENCE_SCORE', `final=${confidence}%`, { type, ai: Math.round(aiConfidence * 100), semantic: Math.round(semanticScore * 100), document: Math.round(documentConfidence * 100) });

    const result: AIExtractionResult = {
      success: true,
      documentType: type,
      provider: 'QIANFAN_OCR_FAST',
      confidence,
      fields: normalizedFields,
      rawText: this.maskSensitive(raw),
      metrics: {
        latency: Date.now() - start,
        tokens: tokensUsed,
        imageBytes: preprocessed.bytes,
        semanticScore
      },
      validation
    };

    if (cacheKey && confidence >= 50) this.cacheSet(cacheKey, result);
    console.log(`[OCR_SUCCESS] type=${type} confidence=${confidence} latency=${result.metrics.latency}ms`);
    AIOCRMetricsService.recordSuccess(type, confidence, result.metrics.latency);
    return result;
  }

  /* ─────────────────── Prompts ─────────────────── */

  private buildPrompt(type: string): { system: string; user: string } {
    const system = [
      'Você é um sistema especializado em OCR documental brasileiro para seguros.',
      'Extraia TODOS os dados visíveis no documento.',
      'NÃO invente informações. NÃO complete campos automaticamente.',
      'NÃO use markdown. NÃO explique. Retorne SOMENTE JSON válido.',
      'Se um campo não existir no documento, retorne string vazia "".',
      'CPF formato: XXX.XXX.XXX-XX. Datas formato: DD/MM/YYYY. Placas em maiúsculas.'
    ].join(' ');

    switch (type) {
      case 'cnh':
        return {
          system,
          user: [
            'Documento: CNH (Carteira Nacional de Habilitação) digital brasileira.',
            '',
            'Localize e extraia EXATAMENTE estes campos:',
            '- nome: nome completo do condutor (texto em maiúsculas)',
            '- cpf: número do CPF, 11 dígitos (formato XXX.XXX.XXX-XX)',
            '- data_nascimento: data de nascimento (DD/MM/YYYY)',
            '- registro: número de registro da CNH, 9 a 11 dígitos',
            '- validade: data de validade (DD/MM/YYYY)',
            '- categoria: categoria da habilitação (A, B, AB, C, D, E, ACC)',
            '- filiacao_pai: nome completo do pai',
            '- filiacao_mae: nome completo da mãe',
            '- primeira_habilitacao: data da primeira habilitação (DD/MM/YYYY)',
            '',
            'IMPORTANTE: Examine a CNH inteira com atenção. Os números (CPF, registro) e datas estão visíveis claramente.',
            'Retorne APENAS este JSON, sem comentários:',
            '{"nome":"","cpf":"","data_nascimento":"","registro":"","validade":"","categoria":"","filiacao_pai":"","filiacao_mae":"","primeira_habilitacao":""}'
          ].join('\n')
        };
      case 'crv':
      case 'crlv':
        return {
          system,
          user: [
            'Documento: CRLV-e (Certificado de Registro e Licenciamento de Veículo) brasileiro.',
            '',
            'Localize e extraia EXATAMENTE estes campos:',
            '- nome: nome completo do proprietário ou razão social',
            '- cpf: CPF ou CNPJ do proprietário (formato XXX.XXX.XXX-XX ou XX.XXX.XXX/XXXX-XX)',
            '- placa: placa do veículo, 7 caracteres (Mercosul AAA-9A99 ou antiga AAA-9999)',
            '- chassi: chassi/VIN, exatamente 17 caracteres alfanuméricos',
            '- renavam: número RENAVAM, 9 a 11 dígitos',
            '- marca_modelo: marca e modelo do veículo (ex: VW/GOL)',
            '- categoria: categoria do veículo (PARTICULAR, COMERCIAL, etc.)',
            '- ano_modelo: ano do modelo (4 dígitos)',
            '- combustivel: tipo de combustível (GASOLINA, FLEX, DIESEL, etc.)',
            '',
            'ATENÇÃO ESPECIAL — Alienação Fiduciária:',
            'PROCURE em TODO o documento, especialmente nas seções "OBSERVAÇÕES", "OBS", "RESTRIÇÕES", "GRAVAMES", "OBSERVAÇÕES DO VEÍCULO":',
            '- Se encontrar QUALQUER UMA das palavras/frases: "ALIENAÇÃO FIDUCIÁRIA", "ALIENACAO FIDUCIARIA", "FIDUCIÁRIA", "GRAVAME", "FINANCIAMENTO", "ARRENDAMENTO", "LEASING", "RESERVA DE DOMÍNIO" ou nome de banco/financeira → alienacao_fiduciaria = "sim"',
            '- Caso CONTRÁRIO (não houver NENHUMA dessas palavras visíveis) → alienacao_fiduciaria = "não"',
            '- instituicao_financeira: se alienacao_fiduciaria = "sim", capture o nome do banco/financeira mencionado',
            '',
            'Retorne APENAS este JSON:',
            '{"nome":"","cpf":"","placa":"","chassi":"","renavam":"","marca_modelo":"","categoria":"","ano_modelo":"","combustivel":"","alienacao_fiduciaria":"","instituicao_financeira":""}'
          ].join('\n')
        };
      case 'policy':
      case 'apolice':
        return {
          system,
          user: [
            'Documento: Apólice de seguro auto brasileira.',
            '',
            'Localize e extraia TODOS estes campos. Para booleanos do questionário, retorne EXATAMENTE "sim" ou "não".',
            '- numero_apolice: número da apólice ou proposta',
            '- seguradora: nome da seguradora',
            '- corretora: nome da corretora',
            '- seguradora_cnpj, corretora_cnpj: CNPJ formato XX.XXX.XXX/XXXX-XX',
            '- corretora_susep: código SUSEP da corretora',
            '- segurado_nome, segurado_cpf, segurado_data_nascimento: dados do segurado',
            '- proprietario_veiculo_nome, proprietario_veiculo_cpf: dados do proprietário do veículo',
            '- placa: placa do veículo (formato Mercosul ou antiga)',
            '- chassi: 17 caracteres alfanuméricos',
            '- cep: CEP formato XXXXX-XXX',
            '- fim_vigencia, inicio_vigencia: datas DD/MM/YYYY',
            '- uso_comercial: "sim" ou "não"',
            '- alienacao_fiduciaria: "sim" ou "não"',
            '- proprietario_e_condutor: "sim" se proprietário do veículo é o condutor principal',
            '- condutor_jovem: "sim" se há condutor com idade < 25 anos',
            '- estado_civil: SOLTEIRO, CASADO, DIVORCIADO, VIUVO, UNIAO ESTAVEL',
            '',
            'Retorne APENAS este JSON:',
            '{"numero_apolice":"","seguradora":"","corretora":"","seguradora_cnpj":"","corretora_cnpj":"","corretora_susep":"","segurado_nome":"","segurado_cpf":"","segurado_data_nascimento":"","proprietario_veiculo_nome":"","proprietario_veiculo_cpf":"","placa":"","chassi":"","cep":"","fim_vigencia":"","inicio_vigencia":"","uso_comercial":"","alienacao_fiduciaria":"","proprietario_e_condutor":"","condutor_jovem":"","estado_civil":""}'
          ].join('\n')
        };
      default:
        return { system, user: 'Extraia o conteúdo textual relevante e retorne em JSON.' };
    }
  }

  /* ─────────────────── Parsing & validation ─────────────────── */

  private parseJSON(raw: string): Record<string, any> | null {
    if (!raw) return null;
    // Strip code fences if model misbehaved
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }
    // Extract first JSON object
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.substring(start, end + 1));
    } catch {
      return null;
    }
  }

  private validate(parsed: Record<string, any>, type: string): { validation: Record<string, FieldValidation>; semanticScore: number; normalizedFields: Record<string, any> } {
    const v: Record<string, FieldValidation> = {};
    const out: Record<string, any> = { ...parsed };
    const scores: FieldValidation[] = [];

    const runValidator = (key: string, fn: () => FieldValidation) => {
      if (parsed[key] == null || parsed[key] === '') return;
      const r = fn();
      v[key] = r;
      scores.push(r);
      if (r.ok) out[key] = r.normalized;
    };

    if (type === 'cnh') {
      runValidator('cpf', () => DocumentValidator.validateCPF(String(parsed.cpf)));
      runValidator('nome', () => DocumentValidator.validateName(String(parsed.nome)));
      runValidator('data_nascimento', () => DocumentValidator.validateDate(String(parsed.data_nascimento), { allowFuture: false }));
      runValidator('validade', () => DocumentValidator.validateDate(String(parsed.validade)));
      // Map to legacy field names so existing form code keeps working
      out.name = out.nome;
      out.birthDate = out.data_nascimento;
    } else if (type === 'crv' || type === 'crlv') {
      runValidator('placa', () => DocumentValidator.validatePlate(String(parsed.placa)));
      runValidator('chassi', () => DocumentValidator.validateChassis(String(parsed.chassi)));
      runValidator('cpf', () => DocumentValidator.validateCPF(String(parsed.cpf)));
      runValidator('nome', () => DocumentValidator.validateName(String(parsed.nome)));
      const alien = DocumentValidator.coerceBoolean(parsed.alienacao_fiduciaria);
      out.fiduciaryAlienation = alien === true ? 'SIM' : alien === false ? 'NÃO' : '';
      out.ownerName = out.nome;
      out.ownerCpf = out.cpf;
      out.brandModel = parsed.marca_modelo || '';
      out.financialInstitution = parsed.instituicao_financeira || '';
    } else if (type === 'policy' || type === 'apolice') {
      runValidator('segurado_cpf', () => DocumentValidator.validateCPF(String(parsed.segurado_cpf)));
      runValidator('segurado_nome', () => DocumentValidator.validateName(String(parsed.segurado_nome)));
      runValidator('placa', () => DocumentValidator.validatePlate(String(parsed.placa)));
      runValidator('chassi', () => DocumentValidator.validateChassis(String(parsed.chassi)));
      runValidator('cep', () => DocumentValidator.validateCEP(String(parsed.cep)));
      runValidator('fim_vigencia', () => DocumentValidator.validateDate(String(parsed.fim_vigencia)));
      runValidator('inicio_vigencia', () => DocumentValidator.validateDate(String(parsed.inicio_vigencia)));
      // Legacy field aliases
      out.insuredName = out.segurado_nome;
      out.insuredCpf = out.segurado_cpf;
      out.policyNumber = parsed.numero_apolice || '';
      out.insurer = parsed.seguradora || '';
      out.brokerName = parsed.corretora || '';
      out.brokerSusep = parsed.corretora_susep || '';
      out.insuranceExpiry = out.fim_vigencia;
      out.startDate = out.inicio_vigencia;
    }

    const semanticScore = scores.length > 0 ? DocumentValidator.aggregate(scores) : 0.5;
    return { validation: v, semanticScore, normalizedFields: out };
  }

  /**
   * Heuristic for how much we trust the AI's raw output:
   * - starts at 0.7
   * - +0.1 if all mandatory fields are non-empty (matches output schema)
   * - -0.1 per suspicious filler value ("undefined", "n/a", "exemplo")
   * - -0.2 if any mandatory field is glued to a placeholder
   * - capped to [0, 1]
   */
  private computeAIConfidence(parsed: Record<string, any>, type: string): number {
    const mandatoryByType: Record<string, string[]> = {
      cnh: ['nome', 'cpf', 'data_nascimento'],
      crv: ['nome', 'cpf', 'placa', 'chassi'],
      crlv: ['nome', 'cpf', 'placa', 'chassi'],
      policy: ['segurado_nome', 'segurado_cpf', 'seguradora', 'placa', 'chassi'],
      apolice: ['segurado_nome', 'segurado_cpf', 'seguradora', 'placa', 'chassi']
    };
    const mandatory = mandatoryByType[type] || [];
    let score = 0.7;
    const allPresent = mandatory.every(k => typeof parsed[k] === 'string' && (parsed[k] as string).length > 1);
    if (allPresent) score += 0.1;
    const hallucinationMarkers = ['undefined', 'null', 'n/a', 'exemplo', 'placeholder', 'lorem ipsum', 'fulano', 'beltrano'];
    let hits = 0;
    for (const v of Object.values(parsed)) {
      if (typeof v === 'string') {
        const lower = v.toLowerCase();
        if (hallucinationMarkers.some(m => lower.includes(m))) hits++;
      }
    }
    score -= Math.min(0.4, hits * 0.1);
    return Math.max(0, Math.min(1, score));
  }

  private computeCompleteness(type: string, fields: Record<string, any>): number {
    const required: Record<string, string[]> = {
      cnh: ['nome', 'cpf', 'data_nascimento'],
      crv: ['placa', 'chassi', 'nome'],
      crlv: ['placa', 'chassi', 'nome'],
      policy: ['numero_apolice', 'segurado_nome', 'segurado_cpf'],
      apolice: ['numero_apolice', 'segurado_nome', 'segurado_cpf']
    };
    const list = required[type] || [];
    if (list.length === 0) return 0.5;
    const filled = list.filter(k => typeof fields[k] === 'string' && fields[k].length > 1).length;
    return filled / list.length;
  }

  private summarizeValidation(v: Record<string, FieldValidation>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, r] of Object.entries(v)) {
      out[k] = r.ok ? `OK(${(r.score * 100).toFixed(0)})` : `FAIL(${r.reason})`;
    }
    return out;
  }

  /* ─────────────────── Cache ─────────────────── */

  private cacheGet(key: string): AIExtractionResult | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > CACHE_TTL_MS) {
        localStorage.removeItem(key);
        return null;
      }
      return entry.data as AIExtractionResult;
    } catch {
      return null;
    }
  }

  private cacheSet(key: string, data: AIExtractionResult) {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch (e: any) {
      // localStorage may be full; ignore
      console.warn('[AI_OCR_CACHE_SET_FAIL]', e?.message);
    }
  }

  /* ─────────────────── Helpers ─────────────────── */

  private normalizeType(t: string): AIDocumentType {
    const lower = (t || '').toLowerCase();
    if (lower === 'cnh') return 'cnh';
    if (lower === 'crv' || lower === 'crlv') return 'crv';
    if (lower === 'policy' || lower === 'apolice') return 'policy';
    return 'cnh';
  }

  private maskSensitive(text: string): string {
    if (!text) return '';
    let masked = text;
    // CPF
    masked = masked.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '***.***.***-**');
    // CNPJ
    masked = masked.replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, '**.***.***/****-**');
    // Truncate
    return masked.length > 800 ? masked.substring(0, 800) + '…' : masked;
  }

  private failure(type: string, reason: string, startedAt: number, imageBytes: number): AIExtractionResult {
    return {
      success: false,
      documentType: type,
      provider: 'QIANFAN_OCR_FAST',
      confidence: 0,
      fields: {},
      rawText: '',
      fallback: true,
      error: reason,
      metrics: { latency: Date.now() - startedAt, imageBytes }
    };
  }
}
