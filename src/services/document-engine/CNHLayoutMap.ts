/**
 * CNHLayoutMap.ts
 * Coordinate-based layout map for Brazilian CNH (Standard model).
 * Values are percentages (0-100) or relative to standard CNH aspect ratio.
 */
export const CNHLayoutMap = {
  // Region percentages [x, y, width, height]
  REGIONS: {
    NAME: { x: 5, y: 15, w: 90, h: 10, label: 'Nome' },
    DOCUMENT_ID: { x: 5, y: 25, w: 45, h: 8, label: 'DOC. IDENTIDADE' },
    CPF: { x: 50, y: 25, w: 45, h: 8, label: 'CPF' },
    BIRTH_DATE: { x: 5, y: 33, w: 30, h: 8, label: 'Data Nascimento' },
    REGISTRO: { x: 5, y: 45, w: 45, h: 8, label: 'Registro' },
    VALIDADE: { x: 50, y: 45, w: 45, h: 8, label: 'Validade' },
    CATEGORIA: { x: 5, y: 55, w: 15, h: 8, label: 'Categoria' },
    RENACH: { x: 60, y: 65, w: 35, h: 8, label: 'RENACH' }
  },
  
  // Aspect Ratio for reference (e.g. standard CNH is approx 8.5 x 12 or similar)
  ASPECT_RATIO: 0.7 
};
