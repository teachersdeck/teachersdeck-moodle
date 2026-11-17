/* =========================================================
   TDBackend — where the server functions live
   ---------------------------------------------------------
   The same functions run in two places (HQ repo, docs/LIGHTS-ON.md): Google's Cloud Functions and the lights-on server
   on Render. The address is NOT built into each call: it comes from https://myteachersdeck.com/backend.json
   ({ "active": "google"|"render", "functions": "<base address>" }), which the failover watch switches by itself, so
   moving between the two needs no app release. Web apps and the extensions (zip, unpacked and Web Store) load this file.

   Until backend.json answers, the app uses the last address it saw (localStorage), else DEFAULT below. Calls made
   through TDBackend.functions() wait for that answer first (at most WAIT_MS), so the first call after a switch already
   goes to the right side. Only the addresses in ALLOWED can be used: a changed backend.json can never send sign-in
   tokens anywhere else. Google's address is allowed with or without js/firebase-config.js on the page (AdminDeck,
   CampusDeck and KinderDeck have none), and is never written out here, so demo copies never name the live project.

     TDBackend.functions()   in place of firebase.functions(): httpsCallable(name) goes to the current address
     TDBackend.url(name)     https://<current address>/<name>, for plain HTTP functions (await TDBackend.ready first)
     TDBackend.base()        the current address; TDBackend.ready resolves once backend.json was read (or failed/timed out)

   One file in every app, kept identical by tools/check_shared.py: teachersdeck/js/backend.js is the one to edit.
   Load it after the Firebase scripts and before the app's cloud code.
   ========================================================= */
(function (root) {
  'use strict';
  // Google's own address for this app's project (js/firebase-config.js), so demo copies never name the live project.
  var PROJECT = (root.FIREBASE_CONFIG && root.FIREBASE_CONFIG.projectId) || '';
  var GOOGLE = PROJECT ? 'https://us-central1-' + PROJECT + '.cloudfunctions.net' : '';
  var DEFAULT = 'https://teachersdeck-lights-on.onrender.com';
  var CONFIG_URL = 'https://myteachersdeck.com/backend.json';
  var KEY = 'td_backend_base';
  var WAIT_MS = 4000;
  var ALLOWED = /^https:\/\/(us-central1-teachersdeck-[a-z0-9-]+\.cloudfunctions\.net|teachersdeck-[a-z0-9-]+\.onrender\.com|teachersdeck-[a-z0-9-]+\.netlify\.app|[a-z0-9-]+\.myteachersdeck\.com)$/;
  var ok = function (u) { return typeof u === 'string' && (u === GOOGLE && !!GOOGLE || ALLOWED.test(u)); };

  var base = DEFAULT;
  try { var saved = root.localStorage.getItem(KEY); if (ok(saved)) base = saved; } catch (e) {}

  var read = (typeof root.fetch === 'function' ? root.fetch(CONFIG_URL, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var u = j && j.functions;
      if (ok(u)) { base = u; try { root.localStorage.setItem(KEY, u); } catch (e) {} }
      return base;
    })
    .catch(function () { return base; }) : Promise.resolve(base));
  // A slow or unreachable myteachersdeck.com never holds the app up for long: after WAIT_MS it goes on with what it has.
  var ready = Promise.race([read, new Promise(function (res) { setTimeout(function () { res(base); }, WAIT_MS); })]);

  root.TDBackend = {
    GOOGLE: GOOGLE, DEFAULT: DEFAULT, CONFIG_URL: CONFIG_URL, allowed: ok,
    base: function () { return base; },
    ready: ready,
    url: function (name) { return base + '/' + name; },
    // A stand-in for firebase.functions(): each call waits for backend.json, then uses the address current at that moment.
    functions: function () {
      return {
        httpsCallable: function (name, opts) {
          return function (data) {
            return ready.then(function () { return root.firebase.app().functions(base).httpsCallable(name, opts)(data); });
          };
        }
      };
    }
  };
})(window);
