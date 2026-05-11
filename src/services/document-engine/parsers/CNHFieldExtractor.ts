/**
 * CNHFieldExtractor.ts
 * Specialized extraction logic for CNH fields with strict stop-tokens and regex.
 */
export class CNHFieldExtractor {
   /**
    * Extracts name with stop tokens.
    */
   public static extractName(text: string): string {
     const uText = text.toUpperCase();
     const startIdx = uText.indexOf('NOME');
     if (startIdx === -1) return '';

     // Stop tokens for CNH Name block
     const stopTokens = ['FILIACAO', 'CPF', 'PERMISSAO', 'REGISTRO', 'DOC. IDENTIDADE', 'EMISSOR'];
     
     let candidate = text.substring(startIdx + 4, startIdx + 150).trim();
     
     // Find earliest stop token
     let minStop = candidate.length;
     for (const token of stopTokens) {
       const stopIdx = candidate.toUpperCase().indexOf(token);
       if (stopIdx !== -1 && stopIdx < minStop) {
         minStop = stopIdx;
       }
     }

     candidate = candidate.substring(0, minStop).trim();
     // Remove artifacts like "." or ":" at start
     return candidate.replace(/^[:\-.; ]+/, '').trim();
   }

   /**
    * Mandatory CPF extraction.
    */
   public static extractCPF(text: string): string {
     const match = text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/) || text.match(/\d{11}/);
     if (match) return match[0];
     return '';
   }

   /**
    * Mandatory Date extraction.
    */
   public static extractDate(text: string, label: string): string {
    const uText = text.toUpperCase();
    const idx = uText.indexOf(label);
    if (idx === -1) return '';

    const line = text.substring(idx, idx + 60).split('\n')[0];
    const match = line.match(/\d{2}\/\d{2}\/\d{4}/);
    return match ? match[0] : '';
   }

   /**
    * RENACH extraction.
    */
   public static extractRenach(text: string): string {
     const labels = ['RENACH', 'REGISTRO'];
     for(const label of labels) {
       const uText = text.toUpperCase();
       const idx = uText.indexOf(label);
       if (idx !== -1) {
         const segment = text.substring(idx, idx + 40);
         const match = segment.match(/[A-Z]{2}\d{9}/) || segment.match(/\d{9,11}/);
         if (match) return match[0];
       }
     }
     return '';
   }

   /**
    * Category extraction.
    */
   public static extractCategory(text: string): string {
     const uText = text.toUpperCase();
     const labels = ['CAT. ', 'CATEGORIA', 'CAT '];
     
     for (const label of labels) {
       const idx = uText.indexOf(label);
       if (idx !== -1) {
         const segment = text.substring(idx, idx + 15);
         const match = segment.match(/\b(ACC|AB|AC|AD|AE|[A-E])\b/);
         if (match) return match[1];
       }
     }
     
     const fallbackMatch = text.toUpperCase().match(/\b(ACC|AB|AC|AD|AE|[A-E])\b/);
     return fallbackMatch ? fallbackMatch[1] : '';
   }
}
