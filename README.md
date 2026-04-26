# Voeli

Tone-aware English ↔ Vietnamese chat translator. Each translation is offered as multiple emotion-tagged options so you can pick how the message *lands* — not just what the words mean.

Live at [voeli.app](https://voeli.app).

## Repo layout

```
.
├── backend/          # Cloudflare Worker that proxies OpenAI calls,
│                       gated by Firebase Auth + per-user daily quotas
│                       (see backend/README.md for setup)
├── frontend/         # Single-page HTML chat UI
│   └── index.html      Plain HTML/CSS/JS, no build step
└── .claude/          # Local dev tooling (preview server config)
```

## Local development

The frontend is plain HTML — open `frontend/index.html` over HTTP (Live Server, `python -m http.server`, etc.) and it talks to the deployed Worker at `voeli-translate-worker.voeli.workers.dev`.

For Worker development, see [`backend/README.md`](backend/README.md).

## Architecture

- **Frontend:** static HTML, hosted on Cloudflare Pages
- **Auth:** Firebase Authentication (email/password + Google)
- **Translation backend:** Cloudflare Worker → OpenAI (`gpt-4o-mini` for text, `gpt-4o-audio-preview` for voice)
- **Realtime sync:** Firebase Realtime Database (Live Session mode only)
- **Quotas:** Cloudflare KV per-user daily counters

The frontend never sees the OpenAI key — the Worker holds it server-side and verifies a Firebase ID token on every request.
<!-- test edit from second account -->
