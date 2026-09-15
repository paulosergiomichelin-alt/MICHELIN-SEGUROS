import { eq } from 'drizzle-orm';
import { getDb } from '../lib/db.js';
import { encrypt, decrypt } from '../lib/emailEncryption.js';
import { settings } from '../db/schema/settings.js';

export interface TokioMarineCredentials {
  ativa: boolean;
  ambiente: 'aceite-w' | 'aceite-y' | 'producao';
  codigoCorretor: string;
  codigoUsuario: string;
  codigoOperadora: string; // texto puro — só uso interno server-side
  cpfEmissor: string;
}

export interface InsurerCredentialsSafe {
  ativa: boolean;
  ambiente: string;
  codigoCorretor: string;
  codigoUsuario: string;
  cpfEmissor: string;
  temCredencial: boolean;
}

function docId(organizationId: string): string {
  return `${organizationId}::insurers`;
}

async function loadDoc(organizationId: string): Promise<Record<string, any>> {
  const [row] = await getDb().select().from(settings).where(eq(settings.id, docId(organizationId)));
  return (row?.data as Record<string, any>) ?? {};
}

export async function getInsurerCredentials(organizationId: string, providerId: string): Promise<TokioMarineCredentials | null> {
  const doc = await loadDoc(organizationId);
  const raw = doc[providerId];
  if (!raw) return null;
  const { codigoOperadoraEnc, ...rest } = raw;
  return { ...rest, codigoOperadora: decrypt(codigoOperadoraEnc) } as TokioMarineCredentials;
}

export async function getInsurerCredentialsSafe(organizationId: string): Promise<Record<string, InsurerCredentialsSafe>> {
  const doc = await loadDoc(organizationId);
  const result: Record<string, InsurerCredentialsSafe> = {};
  for (const [providerId, raw] of Object.entries(doc)) {
    const { codigoOperadoraEnc, ...rest } = raw as any;
    result[providerId] = { ...rest, temCredencial: !!codigoOperadoraEnc };
  }
  return result;
}

export async function saveInsurerCredentials(
  organizationId: string,
  providerId: string,
  data: { ativa: boolean; ambiente: string; codigoCorretor: string; codigoUsuario: string; codigoOperadora: string; cpfEmissor: string },
): Promise<void> {
  const doc = await loadDoc(organizationId);
  const existing = doc[providerId] ?? {};
  const codigoOperadoraEnc = data.codigoOperadora ? encrypt(data.codigoOperadora) : existing.codigoOperadoraEnc;
  const { codigoOperadora, ...rest } = data;
  const nextDoc = { ...doc, [providerId]: { ...rest, codigoOperadoraEnc } };
  await getDb().insert(settings)
    .values({ id: docId(organizationId), data: nextDoc })
    .onConflictDoUpdate({ target: settings.id, set: { data: nextDoc, updatedAt: new Date().toISOString() } });
}
