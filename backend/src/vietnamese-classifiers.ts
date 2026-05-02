// Vietnamese classifier guidance for the EN→VI direction.
//
// Vietnamese requires a classifier between number/determiner and noun: you
// can't say "một sách" (one book), only "một quyển sách" (one CL-bound book).
// Each noun class takes its own classifier:
//   con (animate)        cái (generic inanimate)
//   chiếc (single item)  quyển/cuốn (bound things)
//   tờ (flat sheets)     bài (compositions)
//   bức (pictures/letters)  ngôi (buildings)
//   người (people)       cây (trees)
//   ly/chai/cốc/tách (containers)
//
// The model knows common pairings, but for less-frequent nouns it sometimes
// reaches for generic `cái` when a more specific classifier would be natural.
// This module hands the model an explicit dictionary plus a "use X unless
// context suggests otherwise" framing so it can override when warranted.
//
// Mitigations baked in:
//   - Detection only fires on countable contexts (article, number,
//     possessive, demonstrative + noun). Skips bare/abstract usage like
//     "I love books in general."
//   - Plural-aware: "books"/"mice"/"fish" all map back to the same classifier
//     entry; Vietnamese doesn't distinguish singular vs plural.
//   - Prompt framing: "use the listed classifier unless context strongly
//     suggests an alternate" preserves the model's freedom to pick a less
//     common but still correct option.

export interface ClassifierEntry {
  english: string; // singular form
  englishPlural?: string; // override irregular plurals (default: english + 's')
  classifier: string;
  vietnamese: string;
  alternateClassifier?: string;
  note?: string;
  // Some Vietnamese nouns work standalone — adding any classifier is wrong,
  // not just less natural. E.g., "dự án" (project), "ý tưởng" (idea),
  // "email" all take a number/determiner directly without a classifier.
  // When set, the prompt tells the model to use the noun bare.
  noClassifierNeeded?: boolean;
}

export const CLASSIFIER_DICT: ClassifierEntry[] = [
  // Animals → con
  { english: 'dog', classifier: 'con', vietnamese: 'chó' },
  { english: 'cat', classifier: 'con', vietnamese: 'mèo' },
  { english: 'bird', classifier: 'con', vietnamese: 'chim' },
  { english: 'fish', englishPlural: 'fish', classifier: 'con', vietnamese: 'cá' },
  { english: 'cow', classifier: 'con', vietnamese: 'bò' },
  { english: 'pig', classifier: 'con', vietnamese: 'lợn' },
  { english: 'horse', classifier: 'con', vietnamese: 'ngựa' },
  { english: 'chicken', classifier: 'con', vietnamese: 'gà' },
  { english: 'mouse', englishPlural: 'mice', classifier: 'con', vietnamese: 'chuột' },
  { english: 'rabbit', classifier: 'con', vietnamese: 'thỏ' },
  { english: 'snake', classifier: 'con', vietnamese: 'rắn' },

  // Vehicles → chiếc
  { english: 'car', classifier: 'chiếc', vietnamese: 'xe', alternateClassifier: 'cái' },
  { english: 'motorbike', classifier: 'chiếc', vietnamese: 'xe máy' },
  { english: 'motorcycle', classifier: 'chiếc', vietnamese: 'xe máy' },
  { english: 'bicycle', classifier: 'chiếc', vietnamese: 'xe đạp' },
  { english: 'bike', classifier: 'chiếc', vietnamese: 'xe đạp' },
  { english: 'plane', classifier: 'chiếc', vietnamese: 'máy bay' },
  { english: 'airplane', classifier: 'chiếc', vietnamese: 'máy bay' },
  { english: 'boat', classifier: 'chiếc', vietnamese: 'thuyền' },
  { english: 'ship', classifier: 'chiếc', vietnamese: 'tàu' },

  // Books / printed matter → quyển / cuốn / tờ
  { english: 'book', classifier: 'quyển', vietnamese: 'sách', alternateClassifier: 'cuốn' },
  { english: 'notebook', classifier: 'quyển', vietnamese: 'vở' },
  { english: 'magazine', classifier: 'tờ', vietnamese: 'tạp chí' },
  { english: 'newspaper', classifier: 'tờ', vietnamese: 'báo' },
  { english: 'paper', classifier: 'tờ', vietnamese: 'giấy', note: 'tờ giấy = sheet of paper' },

  // Pictures / letters → tấm / bức
  { english: 'photo', classifier: 'tấm', vietnamese: 'ảnh', alternateClassifier: 'bức' },
  { english: 'photograph', classifier: 'tấm', vietnamese: 'ảnh' },
  { english: 'picture', classifier: 'tấm', vietnamese: 'ảnh' },
  { english: 'painting', classifier: 'bức', vietnamese: 'tranh' },
  { english: 'drawing', classifier: 'bức', vietnamese: 'tranh' },
  { english: 'letter', classifier: 'bức', vietnamese: 'thư' },

  // Compositions → bài
  { english: 'song', classifier: 'bài', vietnamese: 'hát', note: 'bài hát = song' },
  { english: 'poem', classifier: 'bài', vietnamese: 'thơ' },
  { english: 'lesson', classifier: 'bài', vietnamese: 'học', note: 'bài học = lesson' },
  { english: 'speech', classifier: 'bài', vietnamese: 'phát biểu' },
  { english: 'essay', classifier: 'bài', vietnamese: 'luận' },

  // Buildings → ngôi
  { english: 'house', classifier: 'ngôi', vietnamese: 'nhà', alternateClassifier: 'căn' },
  { english: 'temple', classifier: 'ngôi', vietnamese: 'chùa' },
  { english: 'church', classifier: 'ngôi', vietnamese: 'nhà thờ' },
  { english: 'school', classifier: 'ngôi', vietnamese: 'trường', alternateClassifier: 'cái' },

  // People → người (irregular plurals!)
  { english: 'person', englishPlural: 'people', classifier: 'người', vietnamese: '', note: 'người itself = person' },
  { english: 'man', englishPlural: 'men', classifier: 'người', vietnamese: 'đàn ông', note: 'or just "anh/ông" depending on age' },
  { english: 'woman', englishPlural: 'women', classifier: 'người', vietnamese: 'phụ nữ', note: 'or "chị/cô/bà" depending on age' },
  { english: 'child', englishPlural: 'children', classifier: 'đứa', vietnamese: 'trẻ', alternateClassifier: 'người', note: 'đứa for affectionate, người for neutral' },
  { english: 'soldier', classifier: 'người', vietnamese: 'lính' },
  { english: 'worker', classifier: 'người', vietnamese: 'công nhân' },
  { english: 'teacher', classifier: 'người', vietnamese: 'giáo viên' },
  { english: 'student', classifier: 'người', vietnamese: 'học sinh' },
  { english: 'doctor', classifier: 'người', vietnamese: 'bác sĩ' },
  { english: 'friend', classifier: 'người', vietnamese: 'bạn' },

  // Containers / drinks
  { english: 'cup', classifier: 'cái', vietnamese: 'cốc', alternateClassifier: 'ly' },
  { english: 'bottle', classifier: 'chai', vietnamese: '', note: 'chai itself = bottle' },
  { english: 'box', classifier: 'cái', vietnamese: 'hộp' },
  { english: 'bag', classifier: 'cái', vietnamese: 'túi' },
  { english: 'coffee', classifier: 'ly', vietnamese: 'cà phê', note: 'ly cà phê = a cup of coffee' },
  { english: 'tea', classifier: 'ly', vietnamese: 'trà', alternateClassifier: 'tách' },
  { english: 'beer', classifier: 'chai', vietnamese: 'bia', note: 'chai bia = bottle, ly bia = glass' },

  // Clothing
  { english: 'shirt', classifier: 'cái', vietnamese: 'áo', alternateClassifier: 'chiếc' },
  { english: 'pants', englishPlural: 'pants', classifier: 'cái', vietnamese: 'quần' },
  { english: 'hat', classifier: 'cái', vietnamese: 'mũ' },
  { english: 'shoe', classifier: 'chiếc', vietnamese: 'giày', note: 'chiếc for single shoe' },
  { english: 'shoes', englishPlural: 'shoes', classifier: 'đôi', vietnamese: 'giày', note: 'đôi giày = pair of shoes' },

  // Generic objects → cái
  { english: 'table', classifier: 'cái', vietnamese: 'bàn' },
  { english: 'chair', classifier: 'cái', vietnamese: 'ghế' },
  { english: 'bed', classifier: 'cái', vietnamese: 'giường' },
  { english: 'door', classifier: 'cái', vietnamese: 'cửa' },
  { english: 'window', classifier: 'cái', vietnamese: 'cửa sổ' },
  { english: 'phone', classifier: 'cái', vietnamese: 'điện thoại' },
  { english: 'computer', classifier: 'cái', vietnamese: 'máy tính' },
  { english: 'laptop', classifier: 'cái', vietnamese: 'laptop' },
  { english: 'television', classifier: 'cái', vietnamese: 'tivi' },
  { english: 'tv', classifier: 'cái', vietnamese: 'tivi' },
  { english: 'radio', classifier: 'cái', vietnamese: 'đài' },
  { english: 'fridge', classifier: 'cái', vietnamese: 'tủ lạnh' },
  { english: 'refrigerator', classifier: 'cái', vietnamese: 'tủ lạnh' },
  { english: 'watch', classifier: 'cái', vietnamese: 'đồng hồ' },
  { english: 'clock', classifier: 'cái', vietnamese: 'đồng hồ' },

  // Plants → cây / bông
  { english: 'tree', classifier: 'cây', vietnamese: '', note: 'cây itself = tree' },
  { english: 'flower', classifier: 'bông', vietnamese: 'hoa' },

  // ─── Work / digital / professional ─────────────────────────────────────
  // Nouns that DO take a classifier:
  { english: 'meeting', classifier: 'cuộc', vietnamese: 'họp', note: 'cuộc họp = a meeting' },
  { english: 'conference', classifier: 'cuộc', vietnamese: 'hội nghị' },
  { english: 'call', classifier: 'cuộc', vietnamese: 'gọi', note: 'cuộc gọi = a call' },
  { english: 'presentation', classifier: 'bài', vietnamese: 'thuyết trình' },
  { english: 'post', classifier: 'bài', vietnamese: 'đăng', note: 'bài đăng = a (social media) post' },
  { english: 'report', classifier: 'bản', vietnamese: 'báo cáo' },
  { english: 'document', classifier: 'bản', vietnamese: 'tài liệu', note: 'bản tài liệu for a printed copy' },
  { english: 'contract', classifier: 'bản', vietnamese: 'hợp đồng' },
  { english: 'video', classifier: 'đoạn', vietnamese: 'video', alternateClassifier: 'cái' },

  // Nouns that take a number/determiner directly — NO classifier:
  { english: 'project', classifier: '', vietnamese: 'dự án', noClassifierNeeded: true },
  { english: 'deadline', classifier: '', vietnamese: 'hạn chót', noClassifierNeeded: true },
  { english: 'email', classifier: '', vietnamese: 'email', noClassifierNeeded: true },
  { english: 'message', classifier: '', vietnamese: 'tin nhắn', noClassifierNeeded: true },
  { english: 'idea', classifier: '', vietnamese: 'ý tưởng', noClassifierNeeded: true },
  { english: 'task', classifier: '', vietnamese: 'nhiệm vụ', noClassifierNeeded: true },
  { english: 'goal', classifier: '', vietnamese: 'mục tiêu', noClassifierNeeded: true },
  { english: 'team', classifier: '', vietnamese: 'nhóm', alternateClassifier: 'đội', noClassifierNeeded: true },
  { english: 'office', classifier: '', vietnamese: 'văn phòng', noClassifierNeeded: true },
];

// Determiners that mark a noun as countable. If a noun appears bare or
// preceded by a non-countable marker, we skip it (mitigation for Risk 2).
const COUNTABLE_DETERMINERS = [
  'a', 'an', 'the',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'twenty', 'thirty', 'fifty', 'hundred', 'thousand',
  'many', 'several', 'few', 'some', 'any', 'each', 'every',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'this', 'that', 'these', 'those',
  'another', 'other',
];

const COUNTABLE_GROUP = COUNTABLE_DETERMINERS.join('|');

export interface ClassifierMatch {
  english: string;
  matchedForm: string; // singular or plural form actually found
  classifier: string;
  vietnamese: string;
  alternateClassifier?: string;
  note?: string;
  noClassifierNeeded?: boolean;
}

export function detectNounsNeedingClassifier(englishText: string): ClassifierMatch[] {
  const lower = englishText.toLowerCase();
  const matches: ClassifierMatch[] = [];
  const seenEnglish = new Set<string>();

  for (const entry of CLASSIFIER_DICT) {
    if (seenEnglish.has(entry.english)) continue;

    const forms = new Set<string>([entry.english]);
    if (entry.englishPlural) {
      forms.add(entry.englishPlural);
    } else if (!entry.english.endsWith('s')) {
      forms.add(entry.english + 's');
    }

    for (const form of forms) {
      // Escape any regex-special chars in the noun form (none in our dict, but
      // defensive) and require a countable determiner directly before it.
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b(${COUNTABLE_GROUP})\\s+${escaped}\\b`, 'i');
      if (re.test(lower)) {
        matches.push({
          english: entry.english,
          matchedForm: form,
          classifier: entry.classifier,
          vietnamese: entry.vietnamese,
          alternateClassifier: entry.alternateClassifier,
          note: entry.note,
          noClassifierNeeded: entry.noClassifierNeeded,
        });
        seenEnglish.add(entry.english);
        break;
      }
    }
  }

  return matches;
}

export function buildClassifierPrompt(matches: ClassifierMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# CLASSIFIER GUIDANCE (EN→VI):'];
  lines.push('When translating these nouns into Vietnamese, follow the listed pattern. Some nouns take a classifier between number/determiner and the noun; others stand alone — both are noted explicitly.');
  for (const m of matches) {
    let line: string;
    if (m.noClassifierNeeded) {
      // Bare-noun usage: number/determiner connects directly, no classifier.
      line = `- "${m.english}" → use "${m.vietnamese}" directly with the determiner (NO classifier — adding "cái" or any other would be wrong)`;
      if (m.alternateClassifier) {
        line += ` — or "${m.alternateClassifier} ${m.vietnamese}" if a counted/grouped sense is intended`;
      }
    } else {
      const phrase = m.vietnamese ? `${m.classifier} ${m.vietnamese}` : m.classifier;
      line = `- "${m.english}" → ${phrase}`;
      if (m.alternateClassifier) line += ` (or ${m.alternateClassifier})`;
    }
    if (m.note) line += ` — ${m.note}`;
    lines.push(line);
  }
  lines.push('Use the listed pattern unless context strongly suggests an alternate (e.g., "chiếc" for emphasizing a single distinguished item, "đôi" for pairs).');
  return lines.join('\n');
}
