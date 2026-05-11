/**
 * PolicyParser.ts
 * Specialized extraction logic for Insurance Policies.
 */
import { LabelMappingEngine } from '../LabelMappingEngine';
import { UniversalRegexExtractor } from '../UniversalRegexExtractor';
import { BrokerExtractionEngine } from '../BrokerExtractionEngine';

export class PolicyParser {
  private static INSURERS = [
    'PORTO SEGURO', 'YELUM', 'LIBERTY', 'TOKIO MARINE', 'HDI', 'ALLIANZ', 'MAPFRE', 'AZUL', 'BRADESCO', 'SULAMERICA', 'SOMPO', 'ZURICH', 'ITAU'
  ];

  public static parse(text: string) {
    const data: any = {};
    const uText = text.toUpperCase();

    // 1. Detect Insurer
    for (const insurer of this.INSURERS) {
      if (uText.includes(insurer)) {
        data.insurer = insurer;
        break;
      }
    }

    // 2. Extract Broker
    const broker = BrokerExtractionEngine.extract(text);
    data.broker = broker;

    // 3. Extract Common Fields
    data.insuranceExpiry = LabelMappingEngine.extractByLabel(text, 'validity');
    
    // Vehicle data often in policy
    const regexResults = UniversalRegexExtractor.extract(text);
    const plateMatch = regexResults.find(r => r.field === 'placa');
    if (plateMatch) data.plate = plateMatch.value;

    const chassisMatch = regexResults.find(r => r.field === 'chassi');
    if (chassisMatch) data.chassis = chassisMatch.value;

    // Currency patterns for premiums/franchises
    const currencyMatch = text.match(/R\$\s*([\d.,]+)/g);
    if (currencyMatch) {
      data.values = currencyMatch.map(v => v.replace(/[^\d.,]/g, '').trim());
    }

    return {
      insurer: data.insurer,
      insuranceExpiry: data.insuranceExpiry,
      plate: data.plate,
      chassis: data.chassis,
      broker: data.broker,
      _raw: data
    };
  }
}
