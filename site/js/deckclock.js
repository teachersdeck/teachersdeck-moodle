/* DeckClock — the Clock widget in ParentDeck, AdminDeck and KinderDeck (owner, 15 Nov 2026): TeachersDeck's free Classic
   clock as the UI polish left it (the SVG face with its 60 ticks, the hands, the digital time and the date), not a
   premium face. The face grows with the window (css/deckclock.css). TeachersDeck's copy is the one to edit
   (tools/check_shared.py); TeachersDeck itself keeps its own Clock in js/app.js (classicClockSvg), which this matches.

     DeckClock.mount(body, { lang: 'en' | 'vi' })   draws the clock into a widget body; returns a stop function.
                                                     It also stops by itself once the widget is closed (KinderDeck has
                                                     no clean-up hook). */
(function (root) {
  'use strict';
  var seq = 0;
  function faceSvg(gid) {
    var ticks = '';
    for (var i = 0; i < 60; i++) {
      var a = i * 6 * Math.PI / 180, major = i % 5 === 0, r1 = major ? 80 : 85, r2 = 89;
      ticks += '<line x1="' + (100 + r1 * Math.sin(a)).toFixed(2) + '" y1="' + (100 - r1 * Math.cos(a)).toFixed(2) +
        '" x2="' + (100 + r2 * Math.sin(a)).toFixed(2) + '" y2="' + (100 - r2 * Math.cos(a)).toFixed(2) +
        '" stroke="' + (major ? '#8f8a7c' : '#c9c3b3') + '" stroke-width="' + (major ? 3.2 : 1.4) + '" stroke-linecap="round"/>';
    }
    return '<svg class="dc-svg" viewBox="0 0 200 200" aria-hidden="true" preserveAspectRatio="xMidYMid meet">' +
      '<defs><radialGradient id="' + gid + '" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#fbf9f4"/><stop offset="1" stop-color="#ede8dc"/></radialGradient></defs>' +
      '<circle cx="100" cy="100" r="99" fill="url(#' + gid + ')"/>' +
      '<circle cx="100" cy="100" r="95.5" fill="none" stroke="#dcd7c9" stroke-width="7"/>' + ticks +
      '<line class="ck-h" x1="100" y1="108" x2="100" y2="48" stroke="#20242b" stroke-width="7" stroke-linecap="round"/>' +
      '<line class="ck-m" x1="100" y1="110" x2="100" y2="26" stroke="#20242b" stroke-width="4.6" stroke-linecap="round"/>' +
      '<line class="ck-s" x1="100" y1="118" x2="100" y2="20" stroke="#E06565" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="100" cy="100" r="6.5" fill="#20242b"/><circle cx="100" cy="100" r="2.4" fill="#E06565"/></svg>';
  }
  function mount(body, opts) {
    opts = opts || {};
    var locale = opts.lang === 'vi' ? 'vi-VN' : 'en-US';
    var wrap = document.createElement('div');
    wrap.className = 'deck-clock';
    wrap.innerHTML = '<div class="dc-face" role="img">' + faceSvg('dc-face-' + (++seq)) + '</div><div class="dc-digital">--:--</div><div class="dc-date">--</div>';
    body.innerHTML = '';
    body.appendChild(wrap);
    var face = wrap.querySelector('.dc-face'), hr = wrap.querySelector('.ck-h'), min = wrap.querySelector('.ck-m'), sec = wrap.querySelector('.ck-s');
    var digital = wrap.querySelector('.dc-digital'), dateEl = wrap.querySelector('.dc-date');
    var seen = false, iv = 0, stopped = false;
    function stop() { if (stopped) return; stopped = true; clearInterval(iv); }
    function tick() {
      if (wrap.isConnected) seen = true; else if (seen) { stop(); return; }
      var d = new Date(), h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
      hr.setAttribute('transform', 'rotate(' + (h * 30 + m * 0.5) + ' 100 100)');
      min.setAttribute('transform', 'rotate(' + (m * 6 + s * 0.1) + ' 100 100)');
      sec.setAttribute('transform', 'rotate(' + (s * 6) + ' 100 100)');
      var hh = h === 0 ? 12 : h, time = hh + ':' + (m < 10 ? '0' : '') + m + ' ' + (d.getHours() >= 12 ? 'PM' : 'AM');
      digital.textContent = time;
      face.setAttribute('aria-label', time);
      dateEl.textContent = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    tick();
    iv = setInterval(tick, 1000);
    return stop;
  }
  root.DeckClock = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
