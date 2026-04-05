import * as crypto from 'crypto';

/** Derives per-user key using SIGNATURE_ENCRYPTION_SECRET */
export function deriveUserKey(masterSecret: string, userId: string): Buffer {
  return crypto.createHmac('sha256', masterSecret).update(userId).digest();
}

export function decryptPersonalPrivateKey(
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
