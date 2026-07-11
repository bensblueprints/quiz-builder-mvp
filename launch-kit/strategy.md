# Launch strategy — Quizcraft

## Target communities

- **r/marketing / r/DigitalMarketing** — "quiz funnels in 2026: what still works" value post; tool disclosed in comments. These subs ban bare drops but reward funnel math.
- **r/Emailmarketing** — the email-gate angle: "how I capture leads with quizzes without paying per response"; quiz-to-list case study.
- **r/selfhosted** — direct announcement; lead with JSON-only rendering / server-side scoring / SQLite. Mention unlimited responses as the anti-SaaS hook.
- **r/juststart / r/Affiliatemarketing** — quiz-as-presell pattern for affiliate sites; Quizcraft as the no-recurring-cost option.
- **Indie Hackers** — build log post: "why per-response pricing made me build my own quiz tool."

## Show HN draft

**Title:** Show HN: Quizcraft – self-hosted quiz builder (Typeform meters your responses)

Interactive quizzes are a solved UI problem wrapped in per-response pricing. Quizcraft is the engine self-hosted: Node/Express/better-sqlite3 + React, $0 marginal cost per response.

Design decisions HN may care about:

- Scoring and branching are server-side only. The public payload strips per-option points and result criteria, so you can't view-source the answers; the client asks POST /next for branch resolution.
- User-authored quiz content never touches server-rendered HTML — it's delivered as JSON and rendered as React text nodes, which makes stored XSS structurally impossible rather than filter-dependent. The embed script is fully static.
- CSV export neutralizes spreadsheet formula injection (leading =+-@ get a ' prefix) — an underrated hole in most "export your leads" features.
- Embeds are a ~2KB static loader: inline iframes with postMessage height auto-resize, plus a popup mode.

Smoke test asserts exact scores, branch jumps, the email gate, an inert XSS attempt, and the rate limiter. MIT licensed; the paid product is a packaged installer.

## SEO keywords

1. typeform alternative free
2. outgrow alternative
3. quiz maker for lead generation
4. interactive quiz builder self hosted
5. quiz funnel software one time purchase
6. branching quiz builder
7. personality quiz maker embed
8. lead magnet quiz tool
9. scoreapp alternative
10. quiz builder unlimited responses

## AppSumo / PitchGround pitch

Quizcraft gives marketers the highest-converting lead magnet format — the branching personality/score quiz — without the per-response meter that makes Typeform and Outgrow expensive exactly when a quiz succeeds. Builder with four question types, if/then branching, server-side scoring, "You're a [Result]" buckets, email-capture gates, drop-off analytics, CSV export, and one-tag embeds (inline + popup). Self-hosted: unlimited quizzes, unlimited responses, leads in the buyer's own database. LTD audiences are marketers who live on lead magnets — "unlimited responses forever" is the whole pitch. Strong margin at a $39–59 LTD tier with installer + updates.

## Pricing math

**$29 one-time.** Typeform Basic is $25/mo → pays for itself in **35 days**. Outgrow Freelancer at $14/mo: 2 months. A quiz capturing 1,000+ leads/mo would need Typeform's $83/mo tier — Quizcraft saves ~$970/yr at that volume.
