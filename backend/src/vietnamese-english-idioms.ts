// Bidirectional idiom dictionary.
//
// English and Vietnamese both have idioms whose literal translations are
// nonsense or misleading. The frontend already has a large slang/idiom
// pattern array in index.html for high-frequency Gen-Z / casual idioms; this
// module is a backend supplement covering classical and conversational
// idioms that aren't in those frontend patterns.
//
// SCOPE: This is a SEED dictionary — ~30 entries. It's not comprehensive.
// Grow it from real usage as the app rolls out.
//
// Mitigations baked in:
//   - Each entry carries a `contextHint` that tells the model when the
//     idiomatic reading applies vs. the literal one (Risk 1: false positive
//     in unintended contexts). Regex alone can't disambiguate context;
//     the prompt makes the model decide.
//   - Phrase-level matching uses strict word boundaries — `\b` for English
//     idioms, VN-aware lookbehind/lookahead for Vietnamese (Risk 2:
//     over-firing on partial matches like "knockout" matching "knocked out").
//   - Output is the existing `culturalWarnings` schema with `type: 'idiom'`,
//     so the frontend's buildWordplayBlock renders it at the top of the
//     picker without any frontend changes.

import { VN_LB, VN_RB } from './vn-regex';

export interface Idiom {
  phrase: string;
  direction: 'en' | 'vi';
  literalMeaning: string;
  idiomaticMeaning: string;
  suggestedRendering: string;
  // When the idiomatic reading applies. The model uses this to decide
  // whether to interpret the phrase idiomatically or literally.
  contextHint: string;
  // Optional inflection variants. English phrasal verbs in chat appear in
  // base, past, progressive, and 3rd-person forms. Listing the past-tense
  // form (and progressive when distinctive) here lets detection fire across
  // tenses without metadata duplication. e.g. "break up" → ["broke up",
  // "broken up", "breaking up", "breaks up"].
  aliases?: string[];
}

export const IDIOMS: Idiom[] = [
  // ─── English idioms (EN→VI) ──────────────────────────────────────────────
  {
    phrase: 'knocked out',
    direction: 'en',
    literalMeaning: 'physically struck unconscious',
    idiomaticMeaning: 'fell asleep deeply / completely exhausted',
    suggestedRendering: 'ngủ thiếp đi / mệt lả',
    contextHint: 'Apply idiomatic reading in casual chat about sleep, fatigue, or recovery. Use literal in fight/sports contexts.',
  },
  {
    phrase: 'kill it',
    direction: 'en',
    literalMeaning: 'to murder something',
    idiomaticMeaning: 'to perform exceptionally well at something',
    suggestedRendering: 'làm rất tốt / xuất sắc',
    contextHint: 'Apply idiomatic in performance/work contexts. Use literal only when "it" refers to an actual living thing.',
  },
  {
    phrase: 'hit me up',
    direction: 'en',
    literalMeaning: 'physically strike me upward',
    idiomaticMeaning: 'contact me / message me',
    suggestedRendering: 'liên hệ với mình / nhắn tin cho mình',
    contextHint: 'Almost always idiomatic in modern usage.',
  },
  {
    phrase: 'pull through',
    direction: 'en',
    literalMeaning: 'to physically pull something across',
    idiomaticMeaning: 'to survive a difficult situation / recover',
    suggestedRendering: 'vượt qua / hồi phục',
    contextHint: 'Apply idiomatic when discussing illness, hardship, or recovery.',
  },
  {
    phrase: 'break a leg',
    direction: 'en',
    literalMeaning: 'fracture a leg',
    idiomaticMeaning: 'good luck (theatrical / performance origin)',
    suggestedRendering: 'chúc may mắn',
    contextHint: 'Almost always idiomatic — said before someone performs, presents, or attempts something.',
  },
  {
    phrase: 'under the weather',
    direction: 'en',
    literalMeaning: 'positioned beneath weather',
    idiomaticMeaning: 'feeling unwell / mildly sick',
    suggestedRendering: 'không khỏe / hơi mệt',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'piece of cake',
    direction: 'en',
    literalMeaning: 'a slice of cake',
    idiomaticMeaning: 'something very easy',
    suggestedRendering: 'dễ như ăn kẹo / dễ ợt',
    contextHint: 'Apply idiomatic when describing a task, problem, or challenge. Use literal in food contexts.',
  },
  {
    phrase: 'cost an arm and a leg',
    direction: 'en',
    literalMeaning: 'price requires donating limbs',
    idiomaticMeaning: 'extremely expensive',
    suggestedRendering: 'đắt cắt cổ / mắc kinh khủng',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'let the cat out of the bag',
    direction: 'en',
    literalMeaning: 'release a feline from a sack',
    idiomaticMeaning: 'reveal a secret accidentally',
    suggestedRendering: 'lỡ miệng tiết lộ bí mật',
    contextHint: 'Always idiomatic in modern usage.',
  },
  {
    phrase: 'bite the bullet',
    direction: 'en',
    literalMeaning: 'chew on ammunition',
    idiomaticMeaning: 'force yourself to do something unpleasant',
    suggestedRendering: 'nghiến răng làm / cắn răng chịu',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'the ball is in your court',
    direction: 'en',
    literalMeaning: 'a sphere is in your tennis court',
    idiomaticMeaning: 'it is your turn to act / decide',
    suggestedRendering: 'đến lượt bạn quyết định / quyền quyết định ở bạn',
    contextHint: 'Almost always idiomatic outside of literal sports contexts.',
  },
  {
    phrase: 'hit the road',
    direction: 'en',
    literalMeaning: 'physically strike a road',
    idiomaticMeaning: 'leave / depart / start a journey',
    suggestedRendering: 'lên đường / đi thôi',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'burn the midnight oil',
    direction: 'en',
    literalMeaning: 'set late-night oil on fire',
    idiomaticMeaning: 'stay up very late working or studying',
    suggestedRendering: 'thức đêm làm việc / cày đêm',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'in hot water',
    direction: 'en',
    literalMeaning: 'submerged in heated water',
    idiomaticMeaning: 'in trouble',
    suggestedRendering: 'gặp rắc rối / dính chuyện',
    contextHint: 'Apply idiomatic when discussing consequences, mistakes, or trouble. Use literal in cooking/bathing contexts.',
  },
  {
    phrase: 'bury the hatchet',
    direction: 'en',
    literalMeaning: 'inter an axe',
    idiomaticMeaning: 'make peace / end a conflict',
    suggestedRendering: 'làm hòa / xóa bỏ hiềm khích',
    contextHint: 'Always idiomatic.',
  },

  // ─── Phrasal verbs (EN→VI) ───────────────────────────────────────────────
  // Verb + particle constructions whose meaning is non-compositional.
  // Multi-sense entries list each sense in idiomaticMeaning + suggestedRendering
  // with the contextHint enumerating which sense fits which surrounding context.
  // Risk-1 mitigation (over-firing on literal usage): every entry's contextHint
  // explicitly tells the model when to apply idiomatic vs literal reading.

  // Social / relationship
  {
    phrase: 'hang out',
    direction: 'en',
    literalMeaning: 'be suspended from something',
    idiomaticMeaning: 'spend casual time together / socialize',
    suggestedRendering: 'đi chơi / hẹn hò (casual)',
    contextHint: 'Always idiomatic in chat — describes casual social plans, not physical hanging.',
    aliases: ['hung out', 'hanging out', 'hangs out'],
  },
  {
    phrase: 'catch up',
    direction: 'en',
    literalMeaning: 'physically reach someone ahead',
    idiomaticMeaning: 'reunite/talk after time apart, or sync on info',
    suggestedRendering: 'gặp lại nhau (social) / cập nhật tình hình (info sync)',
    contextHint: 'Apply social meaning when proposing to meet after absence ("let\'s catch up over coffee"). Apply info-sync meaning for status updates ("catch me up on what happened").',
    aliases: ['caught up', 'catching up', 'catches up'],
  },
  {
    phrase: 'get along',
    direction: 'en',
    literalMeaning: 'progress somehow',
    idiomaticMeaning: 'have a friendly relationship with someone',
    suggestedRendering: 'hợp nhau / hòa thuận',
    contextHint: 'Idiomatic when discussing relationships between people.',
    aliases: ['got along', 'getting along', 'gets along'],
  },
  {
    phrase: 'break up',
    direction: 'en',
    literalMeaning: 'physically break into pieces',
    idiomaticMeaning: 'end a romantic relationship',
    suggestedRendering: 'chia tay',
    contextHint: 'Idiomatic when subject is a couple or relationship. Use literal "vỡ thành mảnh" only for physical breaking.',
    aliases: ['broke up', 'broken up', 'breaking up', 'breaks up'],
  },
  {
    phrase: 'make up',
    direction: 'en',
    literalMeaning: 'physically construct',
    idiomaticMeaning: '1) reconcile after a fight; 2) invent/fabricate a story; 3) apply cosmetics',
    suggestedRendering: 'làm hòa (reconcile) / bịa ra (invent) / trang điểm (cosmetics)',
    contextHint: '1) "make up after a fight" → làm hòa. 2) "make up a story" → bịa ra. 3) "make up your face" → trang điểm. Pick by surrounding noun.',
    aliases: ['made up', 'making up', 'makes up'],
  },
  {
    phrase: 'drop by',
    direction: 'en',
    literalMeaning: 'drop something while walking',
    idiomaticMeaning: 'visit briefly',
    suggestedRendering: 'ghé qua / tạt qua',
    contextHint: 'Always idiomatic when followed by a place or person.',
    aliases: ['dropped by', 'dropping by', 'drops by'],
  },
  {
    phrase: 'stop by',
    direction: 'en',
    literalMeaning: 'stop walking near',
    idiomaticMeaning: 'visit briefly',
    suggestedRendering: 'ghé qua / tạt qua',
    contextHint: 'Always idiomatic when followed by a place or person.',
    aliases: ['stopped by', 'stopping by', 'stops by'],
  },
  {
    phrase: 'show up',
    direction: 'en',
    literalMeaning: 'physically appear',
    idiomaticMeaning: 'arrive at an event / be present',
    suggestedRendering: 'xuất hiện / có mặt',
    contextHint: 'Idiomatic when discussing attendance or arrival at events.',
    aliases: ['showed up', 'showing up', 'shows up', 'shown up'],
  },

  // Emotion / state
  {
    phrase: 'give up',
    direction: 'en',
    literalMeaning: 'surrender something to someone',
    idiomaticMeaning: 'stop trying / abandon hope',
    suggestedRendering: 'bỏ cuộc / từ bỏ',
    contextHint: 'Idiomatic when subject is in the middle of a difficult task and quitting.',
    aliases: ['gave up', 'given up', 'giving up', 'gives up'],
  },
  {
    phrase: 'pass out',
    direction: 'en',
    literalMeaning: 'distribute things to people',
    idiomaticMeaning: 'faint / become unconscious (often from exhaustion or alcohol)',
    suggestedRendering: 'ngất xỉu / mê man',
    contextHint: 'Idiomatic when describing fatigue, illness, or alcohol. Literal "pass out the flyers" is rare in chat.',
    aliases: ['passed out', 'passing out', 'passes out'],
  },
  {
    phrase: 'throw up',
    direction: 'en',
    literalMeaning: 'throw something upward',
    idiomaticMeaning: 'vomit',
    suggestedRendering: 'nôn / ói',
    contextHint: 'Almost always idiomatic in chat. Literal use is rare.',
    aliases: ['threw up', 'thrown up', 'throwing up', 'throws up'],
  },
  {
    phrase: 'wake up',
    direction: 'en',
    literalMeaning: 'cease sleeping',
    idiomaticMeaning: 'cease sleeping (literal); also "realize/become aware" figuratively',
    suggestedRendering: 'thức dậy (literal) / tỉnh ngộ (figurative — wake up to reality)',
    contextHint: 'Literal in most chat about sleep. Use tỉnh ngộ for "wake up and see X" figurative sense.',
    aliases: ['woke up', 'woken up', 'waking up', 'wakes up'],
  },
  {
    phrase: 'cheer up',
    direction: 'en',
    literalMeaning: 'physically lift someone',
    idiomaticMeaning: 'feel/become happier; encourage someone to feel happier',
    suggestedRendering: 'vui lên / phấn chấn lên',
    contextHint: 'Always idiomatic.',
    aliases: ['cheered up', 'cheering up', 'cheers up'],
  },
  {
    phrase: 'calm down',
    direction: 'en',
    literalMeaning: 'physically settle down',
    idiomaticMeaning: 'become less agitated / take it easy',
    suggestedRendering: 'bình tĩnh lại',
    contextHint: 'Always idiomatic in conversational context.',
    aliases: ['calmed down', 'calming down', 'calms down'],
  },
  {
    phrase: 'freak out',
    direction: 'en',
    literalMeaning: 'no literal reading',
    idiomaticMeaning: 'become very upset, scared, or excited',
    suggestedRendering: 'hoảng loạn / lo lắng quá / mất bình tĩnh',
    contextHint: 'Always idiomatic. Modern casual usage.',
    aliases: ['freaked out', 'freaking out', 'freaks out'],
  },
  {
    phrase: 'chill out',
    direction: 'en',
    literalMeaning: 'become physically cold',
    idiomaticMeaning: 'relax / take it easy',
    suggestedRendering: 'thư giãn / chill (modern loanword)',
    contextHint: 'Always idiomatic in modern chat.',
    aliases: ['chilled out', 'chilling out', 'chills out'],
  },

  // Action / process
  {
    phrase: 'figure out',
    direction: 'en',
    literalMeaning: 'form a figure',
    idiomaticMeaning: 'solve / understand / determine',
    suggestedRendering: 'tìm ra / nghĩ ra / hiểu ra',
    contextHint: 'Always idiomatic.',
    aliases: ['figured out', 'figuring out', 'figures out'],
  },
  {
    phrase: 'find out',
    direction: 'en',
    literalMeaning: 'locate outside',
    idiomaticMeaning: 'discover / learn about',
    suggestedRendering: 'phát hiện ra / biết được / tìm hiểu',
    contextHint: 'Always idiomatic.',
    aliases: ['found out', 'finding out', 'finds out'],
  },
  {
    phrase: 'put off',
    direction: 'en',
    literalMeaning: 'place something away',
    idiomaticMeaning: '1) postpone; 2) repel / make unhappy',
    suggestedRendering: 'hoãn lại (postpone) / chán/khó chịu (repel)',
    contextHint: '1) "put off the meeting" → hoãn lại. 2) "his behavior put me off" → chán/khó chịu/làm khó chịu.',
    aliases: ['putting off', 'puts off'],
  },
  {
    phrase: 'get over',
    direction: 'en',
    literalMeaning: 'physically pass over',
    idiomaticMeaning: 'recover from emotional or physical setback',
    suggestedRendering: 'vượt qua / quên đi (relationship sense)',
    contextHint: 'Idiomatic in chat about emotions, illness, or breakups. "get over a cold" → khỏi/hồi phục. "get over an ex" → quên đi.',
    aliases: ['got over', 'gotten over', 'getting over', 'gets over'],
  },
  {
    phrase: 'keep up',
    direction: 'en',
    literalMeaning: 'hold something high',
    idiomaticMeaning: 'maintain pace / stay current with',
    suggestedRendering: 'theo kịp / cập nhật',
    contextHint: 'Idiomatic when following or pacing with something.',
    aliases: ['kept up', 'keeping up', 'keeps up'],
  },
  {
    phrase: 'let down',
    direction: 'en',
    literalMeaning: 'physically lower',
    idiomaticMeaning: 'disappoint / fail to meet expectations',
    suggestedRendering: 'làm thất vọng / phụ lòng',
    contextHint: 'Idiomatic when subject is a person or expectation. "let down a rope" is literal — different sense.',
    aliases: ['letting down', 'lets down'],
  },
  {
    phrase: 'shut up',
    direction: 'en',
    literalMeaning: 'physically close up',
    idiomaticMeaning: '1) stop talking (rude command); 2) "no way!" (modern playful disbelief)',
    suggestedRendering: 'im đi / câm miệng (rude) / không thể tin được / thôi đi (playful)',
    contextHint: '1) Imperative with target → rude command (im đi). 2) Standalone "shut up!" with disbelief tone → playful (thôi đi / không thể tin được). Decide by tone and emoji context.',
    aliases: ['shutting up', 'shuts up'],
  },
  {
    phrase: 'hold up',
    direction: 'en',
    literalMeaning: 'hold something high',
    idiomaticMeaning: '1) wait briefly; 2) delay / slow down progress',
    suggestedRendering: 'chờ chút (wait) / làm chậm trễ (delay)',
    contextHint: '1) "hold up!" alone or "hold up a sec" → chờ chút. 2) "the traffic is holding us up" → làm chậm trễ.',
    aliases: ['held up', 'holding up', 'holds up'],
  },
  {
    phrase: 'end up',
    direction: 'en',
    literalMeaning: 'physical orientation',
    idiomaticMeaning: 'finally arrive at a state, place, or situation',
    suggestedRendering: 'cuối cùng + verb / kết cục là',
    contextHint: 'Always idiomatic in chat narratives.',
    aliases: ['ended up', 'ending up', 'ends up'],
  },

  // Multi-sense (the important ones)
  {
    phrase: 'pick up',
    direction: 'en',
    literalMeaning: 'physically lift',
    idiomaticMeaning: '1) fetch a person/thing; 2) learn something; 3) acquire/buy; 4) answer phone',
    suggestedRendering: 'đón (fetch) / học được (learn) / mua (buy) / nghe máy (phone)',
    contextHint: '1) "pick up the kids/her at the airport" → đón. 2) "pick up Spanish/a habit" → học được. 3) "pick up some milk/dinner" → mua. 4) "pick up the phone" → nghe máy. Pick by surrounding noun.',
    aliases: ['picked up', 'picking up', 'picks up'],
  },
  {
    phrase: 'drop off',
    direction: 'en',
    literalMeaning: 'drop something downward',
    idiomaticMeaning: '1) leave a person/thing at a place; 2) decline gradually',
    suggestedRendering: 'thả/đưa đến (leave at place) / giảm dần (decline)',
    contextHint: '1) "drop off the kids/package" → thả/đưa đến. 2) "sales dropped off" → giảm dần. Most chat usage is the first sense.',
    aliases: ['dropped off', 'dropping off', 'drops off'],
  },
  {
    phrase: 'take off',
    direction: 'en',
    literalMeaning: 'remove (clothing) or aircraft departure',
    idiomaticMeaning: '1) leave hurriedly; 2) become successful suddenly; 3) remove clothing; 4) plane departure',
    suggestedRendering: 'đi mất (leave) / cất cánh (plane) / cởi (clothing) / thành công (success)',
    contextHint: '1) Person leaving → đi mất. 2) Plane → cất cánh. 3) Clothing → cởi. 4) "her career took off" → thành công.',
    aliases: ['took off', 'taken off', 'taking off', 'takes off'],
  },
  {
    phrase: 'work out',
    direction: 'en',
    literalMeaning: 'physically work outside',
    idiomaticMeaning: '1) exercise at gym; 2) figure out a solution; 3) succeed / turn out well',
    suggestedRendering: 'tập thể dục (exercise) / giải quyết (solve) / mọi việc sẽ ổn (turn out well)',
    contextHint: '1) Gym/fitness → tập thể dục/tập gym. 2) Problem-solving → giải quyết. 3) "things will work out" → mọi việc sẽ ổn.',
    aliases: ['worked out', 'working out', 'works out'],
  },
  {
    phrase: 'run into',
    direction: 'en',
    literalMeaning: 'physically collide with',
    idiomaticMeaning: 'encounter unexpectedly',
    suggestedRendering: 'gặp tình cờ / bắt gặp',
    contextHint: 'Idiomatic when "into" is followed by a person, group, or unexpected thing.',
    aliases: ['ran into', 'running into', 'runs into'],
  },
  {
    phrase: 'stand up',
    direction: 'en',
    literalMeaning: 'rise to standing position',
    idiomaticMeaning: '1) cancel a date / fail to show up to a planned meet; 2) defend (stand up for/against)',
    suggestedRendering: 'đứng dậy (literal) / cho leo cây (slang: stand someone up on a date) / đứng lên bảo vệ (defend)',
    contextHint: '1) "He stood me up" → cho leo cây / không đến hẹn. 2) "stand up for her" → bênh vực. 3) Most physical use is literal.',
    aliases: ['stood up', 'standing up', 'stands up'],
  },

  // Common helpers
  {
    phrase: 'back up',
    direction: 'en',
    literalMeaning: 'move backward',
    idiomaticMeaning: '1) support / vouch for; 2) duplicate (data, files)',
    suggestedRendering: 'ủng hộ/hỗ trợ (support) / sao lưu (duplicate data)',
    contextHint: '1) "back me up" → ủng hộ. 2) "back up the file" → sao lưu.',
    aliases: ['backed up', 'backing up', 'backs up'],
  },
  {
    phrase: 'bring up',
    direction: 'en',
    literalMeaning: 'bring something upward',
    idiomaticMeaning: 'mention in conversation / raise as a topic',
    suggestedRendering: 'nhắc đến / đề cập',
    contextHint: 'Idiomatic when followed by a topic, name, or subject.',
    aliases: ['brought up', 'bringing up', 'brings up'],
  },
  {
    phrase: 'carry on',
    direction: 'en',
    literalMeaning: 'carry on top of',
    idiomaticMeaning: 'continue / persist with what you were doing',
    suggestedRendering: 'tiếp tục / cứ thế',
    contextHint: 'Always idiomatic.',
    aliases: ['carried on', 'carrying on', 'carries on'],
  },
  {
    phrase: 'count on',
    direction: 'en',
    literalMeaning: 'no literal reading',
    idiomaticMeaning: 'rely on / depend on',
    suggestedRendering: 'tin vào / dựa vào / trông cậy vào',
    contextHint: 'Always idiomatic.',
    aliases: ['counted on', 'counting on', 'counts on'],
  },
  {
    phrase: 'come across',
    direction: 'en',
    literalMeaning: 'physically traverse',
    idiomaticMeaning: '1) encounter unexpectedly; 2) appear/seem (impression)',
    suggestedRendering: 'bắt gặp (encounter) / có vẻ (seem)',
    contextHint: '1) "I came across an article" → bắt gặp. 2) "He comes across as rude" → có vẻ.',
    aliases: ['came across', 'coming across', 'comes across'],
  },
  {
    phrase: 'set up',
    direction: 'en',
    literalMeaning: 'place upright',
    idiomaticMeaning: '1) arrange / establish / prepare; 2) deceive (frame someone)',
    suggestedRendering: 'sắp xếp / chuẩn bị (arrange) / dàn dựng / gài bẫy (deceive)',
    contextHint: '1) Plans/events/equipment → sắp xếp/chuẩn bị. 2) "set me up" with negative tone → dàn dựng/gài bẫy.',
    aliases: ['setting up', 'sets up'],
  },

  // ─── Vietnamese idioms (VI→EN) ───────────────────────────────────────────
  {
    phrase: 'ăn cháo đá bát',
    direction: 'vi',
    literalMeaning: 'eat porridge, kick the bowl',
    idiomaticMeaning: 'bite the hand that feeds you / be ungrateful to a benefactor',
    suggestedRendering: 'biting the hand that feeds you',
    contextHint: 'Always idiomatic — describes ungratefulness toward someone who helped you.',
  },
  {
    phrase: 'vắt chanh bỏ vỏ',
    direction: 'vi',
    literalMeaning: 'squeeze the lemon, throw away the peel',
    idiomaticMeaning: 'use someone fully, then discard them',
    suggestedRendering: 'using and discarding someone',
    contextHint: 'Always idiomatic — describes exploitative relationships.',
  },
  {
    phrase: 'ếch ngồi đáy giếng',
    direction: 'vi',
    literalMeaning: 'a frog at the bottom of a well',
    idiomaticMeaning: 'someone with a narrow worldview / limited perspective',
    suggestedRendering: 'someone with a narrow worldview',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'cá lớn nuốt cá bé',
    direction: 'vi',
    literalMeaning: 'big fish eats small fish',
    idiomaticMeaning: 'survival of the fittest / power dynamics where the strong consume the weak',
    suggestedRendering: 'survival of the fittest',
    contextHint: 'Always idiomatic — describes social/economic competition.',
  },
  {
    phrase: 'ngồi mát ăn bát vàng',
    direction: 'vi',
    literalMeaning: 'sit in the cool, eat from a gold bowl',
    idiomaticMeaning: 'enjoy an easy life of luxury without effort',
    suggestedRendering: 'living the easy life / having it made',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'nước đến chân mới nhảy',
    direction: 'vi',
    literalMeaning: 'only jumps when water reaches the feet',
    idiomaticMeaning: 'wait until the last minute to act',
    suggestedRendering: 'waiting until the last minute',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'có công mài sắt có ngày nên kim',
    direction: 'vi',
    literalMeaning: 'with effort grinding iron there will be a day it becomes a needle',
    idiomaticMeaning: 'persistence pays off / hard work yields results over time',
    suggestedRendering: 'persistence pays off',
    contextHint: 'Always idiomatic — encouragement for sustained effort.',
  },
  {
    phrase: 'đi một ngày đàng học một sàng khôn',
    direction: 'vi',
    literalMeaning: 'walk a day\'s road, learn a basket of wisdom',
    idiomaticMeaning: 'travel and new experiences teach you',
    suggestedRendering: 'travel broadens the mind',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'được voi đòi tiên',
    direction: 'vi',
    literalMeaning: 'got an elephant, demands a fairy',
    idiomaticMeaning: 'never satisfied / always wanting more',
    suggestedRendering: 'never satisfied / always wanting more',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'bán mặt cho đất bán lưng cho trời',
    direction: 'vi',
    literalMeaning: 'sell face to earth, sell back to sky',
    idiomaticMeaning: 'work backbreaking labor (especially farming)',
    suggestedRendering: 'doing backbreaking work',
    contextHint: 'Always idiomatic — describes hard manual labor.',
  },
  {
    phrase: 'gần mực thì đen gần đèn thì rạng',
    direction: 'vi',
    literalMeaning: 'near ink turns black, near light turns bright',
    idiomaticMeaning: 'you become like the company you keep',
    suggestedRendering: 'you become like the company you keep',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'nuôi ong tay áo',
    direction: 'vi',
    literalMeaning: 'raising a bee in your sleeve',
    idiomaticMeaning: 'harboring an enemy / nurturing a future betrayer',
    suggestedRendering: 'harboring a snake in your bosom',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'chó cắn áo rách',
    direction: 'vi',
    literalMeaning: 'a dog bites a torn shirt',
    idiomaticMeaning: 'when it rains it pours / misfortune piles on the unfortunate',
    suggestedRendering: 'when it rains it pours',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'tránh vỏ dưa gặp vỏ dừa',
    direction: 'vi',
    literalMeaning: 'avoiding a melon rind, hitting a coconut shell',
    idiomaticMeaning: 'out of the frying pan, into the fire',
    suggestedRendering: 'out of the frying pan, into the fire',
    contextHint: 'Always idiomatic.',
  },
  {
    phrase: 'đứng núi này trông núi nọ',
    direction: 'vi',
    literalMeaning: 'standing on this mountain, looking at that mountain',
    idiomaticMeaning: 'never satisfied / grass-is-greener thinking',
    suggestedRendering: 'the grass is always greener on the other side',
    contextHint: 'Always idiomatic.',
  },
];

// ─── Detection ────────────────────────────────────────────────────────────

export interface IdiomMatch {
  phrase: string;
  direction: 'en' | 'vi';
  literalMeaning: string;
  idiomaticMeaning: string;
  suggestedRendering: string;
  contextHint: string;
}

// Build a strict-boundary regex for the phrase. Spaces in the phrase become
// `\s+` (allow varied whitespace). For English, use `\b`. For Vietnamese,
// use the unicode-aware boundaries from vn-regex.
function buildPhraseRegex(phrase: string, direction: 'en' | 'vi'): RegExp {
  const tokens = phrase.split(/\s+/).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const body = tokens.join('\\s+');
  if (direction === 'en') {
    return new RegExp(`\\b${body}\\b`, 'i');
  }
  return new RegExp(`${VN_LB}${body}${VN_RB}`, 'iu');
}

export function detectIdioms(text: string, direction: 'en-vi' | 'vi-en'): IdiomMatch[] {
  const sourceLang: 'en' | 'vi' = direction === 'en-vi' ? 'en' : 'vi';
  const matches: IdiomMatch[] = [];

  for (const idiom of IDIOMS) {
    if (idiom.direction !== sourceLang) continue;
    // Try the canonical phrase first, then any aliases (inflections).
    const phrasesToTry = [idiom.phrase, ...(idiom.aliases || [])];
    let matched = false;
    for (const candidate of phrasesToTry) {
      const re = buildPhraseRegex(candidate, idiom.direction);
      if (re.test(text)) {
        matched = true;
        break;
      }
    }
    if (matched) {
      matches.push({
        phrase: idiom.phrase,
        direction: idiom.direction,
        literalMeaning: idiom.literalMeaning,
        idiomaticMeaning: idiom.idiomaticMeaning,
        suggestedRendering: idiom.suggestedRendering,
        contextHint: idiom.contextHint,
      });
    }
  }

  return matches;
}

// Build a focused prompt block. Lists each idiom with its literal vs.
// idiomatic readings, the contextHint that helps the model pick, and an
// instruction to populate culturalWarnings with type='idiom'.
export function buildIdiomPrompt(matches: IdiomMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['', '# IDIOMS DETECTED IN SOURCE:'];
  lines.push('Each idiom below has a literal reading and an idiomatic reading. Use the contextHint to decide which applies to THIS message. If idiomatic, render with the suggested form (or your own equivalent) AND populate culturalWarnings with type="idiom" so the user sees the original phrase.');
  lines.push('');
  for (const m of matches) {
    lines.push(`- "${m.phrase}"`);
    lines.push(`  Literal: ${m.literalMeaning}`);
    lines.push(`  Idiomatic: ${m.idiomaticMeaning}`);
    lines.push(`  Suggested rendering: ${m.suggestedRendering}`);
    lines.push(`  When to apply idiomatic: ${m.contextHint}`);
    lines.push('');
  }
  return lines.join('\n');
}
