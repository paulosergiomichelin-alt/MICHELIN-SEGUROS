/**
 * BrokerExtractionEngine.ts
 * Extracts broker (Corretora) information from insurance policies.
 */
import { LabelMappingEngine } from './LabelMappingEngine';

export class BrokerExtractionEngine {
  public static extract(text: string): { 
    name: string; 
    susep: string; 
    phone?: string;
    email?: string;
    confidence: number;
  } {
    const uText = text.toUpperCase();
    
    // Use LabelMappingEngine logic
    const name = LabelMappingEngine.extractByLabel(text, 'brokerName' as any);
    let susep = LabelMappingEngine.extractByLabel(text, 'brokerSusep' as any);
    
    // SUSEP Validation (usually digits or 12345.1.234567.89 or similar)
    if (susep) {
      const cleanSusep = susep.replace(/\D/g, '');
      if (cleanSusep.length < 4 || susep.includes('RESOLUCAO') || susep.includes('PROCESSO')) {
        susep = '';
      }
    }

    const phone = LabelMappingEngine.extractByLabel(text, 'brokerPhone' as any);
    const email = LabelMappingEngine.extractByLabel(text, 'brokerEmail' as any);

    // Confidence Calculation
    let confidence = 0;
    if (name) confidence += 0.5;
    if (susep) confidence += 0.3;
    if (phone || email) confidence += 0.1;

    // Filter out common misreadings
    if (name && (name.includes('SEGURADORA') || name.includes('APOLICE'))) {
       return { name: '', susep: '', confidence: 0 };
    }

    console.log(`[BROKER_EXTRACTED] Name: ${name}, SUSEP: ${susep}`);

    return {
      name,
      susep,
      phone,
      email,
      confidence: Math.min(confidence, 0.99)
    };
  }
}
