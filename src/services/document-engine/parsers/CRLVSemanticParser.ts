/**
 * CRLVSemanticParser.ts
 * High-precision parser for Vehicle Documentation (CRLV).
 */
import { ContextualFieldExtractor } from '../ContextualFieldExtractor';
import { VehicleRestrictionEngine } from '../VehicleRestrictionEngine';
import { LabelMappingEngine } from '../LabelMappingEngine';

/**
 * CRLVSemanticParser.ts
 * NO-AI ENTERPRISE PIPELINE.
 */
export class CRLVSemanticParser {
  public static parse(text: string) {
    const data: any = {};
    
    console.log('[FIELD_EXTRACTED] Parsing CRLV fields...');

    // 1. Identification
    data.plate = LabelMappingEngine.extractByLabel(text, 'placa') || ContextualFieldExtractor.extract(text, ['PLACA', 'PLACA/UF'], { takeFirstWord: true });
    data.renavam = LabelMappingEngine.extractByLabel(text, 'renavam') || ContextualFieldExtractor.extract(text, ['RENAVAM'], { takeFirstWord: true });
    data.chassis = LabelMappingEngine.extractByLabel(text, 'chassi') || ContextualFieldExtractor.extract(text, ['CHASSI', 'Nº DO CHASSI'], { takeFirstWord: true });
    
    // 2. Details
    data.brandModel = ContextualFieldExtractor.extract(text, ['MARCA/MODELO', 'MARCA', 'MODELO'], { sameLine: false });
    data.yearFabrication = ContextualFieldExtractor.cleanYear(ContextualFieldExtractor.extract(text, ['ANO FAB', 'ANO FABRICACAO'], { takeFirstWord: true }));
    data.yearModel = ContextualFieldExtractor.cleanYear(ContextualFieldExtractor.extract(text, ['ANO MOD', 'ANO MODELO'], { takeFirstWord: true }));
    
    // 3. Owner
    data.ownerName = ContextualFieldExtractor.extract(text, ['NOME', 'PROPRIETARIO', 'NOME/RAZAO SOCIAL'], { maxChars: 100 });
    data.ownerCpf = ContextualFieldExtractor.extractCPF(text);

    // 4. Restrictions
    const restriction = VehicleRestrictionEngine.analyze(text);
    if (restriction.hasFinancialRestriction) {
      data.fiduciaryAlienation = 'SIM';
      data.financialInstitution = restriction.financialInstitution;
      data.restrictionType = restriction.restrictionType;
    } else {
      data.fiduciaryAlienation = 'NÃO';
    }

    console.log('[VALIDATION_SUCCESS] CRLV Data Structured');
    return data;
  }
}

