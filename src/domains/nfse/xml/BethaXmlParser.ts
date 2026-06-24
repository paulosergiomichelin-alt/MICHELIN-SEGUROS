import type { NfseResult } from '../types';

/**
 * Parser de respostas XML do provedor Betha Sistemas.
 * Interpreta o retorno SOAP/XML das operações de emissão, consulta e cancelamento.
 */
export class BethaXmlParser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parse(_xml: string): NfseResult {
    throw new Error('Parser XML Betha não implementado.');
  }

  parseError(xml: string): string {
    // Extração básica de mensagem de erro do XML de retorno Betha
    const match = xml.match(/<Mensagem>(.*?)<\/Mensagem>/i);
    return match?.[1] ?? 'Erro desconhecido na resposta do provedor.';
  }
}
