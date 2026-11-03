'use strict';
/* =========================================================
   TeachersDeck for Moodle — the platform file. Sets window.TD_PLATFORM, which the shared js/app.js and js/cloud.js read
   (their "platform:" hooks) and js/moodle.js builds on. tools/build_platform.py puts this file straight after js/edition.js,
   so it runs before every other script. The suite's own TeachersDeck never loads it.

   The hosted site is opened by the local_teachersdeck plugin's deck page inside a Moodle course, in a frame:
     ?host=<the Moodle site's origin>&lang=en|vi&ed=school|uni
   Two ways in:
     - from Moodle: framed, with ?host=. js/moodle.js says hello to the plugin's bridge, gets this teacher's saved state for
       the course back, and only then loads js/app.js.
     - a preview, for the demo site and for trying it out: ?demo=1 and not framed. The same widget set on TeachersDeck's
       built-in demo data, with nothing saved anywhere but this browser.

   Storage. Inside Moodle the app's localStorage is replaced, for this page only, by an in-memory store filled from Moodle
   and saved back to Moodle on every change (js/moodle.js). So nothing about a course — roster, notes, layout — is left on
   the app's own origin, two courses open in two tabs never share one store, and the same deck follows the teacher to any
   computer. IndexedDB (uploaded files, DrawDeck boards) still lives in this browser until step 4 moves it.
   ========================================================= */
window.TD_PLATFORM = (() => {
  const BUILD = 'moodle.5';   // the platform build for local builds
  const params = new URLSearchParams(location.search);
  const appVersion = (window.DECK_EDITION && window.DECK_EDITION.version) || '0.0.0';

  let framed = false;
  try { framed = window.parent !== window; } catch (e) { framed = true; }

  // The Moodle site's origin, exactly as the plugin sent it; anything that is not a plain http(s) origin is ignored.
  const hostParam = params.get('host') || '';
  let host = null;
  try {
    const u = new URL(hostParam);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin === hostParam.replace(/\/$/, '')) host = u.origin;
  } catch (e) { host = null; }

  const preview = !framed && params.get('demo') === '1';
  const inMoodle = framed && !!host;
  const lang = params.get('lang');
  const ed = params.get('ed') === 'uni' ? 'uni' : 'school';

  // The widgets the Moodle edition shows: for now the Canvas allow-list (board and lesson tools with no student records).
  // Step 4 of the spec adds the roster-based widgets once they read Moodle's enrolments and groups.
  const MOODLE_WIDGETS = [
    'clock', 'timer', 'stopwatch', 'countdown', 'traffic', 'scoreboard', 'noise',
    'instructions', 'dice', 'checklist', 'qrcode', 'agenda', 'namepicker', 'hallpass', 'calendar',
    'drawdeck', 'poll', 'groupmaker', 'games', 'grammarref', 'idiomday', 'convocards', 'ttsreader', 'music', 'videoplayer',
    'files',
  ];

  // The in-memory localStorage (see the header). Installed before any other script can read storage.
  const store = (() => {
    if (!inMoodle) return null;
    const mem = new Map();
    const listeners = [];
    const changed = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* a listener's own problem */ } });
    const api = {
      getItem(k) { k = String(k); return mem.has(k) ? mem.get(k) : null; },
      setItem(k, v) { k = String(k); v = String(v); if (mem.get(k) !== v) { mem.set(k, v); changed(); } },
      removeItem(k) { k = String(k); if (mem.delete(k)) changed(); },
      clear() { if (mem.size) { mem.clear(); changed(); } },
      key(i) { return Array.from(mem.keys())[i] ?? null; },
      get length() { return mem.size; },
    };
    try {
      Object.defineProperty(window, 'localStorage', { configurable: true, enumerable: true, get() { return api; } });
    } catch (e) {
      return null;   // the browser refused: js/moodle.js says the deck cannot run here
    }
    return {
      api,
      // Fill from Moodle without counting as a change.
      load(obj) { mem.clear(); Object.keys(obj || {}).forEach((k) => { if (typeof obj[k] === 'string') mem.set(k, obj[k]); }); },
      snapshot() { return Object.fromEntries(mem); },
      onChange(fn) { listeners.push(fn); },
    };
  })();

  const api = {
    id: 'moodle',
    name: 'TeachersDeck for Moodle',
    build: BUILD,
    version: `${appVersion}-${BUILD}`,
    lang: (lang === 'vi' || lang === 'en') ? lang : null,
    edition: ed,                    // school or uni; LectureDeck wording and widgets arrive with step 5
    host,                           // the Moodle origin js/moodle.js talks to, or null
    inMoodle,
    preview,
    store,                          // the in-memory storage inside Moodle, or null
    launch: null,                   // set by js/moodle.js from the bridge's welcome
    fixedWidgets: true,             // app.js: the allow-list IS the curation
    deferInit: false,               // app.js runs init() itself: js/moodle.js only loads it once the state is in place
    hides(widgetId) { return !MOODLE_WIDGETS.includes(widgetId); },
    presetFor() { return null; },
  };

  document.documentElement.classList.add('ed-moodle');
  return api;
})();
