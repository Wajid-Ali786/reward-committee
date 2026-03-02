import CryptoJS from "https://cdn.jsdelivr.net/npm/crypto-js@4.1.1/+esm";
import { ENCRYPTION_SALT } from "./firebase-config.js";

export function derivePassphrase(groupId) {
  return CryptoJS.SHA256(ENCRYPTION_SALT + groupId).toString();
}

// MVP client-side encryption. Move to server-side KMS before production.
export function encryptCardCode(groupId, plainCode) {
  const pass = derivePassphrase(groupId);
  return CryptoJS.AES.encrypt(String(plainCode || ""), pass).toString();
}

// MVP client-side decryption. Move to server-side KMS before production.
export function decryptCardCode(groupId, cipher) {
  if (!cipher) return "";
  const pass = derivePassphrase(groupId);
  const bytes = CryptoJS.AES.decrypt(cipher, pass);
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function maskCode(code) {
  if (!code) return "";
  const raw = String(code);
  const visible = raw.slice(-4);
  return `****-****-${visible}`;
}