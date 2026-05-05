// Firebase App Check verification.
//
// App Check sits alongside the Firebase ID token: the ID token says "this
// request is authenticated as user X"; the App Check token says "this
// request actually came from our website running in a real browser, not
// from a script holding a stolen ID token." Both are JWTs — App Check
// tokens are signed by Firebase with rotating keys we fetch from a
// well-known JWKS endpoint.
//
// Enforcement is gated on env.APP_CHECK_ENFORCE so the backend can ship
// before the frontend integration is everywhere — set it to "false" during
// rollout, watch logs to confirm tokens are arriving on most requests,
// then flip to "true."
//
// Debug tokens (env.APP_CHECK_DEBUG_TOKENS, comma-separated) bypass JWKS
// verification — only useful for `wrangler dev` and developer browsers
// where reCAPTCHA Enterprise can't run.
//
// Issuer:   https://firebaseappcheck.googleapis.com/<projectNumber>
// Audience: projects/<projectNumber>      (App Check uses project NUMBER,
//                                          not project ID — distinct value)

import { jwtVerify, createLocalJWKSet, type JSONWebKeySet, type JWTPayload } from 'jose';
import type { Env } from './types';

const JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const KV_JWKS_KEY = 'appcheck:jwks';
const FALLBACK_TTL_SECONDS = 3600;

interface CachedJwks {
  jwks: JSONWebKeySet;
  expiresAt: number;
}

export class AppCheckError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

async function fetchJwks(env: Env): Promise<CachedJwks> {
  const cached = await env.QUOTA_KV.get<CachedJwks>(KV_JWKS_KEY, 'json');
  if (cached && cached.expiresAt > Date.now()) return cached;

  const res = await fetch(JWKS_URL);
  if (!res.ok) {
    throw new AppCheckError('Could not fetch App Check public keys', 503);
  }
  const jwks = (await res.json()) as JSONWebKeySet;
  const cacheControl = res.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttl = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : FALLBACK_TTL_SECONDS;
  const result: CachedJwks = { jwks, expiresAt: Date.now() + ttl * 1000 };
  await env.QUOTA_KV.put(KV_JWKS_KEY, JSON.stringify(result), { expirationTtl: ttl });
  return result;
}

function debugTokenAllowed(env: Env, token: string): boolean {
  const list = (env.APP_CHECK_DEBUG_TOKENS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(token);
}

export function extractAppCheckToken(request: Request): string | null {
  return (
    request.headers.get('x-firebase-appcheck') ||
    request.headers.get('X-Firebase-AppCheck') ||
    null
  );
}

// Verify an App Check token and return its payload. Throws AppCheckError on
// any failure. Caller decides whether to enforce based on env.APP_CHECK_ENFORCE.
export async function verifyAppCheckToken(
  token: string,
  env: Env
): Promise<JWTPayload> {
  if (!token) throw new AppCheckError('Missing App Check token');

  if (debugTokenAllowed(env, token)) {
    return { sub: 'debug', iss: 'debug', aud: 'debug' };
  }

  const projectNumber = (env.FIREBASE_PROJECT_NUMBER || '').trim();
  if (!projectNumber) {
    throw new AppCheckError('Server misconfigured: FIREBASE_PROJECT_NUMBER is empty', 500);
  }

  const { jwks } = await fetchJwks(env);
  const keyset = createLocalJWKSet(jwks);

  try {
    const { payload } = await jwtVerify(token, keyset, {
      issuer: `https://firebaseappcheck.googleapis.com/${projectNumber}`,
      audience: `projects/${projectNumber}`,
    });
    return payload;
  } catch (err) {
    throw new AppCheckError(`Invalid App Check token: ${(err as Error).message}`);
  }
}

// True if APP_CHECK_ENFORCE is set to "true" (string). Anything else means
// log-and-allow mode for the rollout window. Default: enforce.
export function isAppCheckEnforced(env: Env): boolean {
  const v = (env.APP_CHECK_ENFORCE || 'true').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

export function appCheckErrorResponse(err: AppCheckError): Response {
  return Response.json({ error: 'app_check_failed' }, { status: err.status || 401 });
}
