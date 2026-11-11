'use strict';
/* =========================================================
   Draggable launchers (TeachersDeck v0.42.0)
   ---------------------------------------------------------
   One file in four apps: TeachersDeck's copy is the one to edit; tools/check_shared.py keeps studentdeck/, parentdeck/
   and admindeck/ identical (and css/dockdrag.css with it). Loaded before js/app.js; each app calls DockDrag.init({…})
   once its docks are built, with its own dock containers, caps and a move() that saves and rebuilds.

   - Drag a dock icon to put it somewhere else in its dock, or onto another dock to move it there. A full dock gets the
     app's own "full" message and the icon goes back where it was.
   - Drag an icon out of the app tray: the tray steps aside so it can be dropped on any dock.
   - Drop a dock icon on the app-tray tab to take it off the docks; it stays in the tray.
   - Mouse: the drag starts once the pointer has moved 6 px. Touch and pen: press and hold 350 ms, then drag; a quick
     swipe still scrolls the dock, and a tap still opens the widget.
   - Keyboard: Alt + an arrow key on a focused dock icon moves it one place along its dock. Settings' dock lists stay
     as the other way to move icons between docks.
   - Dragging never changes a widget's category: the dock order is only the user's own preference, and the tray keeps
     every widget in its own group.
   Only docks shown right now take a drop (Compact's hidden side docks, a phone's hidden side docks and a drawer that
   is switched off don't); an empty dock that is shown gets a drop outline while dragging.
   Nothing is rebuilt while dragging: a floating copy follows the pointer, a placeholder marks the spot, and the app
   saves and rebuilds once, on drop. If the docks are rebuilt mid-drag anyway, the drop still lands by position.
   ========================================================= */
(function () {
  const root = document.documentElement;
  const vi = () => /^vi/i.test(root.lang || '');
  const T = (en, vn) => (vi() ? vn : en);
  const HOLD = 350, SLOP = 8, MOUSE_START = 6, REACH = 16, EDGE = 32;

  /* cfg (from the app):
       zones:  { bottom:'#dock', left:'#dock-left-items', … }  the containers whose children are dock icons
       item:   selector for a dock icon inside a zone (each carries data-id)
       caps:   { bottom:10, left:5, … } or a function returning that
       tray:   { grid:'#app-tray-grid', item:'.app-tray-item', tab:'#app-tray-tab' }   (tab: one selector or several; the first shown is used)
       move(id, loc, ids)  loc: a zone, or 'hidden' (off the docks); ids: the zone's new order, or null
       full(loc)           the app's "this dock is full" message
       closeTray(), openTray()   optional
       onStart(), onEnd()        optional: e.g. reveal drawers an app hides while they are empty */
  let cfg = null;
  let press = null, drag = null, swallowUntil = 0, raf = 0;
  const caps = () => (typeof cfg.caps === 'function' ? cfg.caps() : cfg.caps) || {};
  const q = (sel) => (sel ? document.querySelector(sel) : null);
  // the tray target: the first one shown (a dock style may hide the tab and put its own tray button in the dock)
  const trayTab = () => (cfg.tray.tab ? [...document.querySelectorAll(cfg.tray.tab)].find((t) => t.getClientRects().length) || null : null);

  function zoneEls() {
    const out = [];
    for (const loc of Object.keys(cfg.zones)) {
      const el = q(cfg.zones[loc]);
      if (!el || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;   // hidden by CSS (a phone's side docks)
      out.push({ loc, el, r });
    }
    return out;
  }
  const itemsIn = (el, skip) => [...el.children].filter((c) => c.dataset && c.dataset.id && c !== skip && c.matches(cfg.item));
  function locOf(node) {
    for (const loc of Object.keys(cfg.zones)) { const el = q(cfg.zones[loc]); if (el && el.contains(node)) return loc; }
    return '';
  }
  function dockIcon(id) {   // the icon for this widget on a dock, if it has one
    for (const loc of Object.keys(cfg.zones)) {
      const el = q(cfg.zones[loc]);
      const it = el && itemsIn(el).find((c) => c.dataset.id === id);
      if (it) return it;
    }
    return null;
  }
  function axisOf(el, items) {   // 'x' for a row of icons, 'y' for a column
    if (items.length > 1) {
      const a = items[0].getBoundingClientRect(), b = items[1].getBoundingClientRect();
      return Math.abs(a.top - b.top) < Math.abs(a.left - b.left) ? 'x' : 'y';
    }
    const r = el.getBoundingClientRect();
    return r.width >= r.height ? 'x' : 'y';
  }
  const nameOf = (el) => (el.getAttribute('aria-label') || el.title || el.textContent || '').trim();

  /* ---- screen readers hear where an icon went ---- */
  let live = null;
  function say(msg) {
    if (!live) { live = document.createElement('div'); live.className = 'dkd-live'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); document.body.appendChild(live); }
    live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30);
  }

  /* ---- press: decide between a tap, a scroll and a drag ---- */
  document.addEventListener('pointerdown', (e) => {
    if (!cfg || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const it = e.target.closest && e.target.closest(`${cfg.item}, ${cfg.tray.item}`);
    if (!it || !it.dataset.id) return;
    const fromTray = !!(cfg.tray.grid && it.closest(cfg.tray.grid));
    if (!fromTray && !locOf(it)) return;
    clearTimeout(press && press.t);
    press = { it, id: it.dataset.id, fromTray, x: e.clientX, y: e.clientY, type: e.pointerType, t: 0 };
    if (e.pointerType !== 'mouse') press.t = setTimeout(() => { if (press) begin(press.x, press.y); }, HOLD);
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (drag) { drag.x = e.clientX; drag.y = e.clientY; place(); return; }
    if (!press) return;
    const d = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.type === 'mouse') { if (d > MOUSE_START) begin(e.clientX, e.clientY); }
    else if (d > SLOP) cancelPress();   // a swipe: let the dock or tray scroll
  }, true);
  // Once a touch drag has started, the finger moves the icon, not the page
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', (e) => { if (drag) { drag.x = e.clientX; drag.y = e.clientY; drop(); } else cancelPress(); }, true);
  document.addEventListener('pointercancel', () => { if (drag) cancel(); else cancelPress(); }, true);
  addEventListener('blur', () => { if (drag) cancel(); else cancelPress(); });
  document.addEventListener('contextmenu', (e) => { if ((press || drag) && e.target.closest && e.target.closest(`${cfg.item}, ${cfg.tray.item}`)) e.preventDefault(); }, true);
  document.addEventListener('click', (e) => { if (Date.now() < swallowUntil) { e.preventDefault(); e.stopPropagation(); swallowUntil = 0; } }, true);
  document.addEventListener('keydown', (e) => { if (drag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); } }, true);
  function cancelPress() { if (press) { clearTimeout(press.t); press = null; } }

  /* ---- the drag ---- */
  function begin(x, y) {
    const p = press; press = null; clearTimeout(p.t);
    if (!p.it.isConnected) return;
    const src = p.fromTray ? dockIcon(p.id) : p.it;   // the icon being moved, when it is on a dock
    const from = src ? locOf(src) : 'hidden';
    const r = p.it.getBoundingClientRect();
    root.classList.add('dkd-dragging');
    if (cfg.onStart) try { cfg.onStart(); } catch (e) {}
    if (p.fromTray && cfg.closeTray) cfg.closeTray();
    const ghost = p.it.cloneNode(true);
    ghost.removeAttribute('id'); ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.classList.add('dkd-ghost'); ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
    document.body.appendChild(ghost);
    const ph = document.createElement('span'); ph.className = 'dkd-ph'; ph.setAttribute('aria-hidden', 'true');
    drag = { id: p.id, from, src, fromTray: p.fromTray, ghost, ph, dx: x - r.left, dy: y - r.top, x, y, target: null, name: nameOf(p.it), mouse: p.type === 'mouse' };
    if (src) src.classList.add('dkd-src');
    const tab = trayTab();
    if (tab && from !== 'hidden') { tab.classList.add('dkd-tab'); tab.dataset.dkdLabel = T('Drop here to take it off the dock', 'Thả vào đây để bỏ khỏi thanh dock'); }
    for (const z of Object.keys(cfg.zones)) { const el = q(cfg.zones[z]); if (el) { el.classList.add('dkd-zone'); el.classList.toggle('dkd-empty', !itemsIn(el, src).length); } }
    if (!drag.mouse && navigator.vibrate) navigator.vibrate(12);
    place();
    raf = requestAnimationFrame(scrollLoop);
  }

  function setTarget(t) {
    const d = drag;
    document.querySelectorAll('.dkd-full, .dkd-over').forEach((n) => n.classList.remove('dkd-full', 'dkd-over'));
    d.target = t;
    if (!t || t.full || t.loc === 'hidden') { d.ph.remove(); if (d.src) d.src.classList.remove('dkd-src-gone'); }
  }

  function place() {
    const d = drag;
    d.ghost.style.transform = `translate(${Math.round(d.x - d.dx)}px, ${Math.round(d.y - d.dy)}px)`;
    const tab = trayTab();
    if (tab && d.from !== 'hidden') {
      const r = tab.getBoundingClientRect();
      if (r.width && d.x >= r.left - REACH && d.x <= r.right + REACH && d.y >= r.top - REACH && d.y <= r.bottom + 4) {
        setTarget({ loc: 'hidden' }); tab.classList.add('dkd-over'); return;
      }
    }
    const z = zoneEls().find(({ r }) => d.x >= r.left - REACH && d.x <= r.right + REACH && d.y >= r.top - REACH && d.y <= r.bottom + REACH);
    if (!z) { setTarget(null); return; }
    const items = itemsIn(z.el, d.src);
    const cap = caps()[z.loc];
    if (z.loc !== d.from && cap && items.length >= cap) { setTarget({ loc: z.loc, full: true }); z.el.classList.add('dkd-full'); return; }
    const axis = axisOf(z.el, items.length ? items : itemsIn(z.el));
    let i = items.findIndex((it) => { const r = it.getBoundingClientRect(); return axis === 'x' ? d.x < r.left + r.width / 2 : d.y < r.top + r.height / 2; });
    if (i < 0) i = items.length;
    if (!d.target || d.target.loc !== z.loc || d.target.index !== i || !d.ph.isConnected) {
      document.querySelectorAll('.dkd-full, .dkd-over').forEach((n) => n.classList.remove('dkd-full', 'dkd-over'));
      d.target = { loc: z.loc, index: i };
      const like = items[0] || d.src;
      const lr = like && like.getBoundingClientRect();
      if (lr && lr.width) { d.ph.style.width = lr.width + 'px'; d.ph.style.height = lr.height + 'px'; }
      z.el.insertBefore(d.ph, items[i] || null);
      if (d.src) d.src.classList.toggle('dkd-src-gone', z.loc === d.from);   // its old place closes up while the placeholder is in the same dock
    }
    z.el.classList.add('dkd-over');
  }

  function scrollLoop() {   // a dock (or the phone's sideways dock) scrolls when the icon is held near its end
    if (!drag) return;
    const d = drag, t = d.target;
    if (t && !t.full && t.loc !== 'hidden') {
      const el = q(cfg.zones[t.loc]), r = el && el.getBoundingClientRect();
      if (r) {
        let moved = false;
        if (el.scrollWidth > el.clientWidth + 1) {
          if (d.x < r.left + EDGE) { el.scrollLeft -= 6; moved = true; } else if (d.x > r.right - EDGE) { el.scrollLeft += 6; moved = true; }
        }
        if (el.scrollHeight > el.clientHeight + 1) {
          if (d.y < r.top + EDGE) { el.scrollTop -= 6; moved = true; } else if (d.y > r.bottom - EDGE) { el.scrollTop += 6; moved = true; }
        }
        if (moved) place();
      }
    }
    raf = requestAnimationFrame(scrollLoop);
  }

  function finish() {
    const d = drag; drag = null;
    cancelAnimationFrame(raf);
    d.ghost.remove(); d.ph.remove();
    document.querySelectorAll('.dkd-src, .dkd-src-gone, .dkd-full, .dkd-over, .dkd-zone, .dkd-empty, .dkd-tab').forEach((n) => n.classList.remove('dkd-src', 'dkd-src-gone', 'dkd-full', 'dkd-over', 'dkd-zone', 'dkd-empty', 'dkd-tab'));
    root.classList.remove('dkd-dragging');
    if (cfg.onEnd) try { cfg.onEnd(); } catch (e) {}
    swallowUntil = Date.now() + 500;   // the click that ends a mouse drag doesn't also open the widget
    return d;
  }
  function cancel() { const d = finish(); if (d.fromTray && cfg.openTray) cfg.openTray(); }

  function drop() {
    const d = drag, t = d.target;
    // the zone's new order, read before the placeholder goes; if the docks were rebuilt mid-drag, by position instead
    let ids = null;
    if (t && !t.full && t.loc !== 'hidden') {
      const el = q(cfg.zones[t.loc]);
      if (el && d.ph.parentNode === el) ids = [...el.children].map((c) => (c === d.ph ? d.id : c.dataset && c.dataset.id && c.matches(cfg.item) && c.dataset.id !== d.id ? c.dataset.id : null)).filter(Boolean);
      else if (el) { ids = itemsIn(el).map((c) => c.dataset.id).filter((x) => x !== d.id); ids.splice(Math.min(t.index, ids.length), 0, d.id); }
    }
    const before = (t && t.loc === d.from && d.src) ? itemsIn(q(cfg.zones[d.from])).map((c) => c.dataset.id).join() : '';
    finish();
    if (!t) { if (d.fromTray && cfg.openTray) cfg.openTray(); return; }
    if (t.full) { cfg.full(t.loc); return; }
    if (t.loc === 'hidden') { cfg.move(d.id, 'hidden', null); say(T(`${d.name} taken off the dock. It is still in the app tray.`, `Đã bỏ ${d.name} khỏi thanh dock. Vẫn còn trong khay ứng dụng.`)); return; }
    if (!ids || (before && before === ids.join())) return;   // dropped back where it was
    cfg.move(d.id, t.loc, ids);
    say(T(`${d.name} moved to place ${ids.indexOf(d.id) + 1} of ${ids.length}.`, `Đã chuyển ${d.name} đến vị trí ${ids.indexOf(d.id) + 1} trên ${ids.length}.`));
  }

  /* ---- keyboard: Alt + arrow moves the focused dock icon one place along its dock ---- */
  document.addEventListener('keydown', (e) => {
    if (!cfg || drag || !e.altKey || e.ctrlKey || e.metaKey || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
    const it = e.target.closest && e.target.closest(cfg.item);
    const loc = it && it.dataset.id && locOf(it);
    if (!loc) return;
    e.preventDefault();
    const el = q(cfg.zones[loc]), ids = itemsIn(el).map((c) => c.dataset.id);
    const i = ids.indexOf(it.dataset.id), j = i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const id = it.dataset.id, name = nameOf(it);
    cfg.move(id, loc, ids);
    const back = q(cfg.zones[loc]);
    const again = back && itemsIn(back).find((c) => c.dataset.id === id);
    if (again) again.focus();
    say(T(`${name} moved to place ${j + 1} of ${ids.length}.`, `Đã chuyển ${name} đến vị trí ${j + 1} trên ${ids.length}.`));
  });

  window.DockDrag = {
    init(c) { cfg = Object.assign({ tray: {} }, c); },
    get dragging() { return !!drag; },
  };
})();
