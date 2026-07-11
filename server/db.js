const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  // Under Electron the Node-ABI binding won't load; use the vendored Electron prebuild.
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

// URL-safe base62 token (crypto-strong, no ESM dep).
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function genToken(len = 12) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      theme_json TEXT NOT NULL DEFAULT '{}',
      email_capture INTEGER NOT NULL DEFAULT 0,   -- 1 = require email before showing results
      views INTEGER NOT NULL DEFAULT 0,           -- public payload fetches (funnel top)
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      type TEXT NOT NULL,                          -- 'multiple' | 'text' | 'rating' | 'image'
      text TEXT NOT NULL,
      options_json TEXT NOT NULL DEFAULT '[]',     -- [{id,label,points,image_url}] / rating: {max}
      "order" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS branch_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      condition_json TEXT NOT NULL,                -- {op:'equals'|'gte'|'lte', value}
      next_question_id INTEGER                     -- NULL = jump to end
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      criteria_json TEXT NOT NULL                  -- {type:'score',min,max} | {type:'answer_map',option_ids:[]}
    );
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      answers_json TEXT NOT NULL,                  -- {"<question_id>": <option_id | text | number>}
      result_id INTEGER,
      score INTEGER NOT NULL DEFAULT 0,
      email TEXT,
      at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, "order");
    CREATE INDEX IF NOT EXISTS idx_rules_question ON branch_rules(question_id);
    CREATE INDEX IF NOT EXISTS idx_results_quiz ON results(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_responses_quiz ON responses(quiz_id, at);
  `);

  return db;
}

module.exports = { openDb, genToken };
