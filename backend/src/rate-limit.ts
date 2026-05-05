// Per-endpoint rate limiting on top of the existing daily quota.
//
// Quota (in quota.ts) caps total daily spend. Rate limit caps the *speed* of
// requests, which is the lever that actually matters when an attacker is
// trying to drain the daily bucket in one burst, hold a connection open, or
// fan-out a flood.
//
// Each request is checked against TWO buckets:
//   - per-UID:   so a single signed-in user can't burst the endpoint
//   - per-IP:    so a network of throwaway accounts behind one address can't
//                aggregate-around the per-UID cap. Source IP is taken from
//                cf-connecting-ip (set by Cloudflare's edge — never trust
//                x-forwarded-for from the client).
//
// Window: rolling 60-second buckets keyed by the current UTC minute. If you
// fire 16 requests across a window-boundary you get 8+8, not 16+0 — the
// limit is "per minute" in the everyday sense, not "per any 60-second window."
// That's a conscious trade-off: KV is eventually consistent (same caveat as
// quota.ts), and a true sliding window would require a Durable Object. For
// a beta this is good enough; swap to DO if abuse patterns demand it.
//
// Limits live on the Env so they can be tuned without redeploying. See
// wrangler.toml for the defaults.

import type { Env } from './types';

export type RateLimitScope = 'user' | 'ip';

export class RateLimitError extends Error {
  status = 429;
  retryAfterSeconds: number;
  scope: RateLimitScope;
  constructor(scope: RateLimitScope, retryAfterSeconds: number) {
    super('rate_limited');
    this.scope = scope;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Each endpoint has a fallback (perUser, perIp) pair if its env var is missing
// or unparseable. Defaults match what the plan specifies.
const DEFAULTS: Record<string, { perUser: number; perIp: number }> = {
  'translate':       { perUser: 15, perIp: 30 },
  'translate-quick': { perUser: 15, perIp: 30 },
  'translate-voice': { perUser: 4,  perIp: 10 },
  'grammar':         { perUser: 40, perIp: 80 },
  'encrypt':         { perUser: 30, perIp: 60 },
  'decrypt':         { perUser: 30, perIp: 60 },
  'quota':           { perUser: 30, perIp: 60 },
  'tenor':           { perUser: 30, perIp: 60 },
  'health':          { perUser: 0,  perIp: 60 },
};

function envInt(env: Env, name: string, fallback: number): number {
  const raw = (env as unknown as Record<string, string | undefined>)[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function endpointLimits(env: Env, endpoint: string): { perUser: number; perIp: number } {
  const fallback = DEFAULTS[endpoint] || { perUser: 30, perIp: 60 };
  // Env var name shape: RL_TRANSLATE_PER_USER / RL_TRANSLATE_PER_IP
  const ep = endpoint.toUpperCase().replace(/-/g, '_');
  return {
    perUser: envInt(env, `RL_${ep}_PER_USER`, fallback.perUser),
    perIp:   envInt(env, `RL_${ep}_PER_IP`,   fallback.perIp),
  };
}

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function secondsUntilNextMinute(): number {
  return 60 - Math.floor((Date.now() % 60_000) / 1000);
}

function kvKey(scope: RateLimitScope, endpoint: string, id: string, minute: number): string {
  return `rl:${scope}:${endpoint}:${id}:${minute}`;
}

async function bumpAndCheck(
  env: Env,
  scope: RateLimitScope,
  endpoint: string,
  id: string,
  limit: number
): Promise<void> {
  if (limit <= 0) return;
  const minute = currentMinute();
  const key = kvKey(scope, endpoint, id, minute);
  const current = parseInt((await env.QUOTA_KV.get(key)) || '0', 10);
  if (current >= limit) {
    throw new RateLimitError(scope, secondsUntilNextMinute());
  }
  // TTL covers the current window plus a one-minute safety margin so
  // out-of-order writes can't resurrect a stale counter for the next window.
  await env.QUOTA_KV.put(key, String(current + 1), { expirationTtl: 120 });
}

// Extract the source IP from Cloudflare's trusted header. Falls back to a
// constant only-for-tests value if missing — that should never happen at the
// Cloudflare edge, but in `wrangler dev` and unit tests we don't get cf-*.
export function sourceIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') || '0.0.0.0';
}

// Main entry point. Pass uid=null for unauthenticated routes (only the IP
// bucket is checked). Throws RateLimitError if either bucket is over.
export async function enforceRateLimit(
  env: Env,
  endpoint: string,
  uid: string | null,
  ip: string
): Promise<void> {
  const { perUser, perIp } = endpointLimits(env, endpoint);
  // Order matters: check per-IP first so a burst from many UIDs on one IP
  // gets caught before any single UID's bucket is bumped.
  if (perIp > 0) await bumpAndCheck(env, 'ip', endpoint, ip, perIp);
  if (uid && perUser > 0) await bumpAndCheck(env, 'user', endpoint, uid, perUser);
}

export function rateLimitErrorResponse(err: RateLimitError): Response {
  return Response.json(
    {
      error: 'rate_limited',
      scope: err.scope,
      retryAfterSeconds: err.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { 'Retry-After': String(err.retryAfterSeconds) },
    }
  );
}
