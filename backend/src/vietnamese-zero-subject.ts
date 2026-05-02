// Detect Vietnamese sentences with a dropped subject and infer whether the
// implicit subject is the speaker or the addressee, so the system prompt can
// anchor the model to the right English pronoun.
//
// Vietnamese drops subjects constantly:
//   "Đói quá"          → "I'm hungry"            (state verb, speaker)
//   "Đi học chưa?"     → "Have you been to school?" (question, addressee)
//   "Ăn rồi"           → "I've eaten"            (completion, speaker)
//   "Cẩn thận nhé"     → "Be careful"            (imperative, addressee)
//
// Without context the model has to guess and sometimes returns "Have I been
// to school?" or "Are I happy?". The detector fires only on tight, clean
// patterns where the inference is reliable, and frames the result as a hint
// the model can override if the source contradicts.
//
// The detector chains with the pronoun resolver: it identifies WHO the
// implicit subject role is (speaker vs. addressee), and the pronoun resolver
// already supplies which Vietnamese pronoun maps to which side. The model
// composes the two into the right English pronoun.

import { vnRe } from './vn-regex';
import type { PronounSignals } from './vietnamese-pronoun-resolver';

// ─── Pattern vocabularies ────────────────────────────────────────────────

// Subject pronouns. If ANY appear, the sentence has an explicit subject and
// the detector does not fire.
const SUBJECT_PRONOUNS = [
  'tôi', 'em', 'anh', 'chị', 'mình', 'mày', 'nó', 'bạn',
  'ông', 'bà', 'con', 'cháu', 'ta', 'tớ', 'cậu', 'tao',
  'họ', 'chúng', 'chúng tôi', 'chúng ta', 'mọi người',
];

// Question particles — sentence-final or sentence-internal markers that
// signal interrogative mood. A question with NO subject defaults to addressee.
const QUESTION_PARTICLES = [
  'chưa', 'không', 'à', 'hả', 'phải không', 'đúng không',
  'gì', 'sao', 'thế nào', 'đâu', 'bao giờ', 'khi nào', 'mấy giờ',
];

// Imperative / suggestion softeners. Their presence with no subject means
// the listener is the implied actor (or "let's" for inclusive readings).
//
// "đi" is intentionally NOT in this list because it's ambiguous: it's both
// an action verb ("go") and an imperative softener ("...đi"). We handle it
// separately in `findImperativeSoftener` by requiring sentence-final position.
const IMPERATIVE_SOFTENERS = ['nhé', 'nha', 'thôi', 'nào', 'nhỉ'];

// State / feeling verbs. With no subject and not in question form, default
// to speaker (people describe their own internal states).
const STATE_VERBS = [
  'đói', 'no', 'khát',
  'mệt', 'khỏe', 'ốm', 'đau',
  'vui', 'buồn', 'sợ', 'giận', 'cô đơn',
  'nhớ', 'thương', 'yêu', 'ghét', 'thích',
  'lạnh', 'nóng', 'ấm',
  'buồn ngủ', 'tỉnh', 'say',
  'hạnh phúc', 'chán',
];

// Completion particles. With an action verb and no subject, default to
// speaker (people report their own completed actions).
const COMPLETION_PARTICLES = ['rồi', 'xong', 'đã'];

// Common action verbs that pair with completion particles.
const ACTION_VERBS = [
  'ăn', 'uống', 'đi', 'đến', 'về', 'tới',
  'học', 'làm', 'viết', 'đọc', 'ngủ', 'dậy',
  'gặp', 'nói', 'nghe', 'xem', 'thấy',
  'mua', 'bán', 'gửi', 'nhận', 'cho', 'lấy',
  'tìm', 'biết', 'hiểu',
];

// Third-person referents. If any appear, abort detection — there's a
// candidate subject in scope that's not the speaker or addressee.
const THIRD_PERSON_REFERENTS = [
  'anh ấy', 'chị ấy', 'ông ấy', 'bà ấy', 'cô ấy', 'chú ấy',
  'thằng đó', 'thằng này', 'thằng kia',
  'con bé đó', 'con bé này', 'con bé kia',
  'họ', 'chúng nó', 'chúng nó', 'mọi người', 'người ta',
  'cái này', 'cái đó', 'cái kia',
  'chuyện này', 'chuyện đó', 'chuyện kia',
  'việc này', 'việc đó',
];

// ─── Helpers ─────────────────────────────────────────────────────────────

const TOKEN_SPLIT_RE = /[\s.,!?;:()'"\-—…]+/u;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(TOKEN_SPLIT_RE).filter((t) => t.length > 0);
}

function containsAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => {
    // Multi-word phrases use plain substring; single tokens use VN-aware boundary.
    if (w.includes(' ')) return lower.includes(w);
    return vnRe(w).test(lower);
  });
}

function findFirst(text: string, words: string[]): string | null {
  const lower = text.toLowerCase();
  for (const w of words) {
    if (w.includes(' ')) {
      if (lower.includes(w)) return w;
    } else if (vnRe(w).test(lower)) {
      return w;
    }
  }
  return null;
}

// A "single sentence" has at most one terminal punctuation mark and no clause
// separators. We exclude commas; period-followed-by-space-then-more-text is a
// multi-sentence message; semicolons split clauses.
function isSingleClauseSentence(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.includes(',')) return false;
  if (trimmed.includes(';')) return false;
  // Multi-sentence check: any internal terminator followed by whitespace + more chars
  if (/[.!?]\s+\S/.test(trimmed)) return false;
  return true;
}

// Imperative-softener detection. "nhé/nha/thôi/nào/nhỉ" are unambiguously
// sentence-final particles. "đi" is also a softener but doubles as the action
// verb "go", so it only counts as imperative when it's the last token (after
// stripping terminal punctuation).
function findImperativeSoftener(text: string): string | null {
  const stripped = text.trim().replace(/[.!?…]+$/u, '').trim();

  for (const w of IMPERATIVE_SOFTENERS) {
    if (vnRe(w).test(stripped)) return w;
  }

  const tokens = stripped.split(/\s+/);
  if (tokens.length > 0 && tokens[tokens.length - 1].toLowerCase() === 'đi') {
    return 'đi';
  }
  return null;
}

// ─── Detector ────────────────────────────────────────────────────────────

export type ImplicitSubjectRole = 'speaker' | 'addressee';
export type ImplicitSubjectPattern =
  | 'question_no_subject'
  | 'imperative_no_subject'
  | 'state_verb_statement'
  | 'completion_statement';

export interface ImpliedSubjectMatch {
  detected: boolean;
  role: ImplicitSubjectRole | null;
  pattern: ImplicitSubjectPattern | null;
  trigger: string | null;
  reason: string | null;
}

export interface ImpliedSubjectGateContext {
  topicCommentDetected: boolean;
  pronounSignals: PronounSignals | null;
}

const NULL_MATCH: ImpliedSubjectMatch = {
  detected: false,
  role: null,
  pattern: null,
  trigger: null,
  reason: null,
};

export function detectImpliedSubject(
  text: string,
  ctx: ImpliedSubjectGateContext = { topicCommentDetected: false, pronounSignals: null }
): ImpliedSubjectMatch {
  const trimmed = text.trim();

  // Gate 1: length ≤ 60 chars (short chat-style messages only).
  if (trimmed.length === 0 || trimmed.length > 60) return NULL_MATCH;

  // Gate 2: single clause, no commas, no semicolons, single sentence.
  if (!isSingleClauseSentence(trimmed)) return NULL_MATCH;

  // Gate 3: no explicit subject pronoun anywhere.
  if (containsAny(trimmed, SUBJECT_PRONOUNS)) return NULL_MATCH;

  // Gate 4: no third-person referent in scope.
  if (containsAny(trimmed, THIRD_PERSON_REFERENTS)) return NULL_MATCH;

  // Gate 5: don't double-fire on top of the topic-comment detector.
  if (ctx.topicCommentDetected) return NULL_MATCH;

  // Gate 6: pronoun resolver must have at least medium confidence on the pair,
  // otherwise "speaker"/"addressee" can't be resolved into specific English.
  if (!ctx.pronounSignals || ctx.pronounSignals.confidence < 0.5) return NULL_MATCH;

  // ─── Pattern matching ────────────────────────────────────────────────
  const isQuestion =
    trimmed.includes('?') ||
    QUESTION_PARTICLES.some((p) => containsAny(trimmed, [p]));

  const imperativeTrigger = findImperativeSoftener(trimmed);
  const stateVerbTrigger = findFirst(trimmed, STATE_VERBS);
  const completionTrigger = findFirst(trimmed, COMPLETION_PARTICLES);
  const hasActionVerb = containsAny(trimmed, ACTION_VERBS);

  // Collect all matches. We require EXACTLY ONE to fire — ambiguity aborts.
  const candidates: ImpliedSubjectMatch[] = [];

  if (isQuestion && !imperativeTrigger && !stateVerbTrigger) {
    // Pure question without imperative/state-verb cross-signal.
    candidates.push({
      detected: true,
      role: 'addressee',
      pattern: 'question_no_subject',
      trigger: 'question form',
      reason:
        'Question with no explicit subject — Vietnamese questions about state or action default to asking the listener.',
    });
  }

  if (imperativeTrigger && !isQuestion && !stateVerbTrigger) {
    candidates.push({
      detected: true,
      role: 'addressee',
      pattern: 'imperative_no_subject',
      trigger: imperativeTrigger,
      reason: `Imperative softener "${imperativeTrigger}" with no subject — the listener is the implied actor.`,
    });
  }

  if (stateVerbTrigger && !isQuestion && !imperativeTrigger) {
    candidates.push({
      detected: true,
      role: 'speaker',
      pattern: 'state_verb_statement',
      trigger: stateVerbTrigger,
      reason: `State verb "${stateVerbTrigger}" with no subject — speakers describe their own internal states.`,
    });
  }

  if (
    completionTrigger &&
    hasActionVerb &&
    !isQuestion &&
    !imperativeTrigger &&
    !stateVerbTrigger
  ) {
    candidates.push({
      detected: true,
      role: 'speaker',
      pattern: 'completion_statement',
      trigger: completionTrigger,
      reason: `Completion particle "${completionTrigger}" with action verb and no subject — speakers report their own completed actions.`,
    });
  }

  // Exactly one candidate or abort.
  if (candidates.length !== 1) return NULL_MATCH;
  return candidates[0];
}

// Build a focused system-prompt addendum. Frames the inference as a hint the
// model may override, and shows a concrete right/wrong example.
export function buildImpliedSubjectPrompt(
  match: ImpliedSubjectMatch,
  pronounSignals: PronounSignals | null
): string {
  if (!match.detected || !match.role) return '';

  const speakerPronoun = pronounSignals?.selfPronoun || 'speaker';
  const addresseePronoun = pronounSignals?.otherPronoun || 'addressee';
  const targetVnPronoun = match.role === 'speaker' ? speakerPronoun : addresseePronoun;

  const lines: string[] = ['', '# IMPLICIT SUBJECT INFERENCE:'];
  lines.push(`- Source drops the subject. Pattern: ${match.pattern}.`);
  lines.push(`- Likely implicit subject: the ${match.role} (in this conversation: "${targetVnPronoun}").`);
  lines.push(`- Reason: ${match.reason}`);
  lines.push(
    `- Render this as the appropriate English pronoun for the ${match.role}. May be "I/we/us" for speaker or "you" for addressee depending on context (number, formality).`
  );
  lines.push(
    `- IMPORTANT: This is a hint, not a command. If something in the source contradicts this inference (e.g., a third-party referent earlier in the conversation), use your own judgment.`
  );

  if (match.role === 'speaker') {
    lines.push(`- Example: "Đói quá" → "I'm hungry" ✓  NOT "Are you hungry?" ✗`);
  } else {
    lines.push(`- Example: "Đi học chưa?" → "Have you been to school yet?" ✓  NOT "Have I been to school yet?" ✗`);
  }

  return lines.join('\n');
}
