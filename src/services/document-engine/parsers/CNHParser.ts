/**
 * CNHParser.ts
 * Specialized extraction logic for CNH documents.
 */
import { LabelMappingEngine } from '../LabelMappingEngine';
import { UniversalRegexExtractor } from '../UniversalRegexExtractor';

export class CNHParser {
  public static parse(text: string) {
    const data: any = {};
    const uText = text.toUpperCase();
    
    // 1. Label based extraction
    data.name = LabelMappingEngine.extractByLabel(text, 'name');
    data.cpf = LabelMappingEngine.extractByLabel(text, 'cpf');
    data.registro = LabelMappingEngine.extractByLabel(text, 'registration');
    data.category = LabelMappingEngine.extractByLabel(text, 'category');
    data.validity = LabelMappingEngine.extractByLabel(text, 'validity');
    data.dob = LabelMappingEngine.extractByLabel(text, 'dob');

    // 2. Regex fallback/refinement
    const regexResults = UniversalRegexExtractor.extract(text);
    
    // CPF Fallback
    if (!data.cpf || data.cpf.length < 11) {
      const cpfMatch = regexResults.find(r => r.field === 'cpf');
      if (cpfMatch) data.cpf = cpfMatch.value;
    }

    // REGISTRO Fallback (usually 11 digits)
    if (!data.registro) {
      const registroMatch = regexResults.find(r => r.field === 'renavam' && r.value.length === 11);
      if (registroMatch) data.registro = registroMatch.value;
    }

    // CATEGORIA Fallback
    if (!data.category) {
      const catMatch = text.match(/\b([A-E]|[AB]{2})\b/);
      if (catMatch) data.category = catMatch[1];
    }

    // 3. Date Refinement
    const allDates = regexResults.filter(r => r.field === 'date').map(r => r.value);
    if (allDates.length > 0) {
      const sortedDates = [...allDates].sort((a, b) => {
        const d1 = new Date(a.split('/').reverse().join('-')).getTime();
        const d2 = new Date(b.split('/').reverse().join('-')).getTime();
        return d1 - d2;
      });

      if (!data.dob && sortedDates.length > 0) data.dob = sortedDates[0];
      if (!data.validity && sortedDates.length > 1) data.validity = sortedDates[sortedDates.length - 1];
    }

    // 4. Map to Lead schema fields
    return {
      name: data.name,
      cpf: data.cpf,
      birthDate: data.dob,
      licenseCategory: data.category,
      licenseExpiry: data.validity,
      rg: data.registro, // Often the registration number is used as secondary ID or we can store it in raw
      _raw: data
    };
  }
}
