/**
 * CNHCoordinateMap.ts
 * Enterprise-grade coordinate mapping system for Brazilian CNH (Carteira Nacional de Habilitação).
 * Implements rigid geometric constraints, safe zones, and exclusion zones.
 */

export interface CNHRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  safeZonePadding?: number;
}

export interface CNHFieldProfile {
  key: string;
  label: string;
  region: CNHRegion;
  whitelist?: string;
  preprocessProfile?: 'text' | 'numeric_strict' | 'date_strict';
  minConfidence?: number;
  multiline?: boolean;
  validationRegex?: RegExp;
  exclusionZones?: CNHRegion[]; // Areas to ignore within the crop
}

export interface CNHCoordinateProfile {
  id: string;
  description: string;
  referenceWidth: number;
  referenceHeight: number;
  fields: Record<string, CNHFieldProfile>;
  exclusionAreas?: CNHRegion[]; // Global areas to ignore (multilingual)
}

/**
 * Enterprise CNH Reference (Landscape)
 * Calibrated for a 1000x700 viewport based on standard Brazilian CNH V3.
 */
export const CNH_LANDSCAPE_PROFILE: CNHCoordinateProfile = {
  id: 'cnh_br_v3_landscape',
  description: 'Digital and Physical CNH Brazilian Standard V3',
  referenceWidth: 1000,
  referenceHeight: 700,
  exclusionAreas: [
    { x: 0, y: 0, width: 1000, height: 100 }, // Header noise exclusion
    { x: 650, y: 0, width: 350, height: 700 } // Right side metadata/QRCode exclusion
  ],
  fields: {
    nome: {
      key: 'nome',
      label: 'Nome do Condutor',
      region: { x: 80, y: 100, width: 680, height: 130, safeZonePadding: 25 },
      preprocessProfile: 'text',
      minConfidence: 40,
      multiline: true,
      exclusionZones: [
        { x: -10, y: -10, width: 100, height: 40 } // Mask "NOME" label area
      ]
    },
    cpf: {
      key: 'cpf',
      label: 'CPF',
      region: { x: 380, y: 280, width: 360, height: 110, safeZonePadding: 20 },
      whitelist: '0123456789.-',
      preprocessProfile: 'numeric_strict',
      minConfidence: 50,
      validationRegex: /[0-9]{3}?[0-9]{3}?[0-9]{3}?[0-9]{2}|[0-9]{11}/,
      exclusionZones: [
        { x: -5, y: -5, width: 80, height: 35 } // Mask "CPF" label
      ]
    },
    nascimento: {
      key: 'nascimento',
      label: 'Data de Nascimento',
      region: { x: 70, y: 280, width: 310, height: 110, safeZonePadding: 20 },
      whitelist: '0123456789/',
      preprocessProfile: 'date_strict',
      minConfidence: 50,
      validationRegex: /\d{2}\/?[0-9]{2}\/?[0-9]{4}/,
      exclusionZones: [
        { x: -5, y: -5, width: 180, height: 35 } // Mask "DATA NASCIMENTO"
      ]
    },
    validade: {
      key: 'validade',
      label: 'Vencimento',
      region: { x: 350, y: 380, width: 330, height: 110, safeZonePadding: 20 },
      whitelist: '0123456789/',
      preprocessProfile: 'date_strict',
      minConfidence: 50,
      validationRegex: /\d{2}\/?[0-9]{2}\/?[0-9]{4}/,
      exclusionZones: [
        { x: -5, y: -5, width: 150, height: 35 } // Mask "VALIDADE"
      ]
    },
    registro: {
      key: 'registro',
      label: 'Nº Registro',
      region: { x: 70, y: 380, width: 320, height: 110, safeZonePadding: 20 },
      whitelist: '0123456789',
      preprocessProfile: 'numeric_strict',
      minConfidence: 50,
      validationRegex: /[0-9]{9,11}/,
      exclusionZones: [
        { x: -5, y: -5, width: 150, height: 35 } // Mask "REGISTRO"
      ]
    },
    categoria: {
      key: 'categoria',
      label: 'Categoria',
      region: { x: 580, y: 395, width: 110, height: 60, safeZonePadding: 5 },
      whitelist: 'ABCDE',
      preprocessProfile: 'text',
      minConfidence: 50
    }
  }
};

// Legacy compatibility exports
export const CNH_REFERENCE_WIDTH = 1000;
export const CNH_REFERENCE_HEIGHT = 700;
export const CNH_COORDINATES = Object.fromEntries(
  Object.entries(CNH_LANDSCAPE_PROFILE.fields).map(([k, v]) => [k, v.region])
);

/**
 * Coordinate Normalizer Service
 */
export class CNHCoordinateEngine {
  /**
   * Translates normalized map to real pixel coordinates based on image dimensions and rotation.
   */
  public static resolveRegion(
    fieldKey: string, 
    imgWidth: number, 
    imgHeight: number, 
    rotation: number = 0
  ): CNHRegion | null {
    const field = CNH_LANDSCAPE_PROFILE.fields[fieldKey];
    if (!field) return null;

    const { x, y, width, height } = field.region;
    const refW = CNH_LANDSCAPE_PROFILE.referenceWidth;
    const refH = CNH_LANDSCAPE_PROFILE.referenceHeight;

    // 1. Scale
    let rx = (x / refW) * imgWidth;
    let ry = (y / refH) * imgHeight;
    let rw = (width / refW) * imgWidth;
    let rh = (height / refH) * imgHeight;

    // 2. Safe padding (Enterprise requirement)
    const padding = field.region.safeZonePadding || 0;
    const px = (padding / refW) * imgWidth;
    const py = (padding / refH) * imgHeight;

    rx -= px;
    ry -= py;
    rw += (px * 2);
    rh += (py * 2);

    return { 
      x: Math.max(0, rx), 
      y: Math.max(0, ry), 
      width: Math.min(imgWidth - rx, rw), 
      height: Math.min(imgHeight - ry, rh) 
    };
  }

  /**
   * Applies exclusion zones to a canvas context before OCR.
   */
  public static applyExclusions(
    ctx: CanvasRenderingContext2D, 
    field: CNHFieldProfile,
    cropWidth: number,
    cropHeight: number
  ) {
    if (!field.exclusionZones) return;

    ctx.fillStyle = 'white'; // Mask with white to "erase" noise
    const refW = field.region.width;
    const refH = field.region.height;

    for (const zone of field.exclusionZones) {
      const zx = (zone.x / refW) * cropWidth;
      const zy = (zone.y / refH) * cropHeight;
      const zw = (zone.width / refW) * cropWidth;
      const zh = (zone.height / refH) * cropHeight;
      
      ctx.fillRect(zx, zy, zw, zh);
    }
  }

  /**
   * Detects if the current text contains forbidden multilingual markers.
   */
  public static containsMultilingualNoise(text: string): boolean {
    const forbidden = [
      'NAME AND SURNAME', 'PRIMERA LICENCIA', 'FIRST DRIVER LICENSE', 
      'ESPANHOL', 'INGLES', 'APELLIDO', 'NOMBRE'
    ];
    const uText = text.toUpperCase();
    return forbidden.some(f => uText.includes(f));
  }
}
