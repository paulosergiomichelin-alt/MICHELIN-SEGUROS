/**
 * DocumentEngine.ts
 * Deterministic Orchestrator for Document Processing.
 */
import { DocumentNormalizationService } from './DocumentNormalizationService';
import { DocumentClassifierService } from './DocumentClassifierService';
import { DeterministicParser } from './DeterministicParser';
import { ConfidenceEngine } from './ConfidenceEngine';
import { StructuredOCRResult } from '../../types/OCRTypes';

export class DocumentEngine {
  private static instance: DocumentEngine;
  private constructor() {}

  public static getInstance(): DocumentEngine {
    if (!this.instance) this.instance = new DocumentEngine();
    return this.instance;
  }

  public static async process(rawText: string, hintType?: string, regions?: any, structured?: StructuredOCRResult) {
    return this.getInstance().process(rawText, hintType, regions, structured);
  }

  public async process(rawText: string, hintType?: string, regions?: any, structured?: StructuredOCRResult) {
    if (!rawText && (!structured || structured.words.length === 0)) throw new Error('EMPTY_DOCUMENT_TEXT');

    const isStructured = !!structured && structured.words.length > 0;
    if (isStructured) {
      console.log(`[DOCUMENT_ENGINE] [STRUCTURED_MODE_ACTIVE] Pipeline prioritized for spatial extraction. Coordinates preserved.`);
    }

    // Skip global normalization for structured data or CNH to avoid losing layout-specific markers
    const skipGlobalNorm = isStructured || rawText.includes('[CNH_STRUCTURED_REGIONAL_DATA]');
    const cleanText = skipGlobalNorm ? rawText : DocumentNormalizationService.normalize(rawText);
    
    const classification = DocumentClassifierService.getInstance().classify(cleanText, hintType);

    // DETERMINISTIC PARSING (Spatial-Aware if Structured exists)
    const extractedData = DeterministicParser.getInstance().parse(cleanText, classification.type, regions, structured);

    // Final Data Enrichment & Confidence calculation
    const finalConfidence = ConfidenceEngine.calculate({
      type: classification.type,
      textLength: cleanText.length,
      hasBlacklist: false, 
      extractedFields: extractedData,
      structuralMarkers: classification.confidence >= 0.8 ? 5 : 2
    });

    return {
      type: classification.type,
      structuredData: extractedData,
      confidence: finalConfidence,
      rawText: cleanText,
      timestamp: new Date().toISOString(),
      regions: regions || classification.type === 'cnh' ? regions : undefined
    };
  }

  public static classifyOnly(text: string): string {
    return DocumentClassifierService.getInstance().classify(text).type;
  }
}
