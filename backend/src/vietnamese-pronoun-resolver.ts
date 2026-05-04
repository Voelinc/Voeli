// Vietnamese pronoun signal detector + verifier.
//
// Mirrors the architecture of `detectAspectParticles` / `fixAspectParticles`
// in openai.ts: a deterministic detector runs before OpenAI to anchor the
// system prompt with what the SOURCE actually says, and a verifier runs after
// to flag mismatches in the OUTPUT.
//
// Why this exists: relationship is set per-contact in the UI, but the ground
// truth lives in the message. If a sender writes "anh ơi em nhớ anh", the
// established pair is em (junior speaker) ↔ anh (senior listener), regardless
// of whatever relationship the contact card has been tagged with. We trust
// the text over the metadata when the evidence is strong.
//
// Tokenization note: JS `\b` is unreliable around Vietnamese diacritics
// (đ, ơ, ạ are all `\W`), so we tokenize by splitting on whitespace and
// punctuation, then check exact lowercase tokens.

export type RelationshipKey =
  | 'formal'
  | 'elder'
  | 'senior'
  | 'friend'
  | 'partner'
  | 'junior';

export interface PronounSignals {
  selfPronoun: string | null;
  otherPronoun: string | null;
  inferredRelationship: RelationshipKey | null;
  inferredGender: { speaker: 'm' | 'f' | null; other: 'm' | 'f' | null };
  formalityLevel: 'formal' | 'neutral' | 'intimate' | 'rude';
  // 0–1. ≥0.8 triggers silent override of the stored relationship.
  // 0.5–0.8 just appends evidence to the system prompt.
  confidence: number;
  matchedTokens: string[];
  // True when em+anh or em+chị are both present without a vocative marker
  // and without contact memory — the speaker is genuinely ambiguous from
  // surface text alone. Caller should inject buildAmbiguousPronounPrompt
  // instead of buildPronounContextPrompt.
  ambiguousPair: boolean;
}

export interface PronounVerification {
  ok: boolean;
  warnings: string[];
}

import { vnRe, VN_LB, VN_RB } from './vn-regex';

// Words that disambiguate self vs. other when a pronoun could be either.
// "X ơi" → X is the addressee.
const VOCATIVE_RE =
  /(em|anh|chị|cậu|bác|cô|chú|ông|bà|con|cháu|mày|tớ)\s+ơi/giu;

// Respect openers/closers — strong elder/formal signal.
const DA_OPENER_RE = vnRe('dạ', 'i');
// Match "ạ" as a standalone particle anchored at left by a non-letter and at
// right by a clause boundary (., !, ?, ,) or end of string. Catches both
// "anh ạ." and "anh ạ,".
const A_CLOSER_RE = new RegExp(`${VN_LB}ạ(\\s*[.!?,]|\\s*$)`, 'imu');

// Romantic/intimate markers that lift em↔anh from senior to partner.
const PARTNER_MARKERS_RE = vnRe('(yêu|nhớ|thương|cưng|baby|honey|ck|vk|ny)', 'i');

// Hostile context that makes tao/mày read as rude rather than intimate-friendly.
const HOSTILE_MARKERS_RE = vnRe('(điên|ngu|khốn|chết|cút|biến|đm|vcl|cl)', 'i');

const TOKEN_SPLIT_RE = /[\s.,!?;:()'"\-—…]+/;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT_RE)
    .filter((t) => t.length > 0);
}

function countTokens(tokens: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tokens) counts[t] = (counts[t] || 0) + 1;
  return counts;
}

function findVocativeAddressee(text: string): string | null {
  const matches = text.toLowerCase().match(VOCATIVE_RE);
  if (!matches || matches.length === 0) return null;
  // Last vocative wins — it's usually the freshest address.
  const last = matches[matches.length - 1];
  return last.replace(/\s+ơi\s*$/i, '').trim();
}

// When the contact's pronoun pair has been established in prior turns, the
// detector should TRUST that memory instead of falling back to the
// word-order heuristic. This fixes the inversion bug where "Anh nịnh em thôi"
// (sent by a partner who calls themselves em) was being read as "I flatter
// you" when the actual meaning is "you flatter me."
//
// In Vietnamese 1v1 chat, the same sentence has opposite meanings depending
// on who is speaking — "anh" and "em" can be either subject or object. The
// only reliable disambiguator is knowing the contact's established
// self-pronoun. Memory at confidence ≥ 0.7 from previous turns wins over
// any in-text inference.
export interface ContactPronounMemoryHint {
  selfPronoun: string | null;
  otherPronoun: string | null;
  relationship: string | null;
  confidence: number;
}

export function detectPronounSignals(
  text: string,
  contactMemory?: ContactPronounMemoryHint
): PronounSignals {
  const lower = text.toLowerCase();
  const tokens = tokenize(text);
  const counts = countTokens(tokens);
  const matched: string[] = [];

  const addressee = findVocativeAddressee(text);
  if (addressee) matched.push(`vocative: ${addressee} ơi`);

  let self: string | null = null;
  let other: string | null = null;
  let rel: RelationshipKey | null = null;
  let formality: 'formal' | 'neutral' | 'intimate' | 'rude' = 'neutral';
  let confidence = 0;
  let speakerGender: 'm' | 'f' | null = null;
  let otherGender: 'm' | 'f' | null = null;
  let ambiguousPair = false;

  // 1. Strongest signal: con/cháu + bác/cô/chú/ông/bà → elder
  const ELDER_OTHER = ['bác', 'cô', 'chú', 'ông', 'bà'] as const;
  const elderOther = ELDER_OTHER.find((p) => counts[p]);
  if ((counts['con'] || counts['cháu']) && elderOther) {
    self = counts['con'] ? 'con' : 'cháu';
    other = elderOther;
    rel = 'elder';
    confidence = 0.95;
    formality = 'formal';
    if (other === 'cô' || other === 'bà') otherGender = 'f';
    if (other === 'chú' || other === 'bác' || other === 'ông') otherGender = 'm';
  }
  // 2. tao + mày → friend (intimate) or rude
  else if (counts['tao'] && counts['mày']) {
    self = 'tao';
    other = 'mày';
    rel = 'friend';
    confidence = 0.9;
    formality = HOSTILE_MARKERS_RE.test(lower) ? 'rude' : 'intimate';
  }
  // 3. tớ + cậu → friend (neutral)
  else if (counts['tớ'] && counts['cậu']) {
    self = 'tớ';
    other = 'cậu';
    rel = 'friend';
    confidence = 0.9;
    formality = 'neutral';
  }
  // 4. em + anh → senior or partner (need disambiguation)
  else if (counts['em'] && counts['anh']) {
    if (addressee === 'anh') {
      self = 'em';
      other = 'anh';
      rel = PARTNER_MARKERS_RE.test(lower) ? 'partner' : 'senior';
      confidence = 0.9;
      otherGender = 'm';
    } else if (addressee === 'em') {
      self = 'anh';
      other = 'em';
      rel = PARTNER_MARKERS_RE.test(lower) ? 'partner' : 'junior';
      confidence = 0.9;
      speakerGender = 'm';
    } else {
      // No vocative, no memory. The speaker is genuinely ambiguous from
      // surface text alone — Vietnamese SVO puts the grammatical subject
      // first regardless of who is speaking, so word-order heuristics
      // ("first pronoun must be the speaker") are wrong ~50% of the time.
      // Bug example: "Mà anh rủ em đi chơi 2 ngày rồi lúc về em về 1 mình hà"
      // is sent by em (complaining that anh invited her then ditched her),
      // but the old heuristic picked self=anh because firstAnh < firstEm,
      // producing "I invited you and you went home alone" — exact inversion.
      // We now emit low confidence + ambiguousPair so the caller injects
      // a dedicated ambiguous-pronoun prompt block instead of a wrong pair.
      ambiguousPair = true;
      rel = 'senior';
      otherGender = 'm';
      confidence = 0.4;
      if (PARTNER_MARKERS_RE.test(lower)) {
        rel = 'partner';
        // Romantic frame is real evidence for the relationship register,
        // but does NOT pin direction ("em yêu anh" and "anh yêu em" are
        // both common). Keep ambiguousPair=true; bump confidence a bit.
        confidence = 0.55;
      }
    }
  }
  // 5. em + chị → senior or junior with female senior
  else if (counts['em'] && counts['chị']) {
    if (addressee === 'chị') {
      self = 'em';
      other = 'chị';
      rel = 'senior';
      confidence = 0.9;
      otherGender = 'f';
    } else if (addressee === 'em') {
      self = 'chị';
      other = 'em';
      rel = 'junior';
      confidence = 0.9;
      speakerGender = 'f';
    } else {
      // Same logic as em+anh no-vocative branch above: the speaker is
      // ambiguous from surface text. Emit low confidence + ambiguousPair
      // so the caller injects the ambiguous-pronoun prompt block.
      ambiguousPair = true;
      rel = 'senior';
      otherGender = 'f';
      confidence = 0.4;
    }
  }
  // 6. tôi → formal (with whatever neutral other we can find)
  else if (counts['tôi']) {
    self = 'tôi';
    const formalOthers = ['anh', 'chị', 'cô', 'chú', 'bạn'] as const;
    other = formalOthers.find((p) => counts[p]) || null;
    rel = 'formal';
    confidence = other ? 0.85 : 0.7;
    formality = 'formal';
  }
  // 7. mình + mình or mình alone with intimacy markers → partner
  else if (counts['mình']) {
    self = 'mình';
    other = counts['mình'] >= 2 ? 'mình' : null;
    if (PARTNER_MARKERS_RE.test(lower)) {
      rel = 'partner';
      confidence = 0.75;
      formality = 'intimate';
    } else {
      // mình alone is ambiguous — could be casual self-ref to anyone
      rel = null;
      confidence = 0.4;
    }
  }
  // 8. Vocative-only fallback: nothing identified self, but we know who we're talking to
  else if (addressee) {
    other = addressee;
    if (addressee === 'anh') {
      rel = 'senior';
      otherGender = 'm';
      confidence = 0.6;
    } else if (addressee === 'chị') {
      rel = 'senior';
      otherGender = 'f';
      confidence = 0.6;
    } else if (addressee === 'em') {
      rel = 'junior';
      confidence = 0.6;
    } else if (addressee === 'cậu' || addressee === 'tớ') {
      rel = 'friend';
      confidence = 0.6;
    } else if ((ELDER_OTHER as readonly string[]).includes(addressee)) {
      rel = 'elder';
      confidence = 0.7;
    }
  }

  // Respect-marker bumps: dạ opener and ạ closer push toward formal/elder.
  const hasDa = DA_OPENER_RE.test(lower);
  const hasA = A_CLOSER_RE.test(lower);
  if (hasDa || hasA) {
    matched.push(hasDa && hasA ? 'respect: dạ + ạ' : hasDa ? 'respect: dạ' : 'respect: ạ');
    if (rel === 'senior' || rel === 'elder' || rel === 'formal') {
      confidence = Math.min(0.99, confidence + 0.05);
    }
    if (formality === 'neutral') formality = 'formal';
  }

  if (self) matched.push(`self: ${self}`);
  if (other) matched.push(`other: ${other}`);

  // ─── CONTACT MEMORY OVERRIDE ──────────────────────────────────────────
  // If the frontend passed us a confident pronoun memory from prior turns,
  // trust it. Word-order heuristics are unreliable in 1v1 chat because
  // "anh" and "em" can be either grammatical subject or object — only the
  // established speaker identity disambiguates. Memory at confidence ≥ 0.7
  // wins over any in-text inference, AND memory injects a signal even when
  // the source has no pronoun pair to detect (e.g., "Còn anh thì nói..."
  // has only "anh" — no detector case fires, but the model still needs to
  // know how to resolve "anh" given the established speaker identity).
  if (contactMemory && contactMemory.confidence >= 0.7 && contactMemory.selfPronoun) {
    const memorySelf = contactMemory.selfPronoun;
    const memoryOther = contactMemory.otherPronoun;
    const memoryRel = contactMemory.relationship;

    if (self === null) {
      // Detector found nothing — adopt memory wholesale.
      matched.push(
        `[MEMORY ESTABLISHED] no in-text pronoun pair detected; using contact's established pair: self=${memorySelf} other=${memoryOther ?? '∅'}.`
      );
      self = memorySelf;
      other = memoryOther;
      if (memoryRel) rel = memoryRel as RelationshipKey;
    } else {
      const agrees = self === memorySelf && other === memoryOther;
      if (!agrees) {
        matched.push(
          `[MEMORY OVERRIDE] heuristic said self=${self} other=${other ?? '∅'}; contact's established pair is self=${memorySelf} other=${memoryOther ?? '∅'}. Trusting memory.`
        );
        self = memorySelf;
        other = memoryOther;
        if (memoryRel) rel = memoryRel as RelationshipKey;
      } else {
        matched.push('[MEMORY CONFIRMS] heuristic agrees with contact pronoun memory.');
      }
    }
    confidence = Math.max(confidence, 0.9);
    // Memory pins the direction — no longer ambiguous regardless of how
    // the in-text branch reached its tentative pick.
    ambiguousPair = false;
  }

  return {
    selfPronoun: self,
    otherPronoun: other,
    inferredRelationship: rel,
    inferredGender: { speaker: speakerGender, other: otherGender },
    formalityLevel: formality,
    confidence,
    matchedTokens: matched,
    ambiguousPair,
  };
}

// Verifier: scan the Vietnamese OUTPUT and flag pronoun-pair choices that
// clash with the declared relationship. Returns warnings for downstream
// `_pronounWarning` attachment, same shape as `_aspectWarning`.
export function verifyPronounPair(
  vietnameseOutput: string,
  relationship: RelationshipKey
): PronounVerification {
  const lower = vietnameseOutput.toLowerCase();
  const tokens = tokenize(vietnameseOutput);
  const has = (p: string) => tokens.includes(p);
  const warnings: string[] = [];

  if (relationship === 'elder') {
    if (has('tao') || has('mày')) {
      warnings.push('Output uses tao/mày toward an elder (disrespectful).');
    }
    if (has('tôi')) {
      warnings.push('Output uses tôi toward an elder — should be con or cháu.');
    }
    if (!DA_OPENER_RE.test(lower) && !A_CLOSER_RE.test(lower) && tokens.length > 3) {
      warnings.push('Output to elder lacks respect markers (dạ/ạ).');
    }
  } else if (relationship === 'formal') {
    if (has('tao') || has('mày')) {
      warnings.push('Output uses tao/mày in a formal relationship.');
    }
    if (has('tớ') || has('cậu')) {
      warnings.push('Output uses tớ/cậu (friend register) in a formal relationship.');
    }
  } else if (relationship === 'senior') {
    if (has('tao') || has('mày')) {
      warnings.push('Output uses tao/mày toward a senior (disrespectful).');
    }
  } else if (relationship === 'partner') {
    if (has('tao') || has('mày')) {
      warnings.push('Output uses tao/mày toward a partner (usually inappropriate).');
    }
    if (has('tôi') && (has('anh') || has('chị'))) {
      warnings.push('Output uses formal tôi/anh-chị stack — reads cold for a partner.');
    }
  } else if (relationship === 'friend') {
    if (DA_OPENER_RE.test(lower) && A_CLOSER_RE.test(lower)) {
      warnings.push('Output uses formal dạ/ạ markers in a friend relationship — overly stiff.');
    }
  }

  return { ok: warnings.length === 0, warnings };
}

// Build a focused system-prompt block with the detected evidence so the model
// has both the stored relationship and the in-text signals to weigh. When
// memory was used, the framing is more directive (don't second-guess) to
// prevent the model from defaulting to subject-position-as-speaker on
// sentences like "Anh nịnh em thôi" where the grammatical subject is
// actually the listener.
export function buildPronounContextPrompt(signals: PronounSignals): string {
  if (!signals.inferredRelationship || signals.confidence < 0.5) return '';
  const memoryUsed = signals.matchedTokens.some(
    (t) => t.includes('[MEMORY OVERRIDE]') || t.includes('[MEMORY CONFIRMS]')
  );

  const lines: string[] = ['', '# PRONOUN CONTEXT (this is the speaker’s established pronoun pair):'];
  if (signals.selfPronoun)
    lines.push(`- The SPEAKER (sender of this message) self-references as: "${signals.selfPronoun}"`);
  if (signals.otherPronoun)
    lines.push(`- The SPEAKER addresses the LISTENER (the user reading the translation) as: "${signals.otherPronoun}"`);
  lines.push(
    `- Relationship: ${signals.inferredRelationship} (confidence ${(signals.confidence * 100).toFixed(0)}%)`
  );
  if (signals.inferredGender.speaker)
    lines.push(`- Likely speaker gender: ${signals.inferredGender.speaker}`);
  if (signals.inferredGender.other)
    lines.push(`- Likely listener gender: ${signals.inferredGender.other}`);

  if (memoryUsed) {
    lines.push('');
    lines.push(
      '⚠ CRITICAL: This pair is locked from prior conversation memory. When you see "anh"/"em"/"chị" in the source, resolve them according to this map — do NOT assume the first pronoun in the sentence is the speaker. In Vietnamese SVO, the first pronoun is just the grammatical subject; the speaker identity is fixed by the established pair above.'
    );
    lines.push(
      `Concrete example: if speaker=${signals.selfPronoun} and listener=${signals.otherPronoun}, then "${signals.otherPronoun} VERB ${signals.selfPronoun}" means "the LISTENER verbs the SPEAKER" (i.e., you, the user, did the verb to the contact). Do NOT translate as "I VERB you" just because the first pronoun comes first.`
    );
  } else {
    lines.push(
      'Anchor your translation to this evidence. The detected pair takes priority over generic relationship guidance when they conflict.'
    );
  }
  return lines.join('\n');
}

// Build a prompt block for the genuinely-ambiguous case: the source has
// both anh+em (or em+chị) but no vocative marker and no contact memory,
// so the speaker cannot be determined from surface text alone. Tells the
// model not to default to "first pronoun = speaker" and gives it concrete
// disambiguation evidence to weigh.
export function buildAmbiguousPronounPrompt(signals: PronounSignals): string {
  if (!signals.ambiguousPair) return '';

  const isPartner = signals.inferredRelationship === 'partner';
  const otherPronoun =
    signals.otherPronoun ||
    (signals.inferredGender.other === 'f' ? 'chị' : 'anh');

  const lines: string[] = [
    '',
    '# AMBIGUOUS PRONOUN PAIR (no vocative, no established memory):',
    `- The Vietnamese source contains both "em" and "${otherPronoun}", but neither is marked as the addressee (no "X ơi" vocative) and we have no prior conversation memory to lock the speaker's identity.`,
    '- CRITICAL: in Vietnamese SVO, the FIRST pronoun in the sentence is just the grammatical subject — it is NOT a reliable indicator of who is speaking. The same string "anh VERB em" can mean either "I (em) am reporting that anh did VERB to me" or "I (anh) did VERB to em" — opposite speakers.',
    '- Disambiguate from CONTENT, not surface order:',
    '  • Who is reporting the experience or feeling?',
    '  • Whose situation is being described?',
    '  • Who is the natural narrator of a 1v1 chat message in this tone?',
    '  • Is there an action-verb directionality that only makes sense one way?',
    '- TIE-BREAKER: pick the reading that is consistent across ALL clauses of the message. Do NOT flip the speaker mid-message. If interpretation A makes one clause coherent but produces a contradiction in another clause, interpretation B is correct.',
  ];
  if (isPartner) {
    lines.push(
      '- Romantic register hint: intimacy markers (yêu/nhớ/thương/cưng) suggest a partner relationship. Use this for tone/register only — it does NOT pin direction (both "em yêu anh" and "anh yêu em" are common).'
    );
  }
  return lines.join('\n');
}

// Apply pronoun verification to every translated option in a result blob,
// attaching `_pronounWarning` (parallel to `_aspectWarning`) on mismatch.
export function fixPronounPairs(
  result: Record<string, unknown>,
  relationship: RelationshipKey
): Record<string, unknown> {
  const options = result.options as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(options)) return result;

  return {
    ...result,
    options: options.map((option) => {
      const translation = option.translation as string;
      if (!translation) return option;
      const verification = verifyPronounPair(translation, relationship);
      if (!verification.ok) {
        return { ...option, _pronounWarning: verification.warnings.join('; ') };
      }
      return option;
    }),
  };
}
