import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// We need a 32-byte key for aes-256-gcm
// Look for a specific encryption key, fallback to hashing the JWT_SECRET to ensure it's exactly 32 bytes
const getEncryptionKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'ENCRYPTION_KEY or JWT_SECRET must be set in the environment',
    );
  }
  // Create a 32-byte key from the secret
  return crypto.createHash('sha256').update(String(secret)).digest();
};

/**
 * Encrypts a string using AES-256-GCM.
 * Reversible, intended for sensitive PII like BVN and NIN.
 *
 * @param text The plain text string to encrypt
 * @returns A base64-encoded string combining IV, Auth Tag, and Ciphertext
 */
export const encrypt = (text: string): string => {
  if (!text) return text;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine IV, AuthTag, and Ciphertext, then base64 encode for safer storage
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]).toString('base64');

  return combined;
};

/**
 * Decrypts a previously encrypted string.
 *
 * @param encryptedBase64 The base64-encoded encrypted string
 * @returns The original plain text string
 */
export const decrypt = (encryptedBase64: string): string => {
  if (!encryptedBase64) return encryptedBase64;

  // If it's all digits, it's likely plain text (BVN/NIN digits) and not encrypted
  if (/^\d+$/.test(encryptedBase64)) {
    return encryptedBase64;
  }

  try {
    const key = getEncryptionKey();
    const combinedBuffer = Buffer.from(encryptedBase64, 'base64');

    // Extract IV (16 bytes), AuthTag (16 bytes), and Ciphertext (the rest)
    const iv = combinedBuffer.subarray(0, 16);
    const authTag = combinedBuffer.subarray(16, 32);
    const ciphertext = combinedBuffer.subarray(32).toString('hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // If decryption fails (e.g., data was not encrypted, key changed), return the original
    return encryptedBase64;
  }
};
