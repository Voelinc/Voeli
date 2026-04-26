# Voeli Tier 1 Complete — What's Next

## What You Just Got

All 4 Tier 1 fixes are now live in the codebase:

1. ✅ **Relationship presets lock in after 5 messages** — picker fatigue solved
2. ✅ **Sender sees what receiver gets** — doubled learning value  
3. ✅ **Learning dashboard** — progress is visible + motivating
4. ✅ **Grammar checking optional** — cleaner composer (was already implemented)

These changes transform Voeli from "translator tool" to "native chat app that teaches."

---

## Immediate Next Steps

### 1. Test with Real Users (This Week)
- Have Linh & Marcus, Hằng & Jenny, Tâm & David use the app for 10+ messages
- Follow `TESTING_TIER1_FIXES.md` to verify all features work
- Measure: Does the picker feel less intrusive? Do users feel like they're learning?

### 2. Monitor for Edge Cases (This Week)
- What happens if user changes relationship type mid-conversation?
- Does the learned tone carry over to new devices? (It shouldn't yet — Tier 2 fix)
- Do the 4 tones show correctly for all language pairs?

### 3. Gather User Feedback (Week 2)
- "Did the tone preview help you understand the difference?"
- "Did the dictionary make you feel like you were learning?"
- "Did the auto-send feel right, or did you want the picker back?"

---

## Tier 2 (Next Sprint)

If Tier 1 testing goes well, prioritize these in order:

### Tier 2a: Accessibility (1-2 days)
- Large font mode for older users (Tâm, Hằng)
- Dark mode toggle
- Read-aloud for Learn Chips
- Bigger tap targets on mobile

**Why:** Your core users (elders) will abandon the app if they can't read it.

### Tier 2b: Code-Switching Support (1 day)
- Handle mixed EN/VI messages: "ok mẹ no cap i'll ngủ sớm"
- Detect dominant language per phrase segment
- Translate only non-dominant language parts

**Why:** Vietnamese-Americans code-switch constantly. Without this, the app feels broken.

### Tier 2c: Server-Side Learning Sync (2-3 days)
- Store learned dictionary in Firestore (not localStorage)
- Sync across all devices/browsers
- Make learning permanent (survives app reinstall)

**Why:** Currently learning is lost on device switch or app reinstall. That breaks the "learn once" promise.

### Tier 2d: Feedback Loop (1 day)
- After message is read, ask "did the tone land right? 👍😐👎"
- Store feedback to improve recommendations per relationship
- Train the picker to get smarter with each user

**Why:** Without feedback, the picker is guessing. With it, it learns and improves.

### Tier 2e: Mobile Picker Redesign (1-2 days)
- Reduce picker from 4 cards to 2 on mobile
- Cleaner stacking for small screens
- Swipe-to-compare tones

**Why:** Picker on mobile 6" screens is claustrophobic. Users quit.

---

## Tier 3 (Polish & Growth)

Once users are confident the core works:

### Tier 3a: Onboarding Demo (½ day)
- First launch: simulated conversation showing picker magic
- "See how tone changes how the message lands?"
- Gets users to the aha moment in 60 seconds instead of 5+ messages

### Tier 3b: Shareable Learning Moments (½ day)
- "Marcus just learned 'no cap' = 'không nói dối'" → share to friends
- Screenshot moment with watermark "Made with Voeli"
- Viral loop: friends want the app

### Tier 3c: Make Live Session the Hero (½ day)
- Currently buried in "more" menu
- Make it the default: "Start a Live Chat with [name]" prominent button
- Reframe from "translator" to "real chat app for bilingual people"

---

## Success Metrics

After Tier 1 + Tier 2a (accessibility):

- **User retention:** 30-day active users > 50% of signups
- **Engagement:** Average 15+ messages per contact per session
- **Learning:** Users report learning 10+ phrases in first week
- **NPS:** New users rate >7/10 ("would you recommend Voeli?")

---

## Git Workflow

All Tier 1 fixes are on branch `fix/dm-listener-cleanup`. When ready to ship:

```bash
git checkout main
git merge fix/dm-listener-cleanup
git push origin main
```

This deploys to production. Sentry will track any errors; monitor closely for first 24h.

---

## One More Thing

The hardest part of Voeli is NOT the technology. It's adoption.

**Why would someone switch from WhatsApp to Voeli?**

Right now:
- ❌ Slower (picker friction)
- ❌ Doesn't feel like a real chat app (feels like translator)
- ❌ Learning isn't visible (why bother?)

After Tier 1:
- ✅ Faster (auto-send after 5 messages)
- ✅ Feels like WhatsApp with a superpower
- ✅ Learning is visible (📚 dashboard)

After Tier 2a (accessibility):
- ✅ Elders can actually use it
- ✅ Parents teaching kids = biggest channel

**Your real competition isn't WhatsApp. It's the family's default behavior.**

You win by making Voeli SO obviously better that it becomes the family chat app, not the translator app.

---

## Questions?

- Code questions → see `TIER1_IMPLEMENTATION_SUMMARY.md`
- Testing questions → see `TESTING_TIER1_FIXES.md`
- Architecture questions → grep the codebase; it's well-commented

Good luck! 🚀
