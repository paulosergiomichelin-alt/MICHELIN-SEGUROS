import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../emailEncryption.js', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}));

import {
  createLabel, renameLabel, deleteLabel, deleteMessagePermanently, listAllMessageIds,
  GmailAccount,
} from '../gmailClient.js';

function makeAccount(): GmailAccount {
  return {
    id: 'acc1', userId: 'u1', email: 'a@b.com',
    accessToken: 'token', refreshToken: 'refresh',
    tokenExpiry: Date.now() + 60 * 60 * 1000,
    provider: 'gmail',
  };
}

describe('gmailClient — pastas e operações em massa', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('createLabel cria label raiz quando parentId é null', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      calls.push({ url: String(url), opts });
      return {
        ok: true, status: 200,
        json: async () => ({ id: 'Label_1', name: 'Projetos' }),
      };
    }) as any;

    const result = await createLabel(makeAccount(), 'Projetos', null);

    expect(result).toEqual({ id: 'Label_1', name: 'Projetos' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/users/me/labels');
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toMatchObject({ name: 'Projetos' });
  });

  it('createLabel prefixa o nome do pai quando parentId é informado', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      call++;
      if (call === 1) {
        expect(String(url)).toContain('/users/me/labels/Label_parent');
        return { ok: true, status: 200, json: async () => ({ id: 'Label_parent', name: 'Projetos' }) };
      }
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body).name).toBe('Projetos/ClienteX');
      return { ok: true, status: 200, json: async () => ({ id: 'Label_2', name: 'Projetos/ClienteX' }) };
    }) as any;

    const result = await createLabel(makeAccount(), 'ClienteX', 'Label_parent');
    expect(result).toEqual({ id: 'Label_2', name: 'ClienteX' });
  });

  it('renameLabel troca só o último segmento, preservando o prefixo do pai', async () => {
    let call = 0;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ id: 'Label_2', name: 'Projetos/ClienteX' }) };
      }
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body)).toEqual({ name: 'Projetos/ClienteY' });
      return { ok: true, status: 200, json: async () => ({}) };
    }) as any;

    await renameLabel(makeAccount(), 'Label_2', 'ClienteY');
    expect(call).toBe(2);
  });

  it('deleteLabel chama DELETE no label certo', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/users/me/labels/Label_2');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteLabel(makeAccount(), 'Label_2');
  });

  it('deleteMessagePermanently chama DELETE na mensagem', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toContain('/users/me/messages/msg1');
      expect(opts.method).toBe('DELETE');
      return { ok: true, status: 204, json: async () => null };
    }) as any;

    await deleteMessagePermanently(makeAccount(), 'msg1');
  });

  it('listAllMessageIds pagina até esgotar nextPageToken', async () => {
    let call = 0;
    global.fetch = vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'p2' }) };
      }
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'c' }] }) };
    }) as any;

    const ids = await listAllMessageIds(makeAccount(), 'SPAM');
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(call).toBe(2);
  });
});
