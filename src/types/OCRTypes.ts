
export interface OCRWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  lineId?: string;
  blockId?: string;
}

export interface OCRLine {
  id: string;
  text: string;
  words: OCRWord[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface StructuredOCRResult {
  text: string;
  words: OCRWord[];
  lines: OCRLine[];
  confidence: number;
  metrics?: {
    canvasWidth: number;
    canvasHeight: number;
  };
}
