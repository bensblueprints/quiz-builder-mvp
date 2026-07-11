// Pure quiz logic: branching resolution, scoring, result-bucket picking.
// All scoring/result computation happens server-side — points and criteria
// are never shipped in the public payload.

function parse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

// Does an answer satisfy a branch condition?
// For choice questions the answer is an option id (string compare);
// for rating it's a number; for text an exact string match.
function conditionMatches(condition, answer) {
  if (!condition || typeof condition !== 'object') return false;
  const { op, value } = condition;
  if (op === 'equals') return String(answer) === String(value);
  const a = Number(answer);
  const v = Number(value);
  if (!Number.isFinite(a) || !Number.isFinite(v)) return false;
  if (op === 'gte') return a >= v;
  if (op === 'lte') return a <= v;
  return false;
}

// Resolve which question comes after `questionId` given `answer`.
// Returns a question id, or null when the quiz ends.
function resolveNext(questions, rules, questionId, answer) {
  const ordered = [...questions].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((q) => q.id === Number(questionId));
  if (idx === -1) return null;
  for (const r of rules.filter((r) => r.question_id === Number(questionId))) {
    if (conditionMatches(parse(r.condition_json, null), answer)) {
      return r.next_question_id ?? null; // NULL next = jump straight to end
    }
  }
  return idx + 1 < ordered.length ? ordered[idx + 1].id : null;
}

// Sum points across answered questions.
// multiple/image: points of the chosen option. rating: the numeric value. text: 0.
function computeScore(questions, answers) {
  let score = 0;
  for (const q of questions) {
    const answer = answers[q.id];
    if (answer === undefined || answer === null || answer === '') continue;
    if (q.type === 'multiple' || q.type === 'image') {
      const opts = parse(q.options_json, []);
      const opt = Array.isArray(opts) ? opts.find((o) => String(o.id) === String(answer)) : null;
      if (opt) score += Number(opt.points) || 0;
    } else if (q.type === 'rating') {
      const n = Number(answer);
      if (Number.isFinite(n)) score += n;
    }
  }
  return score;
}

// Pick the result bucket:
// 1. first score-range result where min <= score <= max wins;
// 2. otherwise answer-mapped results: the bucket whose option_ids collected
//    the most picked answers wins (classic "You're a [Result A]" quizzes).
function pickResult(results, answers, score) {
  for (const r of results) {
    const c = parse(r.criteria_json, null);
    if (c && c.type === 'score' && score >= Number(c.min) && score <= Number(c.max)) return r;
  }
  const picked = new Set(Object.values(answers).map(String));
  let best = null;
  let bestHits = 0;
  for (const r of results) {
    const c = parse(r.criteria_json, null);
    if (!c || c.type !== 'answer_map' || !Array.isArray(c.option_ids)) continue;
    const hits = c.option_ids.filter((id) => picked.has(String(id))).length;
    if (hits > bestHits) { best = r; bestHits = hits; }
  }
  return best;
}

module.exports = { parse, conditionMatches, resolveNext, computeScore, pickResult };
