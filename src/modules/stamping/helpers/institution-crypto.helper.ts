import * as crypto from 'crypto';

/** Derives per-institution key using INSTITUTION_ENCRYPTION_SECRET */
export function deriveInstitutionKey(
  masterSecret: string,
  institutionId: string,
): Buffer {
  return crypto
    .createHmac('sha256', masterSecret)
    .update(institutionId)
    .digest();
}

export function decryptInstitutionPrivateKey(
  encrypted: string,
  derivedKey: Buffer,
): string {
  const [ivHex, encHex] = encrypted.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    derivedKey,
    Buffer.from(ivHex, 'hex'),
  );
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
