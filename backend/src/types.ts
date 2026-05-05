// Worker bindings declared in wrangler.toml. Anything you add here also needs
// to be added there (vars or kv_namespaces) for runtime to actually have it.
export interface Env {
  QUOTA_KV: KVNamespace;
  OPENAI_API_KEY: string;
  FIREBASE_PROJECT_ID: string;
  // Numeric Firebase project number (distinct from project ID) — used as the
  // App Check audience claim. Find it in Firebase Console → Project Settings.
  FIREBASE_PROJECT_NUMBER: string;
  ALLOWED_ORIGINS: string;
  DAILY_TRANSLATE_QUOTA: string;
  DAILY_VOICE_QUOTA: string;
  DAILY_GRAMMAR_QUOTA: string;
  SENTRY_DSN: string;
  // 32-byte AES-256 key, base64-encoded. Used by crypto.ts to encrypt message
  // content before it lands in Firebase, so an operator browsing the database
  // sees only ciphertext.
  MESSAGE_ENCRYPTION_KEY: string;
  // Tenor GIF API key. Worker proxies tenor.googleapis.com so the key never
  // ships to the browser; see /api/tenor/search and /api/tenor/featured.
  TENOR_API_KEY: string;
  // App Check enforcement: "true" rejects requests without a valid App Check
  // token, anything else logs and allows. Set to "false" during the rollout
  // window so backend can ship before frontend integration is everywhere.
  APP_CHECK_ENFORCE: string;
  // Comma-separated list of debug tokens that bypass App Check verification —
  // for `wrangler dev` and developer browsers where reCAPTCHA Enterprise
  // can't run. Get these from Firebase Console → App Check → Apps → ⋮ → Manage debug tokens.
  APP_CHECK_DEBUG_TOKENS: string;
  // Per-endpoint rate limits (requests per minute). Each endpoint has a
  // _PER_USER and _PER_IP variant; both are checked. Defaults live in
  // rate-limit.ts and kick in if the env var is missing.
  RL_TRANSLATE_PER_USER?: string;
  RL_TRANSLATE_PER_IP?: string;
  RL_TRANSLATE_QUICK_PER_USER?: string;
  RL_TRANSLATE_QUICK_PER_IP?: string;
  RL_TRANSLATE_VOICE_PER_USER?: string;
  RL_TRANSLATE_VOICE_PER_IP?: string;
  RL_GRAMMAR_PER_USER?: string;
  RL_GRAMMAR_PER_IP?: string;
  RL_ENCRYPT_PER_USER?: string;
  RL_ENCRYPT_PER_IP?: string;
  RL_DECRYPT_PER_USER?: string;
  RL_DECRYPT_PER_IP?: string;
  RL_QUOTA_PER_USER?: string;
  RL_QUOTA_PER_IP?: string;
  RL_TENOR_PER_USER?: string;
  RL_TENOR_PER_IP?: string;
  RL_HEALTH_PER_IP?: string;
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
  // Highest-priority pronoun signal: derived from the user's gender +
  // contact relationship type (or per-contact partner override). The frontend
  // computes the speaker-perspective pair (inverted for vi-en where the
  // contact is the speaker), so the backend can lock direction without
  // running heuristics. Bypasses memory + ambiguousPair detection.
  senderPronounSignal?: SenderPronounSignal | null;
  stream?: boolean;
}

export interface SenderPronounSignal {
  selfPronoun: string | null;
  otherPronoun: string | null;
  // 'override' = explicit per-contact tap; 'derived' = gender + relationship.
  source: 'override' | 'derived';
  relationship: string | null;
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
  senderPronounSignal?: SenderPronounSignal | null;
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
