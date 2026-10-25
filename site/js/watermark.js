/* =========================================================
   Watermark — traces an exported file back to who made it.
   Shared by TeachersDeck, ParentDeck and AdminDeck: identical copies, kept
   identical by tools/check_shared.py (edit TeachersDeck's, copy to the others).

   Every export gets a 6-character token derived from WHO made it:
     TeachersDeck  "<licence key or UNLICENSED>::<device id>"   (the same token Lesson Planner exports always had)
     ParentDeck    "PD::<ParentDeck key or free>::<account id>"
     AdminDeck     "AD::<school id>"   ("AD::owner" for the platform owner across all schools)
   The token is hidden in exported text as invisible characters (they survive copy and paste into email, Word and
   spreadsheets), and printed pages carry it as a small visible "ref" line. AdminDeck Key Manager → Trace a watermark
   reads a pasted token OR a pasted piece of leaked text and finds the licence behind it.
   The token is a one-way hash: it reveals nothing by itself.
   ========================================================= */
(function (root) {
  'use strict';
  var SALT = 'teachersdeck-watermark-2026';
  var BITS = ['\u200B', '\u200C', '\u200D', '\u2060'];   // zero-width space, non-joiner, joiner, word joiner: 2 bits each
  var START = '\u2062', END = '\u2063';                     // invisible times / invisible separator
  function hash(str) {
    var s = SALT + str, h = 0;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  }
  function encode(token) {
    var out = START;
    for (var i = 0; i < token.length; i++) { var v = parseInt(token[i], 36); out += BITS[(v >> 4) & 3] + BITS[(v >> 2) & 3] + BITS[v & 3]; }
    return out + END;
  }
  function decode(text) {
    var m = String(text || '').match(/\u2062([\u200B\u200C\u200D\u2060]{18})\u2063/);
    if (!m) return null;
    var t = '';
    for (var i = 0; i < 18; i += 3) { var v = (BITS.indexOf(m[1][i]) << 4) | (BITS.indexOf(m[1][i + 1]) << 2) | BITS.indexOf(m[1][i + 2]); t += v.toString(36).toUpperCase(); }
    return t;
  }
  var STRIP = /[\u200B\u200C\u200D\u2060\u2062\u2063]/g;
  var W = {
    identity: function () { return 'unknown'; },
    hash: hash, encode: encode, decode: decode,
    configure: function (o) { Object.keys(o || {}).forEach(function (k) { W[k] = o[k]; }); return W; },
    token: function () { try { return hash(String(W.identity())); } catch (e) { return hash('unknown'); } },
    /** Text, CSV, TSV, HTML: hides the token at the end of the first line (CSV: inside the first header cell's text). */
    stamp: function (text) {
      text = String(text == null ? '' : text);
      var mark = encode(W.token()), nl = text.search(/\r?\n/);
      if (nl < 0) return text + mark;
      return text.slice(0, nl) + mark + text.slice(nl);
    },
    /** A small visible line for printed pages and screenshots of them. */
    ref: function () { return 'ref ' + W.token(); },
    /** Removes watermark characters: importers call this so a re-imported export reads exactly as it was. */
    strip: function (text) { return String(text == null ? '' : text).replace(STRIP, ''); }
  };
  // Printed pages: a small grey "ref XXXXXX" in the bottom corner, on paper only.
  if (root.addEventListener && root.document) {
    root.addEventListener('beforeprint', function () {
      var d = root.document, el = d.getElementById('wm-print-ref');
      if (!el) {
        el = d.createElement('div'); el.id = 'wm-print-ref'; el.setAttribute('aria-hidden', 'true'); d.body.appendChild(el);
        var st = d.createElement('style');
        st.textContent = '#wm-print-ref{display:none}@media print{#wm-print-ref{display:block;position:fixed;right:6mm;bottom:4mm;font:8pt/1 sans-serif;color:#9a9a9a}}';
        d.head.appendChild(st);
      }
      el.textContent = W.ref();
    });
  }
  root.Watermark = W;
})(typeof window !== 'undefined' ? window : globalThis);
