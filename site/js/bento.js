'use strict';
/* =========================================================
   Live tiles for phones and tablets (the web apps, TeachersDeck v0.34.0)
   ---------------------------------------------------------
   One file in four apps: TeachersDeck's copy is the one to edit; tools/check_shared.py keeps studentdeck/, parentdeck/
   and admindeck/ identical (and css/bento.css with it). Loaded after js/app.js.

   On a touch screen, or a window 700 px wide or less, the floating widget wall becomes a grid of tiles, in the spirit of
   Windows live tiles: every open widget is a tile showing the widget itself, shrunk to fit when it's bigger than the tile.
   - Tablets (landscape): a grid of square-ish cells, side by side; held upright, fewer columns.
   - Phones (portrait): two columns, one under the other, scrolling.
   - Sizes: Small (1×1), Wide (2×1), Large (2×2) and Full width. ⋯ on a tile (or press and hold its title, or right-click)
     resizes it, moves it earlier or later, opens it full screen or closes it. ⤢ opens it full screen; ⤡ or Esc puts it back.
   - The first time, a few useful widgets open by themselves (DEFAULTS below).
   - The bottom dock becomes a floating glass dock of icons; each icon's name shows above it on hover or press-and-hold.
   Tile sizes and order are this device's own (localStorage). With a mouse on a wide window nothing changes unless
   Settings → Tiles says Always (or the address has ?bento=1), and the floating layout a teacher saved is never touched:
   the tiles only override positions in CSS. Settings → Tile style picks Midnight, Glass or Colour. Widgets are found by
   data-wid, set by each app's openWidget().
   ========================================================= */
(function () {
  const wall = document.getElementById('wall');
  if (!wall || !window.matchMedia) return;
  const root = document.documentElement;
  const APP = ((window.DECK_EDITION || window.SD_EDITION || {}).name) || 'app';
  const touch = matchMedia('(pointer: coarse)'), narrow = matchMedia('(max-width: 700px)');
  const forced = /[?&]bento=1(&|$)/.test(location.search);
  const GAP = 12;

  /* The tiles a first visit opens, and the sizes they start at (the picture this was designed from: a wide timer, a traffic
     light, a name picker, points, groups and a wide homework tile). Any other widget's size comes from its usual size. */
  const DEFAULTS = {
    TeachersDeck: ['timer', 'traffic', 'namepicker', 'scoreboard', 'groupmaker', 'assignments'],
    StudentDeck: ['clock', 'timer', 'todo', 'cards', 'idiom'],
    ParentDeck: ['summary', 'notes', 'homework', 'badges'],
    AdminDeck: ['schoolstats', 'points', 'teachers', 'pulse', 'joincodes'],
  };
  const START = {
    TeachersDeck: { timer: 'wide', traffic: 'small', namepicker: 'small', scoreboard: 'small', groupmaker: 'small', assignments: 'wide', clock: 'small', dice: 'small' },
    StudentDeck: { clock: 'small', timer: 'wide', todo: 'large', cards: 'large', idiom: 'wide' },
    ParentDeck: { summary: 'large', notes: 'wide', homework: 'wide', badges: 'small' },
    AdminDeck: { schoolstats: 'large', points: 'wide', teachers: 'wide' },
  };
  const SIZES = ['small', 'wide', 'large', 'full'];
  const SIZE_NAMES = { small: 'Small', wide: 'Wide', large: 'Large', full: 'Full width' };

  /* ---- Settings → Tiles and Tile style (this device) ----
     Tiles: Automatic (tiles on a touch screen or a window 700 px wide or less, floating windows with a mouse), Tiles
     (Always) or Off (floating windows everywhere). Tile style: Midnight (flat dark tiles), Glass (frosted, over the app's
     background) or Colour (a colour per tile, like Windows Phone). Each works in Light and Dark mode (css/bento.css). */
  const PREFS = 'bento_prefs:' + APP;
  const LAYOUTS = ['auto', 'tiles', 'floating'], THEMES = ['midnight', 'glass', 'colour'];
  let prefs = { layout: 'auto', theme: 'midnight' };
  try { const p = JSON.parse(localStorage.getItem(PREFS) || 'null'); if (p) prefs = { layout: LAYOUTS.includes(p.layout) ? p.layout : 'auto', theme: THEMES.includes(p.theme) ? p.theme : 'midnight' }; } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) {} };
  const vi = () => /^vi/i.test(root.lang || '');
  const T = (en, vn) => (vi() ? vn : en);
  const LAYOUT_NAMES = () => ({ auto: T('Automatic', 'Tự động'), tiles: T('Always', 'Luôn bật'), floating: T('Off', 'Tắt') });
  const THEME_NAMES = () => ({ midnight: T('Midnight', 'Nửa đêm'), glass: T('Glass', 'Kính mờ'), colour: T('Colour', 'Màu sắc') });
  const PALETTE = 6;   // css/bento.css: --bento-c0 … --bento-c5, the Colour style's tile colours

  /* ---- this device's tile sizes and order ---- */
  const KEY = 'bento_tiles:' + APP;
  let saved = { sizes: {}, order: [] };
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') saved = { sizes: s.sizes || {}, order: Array.isArray(s.order) ? s.order : [] }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

  const isFull = (el) => el.classList.contains('full') || el.classList.contains('widget-full');
  const tiles = () => [...wall.querySelectorAll(':scope > .widget')];
  const wid = (el) => el.dataset.wid || '';
  const head = (el) => el.querySelector(':scope > .head, :scope > .widget-head');
  const body = (el) => el.querySelector(':scope > .body, :scope > .widget-body');
  const px = (v) => parseFloat(v) || 0;
  let on = false;

  function usual(el) {   // the widget's own size when it opened, before the grid takes over
    if (!el.dataset.bw) {
      el.dataset.bw = Math.round(px(el.style.width) || el.offsetWidth || 320);
      el.dataset.bh = Math.round(px(el.style.height) || el.offsetHeight || 360);
    }
    return [Number(el.dataset.bw), Number(el.dataset.bh)];
  }
  function sizeOf(el) {
    const id = wid(el);
    if (saved.sizes[id] && SIZES.includes(saved.sizes[id])) return saved.sizes[id];
    if ((START[APP] || {})[id]) return START[APP][id];
    if (isFull(el)) return 'full';
    const [w, h] = usual(el);
    if (w <= 260 && h <= 320) return 'small';
    if (h <= 340) return 'wide';
    return 'large';
  }
  function orderOf(el) {
    const i = saved.order.indexOf(wid(el));
    return i < 0 ? 1000 + tiles().indexOf(el) : i;
  }

  /* ---- edges: keep the grid clear of the top bar, the dock and any side docks ---- */
  function edges() {
    const shown = (sel) => [...document.querySelectorAll(sel)].map((x) => x.getBoundingClientRect()).filter((r) => r.width && r.height);
    const bar = shown('header.top, header.topbar').reduce((m, r) => (r.top < 60 ? Math.max(m, r.bottom) : m), 0);
    root.style.setProperty('--bento-bar', Math.round(bar) + 'px');   // TeachersDeck / AdminDeck: their top dock sits under it on a phone
    const tdock = document.getElementById('dock-top');
    if (tdock && narrow.matches && !tdock.dataset.bentoScrolled) { tdock.scrollLeft = tdock.scrollWidth; tdock.dataset.bentoScrolled = '1'; }   // Settings (at the end) in view
    const top = shown('#dock-top:not([hidden])').reduce((m, r) => (r.top < bar + 20 ? Math.max(m, r.bottom) : m), bar);
    const dock = shown('#dock-wrap').reduce((m, r) => Math.max(m, innerHeight - r.top), 0);
    const left = shown('#dock-left:not([hidden])').reduce((m, r) => (r.left < 40 ? Math.max(m, r.right) : m), 0);
    const right = shown('#dock-right:not([hidden])').reduce((m, r) => (r.right > innerWidth - 40 ? Math.max(m, innerWidth - r.left) : m), 0);
    const s = root.style;
    s.setProperty('--bento-top', Math.round(top) + 'px');
    s.setProperty('--bento-bottom', Math.round(Math.min(dock, innerHeight * 0.4)) + 'px');
    s.setProperty('--bento-left', Math.round(left) + 'px');
    s.setProperty('--bento-right', Math.round(right) + 'px');
  }

  /* ---- the grid ---- */
  function layout() {
    if (!on) return;
    edges();
    const phone = narrow.matches, short = innerHeight <= 500;   // short: a phone held sideways
    root.classList.toggle('bento-phone', phone);
    root.classList.toggle('bento-tablet', !phone);
    if (root.classList.contains('bento-short') !== short) { root.classList.toggle('bento-short', short); edges(); }
    const pad = phone ? 12 : 18;
    const width = wall.clientWidth - pad * 2;
    const cols = phone ? 2 : Math.max(3, Math.min(6, Math.floor((width + GAP) / (210 + GAP))));
    const colW = (width - GAP * (cols - 1)) / cols;
    const rowH = Math.round(phone ? Math.min(200, Math.max(150, colW)) : short ? Math.min(160, Math.max(130, colW * 0.6)) : Math.min(240, Math.max(170, colW * 0.86)));
    wall.style.setProperty('--bento-cols', cols);
    wall.style.setProperty('--bento-row', rowH + 'px');
    wall.style.setProperty('--bento-pad', pad + 'px');
    const items = tiles().sort((a, b) => orderOf(a) - orderOf(b)).map((el) => {
      usual(el); dress(el);
      const size = sizeOf(el);
      const [c, r] = { small: [1, 1], wide: [2, 1], large: [2, 2], full: [cols, phone ? 4 : 3] }[size];
      el.dataset.bentoSize = size;
      return { el, c: Math.min(c, cols), r: (el.classList.contains('min') || el.classList.contains('minimized')) ? 1 : r };
    });
    pack(items, cols);
    for (const it of items) {
      it.el.style.gridColumn = `${it.x + 1} / span ${it.c}`;
      it.el.style.gridRow = `${it.y + 1} / span ${it.r}`;
      const h = [...wid(it.el)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);   // the Colour style: each widget keeps its colour
      it.el.style.setProperty('--bento-tint', `var(--bento-c${h % PALETTE})`);
    }
    fitAll();
  }

  /* Tiles in order, each in the first place it fits (like Windows' Start); then any hole left in the grid is filled by
     stretching the tile beside it, so every row ends flush, the way the tiles are drawn in the design. */
  function pack(items, cols) {
    const grid = [];
    const at = (x, y) => (grid[y] ? grid[y][x] : undefined);
    const take = (x, y, c, r, it) => { for (let j = y; j < y + r; j++) { grid[j] = grid[j] || []; for (let i = x; i < x + c; i++) grid[j][i] = it; } };
    const fits = (x, y, c, r) => { if (x + c > cols) return false; for (let j = y; j < y + r; j++) for (let i = x; i < x + c; i++) if (at(i, j)) return false; return true; };
    for (const it of items) {
      for (let y = 0, done = false; !done; y++) for (let x = 0; x < cols && !done; x++) if (fits(x, y, it.c, it.r)) { it.x = x; it.y = y; take(x, y, it.c, it.r, it); done = true; }
    }
    const colFree = (x, y, r) => { for (let j = y; j < y + r; j++) if (at(x, j)) return false; return true; };
    for (let y = 0; y < grid.length; y++) for (let x = 0; x < cols; x++) {
      if (at(x, y)) continue;
      const left = x > 0 && at(x - 1, y), right = at(x + 1, y);
      if (left && left.x + left.c === x && left.y >= 0 && colFree(x, left.y, left.r)) { take(x, left.y, 1, left.r, left); left.c++; }
      else if (right && right.x === x + 1 && colFree(x, right.y, right.r)) { take(x, right.y, 1, right.r, right); right.x--; right.c++; }
    }
  }

  /* Live-tile content: a widget bigger than its tile is shrunk (CSS zoom, never below 60%) so the tile shows all of it. */
  function fit(el) {
    const b = body(el);
    if (!b) return;
    b.style.zoom = '';
    if (!on || el.classList.contains('bento-open') || el.classList.contains('min') || el.classList.contains('minimized')) return;
    const z = Math.max(0.6, Math.min(1, b.clientHeight / (b.scrollHeight || 1), b.clientWidth / (b.scrollWidth || 1)));
    if (z < 0.97) b.style.zoom = z.toFixed(3);
  }
  const fitAll = () => requestAnimationFrame(() => tiles().forEach(fit));

  /* ---- tile buttons and menu ---- */
  const SVG = (d) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const EXPAND = SVG('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>');
  const SHRINK = SVG('<path d="M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7"/>');
  const MORE = SVG('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>');
  function dress(el) {   // ⋯ and ⤢ in the title bar, once
    const h = head(el);
    if (!h || h.querySelector('.bento-btn')) return;
    const box = document.createElement('span'); box.className = 'bento-btns';
    box.innerHTML = `<button type="button" class="bento-btn bento-more" aria-label="Tile options" title="Tile options" aria-haspopup="menu">${MORE}</button><button type="button" class="bento-btn bento-x" aria-label="Open full screen" title="Open full screen" aria-pressed="false">${EXPAND}</button>`;
    box.querySelector('.bento-more').addEventListener('click', (e) => { e.stopPropagation(); menu(el, e.currentTarget); });
    box.querySelector('.bento-x').addEventListener('click', (e) => { e.stopPropagation(); setOpen(el, !el.classList.contains('bento-open')); });
    h.appendChild(box);
    el.classList.add('bento-new'); setTimeout(() => el.classList.remove('bento-new'), 700);
    [300, 1200, 2500].forEach((t) => setTimeout(() => fit(el), t));   // content that arrives later (cloud data, fonts)
  }
  function setOpen(el, open) {
    for (const x of tiles()) if (x !== el && x.classList.contains('bento-open')) setOpen(x, false);
    el.classList.toggle('bento-open', open);
    const b = el.querySelector('.bento-x');
    if (b) { b.innerHTML = open ? SHRINK : EXPAND; const l = open ? 'Back to the tiles' : 'Open full screen'; b.setAttribute('aria-label', l); b.title = l; b.setAttribute('aria-pressed', String(open)); }
    fit(el);
    if (!open) el.scrollIntoView({ block: 'nearest' });
  }
  function move(el, by) {
    const ids = tiles().sort((a, b) => orderOf(a) - orderOf(b)).map(wid).filter(Boolean);
    const i = ids.indexOf(wid(el)), j = i + by;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saved.order = ids; save(); layout();
  }

  let pop = null;
  function closeMenu() { if (pop) { pop.remove(); pop = null; } }
  function menu(el, anchor) {
    closeMenu();
    const id = wid(el), size = el.dataset.bentoSize;
    pop = document.createElement('div');
    pop.className = 'bento-menu'; pop.setAttribute('role', 'menu');
    pop.innerHTML = `<div class="bento-menu-sizes" role="group" aria-label="Size">${SIZES.map((s) => `<button type="button" role="menuitemradio" aria-checked="${s === size}" data-size="${s}"><i class="bento-sz bento-sz-${s}"></i>${SIZE_NAMES[s]}</button>`).join('')}</div>
      <button type="button" role="menuitem" data-act="earlier">Move earlier</button><button type="button" role="menuitem" data-act="later">Move later</button>
      <button type="button" role="menuitem" data-act="open">${el.classList.contains('bento-open') ? 'Back to the tiles' : 'Open full screen'}</button>
      <button type="button" role="menuitem" data-act="close" class="bento-danger">Close</button>`;
    document.body.appendChild(pop);
    const r = (anchor || head(el) || el).getBoundingClientRect(), m = pop.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(innerWidth - m.width - 8, r.right - m.width)) + 'px';
    pop.style.top = (r.bottom + m.height + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - m.height - 6)) + 'px';
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.size) { saved.sizes[id] = b.dataset.size; save(); layout(); }
      else if (b.dataset.act === 'earlier') move(el, -1);
      else if (b.dataset.act === 'later') move(el, 1);
      else if (b.dataset.act === 'open') setOpen(el, !el.classList.contains('bento-open'));
      else if (b.dataset.act === 'close') { const close = el.querySelector('.widget-close, [data-w="close"]'); if (close) close.click(); else if (typeof closeWidget === 'function') closeWidget(id); }
      closeMenu();
    });
    const first = pop.querySelector('[aria-checked="true"]') || pop.querySelector('button'); if (first) first.focus();
  }
  document.addEventListener('pointerdown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('.bento-more')) closeMenu(); }, true);

  /* A finger on a title bar scrolls the grid instead of dragging the widget (the apps' drag handlers never see it);
     pressing and holding it (or right-clicking) opens the tile menu. */
  let hold = null;
  wall.addEventListener('pointerdown', (e) => {
    if (!on || e.target.closest('button, a, input, select, textarea, [contenteditable]')) return;
    const h = e.target.closest('.head, .widget-head, .grip, .widget-resize');
    const el = h && h.closest('.widget');
    if (!el || el.parentNode !== wall || el.classList.contains('bento-open')) return;
    e.stopPropagation();
    const x = e.clientX, y = e.clientY;
    clearTimeout(hold && hold.t);
    hold = { t: setTimeout(() => { hold = null; if (navigator.vibrate) navigator.vibrate(12); menu(el, h); }, 550), x, y };
  }, true);
  const cancelHold = (e) => { if (hold && (!e || e.type !== 'pointermove' || Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 8)) { clearTimeout(hold.t); hold = null; } };
  ['pointerup', 'pointercancel', 'pointermove'].forEach((t) => wall.addEventListener(t, cancelHold, true));
  wall.addEventListener('contextmenu', (e) => {
    if (!on) return;
    const h = e.target.closest('.head, .widget-head'); const el = h && h.closest('.widget');
    if (el && el.parentNode === wall) { e.preventDefault(); cancelHold(); menu(el, h); }
  });
  document.addEventListener('keydown', (e) => {
    if (!on || e.key !== 'Escape') return;
    if (pop) { closeMenu(); e.stopPropagation(); return; }
    const open = wall.querySelector(':scope > .widget.bento-open');
    if (open) { setOpen(open, false); e.stopPropagation(); }
  }, true);

  /* ---- the dock: each icon's name above it (one tooltip outside the dock, so the dock can scroll sideways) ---- */
  const tip = document.createElement('div'); tip.className = 'bento-tip'; tip.setAttribute('aria-hidden', 'true');
  let tipTimer = null;
  function showTip(btn, ms) {
    if (!on || !btn) return;
    const label = (btn.querySelector(':scope > span:not(.dock-ic)') || btn).textContent.trim() || btn.title;
    if (!label) return;
    if (!tip.isConnected) document.body.appendChild(tip);
    tip.textContent = label; tip.classList.add('on');
    const r = btn.getBoundingClientRect(), w = tip.offsetWidth;
    tip.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (r.top - tip.offsetHeight - 10) + 'px';
    clearTimeout(tipTimer); if (ms) tipTimer = setTimeout(hideTip, ms);
  }
  function hideTip() { tip.classList.remove('on'); }
  const dockItem = (e) => e.target.closest && e.target.closest('#dock-wrap .dock-item, #dock-left .dock-item, #dock-right .dock-item');
  document.addEventListener('pointerover', (e) => { const b = dockItem(e); if (b && e.pointerType === 'mouse') showTip(b); });
  document.addEventListener('pointerout', (e) => { const b = dockItem(e); if (b && e.pointerType === 'mouse') hideTip(); });
  document.addEventListener('pointerdown', (e) => { const b = dockItem(e); if (b && e.pointerType !== 'mouse') showTip(b, 1100); });
  document.addEventListener('focusin', (e) => { const b = dockItem(e); if (b && b.matches(':focus-visible')) showTip(b, 1600); });

  /* ---- first visit: open the default tiles ---- */
  function seed() {
    const SEEDED = 'bento_seeded:' + APP;
    try { if (localStorage.getItem(SEEDED)) return; localStorage.setItem(SEEDED, '1'); } catch (e) { return; }
    if (typeof openWidget !== 'function' || !DEFAULTS[APP]) return;
    const want = DEFAULTS[APP], have = new Set(tiles().map(wid));
    // the tiles start as exactly the default set: whatever the app opened by itself on a first run gives way
    if (typeof closeWidget === 'function') tiles().forEach((el) => { const id = wid(el); if (id && !want.includes(id)) try { closeWidget(id); } catch (e) {} });
    want.forEach((id, i) => { if (!have.has(id)) setTimeout(() => { try { openWidget(id); } catch (e) {} }, 60 * i); });
    saved.order = want.slice(); save();
    // openWidget() doesn't always save by itself (the dock's toggle does): save the app's state once they're all open
    setTimeout(() => {
      try { if (typeof saveState === 'function') saveState(); else if (typeof saveUI === 'function') saveUI(); } catch (e) {}
      try { if (typeof syncDock === 'function') syncDock(); } catch (e) {}
    }, 60 * want.length + 200);
  }

  /* ---- watch the wall ---- */
  let queued = false;
  const soon = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; layout(); }); };
  new MutationObserver(() => { if (on) soon(); }).observe(wall, { childList: true });
  new MutationObserver((list) => { if (on && list.some((m) => m.target.parentNode === wall)) soon(); }).observe(wall, { attributes: true, attributeFilter: ['class'], subtree: true });   // minimised, opened…

  /* ---- the two settings, in each app's Settings (TeachersDeck, StudentDeck, AdminDeck: the Settings drawer; ParentDeck:
     its Settings widget). Drawn by this file so all four apps get the same control. ---- */
  function settingsBlock() {
    const box = document.createElement('div');
    box.className = 'bento-set';
    const seg = (name, list, names, cur) => `<div class="bento-seg" role="radiogroup" aria-label="${name}">${list.map((v) => `<button type="button" role="radio" aria-checked="${v === cur}" data-v="${v}">${names[v]}</button>`).join('')}</div>`;
    const draw = () => {
      box.innerHTML = `<p class="drawer-label bento-set-label">${T('Tiles', 'Ô gạch')}</p>
        ${seg(T('Tiles', 'Ô gạch'), LAYOUTS, LAYOUT_NAMES(), prefs.layout).replace('class="bento-seg"', 'class="bento-seg" data-k="layout"')}
        <p class="bento-hint">${{ auto: T('Tiles on touch screens and small windows, floating windows with a mouse.', 'Ô gạch trên màn hình cảm ứng và cửa sổ nhỏ, cửa sổ nổi khi dùng chuột.'), tiles: T('Tiles everywhere, also with a mouse.', 'Luôn dùng ô gạch, kể cả khi dùng chuột.'), floating: T('Floating windows everywhere, also on touch screens. On a phone they don’t fit well.', 'Luôn dùng cửa sổ nổi, kể cả trên màn hình cảm ứng. Trên điện thoại sẽ hơi chật.') }[prefs.layout]}</p>
        <p class="drawer-label bento-set-label">${T('Tile style', 'Kiểu ô gạch')}</p>
        ${seg(T('Tile style', 'Kiểu ô gạch'), THEMES, THEME_NAMES(), prefs.theme).replace('class="bento-seg"', 'class="bento-seg bento-seg-themes" data-k="theme"')}`;
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      prefs[b.closest('[data-k]').dataset.k] = b.dataset.v; savePrefs(); applyTheme(); update(); draw();
    });
    box.redraw = draw; draw();
    return box;
  }
  function placeSettings() {
    const spots = [document.querySelector('#settings-drawer .drawer-body'), document.querySelector('#wall > .widget[data-wid="settings"] > .body')].filter(Boolean);
    for (const spot of spots) if (!spot.querySelector(':scope > .bento-set')) spot.prepend(settingsBlock());
  }
  new MutationObserver(placeSettings).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(() => document.querySelectorAll('.bento-set').forEach((b) => b.redraw && b.redraw())).observe(root, { attributes: true, attributeFilter: ['lang'] });
  function applyTheme() { root.dataset.bentoTheme = prefs.theme; }
  applyTheme();
  placeSettings();

  function update() {
    const want = forced || prefs.layout === 'tiles' || (prefs.layout === 'auto' && (touch.matches || narrow.matches));
    if (want !== on) {
      on = want;
      root.classList.toggle('bento', on);
      if (on) { tiles().forEach((el) => { usual(el); dress(el); }); seed(); }
      else { root.classList.remove('bento-phone', 'bento-tablet'); tiles().forEach((el) => { setOpen(el, false); el.style.order = ''; }); closeMenu(); hideTip(); }
    }
    layout();
  }
  [touch, narrow].forEach((q) => (q.addEventListener ? q.addEventListener('change', update) : q.addListener(update)));
  addEventListener('resize', soon);
  addEventListener('orientationchange', () => setTimeout(update, 150));
  update();
  setTimeout(layout, 400);   // again once fonts, the top bar and the dock have settled
})();
