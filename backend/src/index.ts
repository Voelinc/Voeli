// Voeli translation Worker — entry point.
//
// Routes:
//   GET  /                           health check
//   GET  /api/quota                  return current usage for the signed-in user
//   POST /api/translate              full picker (4 emotion options)
//   POST /api/translate-quick        single fast translation
//   POST /api/translate-voice        voice → picker JSON
//   POST /api/grammar                inline typo/grammar suggestion
//   POST /api/encrypt                AES-256-GCM batch encrypt
//   POST /api/decrypt                AES-256-GCM batch decrypt
//   GET  /api/tenor/search           Tenor GIF search proxy (server-side key)
//   GET  /api/tenor/featured         Tenor featured GIFs proxy
//
// Request pipeline for /api/* routes:
//   1. CORS preflight (if OPTIONS)
//   2. Firebase ID token verification → AuthedUser
//   3. App Check token verification (or log-and-allow per APP_CHECK_ENFORCE)
//   4. Rate limit (per-UID + per-IP) — fast-fail on abuse
//   5. Schema validation (Zod) + sanitization
//   6. Quota consumption (translate/voice/grammar only)
//   7. Handler

import * as Sentry from '@sentry/cloudflare';
import {
  AuthError,
  extractBearer,
  verifyFirebaseToken,
} from './auth';
import {
  AppCheckError,
  appCheckErrorResponse,
  extractAppCheckToken,
  isAppCheckEnforced,
  verifyAppCheckToken,
} from './app-check';
import {
  enforceRateLimit,
  RateLimitError,
  rateLimitErrorResponse,
  sourceIp,
} from './rate-limit';
import {
  consumeQuota,
  QuotaError,
  readQuota,
  type QuotaKind,
} from './quota';
import {
  handleTranslate,
  handleQuick,
  handleVoice,
  handleGrammar,
} from './openai';
import { encryptText, decryptText, type EncryptedBlob } from './crypto';
import {
  parseBody,
  parseSearchParams,
  ValidationError,
  validationErrorResponse,
  TranslatePayloadSchema,
  QuickTranslatePayloadSchema,
  VoiceTranslatePayloadSchema,
  GrammarPayloadSchema,
  EncryptPayloadSchema,
  DecryptPayloadSchema,
  TenorSearchSchema,
  TenorFeaturedSchema,
} from './schemas';
import type { Env, AuthedUser } from './types';

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const ip = sourceIp(request);

    // CORS preflight — handled before auth so browsers can probe.
    if (request.method === 'OPTIONS') {
      return preflightResponse(request, env);
    }

    try {
      // Health probe — no auth, IP-only rate limit so it can't be hammered.
      if (request.method === 'GET' && url.pathname === '/') {
        await enforceRateLimit(env, 'health', null, ip);
        return withCors(Response.json({ ok: true }), request, env);
      }

      if (!url.pathname.startsWith('/api/')) {
        return withCors(notFound(), request, env);
      }

      // Auth — every /api/* route requires a valid Firebase ID token.
      let user: AuthedUser;
      try {
        const token = extractBearer(request);
        user = await verifyFirebaseToken(token, env);
      } catch (err) {
        const e = err as AuthError;
        return withCors(
          Response.json({ error: e.message }, { status: e.status || 401 }),
          request,
          env
        );
      }

      // App Check — verify the device-attestation token. In log-and-allow
      // mode (APP_CHECK_ENFORCE != "true") we still verify so we can see
      // failure rates, but we don't reject.
      const appCheckToken = extractAppCheckToken(request);
      try {
        if (appCheckToken) {
          await verifyAppCheckToken(appCheckToken, env);
        } else if (isAppCheckEnforced(env)) {
          throw new AppCheckError('Missing App Check token');
        } else {
          console.warn('AppCheck: token missing (log-and-allow mode)', { uid: user.uid, path: url.pathname });
        }
      } catch (err) {
        if (isAppCheckEnforced(env)) {
          return withCors(appCheckErrorResponse(err as AppCheckError), request, env);
        }
        console.warn('AppCheck: verification failed (log-and-allow mode)', {
          uid: user.uid,
          path: url.pathname,
          error: (err as Error).message,
        });
      }

      const route = url.pathname;
      const method = request.method;

      // GET /api/quota
      if (method === 'GET' && route === '/api/quota') {
        await enforceRateLimit(env, 'quota', user.uid, ip);
        return withCors(await handleQuotaStatus(user, env), request, env);
      }

      // GET /api/tenor/search and /api/tenor/featured
      if (method === 'GET' && route === '/api/tenor/search') {
        await enforceRateLimit(env, 'tenor', user.uid, ip);
        return withCors(await handleTenorSearch(url, env), request, env);
      }
      if (method === 'GET' && route === '/api/tenor/featured') {
        await enforceRateLimit(env, 'tenor', user.uid, ip);
        return withCors(await handleTenorFeatured(url, env), request, env);
      }

      if (method !== 'POST') {
        return withCors(methodNotAllowed(), request, env);
      }

      if (route === '/api/translate') {
        await enforceRateLimit(env, 'translate', user.uid, ip);
        const body = await parseBody(TranslatePayloadSchema, request);
        return withCors(
          await runWithQuota(user, env, 'translate', () => handleTranslate(body, env)),
          request,
          env
        );
      }
      if (route === '/api/translate-quick') {
        await enforceRateLimit(env, 'translate-quick', user.uid, ip);
        const body = await parseBody(QuickTranslatePayloadSchema, request);
        return withCors(
          await runWithQuota(user, env, 'translate', () => handleQuick(body, env)),
          request,
          env
        );
      }
      if (route === '/api/translate-voice') {
        await enforceRateLimit(env, 'translate-voice', user.uid, ip);
        const body = await parseBody(VoiceTranslatePayloadSchema, request);
        return withCors(
          await runWithQuota(user, env, 'voice', () => handleVoice(body, env)),
          request,
          env
        );
      }
      if (route === '/api/grammar') {
        await enforceRateLimit(env, 'grammar', user.uid, ip);
        const body = await parseBody(GrammarPayloadSchema, request);
        return withCors(
          await runWithQuota(user, env, 'grammar', () => handleGrammar(body, env)),
          request,
          env
        );
      }
      if (route === '/api/encrypt') {
        await enforceRateLimit(env, 'encrypt', user.uid, ip);
        const body = await parseBody(EncryptPayloadSchema, request);
        return withCors(await handleEncrypt(body, env), request, env);
      }
      if (route === '/api/decrypt') {
        await enforceRateLimit(env, 'decrypt', user.uid, ip);
        const body = await parseBody(DecryptPayloadSchema, request);
        return withCors(await handleDecrypt(body, env), request, env);
      }

      return withCors(notFound(), request, env);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return withCors(rateLimitErrorResponse(err), request, env);
      }
      if (err instanceof ValidationError) {
        return withCors(validationErrorResponse(err), request, env);
      }
      if (err instanceof QuotaError) {
        return withCors(
          Response.json(
            {
              error: 'Daily quota reached',
              used: err.used,
              limit: err.limit,
              retryAfterSeconds: err.retryAfterSeconds,
            },
            {
              status: 429,
              headers: { 'Retry-After': String(err.retryAfterSeconds) },
            }
          ),
          request,
          env
        );
      }
      // Any other thrown error is a bug — generic 500 to the client (no
      // internals leaked) and let `wrangler tail` / Sentry show the stack.
      console.error('Unhandled error:', err);
      return withCors(
        Response.json({ error: 'internal_error' }, { status: 500 }),
        request,
        env
      );
    }
  },
} satisfies ExportedHandler<Env>;

// Wrap the handler with Sentry so any thrown error inside fetch() is captured
// and shipped to the worker DSN. AuthError, QuotaError, RateLimitError,
// ValidationError, and AppCheckError are user-facing states — we filter those
// out in beforeSend so they don't pollute the dashboard.
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    environment: 'production',
    release: 'voeli-worker@phase5',
    tracesSampleRate: 0,
    sampleRate: 1.0,
    beforeSend(event, hint) {
      const err = hint && (hint.originalException as Error | undefined);
      const msg = (err && err.message) || event.message || '';
      if (/Missing Authorization|Invalid token|Daily quota|Token has no subject|rate_limited|invalid_request|app_check_failed|Missing App Check token|Invalid App Check token/i.test(msg)) {
        return null;
      }
      return event;
    },
  }),
  handler
);

// --- helpers ---------------------------------------------------------------

async function runWithQuota(
  user: AuthedUser,
  env: Env,
  kind: QuotaKind,
  fn: () => Promise<Response>
): Promise<Response> {
  const { used, limit } = await consumeQuota(env, user.uid, kind);
  const res = await fn();
  // Mirror quota state in response headers so the client can show "X of Y".
  res.headers.set('X-Quota-Used', String(used));
  res.headers.set('X-Quota-Limit', String(limit));
  res.headers.set('X-Quota-Kind', kind);
  return res;
}

async function handleQuotaStatus(
  user: AuthedUser,
  env: Env
): Promise<Response> {
  const [translate, voice, grammar] = await Promise.all([
    readQuota(env, user.uid, 'translate'),
    readQuota(env, user.uid, 'voice'),
    readQuota(env, user.uid, 'grammar'),
  ]);
  return Response.json({ uid: user.uid, translate, voice, grammar });
}

// --- encryption handlers ---------------------------------------------------
//
// These bypass the quota system: they're local CPU work, not OpenAI calls.
// Rate limiting still applies — see /api/encrypt and /api/decrypt routes
// above. Schema validation guarantees batch size + per-item byte caps.

async function handleEncrypt(
  body: { texts: string[] },
  env: Env
): Promise<Response> {
  const out: EncryptedBlob[] = [];
  for (const t of body.texts) {
    out.push(await encryptText(t, env));
  }
  return Response.json({ encrypted: out });
}

async function handleDecrypt(
  body: { blobs: EncryptedBlob[] },
  env: Env
): Promise<Response> {
  const out: { ok: boolean; text: string }[] = [];
  for (const b of body.blobs) {
    try {
      out.push({ ok: true, text: await decryptText(b, env) });
    } catch {
      // Tampered or wrong-key ciphertext. Surface a per-item failure rather
      // than blowing up the whole batch.
      out.push({ ok: false, text: '' });
    }
  }
  return Response.json({ decrypted: out });
}

// --- Tenor proxy -----------------------------------------------------------
//
// Frontend used to embed the Tenor API key directly. We proxy the search +
// featured endpoints here so the key stays on the Worker. Validates the
// query-string params with Zod, forwards a clean URL upstream, and passes
// the response through.

const TENOR_BASE = 'https://tenor.googleapis.com/v2';

async function handleTenorSearch(url: URL, env: Env): Promise<Response> {
  const params = parseSearchParams(TenorSearchSchema, url);
  const upstream = new URL(`${TENOR_BASE}/search`);
  upstream.searchParams.set('q', params.q);
  upstream.searchParams.set('key', env.TENOR_API_KEY);
  upstream.searchParams.set('limit', String(params.limit ?? 20));
  upstream.searchParams.set('media_filter', params.media_filter ?? 'gif');
  if (params.searchfilter) upstream.searchParams.set('searchfilter', params.searchfilter);
  if (params.pos) upstream.searchParams.set('pos', params.pos);
  return forwardTenor(upstream);
}

async function handleTenorFeatured(url: URL, env: Env): Promise<Response> {
  const params = parseSearchParams(TenorFeaturedSchema, url);
  const upstream = new URL(`${TENOR_BASE}/featured`);
  upstream.searchParams.set('key', env.TENOR_API_KEY);
  upstream.searchParams.set('limit', String(params.limit ?? 20));
  upstream.searchParams.set('media_filter', params.media_filter ?? 'gif');
  if (params.pos) upstream.searchParams.set('pos', params.pos);
  return forwardTenor(upstream);
}

async function forwardTenor(upstream: URL): Promise<Response> {
  const res = await fetch(upstream.toString());
  if (!res.ok) {
    return Response.json(
      { error: 'tenor_upstream_error', status: res.status },
      { status: res.status >= 500 ? 502 : res.status }
    );
  }
  const data = await res.json();
  return Response.json(data);
}

function notFound(): Response {
  return Response.json({ error: 'Not found' }, { status: 404 });
}
function methodNotAllowed(): Response {
  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

// --- CORS ------------------------------------------------------------------

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const list = allowedOrigins(env);
  return list.includes(origin) ? origin : null;
}

function withCors(res: Response, request: Request, env: Env): Response {
  const origin = pickOrigin(request, env);
  if (!origin) return res;
  // Build a new Headers we can mutate (the original may be immutable).
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Expose-Headers', 'X-Quota-Used,X-Quota-Limit,X-Quota-Kind,Retry-After');
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function preflightResponse(request: Request, env: Env): Response {
  const origin = pickOrigin(request, env);
  const headers = new Headers();
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, OPTIONS'
    );
    headers.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, X-Firebase-AppCheck'
    );
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(null, { status: 204, headers });
}
