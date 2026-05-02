// English pronoun signal detector for the EN→VI direction.
//
// English "you" and "we" are ambiguous in ways Vietnamese can't be:
//   - "you" is singular OR plural; VN must pick (em vs các em).
//   - "we" can be inclusive OR exclusive of the listener; VN distinguishes
//     (chúng ta inclusive, chúng tôi exclusive, chúng mình intimate-inclusive).
//
// The model guesses, often wrong — especially when the antecedent is in a
// previous turn. This detector scans the English source for explicit markers
// and injects hints into the prompt.
//
// IMPORTANT: Detection priors assume **1-to-1 chat** (sender ↔ one contact).
// In that context "you guys" / "y'all" / "you all" are colloquial singulars,
// not actual plurals — they would only mean plural in a group chat. So this
// detector treats them as singular and only fires PLURAL on genuinely
// unambiguous markers (you two, all of you, you and your sister).
//
// If group chat is added later, flip a contact-level "isGroup" flag and
// re-include the colloquial markers in the plural set.

export interface EnglishPronounSignals {
  youNumber: 'singular' | 'plural' | 'unknown';
  weInclusivity: 'inclusive' | 'exclusive' | 'unknown';
  matchedTokens: string[];
}

// Genuinely-plural "you" patterns. These have no colloquial-singular reading
// even in 1v1 chat. "you guys" / "y'all" deliberately excluded.
const YOU_PLURAL_PATTERNS: RegExp[] = [
  /\byou\s+(two|three|four|five)\b/i,
  /\byou\s+both\b/i,
  /\b(all|both|each|every\s+one)\s+of\s+you\b/i,
  // "You and your [relation]" — explicit pairing of contact + their family/group.
  /\byou\s+and\s+your\s+(family|team|friends|sister|brother|mom|dad|husband|wife|kids|children|parents|partner|coworkers|colleagues|cousin|cousins|aunt|uncle|grandma|grandpa|grandparents|son|daughter|niece|nephew|boyfriend|girlfriend|crew|squad|group)\b/i,
];

// "Let's" used as a discourse marker rather than a real proposal. Skip these
// before treating let's-+-verb as inclusive.
const LETS_DISCOURSE_PATTERNS: RegExp[] = [
  /\blet'?s\s+(see|say|just\s+say|be\s+honest|face\s+it|hope|assume|imagine|pretend|suppose|think)\b/i,
];

// "Let's"-based inclusive patterns — gated by LETS_DISCOURSE_PATTERNS so
// "let's see"/"let's be honest"/etc. don't count as proposals.
const WE_INCLUSIVE_LETS_PATTERNS: RegExp[] = [
  /\blet'?s\s+\w+/i,
  /\blet\s+us\s+\w+/i,
];

// Other inclusive markers — always count when matched.
const WE_INCLUSIVE_OTHER_PATTERNS: RegExp[] = [
  /\bjoin\s+(me|us)\b/i,
  /\bcome\s+with\s+(me|us)\b/i,
  /\bcome\s+over\b/i,
  /\bshould\s+we\s+\w+/i,
  /\bcan\s+we\s+\w+/i,
  /\bwhy\s+don'?t\s+we\b/i,
  /\bwhat\s+if\s+we\b/i,
  /\bhow\s+about\s+we\b/i,
];

// Exclusive-of-listener markers — "me and my X", "my X and I" — naturally
// exclude the contact from the "we" group.
const WE_EXCLUSIVE_PATTERNS: RegExp[] = [
  /\bme\s+and\s+my\s+\w+/i,
  /\bmy\s+(family|team|friends|coworkers|colleagues|wife|husband|sister|brother|parents|kids|children|mom|dad|partner|cousin|cousins|aunt|uncle|squad|group|crew|roommate|roommates)\s+and\s+i\b/i,
];

// Check if "you" or "your" appears at all — gate for the youNumber check.
const YOU_PRESENT = /\byou\b|\byour\b/i;

export function detectEnglishPronouns(text: string): EnglishPronounSignals {
  const matched: string[] = [];

  // ── YOU NUMBER ────────────────────────────────────────────────────────
  let youNumber: EnglishPronounSignals['youNumber'] = 'unknown';
  if (YOU_PRESENT.test(text)) {
    let pluralMatch: RegExpMatchArray | null = null;
    for (const re of YOU_PLURAL_PATTERNS) {
      const m = text.match(re);
      if (m) {
        pluralMatch = m;
        break;
      }
    }
    if (pluralMatch) {
      youNumber = 'plural';
      matched.push(`you-plural: "${pluralMatch[0]}"`);
    } else {
      youNumber = 'singular';
    }
  }

  // ── WE INCLUSIVITY ────────────────────────────────────────────────────
  // No outer gate: the patterns themselves are restrictive enough. "Come
  // with me" or "me and my family" doesn't literally contain "we", but they
  // signal inclusive/exclusive grouping that should still produce a hint.
  let weInclusivity: EnglishPronounSignals['weInclusivity'] = 'unknown';
  let inclusiveMatch: RegExpMatchArray | null = null;

  // Try let's-based patterns only if it isn't a discourse marker.
  const isDiscourseLets = LETS_DISCOURSE_PATTERNS.some((re) => re.test(text));
  if (!isDiscourseLets) {
    for (const re of WE_INCLUSIVE_LETS_PATTERNS) {
      const m = text.match(re);
      if (m) {
        inclusiveMatch = m;
        break;
      }
    }
  }

  // Other inclusive markers always count.
  if (!inclusiveMatch) {
    for (const re of WE_INCLUSIVE_OTHER_PATTERNS) {
      const m = text.match(re);
      if (m) {
        inclusiveMatch = m;
        break;
      }
    }
  }

  if (inclusiveMatch) {
    weInclusivity = 'inclusive';
    matched.push(`we-inclusive: "${inclusiveMatch[0]}"`);
  } else {
    let exclusiveMatch: RegExpMatchArray | null = null;
    for (const re of WE_EXCLUSIVE_PATTERNS) {
      const m = text.match(re);
      if (m) {
        exclusiveMatch = m;
        break;
      }
    }
    if (exclusiveMatch) {
      weInclusivity = 'exclusive';
      matched.push(`we-exclusive: "${exclusiveMatch[0]}"`);
    }
  }

  return { youNumber, weInclusivity, matchedTokens: matched };
}

// Build a focused prompt block. Only emits when there's actionable signal —
// plural "you" or determined "we" inclusivity. Singular "you" and unknown
// "we" produce no prompt addition (the model handles those naturally).
export function buildEnglishPronounsPrompt(signals: EnglishPronounSignals): string {
  const hasYouSignal = signals.youNumber === 'plural';
  const hasWeSignal = signals.weInclusivity !== 'unknown';
  if (!hasYouSignal && !hasWeSignal) return '';

  const lines: string[] = ['', '# ENGLISH PRONOUN SIGNALS (EN→VI):'];

  if (signals.youNumber === 'plural') {
    lines.push(
      '- "you" appears as PLURAL addressee. Use Vietnamese plural form: "các" + addressee pronoun (e.g., "các em", "các anh", "các bạn"), or "mọi người" for general groups. Do NOT use a bare singular pronoun.'
    );
  }

  if (signals.weInclusivity === 'inclusive') {
    lines.push(
      '- "we" is INCLUSIVE of the listener (the speaker is proposing or describing something the listener is part of). Use "chúng ta" or "chúng mình" (inclusive of listener). Do NOT use "chúng tôi".'
    );
  } else if (signals.weInclusivity === 'exclusive') {
    lines.push(
      '- "we" is EXCLUSIVE of the listener (the speaker\'s group does NOT include the listener). Use "chúng tôi" or "bọn tôi" (excluding listener). Do NOT use "chúng ta".'
    );
  }

  if (signals.matchedTokens.length > 0) {
    lines.push(`(Matched: ${signals.matchedTokens.join('; ')}.)`);
  }
  lines.push('Treat as a hint — if surrounding context strongly disagrees, use your judgment.');

  return lines.join('\n');
}
