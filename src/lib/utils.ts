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
