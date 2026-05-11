/**
 * CRLVParser.ts
 * Specialized extraction logic for CRLV/CRV documents.
 */
import { LabelMappingEngine } from '../LabelMappingEngine';
import { UniversalRegexExtractor } from '../UniversalRegexExtractor';
import { VehicleRestrictionEngine } from '../VehicleRestrictionEngine';

export class CRLVParser {
  public static parse(text: string) {
    const data: any = {};
    
    // 1. Label based extraction
    data.renavam = LabelMappingEngine.extractByLabel(text, 'renavam');
    data.chassis = LabelMappingEngine.extractByLabel(text, 'chassi');
    data.plate = LabelMappingEngine.extractByLabel(text, 'placa');
    data.brandModel = LabelMappingEngine.extractByLabel(text, 'brandModel');

    // 2. Restriction Analysis
    const restriction = VehicleRestrictionEngine.analyze(text);
    data.hasFinancialRestriction = restriction.hasFinancialRestriction;
    data.financialInstitution = restriction.financialInstitution;
    data.restrictionType = restriction.restrictionType;

    // 2. Regex refinement
    const regexResults = UniversalRegexExtractor.extract(text);
    
    if (!data.plate) {
      const placaMatch = regexResults.find(r => r.field === 'placa');
      if (placaMatch) data.plate = placaMatch.value;
    }

    if (!data.chassis) {
      const chassiMatch = regexResults.find(r => r.field === 'chassi');
      if (chassiMatch) data.chassis = chassiMatch.value;
    }

    if (!data.renavam) {
      const renavamMatch = regexResults.find(r => r.field === 'renavam' && r.value.length === 11);
      if (renavamMatch) data.renavam = renavamMatch.value;
    }

    // Marca/Modelo fallback
    if (!data.brandModel) {
      const modelMatch = text.match(/MARCA\s*\/\s*MODELO\s*[:\- ]+([A-Z0-9/ ]+)/i);
      if (modelMatch) data.brandModel = modelMatch[1].split(/\n/).shift()?.trim();
    }

    return {
      plate: data.plate,
      chassis: data.chassis,
      renavam: data.renavam,
      brandModel: data.brandModel,
      _raw: data
    };
  }
}
