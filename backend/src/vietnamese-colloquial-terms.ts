// Vietnamese Colloquial Terms & Terms of Endearment Dictionary
// Covers both affectionate expressions and casual familiar particles
// Used to preserve emotional warmth when translating Vietnamese→English

import { vnRe, VN_LB, VN_RB } from './vn-regex';

interface VietnamColloquialTerm {
  pattern: RegExp;
  phrase: string;
  variants?: string[];
  vietnameseMeaning: string;
  englishMeaning: string;
  englishOptions: string[];
  emotionalTone: string;
  category: 'term_of_endearment' | 'intensified_endearment' | 'diminutive_endearment' | 'affectionate_address' | 'familiar_particle' | 'casual_agreement' | 'playful_shortened';
  confidence: number;
}

export const VIETNAMESE_COLLOQUIAL_TERMS: VietnamColloquialTerm[] = [
  // ═══════════════════════════════════════════════════════════════
  // AFFECTIONATE TERMS (Direct expressions of warmth/care)
  // ═══════════════════════════════════════════════════════════════

  {
    pattern: /\bcục\s+(vàng|dàng)/i,
    phrase: "cục vàng/dàng",
    variants: ["vàng", "dàng"],
    vietnameseMeaning: "my precious one, chunk of gold (playful)",
    englishMeaning: "sweetheart, darling, my precious",
    englishOptions: ["my sweetheart", "my precious one", "my darling", "my precious"],
    emotionalTone: "affectionate, playful, intimate",
    category: "term_of_endearment",
    confidence: 0.95
  },

  {
    pattern: /\bcực\s+(xinh|dễ\s+thương|yêu)/i,
    phrase: "cực xinh/dễ thương/yêu",
    vietnameseMeaning: "extremely cute/adorable/loving",
    englishMeaning: "so cute, super adorable, you're adorable",
    englishOptions: ["you're so cute", "you're super adorable", "you're adorable", "that's adorable"],
    emotionalTone: "affectionate, warm, admiring",
    category: "intensified_endearment",
    confidence: 0.92
  },

  {
    pattern: /\bbé\s+(\w+)/i,
    phrase: "bé [name/term]",
    vietnameseMeaning: "little [person/thing] - diminutive form",
    englishMeaning: "dear, cutie, little one, darling",
    englishOptions: ["cutie", "dear", "little one", "sweetheart"],
    emotionalTone: "affectionate, childlike, tender",
    category: "diminutive_endearment",
    confidence: 0.90
  },

  {
    pattern: /\banh\s+ơi\b/i,
    phrase: "anh ơi",
    vietnameseMeaning: "hey you (male, affectionate call)",
    englishMeaning: "hey, you, babe (calling out affectionately)",
    englishOptions: ["hey", "hey you", "babe"],
    emotionalTone: "affectionate, familiar, warm",
    category: "affectionate_address",
    confidence: 0.88
  },

  {
    pattern: /\bchị\s+ơi\b/i,
    phrase: "chị ơi",
    vietnameseMeaning: "hey you (female, affectionate call)",
    englishMeaning: "hey, you, babe (calling out affectionately)",
    englishOptions: ["hey", "hey you", "babe"],
    emotionalTone: "affectionate, familiar, warm",
    category: "affectionate_address",
    confidence: 0.88
  },

  {
    pattern: /\bem\s+ơi\b/i,
    phrase: "em ơi",
    vietnameseMeaning: "hey you (younger, affectionate call)",
    englishMeaning: "hey babe, hey you (calling out affectionately)",
    englishOptions: ["hey", "hey babe", "you there"],
    emotionalTone: "affectionate, protective, warm",
    category: "affectionate_address",
    confidence: 0.87
  },

  {
    pattern: /\bcười\s+(xinh|đẹp|dễ\s+thương)/i,
    phrase: "cười xinh/đẹp/dễ thương",
    vietnameseMeaning: "your smile is cute/beautiful/adorable",
    englishMeaning: "your smile is adorable, you have a cute smile",
    englishOptions: ["your smile is adorable", "you have such a cute smile", "your smile is so pretty"],
    emotionalTone: "affectionate, admiring, warm",
    category: "affectionate_address",
    confidence: 0.91
  },

  {
    pattern: /\banh\s+yêu\b|\bchị\s+yêu\b|\bem\s+yêu\b/i,
    phrase: "anh/chị/em yêu",
    vietnameseMeaning: "I love you (casual, within family/close relationships)",
    englishMeaning: "I love you, you're loved",
    englishOptions: ["I love you", "you're loved", "love you"],
    emotionalTone: "affectionate, caring, intimate",
    category: "term_of_endearment",
    confidence: 0.93
  },

  {
    pattern: /\bcái\s+(cute|xinh|đáng yêu|dễ thương)/i,
    phrase: "cái cute/xinh/đáng yêu",
    vietnameseMeaning: "that cute [thing/person]",
    englishMeaning: "how cute, so adorable",
    englishOptions: ["how cute", "so adorable", "that's adorable"],
    emotionalTone: "affectionate, playful",
    category: "diminutive_endearment",
    confidence: 0.89
  },

  {
    pattern: new RegExp(`${VN_LB}đó\\s+là\\s+(người yêu|lại|xinh|ngon|dễ thương|cute)`, 'iu'),
    phrase: "đó là [term of endearment]",
    vietnameseMeaning: "that's [my dear/sweet one]",
    englishMeaning: "that's my sweetheart, that's adorable",
    englishOptions: ["that's my sweetheart", "that's adorable", "that's so sweet"],
    emotionalTone: "affectionate, admiring",
    category: "term_of_endearment",
    confidence: 0.88
  },

  {
    pattern: /\bgái\s+(ngoan|xinh|dễ thương|đẹp)/i,
    phrase: "gái ngoan/xinh",
    vietnameseMeaning: "good girl, cute girl (affectionate)",
    englishMeaning: "good girl, you're adorable",
    englishOptions: ["good girl", "you're adorable", "such a good girl"],
    emotionalTone: "affectionate, praising, warm",
    category: "affectionate_address",
    confidence: 0.87
  },

  {
    pattern: /\btrai\s+(ngoan|ngầu|đẹp|trai)/i,
    phrase: "trai ngoan/ngầu",
    vietnameseMeaning: "good boy, cool boy (affectionate)",
    englishMeaning: "good boy, you're cool, handsome",
    englishOptions: ["good boy", "you're so cool", "handsome"],
    emotionalTone: "affectionate, admiring, warm",
    category: "affectionate_address",
    confidence: 0.87
  },

  {
    pattern: /\bxinh\s+quá\s+đi/i,
    phrase: "xinh quá đi",
    vietnameseMeaning: "you're so cute, stop being so cute",
    englishMeaning: "you're too cute, you're so adorable",
    englishOptions: ["you're so cute", "you're too adorable", "stop being so cute"],
    emotionalTone: "affectionate, playful, teasing",
    category: "intensified_endearment",
    confidence: 0.91
  },

  {
    pattern: /\bcực\s+đỉnh(\s+\w+)?/i,
    phrase: "cực đỉnh",
    vietnameseMeaning: "extremely good/excellent (in context of person)",
    englishMeaning: "you're amazing, you're incredible",
    englishOptions: ["you're amazing", "you're incredible", "that's excellent"],
    emotionalTone: "affectionate, praising, enthusiastic",
    category: "intensified_endearment",
    confidence: 0.86
  },

  {
    pattern: /\bxinh\s+lắm\b/i,
    phrase: "xinh lắm",
    vietnameseMeaning: "very cute/pretty",
    englishMeaning: "you're so pretty, you're very cute",
    englishOptions: ["you're so pretty", "you're very cute", "so beautiful"],
    emotionalTone: "affectionate, admiring",
    category: "intensified_endearment",
    confidence: 0.90
  },

  // ═══════════════════════════════════════════════════════════════
  // CASUAL FAMILIAR PARTICLES (Signals of closeness/informality)
  // ═══════════════════════════════════════════════════════════════

  {
    pattern: vnRe('ơi'),
    phrase: "ơi",
    vietnameseMeaning: "hey, call out particle (shows closeness)",
    englishMeaning: "hey, you",
    englishOptions: ["hey", "you", "calling out"],
    emotionalTone: "familiar, casual, warm",
    category: "familiar_particle",
    confidence: 0.84
  },

  {
    pattern: /\bnày\b/,
    phrase: "này",
    vietnameseMeaning: "this, here (casual familiarity marker)",
    englishMeaning: "this, hey (shows closeness)",
    englishOptions: ["this", "hey", "look"],
    emotionalTone: "familiar, casual",
    category: "familiar_particle",
    confidence: 0.82
  },

  {
    pattern: /\bkìa\b/,
    phrase: "kìa",
    vietnameseMeaning: "that, there (casual observation)",
    englishMeaning: "that, look, there",
    englishOptions: ["that", "look", "there"],
    emotionalTone: "casual, familiar, pointed",
    category: "familiar_particle",
    confidence: 0.81
  },

  {
    pattern: vnRe('đấy'),
    phrase: "đấy",
    vietnameseMeaning: "that's it, there (confirmation)",
    englishMeaning: "that's it, exactly, there",
    englishOptions: ["that's it", "exactly", "there"],
    emotionalTone: "casual, familiar, emphatic",
    category: "familiar_particle",
    confidence: 0.83
  },

  {
    pattern: vnRe('đó'),
    phrase: "đó",
    vietnameseMeaning: "that (pointing out casually)",
    englishMeaning: "that, see, look",
    englishOptions: ["that", "see", "look"],
    emotionalTone: "casual, familiar",
    category: "familiar_particle",
    confidence: 0.82
  },

  {
    pattern: vnRe('đây'),
    phrase: "đây",
    vietnameseMeaning: "this, here (pointing out)",
    englishMeaning: "this, here, look",
    englishOptions: ["this", "here", "look"],
    emotionalTone: "casual, familiar",
    category: "familiar_particle",
    confidence: 0.82
  },

  {
    pattern: vnRe('đốc'),
    phrase: "đốc",
    vietnameseMeaning: "right, exactly (affirmation)",
    englishMeaning: "exactly, right, yes",
    englishOptions: ["exactly", "right", "yes"],
    emotionalTone: "casual, emphatic",
    category: "familiar_particle",
    confidence: 0.80
  },

  {
    pattern: vnRe('đúng\\s+ko', 'i'),
    phrase: "đúng ko",
    vietnameseMeaning: "right, isn't it (question tag)",
    englishMeaning: "right, isn't it, isn't that true",
    englishOptions: ["right", "isn't it", "true"],
    emotionalTone: "casual, familiar, inclusive",
    category: "familiar_particle",
    confidence: 0.85
  },

  {
    pattern: vnRe('không\\s+phải\\s+à', 'i'),
    phrase: "không phải à",
    vietnameseMeaning: "isn't that so, right (seeking agreement)",
    englishMeaning: "isn't it, right, true",
    englishOptions: ["isn't it", "right", "don't you think"],
    emotionalTone: "casual, familiar, conversational",
    category: "familiar_particle",
    confidence: 0.83
  },

  {
    pattern: vnRe('đặc\\s+biệt\\s+là', 'i'),
    phrase: "đặc biệt là",
    vietnameseMeaning: "especially (casual emphasis)",
    englishMeaning: "especially, particularly",
    englishOptions: ["especially", "particularly"],
    emotionalTone: "casual, emphatic",
    category: "familiar_particle",
    confidence: 0.79
  },

  // ═══════════════════════════════════════════════════════════════
  // CASUAL AGREEMENT & AFFIRMATION (Friendly responses)
  // ═══════════════════════════════════════════════════════════════

  {
    pattern: vnRe('được\\s+rồi', 'i'),
    phrase: "được rồi",
    vietnameseMeaning: "okay, alright, fine (casual agreement)",
    englishMeaning: "okay, alright, sounds good",
    englishOptions: ["okay", "alright", "sounds good"],
    emotionalTone: "casual, friendly, agreeable",
    category: "casual_agreement",
    confidence: 0.88
  },

  {
    pattern: vnRe('được\\s+thôi', 'i'),
    phrase: "được thôi",
    vietnameseMeaning: "okay, that works (casual acceptance)",
    englishMeaning: "okay, that works, fine",
    englishOptions: ["okay", "that works", "fine"],
    emotionalTone: "casual, friendly",
    category: "casual_agreement",
    confidence: 0.87
  },

  {
    pattern: vnRe('ổn\\s+áp', 'i'),
    phrase: "ổn áp",
    vietnameseMeaning: "okay, all good (very casual, comfortable)",
    englishMeaning: "all good, no worries, sounds good",
    englishOptions: ["all good", "no worries", "sounds good"],
    emotionalTone: "casual, relaxed, friendly",
    category: "casual_agreement",
    confidence: 0.89
  },

  {
    pattern: /\bthoải\s+mái\b/i,
    phrase: "thoải mái",
    vietnameseMeaning: "comfortable, chill, whatever you want",
    englishMeaning: "whatever you want, I'm cool with it",
    englishOptions: ["whatever", "I'm cool with it", "your call"],
    emotionalTone: "casual, easygoing, friendly",
    category: "casual_agreement",
    confidence: 0.86
  },

  {
    pattern: vnRe('được\\s+chứ', 'i'),
    phrase: "được chứ",
    vietnameseMeaning: "of course, obviously (affirmative)",
    englishMeaning: "of course, obviously, sure",
    englishOptions: ["of course", "obviously", "sure"],
    emotionalTone: "casual, friendly, emphatic",
    category: "casual_agreement",
    confidence: 0.85
  },

  // ═══════════════════════════════════════════════════════════════
  // PLAYFUL SHORTENED FORMS (Internet/Gen Z slang variants)
  // ═══════════════════════════════════════════════════════════════

  {
    pattern: /\bk\b|\bko\b/i,
    phrase: "k / ko",
    variants: ["k", "ko"],
    vietnameseMeaning: "không (no, not) - shortened",
    englishMeaning: "no, not, nope",
    englishOptions: ["no", "not", "nope"],
    emotionalTone: "casual, playful, informal",
    category: "playful_shortened",
    confidence: 0.91
  },

  {
    pattern: /\br\b(?!\w)/,
    phrase: "r",
    vietnameseMeaning: "rồi (already, finished) - shortened",
    englishMeaning: "already, done, got it",
    englishOptions: ["already", "done", "got it"],
    emotionalTone: "casual, playful, informal",
    category: "playful_shortened",
    confidence: 0.90
  },

  {
    pattern: /\bvs\b/i,
    phrase: "vs",
    vietnameseMeaning: "với (with) - shortened",
    englishMeaning: "with, and",
    englishOptions: ["with", "and"],
    emotionalTone: "casual, playful, informal",
    category: "playful_shortened",
    confidence: 0.88
  },

  {
    pattern: new RegExp(`${VN_LB}j${VN_RB}|${VN_LB}gì\\s+zợ${VN_RB}`, 'iu'),
    phrase: "j / gì",
    variants: ["j", "gì"],
    vietnameseMeaning: "gì (what) - shortened to j",
    englishMeaning: "what",
    englishOptions: ["what", "huh"],
    emotionalTone: "casual, playful, informal",
    category: "playful_shortened",
    confidence: 0.89
  },

  {
    pattern: /\bh\b(?!\w)/,
    phrase: "h",
    vietnameseMeaning: "giờ (now, hour) - shortened",
    englishMeaning: "now, right now",
    englishOptions: ["now", "right now"],
    emotionalTone: "casual, playful, informal",
    category: "playful_shortened",
    confidence: 0.87
  },

  {
    pattern: /\bbh\b/i,
    phrase: "bh",
    vietnameseMeaning: "bây giờ (now) - shortened",
    englishMeaning: "right now, now",
    englishOptions: ["right now", "now"],
    emotionalTone: "casual, playful, informal",
    category: "playful_shortened",
    confidence: 0.88
  },

  {
    pattern: /\bz\b(?!\w)/,
    phrase: "z",
    vietnameseMeaning: "gì (what) - phonetic shortening",
    englishMeaning: "what",
    englishOptions: ["what", "huh"],
    emotionalTone: "casual, playful, very informal",
    category: "playful_shortened",
    confidence: 0.85
  },

  {
    pattern: /\bck\b/i,
    phrase: "ck",
    vietnameseMeaning: "chồng (husband) - shortened",
    englishMeaning: "hubby, my husband",
    englishOptions: ["hubby", "my husband"],
    emotionalTone: "casual, affectionate, informal",
    category: "playful_shortened",
    confidence: 0.86
  },

  {
    pattern: /\bvk\b/i,
    phrase: "vk",
    vietnameseMeaning: "vợ (wife) - shortened",
    englishMeaning: "wifey, my wife",
    englishOptions: ["wifey", "my wife"],
    emotionalTone: "casual, affectionate, informal",
    category: "playful_shortened",
    confidence: 0.86
  },

  // ═══════════════════════════════════════════════════════════════
  // ADDITIONAL AFFECTIONATE PATTERNS
  // ═══════════════════════════════════════════════════════════════

  {
    pattern: vnRe('yêu\\s+quá', 'i'),
    phrase: "yêu quá",
    vietnameseMeaning: "I love you so much, you're so lovable",
    englishMeaning: "I love you, you're so lovable",
    englishOptions: ["I love you", "you're so lovable", "love you so much"],
    emotionalTone: "affectionate, warm, intimate",
    category: "term_of_endearment",
    confidence: 0.92
  },

  {
    pattern: /\bchồng\s+(xinh|ngầu|yêu)/i,
    phrase: "chồng xinh/ngầu",
    vietnameseMeaning: "handsome husband, cool husband (playful)",
    englishMeaning: "my handsome husband, my cool guy",
    englishOptions: ["my handsome guy", "my cool husband", "you're so cool"],
    emotionalTone: "affectionate, playful, intimate",
    category: "term_of_endearment",
    confidence: 0.88
  },

  {
    pattern: /\bvợ\s+(xinh|đẹp|ngoan)/i,
    phrase: "vợ xinh/đẹp",
    vietnameseMeaning: "pretty wife, cute wife (playful)",
    englishMeaning: "my beautiful wife, my pretty one",
    englishOptions: ["my beautiful wife", "my pretty one", "you're so pretty"],
    emotionalTone: "affectionate, playful, intimate",
    category: "term_of_endearment",
    confidence: 0.88
  },

  {
    pattern: /\bx\b(?!\w)/,
    phrase: "x",
    vietnameseMeaning: "kiss (written x like in French/Vietnamese)",
    englishMeaning: "kiss, xo",
    englishOptions: ["kiss", "xo"],
    emotionalTone: "affectionate, playful, intimate",
    category: "term_of_endearment",
    confidence: 0.89
  }
];

export function detectColloquialTerms(text: string, language: 'vi' | 'en'): VietnamColloquialTerm[] {
  if (language !== 'vi') return [];

  return VIETNAMESE_COLLOQUIAL_TERMS.filter(term => term.pattern.test(text));
}

export function translateColloquialTerm(
  term: VietnamColloquialTerm,
  targetLanguage: 'en'
): string {
  if (targetLanguage !== 'en') return term.englishMeaning;
  return term.englishOptions[0];
}
