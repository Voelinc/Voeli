// Detector for Vietnamese figurative-language patterns.
//
// Why this exists: the base prompt now tells the model to scan for figurative
// language before translating, but models still occasionally literal-translate
// phrases that have a recognizable idiomatic shape — especially classical
// 4-syllable thành ngữ and body-part metaphors. This module catches those
// patterns explicitly and surfaces them to the model with their idiomatic
// meaning, so the model commits to the non-literal reading instead of
// defaulting to surface words.
//
// Complements vietnamese-english-idioms.ts (cross-language equivalence pairs)
// rather than replacing it. The two run in series — the equivalence dict
// catches phrases with a clean English mapping, this module catches the
// long tail of culturally-specific Vietnamese idioms where there's no
// drop-in English equivalent (just a meaning to preserve).

import { vnRe } from './vn-regex';

export interface FigurativeMatch {
  type: 'classical-idiom' | 'body-part-metaphor' | 'animal-comparison';
  phrase: string;
  literal: string;
  meaning: string;
}

// Classical Vietnamese idioms (thành ngữ + tục ngữ). Curated for everyday-
// chat frequency rather than literary completeness — these are the ones a
// person actually drops into a text message. Keep entries tight; the goal
// is to PREVENT literal translation, not to exhaustively catalog.
const CLASSICAL_IDIOMS: Array<{
  phrase: string;
  literal: string;
  meaning: string;
}> = [
  {
    phrase: 'đứng núi này trông núi kia',
    literal: 'stand on this mountain looking at the other',
    meaning: 'never satisfied; always envying what others have',
  },
  {
    phrase: 'xa mặt cách lòng',
    literal: 'far in face, separated in heart',
    meaning: 'out of sight, out of mind',
  },
  {
    phrase: 'ếch ngồi đáy giếng',
    literal: 'a frog at the bottom of a well',
    meaning: 'narrow worldview / limited perspective',
  },
  {
    phrase: 'cá lớn nuốt cá bé',
    literal: 'big fish swallows small fish',
    meaning: 'the strong dominate the weak / survival of the fittest',
  },
  {
    phrase: 'chân ướt chân ráo',
    literal: 'one foot wet, one foot dry',
    meaning: 'newly arrived; new to the situation',
  },
  {
    phrase: 'đầu voi đuôi chuột',
    literal: 'elephant head, mouse tail',
    meaning: 'big start, weak finish; promising beginning that fizzles',
  },
  {
    phrase: 'đầu xuôi đuôi lọt',
    literal: 'head smooth, tail through',
    meaning: 'a good start guarantees a smooth finish',
  },
  {
    phrase: 'con sâu làm rầu nồi canh',
    literal: 'one worm spoils the soup pot',
    meaning: 'one bad person ruins the whole group',
  },
  {
    phrase: 'lá lành đùm lá rách',
    literal: 'whole leaves wrap torn leaves',
    meaning: 'the fortunate help the less fortunate',
  },
  {
    phrase: 'uống nước nhớ nguồn',
    literal: 'drink water, remember the source',
    meaning: 'remember those who helped you; be grateful for your origins',
  },
  {
    phrase: 'có công mài sắt có ngày nên kim',
    literal: 'with effort grinding iron, one day it becomes a needle',
    meaning: 'persistence pays off / patience and effort win',
  },
  {
    phrase: 'tốt gỗ hơn tốt nước sơn',
    literal: 'good wood is better than good paint',
    meaning: 'substance matters more than appearance',
  },
  {
    phrase: 'ăn xổi ở thì',
    literal: 'eat hastily, live for the moment',
    meaning: 'live recklessly with no long-term thinking',
  },
  {
    phrase: 'đi đêm có ngày gặp ma',
    literal: 'going at night will eventually meet a ghost',
    meaning: 'risky behavior eventually catches up with you',
  },
  {
    phrase: 'trăm hay không bằng tay quen',
    literal: 'a hundred clever ideas don\'t beat a familiar hand',
    meaning: 'practice beats theory',
  },
  {
    phrase: 'gần mực thì đen gần đèn thì sáng',
    literal: 'near ink turns black, near a lamp turns bright',
    meaning: 'you become like the people around you',
  },
  {
    phrase: 'một cây làm chẳng nên non',
    literal: 'one tree does not make a forest',
    meaning: 'no one succeeds alone; teamwork is essential',
  },
  {
    phrase: 'chở củi về rừng',
    literal: 'carry firewood to the forest',
    meaning: 'pointless effort; redundant work',
  },
  {
    phrase: 'nước chảy đá mòn',
    literal: 'water flowing erodes stone',
    meaning: 'persistence wears down obstacles',
  },
  {
    phrase: 'đi một ngày đàng học một sàng khôn',
    literal: 'travel a day, learn a basket of wisdom',
    meaning: 'travel and experience teach more than books',
  },
  {
    phrase: 'không có lửa làm sao có khói',
    literal: 'without fire, where does smoke come from',
    meaning: 'where there\'s smoke there\'s fire / rumors usually have a basis',
  },
  {
    phrase: 'bụng làm dạ chịu',
    literal: 'belly does, intestines bear it',
    meaning: 'face the consequences of your own actions',
  },
];

// Body-part + modifier pairs. Vietnamese body-part metaphors are hugely
// productive — these are tight pairs where the figurative reading is far
// more common than literal. Listed with context-shifted meanings so the
// model knows the abstract sense to render.
const BODY_PART_METAPHORS: Array<{
  phrase: string;
  literal: string;
  meaning: string;
}> = [
  { phrase: 'mặt dày', literal: 'thick face', meaning: 'shameless / bold-faced' },
  { phrase: 'mặt mỏng', literal: 'thin face', meaning: 'easily embarrassed; thin-skinned' },
  { phrase: 'mặt lạnh', literal: 'cold face', meaning: 'expressionless / aloof' },
  { phrase: 'mặt sưng mày sỉa', literal: 'swollen face, raised brow', meaning: 'sulking / visibly displeased' },
  { phrase: 'tay trắng', literal: 'white hand', meaning: 'penniless; starting from nothing' },
  { phrase: 'tay không', literal: 'empty hand', meaning: 'empty-handed; with nothing to show' },
  { phrase: 'lòng tốt', literal: 'good heart', meaning: 'kindness / good-heartedness' },
  { phrase: 'lòng người', literal: 'people\'s heart', meaning: 'human nature; what people are really like' },
  { phrase: 'lòng dạ', literal: 'heart and intestines', meaning: 'true intentions / inner feelings' },
  { phrase: 'ruột để ngoài da', literal: 'guts outside skin', meaning: 'transparent; can\'t hide feelings' },
  { phrase: 'ruột thịt', literal: 'intestine and flesh', meaning: 'blood relatives; close kin' },
  { phrase: 'gan dạ', literal: 'liver and intestines', meaning: 'brave / bold' },
  { phrase: 'máu lạnh', literal: 'cold blood', meaning: 'ruthless / cold-blooded' },
  { phrase: 'đầu đường xó chợ', literal: 'street corner, market alley', meaning: 'rough / streetwise / disreputable' },
  { phrase: 'mất mặt', literal: 'lose face', meaning: 'be humiliated / lose social standing' },
  { phrase: 'nể mặt', literal: 'respect face', meaning: 'do something out of regard for someone\'s standing' },
  { phrase: 'cứng đầu', literal: 'hard head', meaning: 'stubborn' },
  { phrase: 'nhẹ dạ', literal: 'light intestine', meaning: 'gullible / naive' },
  { phrase: 'thâm tâm', literal: 'deep heart', meaning: 'in one\'s innermost thoughts' },
];

// "như (con) ANIMAL" — comparison structure that's almost always figurative
// in Vietnamese chat. Common animal references with their metaphor sense.
const ANIMAL_METAPHORS: Record<string, string> = {
  cá: 'like a fish — usually contextual (slippery, abundant, etc.)',
  gà: 'like a chicken — clueless / a beginner / inexperienced',
  chó: 'like a dog — loyal, or (rude) unpleasant',
  mèo: 'like a cat — sneaky, cute, or pretending',
  bò: 'like a cow — slow, dumb, or hardworking',
  trâu: 'like a buffalo — strong, plodding, hardworking',
  voi: 'like an elephant — large, strong, never forgets',
  hổ: 'like a tiger — fierce, dominant',
  cọp: 'like a tiger — fierce, dominant',
  ếch: 'like a frog — naive / narrow worldview',
  chuột: 'like a mouse — small, sneaky, scurrying',
  rồng: 'like a dragon — powerful, majestic (positive)',
  phượng: 'like a phoenix — graceful, majestic (often female)',
  sói: 'like a wolf — predatory, cunning',
  lợn: 'like a pig — lazy, gluttonous, or slovenly',
  heo: 'like a pig — lazy, gluttonous, or slovenly',
  rắn: 'like a snake — treacherous / cunning',
  cú: 'like an owl — bringing bad luck (in Vietnamese folk belief)',
};

const ANIMAL_PATTERN = vnRe(
  `như\\s+(?:con\\s+)?(${Object.keys(ANIMAL_METAPHORS).join('|')})`,
  'giu',
);

export function detectFigurativePatterns(text: string): FigurativeMatch[] {
  const lower = text.toLowerCase();
  const matches: FigurativeMatch[] = [];
  const seen = new Set<string>();

  // 1. Classical idioms — exact phrase match (case-insensitive). These take
  //    precedence over the body-part / animal heuristics; if a classical
  //    idiom matches, the broader heuristics for the same span are
  //    redundant.
  for (const idiom of CLASSICAL_IDIOMS) {
    if (lower.includes(idiom.phrase) && !seen.has(idiom.phrase)) {
      seen.add(idiom.phrase);
      matches.push({
        type: 'classical-idiom',
        phrase: idiom.phrase,
        literal: idiom.literal,
        meaning: idiom.meaning,
      });
    }
  }

  // 2. Body-part metaphors — exact phrase match.
  for (const m of BODY_PART_METAPHORS) {
    if (lower.includes(m.phrase) && !seen.has(m.phrase)) {
      seen.add(m.phrase);
      matches.push({
        type: 'body-part-metaphor',
        phrase: m.phrase,
        literal: m.literal,
        meaning: m.meaning,
      });
    }
  }

  // 3. "như + (con) + animal" — animal comparison. Match all occurrences,
  //    dedup by animal token.
  ANIMAL_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  const seenAnimals = new Set<string>();
  while ((m = ANIMAL_PATTERN.exec(lower)) !== null) {
    const animal = m[1].toLowerCase();
    if (seenAnimals.has(animal)) continue;
    seenAnimals.add(animal);
    const fullMatch = m[0];
    if (seen.has(fullMatch)) continue;
    seen.add(fullMatch);
    matches.push({
      type: 'animal-comparison',
      phrase: fullMatch,
      literal: `comparison "${fullMatch}"`,
      meaning: ANIMAL_METAPHORS[animal] || 'animal-as-character comparison',
    });
  }

  return matches;
}

export function buildFigurativePatternsPrompt(
  matches: FigurativeMatch[],
): string {
  if (!matches.length) return '';

  const lines: string[] = [
    '',
    '# FIGURATIVE-PATTERN MATCHES (do NOT translate literally):',
    '- The source contains the following phrases that match Vietnamese figurative-language shapes. Render the FIGURATIVE meaning given below, then add a culturalWarning entry of type "idiom" so the receiver sees what was happening underneath.',
  ];

  const grouped: Record<FigurativeMatch['type'], FigurativeMatch[]> = {
    'classical-idiom': [],
    'body-part-metaphor': [],
    'animal-comparison': [],
  };
  for (const m of matches) grouped[m.type].push(m);

  if (grouped['classical-idiom'].length) {
    lines.push('## Classical idioms (thành ngữ / tục ngữ):');
    for (const m of grouped['classical-idiom']) {
      lines.push(
        `  - "${m.phrase}" — literal: ${m.literal}; meaning: ${m.meaning}`,
      );
    }
  }
  if (grouped['body-part-metaphor'].length) {
    lines.push('## Body-part metaphors (literal body part is NOT the meaning):');
    for (const m of grouped['body-part-metaphor']) {
      lines.push(
        `  - "${m.phrase}" — literal: ${m.literal}; meaning: ${m.meaning}`,
      );
    }
  }
  if (grouped['animal-comparison'].length) {
    lines.push(
      '## Animal-as-character comparisons (figurative — render the trait, not the animal):',
    );
    for (const m of grouped['animal-comparison']) {
      lines.push(`  - "${m.phrase}" — ${m.meaning}`);
    }
  }

  lines.push(
    '- For each phrase above, do NOT word-for-word translate. Use the meaning to choose a natural English (or non-literal Vietnamese) rendering, and surface the original via culturalWarnings.',
  );
  return lines.join('\n');
}
