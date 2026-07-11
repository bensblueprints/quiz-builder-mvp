const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb, genToken } = require('./db');
const { parse, resolveNext, computeScore, pickResult } = require('./logic');
const EMBED_JS = require('./embed-template');

const SESSION_COOKIE = 'qc_session';
const QUESTION_TYPES = new Set(['multiple', 'text', 'rating', 'image']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createApp({ dbPath, adminPassword, autologinToken = null } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({ limit: '512kb' }));
  app.locals.db = db;

  // ── helpers ────────────────────────────────────────────────────────────────
  const findQuiz = db.prepare('SELECT * FROM quizzes WHERE id = ?');
  const findQuizByPublicId = db.prepare('SELECT * FROM quizzes WHERE public_id = ?');
  const quizQuestions = db.prepare('SELECT * FROM questions WHERE quiz_id = ? ORDER BY "order"');
  const quizRules = db.prepare(
    'SELECT br.* FROM branch_rules br JOIN questions q ON q.id = br.question_id WHERE q.quiz_id = ?'
  );
  const quizResults = db.prepare('SELECT * FROM results WHERE quiz_id = ? ORDER BY id');

  function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function createSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  // Light per-IP rate limit on public submissions.
  const rateMap = new Map();
  function rateLimited(key, max = 30, windowMs = 60_000) {
    const now = Date.now();
    const arr = (rateMap.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return true;
    arr.push(now);
    rateMap.set(key, arr);
    if (rateMap.size > 5000) rateMap.clear(); // safety valve
    return false;
  }

  function fullQuiz(quiz) {
    return {
      ...quiz,
      theme: parse(quiz.theme_json, {}),
      questions: quizQuestions.all(quiz.id).map((q) => ({
        ...q,
        options: parse(q.options_json, [])
      })),
      branch_rules: quizRules.all(quiz.id).map((r) => ({
        ...r,
        condition: parse(r.condition_json, null)
      })),
      results: quizResults.all(quiz.id).map((r) => ({
        ...r,
        criteria: parse(r.criteria_json, null)
      }))
    };
  }

  // ── auth ───────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'quizcraft' }));

  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  // Desktop mode auto-login (Electron passes a one-shot token).
  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createSession(res);
    res.redirect('/');
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

  // ── quizzes CRUD (admin) ───────────────────────────────────────────────────
  app.get('/api/quizzes', requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT z.*,
        (SELECT COUNT(*) FROM questions q WHERE q.quiz_id = z.id) AS question_count,
        (SELECT COUNT(*) FROM responses r WHERE r.quiz_id = z.id) AS response_count
      FROM quizzes z ORDER BY z.created_at DESC
    `).all();
    res.json(rows.map((r) => ({ ...r, theme: parse(r.theme_json, {}) })));
  });

  app.post('/api/quizzes', requireAuth, (req, res) => {
    const title = String((req.body || {}).title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const theme = req.body.theme && typeof req.body.theme === 'object' ? req.body.theme : {};
    const info = db.prepare(
      'INSERT INTO quizzes (public_id, title, theme_json, email_capture, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(genToken(12), title, JSON.stringify(theme), req.body.email_capture ? 1 : 0, Date.now());
    res.status(201).json(fullQuiz(findQuiz.get(info.lastInsertRowid)));
  });

  app.get('/api/quizzes/:id', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    res.json(fullQuiz(quiz));
  });

  app.put('/api/quizzes/:id', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const body = req.body || {};
    const title = body.title !== undefined ? String(body.title).trim() : quiz.title;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const theme = body.theme && typeof body.theme === 'object' ? body.theme : parse(quiz.theme_json, {});
    const emailCapture = body.email_capture !== undefined ? (body.email_capture ? 1 : 0) : quiz.email_capture;
    db.prepare('UPDATE quizzes SET title = ?, theme_json = ?, email_capture = ? WHERE id = ?')
      .run(title, JSON.stringify(theme), emailCapture, quiz.id);
    res.json(fullQuiz(findQuiz.get(quiz.id)));
  });

  app.delete('/api/quizzes/:id', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM branch_rules WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)').run(quiz.id);
      db.prepare('DELETE FROM questions WHERE quiz_id = ?').run(quiz.id);
      db.prepare('DELETE FROM results WHERE quiz_id = ?').run(quiz.id);
      db.prepare('DELETE FROM responses WHERE quiz_id = ?').run(quiz.id);
      db.prepare('DELETE FROM quizzes WHERE id = ?').run(quiz.id);
    });
    tx();
    res.json({ ok: true });
  });

  // ── structure save (questions + branch rules + results in one transaction) ─
  // Questions may carry an existing numeric `id` (updated in place, so stored
  // responses keep pointing at the right question) and always carry a client
  // `ref` string; branch rules reference questions by ref.
  app.put('/api/quizzes/:id/structure', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const body = req.body || {};
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const rules = Array.isArray(body.branch_rules) ? body.branch_rules : [];
    const results = Array.isArray(body.results) ? body.results : [];

    // validate
    for (const q of questions) {
      if (!QUESTION_TYPES.has(q.type)) return res.status(400).json({ error: `invalid question type: ${q.type}` });
      if (!String(q.text || '').trim()) return res.status(400).json({ error: 'question text is required' });
      if (!q.ref) return res.status(400).json({ error: 'each question needs a ref' });
    }
    for (const r of results) {
      if (!String(r.name || '').trim()) return res.status(400).json({ error: 'result name is required' });
      if (!r.criteria || typeof r.criteria !== 'object') return res.status(400).json({ error: 'result criteria required' });
    }

    function cleanOptions(q) {
      if (q.type === 'rating') {
        const max = Math.min(Math.max(Math.floor(Number(q.options?.max)) || 5, 2), 10);
        return { max };
      }
      if (q.type === 'text') return [];
      const arr = Array.isArray(q.options) ? q.options : [];
      return arr.map((o) => ({
        id: String(o.id || genToken(8)),
        label: String(o.label || '').slice(0, 500),
        points: Number(o.points) || 0,
        ...(q.type === 'image' ? { image_url: String(o.image_url || '').slice(0, 2000) } : {})
      }));
    }

    const tx = db.transaction(() => {
      const existing = quizQuestions.all(quiz.id);
      const keptIds = new Set();
      const refToId = {};

      questions.forEach((q, i) => {
        const options = JSON.stringify(cleanOptions(q));
        const text = String(q.text).trim();
        const id = Number(q.id);
        if (id && existing.some((e) => e.id === id)) {
          db.prepare('UPDATE questions SET type = ?, text = ?, options_json = ?, "order" = ? WHERE id = ?')
            .run(q.type, text, options, i, id);
          refToId[q.ref] = id;
          keptIds.add(id);
        } else {
          const info = db.prepare(
            'INSERT INTO questions (quiz_id, type, text, options_json, "order") VALUES (?, ?, ?, ?, ?)'
          ).run(quiz.id, q.type, text, options, i);
          refToId[q.ref] = info.lastInsertRowid;
          keptIds.add(Number(info.lastInsertRowid));
        }
      });
      for (const e of existing) {
        if (!keptIds.has(e.id)) db.prepare('DELETE FROM questions WHERE id = ?').run(e.id);
      }

      // rebuild branch rules from scratch (they're cheap and ref-based)
      db.prepare('DELETE FROM branch_rules WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)').run(quiz.id);
      for (const r of rules) {
        const qid = refToId[r.question_ref];
        if (!qid || !r.condition || typeof r.condition !== 'object') continue;
        const nextId = r.next_ref ? refToId[r.next_ref] ?? null : null;
        db.prepare('INSERT INTO branch_rules (question_id, condition_json, next_question_id) VALUES (?, ?, ?)')
          .run(qid, JSON.stringify({ op: String(r.condition.op || 'equals'), value: r.condition.value }), nextId);
      }

      // replace results (keep ids where provided so responses.result_id stays valid)
      const existingResults = quizResults.all(quiz.id);
      const keptResultIds = new Set();
      for (const r of results) {
        const name = String(r.name).trim();
        const description = String(r.description || '').slice(0, 4000);
        const criteria = JSON.stringify(r.criteria);
        const id = Number(r.id);
        if (id && existingResults.some((e) => e.id === id)) {
          db.prepare('UPDATE results SET name = ?, description = ?, criteria_json = ? WHERE id = ?')
            .run(name, description, criteria, id);
          keptResultIds.add(id);
        } else {
          const info = db.prepare('INSERT INTO results (quiz_id, name, description, criteria_json) VALUES (?, ?, ?, ?)')
            .run(quiz.id, name, description, criteria);
          keptResultIds.add(Number(info.lastInsertRowid));
        }
      }
      for (const e of existingResults) {
        if (!keptResultIds.has(e.id)) db.prepare('DELETE FROM results WHERE id = ?').run(e.id);
      }
    });
    tx();
    res.json(fullQuiz(findQuiz.get(quiz.id)));
  });

  // ── responses / analytics (admin) ──────────────────────────────────────────
  app.get('/api/quizzes/:id/responses', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 2000);
    const rows = db.prepare('SELECT * FROM responses WHERE quiz_id = ? ORDER BY at DESC LIMIT ?').all(quiz.id, limit);
    const results = Object.fromEntries(quizResults.all(quiz.id).map((r) => [r.id, r.name]));
    res.json(rows.map((r) => ({
      ...r,
      answers: parse(r.answers_json, {}),
      result_name: r.result_id ? results[r.result_id] || null : null
    })));
  });

  app.get('/api/quizzes/:id/stats', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const questions = quizQuestions.all(quiz.id);
    const responses = db.prepare('SELECT answers_json, result_id, score FROM responses WHERE quiz_id = ?').all(quiz.id);
    const answerSets = responses.map((r) => parse(r.answers_json, {}));

    const perQuestion = questions.map((q) => {
      const options = parse(q.options_json, []);
      const answered = answerSets.filter((a) => a[q.id] !== undefined && a[q.id] !== '').length;
      let breakdown = [];
      if (q.type === 'multiple' || q.type === 'image') {
        breakdown = (Array.isArray(options) ? options : []).map((o) => ({
          label: o.label,
          count: answerSets.filter((a) => String(a[q.id]) === String(o.id)).length
        }));
      } else if (q.type === 'rating') {
        const max = options.max || 5;
        breakdown = Array.from({ length: max }, (_, i) => ({
          label: String(i + 1),
          count: answerSets.filter((a) => Number(a[q.id]) === i + 1).length
        }));
      }
      return {
        question_id: q.id,
        text: q.text,
        type: q.type,
        answered,
        answer_rate: responses.length ? Math.round((answered / responses.length) * 1000) / 10 : 0,
        breakdown
      };
    });

    const resultRows = quizResults.all(quiz.id).map((r) => ({
      id: r.id,
      name: r.name,
      count: responses.filter((x) => x.result_id === r.id).length
    }));

    res.json({
      views: quiz.views,
      submissions: responses.length,
      completion_rate: quiz.views ? Math.round((responses.length / quiz.views) * 1000) / 10 : null,
      emails_captured: db.prepare("SELECT COUNT(*) c FROM responses WHERE quiz_id = ? AND email IS NOT NULL AND email != ''").get(quiz.id).c,
      per_question: perQuestion,
      per_result: resultRows
    });
  });

  // CSV export. Fields are quoted+escaped; leading =+-@ get a ' prefix so a
  // spreadsheet never interprets user-authored content as a formula.
  app.get('/api/quizzes/:id/export.csv', requireAuth, (req, res) => {
    const quiz = findQuiz.get(req.params.id);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const questions = quizQuestions.all(quiz.id);
    const results = Object.fromEntries(quizResults.all(quiz.id).map((r) => [r.id, r.name]));
    const rows = db.prepare('SELECT * FROM responses WHERE quiz_id = ? ORDER BY at').all(quiz.id);

    const csvField = (v) => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const optionLabel = (q, answer) => {
      if (q.type === 'multiple' || q.type === 'image') {
        const opts = parse(q.options_json, []);
        const o = Array.isArray(opts) ? opts.find((x) => String(x.id) === String(answer)) : null;
        return o ? o.label : String(answer ?? '');
      }
      return String(answer ?? '');
    };

    const header = ['id', 'submitted_at', 'email', 'score', 'result', ...questions.map((q) => q.text)];
    const lines = [header.map(csvField).join(',')];
    for (const r of rows) {
      const answers = parse(r.answers_json, {});
      lines.push([
        r.id,
        new Date(r.at).toISOString(),
        r.email || '',
        r.score,
        r.result_id ? results[r.result_id] || '' : '',
        ...questions.map((q) => (answers[q.id] !== undefined ? optionLabel(q, answers[q.id]) : ''))
      ].map(csvField).join(','));
    }
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="quizcraft-${quiz.public_id}-responses.csv"`);
    res.send(lines.join('\r\n'));
  });

  // ── public quiz API (no auth) ──────────────────────────────────────────────
  // Payload is JSON-only; question/option/result text never touches an HTML
  // template server-side, and the client renders it via React text nodes.
  // Points and result criteria are stripped — scoring is server-side.
  app.get('/api/public/quiz/:publicId', (req, res) => {
    const quiz = findQuizByPublicId.get(req.params.publicId);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    if (req.query.preview !== '1') {
      db.prepare('UPDATE quizzes SET views = views + 1 WHERE id = ?').run(quiz.id);
    }
    const questions = quizQuestions.all(quiz.id).map((q) => {
      const options = parse(q.options_json, []);
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        order: q.order,
        options: q.type === 'rating'
          ? { max: options.max || 5 }
          : (Array.isArray(options) ? options : []).map((o) => ({
              id: o.id, label: o.label, ...(o.image_url ? { image_url: o.image_url } : {})
            }))
      };
    });
    const rules = quizRules.all(quiz.id).map((r) => ({
      question_id: r.question_id,
      condition: parse(r.condition_json, null),
      next_question_id: r.next_question_id
    }));
    res.json({
      quiz: {
        public_id: quiz.public_id,
        title: quiz.title,
        theme: parse(quiz.theme_json, {}),
        email_capture: !!quiz.email_capture,
        question_count: questions.length
      },
      questions,
      branch_rules: rules
    });
  });

  // Server-side next-question resolution (canonical branching logic).
  app.post('/api/public/quiz/:publicId/next', (req, res) => {
    const quiz = findQuizByPublicId.get(req.params.publicId);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const { question_id, answer } = req.body || {};
    const questions = quizQuestions.all(quiz.id).map((q) => ({ id: q.id, order: q.order }));
    const next = resolveNext(questions, quizRules.all(quiz.id), question_id, answer);
    res.json({ next_question_id: next });
  });

  // Submission: score + result bucket computed here, never on the client.
  app.post('/api/public/quiz/:publicId/submit', (req, res) => {
    const quiz = findQuizByPublicId.get(req.params.publicId);
    if (!quiz) return res.status(404).json({ error: 'not found' });
    const ip = (req.ip || '').replace('::ffff:', '');
    if (rateLimited('submit:' + ip)) return res.status(429).json({ error: 'rate limited' });

    const body = req.body || {};
    const answersIn = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const questions = quizQuestions.all(quiz.id);
    const validIds = new Set(questions.map((q) => q.id));

    const answers = {};
    for (const [k, v] of Object.entries(answersIn)) {
      const id = Number(k);
      if (!validIds.has(id)) continue;
      if (typeof v === 'string') answers[id] = v.slice(0, 4000);
      else if (typeof v === 'number' && Number.isFinite(v)) answers[id] = v;
    }

    const email = String(body.email || '').trim().slice(0, 320);
    if (quiz.email_capture) {
      if (!email) return res.status(422).json({ error: 'email_required' });
      if (!EMAIL_RE.test(email)) return res.status(422).json({ error: 'invalid_email' });
    }

    const score = computeScore(questions, answers);
    const result = pickResult(quizResults.all(quiz.id), answers, score);

    db.prepare('INSERT INTO responses (quiz_id, answers_json, result_id, score, email, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(quiz.id, JSON.stringify(answers), result ? result.id : null, score, email || null, Date.now());

    res.status(201).json({
      score,
      result: result
        ? { id: result.id, name: result.name, description: result.description }
        : null
    });
  });

  // ── embed script (static JS, contains no user-authored content) ───────────
  app.get('/embed.js', (req, res) => {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(EMBED_JS);
  });

  // ── static frontend ────────────────────────────────────────────────────────
  // /q/:publicId serves the same static shell; the client fetches the quiz as
  // JSON and renders it — the server never injects quiz content into HTML.
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/embed.js') return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/q/:publicId', (req, res) => res.status(503).send('Frontend not built. Run: npm run build'));
  }

  return app;
}

module.exports = { createApp };
