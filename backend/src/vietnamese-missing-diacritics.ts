// Detector for Vietnamese typed without tone marks (mobile-keyboard pattern).
//
// Why this exists: when a user types "com chay" instead of "cơm chay" /
// "cơm cháy", the model has to guess which Vietnamese word each ASCII
// token represents. Without a tone-mark hint, models default to the most
// frequent reading, which produces wrong translations on ambiguous pairs
// (the canonical example: "burnt rice" vs "vegetarian rice"). This
// detector flags tokens that collapse to multiple distinct Vietnamese
// words once tone marks are applied, and surfaces all candidates to the
// model so it can pick from sentence context.
//
// Trigger: strict — fires only when ≥80% of source tokens carry no
// Vietnamese diacritics. Properly-diacritized messages don't need the
// disambiguation block; injecting it would just add prompt noise.

export interface DiacriticMatch {
  ascii: string;
  candidates: Array<{ word: string; gloss: string }>;
}

// Curated high-value pairs/triples. Optimizes for tokens where:
//   1. The ASCII form is genuinely ambiguous (≥2 plausible meanings)
//   2. The collisions appear in everyday chat (food, pronouns, common
//      verbs, household words)
//   3. The wrong reading produces a comprehension failure, not just a
//      stylistic miss
//
// Glosses are intentionally terse — the model only needs enough to
// disambiguate, not a full dictionary entry. Order candidates by
// frequency so the model has a sensible default when context is thin.
const AMBIGUOUS_TOKENS: Record<string, Array<{ word: string; gloss: string }>> = {
  // ─── Food & cooking ───────────────────────────────────────────────
  com:  [{ word: 'cơm',  gloss: 'rice (cooked) / meal' },
         { word: 'cốm',  gloss: 'young green rice flakes' }],
  chay: [{ word: 'chay', gloss: 'vegetarian / vegan' },
         { word: 'cháy', gloss: 'burnt / scorched' }],
  ga:   [{ word: 'gà',   gloss: 'chicken' },
         { word: 'ga',   gloss: 'gas / train station' },
         { word: 'gã',   gloss: 'a guy / dude' }],
  ca:   [{ word: 'cá',   gloss: 'fish' },
         { word: 'cà',   gloss: 'eggplant / tomato' },
         { word: 'ca',   gloss: 'sing / work shift' },
         { word: 'cả',   gloss: 'whole / all' }],
  mam:  [{ word: 'mắm',  gloss: 'fermented fish sauce' },
         { word: 'mâm',  gloss: 'tray (food)' }],
  bo:   [{ word: 'bò',   gloss: 'cow / beef' },
         { word: 'bố',   gloss: 'father' },
         { word: 'bỏ',   gloss: 'leave / quit / drop' },
         { word: 'bơ',   gloss: 'butter' }],
  thit: [{ word: 'thịt', gloss: 'meat' }],
  pho:  [{ word: 'phở',  gloss: 'phở (noodle soup)' },
         { word: 'phố',  gloss: 'street / urban' }],
  banh: [{ word: 'bánh', gloss: 'cake / pastry / bread' }],
  nuoc: [{ word: 'nước', gloss: 'water / country' }],
  toi:  [{ word: 'tôi',  gloss: 'I (formal)' },
         { word: 'tỏi',  gloss: 'garlic' },
         { word: 'tối',  gloss: 'evening / dark' }],
  ot:   [{ word: 'ớt',   gloss: 'chili pepper' }],
  rau:  [{ word: 'rau',  gloss: 'vegetable / herb' },
         { word: 'rầu',  gloss: 'sad / gloomy' }],

  // ─── Pronouns / particles ─────────────────────────────────────────
  da:   [{ word: 'đã',   gloss: 'past tense particle' },
         { word: 'dạ',   gloss: 'yes (respectful)' },
         { word: 'da',   gloss: 'skin / leather' },
         { word: 'dã',   gloss: 'cruel / wild' }],
  ma:   [{ word: 'mà',   gloss: 'but / which (relative)' },
         { word: 'má',   gloss: 'mother / cheek' },
         { word: 'mạ',   gloss: 'rice seedling' },
         { word: 'mã',   gloss: 'code / horse' },
         { word: 'mả',   gloss: 'grave' }],
  la:   [{ word: 'là',   gloss: 'to be / iron (verb)' },
         { word: 'lá',   gloss: 'leaf' },
         { word: 'lạ',   gloss: 'strange / unfamiliar' }],
  ban:  [{ word: 'bạn',  gloss: 'friend / you (peer)' },
         { word: 'bàn',  gloss: 'table / discuss' },
         { word: 'bán',  gloss: 'sell' },
         { word: 'bản',  gloss: 'version / copy' }],
  ben:  [{ word: 'bên',  gloss: 'side / next to' },
         { word: 'bến',  gloss: 'dock / station' },
         { word: 'bền',  gloss: 'durable / lasting' }],
  no:   [{ word: 'nó',   gloss: 'it / he / she (familiar)' },
         { word: 'nợ',   gloss: 'debt / owe' },
         { word: 'nọ',   gloss: 'that (one)' }],
  ho:   [{ word: 'họ',   gloss: 'they / family / surname' },
         { word: 'hồ',   gloss: 'lake' },
         { word: 'hộ',   gloss: 'household / on behalf of' }],

  // ─── Common verbs / adjectives ────────────────────────────────────
  di:   [{ word: 'đi',   gloss: 'go' },
         { word: 'dì',   gloss: 'aunt (mother\'s sister)' }],
  an:   [{ word: 'ăn',   gloss: 'eat' },
         { word: 'an',   gloss: 'peace / safety' },
         { word: 'án',   gloss: 'sentence / verdict' },
         { word: 'ấn',   gloss: 'press / push' }],
  noi:  [{ word: 'nói',  gloss: 'speak / say' },
         { word: 'nồi',  gloss: 'pot (cooking)' },
         { word: 'nội',  gloss: 'inner / paternal grandparent' },
         { word: 'nỗi',  gloss: 'feeling / emotion (suffering)' },
         { word: 'nổi',  gloss: 'float / can / arise' }],
  thay: [{ word: 'thấy', gloss: 'see / notice' },
         { word: 'thầy', gloss: 'teacher / master' },
         { word: 'thay', gloss: 'replace / change' }],
  biet: [{ word: 'biết', gloss: 'know' },
         { word: 'biệt', gloss: 'separate / distinct' }],
  co:   [{ word: 'có',   gloss: 'have / there is' },
         { word: 'cô',   gloss: 'aunt / Miss / female teacher' },
         { word: 'cố',   gloss: 'try / late (deceased)' }],
  the:  [{ word: 'thế',  gloss: 'so / like that / position' },
         { word: 'thẻ',  gloss: 'card' },
         { word: 'thề',  gloss: 'swear / oath' }],
  khong:[{ word: 'không',gloss: 'no / not / zero' }],
  cua:  [{ word: 'của',  gloss: 'of / belongs to' },
         { word: 'cua',  gloss: 'crab' }],
  qua:  [{ word: 'qua',  gloss: 'cross / past / by' },
         { word: 'quà',  gloss: 'gift' },
         { word: 'quá',  gloss: 'very / too (much)' },
         { word: 'quả',  gloss: 'fruit / result' }],
  cho:  [{ word: 'cho',  gloss: 'give / for / let' },
         { word: 'chợ',  gloss: 'market' },
         { word: 'chó',  gloss: 'dog' },
         { word: 'chờ',  gloss: 'wait' }],
  nay:  [{ word: 'này',  gloss: 'this' },
         { word: 'nay',  gloss: 'today / now' }],

  // ─── Other high-frequency ─────────────────────────────────────────
  giay: [{ word: 'giấy', gloss: 'paper' },
         { word: 'giày', gloss: 'shoes' },
         { word: 'giây', gloss: 'second (time) / string' }],
  sao:  [{ word: 'sao',  gloss: 'star / why / how / copy' },
         { word: 'sào',  gloss: 'pole' }],
  cao:  [{ word: 'cao',  gloss: 'high / tall' },
         { word: 'cào',  gloss: 'rake / scrape' },
         { word: 'cáo',  gloss: 'fox / report (formal)' }],
  dao:  [{ word: 'dao',  gloss: 'knife' },
         { word: 'đảo',  gloss: 'island' },
         { word: 'đạo',  gloss: 'religion / way (path)' },
         { word: 'đào',  gloss: 'peach / dig / female lead' }],
  lai:  [{ word: 'lại',  gloss: 'again / come back' },
         { word: 'lái',  gloss: 'steer / drive' },
         { word: 'lai',  gloss: 'mixed (heritage)' }],
  song: [{ word: 'sông', gloss: 'river' },
         { word: 'sóng', gloss: 'wave (water/sound)' },
         { word: 'sống', gloss: 'live / raw / spine' }],
  long: [{ word: 'lòng', gloss: 'heart / inside / intestine' },
         { word: 'lông', gloss: 'fur / hair (body)' },
         { word: 'lỏng', gloss: 'loose / liquid' }],
  tang: [{ word: 'tăng', gloss: 'increase / boost' },
         { word: 'tầng', gloss: 'floor / level' },
         { word: 'tang', gloss: 'mourning' }],
  o:    [{ word: 'ở',    gloss: 'at / live (reside)' },
         { word: 'ô',    gloss: 'umbrella / square / box' }],
  may:  [{ word: 'mây',  gloss: 'cloud' },
         { word: 'máy',  gloss: 'machine / device' },
         { word: 'mày',  gloss: 'you (rude/intimate)' }],
  can:  [{ word: 'cần',  gloss: 'need' },
         { word: 'cận',  gloss: 'near / close' },
         { word: 'căn',  gloss: 'unit (of housing)' }],
  hoc:  [{ word: 'học',  gloss: 'study / learn' },
         { word: 'hộc',  gloss: 'compartment / drawer' }],
  yeu:  [{ word: 'yêu',  gloss: 'love' },
         { word: 'yếu',  gloss: 'weak' }],
  thuong:[{ word: 'thương', gloss: 'love / cherish (caring)' },
          { word: 'thường', gloss: 'usually / ordinary' }],
};

const VN_DIACRITIC_RE =
  /[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]/;

const TOKEN_SPLIT_RE = /[\s.,!?;:()'"\-—…]+/;

const ASCII_BARE_THRESHOLD = 0.8;

// Dictionary keys that collide with common English words. If the ONLY hits
// in a source are from this set, it's likely an English message that the
// user accidentally sent in vi-en mode (or a Vietnamese phrase too short
// to disambiguate). Skip the prompt block in that case to avoid telling
// the model "this English word might mean four Vietnamese things."
const ENGLISH_COLLISION_TOKENS = new Set([
  'an', 'the', 'may', 'can', 'ban', 'no', 'ho',
  'ben',  // English name; Vi "bên/bến/bền" usually appears in compounds
  'long', // English adjective; Vi "lòng/lông" usually compounds
  'song', // English noun; Vi "sông/sóng/sống" usually compounds
]);

export function detectMissingDiacritics(text: string): DiacriticMatch[] {
  const tokens = text
    .toLowerCase()
    .split(TOKEN_SPLIT_RE)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];

  // Strict trigger: only fire when the source is mostly ASCII-bare. A
  // properly-typed Vietnamese message with one accidental ASCII typo
  // doesn't need the full disambiguation block.
  const bareCount = tokens.filter((t) => !VN_DIACRITIC_RE.test(t)).length;
  if (bareCount / tokens.length < ASCII_BARE_THRESHOLD) return [];

  const matches: DiacriticMatch[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    const entry = AMBIGUOUS_TOKENS[tok];
    if (entry && !seen.has(tok)) {
      seen.add(tok);
      matches.push({ ascii: tok, candidates: entry });
    }
  }

  // English-collision gate: require at least one match that isn't a known
  // English-collision token. Without this, "I will ban this" or "Can you
  // come?" would falsely fire.
  const hasVietnameseDistinctiveMatch = matches.some(
    (m) => !ENGLISH_COLLISION_TOKENS.has(m.ascii),
  );
  if (!hasVietnameseDistinctiveMatch) return [];

  return matches;
}

export function buildMissingDiacriticsPrompt(matches: DiacriticMatch[]): string {
  if (!matches.length) return '';
  const lines: string[] = [
    '',
    '# UNDIACRITIZED VIETNAMESE — DISAMBIGUATE FROM CONTEXT:',
    '- The source appears to be Vietnamese typed without tone marks (common mobile-keyboard pattern). Each token below collapses to multiple distinct Vietnamese words once tone marks are restored — a wrong choice produces a comprehension failure (e.g. "burnt rice" vs "vegetarian rice").',
  ];
  for (const m of matches) {
    const cands = m.candidates
      .map((c) => `${c.word} (${c.gloss})`)
      .join(' | ');
    lines.push(`  - "${m.ascii}": ${cands}`);
  }
  lines.push(
    '- Do NOT default to the most frequent reading. Use the surrounding sentence to pick the right tone-marked form, then translate. When multiple ambiguous tokens appear together, prefer a reading where they form a coherent phrase (e.g. "com chay" in a food context → cơm chay / vegetarian rice; in a cooking-mishap context → cơm cháy / burnt rice).',
  );
  return lines.join('\n');
}
