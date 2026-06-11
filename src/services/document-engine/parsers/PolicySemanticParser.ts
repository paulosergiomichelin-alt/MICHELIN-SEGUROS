/**
 * PolicySemanticParser.ts
 * High-precision parser for Insurance Policies.
 */
import { ContextualFieldExtractor } from '../ContextualFieldExtractor';
import { BrokerExtractionEngine } from '../BrokerExtractionEngine';
import { InsurerDetectorService } from '../InsurerDetectorService';
import { FieldSanitizer } from '../FieldSanitizer';
import { LabelMappingEngine } from '../LabelMappingEngine';

/**
 * PolicySemanticParser.ts
 * NO-AI ENTERPRISE PIPELINE.
 */
export class PolicySemanticParser {
  public static parse(text: string) {
    const data: any = {};
    
    console.log('[FIELD_EXTRACTED] Parsing Policy fields...');

    // 1. Insurer
    data.insurer = InsurerDetectorService.detect(text);

    // 2. Broker
    data.broker = BrokerExtractionEngine.extract(text);

    // 3. Dates (Vigência)
    data.insuranceExpiry = ContextualFieldExtractor.extractDate(text, ['FIM DA VIGENCIA', 'VENCIMENTO', 'ATE', 'TERMINO']);
    data.startDate = ContextualFieldExtractor.extractDate(text, ['INICIO DA VIGENCIA', 'DESDE', 'COPO DE']);
    data.vigencia = `${data.startDate || ''} - ${data.insuranceExpiry || ''}`;

    // 4. Policy Number
    data.policyNumber = ContextualFieldExtractor.extractPolicyNumber(text);

    // 5. Vehicle Info
    data.plate = LabelMappingEngine.extractByLabel(text, 'placa');
    data.chassis = LabelMappingEngine.extractByLabel(text, 'chassi');

    // 6. Insured Person
    const rawInsured = ContextualFieldExtractor.extract(text, ['NOME DO SEGURADO', 'SEGURADO:', 'SEGURADO', 'NOME DO(A) SEGURADO(A)'], { maxChars: 80 });
    data.insuredName = FieldSanitizer.getInstance().sanitizeName(rawInsured);
    data.insuredCpf = FieldSanitizer.getInstance().sanitizeCPF(ContextualFieldExtractor.extractCPF(text));
    data.nascimento = ContextualFieldExtractor.extractDate(text, ['NASCIMENTO', 'DT NASC', 'NASC']);

    // 7. Financial (Franquia, Prêmio Líquido e Valor Total)
    data.franquia = ContextualFieldExtractor.extract(text, ['VALOR DA FRANQUIA', 'FRANQUIA'], { takeFirstWord: true });
    data.premioLiquido = ContextualFieldExtractor.extract(text, ['PRÊMIO LÍQUIDO', 'PREMIO LIQUIDO', 'PRÊMIO COMERCIAL', 'PREMIO COMERCIAL', 'PRÊMIO DE RISCO', 'PREMIO DE RISCO'], { takeFirstWord: true });
    data.premio = ContextualFieldExtractor.extract(text, ['PRÊMIO TOTAL', 'PREMIO TOTAL', 'TOTAL DO PRÊMIO', 'TOTAL DO PREMIO', 'VALOR TOTAL', 'TOTAL A PAGAR', 'PREMIO'], { takeFirstWord: true });

    // 8. Flatten Broker for UI compatibility
    if (data.broker) {
      data.brokerName = data.broker.name;
      data.brokerSusep = data.broker.susep;
      delete data.broker;
    }

    console.log('[VALIDATION_SUCCESS] Policy Data Structured');
    return data;
  }
}

