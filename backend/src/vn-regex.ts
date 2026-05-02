// Unicode-aware word boundaries for Vietnamese (and any non-ASCII text).
//
// JavaScript's `\b` only treats `[A-Za-z0-9_]` as word characters. Every
// Vietnamese diacritic (đ, ơ, ạ, ấ, ệ, ử, ò, …) is `\W` to the engine, so
// `/\bđang\b/.test('tôi đang ăn')` returns FALSE. The leading `\b` requires
// the position before `đ` to be a `\w → \W` transition, but ` ` and `đ` are
// both `\W`, so no boundary is matched.
//
// `VN_LB` and `VN_RB` are zero-width assertions (lookbehind / lookahead) that
// treat any Unicode letter — including Vietnamese diacritics — as a word
// character. They are true drop-in replacements for `\b` and do not consume
// characters, so capture groups, .replace(), and .exec() all behave the same
// as with `\b`.
//
// Usage:
//   import { vnRe } from './vn-regex';
//   const RE = vnRe('đang', 'i');           // matches "đang" with VN-aware boundaries
//   const ALT = vnRe('(đã|rồi)', 'i');      // alternation — boundaries apply to whole group
//
// The /u flag is automatically added so `\p{L}` is interpreted.

export const VN_LB = '(?<![\\p{L}])';
export const VN_RB = '(?![\\p{L}])';

export function vnRe(source: string, flags = ''): RegExp {
  const u = flags.includes('u') ? flags : flags + 'u';
  return new RegExp(`${VN_LB}${source}${VN_RB}`, u);
}
