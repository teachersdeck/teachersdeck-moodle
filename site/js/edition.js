'use strict';
/* TeachersDeck's edition file — the first script on the page. It says which app this is; js/app.js reads it.

   js/app.js and the other shared files are one file in two apps: TeachersDeck here, and LectureDeck in the UniDeck repository
   (teachersdeck/unideck), which copies them unchanged with its tools/sync_shared.py. What differs between the two apps
   lives in each app's own edition file, index.html, manifest.json, demo.js and README — never in the shared files.

   The version lives here (tools/release.py checks it against manifest.json, index.html and the README). */
window.DECK_EDITION = Object.freeze({
  name: 'TeachersDeck',
  version: '0.33.0',
  uni: false                  // the school edition; UniDeck's copy says true
});
