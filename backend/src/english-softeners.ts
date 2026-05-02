// English politeness softeners and tag questions for the EN→VI direction.
//
// English carries politeness and confirmation through structural wrappings
// (Would you mind X / If you could / I was wondering if) and sentence-final
// tag questions (right? / isn't it? / you know?). Vietnamese has rich
// softener constructions and final particles that map to these — the model
// often flattens both directions, producing translations that read more
// blunt or more uncertain than the source intended.
//
// This module detects three classes:
//   1. Softeners — politeness wrappers around requests, anchored at start
//      of clause (after start-of-string or after sentence terminator).
//   2. Tag questions — confirmation seekers anchored sentence-final with
//      a preceding comma (so mid-sentence "you know" filler doesn't fire).
//   3. Reassurance phrases — fixed expressions like "no worries" /
//      "no big deal" that translate to specific VN reassurance forms.
//
// Risk mitigations baked in:
//   - Risk 1 (false positives on lookalike fragments): patterns require
//     full structure ("I was wondering if X", not just "I was wondering").
//   - Risk 2 (mid-sentence discourse markers): tag-question patterns
//     require sentence-final position with a comma anchor before them.
//   - Risk 3 (genuine questions vs. tag questions): tag patterns require
//     a preceding clause (something before the comma). "Right?" alone
//     doesn't match.

export type SoftenerCategory = 'softener' | 'tag_question' | 'reassurance';

export interface SoftenerEntry {
  category: SoftenerCategory;
  // The English construction this matches.
  display: string;
  // The actual regex used for detection.
  pattern: RegExp;
  // Suggested Vietnamese rendering (one or several options).
  vnRendering: string;
  // When/how to apply the rendering.
  contextHint: string;
}

// Start-of-clause anchor: either start-of-string OR after a previous
// sentence-terminating punctuation followed by whitespace.
const START_ANCHOR = '(?:^|[.!?]\\s+)';

// Sentence-final-with-comma anchor: comma + tag + optional terminator + end.
// The /m flag lets $ match end-of-line too for multi-line messages.
const TAG_END_ANCHOR = '\\??\\s*[.!?]?\\s*$';

export const SOFTENERS: SoftenerEntry[] = [
  // ─── Softeners (request-wrappers, anchored start-of-clause) ──────────────
  {
    category: 'softener',
    display: 'Would you mind X',
    pattern: new RegExp(`${START_ANCHOR}would\\s+you\\s+mind\\s+\\w+`, 'i'),
    vnRendering: 'Phiền + verb / Có thể... được không / Cho mình hỏi',
    contextHint: 'Politeness frame around a request. Translate with VN softener like "Phiền em đưa muối được không" — NOT a direct command.',
  },
  {
    category: 'softener',
    display: 'If you could X',
    pattern: new RegExp(`${START_ANCHOR}if\\s+you\\s+could\\s+\\w+`, 'i'),
    vnRendering: 'Nếu được + verb / Nếu bạn có thể',
    contextHint: 'Conditional politeness. Use "nếu được" or "nếu bạn có thể" — preserves the if-conditional softness.',
  },
  {
    category: 'softener',
    display: 'I was wondering if',
    pattern: new RegExp(`${START_ANCHOR}i\\s+was\\s+wondering\\s+if`, 'i'),
    vnRendering: 'Mình đang định hỏi / Cho mình hỏi',
    contextHint: 'Tentative request. Render as soft inquiry, not direct question. Requires "if" follow-up — bare "I was wondering" is reflective musing and does NOT match.',
  },
  {
    category: 'softener',
    display: 'Could you possibly X',
    pattern: new RegExp(`${START_ANCHOR}could\\s+you\\s+possibly\\s+\\w+`, 'i'),
    vnRendering: 'Có thể... được không / Liệu bạn có thể',
    contextHint: 'Heightened politeness. Stronger than "Could you" — use "có thể... được không" with extra deference.',
  },
  {
    category: 'softener',
    display: 'Sorry to bother you, but',
    pattern: new RegExp(`${START_ANCHOR}sorry\\s+to\\s+bother\\s+you[,]?\\s+but`, 'i'),
    vnRendering: 'Xin lỗi đã làm phiền, nhưng',
    contextHint: 'Apologetic preface for an inconvenient request. Maintain the apology in VN.',
  },
  {
    category: 'softener',
    display: 'Do you think you could X',
    pattern: new RegExp(`${START_ANCHOR}do\\s+you\\s+think\\s+you\\s+could\\s+\\w+`, 'i'),
    vnRendering: 'Bạn có thể... không / Bạn nghĩ bạn có thể',
    contextHint: 'Soft request inviting the listener to consider. Render with "có thể... không".',
  },
  {
    category: 'softener',
    display: 'Just wondering',
    pattern: new RegExp(`${START_ANCHOR}just\\s+wondering(?=[\\s,.])`, 'i'),
    vnRendering: 'Chỉ tò mò / Hỏi cho biết thôi',
    contextHint: 'Casual inquiry, lower stakes than a real request. Don\'t render as a serious question.',
  },
  {
    category: 'softener',
    display: 'When you get a chance',
    pattern: /\bwhen\s+you\s+(?:get\s+(?:a|the)\s+chance|have\s+(?:a|the)\s+chance|can|are\s+free)\b/i,
    vnRendering: 'Khi nào bạn rảnh / Lúc nào bạn rảnh',
    contextHint: 'Removes urgency from a request. Preserve the "no rush" framing in VN.',
  },
  {
    category: 'softener',
    display: 'It would be great if',
    pattern: new RegExp(`${START_ANCHOR}it\\s+would\\s+be\\s+(?:great|nice|helpful|wonderful|amazing)\\s+if`, 'i'),
    vnRendering: 'Sẽ tuyệt nếu / Mong là / Sẽ rất hay nếu',
    contextHint: 'Conditional politeness expressing hope. Render as "sẽ tuyệt nếu" or similar.',
  },
  {
    category: 'softener',
    display: "I'd appreciate it if",
    pattern: new RegExp(`${START_ANCHOR}i'?d\\s+appreciate\\s+it\\s+if`, 'i'),
    vnRendering: 'Mình sẽ rất biết ơn nếu / Cảm ơn bạn nếu',
    contextHint: 'Strong politeness with implied gratitude. Match the appreciation.',
  },

  // ─── Tag questions (sentence-final, comma-anchored) ──────────────────────
  {
    category: 'tag_question',
    display: ', right?',
    pattern: new RegExp(`,\\s*right${TAG_END_ANCHOR}`, 'im'),
    vnRendering: ', nhỉ? (soft) / , đúng không? (clearer)',
    contextHint: 'Soft confirmation tag. Use "nhỉ" for casual close-relationship; "đúng không" for clearer check. Requires preceding comma — "Right?" alone is a real question, not a tag.',
  },
  {
    category: 'tag_question',
    display: ", isn't it? / aren't they? / wasn't it?",
    pattern: new RegExp(
      `,\\s*(?:isn'?t\\s+(?:it|he|she)|aren'?t\\s+(?:they|you|we)|wasn'?t\\s+(?:it|he|she)|weren'?t\\s+(?:they|you))${TAG_END_ANCHOR}`,
      'im'
    ),
    vnRendering: ', phải không? / , đúng chứ?',
    contextHint: 'Confirmation tag for declarative statements. Use "phải không" or "đúng chứ".',
  },
  {
    category: 'tag_question',
    display: ", don't you think?",
    pattern: new RegExp(`,\\s*don'?t\\s+you\\s+think${TAG_END_ANCHOR}`, 'im'),
    vnRendering: ', bạn nghĩ vậy không? / , bạn thấy sao?',
    contextHint: 'Seeking opinion confirmation. Render with "bạn nghĩ vậy không".',
  },
  {
    category: 'tag_question',
    display: ', you know?',
    pattern: new RegExp(`,\\s*you\\s+know${TAG_END_ANCHOR}`, 'im'),
    vnRendering: ', bạn biết không? / final particle "nhỉ"',
    contextHint: 'Casual understanding check. ONLY at sentence end with comma anchor — "you know" mid-sentence as filler does NOT match this pattern.',
  },
  {
    category: 'tag_question',
    display: ', huh?',
    pattern: new RegExp(`,\\s*huh${TAG_END_ANCHOR}`, 'im'),
    vnRendering: ', hả? / , hen?',
    contextHint: 'Very casual confirmation tag. Use "hả" or regional "hen".',
  },
  {
    category: 'tag_question',
    display: 'you know what I mean?',
    pattern: new RegExp(`(?:^|,\\s+)you\\s+know\\s+what\\s+i\\s+mean${TAG_END_ANCHOR}`, 'im'),
    vnRendering: 'bạn hiểu ý mình chứ? / bạn biết ý mình chứ?',
    contextHint: 'Understanding check. The full phrase must be sentence-final.',
  },

  // ─── Reassurance phrases ─────────────────────────────────────────────────
  {
    category: 'reassurance',
    display: 'no worries',
    pattern: /\bno\s+worries\b/i,
    vnRendering: 'không sao đâu / không vấn đề gì / yên tâm',
    contextHint: 'Reassurance phrase, not literal "no worries to be had". Maintain the dismissive-positive tone.',
  },
  {
    category: 'reassurance',
    display: 'no big deal',
    pattern: /\bno\s+big\s+deal\b/i,
    vnRendering: 'chuyện nhỏ / không có gì / không phải chuyện lớn',
    contextHint: 'Dismissive reassurance. Render casually — don\'t inflate to formal phrasing.',
  },
  {
    category: 'reassurance',
    display: "it's all good",
    pattern: /\bit'?s\s+all\s+good\b/i,
    vnRendering: 'mọi thứ đều ổn / không sao đâu / ổn cả mà',
    contextHint: 'Reassurance, not a literal claim about goodness.',
  },
  {
    category: 'reassurance',
    display: 'for sure / definitely',
    pattern: /\b(?:for\s+sure|definitely)\b/i,
    vnRendering: 'chắc chắn rồi / đúng vậy / dứt khoát',
    contextHint: 'Emphatic agreement or confirmation. Match the strong-yes tone.',
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface SoftenerMatch {
  category: SoftenerCategory;
  display: string;
  matched: string;
  vnRendering: string;
  contextHint: string;
}

export function detectEnglishSofteners(text: string): SoftenerMatch[] {
  const matches: SoftenerMatch[] = [];
  for (const entry of SOFTENERS) {
    const m = text.match(entry.pattern);
    if (m) {
      matches.push({
        category: entry.category,
        display: entry.display,
        matched: m[0].trim(),
        vnRendering: entry.vnRendering,
        contextHint: entry.contextHint,
      });
    }
  }
  return matches;
}

// Build a focused prompt block grouping by category. Provides each match's
// VN equivalent + contextHint so the model picks the right rendering.
export function buildEnglishSoftenersPrompt(matches: SoftenerMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# ENGLISH POLITENESS / TAG SIGNALS DETECTED (EN→VI):'];

  const byCategory: Record<SoftenerCategory, SoftenerMatch[]> = {
    softener: [],
    tag_question: [],
    reassurance: [],
  };
  for (const m of matches) byCategory[m.category].push(m);

  if (byCategory.softener.length > 0) {
    lines.push('Softeners (politeness wrappers around requests):');
    for (const m of byCategory.softener) {
      lines.push(`- "${m.display}" → ${m.vnRendering}`);
      lines.push(`  ${m.contextHint}`);
    }
  }

  if (byCategory.tag_question.length > 0) {
    if (lines.length > 1) lines.push('');
    lines.push('Tag questions (sentence-final confirmation seekers):');
    for (const m of byCategory.tag_question) {
      lines.push(`- "${m.display}" → ${m.vnRendering}`);
      lines.push(`  ${m.contextHint}`);
    }
  }

  if (byCategory.reassurance.length > 0) {
    if (lines.length > 1) lines.push('');
    lines.push('Reassurance phrases (fixed expressions, not literal claims):');
    for (const m of byCategory.reassurance) {
      lines.push(`- "${m.display}" → ${m.vnRendering}`);
      lines.push(`  ${m.contextHint}`);
    }
  }

  lines.push('');
  lines.push('Treat as guidance — adjust phrasing if relationship/register suggests something different.');
  return lines.join('\n');
}
