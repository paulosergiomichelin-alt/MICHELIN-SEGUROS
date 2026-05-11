import { PolicyParser } from './parsers/PolicyParser';
import { Insurer, InsurerDetectorService } from './InsurerDetectorService';

export class PolicyParserFactory {
  static getParser(text: string) {
    const insurer = InsurerDetectorService.detect(text);
    console.log(`[POLICY_FACTORY] Detected Insurer: ${insurer}`);
    
    // For now, they all use the base PolicyParser
    return PolicyParser;
  }
}
