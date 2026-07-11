import React from 'react';
import Runner from './components/Runner.jsx';
import Admin from './components/Admin.jsx';

export default function App() {
  // Public runner: /q/:publicId (used directly, in iframes, and in popups).
  const m = window.location.pathname.match(/^\/q\/([0-9A-Za-z]{1,64})$/);
  if (m) return <Runner publicId={m[1]} />;
  return <Admin />;
}
