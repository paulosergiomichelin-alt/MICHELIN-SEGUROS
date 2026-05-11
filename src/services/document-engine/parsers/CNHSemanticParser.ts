/**
 * CNHSemanticParser.ts
 * High-precision parser for Brazilian Driver's License (CNH).
 */
import { CNHFieldExtractor } from './CNHFieldExtractor';
import { FieldSanitizer } from '../FieldSanitizer';

/**
 * CNHSemanticParser.ts
 * High-precision parser for Brazilian Driver's License (CNH).
 * NO-AI ENTERPRISE PIPELINE.
 */
export class CNHSemanticParser {
  public static parse(text: string) {
    const data: any = {};
    const uText = text.toUpperCase();
    
    console.log('[FIELD_EXTRACTED] Parsing CNH fields...');

    // Support for Region-based format: "Label: Value"
    const getRegionValue = (label: string) => {
      const line = text.split('\n').find(l => l.toUpperCase().includes(label.toUpperCase() + ':'));
      return line ? line.split(':')[1]?.trim() : null;
    };

    // 1. Name
    const regionName = getRegionValue('Nome');
    const rawName = regionName || CNHFieldExtractor.extractName(text);
    data.name = FieldSanitizer.getInstance().sanitizeName(rawName);

    // 2. CPF
    const regionCpf = getRegionValue('CPF');
    data.cpf = FieldSanitizer.getInstance().sanitizeCPF(regionCpf || CNHFieldExtractor.extractCPF(text));

    // 3. Dates
    const regionBirth = getRegionValue('Data Nascimento');
    data.birthDate = regionBirth || CNHFieldExtractor.extractDate(text, 'NASCIMENTO') || CNHFieldExtractor.extractDate(text, 'DATA NASC');
    
    const regionValidade = getRegionValue('Validade');
    data.validity = regionValidade || CNHFieldExtractor.extractDate(text, 'VALIDADE');
    
    data.firstLicenseDate = CNHFieldExtractor.extractDate(text, '1 HAB');

    // 4. Vehicle/Driver specifics
    const regionCat = getRegionValue('Categoria');
    data.category = regionCat || CNHFieldExtractor.extractCategory(text);
    
    const regionRenach = getRegionValue('RENACH');
    data.renach = regionRenach || CNHFieldExtractor.extractRenach(text);
    
    const regionRegistro = getRegionValue('Registro');
    data.registration = regionRegistro || data.renach;

    console.log('[VALIDATION_SUCCESS] CNH Data Structured');
    return data;
  }
}

