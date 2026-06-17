import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const FALLBACK_KEY = 'michelin-seguros-email-key-32chr';

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENCRYPTION_KEY ?? FALLBACK_KEY;
  const buf = Buffer.from(raw, 'utf8');
  // pad or truncate to exactly 32 bytes
  const key = Buffer.alloc(32);
  buf.copy(key, 0, 0, Math.min(buf.length, 32));
  return key;
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  // store iv:ciphertext as hex
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedText: string): string {
  const key = getKey();
  const [ivHex, cipherHex] = encryptedText.split(':');
  if (!ivHex || !cipherHex) throw new Error('Invalid encrypted text format');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(cipherHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
