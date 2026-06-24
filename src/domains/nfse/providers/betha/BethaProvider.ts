import type { INfseProvider } from '../INfseProvider';
import type { RpsData, NfseResult } from '../../types';

const NOT_CONFIGURED = 'Integração Betha não configurada. Configure o certificado digital e as credenciais fiscais na aba "Dados Fiscais" da empresa.';

/**
 * Provedor Betha Sistemas — compatível com Maracaju-MS, layout ABRASF 2.02.
 * Endpoint WSDL/SOAP com assinatura XML A1.
 * Aguardando configuração do certificado digital para ativação.
 */
export class BethaProvider implements INfseProvider {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async emit(_rps: RpsData): Promise<NfseResult> {
    throw new Error(NOT_CONFIGURED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async consult(_nfseNumero: string): Promise<NfseResult> {
    throw new Error(NOT_CONFIGURED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async consultStatus(_protocolo: string): Promise<NfseResult> {
    throw new Error(NOT_CONFIGURED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async consultByRps(_rpsNumero: string, _rpsSerie: string): Promise<NfseResult> {
    throw new Error(NOT_CONFIGURED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancel(_nfseNumero: string, _motivo: string): Promise<NfseResult> {
    throw new Error(NOT_CONFIGURED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async downloadXml(_nfseNumero: string): Promise<string> {
    throw new Error(NOT_CONFIGURED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async downloadPdf(_nfseNumero: string): Promise<Blob> {
    throw new Error(NOT_CONFIGURED);
  }
}
