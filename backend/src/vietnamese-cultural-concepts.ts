// Vietnamese cultural concepts — words that don't translate cleanly to English
// because they encode constellations of meaning English doesn't bundle.
//
// On VI→EN, when the source contains one of these terms, we inject a focused
// prompt block with the literal meaning, typical context, and recommended
// English renderings, then ask the model to populate `culturalWarnings` so
// the user sees the original concept behind the English choice.
//
// LEARNING: each concept has a per-concept exposure threshold. When the user
// has seen the cultural callout for a concept N times (counts passed in via
// `culturalConceptCounts`), we silently suppress: the concept is removed from
// the prompt entirely (model sees nothing about it) and from culturalWarnings
// (frontend renders nothing). Translation quality is unchanged.

import { vnRe } from './vn-regex';

export interface CulturalConcept {
  // Primary canonical term used as the dictionary key + counts key.
  term: string;
  // Alternate spellings (e.g., phước/phúc) that map to the same concept.
  variants?: string[];
  // Compound suffixes that strip the cultural sense.
  // E.g., "thương mại" (commerce) is NOT cultural-thương (love/care).
  excludeFollowedBy?: string[];
  // Same idea on the leading side (less common).
  excludePrecededBy?: string[];
  literalMeaning: string;
  context: string;
  englishRenderings: string[];
  guidance: string;
  // Exposures before suppression. Defaults to 3.
  learnAfter?: number;
}

const DEFAULT_LEARN_AFTER = 3;

export const CULTURAL_CONCEPTS: CulturalConcept[] = [
  {
    term: 'duyên',
    excludeFollowedBy: ['dáng'], // duyên dáng = graceful (different sense)
    literalMeaning: 'fated affinity / predestined connection',
    context: 'romantic compatibility, unexpected meetings, life paths that feel meant to be',
    englishRenderings: ['fate', 'serendipity', 'chemistry', 'meant to be', 'kismet'],
    guidance: 'No single English word captures this. Pick the rendering that fits the surrounding context.',
    learnAfter: 3,
  },
  {
    term: 'hiếu',
    excludeFollowedBy: ['kỳ', 'chiến', 'thắng', 'khách'], // hiếu kỳ = curious, hiếu chiến = warlike
    literalMeaning: 'filial piety / lifetime devotion of a child to their parents',
    context: 'family obligation, honoring parents, the moral debt children owe',
    englishRenderings: ['filial piety', 'devotion to parents', 'family devotion', 'a good son/daughter'],
    guidance: 'English "respect for parents" is too weak. This implies a deep, lifelong, near-religious obligation.',
    learnAfter: 2,
  },
  {
    term: 'nghĩa',
    excludeFollowedBy: ['vụ', 'là', 'trang'], // nghĩa vụ = duty, nghĩa là = "means", nghĩa trang = cemetery
    excludePrecededBy: ['vô', 'ý', 'chữ', 'định'], // vô nghĩa = meaningless, ý nghĩa = meaning, chữ nghĩa = literacy
    literalMeaning: 'moral debt of relationship / righteousness / honoring of bonds',
    context: 'loyalty, the bond of duty within love or friendship, repaying kindness',
    englishRenderings: ['moral bond', 'loyalty', 'sense of duty', 'a debt of honor', 'righteousness'],
    guidance: 'Often pairs with tình ("tình nghĩa" = the bond of love + duty). Avoid "righteousness" alone — it sounds archaic.',
    learnAfter: 3,
  },
  {
    term: 'tình cảm',
    literalMeaning: 'sentiment / emotional connection as a category of feeling',
    context: 'describing the emotional quality of a relationship; broader than "love" or "feelings"',
    englishRenderings: ['feelings', 'affection', 'emotional bond', 'sentiment'],
    guidance: '"Affection" or "feelings" usually fits, but "tình cảm" specifically frames feelings as something cultivated, not just experienced.',
    learnAfter: 4,
  },
  {
    term: 'thương',
    excludeFollowedBy: [
      'mại', 'nghiệp', 'phẩm', 'binh', 'vong', 'tích', 'gia', 'hiệu', 'nhân',
    ], // thương mại = commerce, thương binh = wounded soldier, etc.
    literalMeaning: 'tender care / love mixed with pity, protectiveness, or compassion',
    context: 'parental love, deep care for a partner, compassion for someone vulnerable',
    englishRenderings: ['love', 'care for', 'feel for', 'have tenderness for', 'have a soft spot for'],
    guidance: '"Yêu" is romantic love; "thương" is broader and warmer — closer to caring tenderness. Often used between family members and longtime partners.',
    learnAfter: 5,
  },
  {
    term: 'khách sáo',
    literalMeaning: 'formally polite in a way that creates distance',
    context: 'when someone refuses help, says "no thank you" too formally, or treats a close friend like a stranger',
    englishRenderings: ['stand on ceremony', 'be formal', 'be a stranger about it', 'overdo politeness'],
    guidance: '"Đừng khách sáo" → "Don\'t stand on ceremony" or "Don\'t be a stranger." Implies the relationship is closer than the formality suggests.',
    learnAfter: 2,
  },
  {
    term: 'tâm sự',
    literalMeaning: 'heart-sharing / emotional disclosure with a trusted person',
    context: 'late-night conversations, opening up about something personal, what you\'d tell only a close friend',
    englishRenderings: ['open up', 'heart-to-heart', 'share what\'s on my heart', 'confide in'],
    guidance: 'Stronger than "talk" or "vent" — implies trust and intimacy. "Mình tâm sự với nhau" = "we open up to each other."',
    learnAfter: 3,
  },
  {
    term: 'sĩ diện',
    literalMeaning: 'face / social pride / fear of being shamed',
    context: 'someone refusing help to save face, putting on a brave front, prioritizing reputation over comfort',
    englishRenderings: ['save face', 'pride', 'put on a front', 'concerned about appearances'],
    guidance: 'Closely related to East Asian "face" concept. "Vì sĩ diện" = "to save face."',
    learnAfter: 2,
  },
  {
    term: 'mặt mũi',
    literalMeaning: 'face / dignity / social standing',
    context: 'losing or saving face, public dignity in front of family or community',
    englishRenderings: ['face', 'dignity', 'public standing'],
    guidance: '"Mất mặt" = "lose face." "Nể mặt" = "out of respect for [someone\'s] standing."',
    learnAfter: 2,
  },
  {
    term: 'lễ phép',
    literalMeaning: 'polite manners according to social hierarchy',
    context: 'a child being properly respectful to elders, using correct address terms, showing deference',
    englishRenderings: ['well-mannered', 'properly respectful', 'shows good manners'],
    guidance: 'Stronger than English "polite" — implies the proper recognition of status, not just niceness.',
    learnAfter: 2,
  },
  {
    term: 'phước',
    variants: ['phúc'],
    excludePrecededBy: ['hạnh', 'chúc', 'diễm'], // hạnh phúc = happy, chúc phúc = well-wishing
    literalMeaning: 'blessing / fortune with karmic connotations',
    context: 'feeling lucky/blessed in a way connected to past good deeds; gratitude for unearned good',
    englishRenderings: ['blessing', 'good fortune', 'blessed', 'lucky'],
    guidance: '"Có phước" = "to be blessed." Carries a sense that the fortune is karmically earned, not random.',
    learnAfter: 3,
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface CulturalConceptMatch {
  term: string; // the concept's canonical key
  matched: string; // the actual surface form found
  context: string; // ~3 tokens before and after, for the prompt
  literalMeaning: string;
  typicalContext: string;
  englishRenderings: string[];
  guidance: string;
}

function tokenizeWithIndex(text: string): Array<{ token: string; start: number; end: number }> {
  const result: Array<{ token: string; start: number; end: number }> = [];
  const re = /\S+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    result.push({ token: m[0], start: m.index, end: m.index + m[0].length });
  }
  return result;
}

function captureWindow(text: string, matchStart: number, matchEnd: number): string {
  const tokens = tokenizeWithIndex(text);
  const matchTokenIdx = tokens.findIndex((t) => t.start <= matchStart && t.end >= matchEnd);
  if (matchTokenIdx === -1) return text.substring(Math.max(0, matchStart - 30), Math.min(text.length, matchEnd + 30));
  const before = tokens.slice(Math.max(0, matchTokenIdx - 3), matchTokenIdx).map((t) => t.token).join(' ');
  const after = tokens.slice(matchTokenIdx + 1, matchTokenIdx + 4).map((t) => t.token).join(' ');
  const matched = tokens[matchTokenIdx].token;
  return `${before ? before + ' ' : ''}«${matched}»${after ? ' ' + after : ''}`;
}

function isExcludedByCompound(text: string, matchStart: number, matchEnd: number, concept: CulturalConcept): boolean {
  const lower = text.toLowerCase();
  if (concept.excludeFollowedBy && concept.excludeFollowedBy.length > 0) {
    // Match any whitespace then one of the excluded suffixes
    const tail = lower.substring(matchEnd);
    const tailMatch = tail.match(/^\s+(\S+)/u);
    if (tailMatch) {
      const nextWord = tailMatch[1].replace(/[.,!?;:'"]+$/u, '');
      if (concept.excludeFollowedBy.includes(nextWord)) return true;
    }
  }
  if (concept.excludePrecededBy && concept.excludePrecededBy.length > 0) {
    const head = lower.substring(0, matchStart);
    const headMatch = head.match(/(\S+)\s+$/u);
    if (headMatch) {
      const prevWord = headMatch[1].replace(/^[.,!?;:'"]+/u, '');
      if (concept.excludePrecededBy.includes(prevWord)) return true;
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
  const seen = counts[conceptTerm] || 0;
  return seen >= threshold;
}

export function detectCulturalConcepts(
  text: string,
  counts?: Record<string, number>
): CulturalConceptMatch[] {
  const matches: CulturalConceptMatch[] = [];

  for (const concept of CULTURAL_CONCEPTS) {
    const threshold = concept.learnAfter ?? DEFAULT_LEARN_AFTER;
    if (isLearned(concept.term, counts, threshold)) continue; // silent suppression

    const variants = [concept.term, ...(concept.variants || [])];
    let foundForThisConcept = false;

    for (const variant of variants) {
      if (foundForThisConcept) break;
      const re = vnRe(variant, 'gi');
      let execMatch: RegExpExecArray | null;
      // Reset lastIndex defensively in case of /g
      re.lastIndex = 0;
      while ((execMatch = re.exec(text)) !== null) {
        const matchStart = execMatch.index;
        const matchEnd = matchStart + execMatch[0].length;
        if (isExcludedByCompound(text, matchStart, matchEnd, concept)) continue;
        matches.push({
          term: concept.term,
          matched: execMatch[0],
          context: captureWindow(text, matchStart, matchEnd),
          literalMeaning: concept.literalMeaning,
          typicalContext: concept.context,
          englishRenderings: concept.englishRenderings,
          guidance: concept.guidance,
        });
        foundForThisConcept = true;
        break;
      }
    }
  }

  return matches;
}

// Build a focused system-prompt block listing each detected (non-learned)
// concept with its meaning, context window, recommended renderings, and an
// instruction to populate culturalWarnings.
export function buildCulturalConceptsPrompt(matches: CulturalConceptMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# CULTURAL CONCEPTS DETECTED IN SOURCE:'];
  lines.push('Each of the following terms has no clean English equivalent. Pick a rendering from the suggested list based on the surrounding context, and populate `culturalWarnings` with one entry per term so the user sees the original meaning.');
  lines.push('');
  for (const m of matches) {
    lines.push(`- "${m.term}" (matched as: "${m.matched}", context: ${m.context})`);
    lines.push(`  Meaning: ${m.literalMeaning}`);
    lines.push(`  Typical context: ${m.typicalContext}`);
    lines.push(`  Pick from: ${m.englishRenderings.map((r) => `"${r}"`).join(', ')}`);
    lines.push(`  Guidance: ${m.guidance}`);
    lines.push(`  In culturalWarnings: type="cultural_concept", term="${m.term}", literalMeaning="${m.literalMeaning}", suggestion=<your chosen rendering>.`);
    lines.push('');
  }
  return lines.join('\n');
}
