// The public embed loader served at /embed.js.
// Static script — contains zero user-authored content, so nothing here can
// carry stored XSS. Quiz content only ever renders inside the iframe, where
// the React runner outputs it as text nodes.
//
// Usage (inline):
//   <div data-quizcraft="PUBLIC_ID"></div>
//   <script src="https://your-host/embed.js" async></script>
//
// Usage (popup):
//   <button data-quizcraft-popup="PUBLIC_ID">Take the quiz</button>
//   <script src="https://your-host/embed.js" async></script>
module.exports = `(function () {
  'use strict';
  var script = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    for (var i = s.length - 1; i >= 0; i--) if ((s[i].src || '').indexOf('/embed.js') !== -1) return s[i];
    return null;
  })();
  if (!script) return;
  var origin = new URL(script.src, location.href).origin;
  var SAFE_ID = /^[0-9A-Za-z]{1,64}$/;

  function makeFrame(publicId, initialHeight) {
    var f = document.createElement('iframe');
    f.src = origin + '/q/' + encodeURIComponent(publicId) + '?embed=1';
    f.style.width = '100%';
    f.style.border = '0';
    f.style.height = (initialHeight || 480) + 'px';
    f.style.borderRadius = '12px';
    f.style.colorScheme = 'normal';
    f.setAttribute('title', 'Quizcraft quiz');
    f.setAttribute('allowtransparency', 'true');
    f.dataset.qcId = publicId;
    return f;
  }

  // height auto-resize via postMessage from the runner
  window.addEventListener('message', function (e) {
    if (e.origin !== origin) return;
    var d = e.data;
    if (!d || d.type !== 'quizcraft:height' || typeof d.height !== 'number') return;
    var frames = document.querySelectorAll('iframe[data-qc-id]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        frames[i].style.height = Math.max(200, Math.min(4000, d.height)) + 'px';
      }
    }
  });

  // inline embeds
  var mounts = document.querySelectorAll('[data-quizcraft]');
  for (var i = 0; i < mounts.length; i++) {
    var id = mounts[i].getAttribute('data-quizcraft');
    if (!SAFE_ID.test(id) || mounts[i].dataset.qcMounted) continue;
    mounts[i].dataset.qcMounted = '1';
    mounts[i].appendChild(makeFrame(id));
  }

  // popup triggers
  function openPopup(publicId) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:640px;max-height:90vh;overflow:auto;background:transparent;';
    var close = document.createElement('button');
    close.textContent = '\\u00d7';
    close.setAttribute('aria-label', 'Close quiz');
    close.style.cssText = 'position:absolute;top:-4px;right:0;z-index:1;background:#18181b;color:#fff;border:0;border-radius:999px;width:32px;height:32px;font-size:18px;cursor:pointer;';
    var frame = makeFrame(publicId, 520);
    box.appendChild(close);
    box.appendChild(frame);
    overlay.appendChild(box);
    function destroy() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') destroy(); }
    close.addEventListener('click', destroy);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) destroy(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-quizcraft-popup]') : null;
    if (!t) return;
    var id = t.getAttribute('data-quizcraft-popup');
    if (!SAFE_ID.test(id)) return;
    e.preventDefault();
    openPopup(id);
  });
})();
`;
