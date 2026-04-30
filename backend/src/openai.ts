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
    '# ASPECT PARTICLES (when VI→EN): CRITICAL FOR TENSE/TIMING ACCURACY',
    '- đang = **present continuous**: "đang ăn" → "is eating" (NOT "eating")',
    '- đã...rồi / ...rồi = **past perfect**: "ăn rồi" → "already ate" or "have eaten" (NOT "ate already")',
    '- sắp = **near future**: "sắp đi" → "about to go" or "am going to go" (NOT "will go")',
    '- vừa...xong / ...xong = **just completed**: "vừa ăn xong" → "just finished eating" (NOT "just ate")',
    '- thường / hay = **habitual**: "thường ăn" → "usually eat" (preserve frequency, NOT just "eat")',
    '- có thể = **possibility/permission**: "có thể ăn được không?" → "can I eat?" or "is it okay to eat?" (NOT just "eat?")',
    '- phải = **obligation/truth**: "phải đi" → "have to go" or "must go" (NOT just "go")',
    '- Timing is NOT about adding words—it\'s about choosing the RIGHT English form. "Ăn" alone is ambiguous; particles remove ambiguity. Every translation MUST render the aspect correctly.',
    '',
    '# VIETNAMESE→ENGLISH BREVITY RULE (critical for avoiding over-elaboration):',
    'Vietnamese is terse: omits pronouns, relies on particles and context. English is explicit: requires pronouns, can over-elaborate if you\'re not careful.',
    'RULE: When translating FROM Vietnamese, preserve the SOURCE\'S BREVITY. Do NOT add emotional descriptors, elaboration, or framing that aren\'t in the source.',
    'CRITICAL — NO CLAUSE ADDITION: Even for emotionally intense messages, do NOT add clauses, meta-commentary, or elaborated explanations.',
    'Examples:',
    '- "Em xin lỗi" (4 syllables) → "I\'m sorry" (2 words), NOT "I really want to apologize"',
    '- "Anh/chị ơi, em có thể xin lỗi không?" (brief request) → "Can I apologize?" (3 words), NOT "I want to apologize—will you let me?" (elaborated plea)',
    '- "Tôi biết tôi sai" (5 words) → "I know I was wrong" (4 words), NOT "I understand my mistake and I deeply regret it"',
    '- "Tôi không thể cảm ơn anh/chị đủ" → "I can\'t thank you enough" (5 words), NOT "I can\'t thank you enough—it\'s not enough but it\'s all I can say" (elaborated with meta-commentary)',
    'If source is terse, translation should be terse. Maintain emotional tone WITHOUT adding words, clauses, or intensifiers.',
    'ESPECIALLY for gratitude/apology/emotional messages: Match source word count ±1-2 words only. Do not add "but", "because", "I feel", "it\'s not", or meta-commentary.',
    'SPECIFICITY MATCHING (UNIVERSAL RULE): Do NOT assume or invent context/details if the source doesn\'t specify them. Apply to ALL message types.',
    'Examples of what NOT to invent:',
    '- "Tôi muốn cảm ơn anh/chị" (want to thank you—NO object specified) → "I want to thank you", NOT "I want to thank you for what you\'ve done" (invented object)',
    '- "Cảm ơn" (thanks—general) → "Thank you", NOT "Thank you for your help" (unspecified help)',
    '- "Em xin cảm ơn vì tất cả" (thank you for everything) → "Thank you for everything" (KEEP "everything" since source specified it)',
    '- "Đó là quyết định đúng" (that is right decision—no subject) → "That\'s the right decision", NOT "You made the right choice" (invented subject/agent)',
    '- "Anh/chị không đơn độc" (you are not alone—no agents named) → "You\'re not alone", NOT "You have people who care" (invented supporters)',
    'RULE: Match the source\'s level of specificity across all contexts. Vague source = vague translation. Don\'t fill in details, subjects, objects, or context the speaker didn\'t provide.',
    'ESPECIALLY in encouragement/support: Don\'t add implied context like "people who care", "what you\'ve done", "your struggle"—keep the focus on what source actually said.',
    '',
    'EMOTIONAL VALENCE PRESERVATION: When translating, preserve the emotional tone through word choice. Do NOT shift tone by choosing words with different emotional weight.',
    'Examples:',
    '- "Thanks for your patience" → "Cảm ơn vì sự kiên nhẫn" (patience = patient, understanding), NOT "Cảm ơn vì đã chịu đựng em" (endure/tolerate = negative burden)',
    '- "I appreciate your kindness" → "Tôi cảm kích tính tốt bụng" (kindness = positive), NOT "Tôi biết ơn vì anh/chị chấp nhận tôi" (accept = implies fault)',
    'WORD CHOICE MATTERS: In gratitude contexts, prefer words with positive/warm valence. Avoid words suggesting burden, endurance, or obligation.',
    'Positive valence words: kiên nhẫn (patient), tốt bụng (kind), quý (treasure), hỗ trợ (support).',
    'Negative valence to avoid in gratitude: chịu đựng (endure), chấp nhận (accept/tolerate), buộc (forced).',
    '',
    '# ENGLISH TENSE → VIETNAMESE PARTICLES (when EN→VI): MAP ENGLISH TENSES TO VIETNAMESE ASPECT PARTICLES',
    '- is/am/are + -ing (present continuous) → **đang**: "I am eating" → "Tôi đang ăn"',
    '- have/has + -ed (present perfect) → **đã...rồi**: "I have eaten" → "Tôi đã ăn rồi"',
    '- am/is/are about to / am going to (near future) → **sắp**: "I am about to go" → "Tôi sắp đi"',
    '- just + -ed (recent completion) → **vừa...xong**: "I just ate" → "Tôi vừa ăn xong"',
    '- usually/often/always + verb (habitual) → **thường**: "I usually eat" → "Tôi thường ăn"',
    '- can/may/might (possibility) → **có thể**: "I can eat" → "Tôi có thể ăn"',
    '- must/have to/should (obligation) → **phải**: "I must go" → "Tôi phải đi"',
    '- will + verb (simple future) → **sẽ** or context-dependent particles: "I will go" → "Tôi sẽ đi" or "Tôi đi" (if certain/imminent)',
    '- Base verb alone (simple present/habitual/statement of fact) → **no particle** unless context suggests otherwise: "I eat" → "Tôi ăn"',
    '- NOTE: English tenses can be ambiguous (e.g., "I go to work" = habitual OR imminent). Use context/punctuation/tone to choose the right Vietnamese particle.',
    '',
    '# THIRD-PARTY RULE: speaker↔listener pronoun pair STAYS LOCKED. Third parties get their own kinship/name terms (my older sister=chị gái, my mom=mẹ, my boss=sếp+name). Never let a third-party mention change the main pair.',
    '',
    '# KINSHIP AMBIGUITY: VN kinship terms (chị, anh, em, cô, chú, bác) also address non-relatives respectfully. VI→EN: "chị Lan" defaults to "Lan" (respected older woman), NOT "my sister Lan", unless blood cue ("chị gái tôi"). EN→VI: "my sister" defaults to blood reading but flag kinship warning. Always flag ambiguous cases.',
    '',
    `# FACE-THREATENING: "you're lying/crazy/stupid", "shut up", "I hate you" (when playful), sarcasm — land as REAL insults in VN. If tone is warm/teasing, rewrite with softeners (nha, nhé) or hedges. ALWAYS flag as "face_threat".`,
    '',
    `# IDIOMS: Always flag. Examples: "I'm dying", "break a leg", "spill the tea", "kill it", "hit me up". Provide literalMeaning, likelyMeaning, and natural rewrite.`,
    '',
    srcIsVietnamese
      ? `# AMBIGUOUS VIETNAMESE VERBS (context determines meaning):
  - "được": (1) permission/ability "được không?" = "can I?", (2) obtained "được bạn giúp" = "got help from friend", (3) suitable "cái này được" = "this is nice". Choose based on: is it a question? is there an object? is it evaluative?
  - "để": (1) let/allow "để tôi làm" = "let me do it", (2) put/place "để ở đâu?" = "where to put?", (3) defer "để sau" = "leave for later". Choose based on: is there an imperative? does it reference location? does it reference time?
  - "tới": (1) arrive "tôi tới nhà" = "I arrive home", (2) reach/amount "tiền tới 1M" = "money reaches 1M", (3) by/until "tới lúc này" = "by this time". Choose based on: is it about movement? numbers? time?
  Use context, previous message topic, and sentence structure to disambiguate. When in doubt, pick the meaning that fits the conversation flow.`
      : '',
    '',
    '# STEPS',
    isText
      ? `1) Echo the input verbatim as "transcript". Read for EMOTION using punctuation, caps, elongation, emoji, repetition, hedges. Most messages are neutral — don't over-read signals, but don't miss clear ones.`
      : `1) Transcribe in ${src}. Read EMOTION from pitch, pace, warmth, sharpness, hesitation — not just words.`,
    `2) Pick ONE emotion: warm · playful · curious · neutral · direct · urgent · cold · irritated · angry · formal · affectionate · sarcastic. IMPORTANT — treat "lol", "haha", "lmao", "hihi", "hehe" and similar laugh markers as SOFTENERS, not emotion classifiers. They reduce intensity but do not define it.`,
    '3) Pick category: request|opinion|agreement|invitation|apology|instruction|other.',
    '',
    '# MULTI-EMOTIONAL MESSAGES (especially family/kinship, apologies with pushback, boundaries with care):',
    'If the message contains TWO EMOTIONS that must coexist (NOT sequential), include a BALANCED OPTION.',
    'Examples: "I love you AND I need a boundary" (not OR), "I\'m sorry AND I\'m standing firm" (not OR), "I respect you AND I disagree" (not OR).',
    'For these cases, create ONE option that explicitly balances both emotions:',
    '- Instead of just "Loving" and "Firm", also offer: "Loving yet firm" or "With love and respect for myself" (EN→VI especially)',
    '- Instead of just "Apologetic" and "Honest", also offer: "Apologizing while standing my ground" or "Sorry AND here\'s my truth"',
    '- In Vietnamese, use natural constructions with "nhưng" (but), particles, and pronouns that express both (e.g., "em yêu mẹ nhưng em cần...")',
    'This balanced option replaces a less meaningful variation if needed. Include it ONLY if the message genuinely requires both emotions.',
    '',
    '# OPTION GENERATION CONSTRAINT (prevent false emotional invention):',
    'ASSESS THE SOURCE FOR EMOTIONAL SIGNALS:',
    '- STRONG signals: exclamation marks, caps, emoji, repetition, curse words, contrasts (but/though/however), passionate language.',
    '- NEUTRAL signals: straightforward statement, no punctuation variance, no emoji, formal/informational tone, meta-statements like "we need to talk".',
    'GENERATION RULE:',
    '- If STRONG emotional signal detected: Generate 2–4 options with emotional variations around the detected emotion.',
    '- If NEUTRAL/AMBIGUOUS: Generate 1–2 straightforward options ONLY. Do NOT invent emotional layers not present in the source. "We need a serious conversation" is just formal/serious—do NOT add concern/worry unless the source signals it.',
    'KEY: Avoid hallucinating emotions. If the source is neutral, neutral options are correct.',
    '',
    `4) Produce options in ${tgt}. Follow the option generation constraint above (1-2 for neutral, 2-4 for emotional). Only include an option if it is genuinely plausible given the message's tone, emoji, and context — do NOT pad to reach a target count. All options must be distinct emotions. ONE must equal detectedEmotion (your recommendation). Vary vocabulary/rhythm, not just polite-adjectives. If ${tgt}=Vietnamese, match pronouns/softeners/particles to the EMOTION of each option (angry=tao/mày or drop ạ; affectionate=anh/em+nha; formal=full dạ…ạ). EMOJI RULE: if the source message contained NO emoji, do NOT add emoji to any translation option. Only include emoji in a translation if the source itself used emoji. GRAMMAR RULE: Always preserve all grammatically necessary words, especially prepositions (to, at, in, for, with, by, etc.). After translating, verify each option reads completely and naturally — no missing words that would change meaning. When translating FROM Vietnamese, pay special attention to implied prepositions that must be made explicit in English.`,
    srcIsVietnamese
      ? '5) SOURCE is Vietnamese — populate "sourceDecoding" with actual pronouns/softeners/particles extracted from transcript + a 1-2 sentence relationshipSignal.'
      : '5) SOURCE is English — set "sourceDecoding" to null.',
    '6) recommendedOption = detectedEmotion.',
    '',
    '============================================================',
    '# CRITICAL: EXPLANATION LANGUAGE',
    '============================================================',
    `Generate backTranslation and howItLands in BOTH English AND Vietnamese.`,
    `The listener will receive the language that matches their setting.`,
    `Always provide both { "en": "<English explanation>", "vi": "<Vietnamese explanation>" } for these fields.`,
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
    `      "backTranslation": { "en": "<English explanation>", "vi": "<Vietnamese explanation>" },`,
    tgtIsVietnamese
      ? '      "breakdown": { "pronouns":[{"word":"<vi>","meaning":"<EN>"}], "softeners":[...], "particles":[...] },'
      : '      "breakdown": null,',
    `      "howItLands": { "en": "<English explanation>", "vi": "<Vietnamese explanation>" },`,
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
    `- BILINGUAL FIELDS (CRITICAL): For fields with {en, vi} structure (detectedTone, toneSignals, recommendationReason, culturalWarnings.literalMeaning/likelyMeaning/whyRisky), ALWAYS generate BOTH English and Vietnamese versions. Exception: backTranslation and howItLands are SINGLE-LANGUAGE STRINGS in ${reasoningLang} ONLY — do NOT create {en, vi} objects for these.`,
    `- Every translation MUST be grammatically complete. All prepositions, articles, and function words required for natural speech must be present. Double-check each option before returning.`,
    `- ${srcIsVietnamese ? 'ASPECT PARTICLES: If source contains đang/rồi/sắp/xong/thường/có thể/phải, ensure target English uses correct tense/continuous form (present continuous, past perfect, near future, etc.). Do NOT lose aspect information in translation.' : ''}`,
    `- ${srcIsVietnamese ? '' : 'TENSE MAPPING: If source contains present continuous (is/am/are -ing), perfect (have/has -ed), or future forms (will/about to), map to correct Vietnamese particles (đang, đã...rồi, sắp, vừa...xong, etc.). Do NOT lose temporal information in translation.'}`,
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

// Check Vietnamese source for patterns that need prepositions in English translations
function needsPrepositionCheck(vietnameseText: string, englishTranslation: string): { needs: boolean; suggestedPreposition?: string; context?: string } {
  const vn = vietnameseText.toLowerCase().trim();
  const en = englishTranslation.toLowerCase().trim();

  // Pattern: "điều chỉnh [someone]" should be "adjust TO [someone]"
  if ((vn.includes('điều chỉnh') || vn.includes('adjust')) && /\badjust\s+\w+\b/.test(en)) {
    if (!en.includes('adjust to') && !en.includes('adjust for')) {
      return { needs: true, suggestedPreposition: 'to', context: 'adjust' };
    }
  }

  // Pattern: "nói với" / "talk to/with"
  if (vn.includes('nói với') && /\btalk\s+(?!to|with)\w+/.test(en)) {
    if (!en.includes('talk to') && !en.includes('talk with')) {
      return { needs: true, suggestedPreposition: 'to', context: 'talk' };
    }
  }

  // Pattern: "nghe [object]" should be "listen to [object]"
  if ((vn.includes('nghe') || vn.includes('listen')) && /\blisten\s+(?!to)\w+/.test(en)) {
    if (!en.includes('listen to')) {
      return { needs: true, suggestedPreposition: 'to', context: 'listen' };
    }
  }

  // Pattern: "nhìn [object]" should be "look at [object]"
  if ((vn.includes('nhìn') || vn.includes('look')) && /\blook\s+(?!at)\w+/.test(en)) {
    if (!en.includes('look at')) {
      return { needs: true, suggestedPreposition: 'at', context: 'look' };
    }
  }

  return { needs: false };
}

// Apply preposition fixes to translation options if needed
function fixMissingPrepositions(result: Record<string, unknown>, vietnameseText: string): Record<string, unknown> {
  const options = result.options as Array<Record<string, unknown>>;
  if (!Array.isArray(options)) return result;

  return {
    ...result,
    options: options.map((option) => {
      const translation = option.translation as string;
      if (!translation) return option;

      const check = needsPrepositionCheck(vietnameseText, translation);
      if (!check.needs || !check.suggestedPreposition) return option;

      // Attempt to add the preposition in the right place
      let fixed = translation;
      const patterns: Record<string, RegExp> = {
        adjust: /\b(adjust)\s+(\w+)/i,
        talk: /\b(talk)\s+(\w+)/i,
        listen: /\b(listen)\s+(\w+)/i,
        look: /\b(look)\s+(\w+)/i,
      };

      const pattern = patterns[check.context || ''];
      if (pattern) {
        fixed = translation.replace(pattern, `$1 ${check.suggestedPreposition} $2`);
      }

      return {
        ...option,
        translation: fixed,
        _prepositionFixed: true, // internal flag to track that we fixed this
      };
    }),
  };
}

// Check Vietnamese source for aspect particles and verify English handles them correctly
function detectAspectParticles(vietnameseText: string): { particles: string[]; aspectType?: string; expectedForm?: string } {
  const vn = vietnameseText.toLowerCase();
  const particles: string[] = [];

  // Check for aspect particles
  if (/\bđang\b/.test(vn)) {
    particles.push('đang');
  }
  if (/\b(đã|rồi)\b/.test(vn) || /rồi\b/.test(vn)) {
    particles.push('rồi/đã');
  }
  if (/\bsắp\b/.test(vn)) {
    particles.push('sắp');
  }
  if (/\b(vừa|xong)\b/.test(vn) || /xong\b/.test(vn)) {
    particles.push('xong/vừa');
  }
  if (/\b(thường|hay)\b/.test(vn)) {
    particles.push('thường');
  }
  if (/\bcó thể\b/.test(vn)) {
    particles.push('có thể');
  }
  if (/\bphải\b/.test(vn)) {
    particles.push('phải');
  }

  // Determine expected tense form
  let aspectType: string | undefined;
  let expectedForm: string | undefined;

  if (particles.includes('đang')) {
    aspectType = 'present_continuous';
    expectedForm = 'is/am/are + -ing';
  } else if (particles.includes('rồi/đã')) {
    aspectType = 'past_perfect';
    expectedForm = 'have/has + -ed or already + past';
  } else if (particles.includes('sắp')) {
    aspectType = 'near_future';
    expectedForm = 'about to / am going to';
  } else if (particles.includes('xong/vừa')) {
    aspectType = 'just_completed';
    expectedForm = 'just + past participle';
  } else if (particles.includes('thường')) {
    aspectType = 'habitual';
    expectedForm = 'usually + present';
  }

  return { particles, aspectType, expectedForm };
}

// Verify aspect particles are properly translated
function fixAspectParticles(result: Record<string, unknown>, vietnameseText: string): Record<string, unknown> {
  const aspectInfo = detectAspectParticles(vietnameseText);
  if (aspectInfo.particles.length === 0) return result; // No aspect particles to check

  const options = result.options as Array<Record<string, unknown>>;
  if (!Array.isArray(options)) return result;

  return {
    ...result,
    options: options.map((option) => {
      const translation = option.translation as string;
      if (!translation) return option;

      const en = translation.toLowerCase();
      let issues: string[] = [];

      // Check if expected aspect is present
      if (aspectInfo.aspectType === 'present_continuous') {
        if (!/(is|am|are)\s+\w+ing\b/.test(en)) {
          issues.push('Missing "is/am/are + -ing" for đang (ongoing action)');
        }
      } else if (aspectInfo.aspectType === 'past_perfect') {
        if (!/(have|has|already)\b/.test(en) && !/ed\b/.test(en)) {
          issues.push('Missing past perfect form for rồi (already happened)');
        }
      } else if (aspectInfo.aspectType === 'near_future') {
        if (!/about to|going to|about to|will/.test(en)) {
          issues.push('Missing future form for sắp (about to happen)');
        }
      } else if (aspectInfo.aspectType === 'just_completed') {
        if (!/just\b/.test(en)) {
          issues.push('Missing "just" for xong (just finished)');
        }
      } else if (aspectInfo.aspectType === 'habitual') {
        if (!/usually|often|regularly/.test(en)) {
          issues.push('Missing frequency marker for thường (habitual)');
        }
      }

      // Flag if we detected issues (but don't auto-fix complex aspect issues)
      if (issues.length > 0) {
        return {
          ...option,
          _aspectWarning: issues.join('; '),
        };
      }

      return option;
    }),
  };
}

// Check English source for tense forms and verify Vietnamese handles them correctly
function detectEnglishTenses(englishText: string): { tenses: string[]; tenseType?: string; expectedParticles?: string[] } {
  const en = englishText.toLowerCase();
  const tenses: string[] = [];

  // Check for tense patterns
  if (/(is|am|are)\s+\w+ing\b/.test(en)) {
    tenses.push('present_continuous');
  }
  if (/(have|has)\s+\w+ed\b|have\s+\w+n\b/.test(en)) {
    tenses.push('present_perfect');
  }
  if (/about\s+to\b|am\s+going\s+to\b|is\s+going\s+to\b|are\s+going\s+to\b/.test(en)) {
    tenses.push('near_future');
  }
  if (/just\s+\w+ed\b|just\s+\w+n\b/.test(en)) {
    tenses.push('just_completed');
  }
  if (/\b(usually|often|always|regularly|seldom|rarely)\b/.test(en)) {
    tenses.push('habitual');
  }
  if (/\b(can|may|might|could)\b/.test(en)) {
    tenses.push('possibility');
  }
  if (/\b(must|have\s+to|should|ought\s+to)\b/.test(en)) {
    tenses.push('obligation');
  }
  if (/\bwill\s+\w+\b/.test(en)) {
    tenses.push('simple_future');
  }

  // Determine expected Vietnamese particles
  let tenseType: string | undefined;
  let expectedParticles: string[] | undefined;

  if (tenses.includes('present_continuous')) {
    tenseType = 'present_continuous';
    expectedParticles = ['đang'];
  } else if (tenses.includes('present_perfect')) {
    tenseType = 'present_perfect';
    expectedParticles = ['đã', 'rồi'];
  } else if (tenses.includes('near_future')) {
    tenseType = 'near_future';
    expectedParticles = ['sắp'];
  } else if (tenses.includes('just_completed')) {
    tenseType = 'just_completed';
    expectedParticles = ['vừa', 'xong'];
  } else if (tenses.includes('habitual')) {
    tenseType = 'habitual';
    expectedParticles = ['thường', 'hay'];
  }

  return { tenses, tenseType, expectedParticles };
}

// Verify English tenses are properly translated to Vietnamese particles
function fixEnglishTenses(result: Record<string, unknown>, englishText: string): Record<string, unknown> {
  const tenseInfo = detectEnglishTenses(englishText);
  if (tenseInfo.tenses.length === 0) return result; // No special tenses to check

  const options = result.options as Array<Record<string, unknown>>;
  if (!Array.isArray(options)) return result;

  return {
    ...result,
    options: options.map((option) => {
      const translation = option.translation as string;
      if (!translation) return option;

      const vn = translation.toLowerCase();
      let issues: string[] = [];

      // Check if expected particles are present
      if (tenseInfo.expectedParticles && tenseInfo.expectedParticles.length > 0) {
        const hasExpectedParticle = tenseInfo.expectedParticles.some((particle) => vn.includes(particle));

        if (!hasExpectedParticle) {
          issues.push(`Missing Vietnamese particle for English ${tenseInfo.tenseType} (expected: ${tenseInfo.expectedParticles.join('/')})`);
        }
      }

      // Flag if we detected issues
      if (issues.length > 0) {
        return {
          ...option,
          _tenseWarning: issues.join('; '),
        };
      }

      return option;
    }),
  };
}

// Ensure bilingual fields (en/vi objects) have both versions.
// If vi is missing but en exists, use en as fallback for now.
// Also converts string fields to {en, vi} objects.
function ensureBilingualFields(result: Record<string, unknown>): Record<string, unknown> {
  const options = result.options as Array<Record<string, unknown>>;
  if (!Array.isArray(options)) return result;

  return {
    ...result,
    options: options.map((option) => {
      const fields = ['howItLands', 'backTranslation'];
      const updated: Record<string, unknown> = { ...option };

      for (const fieldName of fields) {
        const field = option[fieldName];
        if (!field) {
          continue;
        }

        // If it's a string, convert to {en, vi} object
        if (typeof field === 'string') {
          updated[fieldName] = { en: field, vi: field };
          continue;
        }

        // If it's an array or not an object, skip
        if (typeof field !== 'object' || Array.isArray(field)) {
          continue;
        }

        const bilingual = field as Record<string, unknown>;
        // Ensure both en and vi exist; if vi is missing, fallback to en
        if (!bilingual.vi && bilingual.en) {
          bilingual.vi = bilingual.en;
        }
        if (!bilingual.en && bilingual.vi) {
          bilingual.en = bilingual.vi;
        }

        updated[fieldName] = bilingual;
      }

      return updated;
    }),
  };
}

// Select user's language from bilingual fields for backTranslation and howItLands
function selectUserLanguage(result: Record<string, unknown>, uiLang: 'en' | 'vi'): Record<string, unknown> {
  const options = result.options as Array<Record<string, unknown>>;
  if (!Array.isArray(options)) return result;

  return {
    ...result,
    options: options.map((option) => {
      const fields = ['howItLands', 'backTranslation'];
      const updated: Record<string, unknown> = { ...option };

      for (const fieldName of fields) {
        const field = option[fieldName];
        if (!field || typeof field !== 'object' || Array.isArray(field)) {
          continue;
        }

        const bilingual = field as Record<string, string>;
        // Select the user's language, fallback to the other if not available
        const selectedLang = uiLang === 'vi' ? bilingual.vi || bilingual.en : bilingual.en || bilingual.vi;
        updated[fieldName] = selectedLang;
      }

      return updated;
    }),
  };
}

// Emotion semantic groups — emotions that express the same vibe
const EMOTION_GROUPS: Record<string, string[]> = {
  'PLAYFUL': ['playful', 'joking', 'teasing', 'light-hearted', 'witty', 'humorous', 'funny', 'sarcastic'],
  'SINCERE': ['sincere', 'genuine', 'honest', 'vulnerable', 'authentic', 'real', 'open'],
  'FORMAL': ['formal', 'professional', 'direct', 'straightforward', 'factual', 'observational'],
  'WARM': ['warm', 'affectionate', 'loving', 'caring', 'kind', 'gentle', 'sweet', 'tender'],
  'ASSERTIVE': ['assertive', 'confident', 'bold', 'strong', 'firm', 'decisive', 'commanding'],
  'APOLOGETIC': ['apologetic', 'remorseful', 'regretful', 'sorry', 'guilty', 'ashamed', 'contrite'],
  'CONCERNED': ['concerned', 'worried', 'anxious', 'nervous', 'insecure', 'uncertain', 'fearful'],
  'GRATEFUL': ['grateful', 'thankful', 'appreciative', 'blessed'],
  'CRITICAL': ['critical', 'disappointed', 'frustrated', 'exasperated'],
  'REASSURING': ['reassuring', 'comforting', 'supportive', 'calming', 'encouraging'],
};

// Map an emotion label to its semantic group
function getEmotionGroup(emotion: string): string | null {
  const normalized = (emotion || '').toLowerCase().trim();
  if (!normalized) return null;

  for (const [group, emotions] of Object.entries(EMOTION_GROUPS)) {
    if (emotions.includes(normalized)) {
      return group;
    }
  }
  return null;
}

// Intensity modifiers that don't convey emotional flavor difference.
// These words only change strength, not the emotional stance itself.
const INTENSITY_WORDS = new Set([
  'very', 'really', 'so', 'much', 'quite', 'fairly', 'rather',
  'extremely', 'incredibly', 'absolutely', 'completely', 'totally',
  'utterly', 'entirely', 'just', 'simply', 'merely', 'only',
  'strongly', 'deeply', 'profoundly', 'intensely', 'seriously',
  'more', 'less', 'most', 'least', 'too', 'even',
]);

// Check if two translations differ ONLY by intensity words.
// If true, they express the same emotional stance at different intensity levels.
function differsOnlyByIntensity(textA: string, textB: string): boolean {
  const aWords = textA.toLowerCase().split(/\s+/);
  const bWords = textB.toLowerCase().split(/\s+/);

  // If same length, check position-by-position
  if (aWords.length === bWords.length) {
    let hasAnyDifference = false;
    for (let i = 0; i < aWords.length; i++) {
      if (aWords[i] !== bWords[i]) {
        hasAnyDifference = true;
        // Difference must be an intensity word
        if (!INTENSITY_WORDS.has(aWords[i]) && !INTENSITY_WORDS.has(bWords[i])) {
          return false; // Non-intensity difference found
        }
      }
    }
    return hasAnyDifference; // True if all differences were intensity words
  }

  // Different lengths: strip intensity words and compare cores
  const aCore = aWords.filter(w => !INTENSITY_WORDS.has(w));
  const bCore = bWords.filter(w => !INTENSITY_WORDS.has(w));

  if (aCore.length === bCore.length && aCore.length > 0) {
    return aCore.every((w, i) => w === bCore[i]);
  }

  return false;
}

// Filter options to keep only meaningfully different ones.
// Uses two-layer approach for same-emotion-group options:
// Layer 1: If 90%+ similar, check Layer 2
// Layer 2: If differing ONLY by intensity words, filter out as duplicate
// Otherwise: Apply original thresholds for different emotions
function filterOptionsForMeaningfulDifferences(result: Record<string, unknown>): Record<string, unknown> {
  const options = result.options as Array<Record<string, unknown>>;
  if (!Array.isArray(options) || options.length <= 1) return result;

  // Simple word-overlap similarity score (0-1, where 1 = identical)
  function textSimilarity(a: string, b: string): number {
    const aWords = a.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const bWords = b.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (aWords.length === 0 || bWords.length === 0) return 0;

    const aSet = new Set(aWords);
    const bSet = new Set(bWords);
    const overlap = [...aSet].filter(w => bSet.has(w)).length;
    const union = aSet.size + bSet.size - overlap;
    return union > 0 ? overlap / union : 0;
  }

  const kept: Array<Record<string, unknown>> = [];

  for (const option of options) {
    const translation = option.translation as string;
    const emotion = (option.emotion || '').toLowerCase();
    if (!translation) continue;

    // Check if this option is too similar to any already-kept option
    const isDuplicate = kept.some(keptOption => {
      const keptTranslation = keptOption.translation as string;
      const keptEmotion = (keptOption.emotion || '').toLowerCase();

      const similarity = textSimilarity(translation, keptTranslation);

      // Get emotion groups for both options
      const emotionGroup = getEmotionGroup(emotion);
      const keptEmotionGroup = getEmotionGroup(keptEmotion);

      // Same emotion group (or both unclassified)
      if (emotionGroup === keptEmotionGroup) {
        // Layer 1: If 85%+ similar, apply intensity check (Layer 2)
        if (similarity > 0.85) {
          // Layer 2: Check if difference is ONLY intensity words
          if (differsOnlyByIntensity(translation, keptTranslation)) {
            return true; // Filter out as intensity-only duplicate
          }
          // If there's real content difference, keep it despite high similarity
        }
        // Otherwise use original same-emotion threshold (75%)
        return similarity > 0.75;
      }

      // Different emotion groups (both are classified)
      // Use lenient threshold: 80% similarity removes duplicate
      // Allows different emotions to survive at lower similarity
      if (emotionGroup && keptEmotionGroup) {
        return similarity > 0.80;
      }

      // One or both emotions unclassified (unknown emotion)
      // Use very strict threshold: 85% similarity removes duplicate
      // Only remove if nearly identical, safe fallback for unknown emotions
      return similarity > 0.85;
    });

    if (!isDuplicate) {
      kept.push(option);
    }
  }

  // Always keep at least one option (the first or best one)
  return {
    ...result,
    options: kept.length > 0 ? kept : [options[0]],
  };
}

// PICKER PATH — full 4-option translation with optional streaming.
export async function handleTranslate(
  payload: TranslatePayload,
  env: Env
): Promise<Response> {
  const uiLang = payload.uiLang || 'en';
  console.log('[DEBUG] handleTranslate received:', { text: payload.text?.substring(0, 50), direction: payload.direction, payloadUiLang: payload.uiLang, calculatedUiLang: uiLang });
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

  // Post-process for both directions
  const [src, tgt] = langPair(payload.direction);
  let result = json;

  // Ensure bilingual fields (howItLands, backTranslation) have both en and vi versions
  result = ensureBilingualFields(result);

  // Select the correct language for the user (Vietnamese speakers get Vietnamese explanations, English speakers get English)
  result = selectUserLanguage(result, uiLang);

  // Vietnamese → English: fix prepositions and aspect particles
  if (src === 'Vietnamese') {
    result = fixMissingPrepositions(result, payload.text);
    result = fixAspectParticles(result, payload.text);
  }

  // English → Vietnamese: verify tense mapping to particles
  if (src === 'English' && tgt === 'Vietnamese') {
    result = fixEnglishTenses(result, payload.text);
  }

  // Filter options to remove near-duplicates — keep only meaningfully different options
  result = filterOptionsForMeaningfulDifferences(result);

  return Response.json(result);
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

  // Post-process for both directions
  const [src, tgt] = langPair(payload.direction);
  let result = json;

  // Vietnamese → English: fix prepositions and aspect particles
  if (src === 'Vietnamese' && json.transcript) {
    result = fixMissingPrepositions(result, json.transcript);
    result = fixAspectParticles(result, json.transcript);
  }

  // English → Vietnamese: verify tense mapping to particles
  if (src === 'English' && tgt === 'Vietnamese' && json.transcript) {
    result = fixEnglishTenses(result, json.transcript);
  }

  // Filter options to remove near-duplicates — keep only meaningfully different options
  result = filterOptionsForMeaningfulDifferences(result);

  return Response.json(result);
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
