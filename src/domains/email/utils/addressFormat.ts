import type { EmailAddress } from '../types/email.types';

export function addrDisplay(addr?: EmailAddress): string {
  if (!addr) return '';
  return addr.name ? addr.name : addr.email;
}

export function addrFull(addr?: EmailAddress): string {
  if (!addr) return '';
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}
