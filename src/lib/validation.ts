
import { Lead } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateLead(lead: Partial<Lead>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!lead.name || lead.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Nome completo é obrigatório' });
  }

  if (!lead.phone || lead.phone.trim().length < 8) {
    errors.push({ field: 'phone', message: 'Telefone (WhatsApp) é obrigatório' });
  }

  if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    errors.push({ field: 'email', message: 'E-mail inválido' });
  }

  return errors;
}

export function isValidCPF(cpf: string): boolean {
  if (!cpf) return false;
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  // Simplified check, could be more robust
  return !/^(\d)\1{10}$/.test(clean);
}
