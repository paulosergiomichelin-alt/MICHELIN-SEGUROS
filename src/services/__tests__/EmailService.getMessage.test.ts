import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService } from '../EmailService';

vi.mock('../../lib/dataApiClient', () => ({
  authHeader: vi.fn(async () => ({ Authorization: 'Bearer test-token', 'Content-Type': 'application/json' })),
}));

describe('EmailService.getMessage', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('unwraps the { message: ... } envelope the backend actually returns', async () => {
    const backendMessage = {
      id: 'msg_1',
      accountId: 'acc_1',
      provider: 'gmail',
      folder: 'inbox',
      subject: 'Assunto',
      from: { email: 'a@b.com' },
      to: [{ email: 'c@d.com' }],
      date: new Date().toISOString(),
      snippet: 'oi',
      isRead: true,
      isStarred: false,
      hasAttachments: false,
      bodyHtml: '<p>corpo completo</p>',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: backendMessage }),
    }) as unknown as typeof fetch;

    const result = await EmailService.getMessage('msg_1', 'acc_1');
    expect(result.id).toBe('msg_1');
    expect(result.bodyHtml).toBe('<p>corpo completo</p>');
  });

  it('lança se o backend responder sem a mensagem (payload vazio de verdade)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(EmailService.getMessage('msg_1', 'acc_1')).rejects.toThrow('empty getMessage response');
  });

  it('lança com o status HTTP quando a resposta não é ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(EmailService.getMessage('msg_1', 'acc_1')).rejects.toThrow('getMessage 404');
  });
});
