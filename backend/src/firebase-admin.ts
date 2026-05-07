// Server-side RTDB reads using a Firebase service account.
//
// Used for one specific job: pulling the recipient's gender + birth year off
// /users/{uid} so the translation prompt can commit to a single Vietnamese
// pronoun for stranger / formal pairs. Both values stay inside this Worker —
// they're never echoed back to the sender. The recipient's privacy is what
// they configured; the translation just gets to pick the right honorific.
//
// One-off setup before this does anything:
//   wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
// Paste the full JSON of a service account with the "Firebase Realtime
// Database Viewer" role. Until that secret is set, every helper here returns
// null and the prompt falls back to the smart-default behavior.
//
// Optional override:
//   wrangler secret put FIREBASE_DATABASE_URL    # e.g. https://my-app.europe-west1.firebasedatabase.app
// Defaults to https://{project_id}-default-rtdb.firebaseio.com which matches
// the standard us-central1 RTDB instance.

import { SignJWT, importPKCS8 } from 'jose';
import type { Env } from './types';

// jose v6 returns CryptoKey on Web Crypto runtimes (Workers); v5 returned a
// KeyLike wrapper. Avoid the named import either way and use the helper's
// own return type, which is correct under both.
type ImportedPrivateKey = Awaited<ReturnType<typeof importPKCS8>>;

const ACCESS_TOKEN_KV_KEY = 'firebase:admin_access_token';
const PROFILE_KV_PREFIX = 'firebase:user_profile:';
const PROFILE_CACHE_TTL_SECONDS = 5 * 60;
const TOKEN_EXCHANGE_URL = 'https://oauth2.googleapis.com/token';
const RTDB_SCOPES =
  'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

interface CachedAccessToken {
  token: string;
  expiresAt: number; // ms epoch
  databaseUrl: string;
}

// Module-level memoization. CF Workers reuse the isolate across requests in
// the same region for short windows, so caching the parsed SA + imported key
// avoids re-parsing PEM on every translate call. The OAuth access token is
// cached in KV (cross-isolate) instead.
let parsedSA: ServiceAccount | null = null;
let importedKey: ImportedPrivateKey | null = null;

function parseServiceAccount(env: Env): ServiceAccount | null {
  if (parsedSA) return parsedSA;
  const raw = (env as unknown as Record<string, string | undefined>)
    .FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    parsedSA = sa;
    return sa;
  } catch (err) {
    console.warn('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON parse failed:', err);
    return null;
  }
}

function databaseUrlFor(env: Env, sa: ServiceAccount): string {
  const override = (env as unknown as Record<string, string | undefined>)
    .FIREBASE_DATABASE_URL;
  if (override && /^https:\/\//.test(override)) return override.replace(/\/+$/, '');
  return `https://${sa.project_id}-default-rtdb.firebaseio.com`;
}

async function getImportedKey(sa: ServiceAccount): Promise<ImportedPrivateKey> {
  if (importedKey) return importedKey;
  importedKey = await importPKCS8(sa.private_key, 'RS256');
  return importedKey;
}

async function mintAccessToken(
  sa: ServiceAccount,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const key = await getImportedKey(sa);
  const jwt = await new SignJWT({ scope: RTDB_SCOPES })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_EXCHANGE_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  // Subtract 60s so we never serve a token that expires mid-request.
  const expiresAt = Date.now() + Math.max(60, json.expires_in - 60) * 1000;
  return { token: json.access_token, expiresAt };
}

async function getCachedAccessToken(env: Env): Promise<CachedAccessToken | null> {
  const sa = parseServiceAccount(env);
  if (!sa) return null;
  const databaseUrl = databaseUrlFor(env, sa);

  const cached = await env.QUOTA_KV.get<CachedAccessToken>(ACCESS_TOKEN_KV_KEY, 'json');
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached;

  try {
    const { token, expiresAt } = await mintAccessToken(sa);
    const fresh: CachedAccessToken = { token, expiresAt, databaseUrl };
    const ttl = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
    await env.QUOTA_KV.put(ACCESS_TOKEN_KV_KEY, JSON.stringify(fresh), {
      expirationTtl: ttl,
    });
    return fresh;
  } catch (err) {
    console.warn('[firebase-admin] mintAccessToken failed:', err);
    return null;
  }
}

export interface UserProfileSlice {
  gender?: string | null;
  birthYear?: number | null;
  displayName?: string | null;
}

// Returns null when the service account isn't configured, the UID is malformed,
// the read fails, or the user simply doesn't have these fields set.
// Cached in KV for 5 minutes so a chatty conversation doesn't hammer RTDB.
export async function readUserProfile(env: Env, uid: string): Promise<UserProfileSlice | null> {
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;

  const kvKey = PROFILE_KV_PREFIX + uid;
  const cached = await env.QUOTA_KV.get<UserProfileSlice>(kvKey, 'json');
  if (cached) return cached;

  const access = await getCachedAccessToken(env);
  if (!access) return null;

  try {
    const url = `${access.databaseUrl}/users/${encodeURIComponent(uid)}.json`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${access.token}` },
    });
    if (!res.ok) {
      console.warn('[firebase-admin] readUserProfile RTDB read failed:', res.status);
      return null;
    }
    const data = (await res.json()) as Record<string, unknown> | null;
    const slice: UserProfileSlice = {};
    if (data && typeof data === 'object') {
      if (typeof data.gender === 'string') slice.gender = data.gender;
      if (typeof data.birthYear === 'number') slice.birthYear = data.birthYear;
      if (typeof data.displayName === 'string') slice.displayName = data.displayName;
    }
    await env.QUOTA_KV.put(kvKey, JSON.stringify(slice), {
      expirationTtl: PROFILE_CACHE_TTL_SECONDS,
    });
    return slice;
  } catch (err) {
    console.warn('[firebase-admin] readUserProfile threw:', err);
    return null;
  }
}
