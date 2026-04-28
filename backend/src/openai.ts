// Server-side construction of the system prompts and the actual fetch to
// OpenAI. The client sends pre-built `promptExtensions` (slang notes, contact
// profile summary, etc.) — we hold the base template + relationship table.

import type {
  Env,
  TranslatePayload,
  QuickTranslatePayload,
  VoiceTranslatePayload,
  GrammarPayload,
} from './types';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Mirrors RELATIONSHIP_HINTS from the original HTML. Kept here on the server
// so the prompt is consistent regardless of which client version connects.
const RELATIONSHIP_HINTS: Record<string, string> = {
  formal: 'Stranger/formal: tôi for self, neutral anh/chị/cô/chú for other. Use ạ; rare warmth.',
  elder: 'Elder (parent/grandparent): con for self, bác/cô/chú for other. Use dạ+ạ. Softeners: xin, được không. No tôi, no imperatives.',
  senior: 'Older peer: em for self, anh/chị for other. Use ạ or nha/nhé. Frame requests with giúp.',
  friend: "Same-age friend: tớ/cậu or tao/mày (very close). Use nha/nhé/đi for warmth, thôi to soften.",
  partner: "Romantic: anh/em or mình. Particles nha/nhé. Pet-names with ơi.",
  junior: 'Younger/junior: anh/chị for self, em for other. Use nha/nhé (warm) or be direct.',
};

function relHint(relKey: string): string {
  return RELATIONSHIP_HINTS[relKey] || RELATIONSHIP_HINTS.formal;
}

function langPair(direction: 'en-vi' | 'vi-en'): [string, string] {
  return direction === 'en-vi' ? ['English', 'Vietnamese'] : ['Vietnamese', 'English'];
}

// Build the big picker-mode system prompt. This is intentionally a near-verbatim
// port of the prompt in the original callOpenAI — every section earns its keep
// (VN grammar, kinship trap, face-threat, idioms, schema). Keep it readable
// rather than DRY; this is the single most quality-critical string in the app.
function buildPickerSystemPrompt(
  payload: TranslatePayload,
  isText: boolean,
  uiLang: 'en' | 'vi'
): string {
  const [src, tgt] = langPair(payload.direction);
  const tgtIsVietnamese = tgt === 'Vietnamese';
  const srcIsVietnamese = src === 'Vietnamese';
  const reasoningLang = uiLang === 'vi' ? 'Vietnamese' : 'English';
  const r = payload.relationship;

  const lines: string[] = [
    `You translate ${src} → ${tgt} for a live two-person chat. Your job is to preserve EMOTION and SOCIAL REGISTER, not produce word-for-word accuracy. The same sentence reads differently by tone; capture intent.`,
    '',
    isText
      ? `INPUT: TYPED text in ${src} (the text IS the transcript — preserve punctuation, caps, emoji exactly).`
      : `INPUT: voice message in ${src}.`,
    `Relationship: "${r}". Guidance: ${relHint(r)}`,
    '',
    '# VIETNAMESE GRAMMAR (when VN is involved) — three slots encode feeling:',
    '1) PRONOUN PAIR (I/you): tôi=formal, con/bác-cô-chú=child→elder, em/anh-chị=junior→older peer, anh/em=male→younger female (romantic), chị/em=female→younger, mình=warm us, tớ/cậu=soft friends, tao/mày=very close OR anger.',
    '2) SOFTENERS (command→request): xin, nhờ, giúp, được không.',
    '3) FINAL PARTICLES: ạ=respect, nha/nhé=warm/friendly, đi=gentle push, vậy=casual, thôi="just"/soften, hả=incredulous, ơi=calling.',
    `"Dạ" opener = respect. Prefer cultural REFRAMING over literal (e.g., "I don't like this food" to an elder who cooked → "món này hơi lạ miệng con một chút" [unfamiliar palate], not "con không thích").`,
    '',
    '# THIRD-PARTY RULE: speaker↔listener pronoun pair STAYS LOCKED. Third parties get their own kinship/name terms (my older sister=chị gái, my mom=mẹ, my boss=sếp+name). Never let a third-party mention change the main pair.',
    '',
    '# KINSHIP AMBIGUITY: VN kinship terms (chị, anh, em, cô, chú, bác) also address non-relatives respectfully. VI→EN: "chị Lan" defaults to "Lan" (respected older woman), NOT "my sister Lan", unless blood cue ("chị gái tôi"). EN→VI: "my sister" defaults to blood reading but flag kinship warning. Always flag ambiguous cases.',
    '',
    `# FACE-THREATENING: "you're lying/crazy/stupid", "shut up", "I hate you" (when playful), sarcasm — land as REAL insults in VN. If tone is warm/teasing, rewrite with softeners (nha, nhé) or hedges. ALWAYS flag as "face_threat".`,
    '',
    `# IDIOMS: Always flag. Examples: "I'm dying", "break a leg", "spill the tea", "kill it", "hit me up". Provide literalMeaning, likelyMeaning, and natural rewrite.`,
    '',
    '# STEPS',
    isText
      ? `1) Echo the input verbatim as "transcript". Read for EMOTION using punctuation, caps, elongation, emoji, repetition, hedges. Most messages are neutral — don't over-read signals, but don't miss clear ones.`
      : `1) Transcribe in ${src}. Read EMOTION from pitch, pace, warmth, sharpness, hesitation — not just words.`,
    `2) Pick ONE emotion: warm · playful · curious · neutral · direct · urgent · cold · irritated · angry · formal · affectionate · sarcastic. IMPORTANT — treat "lol", "haha", "lmao", "hihi", "hehe" and similar laugh markers as SOFTENERS, not emotion classifiers. They reduce intensity but do not define it.`,
    '3) Pick category: request|opinion|agreement|invitation|apology|instruction|other.',
    `4) Produce 2–4 options in ${tgt}. Only include an option if it is genuinely plausible given the message's tone, emoji, and context — do NOT pad to reach 4. All options must be distinct emotions. ONE must equal detectedEmotion (your recommendation). Vary vocabulary/rhythm, not just polite-adjectives. If ${tgt}=Vietnamese, match pronouns/softeners/particles to the EMOTION of each option (angry=tao/mày or drop ạ; affectionate=anh/em+nha; formal=full dạ…ạ). EMOJI RULE: if the source message contained NO emoji, do NOT add emoji to any translation option. Only include emoji in a translation if the source itself used emoji.`,
    srcIsVietnamese
      ? '5) SOURCE is Vietnamese — populate "sourceDecoding" with actual pronouns/softeners/particles extracted from transcript + a 1-2 sentence relationshipSignal.'
      : '5) SOURCE is English — set "sourceDecoding" to null.',
    '6) recommendedOption = detectedEmotion.',
    '',
    '============================================================',
    '# OUTPUT JSON SCHEMA',
    '============================================================',
    'Return a single JSON object, exactly these top-level keys:',
    '',
    '{',
    `  "transcript": "<what was said, in ${src}>",`,
    '  "detectedEmotion": "<one of the 12 emotions>",',
    '  "detectedTone": { "en": "<one sentence in English>", "vi": "<same in Vietnamese>" },',
    isText
      ? '  "toneSignals": { "en": ["<text cue>", "..."], "vi": ["<same in Vietnamese>", "..."] },'
      : '  "toneSignals": { "en": ["<audio cue>", "..."], "vi": ["<same in Vietnamese>", "..."] },',
    '  "category": "request|opinion|agreement|invitation|apology|instruction|other",',
    '  "options": [',
    '    {',
    '      "emotion": "<one of the 12>",',
    `      "translation": "<natural ${tgt} sentence>",`,
    tgtIsVietnamese
      ? '      "literalFlow": "<very literal English gloss showing the machinery>",'
      : '      "literalFlow": null,',
    '      "backTranslation": "<clean natural English meaning of the option>",',
    tgtIsVietnamese
      ? '      "breakdown": { "pronouns":[{"word":"<vi>","meaning":"<EN>"}], "softeners":[...], "particles":[...] },'
      : '      "breakdown": null,',
    '      "howItLands": { "en": "<1 sentence>", "vi": "<same in Vietnamese>" }',
    '    }',
    '  ],',
    srcIsVietnamese
      ? '  "sourceDecoding": { "pronouns":[...], "softeners":[...], "particles":[...], "relationshipSignal": { "en":"...", "vi":"..." } },'
      : '  "sourceDecoding": null,',
    '  "culturalWarnings": [',
    '    {',
    '      "type": "kinship|face_threat|idiom|slang|other",',
    '      "term": "<problem phrase>",',
    '      "where": "source|target",',
    '      "literalMeaning": { "en":"...", "vi":"..." },',
    '      "likelyMeaning": { "en":"...", "vi":"..." },',
    '      "whyRisky": { "en":"...", "vi":"..." },',
    '      "suggestionKind": "clarify|rewrite",',
    '      "suggestion": "<ready-to-send text in listener\'s language>"',
    '    }',
    '  ],',
    '  "recommendedOption": "<emotion of the best-matching option — MUST equal detectedEmotion>",',
    '  "recommendationReason": { "en":"...", "vi":"..." },',
    '  "contextConfidence": <integer 0–100>',
    '}',
    '',
    'MUST:',
    `- Return VALID JSON only. No markdown, no commentary.`,
    `- ${tgtIsVietnamese ? 'Vietnamese: literalFlow + breakdown for each option.' : 'English: literalFlow=null, breakdown=null.'}`,
    `- ${srcIsVietnamese ? 'Populate sourceDecoding.' : 'sourceDecoding=null.'}`,
    `- culturalWarnings = array (empty if none).`,
  ];

  let prompt = lines.join('\n');
  if (payload.promptExtensions) prompt += payload.promptExtensions;
  return prompt;
}

function buildQuickSystemPrompt(payload: QuickTranslatePayload): string {
  const [src, tgt] = langPair(payload.direction);
  const r = payload.relationship;
  const base = [
    `You are a fast cross-language translator, ${src} → ${tgt}.`,
    `The message below is being sent in a live chat, so translate QUICKLY and naturally — like a real person texting, not a dictionary.`,
    `Relationship between sender and receiver: "${r}". Guidance: ${relHint(r)}`,
    '',
    `Preserve the sender's register and any emoji they used. Do NOT add punctuation or emoji the sender did not use — if the source had no emoji, the translation must have no emoji.`,
    `If ${tgt} is Vietnamese, choose the correct pronoun pair, softeners, and any appropriate sentence-final particle based on the relationship. No explanations, no options.`,
    '',
    `Return STRICT JSON: { "translation": "<${tgt} text>" }. No markdown, no commentary.`,
  ].join('\n');
  return payload.slangHint
    ? `${base}\n\nNote: slang detected — translate the most likely intended meaning naturally. Full options will be shown separately.`
    : base;
}

function buildGrammarSystemPrompt(payload: GrammarPayload): string {
  const [src] = langPair(payload.direction);
  return [
    `You are a grammar/typo corrector for ${src}.`,
    `Given a short message, return EITHER the corrected version (if anything is meaningfully wrong) or the empty string (if it's already fine).`,
    `Be conservative — DO NOT rewrite for style or change tone. Fix typos, missing punctuation only when it changes meaning, capitalization at the start, and obvious grammar errors.`,
    `If the message is informal (lowercase, no period at end, casual abbreviations like "u", "ur", "lol"), LEAVE IT ALONE — those are intentional in chat.`,
    '',
    `Return STRICT JSON: { "corrected": "<full corrected text or empty string>" }. No markdown.`,
  ].join('\n');
}

interface OpenAIBody {
  model: string;
  // deno-lint-ignore no-explicit-any
  messages: any[];
  response_format?: { type: string };
  temperature?: number;
  stream?: boolean;
  modalities?: string[];
}

async function callOpenAI(
  body: OpenAIBody,
  apiKey: string
): Promise<Response> {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  return res;
}

// PICKER PATH — full 4-option translation with optional streaming.
export async function handleTranslate(
  payload: TranslatePayload,
  env: Env
): Promise<Response> {
  const uiLang = payload.uiLang || 'en';
  const systemPrompt = buildPickerSystemPrompt(payload, true, uiLang);
  const stream = !!payload.stream;

  const body: OpenAIBody = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.6,
    stream,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Here is my TYPED text message in ${langPair(payload.direction)[0]}. Process it exactly as instructed and return the JSON object.\n\nMESSAGE:\n"""\n${payload.text}\n"""`,
      },
    ],
  };

  const upstream = await callOpenAI(body, env.OPENAI_API_KEY);
  if (!upstream.ok) return forwardError(upstream);

  if (stream) {
    // Pass the SSE body through unchanged — the client consumes it the same
    // way it consumed OpenAI directly.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  const json = await upstream.json();
  return Response.json(json);
}

// QUICK PATH — single translation, no picker.
export async function handleQuick(
  payload: QuickTranslatePayload,
  env: Env
): Promise<Response> {
  const body: OpenAIBody = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.5,
    messages: [
      { role: 'system', content: buildQuickSystemPrompt(payload) },
      { role: 'user', content: payload.text },
    ],
  };
  const upstream = await callOpenAI(body, env.OPENAI_API_KEY);
  if (!upstream.ok) return forwardError(upstream);
  const json = await upstream.json();
  return Response.json(json);
}

// VOICE PATH — base64 WAV in, full picker JSON out.
export async function handleVoice(
  payload: VoiceTranslatePayload,
  env: Env
): Promise<Response> {
  const uiLang = payload.uiLang || 'en';
  const systemPrompt = buildPickerSystemPrompt(
    {
      text: '',
      direction: payload.direction,
      relationship: payload.relationship,
      uiLang,
      promptExtensions: payload.promptExtensions,
    },
    false,
    uiLang
  );
  const body: OpenAIBody = {
    model: 'gpt-4o-audio-preview',
    modalities: ['text'],
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here is my voice message. Process it as instructed.' },
          {
            type: 'input_audio',
            input_audio: { data: payload.base64Wav, format: 'wav' },
          },
        ],
      },
    ],
  };
  const upstream = await callOpenAI(body, env.OPENAI_API_KEY);
  if (!upstream.ok) return forwardError(upstream);
  const json = await upstream.json();
  return Response.json(json);
}

// GRAMMAR PATH — typo / grammar corrector.
export async function handleGrammar(
  payload: GrammarPayload,
  env: Env
): Promise<Response> {
  const body: OpenAIBody = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildGrammarSystemPrompt(payload) },
      { role: 'user', content: payload.text },
    ],
  };
  const upstream = await callOpenAI(body, env.OPENAI_API_KEY);
  if (!upstream.ok) return forwardError(upstream);
  const json = await upstream.json();
  return Response.json(json);
}

async function forwardError(upstream: Response): Promise<Response> {
  // Default for the rare case OpenAI returns an empty 4xx/5xx body.
  let errMsg = `OpenAI ${upstream.status} — empty response body`;
  let raw = '';
  try {
    raw = await upstream.text();
  } catch (e) {
    errMsg = `OpenAI ${upstream.status} — could not read body: ${(e as Error).message}`;
  }
  if (raw) {
    try {
      const ej = JSON.parse(raw) as { error?: { message?: string; code?: string; type?: string } };
      if (ej?.error?.message) {
        errMsg = `OpenAI ${upstream.status}: ${ej.error.message}`
          + (ej.error.type ? ` (type=${ej.error.type})` : '')
          + (ej.error.code ? ` (code=${ej.error.code})` : '');
      } else {
        errMsg = `OpenAI ${upstream.status}: ${raw.slice(0, 400)}`;
      }
    } catch {
      errMsg = `OpenAI ${upstream.status}: ${raw.slice(0, 400)}`;
    }
  }
  // Map upstream 401/403 to a 502 — it's not the user's fault, it's our key.
  // Pass 429 through so the client can retry. Everything else becomes a 502.
  const status = upstream.status === 429 ? 429 : 502;
  return Response.json({ error: errMsg }, { status });
}
