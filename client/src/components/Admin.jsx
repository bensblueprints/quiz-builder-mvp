import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Puzzle, Lock, Plus, Trash2, ChevronUp, ChevronDown, ArrowLeft, Check,
  BarChart3, LogOut, Copy, ExternalLink, GitBranch, Trophy, Download, Mail
} from 'lucide-react';
import { api } from '../api.js';

const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500';
const btn = 'inline-flex items-center gap-1.5 bg-violet-500 hover:bg-violet-400 text-zinc-950 font-medium text-sm rounded-lg px-3.5 py-2 transition-colors disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-sm rounded-lg px-3 py-1.5 transition-colors';
const iconBtn = 'p-1.5 rounded-lg hover:bg-zinc-700 text-zinc-400 transition-colors';

function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.login(password); onLogin(); } catch { setError('Wrong password'); }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5">
        <div className="flex items-center gap-2 justify-center text-lg font-semibold">
          <Puzzle className="w-6 h-6 text-violet-400" /> Quizcraft
        </div>
        <p className="text-sm text-zinc-500 text-center">Interactive quizzes with branching + lead capture. Pay once.</p>
        <label className="block">
          <span className="text-xs text-zinc-400 uppercase tracking-wide">Admin password</span>
          <div className="mt-1.5 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              className={`${input} pl-9`} placeholder="••••••••" />
          </div>
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className={`${btn} w-full justify-center`}>Sign in</button>
      </motion.form>
    </div>
  );
}

let refCounter = 0;
const newRef = () => `r${Date.now().toString(36)}${refCounter++}`;

// Convert a server quiz tree into editable structure state.
function toDraft(quiz) {
  const questions = quiz.questions.map((q) => ({
    id: q.id, ref: newRef(), type: q.type, text: q.text,
    options: q.type === 'rating' ? { max: q.options.max || 5 } : q.options
  }));
  const idToRef = Object.fromEntries(questions.map((q) => [q.id, q.ref]));
  const branch_rules = quiz.branch_rules.map((r) => ({
    question_ref: idToRef[r.question_id],
    condition: r.condition || { op: 'equals', value: '' },
    next_ref: r.next_question_id ? idToRef[r.next_question_id] || null : null
  })).filter((r) => r.question_ref);
  const results = quiz.results.map((r) => ({
    id: r.id, name: r.name, description: r.description, criteria: r.criteria || { type: 'score', min: 0, max: 10 }
  }));
  return { questions, branch_rules, results };
}

function QuizEditor({ quizId, onBack, notify }) {
  const [quiz, setQuiz] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tab, setTab] = useState('build');
  const [stats, setStats] = useState(null);
  const [responses, setResponses] = useState([]);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const z = await api.quiz(quizId);
    setQuiz(z);
    setDraft(toDraft(z));
    setDirty(false);
  }, [quizId]);
  useEffect(() => { load().catch((e) => notify(e.message, true)); }, [load, notify]);
  useEffect(() => {
    if (tab === 'results') {
      api.stats(quizId).then(setStats).catch(() => {});
      api.responses(quizId).then(setResponses).catch(() => {});
    }
  }, [tab, quizId]);

  if (!quiz || !draft) return <p className="text-zinc-500 text-sm">Loading…</p>;

  const setQ = (i, patch) => {
    setDirty(true);
    setDraft((d) => ({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
  };
  const moveQ = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= draft.questions.length) return;
    setDirty(true);
    setDraft((d) => {
      const qs = [...d.questions];
      [qs[i], qs[j]] = [qs[j], qs[i]];
      return { ...d, questions: qs };
    });
  };
  const addQuestion = (type) => {
    setDirty(true);
    setDraft((d) => ({
      ...d,
      questions: [...d.questions, {
        ref: newRef(), type, text: '',
        options: type === 'rating' ? { max: 5 } : type === 'text' ? [] : [{ id: '', label: '', points: 0 }, { id: '', label: '', points: 0 }]
      }]
    }));
  };

  const save = async () => {
    try {
      const z = await api.saveStructure(quizId, draft);
      setQuiz(z);
      setDraft(toDraft(z));
      setDirty(false);
      notify('Quiz saved');
    } catch (e) { notify(e.message, true); }
  };

  const saveMeta = async (patch) => {
    try {
      const z = await api.updateQuiz(quizId, patch);
      setQuiz((old) => ({ ...z, questions: old.questions, branch_rules: old.branch_rules, results: old.results }));
      notify('Saved');
    } catch (e) { notify(e.message, true); }
  };

  const origin = window.location.origin;
  const link = `${origin}/q/${quiz.public_id}`;
  const inlineSnippet = `<div data-quizcraft="${quiz.public_id}"></div>\n<script src="${origin}/embed.js" async></script>`;
  const popupSnippet = `<button data-quizcraft-popup="${quiz.public_id}">Take the quiz</button>\n<script src="${origin}/embed.js" async></script>`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className={iconBtn}><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-semibold flex-1">{quiz.title}</h2>
        <a href={`${link}?preview=1`} target="_blank" rel="noreferrer" className={btnGhost}>
          <ExternalLink className="w-4 h-4" /> Preview
        </a>
        {tab === 'build' && <button className={btn} onClick={save} disabled={!dirty}><Check className="w-4 h-4" /> {dirty ? 'Save changes' : 'Saved'}</button>}
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {[['build', 'Builder'], ['results', 'Responses'], ['share', 'Share & embed'], ['settings', 'Settings']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${tab === t ? 'border-violet-500 text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'build' && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="space-y-4">
            {draft.questions.map((q, i) => (
              <div key={q.ref} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-6">{i + 1}.</span>
                  <select className={`${input} w-36`} value={q.type} onChange={(e) => setQ(i, {
                    type: e.target.value,
                    options: e.target.value === 'rating' ? { max: 5 } : e.target.value === 'text' ? [] : (Array.isArray(q.options) ? q.options : [{ id: '', label: '', points: 0 }, { id: '', label: '', points: 0 }])
                  })}>
                    <option value="multiple">Multiple choice</option>
                    <option value="image">Image choice</option>
                    <option value="rating">Rating</option>
                    <option value="text">Text</option>
                  </select>
                  <div className="flex-1" />
                  <button className={iconBtn} onClick={() => moveQ(i, -1)}><ChevronUp className="w-4 h-4" /></button>
                  <button className={iconBtn} onClick={() => moveQ(i, +1)}><ChevronDown className="w-4 h-4" /></button>
                  <button className={`${iconBtn} hover:text-red-400`} onClick={() => { setDirty(true); setDraft((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i), branch_rules: d.branch_rules.filter((r) => r.question_ref !== q.ref && r.next_ref !== q.ref) })); }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <input className={input} placeholder="Question text…" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />
                {(q.type === 'multiple' || q.type === 'image') && (
                  <div className="space-y-1.5">
                    {q.options.map((o, oi) => (
                      <div key={oi} className="flex gap-2">
                        <input className={input} placeholder={`Option ${oi + 1}`} value={o.label}
                          onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === oi ? { ...x, label: e.target.value } : x)) })} />
                        {q.type === 'image' && (
                          <input className={`${input} w-56`} placeholder="Image URL" value={o.image_url || ''}
                            onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === oi ? { ...x, image_url: e.target.value } : x)) })} />
                        )}
                        <input className={`${input} w-20`} type="number" title="Points" value={o.points}
                          onChange={(e) => setQ(i, { options: q.options.map((x, j) => (j === oi ? { ...x, points: Number(e.target.value) } : x)) })} />
                        <button className={iconBtn} onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi) })}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => setQ(i, { options: [...q.options, { id: '', label: '', points: 0 }] })}>+ option</button>
                    <p className="text-[11px] text-zinc-600">Right column = points (used for score-range results).</p>
                  </div>
                )}
                {q.type === 'rating' && (
                  <label className="text-xs text-zinc-400 flex items-center gap-2">
                    Max stars
                    <input className={`${input} w-20`} type="number" min="2" max="10" value={q.options.max}
                      onChange={(e) => setQ(i, { options: { max: Number(e.target.value) } })} />
                    <span className="text-zinc-600">(rating value adds to score)</span>
                  </label>
                )}
              </div>
            ))}
            <div className="flex gap-2 flex-wrap">
              {[['multiple', 'Multiple choice'], ['image', 'Image choice'], ['rating', 'Rating'], ['text', 'Text']].map(([t, label]) => (
                <button key={t} className={btnGhost} onClick={() => addQuestion(t)}><Plus className="w-4 h-4" /> {label}</button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2"><GitBranch className="w-4 h-4 text-violet-400" /> Branching rules</h3>
              {draft.branch_rules.map((r, ri) => (
                <div key={ri} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">If question…</span>
                    <button className="text-zinc-500 hover:text-red-400" onClick={() => { setDirty(true); setDraft((d) => ({ ...d, branch_rules: d.branch_rules.filter((_, j) => j !== ri) })); }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <select className={input} value={r.question_ref || ''} onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, branch_rules: d.branch_rules.map((x, j) => (j === ri ? { ...x, question_ref: e.target.value } : x)) })); }}>
                    {draft.questions.map((q, qi) => <option key={q.ref} value={q.ref}>Q{qi + 1}: {q.text.slice(0, 40) || '(untitled)'}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <select className={`${input} w-24`} value={r.condition.op} onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, branch_rules: d.branch_rules.map((x, j) => (j === ri ? { ...x, condition: { ...x.condition, op: e.target.value } } : x)) })); }}>
                      <option value="equals">=</option><option value="gte">≥</option><option value="lte">≤</option>
                    </select>
                    {(() => {
                      const srcQ = draft.questions.find((q) => q.ref === r.question_ref);
                      if (srcQ && (srcQ.type === 'multiple' || srcQ.type === 'image') && r.condition.op === 'equals') {
                        return (
                          <select className={input} value={String(r.condition.value ?? '')} onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, branch_rules: d.branch_rules.map((x, j) => (j === ri ? { ...x, condition: { ...x.condition, value: e.target.value } } : x)) })); }}>
                            <option value="">(pick option)</option>
                            {srcQ.options.map((o, oi) => <option key={oi} value={o.id || o.label}>{o.label || `option ${oi + 1}`}</option>)}
                          </select>
                        );
                      }
                      return (
                        <input className={input} placeholder="value" value={r.condition.value ?? ''}
                          onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, branch_rules: d.branch_rules.map((x, j) => (j === ri ? { ...x, condition: { ...x.condition, value: e.target.value } } : x)) })); }} />
                      );
                    })()}
                  </div>
                  <span className="text-zinc-500">…jump to</span>
                  <select className={input} value={r.next_ref || ''} onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, branch_rules: d.branch_rules.map((x, j) => (j === ri ? { ...x, next_ref: e.target.value || null } : x)) })); }}>
                    <option value="">End of quiz</option>
                    {draft.questions.map((q, qi) => <option key={q.ref} value={q.ref}>Q{qi + 1}: {q.text.slice(0, 40) || '(untitled)'}</option>)}
                  </select>
                </div>
              ))}
              <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => {
                if (!draft.questions.length) return;
                setDirty(true);
                setDraft((d) => ({ ...d, branch_rules: [...d.branch_rules, { question_ref: d.questions[0].ref, condition: { op: 'equals', value: '' }, next_ref: null }] }));
              }}>+ add rule</button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-400" /> Result buckets</h3>
              {draft.results.map((r, ri) => (
                <div key={ri} className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex gap-2">
                    <input className={input} placeholder="Result name — “You're a Visionary!”" value={r.name}
                      onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, results: d.results.map((x, j) => (j === ri ? { ...x, name: e.target.value } : x)) })); }} />
                    <button className="text-zinc-500 hover:text-red-400" onClick={() => { setDirty(true); setDraft((d) => ({ ...d, results: d.results.filter((_, j) => j !== ri) })); }}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <textarea className={`${input} min-h-14`} placeholder="Shown on the result screen…" value={r.description}
                    onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, results: d.results.map((x, j) => (j === ri ? { ...x, description: e.target.value } : x)) })); }} />
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Score range</span>
                    <input className={`${input} w-16`} type="number" value={r.criteria.min ?? 0}
                      onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, results: d.results.map((x, j) => (j === ri ? { ...x, criteria: { type: 'score', min: Number(e.target.value), max: x.criteria.max ?? 10 } } : x)) })); }} />
                    <span className="text-zinc-600">to</span>
                    <input className={`${input} w-16`} type="number" value={r.criteria.max ?? 10}
                      onChange={(e) => { setDirty(true); setDraft((d) => ({ ...d, results: d.results.map((x, j) => (j === ri ? { ...x, criteria: { type: 'score', min: x.criteria.min ?? 0, max: Number(e.target.value) } } : x)) })); }} />
                  </div>
                </div>
              ))}
              <button className="text-xs text-zinc-400 hover:text-zinc-200" onClick={() => { setDirty(true); setDraft((d) => ({ ...d, results: [...d.results, { name: '', description: '', criteria: { type: 'score', min: 0, max: 10 } }] })); }}>+ add result</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-6">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[['Views', stats.views], ['Submissions', stats.submissions],
                ['Completion', stats.completion_rate != null ? `${stats.completion_rate}%` : '—'],
                ['Emails captured', stats.emails_captured]].map(([l, v]) => (
                <div key={l} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-xs text-zinc-500 uppercase">{l}</p>
                  <p className="text-2xl font-semibold mt-1">{v}</p>
                </div>
              ))}
            </div>
          )}
          {stats && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-medium">Per-question funnel</h3>
              {stats.per_question.map((q, i) => (
                <div key={q.question_id}>
                  <div className="flex justify-between text-sm"><span>{i + 1}. {q.text}</span><span className="text-zinc-500">{q.answered} answered ({q.answer_rate}%)</span></div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${q.answer_rate}%` }} />
                  </div>
                  {q.breakdown.length > 0 && (
                    <p className="text-xs text-zinc-500 mt-1">{q.breakdown.map((b) => `${b.label}: ${b.count}`).join(' · ')}</p>
                  )}
                </div>
              ))}
              {stats.per_result.length > 0 && (
                <p className="text-xs text-zinc-400 pt-2 border-t border-zinc-800">Results: {stats.per_result.map((r) => `${r.name} ×${r.count}`).join(' · ')}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Latest responses</h3>
            <a href={`/api/quizzes/${quizId}/export.csv`} className={btnGhost}><Download className="w-4 h-4" /> Export CSV</a>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-800">
                <th className="px-4 py-3">When</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Result</th>
              </tr></thead>
              <tbody>
                {responses.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-800/60">
                    <td className="px-4 py-2.5 text-zinc-400">{new Date(r.at).toLocaleString()}</td>
                    <td className="px-4 py-2.5">{r.email ? <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-emerald-400" />{r.email}</span> : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-4 py-2.5">{r.score}</td>
                    <td className="px-4 py-2.5">{r.result_name || <span className="text-zinc-600">—</span>}</td>
                  </tr>
                ))}
                {responses.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-600">No responses yet — share the quiz!</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'share' && (
        <div className="max-w-2xl space-y-5">
          {[['Full-page link', link], ['Inline embed', inlineSnippet], ['Popup trigger', popupSnippet]].map(([label, code]) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">{label}</h3>
                <button className={btnGhost} onClick={() => { navigator.clipboard.writeText(code); notify('Copied'); }}><Copy className="w-3.5 h-3.5" /> Copy</button>
              </div>
              <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">{code}</pre>
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <SettingsTab quiz={quiz} onSave={saveMeta} onDelete={async () => {
          if (confirm(`Delete quiz "${quiz.title}" and all responses?`)) { await api.deleteQuiz(quizId); onBack(); }
        }} />
      )}
    </div>
  );
}

function SettingsTab({ quiz, onSave, onDelete }) {
  const [title, setTitle] = useState(quiz.title);
  const [emailCapture, setEmailCapture] = useState(!!quiz.email_capture);
  const [accent, setAccent] = useState(quiz.theme?.accent || '#8b5cf6');
  const [progressStyle, setProgressStyle] = useState(quiz.theme?.progress || 'bar');
  return (
    <div className="max-w-lg space-y-4">
      <label className="block"><span className="text-xs text-zinc-400 uppercase">Title</span>
        <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-violet-500" checked={emailCapture} onChange={(e) => setEmailCapture(e.target.checked)} />
        Email capture — require an email before showing the result (lead-gen gate)
      </label>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">Accent
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-9 h-9 bg-transparent border border-zinc-700 rounded-lg cursor-pointer" />
        </label>
        <label className="flex items-center gap-2 text-sm">Progress
          <select className={input} value={progressStyle} onChange={(e) => setProgressStyle(e.target.value)}>
            <option value="bar">Bar</option><option value="none">Hidden</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button className={btn} onClick={() => onSave({ title, email_capture: emailCapture, theme: { accent, progress: progressStyle } })}>
          <Check className="w-4 h-4" /> Save settings
        </button>
        <button className={`${btnGhost} hover:border-red-500 hover:text-red-400`} onClick={onDelete}><Trash2 className="w-4 h-4" /> Delete quiz</button>
      </div>
    </div>
  );
}

export default function Admin() {
  const [authed, setAuthed] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [open, setOpen] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg, isError) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(() => api.quizzes().then(setQuizzes).catch(() => {}), []);
  useEffect(() => { api.me().then(() => setAuthed(true)).catch(() => setAuthed(false)); }, []);
  useEffect(() => { if (authed && !open) load(); }, [authed, open, load]);

  if (authed === null) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
          <Puzzle className="w-5 h-5 text-violet-400" />
          <span className="font-semibold">Quizcraft</span>
          <div className="flex-1" />
          <button onClick={async () => { await api.logout(); setAuthed(false); }} className={iconBtn} title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {open ? (
          <QuizEditor quizId={open} onBack={() => setOpen(null)} notify={notify} />
        ) : (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quizzes.map((z) => (
                <button key={z.id} onClick={() => setOpen(z.id)}
                  className="text-left bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-5 transition-colors">
                  <p className="font-medium">{z.title}</p>
                  <p className="text-xs text-zinc-500 mt-1.5 flex items-center gap-3">
                    <span>{z.question_count} questions</span>
                    <span className="flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5" />{z.response_count} responses</span>
                    {!!z.email_capture && <span className="text-emerald-400">lead gate</span>}
                  </p>
                </button>
              ))}
            </div>
            <form className="flex gap-2 max-w-md" onSubmit={async (e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              const z = await api.createQuiz({ title: newTitle });
              setNewTitle('');
              setOpen(z.id);
            }}>
              <input className={input} placeholder="New quiz title…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <button className={btn}><Plus className="w-4 h-4" /> Create quiz</button>
            </form>
          </div>
        )}
      </main>
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm shadow-xl ${toast.isError ? 'bg-red-500/90 text-white' : 'bg-zinc-800 border border-zinc-700'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
