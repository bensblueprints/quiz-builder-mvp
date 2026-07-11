// Quizcraft smoke test — boots the real server on a temp DB and exercises the
// full pipeline: builder structure save → public payload (points/criteria
// stripped) → branching → scoring with EXACT-number assertions → result
// buckets (score-range + answer-map) → email-capture gate → CSV export with
// formula-injection guard → XSS safety (user-authored content never reaches
// server-rendered HTML) → rate limiting. Kills ONLY the spawned server child.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5466; // offset port — other build agents run concurrently
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;
const XSS = '<script>window.__pwned=1</script><img src=x onerror=alert(1)>';

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.text();
  return { status: res.status, data, headers: res.headers };
}

async function main() {
  console.log('1. Booting Quizcraft on port', TEST_PORT);
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('   Auth: wrong password → 401, unauthenticated → 401, login → 200');
  assert.strictEqual((await api('/api/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  cookie = '';
  assert.strictEqual((await api('/api/quizzes')).status, 401);
  assert.strictEqual((await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } })).status, 200);

  console.log('2. Create quiz with XSS-laden title + structure (points, branching, results)');
  const quiz = (await api('/api/quizzes', {
    method: 'POST',
    body: { title: `${XSS}Founder Type Quiz`, email_capture: 1, theme: { accent: '#8b5cf6' } }
  })).data;
  assert.ok(quiz.public_id, 'quiz must get a public id');

  const structure = (await api(`/api/quizzes/${quiz.id}/structure`, {
    method: 'PUT',
    body: {
      questions: [
        {
          ref: 'q1', type: 'multiple', text: `Pick a work style ${XSS}`,
          options: [
            { id: 'optA', label: `Solo builder ${XSS}`, points: 10 },
            { id: 'optB', label: 'Team player', points: 5 },
            { id: 'optC', label: 'Delegator', points: 0 }
          ]
        },
        { ref: 'q2', type: 'rating', text: 'How much do you love meetings?', options: { max: 5 } },
        { ref: 'q3', type: 'text', text: 'Describe your dream company.' }
      ],
      branch_rules: [
        // Solo builders skip the meetings question entirely
        { question_ref: 'q1', condition: { op: 'equals', value: 'optA' }, next_ref: 'q3' }
      ],
      results: [
        { name: `Lone Wolf ${XSS}`, description: 'You build alone.', criteria: { type: 'score', min: 10, max: 99 } },
        { name: 'Collaborator', description: 'You build with people.', criteria: { type: 'score', min: 0, max: 9 } }
      ]
    }
  })).data;
  const [q1, q2, q3] = structure.questions;
  assert.strictEqual(structure.questions.length, 3);
  assert.strictEqual(structure.branch_rules.length, 1);
  assert.strictEqual(structure.results.length, 2);

  console.log('3. Public payload: points & result criteria stripped, view counted');
  const pub = (await api(`/api/public/quiz/${quiz.public_id}`)).data;
  assert.strictEqual(pub.quiz.title.includes('Founder Type Quiz'), true);
  assert.strictEqual(pub.quiz.email_capture, true);
  for (const q of pub.questions) {
    if (Array.isArray(q.options)) for (const o of q.options) {
      assert.strictEqual(o.points, undefined, 'points must never reach the public payload');
    }
  }
  assert.ok(!JSON.stringify(pub).includes('criteria'), 'result criteria must never reach the public payload');
  assert.ok(!JSON.stringify(pub).includes('Lone Wolf'), 'result names must not be exposed pre-submit');

  console.log('4. XSS safety: server-rendered HTML + embed.js contain ZERO user-authored content');
  const shell = await fetch(`${BASE}/q/${quiz.public_id}`);
  assert.strictEqual(shell.status, 200);
  const shellHtml = await shell.text();
  assert.ok(!shellHtml.includes('__pwned'), 'quiz shell HTML must not contain the script payload');
  assert.ok(!shellHtml.includes('Founder Type Quiz'), 'server must never inject quiz content into HTML (client renders JSON as text nodes)');
  assert.ok(!shellHtml.includes('onerror=alert'), 'attack markup must not appear in served HTML');
  const embed = await fetch(`${BASE}/embed.js`);
  const embedJs = await embed.text();
  assert.ok(embed.headers.get('content-type').includes('javascript'));
  assert.ok(!embedJs.includes('__pwned') && !embedJs.includes('Founder'), 'embed.js is static — no user content');
  // the XSS string round-trips as inert JSON data (correct: it's data, not markup)
  assert.ok(JSON.stringify(pub.questions[0].text).includes('Pick a work style'), 'content survives as data');

  console.log('5. Branching: optA jumps to Q3 (skips rating); optB falls through to Q2');
  const nextA = (await api(`/api/public/quiz/${quiz.public_id}/next`, {
    method: 'POST', body: { question_id: q1.id, answer: 'optA' }
  })).data;
  assert.strictEqual(nextA.next_question_id, q3.id, 'optA must branch to Q3');
  const nextB = (await api(`/api/public/quiz/${quiz.public_id}/next`, {
    method: 'POST', body: { question_id: q1.id, answer: 'optB' }
  })).data;
  assert.strictEqual(nextB.next_question_id, q2.id, 'optB must fall through to Q2');
  const nextEnd = (await api(`/api/public/quiz/${quiz.public_id}/next`, {
    method: 'POST', body: { question_id: q3.id, answer: 'anything' }
  })).data;
  assert.strictEqual(nextEnd.next_question_id, null, 'Q3 is the last question');

  console.log('6. Email gate: submit without email → 422; invalid email → 422');
  const noEmail = await api(`/api/public/quiz/${quiz.public_id}/submit`, {
    method: 'POST', body: { answers: { [q1.id]: 'optA' } }
  });
  assert.strictEqual(noEmail.status, 422);
  assert.strictEqual(noEmail.data.error, 'email_required');
  const badEmail = await api(`/api/public/quiz/${quiz.public_id}/submit`, {
    method: 'POST', body: { answers: { [q1.id]: 'optA' }, email: 'not-an-email' }
  });
  assert.strictEqual(badEmail.status, 422);

  console.log('7. Scoring — EXACT numbers: optA(10) + text(0) = 10 → Lone Wolf');
  const sub1 = (await api(`/api/public/quiz/${quiz.public_id}/submit`, {
    method: 'POST',
    body: { answers: { [q1.id]: 'optA', [q3.id]: 'A quiet workshop.' }, email: 'solo@example.com' }
  })).data;
  assert.strictEqual(sub1.score, 10, 'optA must score exactly 10 points');
  assert.strictEqual(sub1.result.name.includes('Lone Wolf'), true, 'score 10 must land in the 10-99 bucket');

  console.log('   optB(5) + rating 3 = 8 → Collaborator');
  const sub2 = (await api(`/api/public/quiz/${quiz.public_id}/submit`, {
    method: 'POST',
    body: { answers: { [q1.id]: 'optB', [q2.id]: 3, [q3.id]: 'A big open office.' }, email: 'team@example.com' }
  })).data;
  assert.strictEqual(sub2.score, 8, '5 + 3 must equal exactly 8');
  assert.strictEqual(sub2.result.name, 'Collaborator', 'score 8 must land in the 0-9 bucket');

  console.log('   optC(0) + rating 5 = 5 → Collaborator; unknown question ids ignored');
  const sub3 = (await api(`/api/public/quiz/${quiz.public_id}/submit`, {
    method: 'POST',
    body: { answers: { [q1.id]: 'optC', [q2.id]: 5, 999999: 'ignored' }, email: 'del@example.com' }
  })).data;
  assert.strictEqual(sub3.score, 5);
  assert.strictEqual(sub3.result.name, 'Collaborator');

  console.log('8. Answer-mapped result buckets on a second quiz (no email gate)');
  const quiz2 = (await api('/api/quizzes', { method: 'POST', body: { title: 'Which fruit are you?' } })).data;
  const s2 = (await api(`/api/quizzes/${quiz2.id}/structure`, {
    method: 'PUT',
    body: {
      questions: [
        { ref: 'a', type: 'multiple', text: 'Pick a color', options: [{ id: 'red', label: 'Red', points: 0 }, { id: 'yellow', label: 'Yellow', points: 0 }] },
        { ref: 'b', type: 'multiple', text: 'Pick a shape', options: [{ id: 'round', label: 'Round', points: 0 }, { id: 'long', label: 'Long', points: 0 }] }
      ],
      branch_rules: [],
      results: [
        { name: 'Apple', description: '', criteria: { type: 'answer_map', option_ids: ['red', 'round'] } },
        { name: 'Banana', description: '', criteria: { type: 'answer_map', option_ids: ['yellow', 'long'] } }
      ]
    }
  })).data;
  const [qa, qb] = s2.questions;
  const fruit = (await api(`/api/public/quiz/${quiz2.public_id}/submit`, {
    method: 'POST', body: { answers: { [qa.id]: 'yellow', [qb.id]: 'long' } }
  })).data;
  assert.strictEqual(fruit.result.name, 'Banana', '2/2 banana answers must map to Banana');
  const mixed = (await api(`/api/public/quiz/${quiz2.public_id}/submit`, {
    method: 'POST', body: { answers: { [qa.id]: 'red', [qb.id]: 'long' } }
  })).data;
  assert.ok(['Apple', 'Banana'].includes(mixed.result.name), 'tie resolves to a bucket deterministically');

  console.log('9. Stats: exact funnel numbers');
  const stats = (await api(`/api/quizzes/${quiz.id}/stats`)).data;
  assert.strictEqual(stats.submissions, 3);
  assert.strictEqual(stats.emails_captured, 3);
  assert.strictEqual(stats.views, 1, 'only the one non-preview payload fetch counts as a view');
  const q1Stats = stats.per_question.find((x) => x.question_id === q1.id);
  assert.strictEqual(q1Stats.answered, 3);
  assert.strictEqual(q1Stats.breakdown.find((b) => b.label.includes('Solo builder')).count, 1);
  assert.strictEqual(q1Stats.breakdown.find((b) => b.label === 'Team player').count, 1);
  const q2Stats = stats.per_question.find((x) => x.question_id === q2.id);
  assert.strictEqual(q2Stats.answered, 2, 'the branch-skipped respondent must show as drop-off on Q2');
  assert.strictEqual(stats.per_result.find((r) => r.name.includes('Lone Wolf')).count, 1);
  assert.strictEqual(stats.per_result.find((r) => r.name === 'Collaborator').count, 2);

  console.log('10. CSV export: quoted, formula-injection neutralized');
  const csv = await api(`/api/quizzes/${quiz.id}/export.csv`);
  assert.strictEqual(csv.status, 200);
  assert.ok(csv.headers.get('content-type').includes('csv'));
  assert.ok(csv.data.includes('solo@example.com'));
  // inject a formula answer then re-export
  await api(`/api/public/quiz/${quiz.public_id}/submit`, {
    method: 'POST', body: { answers: { [q3.id]: '=HYPERLINK("http://evil","x")' }, email: 'evil@example.com' }
  });
  const csv2 = (await api(`/api/quizzes/${quiz.id}/export.csv`)).data;
  assert.ok(csv2.includes(`"'=HYPERLINK`), 'leading = must be prefixed with a quote so spreadsheets treat it as text');
  assert.ok(!csv2.split('\r\n').some((line) => line.startsWith('=')), 'no raw formula at line start');

  console.log('11. Rate limit: 31st rapid submission from one IP → 429');
  let last = null;
  for (let i = 0; i < 31; i++) {
    last = await api(`/api/public/quiz/${quiz2.public_id}/submit`, {
      method: 'POST', body: { answers: { [qa.id]: 'red' } }
    });
    if (last.status === 429) break;
  }
  assert.strictEqual(last.status, 429, 'rapid-fire submissions must hit the rate limit');

  console.log('12. Rows persisted in SQLite');
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM quizzes').get().n, 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM responses WHERE quiz_id = ?').get(quiz.id).n, 4);
  assert.strictEqual(db.prepare('SELECT COUNT(*) n FROM branch_rules').get().n, 1);
  const stored = db.prepare('SELECT score FROM responses WHERE quiz_id = ? ORDER BY id').all(quiz.id).map((r) => r.score);
  assert.deepStrictEqual(stored.slice(0, 3), [10, 8, 5], 'stored scores must match computed scores exactly');
  db.close();

  console.log('\n✅ All Quizcraft smoke tests passed');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill(); // ONLY the spawned child
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows lock */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
