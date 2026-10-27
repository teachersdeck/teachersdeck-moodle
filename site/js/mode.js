'use strict';
/* =========================================================
   Light / dark mode for every TeachersDeck Suite app (added 27 Oct 2026).
   ---------------------------------------------------------
   ONE FILE IN FOUR APPS: teachersdeck/js/mode.js is the copy to edit; tools/check_shared.py keeps the
   StudentDeck, ParentDeck and AdminDeck copies identical.

   Load it in <head>, before the stylesheets, so the page paints in the right mode from the first frame:
     <script src="js/mode.js"></script>
   It sets <html data-mode="light|dark">; each app's css/light.css applies only under data-mode="light", so
   Dark is exactly the look the apps always had. Dark is the default.

   The choice is kept in the REAL localStorage under `deck_mode` (captured here, before demo mode swaps in its
   throw-away storage), so it survives the demo. Apps on the same site (the demo site, the web versions) share it;
   each Chrome extension keeps its own. Other open tabs of the same app follow a change at once.

   window.DeckMode
     .get()                 'light' | 'dark'
     .set(mode)             switch, save, tell listeners
     .onChange(fn)          fn(mode) after every switch; returns an unsubscribe function
     .mountSwitch(el, labels, opts)  puts the two-button switch into el; labels = { label, light, dark } in the app's
                               language. opts.compact: the icon-only form for the top bar (sun | moon, the words become
                               tooltips) — every app puts it just left of its Settings button. Without it: the labelled
                               form for a theme menu. Returns { relabel(labels), destroy() }: relabel after a language
                               change, destroy when the panel holding it closes.
                               Styles: css/mode.css, one shared file like this one, so the switch looks the same in every app.
     .background(id, darkCss)  the page background for one of the six shared presets (dusk, chalk, ocean, sunrise,
                               slate, plain): darkCss in Dark mode, the same hue made pale in Light mode. An unknown id
                               (or a teacher's own image) gets darkCss in both.
   ========================================================= */
(function () {
  var KEY = 'deck_mode', ls = null;
  try { ls = window.localStorage; } catch (e) {}
  function read() { try { return ls && ls.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; } }

  var mode = read(), subs = [], root = document.documentElement;
  var LIGHT_BACKGROUNDS = {                           // the suite's six presets, pale enough for dark text
    dusk: 'linear-gradient(180deg,#eef3fb 0%, #e2e9f5 45%, #d9e2f0 100%)',
    chalk: 'linear-gradient(180deg,#f2f4ec 0%, #e6eadd 60%, #eef1e7 100%)',
    ocean: 'linear-gradient(180deg,#e7f4f7 0%, #d5eaf0 55%, #e3f0f4 100%)',
    sunrise: 'linear-gradient(180deg,#f6eef5 0%, #f5e4e1 45%, #f5dac6 100%)',
    slate: 'linear-gradient(180deg,#f0f2f5 0%, #e3e6eb 100%)',
    plain: '#f3f5f8'
  };
  function paint(m) {
    // Only the attribute: no color-scheme, so the browser draws native checkboxes, inputs and scrollbars exactly as the
    // apps always had them in Dark, and as its default (light) look in Light.
    root.setAttribute('data-mode', m);
  }
  function tell() { subs.slice().forEach(function (fn) { try { fn(mode); } catch (e) {} }); }
  paint(mode);

  var api = {
    get: function () { return mode; },
    set: function (m) {
      m = m === 'light' ? 'light' : 'dark';
      if (m === mode) return;
      mode = m;
      try { if (ls) ls.setItem(KEY, m); } catch (e) {}
      paint(m); tell();
    },
    background: function (id, darkCss) {
      return mode === 'light' && Object.prototype.hasOwnProperty.call(LIGHT_BACKGROUNDS, id) ? LIGHT_BACKGROUNDS[id] : darkCss;
    },
    onChange: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; },
    mountSwitch: function (el, labels, opts) {
      if (!el) return { relabel: function () {}, destroy: function () {} };
      var L = labels || {};
      var sun = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
      var moon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z"/></svg>';
      var compact = !!(opts && opts.compact);
      el.classList.add(compact ? 'deck-mode-toggle' : 'deck-mode-switch');
      el.setAttribute('role', 'radiogroup');
      el.innerHTML = '<button type="button" class="deck-mode-opt" role="radio" data-value="light">' + sun + '<span></span></button>' +
                     '<button type="button" class="deck-mode-opt" role="radio" data-value="dark">' + moon + '<span></span></button>';
      function sync() {
        Array.prototype.forEach.call(el.querySelectorAll('.deck-mode-opt'), function (b) {
          var on = b.getAttribute('data-value') === mode;
          b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
        });
      }
      function relabel(l) {
        L = l || L;
        el.setAttribute('aria-label', L.label || 'Mode');
        [['light', L.light || 'Light'], ['dark', L.dark || 'Dark']].forEach(function (x) {
          var b = el.querySelector('[data-value="' + x[0] + '"]');
          b.querySelector('span').textContent = x[1];
          if (compact) { b.title = x[1]; b.setAttribute('aria-label', x[1]); }
        });
      }
      el.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.deck-mode-opt') : null;
        if (b) api.set(b.getAttribute('data-value'));
      });
      el.addEventListener('keydown', function (e) {    // arrow keys move between the two options, as in any radio group
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
        e.preventDefault(); api.set(mode === 'light' ? 'dark' : 'light');
        var on = el.querySelector('.deck-mode-opt.on'); if (on) on.focus();
      });
      var off = api.onChange(sync); relabel(L); sync();
      return { relabel: relabel, destroy: off };
    }
  };

  window.addEventListener('storage', function (e) {     // another tab of this app switched
    if (e.key !== KEY) return;
    var m = read(); if (m === mode) return;
    mode = m; paint(m); tell();
  });
  window.DeckMode = api;
})();
