/* =========================================================
   DrivePick — "Google Drive" in the Files widget.
   Shared by TeachersDeck, StudentDeck and AdminDeck: identical copies, kept identical by tools/check_shared.py (edit
   TeachersDeck's, copy to the others). LectureDeck, UniStudentDeck, TinyTeachersDeck and KinderDeck get it by their syncs.

   Opens https://teacher.myteachersdeck.com/drive-picker.html (webapp/drive-picker.html in the suite repository) in a
   small window: the person signs in to Google there and picks files with Google's own Picker. That page sends back only
   the ids, names and types of the files picked (never a token); DrivePick turns each into an ordinary Google link, which
   the Files widget saves and shows full screen like a pasted link (Google's viewer, with the browser's own Google sign-in).

     DrivePick.available()           false where the picker page won't answer (the demo site, the platform builds)
     DrivePick.pick(lang)            -> Promise of [{ name, url, gtype }]; [] if the window was closed or cancelled.
                                       Call it inside the click: browsers only open the window for a click.
                                       Rejects with Error('popup_blocked') when the window couldn't open.
   ========================================================= */
(function (root) {
  'use strict';
  var ORIGIN = 'https://teacher.myteachersdeck.com';
  var PAGE = ORIGIN + '/drive-picker.html';
  var GTYPE = {
    'application/vnd.google-apps.document': 'document',
    'application/vnd.google-apps.presentation': 'presentation',
    'application/vnd.google-apps.spreadsheet': 'spreadsheets'
  };
  var ID = /^[A-Za-z0-9_-]+$/;

  // A picked file as the Google link the Files widget already understands (its parseGoogleLink): Docs, Slides and
  // Sheets open in their own viewer, everything else (PDF, Word, pictures…) in Drive's.
  function toLink(f) {
    if (!f || !ID.test(String(f.id || ''))) return null;
    var g = GTYPE[f.mimeType];
    var url = g ? 'https://docs.google.com/' + g + '/d/' + f.id + '/edit' : 'https://drive.google.com/file/d/' + f.id + '/view';
    return { name: String(f.name || '').slice(0, 200) || 'Google Drive', url: url, gtype: g || 'drive' };
  }

  // The picker page answers only these (the same rule as in drive-picker.html), so the button shows only here: not on
  // the platform builds (ClassIn, Canvas, Moodle on github.io) or other hosts.
  var OK_FROM = /^(chrome-extension:\/\/[a-p]{32}|https:\/\/([a-z0-9-]+\.)*myteachersdeck\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
  function available() { return typeof root.open === 'function' && OK_FROM.test(root.location.origin); }

  function pick(lang) {
    var w = root.open(PAGE + '?from=' + encodeURIComponent(root.location.origin) + '&lang=' + (lang === 'vi' ? 'vi' : 'en'),
      'td-drive-picker', 'popup,width=960,height=680');
    if (!w) return Promise.reject(new Error('popup_blocked'));
    try { w.focus(); } catch (e) { /* not ours to focus */ }
    return new Promise(function (resolve) {
      var finished = false;
      function finish(files) {
        if (finished) return; finished = true;
        root.removeEventListener('message', onMsg); clearInterval(poll);
        resolve(files);
      }
      function onMsg(e) {
        if (e.origin !== ORIGIN || e.source !== w || !e.data || e.data.type !== 'td-drive') return;
        finish((Array.isArray(e.data.files) ? e.data.files : []).map(toLink).filter(Boolean));
      }
      root.addEventListener('message', onMsg);
      var poll = setInterval(function () { if (w.closed) finish([]); }, 600);
    });
  }

  root.DrivePick = { available: available, pick: pick, toLink: toLink, PAGE: PAGE };
})(window);
