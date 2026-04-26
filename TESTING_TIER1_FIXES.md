# Testing Guide: Tier 1 Fixes

This guide walks through testing each of the four Tier 1 fixes with a real user scenario.

---

## Test Scenario: Linh ↔ Marcus (Romantic interest)

### Setup
1. Open Voeli in two browsers (or tabs):
   - Tab A: Sign in as Linh (marcus-test@example.com)
   - Tab B: Sign in as Marcus (linh-test@example.com)
2. Each user creates a contact for the other
3. Set relationship type to "Friend" (will become "Warm" tone over time)

---

## Test 1: Fix 1 — Relationship Presets Lock In After 5 Messages

### Steps
1. **Message 1 (Linh):** Type "hey you free this weekend?" → Picker fires
   - **Verify:** Picker shows 4 tone options (warm, direct, playful, curious)
   - Pick "warm"
   - Message sends

2. **Message 2 (Marcus replies):** Type "for you? always 😊" 
   - Picker fires
   - Pick "warm"

3. **Message 3 (Linh):** Type "haha you're so cheesy"
   - Picker fires
   - Pick "warm"

4. **Message 4 (Marcus):** Type "it's true though"
   - Picker fires
   - Pick "warm"

5. **Message 5 (Linh):** Type "ok we should definitely hang"
   - Picker fires
   - Pick "warm"

6. **Message 6 (Marcus):** Type "let's do it next saturday"
   - **VERIFY FIX 1:** ✅ Picker should NOT fire
   - Message sends instantly with "warm" tone (auto-sent)
   - Emotion label shows "Warm" on the bubble

7. **Message 7 (Linh):** Type "perfect i can't wait"
   - **VERIFY FIX 1:** ✅ Picker should NOT fire again
   - Auto-sends with "warm"

8. **Test override:** Hold Shift and type "ok but seriously tho don't flake"
   - Press Shift+Enter
   - **VERIFY FIX 1:** ✅ Picker fires despite learned tone
   - Pick "direct" or "playful" to override

### Expected Result
- Messages 1-5: Picker fires 5 times
- Messages 6+: Picker does NOT fire (uses learned "warm" tone)
- Shift+Enter forces picker even after learned tone is locked in
- Check browser console: `localStorage.getItem('pick_prefs')` should show `"learned": true` for this relationship

---

## Test 2: Fix 2 — Sender Sees Preview

### Steps
1. **As Linh, type:** "lowkey really interested in you"
   - **VERIFY FIX 2:** Picker shows 4 cards
   - Look below each tone option card
   - **Each card should have a gray section showing:**
     - "They'll see: [back-translation]"
   - Example for "warm" tone:
     - "They'll see: I'm quietly really into you"
   - Example for "direct" tone:
     - "They'll see: I'm genuinely interested in you"

2. **Hover/tap different tone options**
   - **VERIFY FIX 2:** The "They'll see:" preview updates for each tone
   - Watch how "warm" softens vs "direct" emphasizes vs "playful" lightens

3. **Pick one and send**
   - Message sends with that tone
   - Marcus receives it and sees the tone you picked

4. **Marcus replies:** "me too actually 😊"
   - Picker fires
   - **VERIFY FIX 2:** Below each tone option, see the back-translation
   - This teaches Marcus: "oh, 'warm' makes it sound closer vs 'formal' makes it sound distant"

### Expected Result
- Every tone card shows "They'll see: [back-translation]"
- Preview changes when you hover/tap different options
- Helps both sender and receiver understand tone differences

---

## Test 3: Fix 3 — Learning Dashboard

### Steps
1. **Have Linh and Marcus exchange 10+ messages** containing slang:
   - Linh: "that's fire 🔥"
   - Marcus: "no cap you look amazing"
   - Linh: "lowkey obsessed with you lol"
   - Marcus: "that's sus you're too nice"

2. **Let the Learn Chips appear and dismiss them** (or auto-promote)
   - Learn Chip should show: "fire = excellent/amazing. Gen Z."
   - Dismiss or ignore

3. **Click "📚 Dictionary" tab in sidebar**
   - **VERIFY FIX 3:** Left panel switches from contact list to dictionary
   - Should show stats:
     ```
     You've learned 4 phrases
     Most learned from: Marcus
     ```

4. **Scroll through the dictionary grid**
   - **VERIFY FIX 3:** See cards like:
     ```
     "no cap"
     EN: honestly / I'm not lying
     VN: không nói dối, thật sự
     Learned: 4/26/2026
     ```

5. **Search for "fire"**
   - Type "fire" in the search box
   - **VERIFY FIX 3:** Grid filters to show only "fire" card
   - Shows definition and date learned

6. **Click "Marcus" tab**
   - **VERIFY FIX 3:** ✅ Filters to show only phrases learned from Marcus
   - Count shows "Learned 3 phrases from Marcus"

7. **Click "All" to go back**
   - Shows all phrases again

8. **Click back to contact list**
   - Click "All" tab at top (sidebar goes back to normal)
   - Contact list reappears

### Expected Result
- Dictionary tab toggles properly
- Stats show correct counts
- Search filters in real-time
- Per-contact filtering works
- Each phrase shows EN/VI definitions and learn date
- Dashboard makes learning progress visible

---

## Test 4: Fix 4 — Grammar Optional

### Steps
1. **Type with typos:** "ur amazing tbh"
   - **VERIFY FIX 4 (ON):** Gray chip appears below composer: "your"
   - Click the chip to auto-correct or ignore it

2. **Open Settings (⚙️ icon)**
   - Scroll to "Show grammar suggestions"
   - Toggle OFF

3. **Type with typos again:** "im so happy rn"
   - **VERIFY FIX 4 (OFF):** No grammar chip appears
   - Message sends with typos as-typed

4. **Toggle back ON in Settings**
   - Type again: "ur so nice"
   - **VERIFY FIX 4 (ON):** Grammar chip reappears
   - Toggle works correctly

### Expected Result
- Grammar suggestions toggle in Settings
- When ON: typo chips appear
- When OFF: cleaner composer, no chips
- Toggle persists across session refreshes

---

## Verification Checklist

### Fix 1: Relationship Presets
- [ ] Picker fires for messages 1-5
- [ ] Picker does NOT fire for message 6+
- [ ] Shift+Enter forces picker override
- [ ] localStorage `pick_prefs` shows `"learned": true`
- [ ] Works for different relationship types (friend, elder, partner)

### Fix 2: Sender Preview
- [ ] Every tone card shows "They'll see:" section
- [ ] Preview shows back-translation (1 line, gray text)
- [ ] Preview updates when you tap different options
- [ ] Works in EN→VI direction
- [ ] Works in VI→EN direction

### Fix 3: Learning Dashboard
- [ ] Dictionary tab appears in sidebar (📚)
- [ ] Tab toggle switches between contacts and dictionary
- [ ] Stats show "You've learned X phrases"
- [ ] Each phrase card shows EN/VI definitions
- [ ] Learn date displays correctly
- [ ] Search filters phrases in real-time
- [ ] Contact tabs filter by person (optional)
- [ ] Dictionary data persists after refresh

### Fix 4: Grammar Optional
- [ ] Settings toggle: "Show grammar suggestions"
- [ ] When ON: grammar chips appear for typos
- [ ] When OFF: no grammar chips
- [ ] Toggle persists across sessions

---

## Common Issues & Debug

### Fix 1: Picker still shows on message 6
- **Cause:** Contact doesn't have 5 messages yet
- **Fix:** Ensure you've sent 5+ messages to same contact in same tone
- **Debug:** Check `localStorage.getItem('learned_dictionary')` and `pick_prefs`

### Fix 2: No "They'll see" preview
- **Cause:** backTranslation field missing from API response
- **Fix:** Check that tone picker is firing (not Quick Mode)
- **Debug:** Open DevTools → check network request to `/api/translate`

### Fix 3: Dictionary empty
- **Cause:** No learned phrases yet
- **Fix:** Send messages with slang (~80+ terms detected); dismiss Learn Chips
- **Debug:** Check `localStorage.getItem('learned_dictionary')`

### Fix 4: Grammar toggle missing
- **Cause:** Settings not loaded
- **Fix:** Open Settings panel; scroll down to "Show grammar suggestions"
- **Debug:** Check DevTools console for errors

---

## Performance Notes

- **Fix 1:** No performance impact (uses existing localStorage)
- **Fix 2:** +3-5KB per tone card (preview text); minimal impact
- **Fix 3:** Dictionary rendering ~50ms for 100 phrases (acceptable)
- **Fix 4:** No change; grammar already optional

---

## Rollback Plan

If any fix causes issues:

1. **Git rollback:** `git reset --hard HEAD~1`
2. **Individual fix:** Comment out specific function calls:
   - Fix 1: Comment out lines 5949-5957 (shouldAutoSendWithLearnedTone check)
   - Fix 2: Comment out line 6088 (preview HTML)
   - Fix 3: Comment out lines 4035-4046 (setTab dictionary logic)
   - Fix 4: No changes to rollback (uses existing toggle)

---

## Questions?

Refer to `TIER1_IMPLEMENTATION_SUMMARY.md` for architecture details.
