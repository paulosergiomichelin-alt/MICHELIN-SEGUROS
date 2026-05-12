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
const CACHE_PREFIX = 'ai_ocr_cache:';
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
    const payload: OpenRouterChatRequest = {
      model: activeModel,
      temperature: 0,
      max_tokens: 1024,
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

    console.log(`[QIANFAN_REQUEST] model=${activeModel} bytes=${preprocessed.bytes}`);
    AIOCRMetricsService.recordEvent('QIANFAN_REQUEST', `model=${activeModel}`, { type, bytes: preprocessed.bytes });
    let raw = '';
    let tokensUsed = 0;
    try {
      const response = await OpenRouterOCRClient.chatCompletion(apiKey, payload, activeTimeout);
      raw = response.choices?.[0]?.message?.content || '';
      tokensUsed = response.usage?.total_tokens || 0;
      console.log(`[QIANFAN_RESPONSE] tokens=${tokensUsed} finish=${response.choices?.[0]?.finish_reason}`);
      AIOCRMetricsService.recordEvent('QIANFAN_RESPONSE', `tokens=${tokensUsed}`, { type, tokens: tokensUsed });
    } catch (err: any) {
      console.error('[OCR_FALLBACK]', err.message);
      AIOCRMetricsService.recordFailure(type, err.message || 'AI_REQUEST_FAILED', Date.now() - start);
      return this.failure(type, err.message || 'AI_REQUEST_FAILED', start, preprocessed.bytes);
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

    // Hybrid confidence: AI baseline + semantic + completeness
    const completeness = this.computeCompleteness(type, normalizedFields);
    const aiBaseline = 0.6; // assume 60% for AI raw output before semantic checks
    const confidence = Math.round(Math.min(1, aiBaseline * 0.4 + semanticScore * 0.5 + completeness * 0.1) * 100);
    console.log(`[CONFIDENCE_SCORE] hybrid=${confidence}% (semantic=${(semanticScore * 100).toFixed(0)}% completeness=${(completeness * 100).toFixed(0)}%)`);

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
      'Extraia SOMENTE os dados presentes no documento.',
      'NÃO invente informações. NÃO complete campos automaticamente.',
      'NÃO use markdown. NÃO explique. Retorne SOMENTE JSON válido.',
      'Se um campo não existir no documento, retorne string vazia "".',
      'Datas em formato DD/MM/YYYY. CPF/CNPJ formatados. Placas em maiúsculas.'
    ].join(' ');

    switch (type) {
      case 'cnh':
        return {
          system,
          user: [
            'Documento: CNH (Carteira Nacional de Habilitação) brasileira.',
            'Retorne JSON com as chaves abaixo (use string vazia se não encontrar):',
            '{"nome":"","cpf":"","data_nascimento":"","registro":"","validade":"","categoria":"","filiacao_pai":"","filiacao_mae":"","primeira_habilitacao":""}'
          ].join('\n')
        };
      case 'crv':
      case 'crlv':
        return {
          system,
          user: [
            'Documento: CRLV-e (Certificado de Registro e Licenciamento de Veículo) brasileiro.',
            'Detecte alienação fiduciária procurando palavras como BANCO, FINANCIAMENTO, ALIENAÇÃO, ARRENDAMENTO, LEASING na seção observações.',
            'Retorne JSON com as chaves abaixo (use string vazia se não encontrar):',
            '{"nome":"","cpf":"","placa":"","chassi":"","renavam":"","marca_modelo":"","categoria":"","ano_modelo":"","combustivel":"","alienacao_fiduciaria":"","instituicao_financeira":""}'
          ].join('\n')
        };
      case 'policy':
      case 'apolice':
        return {
          system,
          user: [
            'Documento: Apólice de seguro auto brasileira.',
            'Para campos booleanos do questionário, responda apenas "sim" ou "não".',
            'Retorne JSON com as chaves abaixo (use string vazia se não encontrar):',
            '{"numero_apolice":"","seguradora":"","corretora":"","seguradora_cnpj":"","corretora_cnpj":"","corretora_susep":"",',
            '"segurado_nome":"","segurado_cpf":"","segurado_data_nascimento":"",',
            '"proprietario_veiculo_nome":"","proprietario_veiculo_cpf":"",',
            '"placa":"","chassi":"","cep":"","fim_vigencia":"","inicio_vigencia":"",',
            '"uso_comercial":"","alienacao_fiduciaria":"","proprietario_e_condutor":"","condutor_jovem":"","estado_civil":""}'
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
