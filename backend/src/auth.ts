// Firebase ID token verification for Cloudflare Workers.
//
// The frontend signs the user in with the Firebase Web SDK and gets back an
// ID token (a JWT signed by Google). On every API call it sends that token in
// the Authorization header. Here we verify the signature against Google's
// rotating public keys, check the standard claims, and return the user's UID.
//
// Public keys are cached in KV with the TTL that Google's response advertises,
// so we typically do one fetch per ~hour across the whole Worker.

import { jwtVerify, importX509, type JWTPayload } from 'jose';
import type { Env, AuthedUser } from './types';

const GOOGLE_PUBLIC_KEYS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const KV_PUBLIC_KEYS_KEY = 'firebase:public_keys';
const KV_PUBLIC_KEYS_FETCHED_KEY = 'firebase:public_keys:fetched_at';
// Floor TTL — even if Google says cache for 5min, we always re-check after this.
const FALLBACK_TTL_SECONDS = 3600;

interface CachedKeys {
  keys: Record<string, string>;
  expiresAt: number; // ms epoch
}

async function fetchGooglePublicKeys(env: Env): Promise<CachedKeys> {
  const cached = await env.QUOTA_KV.get<CachedKeys>(KV_PUBLIC_KEYS_KEY, 'json');
  if (cached && cached.expiresAt > Date.now()) return cached;

  const res = await fetch(GOOGLE_PUBLIC_KEYS_URL);
  if (!res.ok) {
    throw new AuthError('Could not fetch Firebase public keys', 503);
  }
  const keys = (await res.json()) as Record<string, string>;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttl = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : FALLBACK_TTL_SECONDS;
  const result: CachedKeys = {
    keys,
    expiresAt: Date.now() + ttl * 1000,
  };
  // Cache in KV so other instances of the Worker reuse the same fetch.
  await env.QUOTA_KV.put(KV_PUBLIC_KEYS_KEY, JSON.stringify(result), {
    expirationTtl: ttl,
  });
  await env.QUOTA_KV.put(KV_PUBLIC_KEYS_FETCHED_KEY, String(Date.now()), {
    expirationTtl: ttl,
  });
  return result;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

// Verify a Firebase ID token. Throws AuthError on any failure — caller maps
// that to a 401 with a friendly body.
export async function verifyFirebaseToken(
  token: string,
  env: Env
): Promise<AuthedUser> {
  if (!token) throw new AuthError('Missing token');

  // Pull the kid out of the header so we know which public key to use.
  const parts = token.split('.');
  if (parts.length !== 3) throw new AuthError('Malformed token');
  let header: { kid?: string; alg?: string };
  try {
    header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    throw new AuthError('Malformed token header');
  }
  if (header.alg !== 'RS256') throw new AuthError('Unexpected token algorithm');
  if (!header.kid) throw new AuthError('Token missing key id');

  const { keys } = await fetchGooglePublicKeys(env);
  const cert = keys[header.kid];
  if (!cert) throw new AuthError('Unknown signing key');

  const publicKey = await importX509(cert, 'RS256');

  // Trim the project ID — pasted secrets sometimes carry trailing whitespace
  // or a stray newline that silently breaks the issuer/audience comparison.
  const projectId = (env.FIREBASE_PROJECT_ID || '').trim();
  if (!projectId) throw new AuthError('Server misconfigured: FIREBASE_PROJECT_ID is empty', 500);

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, publicKey, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    payload = result.payload;
  } catch (err) {
    // Include diagnostic context — what we expected vs what's in the token —
    // so a misconfig surfaces immediately instead of as a generic "invalid token".
    let actualIss: string | undefined;
    let actualAud: unknown;
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      actualIss = claims.iss;
      actualAud = claims.aud;
    } catch { /* ignore */ }
    throw new AuthError(
      `Invalid token: ${(err as Error).message} | expected iss=https://securetoken.google.com/${projectId} aud=${projectId} | got iss=${actualIss} aud=${JSON.stringify(actualAud)}`
    );
  }

  const uid = (payload.sub || payload.user_id) as string | undefined;
  if (!uid) throw new AuthError('Token has no subject');

  // auth_time guards against very old tokens that were signed but never used.
  // Firebase ID tokens are valid for 1 hour from auth_time.
  const authTime = (payload.auth_time as number | undefined) || 0;
  if (authTime && authTime > Math.floor(Date.now() / 1000) + 60) {
    throw new AuthError('Token auth_time is in the future');
  }

  return {
    uid,
    email: (payload.email as string | undefined) ?? null,
  };
}

// Pull the bearer token out of an Authorization header.
export function extractBearer(req: Request): string {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) throw new AuthError('Missing Authorization header');
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new AuthError('Authorization header must be "Bearer <token>"');
  return m[1].trim();
}
