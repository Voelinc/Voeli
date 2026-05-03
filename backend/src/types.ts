// Worker bindings declared in wrangler.toml. Anything you add here also needs
// to be added there (vars or kv_namespaces) for runtime to actually have it.
export interface Env {
  QUOTA_KV: KVNamespace;
  OPENAI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  DAILY_TRANSLATE_QUOTA: string;
  DAILY_VOICE_QUOTA: string;
  DAILY_GRAMMAR_QUOTA: string;
  SENTRY_DSN: string;
  // 32-byte AES-256 key, base64-encoded. Used by crypto.ts to encrypt message
  // content before it lands in Firebase, so an operator browsing the database
  // sees only ciphertext.
  MESSAGE_ENCRYPTION_KEY: string;
}

// What a verified Firebase user looks like once auth.ts has done its job.
export interface AuthedUser {
  uid: string;
  email: string | null;
}

// Body shape the frontend sends to /api/translate.
// Mirrors what the original callOpenAI assembled, minus the API key.
export interface TranslatePayload {
  text: string;
  direction: 'en-vi' | 'vi-en';
  relationship: 'formal' | 'elder' | 'senior' | 'friend' | 'partner' | 'junior';
  uiLang?: 'en' | 'vi';
  // Pre-computed prompt extensions the client already builds — slang notes,
  // contact profile, conversation pattern, pick preferences, pattern errors.
  // Sent as already-formatted strings so we don't have to recreate the
  // dictionaries on the server.
  promptExtensions?: string;
  // Per-user exposure counts for cultural concepts. When a count reaches the
  // concept's `learnAfter` threshold, the backend silently suppresses the
  // concept (no prompt injection, no culturalWarnings entry). Keyed by the
  // concept's canonical term (e.g., { "duyên": 3, "thương": 1 }).
  culturalConceptCounts?: Record<string, number>;
  // Per-user exposure counts for Vietnamese dish names. Same shape as
  // culturalConceptCounts. Iconic dishes (phở, bánh mì) have a low threshold;
  // regional dishes (mì quảng, cao lầu) have a higher threshold.
  dishCounts?: Record<string, number>;
  // Contact-level pronoun memory captured from prior VI→EN responses. When
  // set, the pronoun detector trusts this as canonical instead of running
  // the word-order heuristic — fixes the case where "Anh nịnh em thôi"
  // gets inverted to "I flatter you" when the contact actually means
  // "you flatter me." selfPronoun is what the contact uses for themselves;
  // otherPronoun is what they call the user.
  contactPronounMemory?: ContactPronounMemory;
  stream?: boolean;
}

export interface ContactPronounMemory {
  selfPronoun: string | null;
  otherPronoun: string | null;
  relationship: string | null;
  formality?: string | null;
  gender?: { speaker?: string | null; other?: string | null } | null;
  confidence: number;
  capturedAt?: number;
}

export interface QuickTranslatePayload {
  text: string;
  direction: 'en-vi' | 'vi-en';
  relationship: 'formal' | 'elder' | 'senior' | 'friend' | 'partner' | 'junior';
  slangHint?: boolean;
  // Optional fields that mirror TranslatePayload so the same detector chain
  // (pronoun, topic-comment, register, zero-subject, cultural concepts,
  // segmentation, classifiers, idioms, dish names) can run on the fast
  // compose path. The quick path uses these to inject prompt nudges and
  // populate culturalWarnings in the response.
  uiLang?: 'en' | 'vi';
  promptExtensions?: string;
  culturalConceptCounts?: Record<string, number>;
  dishCounts?: Record<string, number>;
  contactPronounMemory?: ContactPronounMemory;
}

export interface VoiceTranslatePayload {
  base64Wav: string;
  direction: 'en-vi' | 'vi-en';
  relationship: 'formal' | 'elder' | 'senior' | 'friend' | 'partner' | 'junior';
  uiLang?: 'en' | 'vi';
  promptExtensions?: string;
}

export interface GrammarPayload {
  text: string;
  direction: 'en-vi' | 'vi-en';
}
