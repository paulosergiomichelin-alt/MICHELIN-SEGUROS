/**
 * DeterministicParser.ts
 * NO-AI ENTERPRISE PIPELINE.
 * Rigid, regex-based extraction for Brazilian documents.
 */
import { FieldSanitizer } from './FieldSanitizer';
import { VehicleRestrictionEngine } from './VehicleRestrictionEngine';
import { ContextualFieldExtractor } from './ContextualFieldExtractor';
import { LabelMappingEngine } from './LabelMappingEngine';
import { InsurerDetectorService } from './InsurerDetectorService';
import { BrokerExtractionEngine } from './BrokerExtractionEngine';
import { StructuredOCRResult } from '../../types/OCRTypes';
import { LayoutAwareExtractionEngine } from './LayoutAwareExtractionEngine';

export class DeterministicParser {
  private static instance: DeterministicParser;
  
  private static MANDATORY_FIELDS: Record<string, string[]> = {
    cnh: ['name', 'cpf', 'registration'],
    crlv: ['plate', 'renavam'],
    policy: ['insuredName', 'policyNumber', 'insurer']
  };

  private constructor() {}

  public static getInstance(): DeterministicParser {
    if (!this.instance) this.instance = new DeterministicParser();
    return this.instance;
  }

  public parse(text: string, type: string, regions?: any, structured?: StructuredOCRResult): any {
    const sanitizer = FieldSanitizer.getInstance();
    
    // Initialize Layout Engine if structured data exists
    const isStructured = !!structured && structured.words.length > 0;
    if (isStructured) {
      LayoutAwareExtractionEngine.getInstance().setResult(structured);
      console.log(`[DETERMINISTIC_PARSER] [STRUCTURED_MODE_ENABLED] Geometry-linked engine active for ${type.toUpperCase()}`);
    } else {
      if (type === 'cnh') {
        console.error(`[DETERMINISTIC_PARSER] [CRITICAL_FAIL] CNH MUST have spatial tokens.`);
        throw new Error('CNH_SPATIAL_EXTRACTION_MANDATORY_FAILED');
      }
      console.warn(`[DETERMINISTIC_PARSER] [FALLBACK_TEXT_MODE] No spatial data available. Falling back to linear regex.`);
    }

    let data: any;
    switch (type) {
      case 'cnh':
        data = this.parseCNH(text, regions, structured);
        break;
      case 'crlv':
      case 'crv':
        data = this.parseCRLV(text, structured);
        break;
      case 'policy':
        data = this.parsePolicy(text, structured);
        break;
      default:
        data = {};
    }

    // Apply Hard Validation & Mandatory Checks
    return this.applyEnterpriseMandates(data, type);
  }

  private parseCNH(text: string, regions?: any, structured?: StructuredOCRResult): any {
    const data: any = {};
    const sanitizer = FieldSanitizer.getInstance();
    const layout = LayoutAwareExtractionEngine.getInstance();
    
    // 1. MANDATORY SPATIAL DATA CHECK
    const isStructured = !!structured && structured.words.length > 0;
    if (!isStructured) {
      console.error('[CNH_PARSER] [FAIL_FAST] No structured spatial data found for CNH.');
      return {}; 
    }

    // 2. REGION-BASED SPATIAL EXTRACTION (Priority)
    // We use the remapped structured tokens to get data from specific geometric zones
    
    // Nome: Region normalized around { x: 80, y: 100, width: 680, height: 130 }
    const nameData = layout.extractField(['NOME'], {
      maxWords: 7,
      stopTokens: ['CPF', 'FILIACAO', 'DOC', 'DATA'],
      anchorRegion: { x: 80, y: 100, width: 680, height: 130 }
    });
    data.name = sanitizer.sanitizeCNHName(nameData.value);
    console.log(`[CNH_PARSER] [NAME] Extracted: "${nameData.value}" | Sanitized: "${data.name}" | Reason: ${nameData.reason}`);

    // CPF: Region normalized around { x: 380, y: 280, width: 360, height: 110 }
    const cpfData = layout.extractField(['CPF'], {
      pattern: /[0-9]{3}?[0-9]{3}?[0-9]{3}?[0-9]{2}|[0-9]{11}/,
      stopTokens: ['NOME', 'NASCIMENTO'],
      anchorRegion: { x: 380, y: 280, width: 360, height: 110 }
    });
    data.cpf = sanitizer.sanitizeCPF(cpfData.value);
    console.log(`[CNH_PARSER] [CPF] Extracted: "${cpfData.value}" | Sanitized: "${data.cpf}" | Reason: ${cpfData.reason}`);

    // Nascimento: Region normalized around { x: 70, y: 280, width: 310, height: 110 }
    const birthData = layout.extractField(['NASCIMENTO'], {
      pattern: /\d{2}\/?[0-9]{2}\/?[0-9]{4}/,
      anchorRegion: { x: 70, y: 280, width: 310, height: 110 }
    });
    data.birthDate = sanitizer.validate(sanitizer.sanitizeDate(birthData.value), sanitizer.REGEX.DATE);
    console.log(`[CNH_PARSER] [BIRTH] Extracted: "${birthData.value}" | Sanitized: "${data.birthDate}" | Reason: ${birthData.reason}`);

    // Validade: { x: 350, y: 380, width: 330, height: 110 }
    const validityData = layout.extractField(['VALIDADE'], {
      pattern: /\d{2}\/?[0-9]{2}\/?[0-9]{4}/,
      anchorRegion: { x: 350, y: 380, width: 330, height: 110 }
    });
    data.validity = sanitizer.validate(sanitizer.sanitizeDate(validityData.value), sanitizer.REGEX.DATE);
    console.log(`[CNH_PARSER] [VALIDITY] Extracted: "${validityData.value}" | Sanitized: "${data.validity}" | Reason: ${validityData.reason}`);

    // Registro: { x: 70, y: 380, width: 320, height: 110 }
    const regData = layout.extractField(['REGISTRO'], {
      pattern: /[0-9]{9,11}/,
      anchorRegion: { x: 70, y: 380, width: 320, height: 110 }
    });
    data.registration = regData.value.match(/\d{9,11}/)?.[0] || '';
    console.log(`[CNH_PARSER] [REGISTRO] Extracted: "${regData.value}" | Sanitized: "${data.registration}" | Reason: ${regData.reason}`);

    // Categoria: { x: 580, y: 395, width: 110, height: 60 }
    data.category = layout.extractField(['CATEGORIA'], {
      anchorRegion: { x: 580, y: 395, width: 110, height: 60 }
    }).value.match(/[A-E]{1,2}|ACC/)?.[0] || '';

    // 3. LEGACY REGIONAL OBJECT FALLBACK
    if (regions) {
      if (!data.name) data.name = sanitizer.sanitizeCNHName(regions.nome || '');
      if (!data.cpf) data.cpf = sanitizer.sanitizeCPF(regions.cpf || '');
      if (!data.registration) data.registration = (regions.registro || '').match(/\d{9,11}/)?.[0] || '';
    }

    // 4. GLOBAL TEXT FALLBACK (Only for unstructured snippets if safety score is high)
    if (!data.cpf) {
      const globalCPF = text.match(/[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{11}/);
      if (globalCPF) data.cpf = sanitizer.sanitizeCPF(globalCPF[0]);
    }

    // Final Purity Check for Name
    if (sanitizer.isRejectedValue(data.name)) {
      data.name = '';
    }

    // 5. PIPELINE FAIL-FAST
    const required = ['name']; 
    const missing = required.filter(f => !data[f]);

    if (missing.length > 0) {
      console.error(`[CNH_PARSER] [PIPELINE_FAILED] Mandatory field "name" missing. Available data:`, Object.keys(data));
      // FALLBACK: Return data even if partial, let the calling layer decide
      return data; 
    }

    return this.validateExtraction(data);
  }

  private parseCRLV(text: string, structured?: StructuredOCRResult): any {
    const data: any = {};
    const sanitizer = FieldSanitizer.getInstance();
    const layout = LayoutAwareExtractionEngine.getInstance();

    const isStructured = !!structured && structured.words.length > 0;

    if (isStructured) {
       // USE SPATIAL EXTRACTION — BELOW direction because CRLV labels sit above values
       data.plate = layout.extractField(['PLACA', 'PLACA DO VEICULO'], {
         direction: 'BELOW',
         pattern: /[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i,
         maxWords: 2
       }).value.toUpperCase().replace('-', '');

       data.renavam = layout.extractField(['RENAVAM', 'Nº DO RENAVAM'], {
         direction: 'BELOW',
         pattern: /\d{9,11}/,
         maxWords: 2
       }).value;

       data.chassis = layout.extractField(['CHASSI', 'IDENTIFICACAO'], {
         direction: 'BELOW',
         pattern: /[A-HJ-NPR-Z0-9]{17}/i,
         maxWords: 2
       }).value.toUpperCase();

       data.ownerName = sanitizer.sanitizeName(layout.extractField(['PROPRIETARIO', 'NOME', 'NOME DO PROPRIETARIO'], {
          direction: 'BELOW',
          maxChars: 70,
          maxWords: 7,
          stopTokens: ['CPF', 'CNPJ', 'PLACA', 'LOCAL', 'DOCUMENTO', 'ESTADO', 'MUNICIPIO', 'ENDERECO']
       }).value);

       // Fallback to linear text when spatial BELOW extraction still returns empty
       if (!data.plate)
         data.plate = ContextualFieldExtractor.extractPlate(text);
       if (!data.renavam)
         data.renavam = ContextualFieldExtractor.extract(text, ['RENAVAM', 'Nº DO RENAVAM', 'CODIGO RENAVAM'], { pattern: /\d{9,11}/ });
       if (!data.chassis)
         data.chassis = ContextualFieldExtractor.extract(text, ['CHASSI', 'IDENTIFICACAO'], { pattern: /[A-HJ-NPR-Z0-9]{17}/i }).toUpperCase();
       if (!data.ownerName)
         data.ownerName = sanitizer.sanitizeName(ContextualFieldExtractor.extract(text, ['PROPRIETARIO', 'NOME DO PROPRIETARIO'], { maxChars: 70, stopTokens: ['CPF', 'CNPJ', 'PLACA'] }));
    } else {
       // FALLBACK TO CONTEXTUAL (LEGACY RIGID)
       data.plate = ContextualFieldExtractor.extract(text, ['PLACA', 'PLACA DO VEICULO'], {
         pattern: /[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/i,
         stopTokens: ['CHASSI', 'MODELO', 'ANO']
       }).toUpperCase().replace('-', '');

       data.renavam = ContextualFieldExtractor.extract(text, ['RENAVAM', 'Nº DO RENAVAM'], {
         pattern: /\d{9,11}/,
         stopTokens: ['PLACA', 'CHASSI']
       });

       data.chassis = ContextualFieldExtractor.extract(text, ['CHASSI', 'IDENTIFICACAO'], {
         pattern: /[A-HJ-NPR-Z0-9]{17}/i,
         stopTokens: ['RENAVAM', 'PLACA']
       }).toUpperCase();

       data.ownerName = sanitizer.sanitizeName(ContextualFieldExtractor.extract(text, ['PROPRIETARIO', 'NOME', 'NOME DO PROPRIETARIO'], {
          maxChars: 70,
          stopTokens: ['CPF', 'CNPJ', 'PLACA', 'LOCAL', 'DOCUMENTO', 'ESTADO', 'MUNICIPIO']
       }));
    }

    data.ownerCpf = sanitizer.sanitizeCPF(ContextualFieldExtractor.extractCPF(text));
    
    // Brand/Model extraction (Lines) - This usually works well with textual split as it's a specific line
    const lines = text.split(/[\n\r]/);
    for (let i = 0; i < lines.length; i++) {
      const uLine = lines[i].toUpperCase();
      if (uLine.includes('MARCA/MODELO') || uLine.includes('MODELO:')) {
        const parts = lines[i].split(/[:\s]{2,}/);
        const extracted = parts.length > 1 ? parts.pop()?.trim().substring(0, 50) : '';
        if (extracted && !sanitizer.isRejectedValue(extracted) && extracted.length > 3) {
           data.brandModel = extracted;
        }
      }
    }
    
    const restriction = VehicleRestrictionEngine.analyze(text);
    data.fiduciaryAlienation = restriction.hasFinancialRestriction ? 'SIM' : 'NÃO';
    data.financialInstitution = restriction.financialInstitution || '';
    data.restrictionType = restriction.restrictionType || '';

    return this.validateExtraction(data);
  }

  private parsePolicy(text: string, structured?: StructuredOCRResult): any {
    const data: any = {};
    const sanitizer = FieldSanitizer.getInstance();
    const layout = LayoutAwareExtractionEngine.getInstance();
    
    const isStructured = !!structured && structured.words.length > 0;

    // 1. Base Detectors (Always detectable from text)
    data.insurer = InsurerDetectorService.detect(text);

    // Labels with accented variants for Brazilian policies
    const policyNumberLabels = ['NUMERO DA APOLICE', 'NÚMERO DA APÓLICE', 'APOLICE', 'APÓLICE', 'Nº APOLICE', 'Nº APÓLICE', 'PROPOSTA', 'Nº PROPOSTA', 'NUMERO APOLICE', 'APOLICE ATUAL'];
    const insuredNameLabels  = ['SEGURADO(A)', 'NOME DO SEGURADO', 'NOME DO SEGURADO(A)', 'NOME DO(A) SEGURADO', 'SEGURADO', 'CONTRATANTE', 'NOME'];
    const insuredCpfLabels   = ['CPF', 'CNPJ', 'CPF/CNPJ', 'CNPJ/CPF'];
    const brokerLabels       = ['CORRETOR', 'CORRETORA', 'INTERMEDIARIO', 'INTERMEDIÁRIO'];
    const expiryLabels       = ['FIM VIGENCIA', 'FIM VIGÊNCIA', 'VENCIMENTO', 'ATE', 'DATA VENCIMENTO', 'VIGENCIA ATE', 'FIM DA VIGENCIA'];
    const startLabels        = ['INICIO VIGENCIA', 'INÍCIO VIGÊNCIA', 'DESDE', 'VIGENCIA DE', 'VIGÊNCIA DE', 'INICIO DA VIGENCIA'];

    if (isStructured) {
       console.log('[POLICY_PARSER] [STRUCTURED_PIPELINE_ACTIVE] Executing spatial extraction.');

       data.policyNumber = layout.extractField(policyNumberLabels, {
         maxChars: 40,
         maxWords: 3,
         pattern: /[A-Z0-9.\-/]{6,}/,
         stopTokens: ['VIGENCIA', 'VENCIMENTO', 'SEGURADO', 'VALOR', 'COBERTURA', 'EMISSAO']
       }).value;

       data.insuredName = sanitizer.sanitizeName(layout.extractField(insuredNameLabels, {
          maxChars: 70,
          maxWords: 7,
          stopTokens: ['CPF', 'CNPJ', 'ENDERECO', 'TELEFONE', 'LOCAL', 'LIMITES', 'IMPORTANCIA', 'PREMIO', 'COBERTURA', 'EMITIU', 'ESTA', 'BAIRRO', 'CEP']
       }).value);

       data.insuredCpf = sanitizer.sanitizeCPF(layout.extractField(insuredCpfLabels, {
         pattern: /[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{11}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/,
         maxWords: 2,
         stopTokens: ['NOME', 'ENDERECO', 'TELEFONE', 'ESTA', 'DADOS']
       }).value);

       data.brokerName = sanitizer.sanitizeName(layout.extractField(brokerLabels, {
         maxChars: 80,
         maxWords: 8,
         stopTokens: ['SUSEP', 'CNPJ', 'TELEFONE', 'VINCULO', 'LOCAL', 'ENDERECO', 'DADOS', 'OUVIDORIA', 'PORTAL']
       }).value);

       data.insuranceExpiry = layout.extractField(expiryLabels, {
         pattern: /\d{2}\/\d{2}\/\d{4}/,
         stopTokens: ['VALOR', 'PREMIO', 'R$']
       }).value;

       data.startDate = layout.extractField(startLabels, {
         pattern: /\d{2}\/\d{2}\/\d{4}/,
         stopTokens: ['ATE', 'VALOR']
       }).value;

       // Fallback to linear text for mandatory fields not found by spatial engine
       if (!data.policyNumber)
         data.policyNumber = ContextualFieldExtractor.extract(text, policyNumberLabels, {
           maxChars: 40,
           pattern: /[A-Z0-9.\-/]{6,}/,
           stopTokens: ['VIGENCIA', 'VIGÊNCIA', 'VENCIMENTO', 'SEGURADO']
         });
       if (!data.insuredName)
         data.insuredName = sanitizer.sanitizeName(ContextualFieldExtractor.extract(text, insuredNameLabels, {
           maxChars: 70,
           stopTokens: ['CPF', 'CNPJ', 'ENDERECO', 'TELEFONE', 'LOCAL', 'FALECONOSCO', 'LIMITES', 'IMPORTANCIA', 'PREMIO']
         }));
       if (!data.insuredCpf)
         data.insuredCpf = sanitizer.sanitizeCPF(ContextualFieldExtractor.extractCPF(text));
    } else {
       console.warn('[POLICY_PARSER] [FALLBACK_TEXT_MODE] Policy parsing using linear heuristics.');
       data.policyNumber = ContextualFieldExtractor.extract(text, policyNumberLabels, {
         maxChars: 40,
         pattern: /[A-Z0-9.\-/]{6,}/,
         stopTokens: ['VIGENCIA', 'VIGÊNCIA', 'VENCIMENTO', 'SEGURADO']
       });

       data.insuredName = sanitizer.sanitizeName(ContextualFieldExtractor.extract(text, insuredNameLabels, {
          maxChars: 70,
          stopTokens: ['CPF', 'CNPJ', 'ENDERECO', 'TELEFONE', 'LOCAL', 'FALECONOSCO', 'LIMITES', 'IMPORTANCIA', 'PREMIO']
       }));

       data.insuredCpf = sanitizer.sanitizeCPF(ContextualFieldExtractor.extractCPF(text));
       data.brokerName = sanitizer.sanitizeName(ContextualFieldExtractor.extractBroker(text));
       data.insuranceExpiry = ContextualFieldExtractor.extractDate(text, expiryLabels);
       data.startDate = ContextualFieldExtractor.extractDate(text, startLabels);
    }
    
    const brokerDetails = BrokerExtractionEngine.extract(text);
    if (!data.brokerSusep && brokerDetails.susep) {
      data.brokerSusep = brokerDetails.susep;
    }

    return this.validateExtraction(data);
  }

  private applyEnterpriseMandates(data: any, type: string): any {
    if (!data || Object.keys(data).length === 0) return {};

    const mandatory = DeterministicParser.MANDATORY_FIELDS[type] || [];
    const missing = mandatory.filter(m => !data[m] || data[m].length < 2);

    if (missing.length > 0) {
      console.warn(`[DETERMINISTIC_PARSER] [MANDATORY_FIELDS_MISSING] Type: ${type} | Missing: ${missing.join(', ')}`);
      // We still return data but mark as partial
      return { ...data, _partial: true, _missingMandatory: missing };
    }

    return { ...data, _partial: false };
  }

  private validateExtraction(data: any): any {
    const sanitizer = FieldSanitizer.getInstance();
    const result: any = { ...data };
    let hasSemanticValue = false;

    for (const key in result) {
      const val = result[key];
      if (typeof val === 'string' && val.length > 0) {
        if (sanitizer.isRejectedValue(val)) {
           console.warn(`[DETERMINISTIC_PARSER] [FIELD_REJECTED] Value "${val}" for field "${key}" is likely a label.`);
           result[key] = '';
        } else {
           hasSemanticValue = true;
        }
      }
    }

    return hasSemanticValue ? result : {};
  }
}
