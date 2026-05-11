import { DocumentNormalizationService } from './DocumentNormalizationService';
import { FieldSanitizer } from './FieldSanitizer';

export interface ExtractionResult {
  value: string;
  confidence: number;
  sourceLine: string;
  labelMatched: string;
  validationPassed: boolean;
}

/**
 * ContextualFieldExtractor.ts
 * Enterprise-grade contextual extraction for semi-structured documents (Policies, Proposals).
 * Uses structured line analysis, stop-labels, and boundary detection.
 */
export class ContextualFieldExtractor {
  // Labels that signal the start of another field and should stop extraction
  private static readonly STOP_LABELS = [
    'CPF', 'CNPJ', 'RAMO', 'VIGENCIA', 'SEGURADORA', 'APOLICE', 'FRANQUIA', 
    'ENDERECO', 'TELEFONE', 'SUSEP', 'PLACA', 'RENAVAM', 'CHASSI', 'DATA',
    'NOME', 'SOCIAL', 'SEGURADO', 'MARCA', 'MODELO', 'ANO', 'FAIXA', 'BONUS'
  ];

  private static readonly BLACKLIST = [
    'PODERA SER CONFIRMADA', 'ASSINADOR SERPRO', 'TERMOS E CONDICOES',
    'PROCESSOS SUSEP', 'CONFORME RESOLUCAO', 'WWW.', 'HTTP', 'QR CODE',
    'CODIGO DE SEGURANCA', 'AUTENTICACAO MECANICA', 'RESERVADO AO FISCO',
    'SOCIAL DO(A) SEGURADO(A)', 'NOME DO(A) SEGURADO(A)', 'CPF/CNPJ', 'CNPJ/CPF',
    'IDENTIFICACAO', 'SEGURADO(A):', 'LIMITES', 'COBERTURAS', 'VINCULO:', 'LOCAL:'
  ];

  private static readonly NOISE_PATTERNS = [
    /NAME AND SURNAME/gi,
    /PRIMERA LICENCIA/gi,
    /FIRST DRIVER LICENSE/gi,
    /SEGURADO\(A\)/gi,
    /SOCIAL DO\(A\)/gi,
    /DOCUMENTO DE IDENTIFICACAO/gi,
    /CORRETOR\(A\)/gi,
    /ENDERECO DO\(A\)/gi,
    /CONTATO DO\(A\)/gi
  ];

  /**
   * Tokenizes document into clean, normalized lines with preserved structure.
   */
  private static tokenizeLines(text: string): string[] {
    return text.split(/[\n\r]/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/\s{2,}/g, '  ')); // Preserve double spaces for potential columns
  }

  /**
   * Cleans OCR artifacts and artifacts like "NOME DO(A)".
   */
  private static sanitizeNoise(val: string): string {
    let sanitized = val;
    for (const pattern of this.NOISE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '');
    }
    // Remove leading symbols
    return sanitized.replace(/^[:\-.; ]+/, '').trim();
  }

  /**
   * Finds where a field value likely ends within a block of text.
   */
  private static findBoundary(text: string, currentLabel: string, stopTokens: string[] = []): string {
    if (!text) return '';
    
    // 1. Column Break Detection (3+ spaces usually indicates next column)
    const columnSplit = text.split(/ {3,}/);
    let candidate = columnSplit[0].trim();

    // 2. Stop Labels/Tokens Detection (Next field start)
    const upperCandidate = candidate.toUpperCase();
    const allStopLabels = [...this.STOP_LABELS, ...stopTokens];

    for (const stopLabel of allStopLabels) {
      if (stopLabel === currentLabel.toUpperCase()) continue;
      
      const regex = new RegExp(`\\b${stopLabel}\\b|${stopLabel}[:/]`, 'i');
      const match = candidate.match(regex);
      if (match && match.index !== undefined) {
         candidate = candidate.substring(0, match.index).trim();
      }
    }

    return candidate;
  }

  /**
   * Core Extraction Engine (Line-based)
   */
  public static extract(text: string, labels: string[], options: { 
    maxChars?: number; 
    sameLine?: boolean;
    pattern?: RegExp;
    type?: string;
    validate?: (val: string) => boolean;
    takeFirstWord?: boolean;
    stopTokens?: string[];
  } = {}): string {
    // PROTEÇÃO: CNH e CRLV são proibidos aqui
    if (text.includes('CNH_DETERMINISTIC_REGIONAL_CORE') || text.includes('CNH_STRUCTURED_REGIONAL_DATA')) {
       return '';
    }

    const { maxChars = 80, sameLine = true, pattern, validate, takeFirstWord = false, stopTokens = [] } = options;
    const lines = this.tokenizeLines(text);
    const sanitizer = FieldSanitizer.getInstance();
    
    for (const label of labels) {
      const uLabel = label.toUpperCase();
      
      for (let i = 0; i < lines.length; i++) {
        const uLine = lines[i].toUpperCase();
        
        // Exact label match or label followed by separator
        const labelRegex = new RegExp(`\\b${uLabel}\\b|${uLabel}[:/]`, 'i');
        const labelMatch = lines[i].match(labelRegex);
        
        if (!labelMatch || labelMatch.index === undefined) continue;

        const index = labelMatch.index;

        // Strategy 1: Same line (Right of label)
        const afterLabel = lines[i].substring(index + labelMatch[0].length).trim();
        let rawCandidate = this.findBoundary(afterLabel, label, stopTokens);

        // Strategy 2: Next line (if same line is just a label separator or empty)
        if ((!rawCandidate || rawCandidate.length < 2) && !sameLine && i + 1 < lines.length) {
          rawCandidate = this.findBoundary(lines[i + 1], label, stopTokens);
        }

        if (!rawCandidate) continue;

        // SANITIZATION
        let candidate = this.sanitizeNoise(rawCandidate);
        candidate = candidate.replace(/^[:\-.; ]+/, '').trim();
        
        if (takeFirstWord) {
          candidate = candidate.split(/[ \n\r\t]/)[0];
        }

        // REJECTION GATES
        if (candidate.length < 2) continue;
        if (candidate.length > maxChars) candidate = candidate.substring(0, maxChars).trim();
        
        // Check rejection list
        if (sanitizer.isRejectedValue(candidate)) continue;
        
        if (this.BLACKLIST.some(b => candidate.toUpperCase().includes(b))) continue;

        // Pattern filter
        if (pattern) {
          const pMatch = candidate.match(pattern);
          if (!pMatch) continue;
          candidate = pMatch[0];
        }
        
        // Custom Validator
        if (validate && !validate(candidate)) continue;

        console.log(`[CONTEXTUAL_FIELD] Success: "${label}" -> "${candidate}"`);
        return candidate;
      }
    }

    return '';
  }

  /**
   * Hardened CPF Extraction
   */
  public static extractCPF(text: string): string {
    const sanitizer = FieldSanitizer.getInstance();
    const labels = ['CPF', 'SOCIAL/CNPJ', 'CPF/CNPJ', 'CNPJ/CPF', 'Nº DO CPF', 'NUMERO DO CPF', 'SEGURADO:'];
    
    const val = this.extract(text, labels, {
      pattern: /[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/,
      stopTokens: ['CONDUTOR', 'VINCULO', 'CATEGORIA', 'PROPRIETARIO'],
      validate: (v) => {
        const digits = v.replace(/\D/g, '');
        // Validate CPF or CNPJ length and checksum
        if (digits.length === 11) return sanitizer.validateCPFChecksum(digits);
        if (digits.length === 14) return true; // Simple length for CNPJ for now
        return false;
      }
    });

    return sanitizer.isRejectedValue(val) ? '' : sanitizer.sanitizeCPF(val);
  }

  /**
   * Hardened Date Extraction
   */
  public static extractDate(text: string, labels: string[]): string {
    const sanitizer = FieldSanitizer.getInstance();
    return this.extract(text, labels, {
      pattern: /[0-9]{2}\/[0-9]{2}\/[0-9]{4}/,
      stopTokens: ['VALOR', 'PREMIO', 'R$', 'BOLETO'],
      validate: (v) => {
        const clean = sanitizer.sanitizeDate(v);
        if (!clean) return false;
        // Basic sanity check: year between 1920 and 2050
        const parts = clean.split('/');
        if (parts.length < 3) return false;
        const year = parseInt(parts[2]);
        return year >= 1920 && year <= 2050;
      }
    });
  }

  /**
   * Policy/Proposal Extraction
   */
  public static extractPolicyNumber(text: string): string {
    const labels = ['NUMERO DA APOLICE', 'APOLICE', 'Nº APOLICE', 'PROPOSTA', 'Nº PROPOSTA', 'APOLICE ATUAL'];
    return this.extract(text, labels, { 
      maxChars: 40,
      pattern: /[A-Z0-9.\-/]{6,}/, // At least 6 chars for a policy
      stopTokens: ['VIGENCIA', 'VENCIMENTO', 'SEGURADO', 'VALOR']
    });
  }

  /**
   * Broker/Corretora Extraction (Multi-word support)
   */
  public static extractBroker(text: string): string {
    const labels = ['CORRETOR', 'CORRETORA', 'INTERMEDIARIO', 'NOME DA CORRETORA', 'CORRETORA DE SEGUROS'];
    let val = this.extract(text, labels, { 
      maxChars: 120,
      stopTokens: ['SUSEP', 'CNPJ', 'TELEFONE', 'ENDERECO', 'VINCULO']
    });
    
    if (!val) return '';

    // Split if concatenated with SUSEP or CNPJ
    if (val.toUpperCase().includes('SUSEP')) val = val.split(/SUSEP/i)[0].trim();
    if (val.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)) {
       val = val.split(/\d{2}\.\d{3}/)[0].trim();
    }
    
    return val.replace(/[:\-.; ]+$/, '').trim();
  }

  /**
   * Hardened Name Extraction
   */
  public static extractName(text: string): string {
    const labels = ['SEGURADO(A)', 'NOME', 'NOME DO SEGURADO', 'SEGURADO', 'CONTRATANTE', 'NOME DO CONDUTOR', 'NOME DO(A) SEGURADO'];
    const val = this.extract(text, labels, { 
      maxChars: 80,
      stopTokens: ['CPF', 'CNPJ', 'ENDERECO', 'TELEFONE', 'LOCAL', 'DOCUMENTO']
    });
    
    const upperVal = val.toUpperCase();
    if (upperVal === 'SEGURADO' || upperVal === 'NOME' || val.length < 3) {
      return '';
    }
    return val;
  }

  /**
   * Vehicle Plate Extraction
   */
  public static extractPlate(text: string): string {
    const labels = ['PLACA', 'PLACA DO VEICULO', 'PREFIXO'];
    return this.extract(text, labels, {
       maxChars: 8,
       pattern: /[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}-?[0-9]{4}/i
    }).toUpperCase().replace('-', '');
  }

  /**
   * Validates and cleans a year field.
   */
  public static cleanYear(val: string): string {
    const clean = val.replace(/\D/g, '');
    if (clean.length === 4 && (clean.startsWith('19') || clean.startsWith('20'))) {
      return clean;
    }
    return '';
  }
}
