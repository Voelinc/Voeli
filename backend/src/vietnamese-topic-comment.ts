// Detect Vietnamese topic-comment structures so the system prompt can nudge
// the model toward natural English SVO ordering instead of preserving the
// fronted topic literally.
//
// Vietnamese is topic-prominent: "Quyển sách này tôi đọc rồi" puts the topic
// (the book) up front, then comments on it. A literal English translation
// like "This book, I've already read it" is grammatical but stilted. The
// natural English is "I've already read this book" — the topic becomes the
// object of the main verb.
//
// We only detect; we do not verify. Verifying topic-comment compliance in
// English output requires syntactic parsing the regex layer can't do, and the
// model is generally good at this when prompted explicitly. A targeted prompt
// hint captures most of the value at zero API cost.

import { VN_RB } from './vn-regex';

// Common classifiers that introduce nouns. Optional in the demonstrative
// pattern (you can say "sách này" or "quyển sách này").
const CLASSIFIERS = [
  'con', 'cái', 'chiếc', 'quyển', 'cuốn', 'tờ', 'bài', 'bức',
  'đôi', 'ngôi', 'người', 'ly', 'chai', 'hộp', 'gói', 'lon',
  'cây', 'lá', 'đứa', 'miếng', 'bó',
];

// Demonstratives that finalize a noun phrase as a topic.
const DEMONSTRATIVES = ['này', 'đó', 'kia', 'ấy', 'nọ'];

// Subject pronouns that signal "the topic just ended; now comes the comment".
const SUBJECT_PRONOUNS = [
  'tôi', 'em', 'anh', 'chị', 'mình', 'mày', 'nó', 'bạn',
  'ông', 'bà', 'con', 'cháu', 'ta', 'tớ', 'cậu', 'tao',
];

// Time and discourse-marker phrases that ARE fronted in Vietnamese but map
// cleanly to English fronting ("Yesterday, I went to school"). Flagging these
// would just produce noise.
const TIME_FRONTERS = [
  'hôm qua', 'hôm nay', 'hôm kia', 'ngày mai', 'ngày kia',
  'tuần trước', 'tuần này', 'tuần sau', 'tháng trước', 'tháng này',
  'năm ngoái', 'năm nay', 'năm sau',
  'lúc đó', 'lúc này', 'khi đó', 'khi này', 'hồi đó', 'dạo này',
  'trước đây', 'sau này',
];
const DISCOURSE_FRONTERS = [
  'thật ra', 'thực ra', 'thật sự', 'thực sự', 'thật mà nói', 'thật ra mà nói',
  'theo tôi', 'theo em', 'theo anh', 'theo chị', 'theo mình',
  'ở đó', 'ở đây', 'tại đó', 'tại đây',
  'nói chung', 'nhìn chung', 'tóm lại', 'cuối cùng', 'đầu tiên',
];

const CLASSIFIERS_GROUP = CLASSIFIERS.join('|');
const DEMONSTRATIVES_GROUP = DEMONSTRATIVES.join('|');
const SUBJECT_PRONOUNS_GROUP = SUBJECT_PRONOUNS.join('|');

// Pattern A: optional classifier + noun + demonstrative + subject pronoun
//   "Quyển sách này tôi đọc rồi" → matches at start
//   "Cái áo đó em không thích" → matches at start
//   "Việc này tôi đã làm xong" → matches at start (no classifier)
const DEMONSTRATIVE_TOPIC_RE = new RegExp(
  `^\\s*(?:(${CLASSIFIERS_GROUP})\\s+)?(\\p{L}+)\\s+(${DEMONSTRATIVES_GROUP})\\s+(${SUBJECT_PRONOUNS_GROUP})${VN_RB}`,
  'iu'
);

// Pattern B: any noun-phrase ending before a comma, then a subject pronoun.
//   "Chuyện đó, mình nói sau" → topic = "Chuyện đó"
//   "Việc anh kể, em không tin" → topic = "Việc anh kể"
const COMMA_TOPIC_RE = new RegExp(
  `^\\s*([\\p{L}\\s]{2,40}?),\\s*(${SUBJECT_PRONOUNS_GROUP})${VN_RB}`,
  'iu'
);

export interface TopicCommentMatch {
  detected: boolean;
  topic: string | null;
  pattern: 'demonstrative' | 'comma' | null;
}

function isExcludedFronter(phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  return TIME_FRONTERS.includes(p) || DISCOURSE_FRONTERS.includes(p);
}

export function detectTopicComment(text: string): TopicCommentMatch {
  const trimmed = text.trim();

  // Try comma-fronted first: it's the more reliable signal.
  const commaMatch = trimmed.match(COMMA_TOPIC_RE);
  if (commaMatch) {
    const topic = commaMatch[1].trim();
    if (!isExcludedFronter(topic) && topic.length >= 2) {
      return { detected: true, topic, pattern: 'comma' };
    }
  }

  // Demonstrative topic: requires a classifier-or-noun + demonstrative + subject pronoun.
  const demoMatch = trimmed.match(DEMONSTRATIVE_TOPIC_RE);
  if (demoMatch) {
    const classifier = demoMatch[1] || '';
    const noun = demoMatch[2];
    const demo = demoMatch[3];
    const topic = (classifier ? classifier + ' ' : '') + noun + ' ' + demo;
    if (!isExcludedFronter(topic) && topic.length >= 2) {
      return { detected: true, topic: topic.trim(), pattern: 'demonstrative' };
    }
  }

  return { detected: false, topic: null, pattern: null };
}

// Build a focused prompt nudge to splice into the system prompt for this
// translation. Identifies the topic and shows one right/wrong example so the
// model has a concrete restructuring template.
export function buildTopicCommentPrompt(match: TopicCommentMatch): string {
  if (!match.detected || !match.topic) return '';
  return [
    '',
    '# TOPIC-COMMENT STRUCTURE DETECTED:',
    `- Source fronts the topic: "${match.topic}"`,
    '- In English, restructure so the topic becomes the object (or subject) of the main verb. Do NOT echo the topic at the start.',
    '- Example: "Quyển sách này tôi đọc rồi" → "I\'ve already read this book" ✓  NOT "This book, I\'ve already read it" ✗',
    '- Example: "Chuyện đó, mình nói sau" → "We\'ll talk about that later" ✓  NOT "That story, we\'ll talk later" ✗',
  ].join('\n');
}
