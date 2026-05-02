// Bidirectional idiom dictionary.
//
// English and Vietnamese both have idioms whose literal translations are
// nonsense or misleading. The frontend already has a large slang/idiom
// pattern array in index.html for high-frequency Gen-Z / casual idioms; this
// module is a backend supplement covering classical and conversational
// idioms that aren't in those frontend patterns.
//
// SCOPE: This is a SEED dictionary — ~30 entries. It's not comprehensive.
// The existing user-feedback loop in translation-feedback.ts is the right
// place to grow it from real usage (Risk 3 mitigation).
//
// Mitigations baked in:
//   - Each entry carries a `contextHint` that tells the model when the
//     idiomatic reading applies vs. the literal one (Risk 1: false positive
//     in unintended contexts). Regex alone can't disambiguate context;
//     the prompt makes the model decide.
//   - Phrase-level matching uses strict word boundaries — `\b` for English
//     idioms, VN-aware lookbehind/lookahead for Vietnamese (Risk 2:
//     over-firing on partial matches like "knockout" matching "knocked out").
//   - Output is the existing `culturalWarnings` schema with `type: 'idiom'`,
//     so the frontend's buildWordplayBlock renders it at the top of the
//     picker without any frontend changes.

import { VN_LB, VN_RB } from './vn-regex';

export interface Idiom {
  phrase: string;
  direction: 'en' | 'vi';
  literalMeaning: string;
  idiomaticMeaning: string;
  suggestedRendering: string;
  // When the idiomatic reading applies. The model uses this to decide
  // whether to interpret the phrase idiomatically or literally.
  contextHint: string;
}

export const IDIOMS: Idiom[] = [
  // ─── English idioms (EN→VI) ──────────────────────────────────────────────
  {
    phrase: 'knocked out',
    direction: 'en',
    literalMeaning: 'physically struck unconscious',
    idiomaticMeaning: 'fell asleep deeply / completely exhausted',
    suggestedRendering: 'ngủ thiếp đi / mệt lả',
    contextHint: 'Apply idiomatic reading in casual chat about sleep, fatigue, or recovery. Use literal in fight/sports contexts.',
  },
  {
    phrase: 'kill it',
    direction: 'en',
    literalMeaning: 'to murder something',
    idiomaticMeaning: 'to perform exceptionally well at something',
    suggestedRendering: 'làm rất tốt / xuất sắc',
    contextHint: 'Apply idiomatic in performance/work contexts. Use literal only when "it" refers to an actual living thing.',
  },
  {
    phrase: 'hit me up',
    direction: 'en',
    literalMeaning: 'physically strike me upward',
    idiomaticMeaning: 'contact me / message me',
    suggestedRendering: 'liên hệ với mình / nhắn tin cho mình',
    contextHint: 'Almost always idiomatic in modern usage.',
  },
  {
    phrase: 'pull through',
    direction: 'en',
    literalMeaning: 'to physically pull something across',
    idiomaticMeaning: 'to survive a difficult situation / recover',
    suggestedRendering: 'vượt qua / hồi phục',
    contextHint: 'Apply idiomatic when discussing illness, hardship, or recovery.',
  },
  {
    phrase: 'break a leg',
    direction: 'en',
    literalMeaning: 'fracture a leg',
    idiomaticMeaning: 'good luck (theatrical / performance origin)',
    suggestedRendering: 'chúc may mắn',
    contextHint: 'Almost always idiomatic — said before someone performs, presents, or attempts something.',
  },
  {
    phrase: 'under the weather',
    direction: 'en',
    literalMeaning: 'positioned beneath weather',
    idiomaticMeaning: 'feeling unwell / mildly sick',
    suggestedRendering: 'không khỏe / hơi mệt',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'piece of cake',
    direction: 'en',
    literalMeaning: 'a slice of cake',
    idiomaticMeaning: 'something very easy',
    suggestedRendering: 'dễ như ăn kẹo / dễ ợt',
    contextHint: 'Apply idiomatic when describing a task, problem, or challenge. Use literal in food contexts.',
  },
  {
    phrase: 'cost an arm and a leg',
    direction: 'en',
    literalMeaning: 'price requires donating limbs',
    idiomaticMeaning: 'extremely expensive',
    suggestedRendering: 'đắt cắt cổ / mắc kinh khủng',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'let the cat out of the bag',
    direction: 'en',
    literalMeaning: 'release a feline from a sack',
    idiomaticMeaning: 'reveal a secret accidentally',
    suggestedRendering: 'lỡ miệng tiết lộ bí mật',
    contextHint: 'Always idiomatic in modern usage.',
  },
  {
    phrase: 'bite the bullet',
    direction: 'en',
    literalMeaning: 'chew on ammunition',
    idiomaticMeaning: 'force yourself to do something unpleasant',
    suggestedRendering: 'nghiến răng làm / cắn răng chịu',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'the ball is in your court',
    direction: 'en',
    literalMeaning: 'a sphere is in your tennis court',
    idiomaticMeaning: 'it is your turn to act / decide',
    suggestedRendering: 'đến lượt bạn quyết định / quyền quyết định ở bạn',
    contextHint: 'Almost always idiomatic outside of literal sports contexts.',
  },
  {
    phrase: 'hit the road',
    direction: 'en',
    literalMeaning: 'physically strike a road',
    idiomaticMeaning: 'leave / depart / start a journey',
    suggestedRendering: 'lên đường / đi thôi',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'burn the midnight oil',
    direction: 'en',
    literalMeaning: 'set late-night oil on fire',
    idiomaticMeaning: 'stay up very late working or studying',
    suggestedRendering: 'thức đêm làm việc / cày đêm',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'in hot water',
    direction: 'en',
    literalMeaning: 'submerged in heated water',
    idiomaticMeaning: 'in trouble',
    suggestedRendering: 'gặp rắc rối / dính chuyện',
    contextHint: 'Apply idiomatic when discussing consequences, mistakes, or trouble. Use literal in cooking/bathing contexts.',
  },
  {
    phrase: 'bury the hatchet',
    direction: 'en',
    literalMeaning: 'inter an axe',
    idiomaticMeaning: 'make peace / end a conflict',
    suggestedRendering: 'làm hòa / xóa bỏ hiềm khích',
    contextHint: 'Always idiomatic.',
  },

  // ─── Vietnamese idioms (VI→EN) ───────────────────────────────────────────
  {
    phrase: 'ăn cháo đá bát',
    direction: 'vi',
    literalMeaning: 'eat porridge, kick the bowl',
    idiomaticMeaning: 'bite the hand that feeds you / be ungrateful to a benefactor',
    suggestedRendering: 'biting the hand that feeds you',
    contextHint: 'Always idiomatic — describes ungratefulness toward someone who helped you.',
  },
  {
    phrase: 'vắt chanh bỏ vỏ',
    direction: 'vi',
    literalMeaning: 'squeeze the lemon, throw away the peel',
    idiomaticMeaning: 'use someone fully, then discard them',
    suggestedRendering: 'using and discarding someone',
    contextHint: 'Always idiomatic — describes exploitative relationships.',
  },
  {
    phrase: 'ếch ngồi đáy giếng',
    direction: 'vi',
    literalMeaning: 'a frog at the bottom of a well',
    idiomaticMeaning: 'someone with a narrow worldview / limited perspective',
    suggestedRendering: 'someone with a narrow worldview',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'cá lớn nuốt cá bé',
    direction: 'vi',
    literalMeaning: 'big fish eats small fish',
    idiomaticMeaning: 'survival of the fittest / power dynamics where the strong consume the weak',
    suggestedRendering: 'survival of the fittest',
    contextHint: 'Always idiomatic — describes social/economic competition.',
  },
  {
    phrase: 'ngồi mát ăn bát vàng',
    direction: 'vi',
    literalMeaning: 'sit in the cool, eat from a gold bowl',
    idiomaticMeaning: 'enjoy an easy life of luxury without effort',
    suggestedRendering: 'living the easy life / having it made',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'nước đến chân mới nhảy',
    direction: 'vi',
    literalMeaning: 'only jumps when water reaches the feet',
    idiomaticMeaning: 'wait until the last minute to act',
    suggestedRendering: 'waiting until the last minute',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'có công mài sắt có ngày nên kim',
    direction: 'vi',
    literalMeaning: 'with effort grinding iron there will be a day it becomes a needle',
    idiomaticMeaning: 'persistence pays off / hard work yields results over time',
    suggestedRendering: 'persistence pays off',
    contextHint: 'Always idiomatic — encouragement for sustained effort.',
  },
  {
    phrase: 'đi một ngày đàng học một sàng khôn',
    direction: 'vi',
    literalMeaning: 'walk a day\'s road, learn a basket of wisdom',
    idiomaticMeaning: 'travel and new experiences teach you',
    suggestedRendering: 'travel broadens the mind',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'được voi đòi tiên',
    direction: 'vi',
    literalMeaning: 'got an elephant, demands a fairy',
    idiomaticMeaning: 'never satisfied / always wanting more',
    suggestedRendering: 'never satisfied / always wanting more',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'bán mặt cho đất bán lưng cho trời',
    direction: 'vi',
    literalMeaning: 'sell face to earth, sell back to sky',
    idiomaticMeaning: 'work backbreaking labor (especially farming)',
    suggestedRendering: 'doing backbreaking work',
    contextHint: 'Always idiomatic — describes hard manual labor.',
  },
  {
    phrase: 'gần mực thì đen gần đèn thì rạng',
    direction: 'vi',
    literalMeaning: 'near ink turns black, near light turns bright',
    idiomaticMeaning: 'you become like the company you keep',
    suggestedRendering: 'you become like the company you keep',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'nuôi ong tay áo',
    direction: 'vi',
    literalMeaning: 'raising a bee in your sleeve',
    idiomaticMeaning: 'harboring an enemy / nurturing a future betrayer',
    suggestedRendering: 'harboring a snake in your bosom',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'chó cắn áo rách',
    direction: 'vi',
    literalMeaning: 'a dog bites a torn shirt',
    idiomaticMeaning: 'when it rains it pours / misfortune piles on the unfortunate',
    suggestedRendering: 'when it rains it pours',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'tránh vỏ dưa gặp vỏ dừa',
    direction: 'vi',
    literalMeaning: 'avoiding a melon rind, hitting a coconut shell',
    idiomaticMeaning: 'out of the frying pan, into the fire',
    suggestedRendering: 'out of the frying pan, into the fire',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'đứng núi này trông núi nọ',
    direction: 'vi',
    literalMeaning: 'standing on this mountain, looking at that mountain',
    idiomaticMeaning: 'never satisfied / grass-is-greener thinking',
    suggestedRendering: 'the grass is always greener on the other side',
    contextHint: 'Always idiomatic.',
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface IdiomMatch {
  phrase: string;
  direction: 'en' | 'vi';
  literalMeaning: string;
  idiomaticMeaning: string;
  suggestedRendering: string;
  contextHint: string;
}

// Build a strict-boundary regex for the phrase. Spaces in the phrase become
// `\s+` (allow varied whitespace). For English, use `\b`. For Vietnamese,
// use the unicode-aware boundaries from vn-regex.
function buildPhraseRegex(phrase: string, direction: 'en' | 'vi'): RegExp {
  const tokens = phrase.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const body = tokens.join('\\s+');
  if (direction === 'en') {
    return new RegExp(`\\b${body}\\b`, 'i');
  }
  return new RegExp(`${VN_LB}${body}${VN_RB}`, 'iu');
}

export function detectIdioms(text: string, direction: 'en-vi' | 'vi-en'): IdiomMatch[] {
  const sourceLang: 'en' | 'vi' = direction === 'en-vi' ? 'en' : 'vi';
  const matches: IdiomMatch[] = [];

  for (const idiom of IDIOMS) {
    if (idiom.direction !== sourceLang) continue;
    const re = buildPhraseRegex(idiom.phrase, idiom.direction);
    if (re.test(text)) {
      matches.push({
        phrase: idiom.phrase,
        direction: idiom.direction,
        literalMeaning: idiom.literalMeaning,
        idiomaticMeaning: idiom.idiomaticMeaning,
        suggestedRendering: idiom.suggestedRendering,
        contextHint: idiom.contextHint,
      });
    }
  }

  return matches;
}

// Build a focused prompt block. Lists each idiom with its literal vs.
// idiomatic readings, the contextHint that helps the model pick, and an
// instruction to populate culturalWarnings with type='idiom'.
export function buildIdiomPrompt(matches: IdiomMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# IDIOMS DETECTED IN SOURCE:'];
  lines.push('Each idiom below has a literal reading and an idiomatic reading. Use the contextHint to decide which applies to THIS message. If idiomatic, render with the suggested form (or your own equivalent) AND populate culturalWarnings with type="idiom" so the user sees the original phrase.');
  lines.push('');
  for (const m of matches) {
    lines.push(`- "${m.phrase}"`);
    lines.push(`  Literal: ${m.literalMeaning}`);
    lines.push(`  Idiomatic: ${m.idiomaticMeaning}`);
    lines.push(`  Suggested rendering: ${m.suggestedRendering}`);
    lines.push(`  When to apply idiomatic: ${m.contextHint}`);
    lines.push('');
  }
  return lines.join('\n');
}
