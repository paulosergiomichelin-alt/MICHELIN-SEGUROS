import { describe, it, expect } from 'vitest';
import { detectImapSmtpConfig } from '../imapAutodetect.js';

describe('detectImapSmtpConfig', () => {
  it('reconhece gmail.com com host/porta reais do Google', () => {
    expect(detectImapSmtpConfig('fulano@gmail.com')).toEqual({
      imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true,
      smtpHost: 'smtp.gmail.com', smtpPort: 587, smtpSecure: false,
    });
  });

  it('reconhece outlook.com/hotmail.com com host do Microsoft 365', () => {
    expect(detectImapSmtpConfig('fulano@outlook.com').imapHost).toBe('outlook.office365.com');
    expect(detectImapSmtpConfig('fulano@hotmail.com').imapHost).toBe('outlook.office365.com');
  });

  it('cai no padrão imap.<dominio>/smtp.<dominio> para domínio desconhecido', () => {
    expect(detectImapSmtpConfig('fulano@empresa-generica.com.br')).toEqual({
      imapHost: 'imap.empresa-generica.com.br', imapPort: 993, imapSecure: true,
      smtpHost: 'smtp.empresa-generica.com.br', smtpPort: 587, smtpSecure: false,
    });
  });

  it('lida com e-mail sem @ sem lançar exceção', () => {
    expect(() => detectImapSmtpConfig('invalido')).not.toThrow();
  });
});
