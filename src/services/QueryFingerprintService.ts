
import { QueryConstraint } from 'firebase/firestore';
import { SecurityService } from './SecurityService';

/**
 * QueryFingerprintService: Gera fingerprints estáveis para queries do Firestore.
 * Essencial para deduplicação de listeners no SubscriptionRegistry.
 */
export class QueryFingerprintService {
  /**
   * Normaliza os QueryConstraints e gera um hash único.
   */
  public static getFingerprint(collName: string, constraints: QueryConstraint[]): string {
    // Extraímos os dados relevantes de cada constraint de forma determinística
    // Note: QueryConstraint é um objeto complexo do Firebase, precisamos extrair os campos que o compõem.
    // Como o SDK não expõe facilmente os detalhes internos das constraints de forma serializável,
    // usamos uma aproximação baseada na representação que o DataService já utiliza, mas normalizada.
    
    // Fallback: Se não conseguirmos extrair detalhes, usamos uma representação estável
    // No DataService, as constraints são passadas como array.
    const normalized = constraints.map(c => {
      try {
        const anyC = c as any;
        
        // Extract field path safely
        let fieldPath = 'unknown';
        if (anyC._field?.segments) fieldPath = anyC._field.segments.join('.');
        else if (anyC.field?.segments) fieldPath = anyC.field.segments.join('.');
        else if (anyC._query?.filters?.[0]?.field?.segments) fieldPath = anyC._query.filters[0].field.segments.join('.');

        // Extract value safely ensuring stability
        let val = anyC._value ?? anyC.value;
        if (val instanceof Date) val = val.toISOString();
        if (typeof val === 'object' && val !== null && 'path' in val) val = (val as any).path; // Firestore DocumentReference

        return {
          type: anyC.type || 'unknown',
          op: anyC._op || anyC.op || anyC._query?.filters?.[0]?.op || '==',
          field: fieldPath,
          value: val
        };
      } catch (e) {
        return 'unserializable-constraint';
      }
    });

    return `col:${collName}:${SecurityService.stableHash(normalized)}`;
  }
}
