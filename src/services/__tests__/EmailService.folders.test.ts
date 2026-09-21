import { describe, it, expect, afterEach, vi } from 'vitest';
import { EmailService } from '../EmailService';

vi.mock('../../lib/dataApiClient', () => ({
  authHeader: vi.fn(async () => ({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' })),
}));

describe('EmailService — pastas e mover mensagem', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('createFolder faz POST em /api/email/folders com name e parentId', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ folder: { id: 'X', name: 'Projetos' } }) };
    }) as any;

    const result = await EmailService.createFolder('acc1', 'Projetos', null);

    expect(captured.url).toBe('/api/email/folders');
    expect(captured.opts.method).toBe('POST');
    expect(JSON.parse(captured.opts.body)).toEqual({ accountId: 'acc1', name: 'Projetos', parentId: null });
    expect(result).toEqual({ folder: { id: 'X', name: 'Projetos' } });
  });

  it('renameFolder faz PATCH em /api/email/folders/:id', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.renameFolder('acc1', 'Label_9', 'Novo Nome');

    expect(captured.url).toBe('/api/email/folders/Label_9');
    expect(captured.opts.method).toBe('PATCH');
    expect(JSON.parse(captured.opts.body)).toEqual({ accountId: 'acc1', name: 'Novo Nome' });
  });

  it('deleteFolder faz DELETE com accountId na query', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.deleteFolder('acc1', 'Label_9');

    expect(captured.url).toBe('/api/email/folders/Label_9?accountId=acc1');
    expect(captured.opts.method).toBe('DELETE');
  });

  it('emptyFolder faz POST em /api/email/folders/:id/empty', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.emptyFolder('acc1', 'trash');

    expect(captured.url).toBe('/api/email/folders/trash/empty');
    expect(JSON.parse(captured.opts.body)).toEqual({ accountId: 'acc1' });
  });

  it('markFolderRead faz POST em /api/email/folders/:id/read-all', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.markFolderRead('acc1', 'inbox');

    expect(captured.url).toBe('/api/email/folders/inbox/read-all');
  });

  it('moveMessage faz POST em /api/email/action com action "move"', async () => {
    let captured: any;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      captured = { url: String(url), opts };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }) as any;

    await EmailService.moveMessage('acc1', 'm1', 'inbox', 'Label_9');

    expect(captured.url).toBe('/api/email/action');
    expect(JSON.parse(captured.opts.body)).toEqual({
      accountId: 'acc1', messageId: 'm1', action: 'move', sourceFolderId: 'inbox', targetFolderId: 'Label_9',
    });
  });
});
