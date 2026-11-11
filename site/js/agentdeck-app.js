'use strict';
/* AgentDeck in the app: the floating help button (scope "AgentDeck in every app", 11 Nov 2026, wave 1).

   The same file in TeachersDeck, AdminDeck and ParentDeck (tools/check_shared.py keeps them identical; TeachersDeck's
   copy is the one to edit). It loads js/agentdeck.js, AgentDeck's own widget copied unchanged from teachersdeck/agentdeck
   (widget/agentdeck.js, with its poses in js/agentdeckie/), in its in-app mode, and connects it to the app:
   - which app and version (js/edition.js), and where it runs (Chrome extension, web app, demo);
   - with each question only: the widget in front (its id, never its contents), whether Pro is on, the app's language;
   - keeps the button clear of the bottom and side docks, and hides it while something fills the screen;
   - Settings → "Show the help button (AgentDeck)", kept on this device.
   Not loaded in the ClassIn, Canvas and Moodle builds (window.TD_PLATFORM): those come in a later wave.
   myteachersdeck.com/backend.json "agentInApp": false hides it in every app without a release. */
(function () {
  if (window.TD_PLATFORM || window.__agentDeckApp) return;
  window.__agentDeckApp = true;
  const ED = window.DECK_EDITION || {};
  const ENABLED_KEY = 'agentdeck_enabled';
  const vi = () => (document.documentElement.lang || '').slice(0, 2) === 'vi';
  const L = {
    label: { en: 'Show the help button (AgentDeck, AI)', vi: 'Hiện nút trợ giúp (AgentDeck, AI)' },
    hint: {
      en: 'Ask how to do something, or report a problem to the team. Only the app, its version and the widget in front are sent with a question, never your classes.',
      vi: 'Hỏi cách làm, hoặc báo lỗi cho đội ngũ. Mỗi câu hỏi chỉ gửi kèm tên ứng dụng, phiên bản và widget đang mở, không bao giờ gửi dữ liệu lớp học.',
    },
  };
  const tr = (k) => L[k][vi() ? 'vi' : 'en'];
  const enabled = () => { try { return localStorage.getItem(ENABLED_KEY) !== '0'; } catch (e) { return true; } };

  const isExtension = !!(window.chrome && chrome.runtime && chrome.runtime.id);
  const platform = isExtension ? 'extension' : /(^|\.)github\.io$/.test(location.hostname) || /[?&]demo=1\b/.test(location.search) ? 'demo' : 'web';
  const here = document.currentScript && document.currentScript.src;

  // The widget asks for this with every question. Only these fields leave the app.
  window.AgentDeckContext = function () {
    let pro = false;
    try { pro = typeof isPro === 'function' && isPro() === true; } catch (e) {}   // eslint-disable-line no-undef
    return { widget: frontWidget(), pro, lang: vi() ? 'vi' : 'en' };
  };
  function shown(el) {
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 ? null : r;
  }
  function frontWidget() {
    let best = null, z = -Infinity;
    document.querySelectorAll('.widget[data-wid]').forEach((el) => {
      if (el.classList.contains('minimized') || !shown(el)) return;
      const zi = parseInt(getComputedStyle(el).zIndex, 10) || 0;
      if (zi >= z) { z = zi; best = el; }
    });
    const id = best && best.dataset.wid;
    return id && /^[a-z0-9_-]{1,30}$/.test(id) ? id : '';
  }

  // Keep clear of the docks; hide while the screen is being shown or drawn on: browser full screen, a document on the
  // stage, a tile opened over the whole screen (⤢), DrawDeck. Other full-page widgets (AdminDeck's School Stats, Student
  // Stats) are the app's own pages, so the button stays there.
  const COVERS = '.doc-stage, .widget.bento-open, .widget.dd-widget:not(.minimized)';
  let last = '';
  function sync() {
    const AD = window.AgentDeck;
    if (!AD || !AD.setInsets) return;
    const host = document.getElementById('agentdeck');
    const side = host && host.getAttribute('data-side') === 'left' ? 'left' : 'right';
    // A side dock only pushes the button inwards when it is beside the button (same height); then the bottom dock lifts
    // it when the button would sit over any part of it.
    let y = 0;
    try { y = Math.max(0, +(JSON.parse(localStorage.getItem('agentdeck_place') || '{}').y) || 0); } catch (e) {}
    const fabBottom = innerHeight - 18 - y, fabTop = fabBottom - 44;
    const sd = shown(document.getElementById(side === 'right' ? 'dock-right' : 'dock-left'));
    const besideFab = sd && sd.top < fabBottom && sd.bottom > fabTop;
    const sideInset = besideFab ? (side === 'right' ? (sd.right > innerWidth - 40 ? innerWidth - sd.left : 0) : (sd.left < 40 ? sd.right : 0)) : 0;
    const fabL = side === 'right' ? innerWidth - 18 - sideInset - 44 : 18 + sideInset, fabR = fabL + 44;
    const dock = shown(document.getElementById('dock-wrap'));
    const bottom = dock && dock.bottom > innerHeight - 40 && dock.left < fabR + 8 && dock.right > fabL - 8 ? Math.max(0, innerHeight - dock.top) : 0;
    addSetting();   // ParentDeck's Settings is a widget, built when it opens
    let hide = !!document.fullscreenElement;
    if (!hide) hide = [...document.querySelectorAll(COVERS)].some((el) => !!shown(el));
    const key = [Math.round(bottom), Math.round(sideInset), hide].join();
    if (key === last) return;
    last = key;
    AD.setInsets({ bottom: Math.round(bottom), side: Math.round(sideInset) });
    AD.setHidden(hide);
  }

  // Settings → the switch. TeachersDeck and AdminDeck: the settings drawer, under the usage-statistics switch (or at its
  // end). ParentDeck: its Settings widget, after "Reset widget layout".
  function addSetting() {
    if (document.getElementById('agentdeck-toggle')) return;
    const drawer = document.querySelector('#settings-drawer .drawer-body') || document.getElementById('settings-drawer');
    const pdReset = !drawer && document.getElementById('st-reset');
    const pdRow = pdReset && pdReset.closest('.settings-row');
    if (!drawer && !pdRow) return;
    const row = document.createElement('label');
    row.className = pdRow ? 'settings-row' : 'switch-row';
    row.innerHTML = '<span id="agentdeck-toggle-label"></span><input type="checkbox" id="agentdeck-toggle">';
    const hint = document.createElement('p');
    hint.className = pdRow ? 'muted' : 'dock-vis-hint'; hint.id = 'agentdeck-toggle-hint';
    const anchor = document.getElementById('usage-stats-toggle');
    const after = pdRow || (anchor && anchor.closest('label'));
    if (after && after.parentNode) { after.parentNode.insertBefore(hint, after.nextSibling); after.parentNode.insertBefore(row, hint); }
    else { drawer.appendChild(row); drawer.appendChild(hint); }
    const box = row.querySelector('input');
    box.checked = enabled();
    box.addEventListener('change', () => {
      try { localStorage.setItem(ENABLED_KEY, box.checked ? '1' : '0'); } catch (e) {}
      if (window.AgentDeck && window.AgentDeck.setEnabled) window.AgentDeck.setEnabled(box.checked);
    });
    label();
  }
  function label() {
    const l = document.getElementById('agentdeck-toggle-label'), h = document.getElementById('agentdeck-toggle-hint');
    if (l) l.textContent = tr('label');
    if (h) h.textContent = tr('hint');
  }

  function start() {
    const s = document.createElement('script');
    s.src = here ? new URL('agentdeck.js', here).href : 'js/agentdeck.js';
    s.defer = true;
    // The widget reads myteachersdeck.com/backend.json for the current address (lights-on server, or Google when billing is
    // back). A local AgentDeck dev server can be tried with localStorage.agentdeck_endpoint = 'http://localhost:8787/agentChat'.
    let ep = 'https://teachersdeck-lights-on.onrender.com/agentChat';
    try { const o = localStorage.getItem('agentdeck_endpoint'); if (/^http:\/\/(localhost|127\.0\.0\.1):\d+\/agentChat$/.test(o || '')) ep = o; } catch (e) {}
    s.setAttribute('data-endpoint', ep);
    s.setAttribute('data-mode', 'app');
    s.setAttribute('data-app', String(ED.name || 'TeachersDeck'));
    s.setAttribute('data-version', String(ED.version || ''));
    s.setAttribute('data-platform', platform);
    s.setAttribute('data-icon', 'spark');
    s.setAttribute('data-lang', vi() ? 'vi' : 'en');
    s.onload = () => {
      const AD = window.AgentDeck;
      if (!AD || !AD.setTheme) return;
      AD.setTheme({ accent: 'var(--amber)', onAccent: 'var(--ink-0)', surface: 'var(--ink-1)', text: 'var(--text-hi)', muted: 'var(--text-lo)', line: 'var(--line)', bg: 'var(--ink-0)' });
      AD.setEnabled(enabled());
      sync();
      setInterval(sync, 700);
      addEventListener('resize', sync);
      document.addEventListener('fullscreenchange', sync);
    };
    document.body.appendChild(s);
    addSetting();
    new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
