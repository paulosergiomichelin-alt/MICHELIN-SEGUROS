import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/db.js', () => ({ getDb: vi.fn() }));
vi.mock('../../lib/emailEncryption.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(/, '').replace(/\)$/, '')),
}));
vi.mock('../../db/schema/settings.js', () => ({ settings: { id: 'id', data: 'data' } }));
vi.mock('drizzle-orm', () => ({ eq: vi.fn((a, b) => ({ op: 'eq', a, b })) }));

import { getDb } from '../../lib/db.js';
import { encrypt, decrypt } from '../../lib/emailEncryption.js';
import { getInsurerCredentials, getInsurerCredentialsSafe, saveInsurerCredentials } from '../credentials.js';

function makeSelectChain(rows: any[]) {
  return { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(rows) };
}
function makeInsertChain() {
  const chain: any = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  return chain;
}

describe('_api/insurers/credentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getInsurerCredentials devolve null quando não há documento salvo', async () => {
    (getDb as any).mockReturnValue(makeSelectChain([]));
    const result = await getInsurerCredentials('org1', 'tokio');
    expect(result).toBeNull();
  });

  it('getInsurerCredentials decifra a senha antes de devolver', async () => {
    (getDb as any).mockReturnValue(makeSelectChain([{
      id: 'org1::insurers',
      data: { tokio: { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadoraEnc: 'enc(SENHA123)', cpfEmissor: '11122233344' } },
    }]));
    const result = await getInsurerCredentials('org1', 'tokio');
    expect(decrypt).toHaveBeenCalledWith('enc(SENHA123)');
    expect(result).toEqual({ ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA123', cpfEmissor: '11122233344' });
  });

  it('getInsurerCredentialsSafe nunca inclui a senha, nem cifrada', async () => {
    (getDb as any).mockReturnValue(makeSelectChain([{
      id: 'org1::insurers',
      data: { tokio: { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadoraEnc: 'enc(SENHA123)', cpfEmissor: '11122233344' } },
    }]));
    const result = await getInsurerCredentialsSafe('org1');
    expect(result.tokio).toEqual({ ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', cpfEmissor: '11122233344', temCredencial: true });
    expect(JSON.stringify(result)).not.toContain('SENHA123');
    expect(JSON.stringify(result)).not.toContain('codigoOperadoraEnc');
  });

  it('saveInsurerCredentials cifra a senha antes de gravar', async () => {
    const insertChain = makeInsertChain();
    (getDb as any).mockReturnValue({ ...makeSelectChain([]), ...insertChain });
    await saveInsurerCredentials('org1', 'tokio', { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA123', cpfEmissor: '11122233344' });
    expect(encrypt).toHaveBeenCalledWith('SENHA123');
    expect(insertChain.values).toHaveBeenCalled();
  });

  it('saveInsurerCredentials com senha vazia mantém a senha cifrada já salva', async () => {
    const selectChain = makeSelectChain([{
      id: 'org1::insurers',
      data: { tokio: { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadoraEnc: 'enc(SENHA_ANTIGA)', cpfEmissor: '11122233344' } },
    }]);
    const insertChain = makeInsertChain();
    (getDb as any).mockReturnValue({ ...selectChain, ...insertChain });
    await saveInsurerCredentials('org1', 'tokio', { ativa: true, ambiente: 'aceite-w', codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: '', cpfEmissor: '11122233344' });
    expect(encrypt).not.toHaveBeenCalled();
    const savedValues = insertChain.values.mock.calls[0][0];
    expect(savedValues.data.tokio.codigoOperadoraEnc).toBe('enc(SENHA_ANTIGA)');
  });
});
