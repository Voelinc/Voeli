// Vietnamese dish-name dictionary.
//
// Iconic Vietnamese dishes (phở, bánh mì, bún bò huế, ...) are proper nouns,
// not generic descriptions. Translating them to English equivalents
// ("rice noodle soup") loses the dish-specific identity. The right behavior
// is to PRESERVE the original name in the translation and add a brief
// English gloss in parentheses on first mention only.
//
// Per-user-uid count tracking (mirrors cultural-concepts) controls when the
// gloss + cultural-warning chip surfaces vs. when the dish translates plain.
//
// Risk 3 mitigation: per-dish `learnAfter` threshold tuned to how universally
// known the dish is.
//   - Threshold 1 (iconic, globally familiar): gloss once, then plain forever.
//     Examples: phở, bánh mì, gỏi cuốn, nước mắm.
//   - Threshold 2 (well-known but more depth-specific): default.
//     Examples: bún bò huế, bánh xèo, canh chua, cơm tấm.
//   - Threshold 3 (regional / lesser-known): give the user more exposure
//     before suppressing.
//     Examples: mì quảng, cao lầu, bún đậu mắm tôm.
//
// Risk 2 note: single-syllable generic terms like `cơm` (rice), `bún` (rice
// vermicelli), `chè` (tea / dessert soup) are intentionally EXCLUDED because
// they over-fire on non-dish meanings. Compound dish names where the meaning
// is unambiguous are the only safe entries.

import { vnRe } from './vn-regex';

export interface DishName {
  name: string;
  briefGloss: string;
  context: string;
  learnAfter?: number;
}

const DEFAULT_LEARN_AFTER = 2;

export const DISH_NAMES: DishName[] = [
  // ─── Iconic / globally familiar — threshold 1 ────────────────────────────
  {
    name: 'phở',
    briefGloss: 'Vietnamese rice noodle soup with beef or chicken broth',
    context: 'Northern origin; eaten any time of day, classic breakfast dish',
    learnAfter: 1,
  },
  {
    name: 'bánh mì',
    briefGloss: 'Vietnamese baguette sandwich',
    context: 'Crusty French-influenced bread filled with pâté, pork, pickled veg, herbs',
    learnAfter: 1,
  },
  {
    name: 'gỏi cuốn',
    briefGloss: 'Vietnamese fresh spring rolls',
    context: 'Rice paper rolls with shrimp, pork, herbs, vermicelli — eaten cold with peanut sauce',
    learnAfter: 1,
  },
  {
    name: 'nước mắm',
    briefGloss: 'Vietnamese fish sauce',
    context: 'Iconic fermented condiment, central to most savory dishes',
    learnAfter: 1,
  },

  // ─── Well-known — threshold 2 (default) ──────────────────────────────────
  {
    name: 'bún bò huế',
    briefGloss: 'spicy beef and pork noodle soup from Huế',
    context: 'Central Vietnamese specialty, lemongrass-forward, distinct from phở',
  },
  {
    name: 'bún chả',
    briefGloss: 'Hanoi grilled pork with rice noodles',
    context: 'Pork patties + sliced pork in a sweet-savory broth, eaten with vermicelli and herbs',
  },
  {
    name: 'bún riêu',
    briefGloss: 'crab and tomato noodle soup',
    context: 'Tangy tomato broth with freshwater crab paste',
  },
  {
    name: 'bánh xèo',
    briefGloss: 'Vietnamese savory crepe',
    context: 'Turmeric rice flour crepe filled with shrimp, pork, bean sprouts',
  },
  {
    name: 'bánh cuốn',
    briefGloss: 'steamed rolled rice rolls',
    context: 'Thin steamed rice sheets rolled around minced pork and mushroom',
  },
  {
    name: 'bánh tét',
    briefGloss: 'cylindrical sticky rice cake (Tết / Lunar New Year)',
    context: 'Southern New Year tradition; banana-leaf-wrapped sticky rice with pork and mung bean',
  },
  {
    name: 'bánh chưng',
    briefGloss: 'square sticky rice cake (Tết / Lunar New Year)',
    context: 'Northern counterpart of bánh tét — square shape, same fillings',
  },
  {
    name: 'chả giò',
    briefGloss: 'Vietnamese fried spring rolls (Southern term)',
    context: 'Crispy fried rolls with pork and vegetables; called nem rán in the North',
  },
  {
    name: 'nem rán',
    briefGloss: 'Vietnamese fried spring rolls (Northern term)',
    context: 'Same dish as chả giò; this is the Northern name',
  },
  {
    name: 'canh chua',
    briefGloss: 'Vietnamese sour soup',
    context: 'Southern Vietnamese signature — tangy soup with fish, tomato, pineapple, tamarind',
  },
  {
    name: 'cơm tấm',
    briefGloss: 'broken rice with grilled pork',
    context: 'Saigon street-food classic — broken-grain rice, grilled pork chop, fried egg',
  },
  {
    name: 'xôi',
    briefGloss: 'sticky rice (sweet or savory)',
    context: 'Eaten as breakfast or snack; many varieties (xôi gấc, xôi đậu xanh, etc.)',
  },
  {
    name: 'thịt kho',
    briefGloss: 'caramelized braised pork with eggs',
    context: 'Home-cooked classic; pork belly slow-braised in coconut water with eggs',
  },
  {
    name: 'cá kho tộ',
    briefGloss: 'caramelized fish in clay pot',
    context: 'Pan-fried fish braised in caramelized fish sauce; Southern home cooking',
  },
  {
    name: 'bò kho',
    briefGloss: 'Vietnamese beef stew',
    context: 'Lemongrass and star-anise beef stew, often eaten with bread or noodles',
  },
  {
    name: 'chả lụa',
    briefGloss: 'Vietnamese pork sausage / cold cut',
    context: 'Banana-leaf-wrapped pork sausage; staple in bánh mì and noodle soups',
  },
  {
    name: 'bánh bao',
    briefGloss: 'Vietnamese steamed buns',
    context: 'Steamed buns filled with pork, egg, sausage; influenced by Chinese baozi',
  },
  {
    name: 'hủ tiếu',
    briefGloss: 'Southern noodle soup',
    context: 'Cantonese-Vietnamese noodle soup with clear pork-bone broth',
  },

  // ─── Regional / lesser-known — threshold 3 ───────────────────────────────
  {
    name: 'mì quảng',
    briefGloss: 'turmeric-yellow noodle dish from Quảng Nam',
    context: 'Wide rice noodles with shrimp, pork, peanuts; central Vietnamese specialty',
    learnAfter: 3,
  },
  {
    name: 'cao lầu',
    briefGloss: 'Hội An noodle dish',
    context: 'Thick chewy noodles with pork, herbs, crispy croutons; specific to Hội An',
    learnAfter: 3,
  },
  {
    name: 'bún ốc',
    briefGloss: 'snail noodle soup',
    context: 'Hanoi specialty; tomato-based broth with freshwater snails',
    learnAfter: 3,
  },
  {
    name: 'bún đậu mắm tôm',
    briefGloss: 'tofu and noodles with shrimp paste',
    context: 'Hanoi specialty; pungent fermented shrimp paste is the signature',
    learnAfter: 3,
  },
  {
    name: 'bánh khọt',
    briefGloss: 'mini savory rice-flour pancakes',
    context: 'Vũng Tàu specialty; small crispy cups topped with shrimp',
    learnAfter: 3,
  },
  {
    name: 'nem chua',
    briefGloss: 'fermented pork roll',
    context: 'Cured/fermented pork with garlic and chili; eaten as snack',
    learnAfter: 3,
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface DishMatch {
  name: string;
  briefGloss: string;
  context: string;
}

function isLearned(
  dishName: string,
  counts: Record<string, number> | undefined,
  threshold: number
): boolean {
  if (!counts) return false;
  const seen = counts[dishName] || 0;
  return seen >= threshold;
}

export function detectDishNames(
  text: string,
  counts?: Record<string, number>
): DishMatch[] {
  const matches: DishMatch[] = [];
  for (const dish of DISH_NAMES) {
    const threshold = dish.learnAfter ?? DEFAULT_LEARN_AFTER;
    if (isLearned(dish.name, counts, threshold)) continue; // silent suppression

    // Multi-word dishes need flexible whitespace; single-word dishes use
    // VN-aware boundaries to avoid sub-word false positives.
    const tokens = dish.name.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const body = tokens.join('\\s+');
    const re = vnRe(body, 'i');
    if (re.test(text)) {
      matches.push({ name: dish.name, briefGloss: dish.briefGloss, context: dish.context });
    }
  }
  return matches;
}

// Build a focused prompt block. Tells the model to PRESERVE the dish name
// as-is in the translation and add the gloss in parentheses on first mention.
// Populates culturalWarnings with type='dish_name' so the frontend chip
// renders in the existing buildCulturalWarningsBlock.
export function buildDishNamesPrompt(matches: DishMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# DISH NAMES DETECTED IN SOURCE:'];
  lines.push('Vietnamese dish names are proper nouns. PRESERVE each in the translation as-is — do NOT replace with the English gloss. On first mention in this translation, add a brief gloss in parentheses (e.g., "phở (Vietnamese rice noodle soup)"). On subsequent mentions in the same message, use the dish name plain.');
  lines.push('');
  for (const m of matches) {
    lines.push(`- "${m.name}" — ${m.briefGloss}`);
    lines.push(`  Context: ${m.context}`);
    lines.push(`  In culturalWarnings: type="dish_name", term="${m.name}", literalMeaning="${m.briefGloss}".`);
    lines.push('');
  }
  return lines.join('\n');
}
