import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

import {
  createFolder, renameFolder, deleteFolder, listAllMessageIds, MicrosoftAccount,
} from '../microsoftClient.js';

function makeAccount(): MicrosoftAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com',
    accessToken: 'token', refreshToken: 'refresh',
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    provider: 'microsoft',
  };
}

describe('microsoftClient — pastas e listagem em massa', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('createFolder cria na raiz quando parentId é null', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders');
      expect(String(url)).not.toContain('childFolders');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ displayName: 'Projetos' });
      return { ok: true, status: 200, json: async () => ({ id: 'AAA', displayName: 'Projetos' }) };
    }) as any;

    const result = await createFolder(makeAccount(), 'Projetos', null);
    expect(result).toEqual({ id: 'AAA', name: 'Projetos' });
  });

  it('createFolder cria como childFolders quando parentId é informado (aceita chave fixa "inbox")', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders/inbox/childFolders');
      expect(opts.method).toBe('POST');
      return { ok: true, status: 200, json: async () => ({ id: 'BBB', displayName: 'Recibos' }) };
    }) as any;

    const result = await createFolder(makeAccount(), 'Recibos', 'inbox');
    expect(result).toEqual({ id: 'BBB', name: 'Recibos' });
  });

  it('renameFolder faz PATCH no displayName', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders/AAA');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ displayName: 'Novo Nome' });
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    await renameFolder(makeAccount(), 'AAA', 'Novo Nome');
  });

  it('deleteFolder faz DELETE na pasta', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/me/mailFolders/AAA');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteFolder(makeAccount(), 'AAA');
  });

  it('listAllMessageIds pagina via $skip até a página vir menor que $top', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: any) => {
      call++;
      // URLSearchParams percent-encoda "$" -> "%24" (mesmo padrão já usado em listMessages).
      expect(String(url)).toContain('%24select=id');
      if (call === 1) {
        expect(String(url)).toContain('%24skip=0');
        return { ok: true, status: 200, json: async () => ({ value: Array.from({ length: 100 }, (_, i) => ({ id: `m${i}` })) }) };
      }
      expect(String(url)).toContain('%24skip=100');
      return { ok: true, status: 200, json: async () => ({ value: [{ id: 'last' }] }) };
    }) as any;

    const ids = await listAllMessageIds(makeAccount(), 'junkemail');
    expect(ids).toHaveLength(101);
    expect(ids[100]).toBe('last');
    expect(call).toBe(2);
  });
});
