// English food / cultural-food items for the EN→VI direction.
//
// Mirror of vietnamese-dish-names.ts. Items here are English-specific food
// concepts that don't translate cleanly to Vietnamese — bagel, pretzel,
// brunch, BBQ (American smoked-meat sense), happy hour, etc. The translation
// usually picks a "kind of similar" Vietnamese word that loses the cultural
// specificity (smoothie ≠ sinh tố — preparation-different; BBQ ≠ nướng —
// the smoked-meats tradition is specifically American).
//
// The right behavior is to PRESERVE the English term in the Vietnamese
// translation as a loanword, and add a brief gloss in parentheses on first
// mention only. After learnAfter exposures, the chip and prompt-block both
// stop firing — translation continues with the established loanword form.
//
// Per-user count tracking uses the same `dishCounts` localStorage as
// Vietnamese dish names (phở and bagel are independent counts in the same
// dict). Frontend reuses the existing chip rendering and "show again"
// affordance — zero new frontend code.
//
// Risk-1 mitigation (collisions on common-word literal senses): contextHint
// per entry directs the model to apply the food/cultural sense only in
// food/eating contexts.
//
// Risk-2 mitigation (already-common loanwords don't need many exposures):
// Tier 2 entries (smoothie, latte, etc.) at learnAfter:1 — gloss once, then
// silent.
//
// Risk-3 mitigation (bilingual users don't need chips): standard learn-once
// flow handles this naturally — they dismiss after their threshold.

export interface EnglishFoodItem {
  term: string;
  variants?: string[];
  briefGloss: string;
  context: string;
  learnAfter?: number;
}

const DEFAULT_LEARN_AFTER = 2;

export const ENGLISH_FOOD_ITEMS: EnglishFoodItem[] = [
  // ─── Tier 1: Iconic American/Western, no VN equivalent (threshold 2) ─────
  {
    term: 'bagel',
    variants: ['bagels'],
    briefGloss: 'bánh mì vòng (kiểu Mỹ/Do Thái) — bánh nướng có lỗ ở giữa, dai và đặc',
    context: 'Distinctively American/Jewish bread. No traditional VN equivalent. Apply food meaning whenever the word appears in eating/food context.',
    learnAfter: 2,
  },
  {
    term: 'pretzel',
    variants: ['pretzels'],
    briefGloss: 'bánh pretzel (kiểu Đức) — bánh nướng hình nút thắt, mặn',
    context: 'German-American baked snack with a distinctive knot shape. Foreign to traditional VN cuisine.',
    learnAfter: 2,
  },
  {
    term: 'brunch',
    briefGloss: 'bữa trưa muộn / bữa kết hợp sáng và trưa (kiểu phương Tây)',
    context: 'Western meal concept between breakfast and lunch (typically 10am-2pm). VN has no clean equivalent — "ăn nửa buổi" doesn\'t capture the social/restaurant culture aspect.',
    learnAfter: 2,
  },
  {
    term: 'BBQ',
    variants: ['barbecue', 'barbeque', 'bbq'],
    briefGloss: 'BBQ (kiểu Mỹ) — thịt nướng chậm với nước sốt đặc trưng, khác với "nướng" thông thường',
    context: 'Apply food meaning in eating/restaurant context. American BBQ specifically means slow-smoked meats with sauce — distinct from VN "nướng" (which is direct grilling). Don\'t confuse with brand names.',
    learnAfter: 2,
  },
  {
    term: 'happy hour',
    briefGloss: 'happy hour — giờ giảm giá đồ uống tại quán bar (thường 4-7pm)',
    context: 'Western bar/restaurant culture concept of discounted drinks during slow hours. No native VN concept; usually preserved as loanword.',
    learnAfter: 2,
  },

  // ─── Tier 2: Loanwords already in modern VN (threshold 1) ────────────────
  {
    term: 'smoothie',
    variants: ['smoothies'],
    briefGloss: 'smoothie — nước trái cây xay với sữa/sữa chua (khác với "sinh tố" vì sinh tố thường có sữa đặc và đá)',
    context: 'Different preparation from VN sinh tố. Smoothies typically use frozen fruit + milk/yogurt; sinh tố uses fresh fruit + condensed milk. Preserve "smoothie" as loanword to maintain the distinction.',
    learnAfter: 1,
  },
  {
    term: 'milkshake',
    variants: ['milkshakes'],
    briefGloss: 'milkshake — sữa pha với kem và hương vị, lắc/xay đặc',
    context: 'Western-style ice-cream-based drink. Distinct from VN drinks. Preserve as loanword.',
    learnAfter: 1,
  },
  {
    term: 'iced latte',
    variants: ['iced lattes', 'ice latte'],
    briefGloss: 'iced latte — espresso pha sữa lạnh với đá (khác với cà phê sữa đá truyền thống VN)',
    context: 'Western coffee-shop preparation: espresso shot + cold milk + ice. Different from VN cà phê sữa đá which uses dripped robusta + condensed milk.',
    learnAfter: 1,
  },
  {
    term: 'cold brew',
    variants: ['coldbrew'],
    briefGloss: 'cold brew — cà phê pha lạnh chậm trong 12-24 giờ, vị đậm và ít chua',
    context: 'Specific cold-coffee preparation method. Not the same as iced coffee (cà phê đá). Preserve as loanword to distinguish.',
    learnAfter: 1,
  },
  {
    term: 'frappuccino',
    variants: ['frappuccinos'],
    briefGloss: 'frappuccino — đồ uống cà phê đá xay (thương hiệu Starbucks)',
    context: 'Branded blended ice-coffee drink. Now a common loanword in VN urban coffee chat.',
    learnAfter: 1,
  },
  {
    term: 'burrito',
    variants: ['burritos'],
    briefGloss: 'burrito — món Mexico, bánh tortilla cuộn lớn với thịt, đậu, gạo, phô mai',
    context: 'Mexican wrap, distinct from VN gỏi cuốn. Preserve as loanword.',
    learnAfter: 1,
  },
  {
    term: 'taco',
    variants: ['tacos'],
    briefGloss: 'taco — món Mexico, bánh tortilla gấp đôi với nhân thịt và rau',
    context: 'Mexican folded tortilla. Preserve as loanword.',
    learnAfter: 1,
  },
  {
    term: 'pancake',
    variants: ['pancakes'],
    briefGloss: 'pancake — bánh kếp tròn dày kiểu Mỹ, ăn sáng với bơ và si-rô',
    context: 'American-style fluffy breakfast cake. VN bánh kếp is similar but typically thinner/larger. Preserve "pancake" for the American style.',
    learnAfter: 1,
  },

  // ─── Tier 3: Diet/food culture concepts (threshold 2) ────────────────────
  {
    term: 'vegan',
    variants: ['vegans'],
    briefGloss: 'vegan / thuần chay (không dùng sản phẩm động vật, kể cả sữa và trứng) — khác với "ăn chay" Phật giáo',
    context: 'Western lifestyle/ethics-based plant-based eating. Distinct from VN "ăn chay" (Buddhist vegetarianism, often allows eggs/dairy). The cultural framing differs significantly.',
    learnAfter: 2,
  },
  {
    term: 'takeout',
    variants: ['take-out', 'takeaway', 'take-away'],
    briefGloss: 'takeout / mua mang về (đồ ăn tại quán mua về nhà ăn)',
    context: 'Food/restaurant context only. Modern VN urban chat uses "mua mang về" or the loanword "takeout/takeaway". "Take out" with space can also mean physical removal — apply food meaning only when context is restaurants/food.',
    learnAfter: 2,
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface EnglishFoodMatch {
  term: string;
  matched: string;
  briefGloss: string;
  context: string;
}

function isLearned(
  term: string,
  counts: Record<string, number> | undefined,
  threshold: number
): boolean {
  if (!counts) return false;
  return (counts[term] || 0) >= threshold;
}

function buildPhraseRegex(phrase: string): RegExp {
  const tokens = phrase.split(/\s+/).map((t) =>
    t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  return new RegExp(`\\b${tokens.join('\\s+')}\\b`, 'i');
}

export function detectEnglishFoodItems(
  text: string,
  counts?: Record<string, number>
): EnglishFoodMatch[] {
  const matches: EnglishFoodMatch[] = [];

  for (const item of ENGLISH_FOOD_ITEMS) {
    const threshold = item.learnAfter ?? DEFAULT_LEARN_AFTER;
    if (isLearned(item.term, counts, threshold)) continue;

    const phrasesToTry = [item.term, ...(item.variants || [])];
    let foundForThisItem = false;

    for (const variant of phrasesToTry) {
      if (foundForThisItem) break;
      const re = buildPhraseRegex(variant);
      const m = text.match(re);
      if (m) {
        matches.push({
          term: item.term,
          matched: m[0],
          briefGloss: item.briefGloss,
          context: item.context,
        });
        foundForThisItem = true;
      }
    }
  }

  return matches;
}

// Build a focused prompt block. Tells the model to PRESERVE the English term
// as a loanword in the Vietnamese translation and add a brief gloss in
// parentheses on first mention. Reuses the `dish_name` cultural-warning type
// so the existing frontend chip rendering picks it up automatically.
export function buildEnglishFoodItemsPrompt(matches: EnglishFoodMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# ENGLISH FOOD/CULTURAL ITEMS DETECTED IN SOURCE:'];
  lines.push(
    'These items have no clean Vietnamese equivalent or are preparation-different from similar VN items. PRESERVE each in the translation as an English loanword — do NOT replace with a VN approximation that loses meaning. On first mention in this translation, add a brief Vietnamese gloss in parentheses (e.g., "smoothie (sinh tố kiểu Tây với sữa/sữa chua)"). On subsequent mentions, use the loanword plain.'
  );
  lines.push('');
  for (const m of matches) {
    lines.push(`- "${m.term}" — ${m.briefGloss}`);
    lines.push(`  Context: ${m.context}`);
    lines.push(`  In culturalWarnings: type="dish_name", term="${m.term}", literalMeaning="${m.briefGloss}".`);
    lines.push('');
  }
  return lines.join('\n');
}
