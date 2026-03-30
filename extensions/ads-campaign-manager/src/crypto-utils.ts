import CryptoJS from "crypto-js";

const DEFAULT_KEY = "s3cr3t_k3y_f0r_t0mcl4ws_v4_0_32ch";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY === DEFAULT_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("CRITICAL: ENCRYPTION_KEY must be set to a secure unique value in .env for production.");
  }
  console.warn("⚠️ WARNING: Using default or missing ENCRYPTION_KEY. NOT SECURE FOR COMMERCIAL USE.");
}

const USED_KEY = (ENCRYPTION_KEY || DEFAULT_KEY) as string;

/**
 * Encrypts a plain text string using AES-256.
 * @param text The text to encrypt.
 * @returns The encrypted ciphertext.
 */
export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, USED_KEY).toString();
}

/**
 * Decrypts an AES-256 encrypted ciphertext.
 * @param ciphertext The text to decrypt.
 * @returns The decrypted plain text.
 */
export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, USED_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
