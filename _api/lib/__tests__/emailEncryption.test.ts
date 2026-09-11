import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('emailEncryption', () => {
  const ORIGINAL_KEY = process.env.EMAIL_ENCRYPTION_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.EMAIL_ENCRYPTION_KEY;
    else process.env.EMAIL_ENCRYPTION_KEY = ORIGINAL_KEY;
    vi.resetModules();
  });

  it('faz round-trip de encrypt/decrypt quando a chave está definida', async () => {
    process.env.EMAIL_ENCRYPTION_KEY = 'uma-chave-de-teste-com-32-bytes!';
    vi.resetModules();
    const { encrypt, decrypt } = await import('../emailEncryption.js');
    const encrypted = encrypt('segredo-do-usuario');
    expect(encrypted).not.toBe('segredo-do-usuario');
    expect(decrypt(encrypted)).toBe('segredo-do-usuario');
  });

  it('lança erro explícito quando EMAIL_ENCRYPTION_KEY não está definida', async () => {
    delete process.env.EMAIL_ENCRYPTION_KEY;
    vi.resetModules();
    const { encrypt } = await import('../emailEncryption.js');
    expect(() => encrypt('qualquer coisa')).toThrow(/EMAIL_ENCRYPTION_KEY/);
  });
});
