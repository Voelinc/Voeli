// Vietnamese word-segmentation hints.
//
// Vietnamese writes each syllable with a space, but a "word" can be 1–4
// syllables. Most of the time the model parses correctly. This module covers
// two narrow failure modes worth flagging:
//
// 1. Genuinely ambiguous compounds. "Bàn là" can mean "iron" (appliance,
//    one unit) or "table is" (two words). Without a hint the model sometimes
//    picks the wrong parse silently.
//
// 2. Reduplicatives. "Đẹp đẽ", "vui vẻ", "xinh xắn" are expressive units
//    where the second syllable intensifies/colors the first. Translating
//    them as two separate words ("pretty pretty"?) loses the warmth.

import { vnRe } from './vn-regex';

// ─── Ambiguous compounds ──────────────────────────────────────────────────
// Compounds where both readings (one-word vs two-word) are real Vietnamese.
export interface AmbiguousCompound {
  phrase: string;
  primaryReading: string;
  alternateReading: string;
}

export const AMBIGUOUS_COMPOUNDS: AmbiguousCompound[] = [
  {
    phrase: 'bàn là',
    primaryReading: 'iron (the appliance, one unit)',
    alternateReading: 'table is (two words: bàn = table, là = is)',
  },
  {
    phrase: 'đường ray',
    primaryReading: 'railway / railroad track (one unit)',
    alternateReading: 'road ray (two words; nonsensical but possible parse)',
  },
  {
    phrase: 'nhà thờ',
    primaryReading: 'church (one unit)',
    alternateReading: 'house [of] worship (two words; archaic compositional reading)',
  },
  {
    phrase: 'cây cối',
    primaryReading: 'trees / plants in general (one unit, collective)',
    alternateReading: 'tree mortar (two words; nonsensical)',
  },
  {
    phrase: 'dạ dày',
    primaryReading: 'stomach (one unit)',
    alternateReading: '"yes thick" (two words; nonsensical)',
  },
  {
    phrase: 'sao chép',
    primaryReading: 'copy / duplicate (one unit, verb)',
    alternateReading: 'star copy (two words; nonsensical)',
  },
  {
    phrase: 'cứu hỏa',
    primaryReading: 'firefighting / firefighter (one unit)',
    alternateReading: 'rescue fire (two words; compositional but odd)',
  },
  {
    phrase: 'máy bay',
    primaryReading: 'airplane (one unit)',
    alternateReading: 'machine flies (two words; rare reading)',
  },
  {
    phrase: 'mặt trời',
    primaryReading: 'sun (one unit)',
    alternateReading: 'face [of the] sky (two words; poetic compositional)',
  },
  {
    phrase: 'mặt trăng',
    primaryReading: 'moon (one unit)',
    alternateReading: 'face white (two words; nonsensical)',
  },
  {
    phrase: 'chân thành',
    primaryReading: 'sincere (one unit)',
    alternateReading: 'leg + city (two words; nonsensical)',
  },
  {
    phrase: 'lông mày',
    primaryReading: 'eyebrow (one unit)',
    alternateReading: 'fur you (two words; offensive)',
  },
];

// ─── Reduplicatives ───────────────────────────────────────────────────────
// Two-syllable expressive forms that should be treated as a single unit.
// The second syllable typically intensifies, softens, or colors the first.
export interface Reduplicative {
  phrase: string;
  meaning: string;
}

export const REDUPLICATIVES: Reduplicative[] = [
  { phrase: 'đẹp đẽ', meaning: 'pretty / lovely (warmer than just đẹp)' },
  { phrase: 'vui vẻ', meaning: 'happy / cheerful (lighter, breezier than just vui)' },
  { phrase: 'xinh xắn', meaning: 'cute / sweet (affectionate intensifier of xinh)' },
  { phrase: 'nhỏ nhắn', meaning: 'small / petite (affectionate intensifier of nhỏ)' },
  { phrase: 'khỏe khoắn', meaning: 'strong / healthy (intensifier of khỏe)' },
  { phrase: 'mạnh mẽ', meaning: 'strong / powerful (intensifier of mạnh)' },
  { phrase: 'hăng hái', meaning: 'enthusiastic / spirited' },
  { phrase: 'lạnh lẽo', meaning: 'cold / desolate (emotional or environmental)' },
  { phrase: 'ấm áp', meaning: 'warm (warmer than just ấm)' },
  { phrase: 'mềm mại', meaning: 'soft / supple (intensifier of mềm)' },
  { phrase: 'nhẹ nhàng', meaning: 'gentle / light (manner adverb)' },
  { phrase: 'đáng yêu', meaning: 'lovable / adorable' },
  { phrase: 'tươi tắn', meaning: 'fresh / cheerful-looking (intensifier of tươi)' },
  { phrase: 'rộng rãi', meaning: 'spacious / generous (intensifier of rộng)' },
  { phrase: 'đầy đủ', meaning: 'full / complete (paired compound)' },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface AmbiguousCompoundMatch {
  phrase: string;
  primaryReading: string;
  alternateReading: string;
}
export interface ReduplicativeMatch {
  phrase: string;
  meaning: string;
}

export interface SegmentationDetection {
  ambiguous: AmbiguousCompoundMatch[];
  reduplicatives: ReduplicativeMatch[];
}

export function detectSegmentationIssues(text: string): SegmentationDetection {
  const lower = text.toLowerCase();
  const ambiguous: AmbiguousCompoundMatch[] = [];
  const reduplicatives: ReduplicativeMatch[] = [];

  for (const c of AMBIGUOUS_COMPOUNDS) {
    if (vnRe(c.phrase, 'i').test(lower)) {
      ambiguous.push({
        phrase: c.phrase,
        primaryReading: c.primaryReading,
        alternateReading: c.alternateReading,
      });
    }
  }
  for (const r of REDUPLICATIVES) {
    if (vnRe(r.phrase, 'i').test(lower)) {
      reduplicatives.push({ phrase: r.phrase, meaning: r.meaning });
    }
  }

  return { ambiguous, reduplicatives };
}

// Build a focused prompt block for any detected segmentation issues.
export function buildSegmentationPrompt(detection: SegmentationDetection): string {
  if (detection.ambiguous.length === 0 && detection.reduplicatives.length === 0) {
    return '';
  }
  const lines: string[] = [];

  if (detection.ambiguous.length > 0) {
    lines.push('', '# AMBIGUOUS COMPOUNDS DETECTED:');
    for (const a of detection.ambiguous) {
      lines.push(`- "${a.phrase}" can be read two ways:`);
      lines.push(`  • Primary: ${a.primaryReading}`);
      lines.push(`  • Alternate: ${a.alternateReading}`);
    }
    lines.push('Pick the reading that fits the surrounding context. If the choice is genuinely a coin flip, flag in `culturalWarnings` so the user can correct.');
  }

  if (detection.reduplicatives.length > 0) {
    lines.push('', '# REDUPLICATIVE FORMS DETECTED:');
    for (const r of detection.reduplicatives) {
      lines.push(`- "${r.phrase}" — ${r.meaning}`);
    }
    lines.push('Translate each as a single expressive unit. Do not split into two separate English words.');
  }

  return lines.join('\n');
}
