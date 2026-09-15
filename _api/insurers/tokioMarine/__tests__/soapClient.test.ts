import { describe, it, expect, vi, afterEach } from 'vitest';
import { callSoap } from '../soapClient.js';

describe('tokioMarine/soapClient', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('monta o envelope SOAP com o namespace e o body corretos', async () => {
    let capturedBody = '';
    global.fetch = vi.fn(async (url: any, opts: any) => {
      expect(String(url)).toBe('https://wscotador-aceitew.tokiomarine.com.br/TmsWS/Auto/Cotacao?wsdl');
      expect(opts.headers['Content-Type']).toContain('text/xml');
      capturedBody = opts.body;
      return {
        ok: true,
        text: async () => `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="CotacaoWS">
  <soapenv:Body>
    <con:cotar>
      <Retorno>
        <Calculo>
          <NumeroCalculo>123456</NumeroCalculo>
        </Calculo>
      </Retorno>
    </con:cotar>
  </soapenv:Body>
</soapenv:Envelope>`,
      };
    }) as any;

    const result = await callSoap({
      baseUrl: 'https://wscotador-aceitew.tokiomarine.com.br',
      path: '/TmsWS/Auto/Cotacao?wsdl',
      namespace: 'CotacaoWS',
      method: 'cotar',
      body: { codigoCorretor: 'C1', codigoUsuario: 'U1', codigoOperadora: 'SENHA' },
    });

    expect(capturedBody).toContain('xmlns:con="CotacaoWS"');
    expect(capturedBody).toContain('<con:cotar>');
    expect(capturedBody).toContain('<codigoCorretor>C1</codigoCorretor>');
    expect(result).toEqual({ Retorno: { Calculo: { NumeroCalculo: 123456 } } });
  });

  it('lança erro com o texto da resposta quando o HTTP não é ok', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' })) as any;
    await expect(callSoap({
      baseUrl: 'https://x', path: '/y', namespace: 'NS', method: 'm', body: {},
    })).rejects.toThrow('500');
  });

  it('trata múltiplas ocorrências de tags repetíveis como array mesmo com um item só', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:con="CotacaoWS">
  <soapenv:Body>
    <con:cotar>
      <Retorno><Calculo><Itens><Item><ITEM>1</ITEM><Modalidades><Modalidade><CodigoModalidade>M1</CodigoModalidade></Modalidade></Modalidades></Item></Itens></Calculo></Retorno>
    </con:cotar>
  </soapenv:Body>
</soapenv:Envelope>`,
    })) as any;

    const result = await callSoap({ baseUrl: 'https://x', path: '/y', namespace: 'CotacaoWS', method: 'cotar', body: {} });
    expect(Array.isArray(result.Retorno.Calculo.Itens.Item)).toBe(true);
    expect(Array.isArray(result.Retorno.Calculo.Itens.Item[0].Modalidades.Modalidade)).toBe(true);
  });
});
