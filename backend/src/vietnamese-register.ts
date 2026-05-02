// Vietnamese register selection: Sino-Vietnamese (Hán-Việt) vs. native.
//
// Vietnamese has two parallel vocabularies for many everyday concepts:
//   - Sino-Vietnamese (formal/written/news):  phụ nữ, tử vong, thực phẩm, qua đời
//   - Native Vietnamese (casual/intimate):    đàn bà, chết, đồ ăn, mất / đi
//
// On the EN→VI side, the model needs to know which vocabulary fits the
// declared relationship. On the VI→EN side, the formality the sender chose
// is a strong signal that gets flattened today (both "phụ nữ" and "đàn bà"
// translate to "woman"); we surface it as an English word-choice hint.
//
// Common Sino-origin words like "thời gian" or "công việc" are NOT treated
// as register signals because they're register-neutral in everyday speech
// despite their etymology. Only distinctively-formal Sino vocabulary counts.

// ─── Reference vocabulary pairs (used to populate prompt examples) ────────
export interface RegisterPair {
  meaning: string;
  sino: string;
  native: string;
  sinoNote?: string;
  nativeNote?: string;
}

export const REGISTER_PAIRS: RegisterPair[] = [
  { meaning: 'woman', sino: 'phụ nữ', native: 'đàn bà', nativeNote: 'can read dismissive in some contexts' },
  { meaning: 'man', sino: 'nam giới', native: 'đàn ông' },
  { meaning: 'die (formal/news)', sino: 'tử vong', native: 'chết', sinoNote: 'medical/news register' },
  { meaning: 'die (euphemism)', sino: 'qua đời', native: 'chết', sinoNote: 'respectful euphemism' },
  { meaning: 'food', sino: 'thực phẩm', native: 'đồ ăn', sinoNote: 'formal/grocery register' },
  { meaning: 'family', sino: 'gia đình', native: 'nhà', nativeNote: 'often warmer/more intimate ("về nhà ăn cơm")' },
  { meaning: 'home/place', sino: 'nhà ở', native: 'nhà' },
  { meaning: 'place/spot', sino: 'địa điểm', native: 'chỗ', nativeNote: 'casual; địa điểm is formal/written' },
  { meaning: 'time (duration)', sino: 'thời gian', native: 'lúc', nativeNote: 'lúc = a moment; thời gian = duration' },
  { meaning: 'matter/issue', sino: 'vấn đề', native: 'chuyện', nativeNote: 'chuyện = informal "matter/affair"' },
  { meaning: 'meet', sino: 'gặp gỡ', native: 'gặp' },
  { meaning: 'talk/share', sino: 'tâm sự', native: 'nói chuyện', sinoNote: 'tâm sự = intimate emotional sharing' },
  { meaning: 'happy', sino: 'hạnh phúc', native: 'vui', sinoNote: 'deeper happiness; vui is light/fun' },
  { meaning: 'beautiful', sino: 'xinh đẹp', native: 'đẹp' },
  { meaning: 'sick', sino: 'bệnh', native: 'ốm', nativeNote: 'colloquial in northern dialect' },
  { meaning: 'eat (honorific)', sino: 'dùng bữa', native: 'ăn', sinoNote: 'very formal/honorific' },
  { meaning: 'leave/depart', sino: 'rời đi', native: 'đi' },
  { meaning: 'work', sino: 'công việc', native: 'việc' },
  { meaning: 'really', sino: 'thực sự', native: 'thật' },
  { meaning: 'serious', sino: 'nghiêm trọng', native: 'nặng' },
  { meaning: 'help/aid', sino: 'hỗ trợ', native: 'giúp', sinoNote: 'formal/institutional' },
  { meaning: 'understand', sino: 'thông cảm', native: 'hiểu', sinoNote: 'thông cảm = empathetic understanding' },
  { meaning: 'speak/say', sino: 'phát biểu', native: 'nói', sinoNote: 'formal/public speech' },
  { meaning: 'enter/go in', sino: 'tham gia', native: 'vào', sinoNote: 'tham gia = participate' },
  { meaning: 'finish/complete', sino: 'hoàn thành', native: 'xong' },
];

// ─── Distinctively-formal Sino markers (VI→EN detector) ───────────────────
// Words formal enough that their presence in chat signals a register shift.
// Common Sino words used universally (thời gian, công việc, gia đình) are
// NOT here — they're register-neutral despite being Sino in origin.
export const STRONG_SINO_MARKERS = [
  // Death / formal life events
  'tử vong', 'qua đời', 'từ trần', 'mai táng', 'an táng',
  // Gender / demographic (formal/medical)
  'phụ nữ', 'nam giới',
  // 人- (nhân) Sino prefix — formal "person/human"
  'nhân vật', 'nhân loại', 'nhân viên', 'nhân sự', 'nhân chứng',
  // Topical/abstract matters
  'vấn đề', 'đề tài', 'chủ đề', 'sự kiện',
  // 品- (phẩm) products
  'thực phẩm', 'dược phẩm', 'mỹ phẩm', 'sản phẩm',
  // Carry out / handle (formal)
  'tiến hành', 'thực hiện', 'thực thi', 'triển khai',
  'giải quyết', 'xử lý', 'điều hành', 'quản lý',
  // Confirm / determine (formal)
  'xác định', 'xác nhận', 'khẳng định', 'phân tích',
  // Honorific address
  'kính thưa', 'dạ thưa', 'kính gửi',
  // Severity / formality intensifiers
  'nghiêm trọng', 'nghiêm túc', 'trọng yếu',
  // Decisions / rules
  'quy định', 'quyết định', 'chỉ định', 'điều khoản',
  // Sino synonyms for common acts
  'hỗ trợ', 'thông cảm', 'phát biểu', 'tham gia', 'hoàn thành',
];

// Distinctively-casual native markers — using these signals warmth/closeness.
//
// Detection uses substring matching (lower.includes(w)), so each marker must
// be unambiguous: no entry should accidentally appear as a substring inside
// a common register-neutral word. Short markers like "ni" or "tê" are
// excluded because they collide with too many neutral compounds.
export const STRONG_NATIVE_MARKERS = [
  'chết', 'ngủm', 'tèo', // raw "die"
  'đồ ăn', 'thức ăn ngon', // casual food
  'lắm', 'quá', 'ghê', 'cực kỳ', // intensifiers
  'mèn ơi', 'trời ơi', 'ôi giời', // casual exclamations
  'zợ', 'zậy', 'nhỉ', 'á', // casual particles
  'bựa', 'nhậu', 'phá', 'quẩy', // casual slang
  // Southern dialect markers (boundaries-safe — none collide as substrings):
  'quẹo', 'hổng', 'dìa', 'tía', 'tụi',
  // Gen-Z Vietnamese slang (multi-word forms are exact-match safe):
  'gato', 'simp', 'cà khịa', 'xu cà na', 'thả thính',
  // Gen-Z English loanwords used in Vietnamese chat (each unique as substring):
  'vibe', 'cringe', 'flex', 'lit', 'toxic',
];

export interface RegisterSignal {
  level: 'formal' | 'native' | 'mixed' | 'unmarked';
  matchedSino: string[];
  matchedNative: string[];
}

// VI→EN: scan for distinctive register markers and classify the source.
export function detectRegisterSignal(text: string): RegisterSignal {
  const lower = text.toLowerCase();
  const matchedSino = STRONG_SINO_MARKERS.filter((w) => lower.includes(w));
  const matchedNative = STRONG_NATIVE_MARKERS.filter((w) => lower.includes(w));

  let level: RegisterSignal['level'] = 'unmarked';
  if (matchedSino.length > 0 && matchedNative.length > 0) {
    level = 'mixed';
  } else if (matchedSino.length >= 1) {
    // Single strong Sino marker is enough to flag formal — these words
    // are deliberately rare in casual chat.
    level = 'formal';
  } else if (matchedNative.length >= 2) {
    // Native side is noisier (intensifiers, particles), so require ≥2.
    level = 'native';
  }

  return { level, matchedSino, matchedNative };
}

// VI→EN: build a system-prompt addendum that surfaces the detected register
// to the model so it can carry the formality through to English word choice.
export function buildRegisterSignalPrompt(signal: RegisterSignal): string {
  if (signal.level === 'unmarked') return '';
  const lines: string[] = ['', '# REGISTER SIGNAL FROM SOURCE:'];

  if (signal.level === 'formal') {
    lines.push(
      `- Source uses distinctively formal Sino-Vietnamese vocabulary: ${signal.matchedSino.map((w) => `"${w}"`).join(', ')}.`
    );
    lines.push(
      '- Reflect this formality in English word choice. Prefer "pass away" over "die", "matter/issue" over "thing", "address" over "deal with", "individual" or "lady/gentleman" over "guy/woman", "regarding" over "about".'
    );
    lines.push(
      '- Do NOT add formality the source does not carry — match the level, do not amplify it.'
    );
  } else if (signal.level === 'native') {
    lines.push(
      `- Source uses casual native vocabulary: ${signal.matchedNative.map((w) => `"${w}"`).join(', ')}.`
    );
    lines.push(
      '- Reflect this casualness in English word choice. Prefer plain words over Latinate ones: "yeah" over "yes", "guy" over "gentleman", "stuff" over "matter", "talk about" over "discuss".'
    );
  } else if (signal.level === 'mixed') {
    lines.push(
      `- Source mixes formal Sino vocabulary (${signal.matchedSino.map((w) => `"${w}"`).join(', ')}) with casual native vocabulary (${signal.matchedNative.map((w) => `"${w}"`).join(', ')}).`
    );
    lines.push('- Use a neutral middle-of-the-road English register.');
  }

  return lines.join('\n');
}

// EN→VI: relationship-driven register guidance for the output language.
export function buildRegisterPromptForRelationship(
  relationship: string,
  direction: 'en-vi' | 'vi-en'
): string {
  if (direction !== 'en-vi') return '';

  if (relationship === 'formal' || relationship === 'elder') {
    return [
      '',
      '# VIETNAMESE REGISTER (target side):',
      '- For this relationship, prefer Sino-Vietnamese vocabulary in the output where the meaning matches.',
      '- Examples: "phụ nữ" (not "đàn bà"), "thời gian"/"thực sự" for emphasis, "thực phẩm" (not "đồ ăn"), "gia đình" (preferred over bare "nhà"), "qua đời" (not "chết"), "vấn đề" (not "chuyện"), "hỗ trợ" (not just "giúp"), "hoàn thành" (not "xong").',
      '- Do not over-formalize — only swap when the meaning matches and the context warrants it.',
    ].join('\n');
  }

  if (relationship === 'friend' || relationship === 'partner') {
    return [
      '',
      '# VIETNAMESE REGISTER (target side):',
      '- For this relationship, prefer native/casual Vietnamese vocabulary.',
      '- Examples: "đồ ăn" (casual food), "lúc"/"giờ" for time-of-day, "nhà" for home, "chuyện" for matters, "đẹp"/"xinh" for beautiful, "vui" for happy, "giúp" (not "hỗ trợ"), "xong" (not "hoàn thành").',
      '- AVOID "đàn bà" for "woman" — it can read dismissive even in casual register. Default to "phụ nữ" or context-appropriate addressee pronouns.',
    ].join('\n');
  }

  // senior, junior, neutral relationships: lighter nudge, let the model pick.
  return '';
}
