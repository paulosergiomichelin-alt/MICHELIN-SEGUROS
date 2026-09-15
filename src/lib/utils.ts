import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function formatCPF(cpf: string) {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

export function validateCPF(cpf: string) {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  
  let sum = 0;
  let remainder;
  
  for (let i = 1; i <= 9; i++) sum = sum + parseInt(clean.substring(i-1, i)) * (11 - i);
  remainder = (sum * 10) % 11;
  if ((remainder === 10) || (remainder === 11)) remainder = 0;
  if (remainder !== parseInt(clean.substring(9, 10))) return false;
  
  sum = 0;
  for (let i = 1; i <= 10; i++) sum = sum + parseInt(clean.substring(i-1, i)) * (12 - i);
  remainder = (sum * 10) % 11;
  if ((remainder === 10) || (remainder === 11)) remainder = 0;
  if (remainder !== parseInt(clean.substring(10, 11))) return false;
  
  return true;
}

export function generateId(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskCPF(cpf: string) {
  if (!cpf) return '---';
  // Standard CPF: 000.000.000-00 or just numbers
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.***.***-${clean.slice(9)}`;
}

export function formatCNPJ(cnpj: string) {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
}

export function validateCNPJ(cnpj: string) {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    const sum = base.split('').reduce((acc, digit, i) => acc + parseInt(digit, 10) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calcDigit(clean.substring(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (digit1 !== parseInt(clean.charAt(12), 10)) return false;

  const digit2 = calcDigit(clean.substring(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (digit2 !== parseInt(clean.charAt(13), 10)) return false;

  return true;
}

export function maskCNPJ(cnpj: string) {
  if (!cnpj) return '---';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.***.***/****-${clean.slice(12)}`;
}

// Documento único CPF/CNPJ que se detecta pelo tamanho: até 11 dígitos é tratado
// como CPF em digitação (mesmo que ainda incompleto), a partir do 12º dígito já é
// CNPJ — não existe ambiguidade real porque nenhum CPF tem mais de 11 dígitos.
export function detectTipoPessoa(value: string): 'fisica' | 'juridica' {
  const clean = value.replace(/\D/g, '');
  return clean.length > 11 ? 'juridica' : 'fisica';
}

// Máscara progressiva (formata a cada tecla) do campo único CPF/CNPJ — troca de
// máscara em tempo real assim que o tamanho ultrapassa o de um CPF, sem esperar
// completar os 14 dígitos.
export function formatCpfCnpjProgressive(value: string): string {
  const clean = value.replace(/\D/g, '').slice(0, 14);
  if (clean.length <= 11) {
    let r = '';
    for (let i = 0; i < clean.length; i++) {
      if (i === 3 || i === 6) r += '.';
      if (i === 9) r += '-';
      r += clean[i];
    }
    return r;
  }
  let r = '';
  for (let i = 0; i < clean.length; i++) {
    if (i === 2 || i === 5) r += '.';
    if (i === 8) r += '/';
    if (i === 12) r += '-';
    r += clean[i];
  }
  return r;
}

export function formatPhone(value: string) {
  const clean = value.replace(/\D/g, '').slice(0, 11);
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
}

export function maskPhone(phone: string) {
  if (!phone) return '---';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 10) return phone;
  // (00) 00000-0000 or (00) 0000-0000
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) *****-${clean.slice(7)}`;
  }
  return `(${clean.slice(0, 2)}) ****-${clean.slice(6)}`;
}

export function maskEmail(email: string) {
  if (!email) return '---';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***` : '***';
  return `${maskedUser}@${domain}`;
}
