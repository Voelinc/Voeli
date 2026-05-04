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
import { rewriteSlang } from './slang-fix';
import { buildAmbiguityPromptEnhancement, filterOptionsByConfidence } from './vietnamese-ambiguity-detector';
import { detectColloquialTerms } from './vietnamese-colloquial-terms';
import {
  detectPronounSignals,
  buildPronounContextPrompt,
  buildAmbiguousPronounPrompt,
  fixPronounPairs,
  type RelationshipKey,
} from './vietnamese-pronoun-resolver';
import { detectTopicComment, buildTopicCommentPrompt } from './vietnamese-topic-comment';
import {
  detectRegisterSignal,
  buildRegisterSignalPrompt,
  buildRegisterPromptForRelationship,
} from './vietnamese-register';
import {
  detectImpliedSubject,
  buildImpliedSubjectPrompt,
} from './vietnamese-zero-subject';
import {
  detectCulturalConcepts,
  buildCulturalConceptsPrompt,
} from './vietnamese-cultural-concepts';
import {
  detectSegmentationIssues,
  buildSegmentationPrompt,
} from './vietnamese-segmentation';
import {
  detectNounsNeedingClassifier,
  buildClassifierPrompt,
} from './vietnamese-classifiers';
import {
  detectIdioms,
  buildIdiomPrompt,
} from './vietnamese-english-idioms';
import {
  detectDishNames,
  buildDishNamesPrompt,
} from './vietnamese-dish-names';
import {
  detectEnglishPronouns,
  buildEnglishPronounsPrompt,
} from './english-pronouns';
import {
  detectEnglishCulturalConcepts,
  buildEnglishCulturalConceptsPrompt,
} from './english-cultural-concepts';
import {
  detectEnglishSofteners,
  buildEnglishSoftenersPrompt,
} from './english-softeners';
import {
  detectEnglishFoodItems,
  buildEnglishFoodItemsPrompt,
} from './english-food-items';
import { vnRe } from './vn-regex';

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
    '# ASPECT PARTICLES (VI→EN): pick the RIGHT English form, don\'t add words.',
    '- đang = present continuous: "đang ăn" → "is eating"',
    '- đã/rồi = past perfect: "ăn rồi" → "already ate" / "have eaten"',
    '- sắp = near future: "sắp đi" → "about to go"',
    '- vừa...xong = just completed: "vừa ăn xong" → "just finished eating"',
    '- thường/hay = habitual: "thường ăn" → "usually eat"',
    '- có thể = possibility: "có thể ăn?" → "can I eat?"',
    '- phải = obligation: "phải đi" → "must go"',
    '"Ăn" alone is ambiguous; particles disambiguate. Render every aspect correctly.',
    '',
    '# BREVITY + DON\'T-INVENT (universal rule across ALL message types):',
    'Vietnamese is terse; English over-elaborates if you\'re not careful. Match source word count ±1-2 words. Do NOT add clauses, meta-commentary, intensifiers, subjects, objects, consequences, threats, "with you", future-meeting language, reluctance/regret, or apologetic tone the source doesn\'t carry.',
    'Representative examples (apply pattern across ALL contexts including conflict, farewell, casual, gratitude):',
    '- "Em xin lỗi" → "I\'m sorry", NOT "I really want to apologize" (no elaboration in source)',
    '- "Đó là quyết định đúng" → "That\'s the right decision", NOT "You made the right choice" (no subject in source)',
    '- "Cảm ơn" → "Thank you", NOT "Thank you for your help" (no object in source)',
    '- "Em đã cảnh báo anh rồi" → "I warned you", NOT "I told you this would happen" (no consequence in source)',
    '- "Anh không hiểu tôi" → "You don\'t understand me", NOT "You refuse to understand" (no malicious intent)',
    '- "Đó là lần cuối" → "That\'s the last time", NOT "Last chance" (no threat in source)',
    '- "Tạm biệt" → "Goodbye", NOT "See you later" (don\'t invent future meeting)',
    '- "I\'m tired" / "I\'m busy" / "I have to go" → plain status, NOT "Sorry I\'m tired" or "I don\'t want to go but have to" (no apology/reluctance in source)',
    '- "That sounds fun" → "That sounds fun", NOT "That sounds fun, I hope we can do it" (no invented expectation)',
    '- "Okay" → "Okay", NOT "Okay, I understand and agree" (no over-specification)',
    'RULES: Don\'t interpret "can\'t" as "won\'t". Status/fact statements stay neutral unless marked with !, emoji, or emotional language. Practical farewells stay practical. Simple acknowledgments stay simple. Vague source = vague translation.',
    '',
    '# EMOTIONAL VALENCE: word choice matters in gratitude/apology contexts.',
    '- "Thanks for your patience" → "Cảm ơn vì sự kiên nhẫn", NOT "Cảm ơn vì đã chịu đựng em" (chịu đựng = endure/burden, wrong valence)',
    'In gratitude prefer: kiên nhẫn (patient), tốt bụng (kind), quý (treasure), hỗ trợ (support). Avoid: chịu đựng (endure), chấp nhận (accept/tolerate), buộc (forced).',
    '',
    '# ENGLISH TENSE → VN PARTICLES (EN→VI):',
    '- is/am/are + -ing → đang: "I am eating" → "Tôi đang ăn"',
    '- have/has + -ed → đã...rồi: "I have eaten" → "Tôi đã ăn rồi"',
    '- about to / going to → sắp: "I am about to go" → "Tôi sắp đi"',
    '- just + -ed → vừa...xong: "I just ate" → "Tôi vừa ăn xong"',
    '- usually/often/always → thường; can/may/might → có thể; must/have to/should → phải; will → sẽ.',
    '- Bare verb (simple present) → no particle: "I eat" → "Tôi ăn"',
    '"I go to work" can be habitual OR imminent — use context.',
    '',
    '# THIRD-PARTY: speaker↔listener pair STAYS LOCKED. Third parties get their own kinship/name terms (chị gái, mẹ, sếp). Don\'t let third-party mentions change the main pair.',
    '',
    '# KINSHIP AMBIGUITY: VN kinship terms (chị, anh, em, cô, chú, bác) also address non-relatives respectfully. VI→EN: "chị Lan" defaults to "Lan" (respected older woman), NOT "my sister Lan", unless blood cue ("chị gái tôi"). EN→VI: "my sister" defaults to blood reading but flag kinship warning. Always flag ambiguous cases.',
    '',
    `# FACE-THREATENING: "you're lying/crazy/stupid", "shut up", "I hate you" (when playful), sarcasm — land as REAL insults in VN. If tone is warm/teasing, rewrite with softeners (nha, nhé) or hedges. ALWAYS flag as "face_threat".`,
    '',
    `# IDIOMS: Always flag. Examples: "I'm dying", "break a leg", "spill the tea", "kill it", "hit me up". Provide literalMeaning, likelyMeaning, and natural rewrite.`,
    '',
    srcIsVietnamese
      ? `# VN COLLOQUIAL (preserve warmth — don't sanitize): terms of endearment (cục vàng, bé+name), affectionate calls (anh/chị/em+ơi), shortened forms (k, r, vs, j) signal closeness. Warm option keeps endearment; playful matches teasing; casual stays light.`
      : '',
    '',
    srcIsVietnamese
      ? `# AMBIGUOUS VN VERBS (được, để, tới, có): meaning depends on question form, object presence, imperative/location/time context. Use surrounding text and conversation flow to disambiguate.`
      : '',
    '',
    '# STEPS',
    isText
      ? `1) Echo the input verbatim as "transcript". Read for EMOTION using punctuation, caps, elongation, emoji, repetition, hedges. Most messages are neutral — don't over-read signals, but don't miss clear ones.`
      : `1) Transcribe in ${src}. Read EMOTION from pitch, pace, warmth, sharpness, hesitation — not just words.`,
    `2) Pick ONE emotion: warm · playful · curious · neutral · direct · urgent · cold · irritated · angry · formal · affectionate · sarcastic. IMPORTANT — treat "lol", "haha", "lmao", "hihi", "hehe" and similar laugh markers as SOFTENERS, not emotion classifiers. They reduce intensity but do not define it.`,
    '3) Pick category: request|opinion|agreement|invitation|apology|instruction|other.',
    '',
    '# OPTION GENERATION (prevent hallucinated emotion):',
    'Assess emotional signals first.',
    '- STRONG (!, caps, emoji, repetition, curses, contrasts like "but"/"though", passionate language) → 2-4 options with emotional variations.',
    '- NEUTRAL (plain statement, no emoji/punctuation variance, formal tone, status like "I\'m busy"/"I\'m tired"/"It\'s raining", meta-statements like "we need to talk") → 1-2 plain options ONLY. Do NOT invent emotional layers.',
    'Status/fact statements stay neutral unless marked. Don\'t add apologetic, regretful, concerned, or excuse-making tones to bare status: "I\'m busy" stays plain, NOT "Sorry I\'m busy". Vary word choice, not emotional tone.',
    '',
    '# MULTI-EMOTIONAL: when message contains TWO co-existing emotions (love + boundary, sorry + standing firm, respect + disagree), include ONE balanced option (e.g., "loving yet firm", "sorry AND here\'s my truth"; in VN use "nhưng" + appropriate pronouns/particles). Replaces a less meaningful variation. Only when truly multi-emotional.',
    '',
    `4) Produce options in ${tgt}. Follow option-generation rule (1-2 for neutral, 2-4 for emotional). Only include genuinely plausible options — do NOT pad. All options distinct emotions. ONE must equal detectedEmotion (your recommendation). Vary vocabulary/rhythm, not just polite-adjectives. ${tgt}=Vietnamese: match pronouns/softeners/particles to each option's emotion (angry=tao/mày or drop ạ; affectionate=anh/em+nha; formal=full dạ…ạ). EMOJI: if source had no emoji, don't add. Only include emoji where source used emoji. GRAMMAR: preserve all prepositions and function words. When VI→EN, make implicit prepositions explicit.`,
    srcIsVietnamese
      ? '5) SOURCE is Vietnamese — populate "sourceDecoding" with actual pronouns/softeners/particles extracted from transcript + a 1-2 sentence relationshipSignal.'
      : '5) SOURCE is English — set "sourceDecoding" to null.',
    '6) recommendedOption = detectedEmotion.',
    '',
    '# OUTPUT JSON SCHEMA',
    `backTranslation and howItLands are SINGLE STRINGS in ${reasoningLang} (NOT {en,vi} objects). Other bilingual fields (detectedTone, toneSignals, recommendationReason, culturalWarnings.literalMeaning/likelyMeaning/whyRisky) MUST have BOTH en+vi.`,
    'Return ONLY a single JSON object with these top-level keys:',
    '',
    '{',
    `  "transcript": "<what was said, in ${src}>",`,
    '  "detectedEmotion": "<one of the 12 emotions>",',
    '  "detectedTone": { "en": "<one sentence>", "vi": "<same in Vietnamese>" },',
    isText
      ? '  "toneSignals": { "en": ["<text cue>", ...], "vi": [...] },'
      : '  "toneSignals": { "en": ["<audio cue>", ...], "vi": [...] },',
    '  "category": "request|opinion|agreement|invitation|apology|instruction|other",',
    '  "options": [',
    '    {',
    '      "emotion": "<one of the 12>",',
    `      "translation": "<natural ${tgt} sentence>",`,
    tgtIsVietnamese
      ? '      "literalFlow": "<literal English gloss showing the machinery>",'
      : '      "literalFlow": null,',
    `      "backTranslation": "<single ${reasoningLang} string>",`,
    tgtIsVietnamese
      ? '      "breakdown": { "pronouns":[{"word":"<vi>","meaning":"<EN>"}], "softeners":[...], "particles":[...] },'
      : '      "breakdown": null,',
    `      "howItLands": "<single ${reasoningLang} string>",`,
    srcIsVietnamese
      ? '      "confidenceScore": <0-100, how confident this interpretation is correct>'
      : '      "confidenceScore": null,',
    '    }',
    '  ],',
    srcIsVietnamese
      ? '  "sourceDecoding": { "pronouns":[...], "softeners":[...], "particles":[...], "relationshipSignal": { "en":"...", "vi":"..." } },'
      : '  "sourceDecoding": null,',
    '  "culturalWarnings": [',
    '    { "type": "kinship|face_threat|idiom|slang|colloquial|cultural_concept|dish_name|other",',
    '      "term": "<phrase>", "where": "source|target",',
    '      "literalMeaning": { "en":"...", "vi":"..." },',
    '      "likelyMeaning": { "en":"...", "vi":"..." },',
    '      "whyRisky": { "en":"...", "vi":"..." },',
    '      "suggestionKind": "clarify|rewrite",',
    '      "suggestion": "<ready-to-send text in listener\'s language>" }',
    '  ],',
    '  "recommendedOption": "<emotion of best option — MUST equal detectedEmotion>",',
    '  "recommendationReason": { "en":"...", "vi":"..." },',
    '  "contextConfidence": <integer 0-100>',
    '}',
    '',
    'MUST:',
    '- Return VALID JSON only. No markdown, no commentary.',
    `- ${tgtIsVietnamese ? 'VN target: literalFlow + breakdown per option.' : 'EN target: literalFlow=null, breakdown=null.'}`,
    `- ${srcIsVietnamese ? 'VN source: populate sourceDecoding.' : 'EN source: sourceDecoding=null.'}`,
    '- culturalWarnings = array (empty if none).',
    '- Every translation grammatically complete (all prepositions, articles, function words present).',
    srcIsVietnamese
      ? '- Score confidenceScore (0-100) per option for ambiguous VN verbs (được, để, tới, có, ghê, hay, mà, vì) and colloquial terms. High=auto-select; low=show picker.'
      : '- confidenceScore=null for English source.',
    srcIsVietnamese
      ? '- ASPECT: ensure đang/rồi/sắp/xong/thường/có thể/phải render correct English tense/continuous form.'
      : '- TENSE: map present continuous, perfect, future to VN particles (đang, đã...rồi, sắp, vừa...xong).',
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
    `Return STRICT JSON: { "translation": "<${tgt} text>", "culturalWarnings": [optional array — include only when a detector explicitly asks you to populate it; omit or use [] otherwise] }. No markdown, no commentary.`,
    `Each culturalWarnings entry: { "type": "idiom"|"slang"|"cultural_concept"|"dish_name"|"face_threat"|"kinship"|"other", "term": "<source phrase>", "literalMeaning": "<short explanation>", "suggestion": "<the rendering you chose>" }.`,
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

  // Check for aspect particles. Use VN-aware boundaries — JS `\b` silently
  // misses matches when the boundary is adjacent to a non-ASCII letter
  // (đ, ạ, ể, ó, etc.).
  if (vnRe('đang').test(vn)) {
    particles.push('đang');
  }
  if (vnRe('(đã|rồi)').test(vn)) {
    particles.push('rồi/đã');
  }
  if (vnRe('sắp').test(vn)) {
    particles.push('sắp');
  }
  if (vnRe('(vừa|xong)').test(vn)) {
    particles.push('xong/vừa');
  }
  if (vnRe('(thường|hay)').test(vn)) {
    particles.push('thường');
  }
  if (vnRe('có thể').test(vn)) {
    particles.push('có thể');
  }
  if (vnRe('phải').test(vn)) {
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

// Validate Vietnamese grammar and coherence.
// Detects malformed patterns that shouldn't be generated (e.g., disconnected clause combinations).
function isGrammaticallyValid(text: string, targetLang: string): boolean {
  // Only validate Vietnamese
  if (targetLang !== 'Vietnamese') return true;

  const words = text.split(/\s+/);
  if (words.length === 0) return true;

  // Red flags for malformed Vietnamese: disconnected phrases joined by commas
  // Example: "Tôi khỏe, đồng ý cảm ơn" has three unrelated concepts
  // Check for comma-separated clauses that lack coherent connection

  const commaParts = text.split(',').map(part => part.trim()).filter(p => p.length > 0);
  if (commaParts.length > 1) {
    // Each comma-separated part should be grammatically valid on its own
    // AND they should form a coherent sequence

    // Pattern: if we have 3+ comma-separated parts with 1-3 words each,
    // and they contain unrelated verbs (agree + thank + be, etc),
    // it's likely malformed
    if (commaParts.length >= 3) {
      const partWords = commaParts.map(p => p.split(/\s+/));
      const avgLength = partWords.reduce((sum, w) => sum + w.length, 0) / partWords.length;

      // If parts are very short and numerous, check for semantic coherence
      if (avgLength <= 3) {
        const hasMultipleVerbs = commaParts.filter(part => {
          // Common Vietnamese verbs/actions
          const verbs = ['đồng ý', 'cảm ơn', 'xin lỗi', 'hiểu', 'yêu', 'ghét', 'khỏe', 'mệt'];
          return verbs.some(v => part.includes(v));
        }).length;

        // 3+ disconnected verb concepts joined by commas = malformed
        if (hasMultipleVerbs >= 3) {
          return false;
        }
      }
    }
  }

  // Check for obviously broken patterns
  // Words that shouldn't appear together without proper connectors
  const brokenPatterns = [
    /\bđồng ý\s+cảm ơn\b/i, // "agree thank" without connector
    /\bkhỏe\s+đồng ý\b/i,   // "healthy agree" — unrelated
  ];

  if (brokenPatterns.some(pattern => pattern.test(text))) {
    return false;
  }

  return true;
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

  // Determine target language from options
  let targetLang = 'English';
  const firstOption = options[0];
  if (firstOption && firstOption.translation && typeof firstOption.translation === 'string') {
    // Check if it looks like Vietnamese (contains Vietnamese diacritics or particles)
    const translation = firstOption.translation as string;
    if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/.test(translation)) {
      targetLang = 'Vietnamese';
    }
  }

  const kept: Array<Record<string, unknown>> = [];

  for (const option of options) {
    const translation = option.translation as string;
    const emotion = (option.emotion || '').toLowerCase();
    if (!translation) continue;

    // Check grammar validity (filters malformed sentences)
    if (!isGrammaticallyValid(translation, targetLang)) {
      continue; // Skip malformed options
    }

    // Check if this option is too similar to any already-kept option
    const isDuplicate = kept.some(keptOption => {
      const keptTranslation = keptOption.translation as string;
      const keptEmotion = (keptOption.emotion || '').toLowerCase();

      const similarity = textSimilarity(translation, keptTranslation);

      // SAFETY NET: If 100% identical, always filter (prevents duplicate generation)
      if (similarity >= 0.99) {
        return true;
      }

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
  // Fix Vietnamese slang before sending to OpenAI
  if (payload.direction === 'vi-en') {
    const { rewritten, wasChanged } = rewriteSlang(payload.text);
    if (wasChanged) {
      payload.text = rewritten;
    }
  }

  // Detect pronoun signals from the source text. If confidence is high (≥0.8)
  // and disagrees with the stored relationship, override silently for this
  // translation only (don't mutate the user's contact). If 0.5–0.8, append
  // evidence to the system prompt so the model has both signals to weigh.
  // When the frontend supplied contactPronounMemory from prior turns, the
  // detector trusts that as canonical instead of running the word-order
  // heuristic — see vietnamese-pronoun-resolver.ts for why.
  let pronounSignals: ReturnType<typeof detectPronounSignals> | null = null;
  if (payload.direction === 'vi-en') {
    pronounSignals = detectPronounSignals(payload.text, payload.contactPronounMemory);
    if (
      pronounSignals.inferredRelationship &&
      pronounSignals.confidence >= 0.8 &&
      pronounSignals.inferredRelationship !== payload.relationship
    ) {
      payload.relationship = pronounSignals.inferredRelationship;
    }
  }

  // Detect ambiguous Vietnamese verbs and add context to system prompt
  let systemPrompt = buildPickerSystemPrompt(payload, true, uiLang);
  if (payload.direction === 'vi-en') {
    const ambiguityEnhancement = buildAmbiguityPromptEnhancement(payload.text);
    if (ambiguityEnhancement) {
      systemPrompt += ambiguityEnhancement;
    }
  }
  // Append pronoun evidence at medium confidence (or always, if we have any
  // matched signals — the model benefits from the explicit "speaker says em,
  // calls listener anh" framing even when the relationship was already correct).
  // Ambiguous-pair cases (em+anh or em+chị with no vocative and no memory) get
  // a different prompt block that tells the model to disambiguate from content
  // instead of trusting a wrong-50%-of-the-time pair.
  if (pronounSignals && pronounSignals.confidence >= 0.5 && !pronounSignals.ambiguousPair) {
    systemPrompt += buildPronounContextPrompt(pronounSignals);
  } else if (pronounSignals && pronounSignals.ambiguousPair) {
    systemPrompt += buildAmbiguousPronounPrompt(pronounSignals);
  }

  // Detect Vietnamese topic-comment structures (e.g., "Quyển sách này tôi đọc
  // rồi") and nudge the model to restructure to natural English SVO instead
  // of echoing the topic at the start.
  let topicCommentDetected = false;
  if (payload.direction === 'vi-en') {
    const topicMatch = detectTopicComment(payload.text);
    if (topicMatch.detected) {
      topicCommentDetected = true;
      systemPrompt += buildTopicCommentPrompt(topicMatch);
    }
  }

  // Detect dropped subjects in short single-clause messages and infer whether
  // the implicit subject is the speaker or the addressee. Tightly gated:
  // requires no explicit pronoun, no third-party referent, no topic-comment
  // structure, and a confident pronoun pair to resolve into English.
  if (payload.direction === 'vi-en') {
    const subjectMatch = detectImpliedSubject(payload.text, {
      topicCommentDetected,
      pronounSignals,
    });
    if (subjectMatch.detected) {
      systemPrompt += buildImpliedSubjectPrompt(subjectMatch, pronounSignals);
    }
  }

  // Register selection: VI→EN signals formality from Sino-Vietnamese
  // vocabulary; EN→VI nudges toward Sino or native forms based on relationship.
  if (payload.direction === 'vi-en') {
    const registerSignal = detectRegisterSignal(payload.text);
    if (registerSignal.level !== 'unmarked') {
      systemPrompt += buildRegisterSignalPrompt(registerSignal);
    }
  } else if (payload.direction === 'en-vi') {
    systemPrompt += buildRegisterPromptForRelationship(payload.relationship, payload.direction);
  }

  // Cultural concepts (VI→EN only): inject educational guidance + ask the
  // model to populate culturalWarnings. Concepts the user has seen ≥ N times
  // (per `culturalConceptCounts`) are silently filtered — invisible to the
  // model and not surfaced in the UI.
  if (payload.direction === 'vi-en') {
    const culturalMatches = detectCulturalConcepts(payload.text, payload.culturalConceptCounts);
    if (culturalMatches.length > 0) {
      systemPrompt += buildCulturalConceptsPrompt(culturalMatches);
    }
  }

  // Segmentation hints (VI→EN only): flag genuinely ambiguous compounds and
  // reduplicative forms so the model treats them correctly.
  if (payload.direction === 'vi-en') {
    const segmentation = detectSegmentationIssues(payload.text);
    if (segmentation.ambiguous.length > 0 || segmentation.reduplicatives.length > 0) {
      systemPrompt += buildSegmentationPrompt(segmentation);
    }
  }

  // Dish names (VI→EN only): preserve dish names as proper nouns; gloss on
  // first encounter, translate plain after the user has learned them.
  if (payload.direction === 'vi-en') {
    const dishMatches = detectDishNames(payload.text, payload.dishCounts);
    if (dishMatches.length > 0) {
      systemPrompt += buildDishNamesPrompt(dishMatches);
    }
  }

  // Classifier guidance (EN→VI only): for countable nouns in the source,
  // hint the natural Vietnamese classifier so the model doesn't default to
  // generic "cái" when something more specific (con/quyển/chiếc/bức/...) fits.
  if (payload.direction === 'en-vi') {
    const classifierMatches = detectNounsNeedingClassifier(payload.text);
    if (classifierMatches.length > 0) {
      systemPrompt += buildClassifierPrompt(classifierMatches);
    }
  }

  // English pronoun signals (EN→VI only): "you" plurality and "we"
  // inclusivity. Tightly gated for 1v1 chat — colloquial "you guys"/"y'all"
  // are NOT treated as plural here.
  if (payload.direction === 'en-vi') {
    const enPronouns = detectEnglishPronouns(payload.text);
    if (enPronouns.youNumber === 'plural' || enPronouns.weInclusivity !== 'unknown') {
      systemPrompt += buildEnglishPronounsPrompt(enPronouns);
    }
  }

  // English cultural concepts (EN→VI only, with learn-once suppression
  // sharing the same culturalConceptCounts store as Vietnamese concepts).
  if (payload.direction === 'en-vi') {
    const enCulturalMatches = detectEnglishCulturalConcepts(
      payload.text,
      payload.culturalConceptCounts
    );
    if (enCulturalMatches.length > 0) {
      systemPrompt += buildEnglishCulturalConceptsPrompt(enCulturalMatches);
    }
  }

  // English softeners + tag questions + reassurance phrases (EN→VI only).
  if (payload.direction === 'en-vi') {
    const softenerMatches = detectEnglishSofteners(payload.text);
    if (softenerMatches.length > 0) {
      systemPrompt += buildEnglishSoftenersPrompt(softenerMatches);
    }
  }

  // English food / cultural items (EN→VI only). Reuses dishCounts storage
  // and dish_name warning type — frontend chip rendering already exists.
  if (payload.direction === 'en-vi') {
    const enFoodMatches = detectEnglishFoodItems(payload.text, payload.dishCounts);
    if (enFoodMatches.length > 0) {
      systemPrompt += buildEnglishFoodItemsPrompt(enFoodMatches);
    }
  }

  // Idiom hints (BOTH directions): flag known cross-language idioms so the
  // model picks the right reading and surfaces the original meaning to the
  // user via culturalWarnings.
  const idiomMatches = detectIdioms(payload.text, payload.direction);
  if (idiomMatches.length > 0) {
    systemPrompt += buildIdiomPrompt(idiomMatches);
  }

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

  // Smart ambiguity filtering: only show picker if truly ambiguous
  if (src === 'Vietnamese') {
    const { filtered, shouldShowPicker, reason } = filterOptionsByConfidence(result);
    result = filtered;
  }

  // Ensure bilingual fields (howItLands, backTranslation) have both en and vi versions
  result = ensureBilingualFields(result);

  // Select the correct language for the user (Vietnamese speakers get Vietnamese explanations, English speakers get English)
  result = selectUserLanguage(result, uiLang);

  // Vietnamese → English: fix prepositions and aspect particles
  if (src === 'Vietnamese') {
    result = fixMissingPrepositions(result, payload.text);
    result = fixAspectParticles(result, payload.text);
    // Surface the detected pronoun pair so the frontend can persist it on the
    // contact profile and replay it via promptExtensions on outgoing messages.
    if (pronounSignals && pronounSignals.confidence >= 0.5) {
      (result as Record<string, unknown>)._pronounSignals = pronounSignals;
    }
  }

  // English → Vietnamese: verify tense mapping to particles
  if (src === 'English' && tgt === 'Vietnamese') {
    result = fixEnglishTenses(result, payload.text);
    result = fixPronounPairs(result, payload.relationship as RelationshipKey);
  }

  // Filter options to remove near-duplicates — keep only meaningfully different options
  result = filterOptionsForMeaningfulDifferences(result);

  return Response.json(result);
}

// QUICK PATH — single translation, no picker.
//
// This is the path the frontend uses for inline message-compose translation
// (the live chat thread). It runs the SAME detector chain as the picker
// path, with the prompts appended to the quick system prompt. The response
// shape stays compatible with the original `{ translation }` shape but adds
// optional `culturalWarnings` (when detectors fire) and `_pronounSignals`
// (on VI→EN, for frontend pronoun-memory persistence).
export async function handleQuick(
  payload: QuickTranslatePayload,
  env: Env
): Promise<Response> {
  // Slang fix is direction-aware and modifies the source text in-place
  // before downstream detectors see it.
  if (payload.direction === 'vi-en') {
    const { rewritten, wasChanged } = rewriteSlang(payload.text);
    if (wasChanged) payload.text = rewritten;
  }

  // Pronoun signals (VI→EN). Silent override at confidence ≥ 0.8. When the
  // frontend supplied contactPronounMemory, the detector uses it as
  // canonical override instead of running the word-order heuristic.
  let pronounSignals: ReturnType<typeof detectPronounSignals> | null = null;
  if (payload.direction === 'vi-en') {
    pronounSignals = detectPronounSignals(payload.text, payload.contactPronounMemory);
    if (
      pronounSignals.inferredRelationship &&
      pronounSignals.confidence >= 0.8 &&
      pronounSignals.inferredRelationship !== payload.relationship
    ) {
      payload.relationship = pronounSignals.inferredRelationship;
    }
  }

  let systemPrompt = buildQuickSystemPrompt(payload);

  // Ambiguity hints (VI→EN).
  if (payload.direction === 'vi-en') {
    const ambiguityEnhancement = buildAmbiguityPromptEnhancement(payload.text);
    if (ambiguityEnhancement) systemPrompt += ambiguityEnhancement;
  }

  // Pronoun evidence block (when we have any detected signal). Ambiguous-pair
  // cases (em+anh or em+chị with no vocative and no memory) get a different
  // block that asks the model to disambiguate from content rather than trust
  // a wrong-50%-of-the-time pair.
  if (pronounSignals && pronounSignals.confidence >= 0.5 && !pronounSignals.ambiguousPair) {
    systemPrompt += buildPronounContextPrompt(pronounSignals);
  } else if (pronounSignals && pronounSignals.ambiguousPair) {
    systemPrompt += buildAmbiguousPronounPrompt(pronounSignals);
  }

  // Topic-comment (VI→EN).
  let topicCommentDetected = false;
  if (payload.direction === 'vi-en') {
    const topicMatch = detectTopicComment(payload.text);
    if (topicMatch.detected) {
      topicCommentDetected = true;
      systemPrompt += buildTopicCommentPrompt(topicMatch);
    }
  }

  // Zero-subject (VI→EN).
  if (payload.direction === 'vi-en') {
    const subjectMatch = detectImpliedSubject(payload.text, {
      topicCommentDetected,
      pronounSignals,
    });
    if (subjectMatch.detected) {
      systemPrompt += buildImpliedSubjectPrompt(subjectMatch, pronounSignals);
    }
  }

  // Register signal (VI→EN) and relationship-driven register guidance (EN→VI).
  if (payload.direction === 'vi-en') {
    const registerSignal = detectRegisterSignal(payload.text);
    if (registerSignal.level !== 'unmarked') {
      systemPrompt += buildRegisterSignalPrompt(registerSignal);
    }
  } else if (payload.direction === 'en-vi') {
    systemPrompt += buildRegisterPromptForRelationship(payload.relationship, payload.direction);
  }

  // Cultural concepts (VI→EN, with learn-once suppression).
  if (payload.direction === 'vi-en') {
    const culturalMatches = detectCulturalConcepts(payload.text, payload.culturalConceptCounts);
    if (culturalMatches.length > 0) {
      systemPrompt += buildCulturalConceptsPrompt(culturalMatches);
    }
  }

  // Segmentation (VI→EN).
  if (payload.direction === 'vi-en') {
    const segmentation = detectSegmentationIssues(payload.text);
    if (segmentation.ambiguous.length > 0 || segmentation.reduplicatives.length > 0) {
      systemPrompt += buildSegmentationPrompt(segmentation);
    }
  }

  // Dish names (VI→EN, with learn-once suppression).
  if (payload.direction === 'vi-en') {
    const dishMatches = detectDishNames(payload.text, payload.dishCounts);
    if (dishMatches.length > 0) {
      systemPrompt += buildDishNamesPrompt(dishMatches);
    }
  }

  // Classifier guidance (EN→VI).
  if (payload.direction === 'en-vi') {
    const classifierMatches = detectNounsNeedingClassifier(payload.text);
    if (classifierMatches.length > 0) {
      systemPrompt += buildClassifierPrompt(classifierMatches);
    }
  }

  // English pronoun signals (EN→VI).
  if (payload.direction === 'en-vi') {
    const enPronouns = detectEnglishPronouns(payload.text);
    if (enPronouns.youNumber === 'plural' || enPronouns.weInclusivity !== 'unknown') {
      systemPrompt += buildEnglishPronounsPrompt(enPronouns);
    }
  }

  // English cultural concepts (EN→VI).
  if (payload.direction === 'en-vi') {
    const enCulturalMatches = detectEnglishCulturalConcepts(
      payload.text,
      payload.culturalConceptCounts
    );
    if (enCulturalMatches.length > 0) {
      systemPrompt += buildEnglishCulturalConceptsPrompt(enCulturalMatches);
    }
  }

  // English softeners + tag questions + reassurance phrases (EN→VI).
  if (payload.direction === 'en-vi') {
    const softenerMatches = detectEnglishSofteners(payload.text);
    if (softenerMatches.length > 0) {
      systemPrompt += buildEnglishSoftenersPrompt(softenerMatches);
    }
  }

  // English food / cultural items (EN→VI).
  if (payload.direction === 'en-vi') {
    const enFoodMatches = detectEnglishFoodItems(payload.text, payload.dishCounts);
    if (enFoodMatches.length > 0) {
      systemPrompt += buildEnglishFoodItemsPrompt(enFoodMatches);
    }
  }

  // Idioms (both directions).
  const idiomMatches = detectIdioms(payload.text, payload.direction);
  if (idiomMatches.length > 0) {
    systemPrompt += buildIdiomPrompt(idiomMatches);
  }

  // Optional client-supplied prompt extensions (slang notes, contact profile,
  // pronoun memory) — same shape as the picker path.
  if (payload.promptExtensions) systemPrompt += payload.promptExtensions;

  const body: OpenAIBody = {
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.5,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: payload.text },
    ],
  };
  const upstream = await callOpenAI(body, env.OPENAI_API_KEY);
  if (!upstream.ok) return forwardError(upstream);
  const upstreamJson = (await upstream.json()) as Record<string, unknown>;

  // Surface pronoun signals on VI→EN responses so the frontend can persist
  // them on the contact profile (parallel to the picker path).
  if (pronounSignals && pronounSignals.confidence >= 0.5 && payload.direction === 'vi-en') {
    upstreamJson._pronounSignals = pronounSignals;
  }

  return Response.json(upstreamJson);
}

// VOICE PATH — base64 WAV in, full picker JSON out.
export async function handleVoice(
  payload: VoiceTranslatePayload,
  env: Env
): Promise<Response> {
  const uiLang = payload.uiLang || 'en';

  // Note: Voice transcription happens in OpenAI first, then we'd fix the transcript.
  // For now, we'll fix it after transcription (in post-processing below).

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

  // Vietnamese → English: fix slang, prepositions and aspect particles
  if (src === 'Vietnamese' && json.transcript) {
    // Fix slang in transcript before other processing
    const { rewritten } = rewriteSlang(json.transcript);
    result.transcript = rewritten;

    result = fixMissingPrepositions(result, rewritten);
    result = fixAspectParticles(result, rewritten);
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
