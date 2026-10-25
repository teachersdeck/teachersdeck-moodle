'use strict';
/* =========================================================
   TeachersDeck for Moodle — the launch and the save loop. tools/build_platform.py puts this file where index.html loads
   js/app.js, and takes js/app.js and js/update.js out of the page: this file loads them itself, once the teacher's saved
   state for the course has arrived from Moodle, because app.js reads storage the moment it runs.

   Talks only to the Moodle origin js/platform.js read from ?host=, and only accepts messages from the parent window at
   that origin. Protocol 1 (the plugin's amd/src/bridge.js):
     -> {td:'hello', proto:1}               <- {td:'welcome', proto:1, launch, state} | {td:'welcome', error}
     -> {td:'save', id, state}              <- {td:'saved', id, ok, time?, error?}
   ========================================================= */
(() => {
  const P = window.TD_PLATFORM;
  if (!(P && P.id === 'moodle')) return;

  const PROTO = 1;
  const SAVE_DELAY_MS = 800;        // a burst of changes (dragging a widget) becomes one save
  const WELCOME_TIMEOUT_MS = 10000;
  const stamp = (() => {
    try { return new URL(document.currentScript.src).searchParams.get('v') || ''; } catch (e) { return ''; }
  })();

  const MSG = {
    notInMoodle: { en: 'This page only opens from inside a Moodle course.', vi: 'Trang này chỉ mở được từ trong một khóa học Moodle.' },
    noStorage: { en: 'This browser blocked the deck. Try another browser, or ask your Moodle administrator.', vi: 'Trình duyệt này đã chặn bộ công cụ. Hãy thử trình duyệt khác, hoặc hỏi quản trị viên Moodle.' },
    noAnswer: { en: "Moodle didn't answer. Reload the page; if it keeps happening, ask your Moodle administrator to update the TeachersDeck plugin.", vi: 'Moodle không phản hồi. Hãy tải lại trang; nếu vẫn xảy ra, hãy nhờ quản trị viên Moodle cập nhật plugin TeachersDeck.' },
    loadFailed: { en: "Your deck couldn't be loaded from Moodle. Reload the page to try again.", vi: 'Không tải được bộ công cụ từ Moodle. Hãy tải lại trang để thử lại.' },
    proto: { en: 'Ask your Moodle administrator to update the TeachersDeck plugin.', vi: 'Hãy nhờ quản trị viên Moodle cập nhật plugin TeachersDeck.' },
    saveFailed: { en: "Changes aren't being saved to Moodle. Check your connection; they will be saved when it's back.", vi: 'Thay đổi chưa được lưu vào Moodle. Hãy kiểm tra kết nối; thay đổi sẽ được lưu khi có mạng lại.' },
  };
  const msg = (key) => (MSG[key] || {})[P.lang === 'vi' ? 'vi' : 'en'] || key;

  function showPlaceholder(text) {
    const el = document.createElement('div');
    el.id = 'td-moodle-placeholder';
    el.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;'
      + 'padding:2rem;font:16px/1.5 system-ui,sans-serif;text-align:center;color:#333;background:#f4f6fa';
    const p = document.createElement('p');
    p.style.maxWidth = '440px';
    p.textContent = text;
    el.appendChild(p);
    document.body.appendChild(el);
  }

  // A quiet strip at the bottom while saves are failing; gone once one succeeds.
  let banner = null;
  function showSaveProblem(on) {
    if (on && !banner) {
      banner = document.createElement('div');
      banner.id = 'td-moodle-savebanner';
      banner.setAttribute('role', 'status');
      banner.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:999998;max-width:90vw;'
        + 'padding:8px 14px;border-radius:8px;font:14px/1.4 system-ui,sans-serif;background:#fff3cd;color:#664d03;box-shadow:0 2px 8px rgba(0,0,0,.15)';
      banner.textContent = msg('saveFailed');
      document.body.appendChild(banner);
    } else if (!on && banner) {
      banner.remove();
      banner = null;
    }
  }

  // Load the app's own scripts, in order, after the state is in place.
  function loadApp() {
    const files = ['js/app.js', 'js/update.js'];
    const next = () => {
      const f = files.shift();
      if (!f) return;
      const s = document.createElement('script');
      s.src = f + (stamp ? '?v=' + encodeURIComponent(stamp) : '');
      s.async = false;
      s.onload = next;
      s.onerror = next;
      document.body.appendChild(s);
    };
    next();
  }

  if (P.preview) { loadApp(); return; }
  if (!P.inMoodle) { showPlaceholder(msg('notInMoodle')); return; }
  if (!P.store) { showPlaceholder(msg('noStorage')); return; }

  const send = (m) => window.parent.postMessage(m, P.host);

  // ---- The save loop: every change to storage, debounced, sends the whole store (it is small: layout and settings).
  let saveId = 0, timer = null, inFlight = 0, failing = false, started = false;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    saveId += 1;
    inFlight = saveId;
    send({ td: 'save', id: saveId, state: P.store.snapshot() });
  }
  function scheduleSave(delay) {
    if (!started) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delay);
  }
  P.store.onChange(() => scheduleSave(SAVE_DELAY_MS));
  // Leaving or reloading (the in-app update reloads this page): send what is pending now. The parent stays, so the save
  // still completes, and the bridge answers the next hello only after it.
  window.addEventListener('pagehide', () => { if (timer) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) flush(); });

  // ---- The launch.
  let welcomed = false;
  const welcomeTimer = setTimeout(() => { if (!welcomed) showPlaceholder(msg('noAnswer')); }, WELCOME_TIMEOUT_MS);

  window.addEventListener('message', (event) => {
    if (event.origin !== P.host || event.source !== window.parent) return;
    const m = event.data;
    if (!m || typeof m !== 'object' || typeof m.td !== 'string') return;

    if (m.td === 'welcome' && !welcomed) {
      welcomed = true;
      clearTimeout(welcomeTimer);
      if (m.error) { showPlaceholder(msg(m.error === 'proto' ? 'proto' : 'loadFailed')); return; }
      P.launch = m.launch || null;
      if (m.launch && (m.launch.lang === 'vi' || m.launch.lang === 'en')) P.lang = m.launch.lang;
      P.store.load(m.state && typeof m.state === 'object' ? m.state : {});
      started = true;
      loadApp();
      return;
    }
    if (m.td === 'saved') {
      if (m.ok) {
        if (failing) { failing = false; showSaveProblem(false); }
      } else if (m.id === inFlight) {
        failing = true;
        showSaveProblem(true);
        scheduleSave(5000);   // try again; the next change also retries
      }
    }
  });

  send({ td: 'hello', proto: PROTO });
})();
