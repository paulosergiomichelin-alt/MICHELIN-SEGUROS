import { describe, it, expect } from 'vitest';
import { formatCNPJ, validateCNPJ, maskCNPJ, formatCpfCnpjProgressive, detectTipoPessoa } from '../utils';

describe('formatCNPJ', () => {
  it('formata 14 dígitos', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('retorna o valor original se não tiver 14 dígitos', () => {
    expect(formatCNPJ('123')).toBe('123');
  });
});

describe('validateCNPJ', () => {
  it('aceita um CNPJ válido conhecido', () => {
    expect(validateCNPJ('11.222.333/0001-81')).toBe(true);
  });
  it('rejeita dígito verificador errado', () => {
    expect(validateCNPJ('11.222.333/0001-80')).toBe(false);
  });
  it('rejeita todos os dígitos iguais', () => {
    expect(validateCNPJ('11111111111111')).toBe(false);
  });
  it('rejeita tamanho errado', () => {
    expect(validateCNPJ('123')).toBe(false);
  });
});

describe('maskCNPJ', () => {
  it('mascara os dígitos do meio', () => {
    expect(maskCNPJ('11222333000181')).toBe('11.***.***/****-81');
  });
  it('retorna --- para valor vazio', () => {
    expect(maskCNPJ('')).toBe('---');
  });
});

describe('detectTipoPessoa', () => {
  it('até 11 dígitos é pessoa física', () => {
    expect(detectTipoPessoa('12345678901')).toBe('fisica');
    expect(detectTipoPessoa('123')).toBe('fisica');
    expect(detectTipoPessoa('')).toBe('fisica');
  });
  it('a partir de 12 dígitos é pessoa jurídica', () => {
    expect(detectTipoPessoa('123456789012')).toBe('juridica');
    expect(detectTipoPessoa('11222333000181')).toBe('juridica');
  });
});

describe('formatCpfCnpjProgressive', () => {
  it('formata como CPF progressivamente até 11 dígitos', () => {
    expect(formatCpfCnpjProgressive('123')).toBe('123');
    expect(formatCpfCnpjProgressive('123456789')).toBe('123.456.789');
    expect(formatCpfCnpjProgressive('12345678901')).toBe('123.456.789-01');
  });
  it('formata como CNPJ progressivamente a partir do 12º dígito', () => {
    expect(formatCpfCnpjProgressive('123456789012')).toBe('12.345.678/9012');
    expect(formatCpfCnpjProgressive('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('ignora caracteres não numéricos e limita a 14 dígitos', () => {
    expect(formatCpfCnpjProgressive('11.222.333/0001-8199')).toBe('11.222.333/0001-81');
  });
});
