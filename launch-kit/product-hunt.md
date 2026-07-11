# Product Hunt — Quizcraft

**Name:** Quizcraft

**Tagline (60 chars):** Lead-gen quizzes with branching & scoring — $29, not $25/mo

**Description (260 chars):**
Quizcraft is a self-hosted quiz builder: one-question-per-screen flows, conditional branching, server-side scoring, "You're a [Result]!" buckets, email-capture gates, embeds & popups, drop-off analytics, CSV export. Unlimited responses. Pay once, own it.

**Full description:**
The quiz-as-lead-magnet pattern works — that's why Typeform meters your responses and Outgrow's pricing climbs with volume. You're renting a branching form.

Quizcraft is that engine, self-hosted:

- Build one-question-per-screen quizzes: multiple choice, image choice, ratings, free text.
- Branching rules ("if answer = X, jump to Y") resolved server-side.
- Point scoring per option + result buckets — score ranges or answer-mapped ("mostly B's → You're a Banana"). Points and result criteria never ship to the browser.
- Optional email gate before the result screen. Captured leads live in your SQLite database, exportable as CSV (with formula-injection protection, because we've all opened that CSV).
- Analytics: views → submissions funnel, per-question drop-off, per-option breakdowns, result distribution.
- Embed anywhere: full-page link, auto-resizing inline iframe, or popup — one static script tag.

Security posture worth noting: quiz content renders exclusively as React text nodes from JSON; the server never interpolates user-authored content into HTML, so stored XSS is structurally off the table. Runs as a desktop app or on a $5 VPS with Docker. MIT source.

**Maker first comment:**
Hi PH 👋 I kept building lead-gen quizzes for clients and kept hitting the same wall: the quiz converts great, then the platform bill scales with its success. Paying per response for an if/else and a progress bar felt absurd.

Quizcraft is my fix. The parts I'm proudest of are invisible: scoring and branching are entirely server-side (no "view source to see the answers"), the public payload strips points and result criteria, and the smoke test asserts exact scores, an inert XSS attempt, and CSV formula-escaping. MIT source on GitHub — the paid product is the 1-click installer. Ask me anything about quiz funnels; I have opinions about result-screen copy.

**Gallery shots (5):**
1. Builder — question list with types, points column, branching panel on the right.
2. The public runner mid-quiz — one question per screen, progress bar, accent theme.
3. Email-capture gate screen ("Almost there — enter your email to see your result").
4. Result screen — "You're a Lone Wolf 🎉" with description.
5. Analytics — views/submissions/completion tiles + per-question drop-off funnel.
