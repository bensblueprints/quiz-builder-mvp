async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),
  quizzes: () => req('/api/quizzes'),
  quiz: (id) => req(`/api/quizzes/${id}`),
  createQuiz: (body) => req('/api/quizzes', { method: 'POST', body }),
  updateQuiz: (id, body) => req(`/api/quizzes/${id}`, { method: 'PUT', body }),
  deleteQuiz: (id) => req(`/api/quizzes/${id}`, { method: 'DELETE' }),
  saveStructure: (id, body) => req(`/api/quizzes/${id}/structure`, { method: 'PUT', body }),
  responses: (id) => req(`/api/quizzes/${id}/responses`),
  stats: (id) => req(`/api/quizzes/${id}/stats`),
  // public runner
  publicQuiz: (publicId, preview) => req(`/api/public/quiz/${publicId}${preview ? '?preview=1' : ''}`),
  next: (publicId, question_id, answer) => req(`/api/public/quiz/${publicId}/next`, { method: 'POST', body: { question_id, answer } }),
  submit: (publicId, body) => req(`/api/public/quiz/${publicId}/submit`, { method: 'POST', body })
};
