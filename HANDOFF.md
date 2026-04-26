# Voeli — what got built today

**Quick update on what's now in place and how to work with it.**

## TL;DR

The single-file demo you originally built is now a real production app. **Live at [voeli.app](https://voeli.app)**, with auth, per-user quotas, error tracking, security, and legal docs. It auto-deploys whenever we push to `main`. Code is on GitHub at **[github.com/Voelinc/Voeli](https://github.com/Voelinc/Voeli)**.

You have the same accounts I do (we share Voelinc, Cloudflare, Firebase, OpenAI, Sentry), so once you `git clone` you have full access — no invitations needed.

---

## New architecture

```
[Browser] ─sign in via Firebase─→ [Voeli frontend at voeli.app]
                                         │
                                         │ POST /api/translate
                                         │ (Firebase ID token)
                                         ▼
                              [Cloudflare Worker proxy]
                                         │
                                         │ verifies token, checks quota,
                                         │ holds the OpenAI key server-side
                                         ▼
                                     [OpenAI]
```

**Frontend** lives in `frontend/index.html` (still a single file — preserved your structure). Hosted on Cloudflare Pages, auto-deploys on every push to `main`.

**Backend Worker** lives in `backend/` (TypeScript, ~400 lines). Cloudflare Worker that holds the OpenAI key, verifies Firebase auth tokens, enforces per-user daily quotas via Cloudflare KV. Endpoints: `/api/translate`, `/api/translate-quick`, `/api/translate-voice`, `/api/grammar`, `/api/quota`. Deployed via `npx wrangler deploy` from `backend/`.

The slang dictionary, Cultural Bridge cards, contact tone profiles, auto-learning — **all of that is unchanged** from your original. The Worker is just a transport-layer addition; the smart logic still lives in the frontend.

---

## What got built, in order

### Phase 1 — Cloudflare Worker proxy
Built the backend that sits between the frontend and OpenAI. The OpenAI key never leaves Cloudflare's servers anymore. Per-user daily quotas: 100 translations / 30 voice notes / 300 grammar checks. Quota counters live in Cloudflare KV, reset at 00:00 UTC. Firebase ID tokens are verified using the `jose` library against Google's public keys (cached in KV).

### Phase 2 — Frontend rework
Removed the "paste your OpenAI API key" screen. Replaced with Firebase Auth (email/password + Google sign-in). Every `callOpenAI` and `callOpenAIQuick` now goes through the Worker with the user's Firebase ID token in the Authorization header. The user-supplied Firebase config UI on the live-session screen is gone — we use one shared production Firebase project (`voeli-prod`).

### Phase 3 — Firebase database security rules
The Realtime Database was in test mode (anyone signed in could read any room). Now locked down with rules in `firebase-rules/database.rules.json`: only people in a room's `participants` list can read or write that room's messages and typing indicators. Frontend `connectFirebase()` writes the user's UID to participants on join. All Firebase paths now use `currentUser.uid` instead of the random `deviceId`.

### Phase 4 — Production deployment
Initialized git repo, pushed to GitHub. Set up Cloudflare Pages connected to the repo (auto-deploys on every push to `main`). Bought and pointed the `voeli.app` domain (registered through Cloudflare so DNS was automatic). Worker CORS allowlist updated for production domains.

### Phase 5a — Sentry error tracking
Two Sentry projects: `voeli-frontend` and `voeli-worker`. Frontend uses the browser CDN bundle, gated to only fire on the `voeli.app` hostname (no noise from local dev). Worker uses `@sentry/cloudflare` with `withSentry` wrap. Both filter expected user-facing states (auth failures, quota hits) so the dashboard only shows real bugs. User identity is tagged on auth state change — you'll see *which user* hit any given error.

### Phase 5b — Cost monitoring
OpenAI hard limit at $50/month, soft alert at $25 (50%). The Worker's per-user daily quotas are the real backstop — even if a bot signs up and tries to abuse, the per-user cap means no single account can burn through more than ~$0.75/day.

### Phase 5c — Privacy policy + Terms of Service
Added at `voeli.app/privacy.html` and `voeli.app/terms.html`. Honest plain-language docs reflecting what the app actually does (e.g., "we don't store the content of your messages"). Linked from the sign-in screen footer. Sensible defaults — not lawyer-reviewed, fine for beta.

### Phase 5d — Cloudflare Turnstile captcha
Added to the **Create Account** form only (sign-in stays unprotected — too much friction for returning users). Uses the public site key in client code; the secret key is in Will's password manager (will be needed for server-side verification later if abuse becomes real). Defense-in-depth check in the submit handler refuses to call Firebase signup without a token.

---

## Bug fix you should know about

**Cultural bridge cards never appeared in real conversations.** Root cause: incoming messages from Firebase (and BroadcastChannel for Local Test mode) were being pushed to `c.msgs` without an `id` field. The bridge renderer anchors on `m.id === bridgeTriggerMsgId`, so the card silently failed to render whenever the trigger was an incoming message. Fixed by assigning `snap.key` to incoming Firebase messages and a generated id to BroadcastChannel ones.

**Side benefit:** other features that anchor on `m.id` (context menu, replies, "show original" toggle) now also work on incoming messages — they were probably just-as-broken before, just less noticed because Solo mode is the most-tested path.

The fix is in `frontend/index.html`, the two listeners in `startFirebaseListeners` and the BroadcastChannel `onmessage` handler.

---

## How to work on it

### First-time setup on your machine

```bash
git clone https://github.com/Voelinc/Voeli.git
cd Voeli/backend
npm install
npx wrangler login        # opens browser, sign in with our Cloudflare account
```

For local Worker development, create your own OpenAI API key under our shared OpenAI org (don't reuse Will's), and put it in `backend/.dev.vars`:
```
OPENAI_API_KEY=sk-your-key-here
FIREBASE_PROJECT_ID=voeli-prod
```

Then `npm run dev` from `backend/` runs the Worker locally on port 8787.

For frontend dev, just open `frontend/index.html` via any local HTTP server (Live Server in VS Code, `python -m http.server`, etc.). It talks to the live Worker by default.

### Daily flow

```bash
# Start of session — pull anything I pushed while you were asleep
git pull

# ...edit files...

# When done
git add .
git commit -m "what you changed"
git push                     # auto-deploys frontend in ~30s
```

For Worker changes, also run `npx wrangler deploy` from `backend/`. Frontend auto-deploys; Worker deploys are explicit.

### Branch workflow when we want to be careful

```bash
git checkout -b your-feature-name
# ...edit, commit...
git push -u origin your-feature-name
# Open a PR on GitHub, the other person reviews + merges
```

For straightforward stuff just push to `main`. Use branches when the change is risky or you want a review.

---

## What's still not done

Things we deferred but worth knowing about:

- **Server-side Turnstile verification.** Right now Turnstile is client-side only. A motivated bot can bypass it. The per-user quota + spending cap is the real backstop. If signup abuse becomes real, we'd add Firebase App Check or route signup through the Worker.
- **Firebase database location.** Currently in `us-central1`. Vietnam users see ~200ms extra latency on Live Session messages. Tolerable for beta. If you find it laggy, we can migrate or add a second region.
- **No CI tests.** TypeScript catches some issues but there are no automated tests. Worth adding once the surface area stabilizes.
- **No Worker rate limiting at the IP level.** Per-user daily quotas exist but a single attacker creating many accounts could collectively spend more. Captcha + spending cap are the only defenses.

---

## Account access

Since we share all accounts, you have full admin everywhere:

| Service | What's there |
|---|---|
| **GitHub** | github.com/Voelinc/Voeli — push directly to main, auto-deploys |
| **Cloudflare** | Pages project `voeli`, Worker `voeli-translate-worker`, KV namespace, DNS for voeli.app |
| **Firebase** | Project `voeli-prod` — Auth (Email + Google), Realtime Database (locked-down rules), Authorized Domains for voeli.app |
| **OpenAI** | Translation credit, hard limit $50/mo, soft alert $25 |
| **Sentry** | Two projects: `voeli-frontend`, `voeli-worker` — check Issues if anything seems broken |

---

## Reading order if you want to dive in

1. `README.md` (top-level) — quick orientation
2. `backend/README.md` — Worker setup details
3. `backend/src/index.ts` — Worker entry point + routing
4. `backend/src/openai.ts` — system prompts and OpenAI calls (server-side prompt structure)
5. `frontend/index.html` — line ~5773 onward is where `callOpenAI` was rewritten to use the Worker; everything else is mostly your original code

The original mega-prompt for the picker mode is now in `backend/src/openai.ts` (`buildPickerSystemPrompt`). Same content, just on the server. The slang notes, contact profile, conversation pattern, etc. still get built client-side and shipped as `promptExtensions`.

Welcome aboard the production version. Ping me on whatever channel works for you when you're set up and I'll do a Live Session test with you to make sure the bridge card actually pops.
