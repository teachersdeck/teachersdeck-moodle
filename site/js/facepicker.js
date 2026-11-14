/* FacePicker — a card-deck picker for watch faces, themes and other store items (13 Nov 2026).
 *
 * One compact button in the widget (the item in use: its colour, its name, ▾) opens a panel with a stacked deck of
 * cards: the chosen card in the middle, the others fanned out behind it to each side, a little lower, smaller and
 * turned. Drag or swipe the deck, use the arrows, the mouse wheel or the keyboard; tap a side card to bring it to the
 * middle and the middle card to pick it. It stays the same size whether someone owns two items or every one in the
 * store, so no widget fills with swatches. The deck idea is the owner's (a 21st.dev "stacked carousel", carousel-07);
 * this is a plain-JavaScript version with no libraries.
 * The same file in TeachersDeck and StudentDeck (TeachersDeck's copy is the one to edit; tools/check_shared.py keeps
 * them identical). css/facepicker.css draws it with each app's own colour tokens.
 *
 *   FacePicker.trigger({ current, lang, label })  -> <button>; current = { name, swatch } or null (Classic)
 *   FacePicker.attach(button, getOpts)             click / ↓ on the button opens the deck with getOpts()
 *   FacePicker.open({ anchor, options, current, lang, title, onPick(key), onLocked(option), refocus() })
 *     options: [{ key, name, group, swatch?, svg?, bg?, mock?, badge?, locked? }]
 *       svg   a store drawing, already checked by StoreCore (drawn with StoreCore.scopeSvg)
 *       bg    the card's own background (a theme's gradient); mock: true draws a tiny desk on it
 *     current: the key in use. Picking calls onPick(key); a locked option calls onLocked(option) instead.
 *     refocus(): optional, returns the new button when onPick redrew the widget (focus goes back to it).
 *     pickLabel(option): optional, the words on the pick button for that card (the Shop: "Buy · 25,000₫").
 *
 * Keyboard: Enter / Space / ↓ on the button opens it; ← → move (Home / End, Page Up / Page Down jump five); Enter or
 * Space picks the middle card; Tab moves between the groups, the deck and Close; Escape closes and gives focus back.
 * Reduced motion: the deck jumps instead of gliding.
 */
(function (root) {
  'use strict';
  var T = {
    en: { title: 'Clock faces', close: 'Close', prev: 'Previous', next: 'Next', all: 'All', classic: 'Classic', change: 'Change clock face', locked: 'locked', inUse: 'In use', of: 'of', pick: 'Use this', ask: 'Ask at home' },
    vi: { title: 'Mặt đồng hồ', close: 'Đóng', prev: 'Trước', next: 'Sau', all: 'Tất cả', classic: 'Cổ điển', change: 'Đổi mặt đồng hồ', locked: 'chưa mở', inUse: 'Đang dùng', of: '/', pick: 'Dùng', ask: 'Hỏi ở nhà' },
  };
  var seq = 0, openPanel = null;
  function tr(lang) { return T[lang === 'vi' ? 'vi' : 'en']; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function safeCss(s, d) { return typeof s === 'string' && !/url\s*\(|expression|[;{}<>\\]/i.test(s) ? s : d; }
  function reduceMotion() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }

  function trigger(o) {
    o = o || {};
    var t = tr(o.lang), b = el('button', 'fp-trigger');
    b.type = 'button';
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-expanded', 'false');
    var cur = o.current || null, name = cur ? cur.name : t.classic, label = o.label || t.change;
    b.setAttribute('aria-label', label + ': ' + name);
    b.title = label;
    var sw = el('span', 'fp-trigger-sw'); sw.style.background = safeCss(cur ? cur.swatch : '', '#F4F1EA');
    b.appendChild(sw);
    b.appendChild(el('span', 'fp-trigger-name', name));
    var chev = el('span', 'fp-trigger-chev', '▾'); chev.setAttribute('aria-hidden', 'true');
    b.appendChild(chev);
    return b;
  }

  function close() { if (openPanel) openPanel.close(); }

  // How far each card sits from the middle one, by panel width (after carousel-07's breakpoints, smaller for a panel).
  function layout(w) {
    if (w < 420) return { x: 74, y: 14, rot: 7, scale: 0.08, drag: 150 };
    return { x: 104, y: 20, rot: 9, scale: 0.1, drag: 190 };
  }

  function open(o) {
    close();
    var t = tr(o.lang), id = 'fp' + (++seq), anchor = o.anchor || null;
    var options = (o.options || []).slice(), current = o.current == null ? '' : String(o.current);
    var groups = [];
    options.forEach(function (x) { if (groups.indexOf(x.group) < 0) groups.push(x.group); });
    var group = null;   // null = all

    var veil = el('div', 'fp-veil');
    var panel = el('div', 'fp-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', id + '-h');
    var head = el('div', 'fp-head');
    var h = el('h3', 'fp-title', o.title || t.title); h.id = id + '-h';
    var x = el('button', 'fp-close', '×'); x.type = 'button'; x.setAttribute('aria-label', t.close);
    head.appendChild(h); head.appendChild(x);
    panel.appendChild(head);

    var tabs = el('div', 'fp-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', o.title || t.title);
    if (groups.length > 1) {
      [null].concat(groups).forEach(function (g) {
        var c = el('button', 'fp-tab', g == null ? t.all : g); c.type = 'button';
        c.dataset.g = g == null ? '' : g;
        tabs.appendChild(c);
      });
      panel.appendChild(tabs);
    }

    var stage = el('div', 'fp-stage');
    var deck = el('div', 'fp-deck');
    deck.setAttribute('role', 'listbox');
    deck.setAttribute('aria-labelledby', id + '-h');
    var prev = el('button', 'fp-arrow fp-prev', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', t.prev); prev.tabIndex = -1;
    var next = el('button', 'fp-arrow fp-next', '›'); next.type = 'button'; next.setAttribute('aria-label', t.next); next.tabIndex = -1;
    stage.appendChild(deck); stage.appendChild(prev); stage.appendChild(next);
    panel.appendChild(stage);
    var foot = el('div', 'fp-foot');
    var caption = el('div', 'fp-caption'); caption.setAttribute('aria-live', 'polite');
    var useBtn = el('button', 'fp-use', t.pick); useBtn.type = 'button'; useBtn.tabIndex = -1;
    foot.appendChild(caption); foot.appendChild(useBtn);
    panel.appendChild(foot);
    veil.appendChild(panel);

    var cards = [], list = [], pos = 0, target = 0, vel = 0, raf = 0, active = null, L = layout(560);
    var wrap = false;

    function draw(card) {   // previews are drawn only for the cards near the middle
      var art = card.querySelector('.fp-art'); if (!art || art.dataset.drawn) return;
      art.dataset.drawn = '1';
      var opt = list[+card.dataset.n];
      if (opt.svg && root.StoreCore && StoreCore.scopeSvg) art.innerHTML = StoreCore.scopeSvg(opt.svg, id + 'p' + card.dataset.i + '-');
      else if (opt.mock) { art.appendChild(el('span', 'fp-mock')); }
      else { var d = el('span', 'fp-dot'); d.style.background = safeCss(opt.swatch, '#2a3542'); art.appendChild(d); }
    }

    function build() {
      deck.innerHTML = ''; cards = [];
      list = options.filter(function (opt) { return group == null || opt.group === group; });
      wrap = list.length >= 5;
      list.forEach(function (opt, n) {
        var c = el('div', 'fp-card' + (opt.locked ? ' locked' : ''));
        c.setAttribute('role', 'option');
        c.id = id + '-o' + options.indexOf(opt);
        c.dataset.i = options.indexOf(opt); c.dataset.n = n;
        var on = String(opt.key) === current;
        c.setAttribute('aria-selected', on ? 'true' : 'false');
        c.tabIndex = -1;
        c.style.background = safeCss(opt.bg, '');
        if (opt.bg) c.classList.add('has-bg');
        c.appendChild(el('span', 'fp-art'));
        var badge = opt.locked ? '🔒 ' + t.ask : on ? t.inUse : (opt.badge || opt.group || '');
        if (badge) c.appendChild(el('span', 'fp-badge', badge));
        c.appendChild(el('span', 'fp-name', opt.name));
        c.setAttribute('aria-label', opt.name + (opt.locked ? ' (' + t.locked + ')' : '') + (on ? ' — ' + t.inUse : ''));
        deck.appendChild(c); cards.push(c);
      });
      Array.prototype.forEach.call(tabs.children, function (c) { c.setAttribute('aria-pressed', (c.dataset.g || null) === group ? 'true' : 'false'); });
      var sel = cards.findIndex(function (c) { return c.getAttribute('aria-selected') === 'true'; });
      pos = target = Math.max(0, sel); vel = 0;
      render(); settle(false);
    }

    function offsetOf(i, p) {
      var n = cards.length, d = i - p;
      if (wrap) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; }
      return d;
    }
    function render() {
      var w = stage.clientWidth || 560; L = layout(w);
      var half = wrap ? cards.length / 2 : Infinity;
      cards.forEach(function (c, i) {
        var o = offsetOf(i, pos), a = Math.abs(o);
        var vis = a < 3.6 && (!wrap || a < half - 0.25);
        if (!vis) { c.style.visibility = 'hidden'; return; }
        if (a < 4) draw(c);
        c.style.visibility = '';
        c.style.transform = 'translate(-50%,-50%) translateX(' + (o * L.x).toFixed(1) + 'px) translateY(' + (a < 0.05 ? 0 : a * L.y).toFixed(1) + 'px) rotate(' + (a < 0.05 ? 0 : o * L.rot).toFixed(2) + 'deg) scale(' + (1 - a * L.scale).toFixed(3) + ')';
        c.style.zIndex = String(Math.round(100 - a * 10));
        c.style.setProperty('--fp-shade', Math.min(0.55, a * 0.22).toFixed(3));
        c.classList.toggle('mid', a < 0.5);
      });
      var n = cards.length;
      prev.disabled = !n || (!wrap && target <= 0);
      next.disabled = !n || (!wrap && target >= n - 1);
    }
    function centre() { var n = cards.length; return n ? ((Math.round(target) % n) + n) % n : -1; }
    // a damped spring towards the target (carousel-07 uses stiffness 200, damping 30)
    function step(now, last) {
      var dt = Math.min(0.032, (now - last) / 1000);
      var a = 200 * (target - pos) - 30 * vel;
      vel += a * dt; pos += vel * dt;
      if (Math.abs(target - pos) < 0.001 && Math.abs(vel) < 0.01) { pos = target; vel = 0; render(); raf = 0; return; }
      render();
      raf = root.requestAnimationFrame(function (t2) { step(t2, now); });
    }
    function glide() {
      if (reduceMotion()) { pos = target; vel = 0; render(); return; }
      if (!raf) { var t0 = performance.now(); raf = root.requestAnimationFrame(function (t1) { step(t1, t0); }); }
    }
    function settle(focus) {
      var k = centre(); if (k < 0) { caption.textContent = ''; useBtn.disabled = true; return; }
      if (active && active !== cards[k]) active.tabIndex = -1;
      active = cards[k]; active.tabIndex = 0;
      var opt = list[k];
      caption.textContent = opt.name + ' · ' + (k + 1) + ' ' + t.of + ' ' + cards.length;
      useBtn.disabled = false;
      useBtn.textContent = opt.locked ? t.ask : (o.pickLabel ? o.pickLabel(opt) : t.pick);
      if (focus) active.focus({ preventScroll: true });
    }
    function moveTo(n, focus) {   // n: a card index; with wrap-around the deck turns the short way
      var cnt = cards.length; if (!cnt) return;
      if (!wrap) n = Math.max(0, Math.min(cnt - 1, n));
      else { var cur = Math.round(target), d = offsetOf(((n % cnt) + cnt) % cnt, cur); n = cur + Math.round(d); }
      target = n; glide(); settle(focus);
    }
    function stepBy(d, focus) {
      var cnt = cards.length; if (!cnt) return;
      var n = Math.round(target) + d;
      if (!wrap) n = Math.max(0, Math.min(cnt - 1, n));
      target = n; glide(); settle(focus);
    }
    function pick(c) {
      var opt = list[+c.dataset.n];
      if (opt.locked) { if (o.onLocked) { finish(false); o.onLocked(opt); } return; }
      finish(false);
      if (o.onPick) o.onPick(opt.key);
      refocus();
    }
    // The app usually redraws the widget after a pick, which replaces the button: o.refocus() finds the new one.
    function refocus() {
      var b = anchor && anchor.isConnected ? anchor : (o.refocus ? o.refocus() : null);
      if (b && b.focus) b.focus();
    }

    /* Dragging and swiping: the deck follows the pointer; on release it lands on the nearest card, carried a little
       further by a quick flick (at most three cards, as in carousel-07). A press that barely moves is a tap. */
    var drag = null;
    stage.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.fp-arrow')) return;
      drag = { x: e.clientX, start: pos, t: performance.now(), lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
      if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } stage.classList.add('dragging'); }
      if (!drag.moved) return;
      var now = performance.now();
      drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT) * 1000; drag.lastX = e.clientX; drag.lastT = now;
      pos = drag.start - dx / L.drag; target = pos; render();
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null; stage.classList.remove('dragging');
      if (!d.moved) {   // a tap
        var c = e.target.closest && e.target.closest('.fp-card');
        if (!c) { target = Math.round(pos); glide(); return; }
        if (c === cards[centre()] && Math.abs(pos - Math.round(pos)) < 0.2) pick(c); else moveTo(+c.dataset.n, true);
        return;
      }
      var shift = Math.max(-3, Math.min(3, Math.round(-(e.clientX - d.x) / L.drag - d.v / 900)));
      target = Math.round(d.start) + shift;
      if (!wrap) target = Math.max(0, Math.min(cards.length - 1, target));
      glide(); settle(true);
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    var wheelAt = 0;
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var now = performance.now(), d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (now - wheelAt < 120 || Math.abs(d) < 4) return;
      wheelAt = now; stepBy(d > 0 ? 1 : -1, true);
    }, { passive: false });

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); return; }
      if (e.key === 'Tab') {   // keep focus inside the panel
        var f = Array.prototype.filter.call(panel.querySelectorAll('button, [tabindex="0"]'), function (n) { return !n.disabled && n.tabIndex >= 0; });
        if (!f.length) return;
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        return;
      }
      if (!deck.contains(document.activeElement) || !cards.length) return;
      var cnt = cards.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') stepBy(1, true);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') stepBy(-1, true);
      else if (e.key === 'Home') moveTo(0, true);
      else if (e.key === 'End') moveTo(cnt - 1, true);
      else if (e.key === 'PageDown') stepBy(5, true);
      else if (e.key === 'PageUp') stepBy(-5, true);
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(cards[centre()]); return; }
      else return;
      e.preventDefault(); e.stopPropagation();
    }

    veil.addEventListener('click', function (e) {
      if (e.target === veil || e.target.closest('.fp-close')) { finish(true); return; }
      var tab = e.target.closest('.fp-tab');
      if (tab) { group = tab.dataset.g || null; build(); return; }
      if (e.target.closest('.fp-prev')) { stepBy(-1, false); return; }
      if (e.target.closest('.fp-next')) { stepBy(1, false); return; }
      if (e.target.closest('.fp-use')) { var k = centre(); if (k >= 0) pick(cards[k]); }
    });
    document.addEventListener('keydown', onKey, true);
    root.addEventListener('resize', onResize);
    function onResize() { place(); render(); }

    function place() {
      panel.style.left = panel.style.top = '';
      if (!anchor || !anchor.isConnected || root.innerWidth < 520) { veil.classList.add('fp-centered'); return; }
      veil.classList.remove('fp-centered');
      var a = anchor.getBoundingClientRect(), pw = panel.offsetWidth, ph = panel.offsetHeight, m = 8;
      var left = Math.min(Math.max(m, a.left + a.width / 2 - pw / 2), root.innerWidth - pw - m);
      var top = a.bottom + 6 + ph <= root.innerHeight - m ? a.bottom + 6 : Math.max(m, Math.min(root.innerHeight - ph - m, a.top - 6 - ph));
      panel.style.left = left + 'px'; panel.style.top = top + 'px';
    }

    var done = false;
    function finish(again) {
      if (done) return; done = true;
      if (raf) root.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      root.removeEventListener('resize', onResize);
      veil.remove();
      if (anchor) anchor.setAttribute('aria-expanded', 'false');
      if (openPanel === api) openPanel = null;
      if (again) refocus();
    }
    var api = { close: function () { finish(false); }, el: panel };
    openPanel = api;

    document.body.appendChild(veil);
    if (anchor) anchor.setAttribute('aria-expanded', 'true');
    build();
    place();
    render();
    if (active) active.focus({ preventScroll: true }); else x.focus();
    return api;
  }

  /** Wires a trigger button: click or ↓ opens the deck with what getOpts() returns at that moment. */
  function attach(btn, getOpts) {
    function go() { var o = getOpts(); o.anchor = btn; open(o); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); go(); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); go(); } });
    return btn;
  }

  root.FacePicker = { trigger: trigger, open: open, attach: attach, close: close };
})(typeof window !== 'undefined' ? window : this);
