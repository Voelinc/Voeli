// Per-user daily quota counters, stored in Cloudflare KV.
//
// Three independent buckets so a chatty texter doesn't burn through the
// budget for someone else's voice notes:
//   translate  — full picker + quick path (covers /translate + /translate-quick)
//   voice      — voice notes (each one is ~20x more expensive than text)
//   grammar    — inline grammar suggestions (cheap but called constantly)
//
// KV is eventually consistent — a determined user could squeeze a couple
// extra calls past the limit during a race. That's acceptable for a beta.
// If you need atomic counters later, swap the implementation to a Durable
// Object — the public function shape stays the same.

import type { Env } from './types';

export type QuotaKind = 'translate' | 'voice' | 'grammar';

export class QuotaError extends Error {
  status = 429;
  retryAfterSeconds: number;
  used: number;
  limit: number;
  constructor(used: number, limit: number, retryAfterSeconds: number) {
    super(`Daily quota reached: ${used}/${limit}`);
    this.used = used;
    this.limit = limit;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function todayKey(): string {
  // YYYY-MM-DD in UTC. Quotas reset at 00:00 UTC for everyone — simple, no
  // timezone code, and a small bonus for users in the Americas who get a
  // fresh bucket in their evening.
  return new Date().toISOString().slice(0, 10);
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const tomorrow = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
}

function quotaLimit(env: Env, kind: QuotaKind): number {
  const raw =
    kind === 'translate'
      ? env.DAILY_TRANSLATE_QUOTA
      : kind === 'voice'
      ? env.DAILY_VOICE_QUOTA
      : env.DAILY_GRAMMAR_QUOTA;
  const n = parseInt(raw || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

function kvKey(uid: string, kind: QuotaKind): string {
  return `quota:${kind}:${uid}:${todayKey()}`;
}

// Read the current count for a user without incrementing. Useful for status
// endpoints or showing "X of Y left" in the UI later.
export async function readQuota(
  env: Env,
  uid: string,
  kind: QuotaKind
): Promise<{ used: number; limit: number }> {
  const key = kvKey(uid, kind);
  const used = parseInt((await env.QUOTA_KV.get(key)) || '0', 10);
  return { used, limit: quotaLimit(env, kind) };
}

// Increment the user's bucket and throw QuotaError if they're over the limit.
// Call this at the START of a request — before the OpenAI call — so the user
// is charged whether or not the call succeeds. If you'd prefer "only count
// successful calls" you'd need a refund path on the error route, but that
// also means a user can hammer the upstream when it's down.
export async function consumeQuota(
  env: Env,
  uid: string,
  kind: QuotaKind
): Promise<{ used: number; limit: number }> {
  const limit = quotaLimit(env, kind);
  const key = kvKey(uid, kind);
  const current = parseInt((await env.QUOTA_KV.get(key)) || '0', 10);
  if (current >= limit) {
    throw new QuotaError(current, limit, secondsUntilUtcMidnight());
  }
  const next = current + 1;
  // 48h TTL so the key naturally cleans itself up after the day rolls over.
  await env.QUOTA_KV.put(key, String(next), { expirationTtl: 60 * 60 * 48 });
  return { used: next, limit };
}
