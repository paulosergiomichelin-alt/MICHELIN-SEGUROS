import type { RpsData, NfseResult } from '../types';

export interface INfseProvider {
  emit(rps: RpsData): Promise<NfseResult>;
  consult(nfseNumero: string): Promise<NfseResult>;
  consultStatus(protocolo: string): Promise<NfseResult>;
  consultByRps(rpsNumero: string, rpsSerie: string): Promise<NfseResult>;
  cancel(nfseNumero: string, motivo: string): Promise<NfseResult>;
  downloadXml(nfseNumero: string): Promise<string>;
  downloadPdf(nfseNumero: string): Promise<Blob>;
}
