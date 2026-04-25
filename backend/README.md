# Voeli translation Worker

Cloudflare Worker that sits between the Voeli chat frontend and OpenAI. Holds the OpenAI API key server-side, gates every call behind Firebase Auth, and enforces per-user daily quotas so a runaway user can't burn the whole budget.

## What it does

| Endpoint | Purpose | Quota bucket |
|---|---|---|
| `POST /api/translate` | Full 4-option picker (replaces `callOpenAI` in the HTML) | `translate` |
| `POST /api/translate-quick` | Single fast translation (replaces `callOpenAIQuick`) | `translate` |
| `POST /api/translate-voice` | Voice note → picker JSON | `voice` |
| `POST /api/grammar` | Inline typo/grammar correction | `grammar` |
| `GET  /api/quota` | Read current usage for the signed-in user | none |
| `GET  /` | Health check | none |

Every `/api/*` route requires `Authorization: Bearer <firebase-id-token>`.

Default quotas (configurable in `wrangler.toml`):
- 100 translations / user / day
- 30 voice notes / user / day
- 300 grammar checks / user / day

Quotas reset at 00:00 UTC.

---

## First-time setup (one-off, ~30 min)

You'll need:
- Node.js 18+ installed
- A Cloudflare account (free)
- A Firebase project (we'll create one in Phase 3)
- An OpenAI account with an API key and a spending limit set

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser; sign in with your Cloudflare account and approve.

### 3. Create the KV namespace

KV is where we store the daily quota counters. We need one for production and one "preview" namespace for `wrangler dev`.

```bash
npx wrangler kv:namespace create QUOTA_KV
npx wrangler kv:namespace create QUOTA_KV --preview
```

Each command prints something like:
```
[[kv_namespaces]]
binding = "QUOTA_KV"
id = "abc123def456..."
```

Copy the `id` from the first command into `wrangler.toml` as `id`, and the `id` from the `--preview` command into `wrangler.toml` as `preview_id`. Replace the two `REPLACE_WITH_...` placeholders.

### 4. Set secrets

These are written to Cloudflare and never committed to the repo.

```bash
npx wrangler secret put OPENAI_API_KEY
# Paste your OpenAI key when prompted (sk-...)

npx wrangler secret put FIREBASE_PROJECT_ID
# Paste your Firebase project ID (e.g. voeli-prod)
```

For local dev, also create a `.dev.vars` file in this folder (already gitignored):

```
OPENAI_API_KEY=sk-...
FIREBASE_PROJECT_ID=voeli-dev
```

### 5. Edit `wrangler.toml` — `ALLOWED_ORIGINS`

Replace `https://voeli.app` with your actual production domain once you have it. Keep `http://localhost:8787` and `http://127.0.0.1:5500` for local development (the second is the default for VS Code's Live Server extension — handy for testing the frontend against your dev Worker).

---

## Running locally

```bash
npm run dev
```

Worker runs at `http://localhost:8787`. Test the health endpoint:

```bash
curl http://localhost:8787/
# {"ok":true,"service":"voeli-translate-worker"}
```

To test an authenticated endpoint, you'll need a Firebase ID token. Easiest path: open the frontend in dev mode, sign in, and grab the token from `localStorage` or a console log. (Phase 2 will add a small helper for this.)

## Deploying

```bash
npm run deploy
```

Wrangler bundles the TypeScript, uploads to Cloudflare, and prints the live URL — typically `https://voeli-translate-worker.<your-subdomain>.workers.dev`.

You can also bind a custom domain from the Cloudflare dashboard (e.g. `api.voeli.app`).

## Watching live logs

```bash
npm run tail
```

Streams all Worker logs in real time. Run this in a separate terminal whenever you're testing — any `console.error` from a failing request shows up here.

## Type-checking

```bash
npm run typecheck
```

CI-friendly. Fails if any TypeScript error exists.

---

## Architecture notes

- **No build step beyond `wrangler deploy`.** Wrangler bundles the TS, ships it to the edge, you're done.
- **Streaming:** `/api/translate` supports `stream: true` in the request body. We pass OpenAI's SSE stream straight back to the client, so the frontend's existing streaming JSON parser (`extractCompleteOptions`) works unchanged.
- **Slang dictionary stays in the client.** The frontend already does the slang detection, contact profile aggregation, and pattern-error tracking. It sends the resulting prompt extensions as a single `promptExtensions` string. The Worker never sees raw message history — only the aggregated tone metadata the client already produces. Good for privacy, good for keeping client logic where the auto-learning UI is.
- **Quota is "consume on entry."** Even if the OpenAI call fails, the user's bucket gets one tick. This stops a bad upstream from being a DoS amplifier. If a user complains they were charged for a failed call, we issue a manual KV refund — rare enough that it's not worth automating.
- **CORS allowlist is strict.** Add a domain to `ALLOWED_ORIGINS` in `wrangler.toml` before the Worker will respond to requests from it.
- **Firebase token verification is hand-rolled.** We use the `jose` library plus Web Crypto to verify the JWT signature. Google's public keys are cached in KV with the TTL the upstream advertises (~1 hour) so verification adds ~1ms to a hot request.

## What's NOT in here yet

- Cost monitoring / per-user spend logging (rely on OpenAI dashboard for now)
- Captcha on auth (sign-up bots are not a problem until we publicly launch)
- Stripe / paid tier (deliberately not building this for the beta)
- Refund logic for failed upstream calls

These are all Phase 5 items.
