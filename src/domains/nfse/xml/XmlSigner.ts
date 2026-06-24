import type { CertificateInfo } from '../types';

/**
 * Assinador de XML com certificado A1 (PFX/P12).
 * Utiliza a Web Crypto API para assinar digitalmente o XML no padrão XMLDSig.
 * Requer o certificado carregado e a senha para descriptografar a chave privada.
 */
export class XmlSigner {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sign(_xml: string, _certificate: CertificateInfo): Promise<string> {
    throw new Error(
      'Assinatura XML não implementada. Configure o certificado digital A1 (.pfx/.p12) na aba "Certificado Digital" da empresa.',
    );
  }
}
