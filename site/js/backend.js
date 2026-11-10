/* =========================================================
   TDBackend — where the server functions live
   ---------------------------------------------------------
   Since 10 Nov 2026 the Firebase project has no billing, so Google's Cloud Functions are off; the same functions
   run on the lights-on server (HQ repo, server/; docs/LIGHTS-ON.md there). The address is NOT built into each
   call any more: it comes from https://myteachersdeck.com/backend.json ({ "functions": "<base address>" }), so
   moving the server (or going back to Google when billing returns) is one edit to that file, with no app release.

   Until backend.json answers, the app uses the last address it saw (localStorage), else DEFAULT below.
   Only the addresses in ALLOWED can be used: a changed backend.json can never send sign-in tokens anywhere else.

     TDBackend.functions()   in place of firebase.functions(): httpsCallable(name) goes to the current address
     TDBackend.url(name)     https://<current address>/<name>, for plain HTTP functions
     TDBackend.base()        the current address; TDBackend.ready resolves once backend.json was read (or failed)

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
  var ALLOWED = /^https:\/\/(teachersdeck-[a-z0-9-]+\.onrender\.com|teachersdeck-[a-z0-9-]+\.netlify\.app|[a-z0-9-]+\.myteachersdeck\.com)$/;
  var ok = function (u) { return typeof u === 'string' && (u === GOOGLE && !!GOOGLE || ALLOWED.test(u)); };

  var base = DEFAULT;
  try { var saved = root.localStorage.getItem(KEY); if (ok(saved)) base = saved; } catch (e) {}

  var ready = (typeof root.fetch === 'function' ? root.fetch(CONFIG_URL, { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      var u = j && j.functions;
      if (ok(u)) { base = u; try { root.localStorage.setItem(KEY, u); } catch (e) {} }
      return base;
    })
    .catch(function () { return base; }) : Promise.resolve(base));

  root.TDBackend = {
    GOOGLE: GOOGLE, DEFAULT: DEFAULT, CONFIG_URL: CONFIG_URL, allowed: ok,
    base: function () { return base; },
    ready: ready,
    url: function (name) { return base + '/' + name; },
    // A stand-in for firebase.functions(): each call picks the address current at that moment.
    functions: function () {
      return {
        httpsCallable: function (name, opts) {
          return function (data) { return root.firebase.app().functions(base).httpsCallable(name, opts)(data); };
        }
      };
    }
  };
})(window);
