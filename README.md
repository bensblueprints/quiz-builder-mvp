# 🧩 Quizcraft

**Interactive quizzes with branching, scoring & lead capture. Pay once — never per response.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Quizcraft is a self-hosted quiz and interactive-form builder. Build one-question-per-screen quizzes with conditional branching, point scoring, and "You're a [Result]!" buckets. Gate results behind an email capture, embed anywhere with one script tag, and watch responses, drop-off funnels, and captured leads roll into your own dashboard — exportable as CSV.

Typeform charges **$25+/mo** and meters your responses. Outgrow starts at **$14/mo** and scales up fast with volume. Quizcraft is **$29 once**, with unlimited quizzes and unlimited responses, because it runs on your server.

![screenshot](docs/screenshot.png)

## Features

- 🧱 **Builder** — multiple choice, image choice, rating, and text questions in a one-question-per-screen flow. Reorder freely.
- 🔀 **Conditional branching** — "if answer = X, jump to question Y" rules (equals / ≥ / ≤), resolved server-side so logic can't be tampered with.
- 🏆 **Scoring & result buckets** — per-option points, score-range results ("0–9: Collaborator, 10+: Lone Wolf") or answer-mapped results (most-picked bucket wins). Points and criteria never reach the browser — scoring is 100% server-side.
- 📧 **Lead-gen gate** — optionally require an email before revealing the result. The classic quiz-as-lead-magnet pattern, without the per-lead pricing.
- 📊 **Analytics** — views, submissions, completion rate, per-question drop-off funnel, per-option breakdowns, result distribution, emails captured. **CSV export** with spreadsheet formula-injection protection.
- 🔗 **Three embed modes** — full-page link, inline `<iframe>` via one script tag, or a popup trigger. Auto-resizing iframe via postMessage.
- 🎨 **Themes** — accent color + progress bar style per quiz.
- 🛡️ **XSS-safe by construction** — quiz content is delivered as JSON and rendered as React text nodes; the server never injects user-authored content into HTML, and the embed script is fully static.

## Quick start

```bash
npm i
npm run build
cp .env.example .env   # set ADMIN_PASSWORD
npm start              # → http://localhost:5365
```

**Run it as a desktop app, or deploy to a $5 VPS when you need it public:**

```bash
npm run desktop        # Electron window, auto-logged-in
# or
docker compose up -d   # VPS mode, SQLite persisted in a volume
```

Embed on any site:

```html
<div data-quizcraft="YOUR_QUIZ_ID"></div>
<script src="https://your-host/embed.js" async></script>
```

## Quizcraft vs Typeform / Outgrow

| | **Quizcraft** | **Typeform** | **Outgrow** |
|---|---|---|---|
| Price | **$29 once** | $25–83/mo | $14–95/mo |
| Responses | unlimited | 100–10k/mo metered | metered |
| Branching logic | ✅ | ✅ | ✅ |
| Scoring + result buckets | ✅ | limited | ✅ |
| Email capture gate | ✅ | ✅ | ✅ |
| Embed + popup | ✅ | ✅ | ✅ |
| Your leads stay yours | ✅ SQLite on your box | their cloud | their cloud |
| Remove branding | ✅ it's your code | paid tiers | paid tiers |

*A lead-gen quiz that captures 500 emails/month costs $83+/mo on Typeform's tier ladder. Quizcraft: $29, once.*

## ☕ Skip the setup — get the 1-click installer

Grab the packaged Windows installer on Whop: **https://whop.com/onetime-suite**

## Tech stack

Node 20 + Express + better-sqlite3 · React 18 + Vite + Tailwind 4 + Framer Motion + Lucide · postMessage iframe embeds · Electron desktop wrapper · Docker

## Tests

```bash
npm test   # boots the real server; asserts exact scores, branching, email gate,
           # CSV formula-injection guard, XSS-inert content & rate limiting
```

## License

MIT © 2026 Ben (bensblueprints)
