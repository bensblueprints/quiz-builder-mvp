import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronRight, Mail } from 'lucide-react';
import { api } from '../api.js';

// The public quiz runner. SECURITY NOTE: every piece of user-authored quiz
// content (titles, question text, option labels, result names/descriptions)
// is rendered exclusively through React text nodes ({value} interpolation) —
// never dangerouslySetInnerHTML — so stored XSS is structurally impossible.

export default function Runner({ publicId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [currentId, setCurrentId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [textDraft, setTextDraft] = useState('');
  const [phase, setPhase] = useState('quiz'); // quiz | email | done
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef(null);

  const embedded = new URLSearchParams(window.location.search).get('embed') === '1';

  useEffect(() => {
    api.publicQuiz(publicId)
      .then((d) => {
        setData(d);
        const first = [...d.questions].sort((a, b) => a.order - b.order)[0];
        setCurrentId(first ? first.id : null);
        if (!first) setPhase(d.quiz.email_capture ? 'email' : 'done');
      })
      .catch((e) => setError(e.status === 404 ? 'Quiz not found.' : e.message));
  }, [publicId]);

  // iframe height auto-resize via postMessage (embed.js listens)
  useEffect(() => {
    if (!embedded || !rootRef.current) return;
    const send = () => {
      const h = rootRef.current ? rootRef.current.scrollHeight + 24 : 480;
      window.parent.postMessage({ type: 'quizcraft:height', height: h }, '*');
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(rootRef.current);
    return () => ro.disconnect();
  });

  if (error) return <Center><p className="text-zinc-400">{error}</p></Center>;
  if (!data) return <Center><p className="text-zinc-600">Loading…</p></Center>;

  const theme = data.quiz.theme || {};
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(theme.accent || '') ? theme.accent : '#8b5cf6';
  const questions = [...data.questions].sort((a, b) => a.order - b.order);
  const q = questions.find((x) => x.id === currentId);
  const answeredCount = Object.keys(answers).length + (q && answers[q.id] === undefined ? 0 : 0);
  const progress = questions.length
    ? Math.min(100, Math.round((answeredCount / questions.length) * 100))
    : 0;

  const finish = async (finalAnswers, withEmail) => {
    setBusy(true);
    setEmailErr('');
    try {
      const r = await api.submit(publicId, { answers: finalAnswers, email: withEmail || undefined });
      setOutcome(r);
      setPhase('done');
    } catch (e) {
      if (e.data?.error === 'email_required' || e.data?.error === 'invalid_email') {
        setPhase('email');
        if (e.data.error === 'invalid_email') setEmailErr('That email doesn’t look right.');
      } else setError(e.message);
    } finally { setBusy(false); }
  };

  const advance = async (answer) => {
    const nextAnswers = { ...answers, [q.id]: answer };
    setAnswers(nextAnswers);
    setTextDraft('');
    setBusy(true);
    try {
      const { next_question_id } = await api.next(publicId, q.id, answer);
      if (next_question_id != null && questions.some((x) => x.id === next_question_id)) {
        setCurrentId(next_question_id);
        setBusy(false);
      } else if (data.quiz.email_capture) {
        setPhase('email');
        setBusy(false);
      } else {
        await finish(nextAnswers);
      }
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div ref={rootRef} className={embedded ? 'p-4' : 'min-h-screen grid place-items-center p-6'}>
      <div className="w-full max-w-xl mx-auto">
        {/* progress bar */}
        {phase === 'quiz' && (theme.progress !== 'none') && (
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-6">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: accent }} />
          </div>
        )}
        <AnimatePresence mode="wait">
          {phase === 'quiz' && q && (
            <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-7">
              <p className="text-xs text-zinc-500 mb-2">{data.quiz.title}</p>
              <h2 className="text-lg font-semibold leading-snug">{q.text}</h2>
              <div className="mt-5 space-y-2">
                {(q.type === 'multiple') && q.options.map((o) => (
                  <button key={o.id} disabled={busy} onClick={() => advance(o.id)}
                    className="w-full text-left bg-zinc-950 border border-zinc-800 hover:border-zinc-500 rounded-xl px-4 py-3 text-sm transition-colors disabled:opacity-50">
                    {o.label}
                  </button>
                ))}
                {q.type === 'image' && (
                  <div className="grid grid-cols-2 gap-3">
                    {q.options.map((o) => (
                      <button key={o.id} disabled={busy} onClick={() => advance(o.id)}
                        className="bg-zinc-950 border border-zinc-800 hover:border-zinc-500 rounded-xl p-3 transition-colors disabled:opacity-50">
                        {o.image_url && <img src={o.image_url} alt="" className="w-full aspect-video object-cover rounded-lg mb-2" />}
                        <span className="text-sm">{o.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'rating' && (
                  <div className="flex gap-2 justify-center py-2">
                    {Array.from({ length: q.options.max || 5 }, (_, i) => (
                      <button key={i} disabled={busy} onClick={() => advance(i + 1)}
                        className="p-1.5 text-zinc-600 hover:text-amber-400 transition-colors disabled:opacity-50"
                        aria-label={`${i + 1}`}>
                        <Star className="w-8 h-8" />
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'text' && (
                  <form onSubmit={(e) => { e.preventDefault(); if (textDraft.trim()) advance(textDraft.trim()); }} className="space-y-3">
                    <textarea autoFocus value={textDraft} onChange={(e) => setTextDraft(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm min-h-24 focus:outline-none"
                      style={{ borderColor: textDraft ? accent : undefined }}
                      placeholder="Type your answer…" />
                    <button disabled={busy || !textDraft.trim()}
                      className="inline-flex items-center gap-1.5 text-sm font-medium rounded-xl px-5 py-2.5 text-zinc-950 disabled:opacity-40"
                      style={{ background: accent }}>
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}

          {phase === 'email' && (
            <motion.form key="email" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              onSubmit={(e) => { e.preventDefault(); finish(answers, email); }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-7 space-y-4">
              <h2 className="text-lg font-semibold">Almost there!</h2>
              <p className="text-sm text-zinc-400">Enter your email to see your result.</p>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none"
                  placeholder="you@email.com" />
              </div>
              {emailErr && <p className="text-sm text-red-400">{emailErr}</p>}
              <button disabled={busy} className="w-full text-sm font-medium rounded-xl px-5 py-3 text-zinc-950 disabled:opacity-40" style={{ background: accent }}>
                Show my result
              </button>
            </motion.form>
          )}

          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center space-y-3">
              <div className="text-4xl">🎉</div>
              {outcome?.result ? (
                <>
                  <p className="text-sm text-zinc-500">Your result</p>
                  <h2 className="text-2xl font-semibold" style={{ color: accent }}>{outcome.result.name}</h2>
                  {outcome.result.description && <p className="text-sm text-zinc-300 whitespace-pre-wrap">{outcome.result.description}</p>}
                </>
              ) : (
                <h2 className="text-xl font-semibold">Thanks for taking the quiz!</h2>
              )}
              {outcome && <p className="text-xs text-zinc-500">Score: {outcome.score} points</p>}
            </motion.div>
          )}
        </AnimatePresence>
        {!embedded && <p className="text-center text-[11px] text-zinc-700 mt-6">Powered by Quizcraft</p>}
      </div>
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen grid place-items-center p-6">{children}</div>;
}
