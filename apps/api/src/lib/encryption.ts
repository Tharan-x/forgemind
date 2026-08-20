// =============================================================================
// ForgeMind API — Encryption Helper (AES-256-GCM)
// =============================================================================

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env['ENCRYPTION_SECRET'] || process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!secret) {
    if (process.env['NODE_ENV'] === 'test') {
      return crypto
        .createHash('sha256')
        .update('forgemind-test-secret-key-for-encryption-32-bytes')
        .digest();
    }
    throw new Error(
      'ENCRYPTION_SECRET or SUPABASE_SERVICE_ROLE_KEY environment variable is required for encryption.',
    );
  }

  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts plaintext string using AES-256-GCM.
 * Returns formatted string `ivHex:authTagHex:encryptedHex`.
 */
export function encryptToken(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts AES-256-GCM encrypted string formatted as `ivHex:authTagHex:encryptedHex`.
 */
export function decryptToken(encryptedString: string): string {
  const parts = encryptedString.split(':');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error('Invalid encrypted token format.');
  }

  const ivHex = parts[0];
  const tagHex = parts[1];
  const encryptedHex = parts[2];
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}
