// Voeli translation Worker — entry point.
//
// Routes:
//   GET  /                           health check
//   GET  /api/quota                  return current usage for the signed-in user
//   POST /api/translate              full picker (4 emotion options)
//   POST /api/translate-quick        single fast translation
//   POST /api/translate-voice        voice → picker JSON
//   POST /api/grammar                inline typo/grammar suggestion
//
// Every /api/* route requires a valid Firebase ID token in the Authorization
// header and consumes one unit from the user's daily quota bucket.

import * as Sentry from '@sentry/cloudflare';
import {
  AuthError,
  extractBearer,
  verifyFirebaseToken,
} from './auth';
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
import type {
  Env,
  AuthedUser,
  TranslatePayload,
  QuickTranslatePayload,
  VoiceTranslatePayload,
  GrammarPayload,
} from './types';

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight — handled before auth so browsers can probe.
    if (request.method === 'OPTIONS') {
      return preflightResponse(request, env);
    }

    // Health probe — useful from the browser to confirm the Worker is up.
    if (request.method === 'GET' && url.pathname === '/') {
      return withCors(
        Response.json({ ok: true, service: 'voeli-translate-worker' }),
        request,
        env
      );
    }

    // Everything past here requires auth.
    if (!url.pathname.startsWith('/api/')) {
      return withCors(notFound(), request, env);
    }

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

    try {
      const route = url.pathname;
      if (request.method === 'GET' && route === '/api/quota') {
        return withCors(await handleQuotaStatus(user, env), request, env);
      }

      if (request.method !== 'POST') {
        return withCors(methodNotAllowed(), request, env);
      }

      if (route === '/api/translate') {
        return withCors(
          await runWithQuota(user, env, 'translate', async () => {
            const body = await readJson<TranslatePayload>(request);
            return handleTranslate(body, env);
          }),
          request,
          env
        );
      }
      if (route === '/api/translate-quick') {
        return withCors(
          await runWithQuota(user, env, 'translate', async () => {
            const body = await readJson<QuickTranslatePayload>(request);
            return handleQuick(body, env);
          }),
          request,
          env
        );
      }
      if (route === '/api/translate-voice') {
        return withCors(
          await runWithQuota(user, env, 'voice', async () => {
            const body = await readJson<VoiceTranslatePayload>(request);
            return handleVoice(body, env);
          }),
          request,
          env
        );
      }
      if (route === '/api/grammar') {
        return withCors(
          await runWithQuota(user, env, 'grammar', async () => {
            const body = await readJson<GrammarPayload>(request);
            return handleGrammar(body, env);
          }),
          request,
          env
        );
      }
      if (route === '/api/encrypt') {
        const body = await readJson<{ texts: string[] }>(request);
        return withCors(await handleEncrypt(body, env), request, env);
      }
      if (route === '/api/decrypt') {
        const body = await readJson<{ blobs: EncryptedBlob[] }>(request);
        return withCors(await handleDecrypt(body, env), request, env);
      }

      return withCors(notFound(), request, env);
    } catch (err) {
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
      // Any other thrown error is a bug — surface a generic 500 to the client
      // and let `wrangler tail` show the stack to operators.
      console.error('Unhandled error:', err);
      return withCors(
        Response.json(
          { error: (err as Error).message || 'Internal error' },
          { status: 500 }
        ),
        request,
        env
      );
    }
  },
} satisfies ExportedHandler<Env>;

// Wrap the handler with Sentry so any thrown error inside fetch() is captured
// and shipped to the worker DSN. AuthError and QuotaError are user-facing
// states — we filter those out in beforeSend so they don't pollute the dashboard.
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
      if (/Missing Authorization|Invalid token|Daily quota|Token has no subject/i.test(msg)) {
        return null;
      }
      return event;
    },
  }),
  handler
);

// --- helpers ---------------------------------------------------------------

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('Request body must be valid JSON');
  }
}

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
// These bypass the quota system: they're local CPU work, not OpenAI calls,
// and the client may need to call /api/decrypt many times when loading
// message history. Auth alone is enough to prevent abuse.

const MAX_BATCH = 200;
const MAX_TEXT_BYTES = 16 * 1024;

async function handleEncrypt(
  body: { texts: string[] },
  env: Env
): Promise<Response> {
  if (!body || !Array.isArray(body.texts)) {
    return Response.json({ error: 'texts[] required' }, { status: 400 });
  }
  if (body.texts.length > MAX_BATCH) {
    return Response.json({ error: `texts[] exceeds ${MAX_BATCH}` }, { status: 400 });
  }
  const out: EncryptedBlob[] = [];
  for (const t of body.texts) {
    if (typeof t !== 'string') {
      return Response.json({ error: 'texts[] must be strings' }, { status: 400 });
    }
    if (t.length > MAX_TEXT_BYTES) {
      return Response.json({ error: 'text too large' }, { status: 400 });
    }
    out.push(await encryptText(t, env));
  }
  return Response.json({ encrypted: out });
}

async function handleDecrypt(
  body: { blobs: EncryptedBlob[] },
  env: Env
): Promise<Response> {
  if (!body || !Array.isArray(body.blobs)) {
    return Response.json({ error: 'blobs[] required' }, { status: 400 });
  }
  if (body.blobs.length > MAX_BATCH) {
    return Response.json({ error: `blobs[] exceeds ${MAX_BATCH}` }, { status: 400 });
  }
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
  headers.set('Access-Control-Expose-Headers', 'X-Quota-Used,X-Quota-Limit,X-Quota-Kind');
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
      'Authorization, Content-Type'
    );
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(null, { status: 204, headers });
}
