/**
 * Smart Vietnamese Ambiguity Detector
 *
 * Detects ambiguous Vietnamese verbs in a message and asks OpenAI
 * to score confidence for each interpretation. Only shows picker if uncertain.
 */

import { VN_LB } from './vn-regex';

/**
 * List of ambiguous Vietnamese verbs with their possible meanings
 */
export const AMBIGUOUS_VIETNAMESE_VERBS = [
  {
    pattern: /được\s+không/i,
    meanings: ['permission/ability: can I do this?', 'evaluation: is this acceptable?'],
    contextClues: ['is it a question?', 'is there an object following?'],
  },
  {
    pattern: new RegExp(`${VN_LB}để\\s+`, 'iu'),
    meanings: ['let/allow someone to do something', 'put/place something', 'defer something to later'],
    contextClues: ['is it imperative?', 'are there location words?', 'are there time references?'],
  },
  {
    pattern: /tới\s+/i,
    meanings: ['arrive/come to a place', 'reach/amount to a number', 'by/until a time'],
    contextClues: ['is it movement?', 'are there numbers?', 'are there time references?'],
  },
  {
    pattern: /\bcó\s+/i,
    meanings: ['possess/have', 'there exists', 'can/might (modal)'],
    contextClues: ['subject+object pattern?', 'question form?', 'modal construction?'],
  },
  {
    pattern: /\bghê/i,
    meanings: ['scary/terrifying', 'bad/awful', 'awesome (slang)'],
    contextClues: ['fear context?', 'negative subject?', 'admiration context?'],
  },
  {
    pattern: /hay\s+/i,
    meanings: ['or (choice)', 'often/frequently', 'good/clever', 'strange'],
    contextClues: ['options/choices?', 'frequency words?', 'quality judgment?'],
  },
  {
    pattern: /\bmà\s+/i,
    meanings: ['but/contrast', 'quotation marker', 'causal emphasis'],
    contextClues: ['contrasting ideas?', 'reported speech?', 'explanation?'],
  },
  {
    pattern: /vì\s+/i,
    meanings: ['because/reason', 'for/on behalf of', 'since/given that'],
    contextClues: ['cause-effect?', 'beneficiary?', 'time/reason?'],
  },
  {
    pattern: /\bkhông\s+được/i,
    meanings: ['cannot/unable', 'not allowed', 'refusal/will not'],
    contextClues: ['ability context?', 'permission context?', 'choice context?'],
  },
  {
    pattern: /\bthích\s+/i,
    meanings: ['like/enjoy', 'suitable/fitting'],
    contextClues: ['direct preference?', 'quality judgment?'],
  },
];

/**
 * Detect if Vietnamese message contains ambiguous verbs
 */
export function detectAmbiguousVerbs(vietnameseText: string): Array<{
  verb: string;
  pattern: RegExp;
  meanings: string[];
}> {
  const detected: Array<{ verb: string; pattern: RegExp; meanings: string[] }> = [];

  for (const entry of AMBIGUOUS_VIETNAMESE_VERBS) {
    if (entry.pattern.test(vietnameseText)) {
      const match = vietnameseText.match(entry.pattern);
      if (match) {
        detected.push({
          verb: match[0],
          pattern: entry.pattern,
          meanings: entry.meanings,
        });
      }
    }
  }

  return detected;
}

/**
 * Build enhancement to system prompt for ambiguous verbs
 * Asks OpenAI to score confidence in each interpretation
 */
export function buildAmbiguityPromptEnhancement(vietnameseText: string): string {
  const detected = detectAmbiguousVerbs(vietnameseText);

  if (detected.length === 0) {
    return '';
  }

  const warningText = detected
    .map(
      d =>
        `- "${d.verb}": could mean ${d.meanings.join(' OR ')}`
    )
    .join('\n');

  return `

# DETECTED AMBIGUOUS VERBS (Confidence Scoring Required)
The message contains words with multiple meanings. For EACH option you generate:
1. Identify which interpretation of the ambiguous verb it uses
2. Score your CONFIDENCE in that interpretation (0-100)
3. Briefly explain why that interpretation fits the context

Ambiguous words detected:
${warningText}

CRITICAL: Return confidence score in each option as a JSON field: "confidenceScore": <0-100>
If you're >85% confident one interpretation is correct, you can suggest it as recommended.
If you're <50% confident, multiple plausible interpretations exist — generate all viable options.
`;
}

/**
 * Filter options based on confidence scores
 * If we have high confidence in one interpretation, reduce options to just that one
 */
export function filterOptionsByConfidence(
  result: Record<string, unknown>
): {
  filtered: Record<string, unknown>;
  shouldShowPicker: boolean;
  reason: string;
} {
  const options = (result.options as Array<Record<string, unknown>>) || [];

  if (options.length === 0) {
    return {
      filtered: result,
      shouldShowPicker: false,
      reason: 'No ambiguity detected',
    };
  }

  // Extract confidence scores from options
  const optionsWithConfidence = options.map((opt) => ({
    ...opt,
    confidenceScore: (opt.confidenceScore as number) || 50, // default to 50 if not provided
  }));

  // Sort by confidence descending
  optionsWithConfidence.sort((a, b) => b.confidenceScore - a.confidenceScore);

  const bestConfidence = optionsWithConfidence[0].confidenceScore;

  // Decision logic:
  // - If best option is >85% confident: auto-translate (skip picker)
  // - If best option is <50% confident: show all options (genuine ambiguity)
  // - If 50-85%: show options but highlight the recommended one

  if (bestConfidence > 85) {
    // High confidence: just use the best option
    return {
      filtered: {
        ...result,
        options: [optionsWithConfidence[0]], // Only best option
        _autoTranslated: true,
        _skippedPicker: true,
      },
      shouldShowPicker: false,
      reason: `High confidence (${bestConfidence}%) in interpretation: ${optionsWithConfidence[0].emotion}`,
    };
  }

  if (bestConfidence < 50) {
    // Low confidence: show all options, user picks
    return {
      filtered: {
        ...result,
        options: optionsWithConfidence, // All options
        _showPicker: true,
      },
      shouldShowPicker: true,
      reason: `Low confidence (${bestConfidence}%) — ambiguity exists, showing all options`,
    };
  }

  // Medium confidence: show options but mark recommended
  return {
    filtered: {
      ...result,
      options: optionsWithConfidence.map((opt, i) => ({
        ...opt,
        _recommended: i === 0, // Mark best option as recommended
      })),
      _showPicker: true,
    },
    shouldShowPicker: true,
    reason: `Medium confidence (${bestConfidence}%) — showing options with recommendation`,
  };
}
