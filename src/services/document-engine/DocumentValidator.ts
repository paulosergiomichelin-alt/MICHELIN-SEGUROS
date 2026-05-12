/**
 * DocumentValidator.ts
 *
 * Brazilian-document semantic validation for AI-extracted fields.
 * - CPF / CNPJ via mod-11 checksum
 * - Brazilian plates (legacy AAA-9999 and Mercosul AAA-9A99)
 * - Vehicle chassis (17 chars, ISO 3779 alphabet)
 * - DD/MM/YYYY date sanity check
 * - CEP (8 digits)
 *
 * Provides a confidence multiplier per field and an overall semantic score
 * used by AIHybridOCRService to derive a hybrid confidence number.
 */

export type FieldValidation =
  | { ok: true; normalized: string; score: number }
  | { ok: false; reason: string; score: number };

export class DocumentValidator {
  /* ────────────── CPF ────────────── */
  public static validateCPF(input: string): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const digits = input.replace(/\D/g, '');
    if (digits.length !== 11) return { ok: false, reason: 'CPF_LENGTH', score: 0.2 };
    if (/^(\d)\1+$/.test(digits)) return { ok: false, reason: 'CPF_REPEATED', score: 0 };

    const calc = (slice: string, factor: number) => {
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += parseInt(slice[i]) * (factor - i);
      const rem = (sum * 10) % 11;
      return rem === 10 ? 0 : rem;
    };
    if (calc(digits.substring(0, 9), 10) !== parseInt(digits[9])) return { ok: false, reason: 'CPF_DV1', score: 0.3 };
    if (calc(digits.substring(0, 10), 11) !== parseInt(digits[10])) return { ok: false, reason: 'CPF_DV2', score: 0.3 };
    return { ok: true, normalized: digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'), score: 1 };
  }

  /* ────────────── CNPJ ────────────── */
  public static validateCNPJ(input: string): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const digits = input.replace(/\D/g, '');
    if (digits.length !== 14) return { ok: false, reason: 'CNPJ_LENGTH', score: 0.2 };
    if (/^(\d)\1+$/.test(digits)) return { ok: false, reason: 'CNPJ_REPEATED', score: 0 };

    const factors1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const factors2 = [6, ...factors1];
    const calc = (slice: string, factors: number[]) => {
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += parseInt(slice[i]) * factors[i];
      const rem = sum % 11;
      return rem < 2 ? 0 : 11 - rem;
    };
    if (calc(digits.substring(0, 12), factors1) !== parseInt(digits[12])) return { ok: false, reason: 'CNPJ_DV1', score: 0.3 };
    if (calc(digits.substring(0, 13), factors2) !== parseInt(digits[13])) return { ok: false, reason: 'CNPJ_DV2', score: 0.3 };
    return { ok: true, normalized: digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'), score: 1 };
  }

  /* ────────────── Plate (legacy + Mercosul) ────────────── */
  public static validatePlate(input: string): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Legacy: AAA9999 ; Mercosul: AAA9A99
    if (/^[A-Z]{3}\d{4}$/.test(s)) return { ok: true, normalized: s, score: 1 };
    if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(s)) return { ok: true, normalized: s, score: 1 };
    return { ok: false, reason: 'PLATE_FORMAT', score: 0.2 };
  }

  /* ────────────── Chassis (VIN, ISO 3779) ────────────── */
  public static validateChassis(input: string): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const s = input.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (s.length !== 17) return { ok: false, reason: 'CHASSIS_LENGTH', score: 0.3 };
    if (/^(.)\1{16}$/.test(s)) return { ok: false, reason: 'CHASSIS_REPEATED', score: 0 };
    return { ok: true, normalized: s, score: 0.95 };
  }

  /* ────────────── Date DD/MM/YYYY ────────────── */
  public static validateDate(input: string, opts: { allowFuture?: boolean; allowPast?: boolean; maxYearsAhead?: number; maxYearsBack?: number } = {}): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const m = input.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (!m) return { ok: false, reason: 'DATE_FORMAT', score: 0.2 };
    const d = parseInt(m[1]), mo = parseInt(m[2]), y = parseInt(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { ok: false, reason: 'DATE_RANGE', score: 0 };
    const date = new Date(y, mo - 1, d);
    if (date.getDate() !== d || date.getMonth() !== mo - 1 || date.getFullYear() !== y) {
      return { ok: false, reason: 'DATE_INVALID', score: 0 };
    }
    const now = new Date();
    const yearsBack = (now.getTime() - date.getTime()) / (365.25 * 86400000);
    const yearsAhead = -yearsBack;
    if (yearsBack > (opts.maxYearsBack ?? 130)) return { ok: false, reason: 'DATE_TOO_OLD', score: 0.3 };
    if (yearsAhead > (opts.maxYearsAhead ?? 30)) return { ok: false, reason: 'DATE_TOO_FUTURE', score: 0.3 };
    if (opts.allowFuture === false && date > now) return { ok: false, reason: 'DATE_FUTURE_NOT_ALLOWED', score: 0.4 };
    if (opts.allowPast === false && date < now) return { ok: false, reason: 'DATE_PAST_NOT_ALLOWED', score: 0.4 };
    return { ok: true, normalized: `${m[1]}/${m[2]}/${m[3]}`, score: 1 };
  }

  /* ────────────── CEP ────────────── */
  public static validateCEP(input: string): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const digits = input.replace(/\D/g, '');
    if (digits.length !== 8) return { ok: false, reason: 'CEP_LENGTH', score: 0.2 };
    return { ok: true, normalized: digits.replace(/(\d{5})(\d{3})/, '$1-$2'), score: 1 };
  }

  /* ────────────── Name (purity check) ────────────── */
  public static validateName(input: string): FieldValidation {
    if (!input) return { ok: false, reason: 'EMPTY', score: 0 };
    const cleaned = input.toUpperCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(' ').filter(w => w.length >= 2);
    if (words.length < 2) return { ok: false, reason: 'NAME_TOO_SHORT', score: 0.3 };
    if (/\d/.test(input)) return { ok: false, reason: 'NAME_HAS_DIGITS', score: 0.2 };
    return { ok: true, normalized: words.join(' '), score: 1 };
  }

  /* ────────────── Boolean coercion ────────────── */
  public static coerceBoolean(input: unknown): boolean | null {
    if (typeof input === 'boolean') return input;
    if (input == null) return null;
    const s = String(input).toUpperCase().trim();
    if (['SIM', 'YES', 'TRUE', '1', 'POSSUI', 'CONSTA', 'VERDADEIRO'].includes(s)) return true;
    if (['NAO', 'NÃO', 'NO', 'FALSE', '0', 'INEXISTENTE', 'SEM ALIENACAO', 'SEM ALIENAÇÃO'].includes(s)) return false;
    return null;
  }

  /** Aggregate score helper: average over the provided FieldValidations. */
  public static aggregate(results: FieldValidation[]): number {
    if (results.length === 0) return 0;
    return results.reduce((acc, r) => acc + r.score, 0) / results.length;
  }
}
