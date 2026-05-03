// Symmetric encryption for message content stored in Firebase.
//
// Threat model: an operator browsing the Firebase Realtime Database, or anyone
// who obtains a leaked database backup, sees only ciphertext. The encryption
// key lives as a Cloudflare Worker secret (env.MESSAGE_ENCRYPTION_KEY) and
// is never written to the database, never shipped to the browser, and never
// logged.
//
// Algorithm: AES-256-GCM with a fresh 12-byte IV per ciphertext. Output is
// base64(IV || ciphertext || tag). GCM provides authentication, so any tamper
// with the stored bytes will surface as a decryption error rather than
// silently corrupting the message.
//
// Schema: encrypted message fields use the wrapper { v: 1, c: '<base64>' }.
// The version byte lets us rotate algorithms or keys later without breaking
// older messages.

import type { Env } from './types';

export interface EncryptedBlob {
  v: 1;
  c: string;
}

let cachedKey: CryptoKey | null = null;

async function getKey(env: Env): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!env.MESSAGE_ENCRYPTION_KEY) {
    throw new Error('MESSAGE_ENCRYPTION_KEY secret not configured');
  }
  const raw = base64ToBytes(env.MESSAGE_ENCRYPTION_KEY);
  if (raw.length !== 32) {
    throw new Error(`MESSAGE_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}`);
  }
  cachedKey = await crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  return cachedKey;
}

export async function encryptText(plaintext: string, env: Env): Promise<EncryptedBlob> {
  if (!plaintext) return { v: 1, c: '' };
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const blob = new Uint8Array(iv.length + ct.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ct), iv.length);
  return { v: 1, c: bytesToBase64(blob) };
}

export async function decryptText(blob: EncryptedBlob, env: Env): Promise<string> {
  if (!blob || !blob.c) return '';
  if (blob.v !== 1) throw new Error(`Unsupported ciphertext version: ${blob.v}`);
  const key = await getKey(env);
  const bytes = base64ToBytes(blob.c);
  if (bytes.length < 13) throw new Error('Ciphertext too short');
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct as BufferSource
  );
  return new TextDecoder().decode(pt);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
