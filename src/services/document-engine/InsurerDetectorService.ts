import { DocumentNormalizationService } from './DocumentNormalizationService';

export enum Insurer {
  PORTO = 'Porto Seguro',
  AZUL = 'Azul Seguros',
  YELUM = 'Yelum Seguros',
  TOKIO = 'Tokio Marine',
  HDI = 'HDI Seguros',
  ALLIANZ = 'Allianz',
  UNKNOWN = 'unknown'
}

export class InsurerDetectorService {
  private static readonly INSURER_KEYWORDS: Record<Insurer, string[]> = {
    [Insurer.PORTO]: ['PORTO SEGURO', 'PORTO SEG', 'COMPANHIA DE SEGUROS GERAIS'],
    [Insurer.AZUL]: ['AZUL SEGUROS', 'AZUL COMPANHIA', 'PORTO AZUL'],
    [Insurer.YELUM]: ['YELUM', 'LIBERTY SEGUROS', 'YELUM SEGUROS'], // Yelum is former Liberty
    [Insurer.TOKIO]: ['TOKIO MARINE', 'TOKIO MARINE SEGURADORA'],
    [Insurer.HDI]: ['HDI SEGUROS', 'HDI SEGUROS S.A.'],
    [Insurer.ALLIANZ]: ['ALLIANZ SEGUROS', 'ALLIANZ BRASIL'],
    [Insurer.UNKNOWN]: []
  };

  static detect(text: string): Insurer {
    const normalizedText = DocumentNormalizationService.normalize(text);
    
    for (const [insurer, keywords] of Object.entries(this.INSURER_KEYWORDS)) {
      if (keywords.some(keyword => normalizedText.includes(keyword))) {
        return insurer as Insurer;
      }
    }

    return Insurer.UNKNOWN;
  }
}
