// Modern English cultural concepts that don't translate cleanly to Vietnamese.
//
// These are concepts from therapy culture, modern dating, wellness industry,
// and Gen-Z social vocabulary that carry meaning beyond their literal
// dictionary translation. When a sender uses "closure" or "boundaries" in
// a chat with a Vietnamese friend, the cultural framing usually gets stripped
// in translation. This module:
//
//   1. Tells the model the cultural meaning so it picks an appropriate VN
//      rendering (not just the dictionary literal).
//   2. Asks the model to surface a cultural-concept warning so the user
//      sees the original concept on first encounter.
//   3. Tracks per-user exposure counts (shared with Vietnamese cultural
//      concepts via the same `culturalConceptCounts` map). Once the user
//      has seen the concept enough times, the chip and prompt-block both
//      stop firing — translation continues with the established rendering.
//
// Risk-1 mitigation (common-word collisions): each entry has optional
// excludeFollowedBy / excludePrecededBy that catch the obvious literal-sense
// contexts ("store closure", "property boundaries", "toxic waste").
//
// Risk-2 mitigation (multi-sense): contextHint enumerates which sense
// applies in which context.
//
// Risk-3 mitigation (loanwords): per-concept learnAfter — words like "vibe"
// and "FOMO" that are already used as loanwords in modern Vietnamese chat
// have learnAfter:1 (gloss once, then silent). Heavier therapy-culture
// concepts get higher thresholds.

export interface EnglishCulturalConcept {
  // Canonical phrase for the dictionary key. Counts use this as the term key.
  term: string;
  // Alternate forms (plurals, hyphenations, derivatives) that map to the
  // same concept. Plural "boundaries" maps to canonical "boundary"-class etc.
  variants?: string[];
  // Words/phrases that, when adjacent to the term, switch off the cultural
  // sense (literal/technical reading instead). E.g., "closure of" → business
  // closing.
  excludeFollowedBy?: string[];
  excludePrecededBy?: string[];
  literalMeaning: string;
  culturalMeaning: string;
  vnRenderings: string;
  contextHint: string;
  // Default 3. Loanwords (vibe, FOMO) at 1; heavy concepts at 3.
  learnAfter?: number;
}

const DEFAULT_LEARN_AFTER = 3;

export const ENGLISH_CULTURAL_CONCEPTS: EnglishCulturalConcept[] = [
  {
    term: 'closure',
    excludeFollowedBy: ['of'], // "closure of the business" → literal
    excludePrecededBy: ['business', 'store', 'company', 'office', 'school', 'road', 'border', 'shop', 'restaurant'],
    literalMeaning: 'the act of closing something',
    culturalMeaning: 'therapy-culture concept of emotional resolution after a relationship or difficult event ends',
    vnRenderings: 'sự kết thúc trọn vẹn / khép lại chuyện cũ / sự giải tỏa cảm xúc',
    contextHint: 'Apply cultural meaning when discussing relationships, breakups, grief, or emotional resolution. Use literal "đóng cửa" / "kết thúc" only for businesses, roads, or physical things.',
    learnAfter: 2,
  },
  {
    term: 'boundaries',
    variants: ['boundary'],
    excludeFollowedBy: ['of'], // "boundaries of the country" → literal
    excludePrecededBy: ['property', 'national', 'state', 'country', 'physical', 'geographic', 'territorial'],
    literalMeaning: 'physical or territorial limits',
    culturalMeaning: 'psychology-context healthy emotional/relational limits between people',
    vnRenderings: 'giới hạn cá nhân / ranh giới (trong mối quan hệ) / sự độc lập cảm xúc',
    contextHint: 'Apply cultural meaning when discussing relationships, mental health, or interpersonal dynamics. Use literal "ranh giới" only for property, geography, or physical limits.',
    learnAfter: 2,
  },
  {
    term: 'gaslighting',
    variants: ['gaslit', 'gaslight'],
    literalMeaning: 'no literal reading in modern chat',
    culturalMeaning: 'manipulation tactic where someone makes you doubt your own perception of reality',
    vnRenderings: 'thao túng tâm lý / khiến ai đó nghi ngờ chính mình',
    contextHint: 'Always cultural/psychological in modern chat. Borrowed from a 1944 film "Gaslight" where the antagonist did exactly this.',
    learnAfter: 3,
  },
  {
    term: 'FOMO',
    variants: ['fomo'],
    literalMeaning: 'acronym',
    culturalMeaning: 'fear of missing out — anxiety that others are having rewarding experiences from which one is absent',
    vnRenderings: 'FOMO (loanword, đã được dùng) / nỗi sợ bị bỏ lại / lo bị bỏ lỡ',
    contextHint: 'Already used as a loanword in modern VN. Preserve "FOMO" as-is on first mention with brief gloss; subsequent uses just translate naturally.',
    learnAfter: 1,
  },
  {
    term: 'ghosting',
    variants: ['ghost', 'ghosted', 'ghosts'],
    literalMeaning: 'haunting (literal) or seeing apparitions',
    culturalMeaning: 'modern dating term: cutting off all contact with someone without explanation',
    vnRenderings: 'biến mất không lời từ biệt / cắt liên lạc đột ngột / "ghost" (loanword now used in modern VN)',
    contextHint: 'Cultural meaning when discussing dating, relationships, or contact patterns. Literal "ghost" (ma) is rare in modern chat.',
    learnAfter: 1,
  },
  {
    term: 'personal space',
    literalMeaning: 'physical area around a person',
    culturalMeaning: 'cultural emphasis on physical AND emotional autonomy/solitude — particularly Western',
    vnRenderings: 'không gian riêng / sự riêng tư cá nhân / khoảng không gian cá nhân',
    contextHint: 'Apply cultural meaning when discussing comfort, autonomy, alone-time, or interpersonal distance. Vietnamese culture has different baseline expectations around personal space than Western culture.',
    learnAfter: 3,
  },
  {
    term: 'self-care',
    variants: ['selfcare', 'self care'],
    literalMeaning: 'caring for oneself',
    culturalMeaning: 'wellness-industry concept of intentional practices for mental/physical wellbeing',
    vnRenderings: 'chăm sóc bản thân / dành thời gian cho mình / nuôi dưỡng sức khỏe tinh thần',
    contextHint: 'Apply cultural meaning when discussing mental health, wellness routines, or rest. The wellness-industry framing is novel in VN — explain on first encounter.',
    learnAfter: 3,
  },
  {
    term: 'red flag',
    variants: ['red flags'],
    literalMeaning: 'an actual red flag (warning signal)',
    culturalMeaning: 'modern slang: warning sign in a relationship or person\'s behavior',
    vnRenderings: 'dấu hiệu cảnh báo (trong mối quan hệ) / "red flag" (loanword đã quen thuộc với Gen Z VN)',
    contextHint: 'Almost always cultural meaning in modern chat. Vietnamese Gen Z uses "red flag" as loanword. Preserve as-is on first mention with brief gloss.',
    learnAfter: 1,
  },
  {
    term: 'green flag',
    variants: ['green flags'],
    literalMeaning: 'an actual green flag',
    culturalMeaning: 'modern slang: positive sign in a relationship or person\'s behavior',
    vnRenderings: 'dấu hiệu tích cực (trong mối quan hệ) / "green flag" (loanword)',
    contextHint: 'Always cultural in modern chat. Pair with "red flag" framing.',
    learnAfter: 1,
  },
  {
    term: 'vibe',
    variants: ['vibes', 'vibe check', 'vibing'],
    literalMeaning: 'literally vibration',
    culturalMeaning: 'modern social term for atmosphere, mood, or emotional resonance of a person/place/situation',
    vnRenderings: '"vibe" (đã là loanword trong tiếng Việt hiện đại) / không khí / cảm giác tổng thể',
    contextHint: 'Already a loanword in modern VN chat. Preserve "vibe" as-is. Only gloss on first mention with brief explanation.',
    learnAfter: 1,
  },
  {
    term: 'oversharing',
    variants: ['overshare', 'overshared', 'overshares'],
    literalMeaning: 'no literal reading',
    culturalMeaning: 'sharing too much personal information, often violating an implicit social boundary',
    vnRenderings: 'kể quá chi tiết / chia sẻ quá riêng tư / nói quá đà về chuyện riêng',
    contextHint: 'Always cultural. Implies a violation of unstated social norms around what should be kept private — these norms differ between cultures.',
    learnAfter: 3,
  },
  {
    term: 'toxic',
    excludeFollowedBy: [
      'waste', 'chemicals', 'fumes', 'gas', 'substance', 'substances',
      'metal', 'metals', 'compound', 'material', 'fluid', 'mold',
    ],
    excludePrecededBy: ['non', 'non-'],
    literalMeaning: 'poisonous / containing harmful substances',
    culturalMeaning: 'in relationships: harmful, manipulative, or emotionally damaging behavior or person',
    vnRenderings: 'độc hại (trong mối quan hệ — emotion sense) / "toxic" (đã là loanword)',
    contextHint: 'Apply cultural meaning when discussing people, relationships, friendships, workplaces, or behavior patterns. Use literal độc hại for actual chemicals/poisons.',
    learnAfter: 2,
  },
  {
    term: 'triggered',
    variants: ['triggering', 'triggers', 'trigger'],
    literalMeaning: '1) caused / set off (technical); 2) pulled the trigger (gun)',
    culturalMeaning: 'psychology-context: having a strong involuntary emotional reaction, often connected to trauma',
    vnRenderings: 'bị kích động cảm xúc / khơi gợi nỗi đau cũ / "triggered" (loanword, ngày càng phổ biến)',
    contextHint: 'Apply cultural meaning when subject is a person\'s reaction to something emotional. Use literal "kích hoạt" for systems, alarms, or technical events. The therapy-culture sense is increasingly used.',
    learnAfter: 2,
  },
  {
    term: 'passive-aggressive',
    variants: ['passive aggressive'],
    literalMeaning: 'no clean literal reading',
    culturalMeaning: 'communication style of expressing hostility indirectly through procrastination, sarcasm, or "joking" insults',
    vnRenderings: 'nói cạnh khóe / hờn dỗi ngấm ngầm / công kích gián tiếp',
    contextHint: 'Always cultural. Vietnamese has nói cạnh khóe (saying things obliquely) which captures part of this, but the modern "passive-aggressive" term carries specific therapy-culture framing.',
    learnAfter: 2,
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface EnglishCulturalConceptMatch {
  term: string;
  matched: string;
  literalMeaning: string;
  culturalMeaning: string;
  vnRenderings: string;
  contextHint: string;
}

function isExcludedByCompound(
  text: string,
  matchStart: number,
  matchEnd: number,
  concept: EnglishCulturalConcept
): boolean {
  const lower = text.toLowerCase();
  if (concept.excludeFollowedBy?.length) {
    const tail = lower.substring(matchEnd);
    const tailMatch = tail.match(/^\s+(\S+(?:\s+\S+)?)/);
    if (tailMatch) {
      const next = tailMatch[1].replace(/[.,!?;:'"]+$/, '');
      for (const excl of concept.excludeFollowedBy) {
        if (next === excl || next.startsWith(excl + ' ') || next.startsWith(excl)) {
          return true;
        }
      }
    }
  }
  if (concept.excludePrecededBy?.length) {
    const head = lower.substring(0, matchStart);
    // Capture the last alphabetic word before the match, allowing optional
    // possessive 's and trailing hyphens/whitespace. Handles both
    // "store closure" (whitespace-separated) and "non-toxic" (hyphen-attached).
    const headMatch = head.match(/([a-z]+)(?:'s)?[\s\-]*$/i);
    if (headMatch) {
      const prev = headMatch[1];
      for (const excl of concept.excludePrecededBy) {
        if (prev === excl) return true;
      }
    }
  }
  return false;
}

function isLearned(
  conceptTerm: string,
  counts: Record<string, number> | undefined,
  threshold: number
): boolean {
  if (!counts) return false;
  return (counts[conceptTerm] || 0) >= threshold;
}

function buildPhraseRegex(phrase: string): RegExp {
  const tokens = phrase.split(/\s+/).map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const body = tokens.join('\\s+');
  return new RegExp(`\\b${body}\\b`, 'i');
}

export function detectEnglishCulturalConcepts(
  text: string,
  counts?: Record<string, number>
): EnglishCulturalConceptMatch[] {
  const matches: EnglishCulturalConceptMatch[] = [];

  for (const concept of ENGLISH_CULTURAL_CONCEPTS) {
    const threshold = concept.learnAfter ?? DEFAULT_LEARN_AFTER;
    if (isLearned(concept.term, counts, threshold)) continue; // silent suppression

    const phrasesToTry = [concept.term, ...(concept.variants || [])];
    let foundForThisConcept = false;

    for (const variant of phrasesToTry) {
      if (foundForThisConcept) break;
      const re = buildPhraseRegex(variant);
      const m = text.match(re);
      if (!m || m.index === undefined) continue;

      const start = m.index;
      const end = start + m[0].length;
      if (isExcludedByCompound(text, start, end, concept)) continue;

      matches.push({
        term: concept.term,
        matched: m[0],
        literalMeaning: concept.literalMeaning,
        culturalMeaning: concept.culturalMeaning,
        vnRenderings: concept.vnRenderings,
        contextHint: concept.contextHint,
      });
      foundForThisConcept = true;
    }
  }

  return matches;
}

// Build a focused system-prompt block. Asks the model to translate with the
// VN equivalent (NOT replace the term entirely) and add a brief gloss in
// parentheses on first mention. The model populates culturalWarnings with
// type='cultural_concept' so the existing frontend chip renders it.
export function buildEnglishCulturalConceptsPrompt(
  matches: EnglishCulturalConceptMatch[]
): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# ENGLISH CULTURAL CONCEPTS DETECTED IN SOURCE:'];
  lines.push(
    'Each concept below has both a literal meaning and a culturally-loaded modern meaning. Use the contextHint to decide which applies. When the cultural meaning fits, render with the suggested VN equivalent and add a brief gloss in parentheses on first mention so the listener sees the original concept. Populate culturalWarnings with one entry per term: type="cultural_concept", term=<the term>, literalMeaning=<short cultural explanation>.'
  );
  lines.push('');
  for (const m of matches) {
    lines.push(`- "${m.term}" (matched: "${m.matched}")`);
    lines.push(`  Literal: ${m.literalMeaning}`);
    lines.push(`  Cultural: ${m.culturalMeaning}`);
    lines.push(`  VN renderings: ${m.vnRenderings}`);
    lines.push(`  When to apply cultural meaning: ${m.contextHint}`);
    lines.push('');
  }
  return lines.join('\n');
}
