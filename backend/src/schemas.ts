// Runtime validation for every /api/* request body.
//
// Each public endpoint has a Zod schema below. Schemas are .strict() so
// unknown fields are rejected — that catches typos in the client and stops
// an attacker from smuggling extra context into a prompt by adding fields
// the server doesn't know about.
//
// parseBody() reads the JSON, runs safeParse, and returns a 400 with the
// list of validation issues on failure. Issue messages are deterministic
// (Zod's defaults) — we don't echo the raw input back, so a user can't
// reflect a payload off the API into someone else's response.
//
// sanitizeString() runs after schema validation and is applied to every
// user-controlled string in the payload. It strips control characters,
// trims whitespace, and normalizes Unicode to NFC. The point isn't to
// stop XSS (the frontend renders with .textContent) — it's to defeat
// homoglyph and zero-width-joiner tricks in pronouns/profile fields, and
// to keep the prompt assembly stable.

import { z, type ZodSchema } from 'zod';

// ---- Shared field schemas -------------------------------------------------

const direction = z.enum(['en-vi', 'vi-en']);
const relationship = z.enum([
  'formal',
  'elder',
  'senior',
  'friend',
  'partner',
  'junior',
]);
const uiLang = z.enum(['en', 'vi']);

const text4k = z.string().min(1).max(4000);
const promptExtensions = z.string().max(2000).optional();

const exposureCounts = z
  .record(z.string().min(1).max(64), z.number().int().min(0).max(9999))
  .refine((r) => Object.keys(r).length <= 100, {
    message: 'Too many keys (max 100)',
  })
  .optional();

const senderPronounSignal = z
  .object({
    selfPronoun: z.string().max(64).nullable(),
    otherPronoun: z.string().max(64).nullable(),
    source: z.enum(['override', 'derived']),
    relationship: z.string().max(64).nullable(),
  })
  .strict()
  .nullable()
  .optional();

// Lightweight identity payload. The display names come from the frontend
// (the sender already sees them — no privacy delta). The recipient UID is
// what the Worker uses to do a service-account lookup for gender + birth
// year; those are read server-side and used only to inform the prompt — they
// never make the round trip back to the client.
const senderIdentity = z
  .object({
    name: z.string().max(60).nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();
const recipientIdentity = z
  .object({
    uid: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/)
      .nullable()
      .optional(),
    name: z.string().max(60).nullable().optional(),
  })
  .strict()
  .nullable()
  .optional();

const contactPronounMemory = z
  .object({
    selfPronoun: z.string().max(64).nullable(),
    otherPronoun: z.string().max(64).nullable(),
    relationship: z.string().max(64).nullable(),
    formality: z.string().max(64).nullable().optional(),
    gender: z
      .object({
        speaker: z.string().max(32).nullable().optional(),
        other: z.string().max(32).nullable().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    confidence: z.number().min(0).max(1),
    capturedAt: z.number().int().min(0).optional(),
  })
  .strict()
  .nullable()
  .optional();

// ---- Endpoint schemas -----------------------------------------------------

export const TranslatePayloadSchema = z
  .object({
    text: text4k,
    direction,
    relationship,
    uiLang: uiLang.optional(),
    promptExtensions,
    culturalConceptCounts: exposureCounts,
    dishCounts: exposureCounts,
    contactPronounMemory,
    senderPronounSignal,
    sender: senderIdentity,
    recipient: recipientIdentity,
    stream: z.boolean().optional(),
  })
  .strict();

export const QuickTranslatePayloadSchema = z
  .object({
    text: text4k,
    direction,
    relationship,
    slangHint: z.boolean().optional(),
    uiLang: uiLang.optional(),
    promptExtensions,
    culturalConceptCounts: exposureCounts,
    dishCounts: exposureCounts,
    contactPronounMemory,
    senderPronounSignal,
    sender: senderIdentity,
    recipient: recipientIdentity,
  })
  .strict();

// base64Wav cap is in characters. 2.5M base64 ≈ 1.85 MB raw audio, comfortably
// covers a ~60s voice memo at typical mobile mic bitrates. Anything larger is
// almost certainly someone probing the OpenAI cost ceiling.
export const VoiceTranslatePayloadSchema = z
  .object({
    base64Wav: z.string().min(1).max(2_500_000),
    direction,
    relationship,
    uiLang: uiLang.optional(),
    promptExtensions,
    sender: senderIdentity,
    recipient: recipientIdentity,
  })
  .strict();

export const GrammarPayloadSchema = z
  .object({
    text: text4k,
    direction,
  })
  .strict();

// Mirrors the existing constants in index.ts so behaviour doesn't drift.
const MAX_BATCH = 200;
const MAX_TEXT_BYTES = 16 * 1024;
const MAX_BLOB_BYTES = 32 * 1024;

export const EncryptPayloadSchema = z
  .object({
    texts: z.array(z.string().min(1).max(MAX_TEXT_BYTES)).min(1).max(MAX_BATCH),
  })
  .strict();

export const DecryptPayloadSchema = z
  .object({
    blobs: z
      .array(
        z
          .object({
            v: z.literal(1),
            c: z.string().min(1).max(MAX_BLOB_BYTES),
          })
          .strict()
      )
      .min(1)
      .max(MAX_BATCH),
  })
  .strict();

// Tenor proxy — query string params, not a JSON body. Validated separately
// by parseSearchParams() below.
export const TenorSearchSchema = z
  .object({
    q: z.string().min(1).max(100),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    pos: z.string().max(100).optional(),
    media_filter: z.enum(['gif', 'tinygif', 'mp4']).optional(),
    searchfilter: z.enum(['sticker', 'static', 'high_quality']).optional(),
  })
  .strict();

export const TenorFeaturedSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    pos: z.string().max(100).optional(),
    media_filter: z.enum(['gif', 'tinygif', 'mp4']).optional(),
  })
  .strict();

// ---- Helpers --------------------------------------------------------------

export class ValidationError extends Error {
  status = 400;
  issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[]) {
    super('invalid_request');
    this.issues = issues;
  }
}

// Reads JSON, validates against schema, sanitizes strings recursively, and
// returns the typed payload. Throws ValidationError on any failure.
export async function parseBody<T>(
  schema: ZodSchema<T>,
  request: Request
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError([
      { path: '', message: 'Request body must be valid JSON' },
    ]);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      }))
    );
  }
  return sanitizeStrings(result.data) as T;
}

// Same idea as parseBody but for query-string params (Tenor proxy).
export function parseSearchParams<T>(
  schema: ZodSchema<T>,
  url: URL
): T {
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      }))
    );
  }
  return sanitizeStrings(result.data) as T;
}

// Strip control chars (except newline/return/tab), collapse leading/trailing
// whitespace, and Unicode-normalize. Walks objects + arrays in place.
// base64Wav is exempt — it's a fixed-alphabet string and we don't want to
// touch a single character of it.
const BASE64_FIELDS = new Set(['base64Wav', 'c']);

export function sanitizeString(s: string): string {
  // Drop ASCII control codes 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F.
  // Keep \t (0x09), \n (0x0A), \r (0x0D).
  // Drop the U+2028/U+2029 line separators (script-injection risk in some
  // contexts) and zero-width joiners that could hide content (U+200B-U+200D,
  // U+FEFF). Keep ZWJ inside what NFC normalization preserves for emoji.
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u2028\u2029\u200B\u200C\u200D\uFEFF]/g, '')
    .normalize('NFC')
    .trim();
}

function sanitizeStrings<T>(value: T, key: string = ''): T {
  if (typeof value === 'string') {
    if (BASE64_FIELDS.has(key)) return value;
    return sanitizeString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeStrings(v, key)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = sanitizeStrings(v, k);
    }
    return out as unknown as T;
  }
  return value;
}

// Build the 400 response for ValidationError. Caller sets CORS.
export function validationErrorResponse(err: ValidationError): Response {
  return Response.json(
    { error: 'invalid_request', issues: err.issues },
    { status: 400 }
  );
}
