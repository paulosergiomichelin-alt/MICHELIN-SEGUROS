import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const ARRAY_TAGS = new Set([
  'Item', 'Modalidade', 'Cobertura', 'CondicaoPagamento', 'FormaPagamento',
  'Parcela', 'Mensagem', 'InformacaoAssumida', 'Verba', 'Tipo',
]);

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_' });
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 20000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

export interface CallSoapParams {
  baseUrl: string;
  path: string;
  namespace: string;
  method: string;
  body: Record<string, any>;
}

export async function callSoap({ baseUrl, path, namespace, method, body }: CallSoapParams): Promise<any> {
  const envelope = builder.build({
    'soapenv:Envelope': {
      '@_xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
      '@_xmlns:con': namespace,
      'soapenv:Header': {},
      'soapenv:Body': {
        [`con:${method}`]: body,
      },
    },
  });

  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n${envelope}`,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Tokio Marine SOAP "${method}" retornou ${res.status}: ${text}`);

  const parsed = parser.parse(text);
  return parsed?.Envelope?.Body?.[method];
}
