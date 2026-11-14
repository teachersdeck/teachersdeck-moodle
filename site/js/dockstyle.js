/* Dock styles (Item Store, owner 10 Nov 2026): the widget launcher can look and open in five ways besides the app's
 * standard docks. Each style is a store item (kind 'dock'); this file is the app code that draws them. Same file in
 * StudentDeck and ParentDeck (tools/check_shared.py). The app tells it about its widgets with configure().
 *
 *   float    the bottom dock floats and bobs, icons only (labels on hover), up to 9 widgets + a button for the widget tray
 *   magnify  the same 9 + tray, icons grow as the pointer passes
 *   sidebar  a 56px icon rail on the left, two levels: categories (with the class, Favourites, All widgets, Theme,
 *            language, Light / Dark, Settings, Keep open), then the chosen category's widgets beside it; the app's
 *            docks and top bar step aside (menus scope, owner 11 Nov 2026)
 *   circle   one round button (bottom left; AgentDeck keeps the bottom right) opens two rings: Favourites, the categories
 *            and a gear inside, icons only; the chosen list outside, at most 8 + More (menus scope, owner 11 Nov 2026)
 *   radial   right-click (or long-press) on an empty part of the wall opens the same two rings at the pointer; the
 *            standard docks stay
 * Esc or a click outside closes a ring; Tab moves through every button. */
(function (root) {
  'use strict';
  var STYLES = ['standard', 'float', 'magnify', 'sidebar', 'circle', 'radial'];
  var MAX_DOCK = 9;
  var cfg = null, style = 'standard', nodes = {}, observer = null, pinned = false;
  try { pinned = localStorage.getItem('dockstyle.pinned') === '1'; } catch (e) {}

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function L(k) { return (cfg && cfg.labels && cfg.labels[k]) || k; }
  var TRAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
  var PIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3z"/></svg>';

  function widgetButton(w, cls) {
    var b = el('button', cls, '<span class="dk-ic">' + w.icon + '</span><span class="dk-lb">' + esc(w.label) + '</span>');
    b.type = 'button'; b.dataset.id = w.id; b.title = w.label; b.setAttribute('aria-label', w.label);
    if (cfg.isOpen(w.id)) b.classList.add('on');
    b.addEventListener('click', function (e) { e.stopPropagation(); launch(w.id); closeRings(); refresh(); });
    return b;
  }
  function trayButton(cls) {
    var b = el('button', cls, '<span class="dk-ic">' + TRAY_ICON + '</span><span class="dk-lb">' + esc(L('tray')) + '</span>');
    b.type = 'button'; b.title = L('tray'); b.setAttribute('aria-label', L('tray'));
    b.addEventListener('click', function (e) { e.stopPropagation(); closeRings(); cfg.openTray(); });
    return b;
  }

  /* ---------- float / magnify: the app's own bottom dock, trimmed to 9 with a tray button ---------- */
  function decorateDock() {
    var dock = document.getElementById('dock'); if (!dock) return;
    if (observer) observer.disconnect();
    var items = dock.querySelectorAll('.dock-item[data-id]');   // widget icons only: the tray button (and a drag's placeholder) never count toward the 9
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('dk-over', i >= MAX_DOCK);
    var t = dock.querySelector('.dk-tray-btn');
    if (!t) { t = trayButton('dock-item dk-tray-btn'); dock.appendChild(t); } else dock.appendChild(t);   // keep it last
    observer = new MutationObserver(function () { if (style === 'float' || style === 'magnify') decorateDock(); });
    observer.observe(dock, { childList: true });
  }
  function undecorateDock() {
    if (observer) { observer.disconnect(); observer = null; }
    var dock = document.getElementById('dock'); if (!dock) return;
    var t = dock.querySelector('.dk-tray-btn'); if (t) t.remove();
    Array.prototype.forEach.call(dock.querySelectorAll('.dk-over'), function (x) { x.classList.remove('dk-over'); });
    Array.prototype.forEach.call(dock.querySelectorAll('.dock-item'), function (x) { x.style.removeProperty('--dk-scale'); });
  }
  function onMagnify(e) {
    var dock = document.getElementById('dock'); if (!dock) return;
    Array.prototype.forEach.call(dock.querySelectorAll('.dock-item:not(.dk-over)'), function (b) {
      var r = b.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
      b.style.setProperty('--dk-scale', (1 + 0.55 * Math.max(0, 1 - d / 130)).toFixed(3));
    });
  }
  function offMagnify() {
    var dock = document.getElementById('dock'); if (!dock) return;
    Array.prototype.forEach.call(dock.querySelectorAll('.dock-item'), function (b) { b.style.setProperty('--dk-scale', '1'); });
  }

  /* ---------- sidebar: two levels (menus scope, owner 11 Nov 2026) ----------
   * A 56px rail; hover, focus or a tap opens level 1 (220px, names beside the icons): the class, Favourites, each
   * category, All widgets, then Theme, language, Light / Dark, Settings and Keep open. Pointing at (or tapping) the
   * class, Favourites, a category or the language opens level 2 beside it: a search box and that list. Level 2 opens
   * after the pointer rests 150 ms, so travelling to it never flicks to the neighbouring row. A widget click opens it
   * and folds the sidebar unless Keep open is on; right-click a widget in level 2 adds it to (or drops it from) your
   * own Favourites. Folds 400 ms after the pointer leaves, or after 8 s with no pointer or key in it (projector rule).
   * Keyboard: Up / Down through a level, Right or Enter opens level 2, Left or Esc goes back, Esc again folds it.
   * The app's own rows come from cfg.nav (all optional): classLabel(), classes() -> [{ id, label, active }],
   * switchClass(id), languages() -> [{ code, label, active }], langLabel(), setLanguage(code), isLight(),
   * toggleMode(), openTheme(), openSettings(), catIcon(catId) -> svg. */
  var IC = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.5l1-5.8-4.2-4.1 5.8-.8z"/></svg>',
    theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 13.6c2.6.3 4.5 2.3 4.5 5"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    chev: '<svg class="dk-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  var sb = { key: null, openT: 0, closeT: 0, idleT: 0, ptr: 'mouse' };
  var FAV_KEY = 'dockstyle.favs';
  function ownFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]').filter(function (x) { return typeof x === 'string'; }); } catch (e) { return []; } }
  function setOwnFavs(a) { try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) {} }
  function nav() { return (cfg && cfg.nav) || {}; }
  function sbRow(key, icon, label, opts) {
    opts = opts || {};
    var b = el('button', 'dk-sb-item' + (opts.cls ? ' ' + opts.cls : ''), '<span class="dk-ic">' + icon + '</span><span class="dk-lb">' + esc(label) + '</span>' + (opts.panel ? IC.chev : ''));
    b.type = 'button'; b.dataset.key = key; b.title = label; b.setAttribute('aria-label', label);
    if (opts.panel) { b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-expanded', 'false'); }
    b.addEventListener('mouseenter', function () {
      clearTimeout(sb.openT);
      sb.openT = setTimeout(function () { if (opts.panel) openPanel(key, false); else if (sb.key) closePanel(); }, 150);
    });
    b.addEventListener('mouseleave', function () { clearTimeout(sb.openT); });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var s = nodes.sidebar;
      if (sb.ptr === 'touch' && s && !s.classList.contains('expanded') && !s.classList.contains('pinned')) { expand(); if (opts.panel) openPanel(key, false); return; }
      if (opts.panel) { openPanel(key, true); return; }
      if (opts.action) opts.action(b);
    });
    return b;
  }
  function sbSep() { return el('div', 'dk-sb-sep'); }
  function buildSidebar() {
    var s = nodes.sidebar || (nodes.sidebar = el('nav', 'dk-sidebar'));
    var n = nav();
    s.setAttribute('aria-label', L('widgets'));
    s.classList.toggle('pinned', pinned);
    s.innerHTML = '';
    var top = el('div', 'dk-sb-scroll');
    if (n.classes) { top.appendChild(sbRow('class', IC.people, n.classLabel ? n.classLabel() : L('classes'), { panel: true, cls: 'dk-sb-class' })); top.appendChild(sbSep()); }
    top.appendChild(sbRow('fav', IC.star, L('favourites'), { panel: true }));
    cfg.categories().forEach(function (c) {
      if (!cfg.widgets().some(function (w) { return w.cat === c[0]; })) return;
      top.appendChild(sbRow('cat:' + c[0], (n.catIcon && n.catIcon(c[0])) || IC.folder, c[1], { panel: true }));
    });
    top.appendChild(trayRow());
    s.appendChild(top);
    var foot = el('div', 'dk-sb-foot');
    if (n.openTheme) foot.appendChild(sbRow('theme', IC.theme, L('theme'), { action: function () { foldAll(true); n.openTheme(); } }));
    if (n.languages) foot.appendChild(sbRow('lang', IC.globe, n.langLabel ? n.langLabel() : L('language'), { panel: true }));
    if (n.toggleMode) foot.appendChild(modeRow());
    if (n.openSettings) foot.appendChild(sbRow('settings', IC.gear, L('settings'), { action: function () { foldAll(true); n.openSettings(); } }));
    var pin = sbRow('pin', PIN_ICON, L(pinned ? 'unpin' : 'pin'), { cls: 'dk-pin' + (pinned ? ' on' : ''), action: function () {
      pinned = !pinned; try { localStorage.setItem('dockstyle.pinned', pinned ? '1' : '0'); } catch (e) {}
      document.body.classList.toggle('dk-pinned', pinned); s.classList.toggle('pinned', pinned);
      var lb = pin.querySelector('.dk-lb'); if (lb) lb.textContent = L(pinned ? 'unpin' : 'pin');
      pin.classList.toggle('on', pinned); pin.setAttribute('aria-pressed', String(pinned));
    } });
    pin.setAttribute('aria-pressed', String(pinned));
    foot.appendChild(pin);
    s.appendChild(foot);
    if (!s._wired) {
      s._wired = true;
      s.addEventListener('pointerdown', function (e) { sb.ptr = e.pointerType || 'mouse'; }, true);
      s.addEventListener('mouseenter', function () { clearTimeout(sb.closeT); expand(); });
      s.addEventListener('mouseleave', laterFold);
      s.addEventListener('focusin', function () { clearTimeout(sb.closeT); expand(); });
      s.addEventListener('mousemove', idle); s.addEventListener('keydown', railKeys);
    }
    if (!s.parentNode) document.body.appendChild(s);
    document.body.classList.toggle('dk-pinned', pinned);
  }
  function trayRow() { return sbRow('tray', TRAY_ICON, L('tray'), { action: function () { foldAll(true); cfg.openTray(); } }); }
  function modeRow() {
    var n = nav(), light = n.isLight && n.isLight();
    return sbRow('mode', light ? IC.sun : IC.moon, light ? L('light') : L('dark'), { action: function (b) {
      n.toggleMode();
      var now = n.isLight && n.isLight();
      b.querySelector('.dk-ic').innerHTML = now ? IC.sun : IC.moon;
      b.querySelector('.dk-lb').textContent = now ? L('light') : L('dark');
    } });
  }
  function expand() { var s = nodes.sidebar; if (!s) return; s.classList.add('expanded'); idle(); }
  function idle() { clearTimeout(sb.idleT); sb.idleT = setTimeout(function () { foldAll(false); }, 8000); }
  function laterFold() { clearTimeout(sb.closeT); sb.closeT = setTimeout(function () { foldAll(false); }, 400); }
  function foldAll(force) {
    clearTimeout(sb.openT); clearTimeout(sb.closeT); clearTimeout(sb.idleT);
    var s = nodes.sidebar;
    if (!force && s && s.contains(document.activeElement) && !s.matches(':hover')) { /* keyboard user still inside */ }
    closePanel();
    if (s) s.classList.remove('expanded');
  }
  function closePanel() {
    sb.key = null;
    if (nodes.panel) { nodes.panel.remove(); nodes.panel = null; }
    if (nodes.sidebar) Array.prototype.forEach.call(nodes.sidebar.querySelectorAll('.dk-sb-item.open'), function (b) { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); });
  }
  function panelWidget(w) {
    var b = el('button', 'dk-sb-item dk-pw' + (cfg.isOpen(w.id) ? ' on' : '') + (ownFavs().indexOf(w.id) >= 0 ? ' fav' : ''), '<span class="dk-ic">' + w.icon + '</span><span class="dk-lb">' + esc(w.label) + '</span>');
    b.type = 'button'; b.dataset.id = w.id; b.title = w.label; b.setAttribute('aria-label', w.label);
    b.addEventListener('click', function (e) { e.stopPropagation(); launch(w.id); if (pinned) refresh(); else foldAll(true); });
    b.addEventListener('contextmenu', function (e) {
      e.preventDefault(); e.stopPropagation();
      var f = ownFavs(), i = f.indexOf(w.id);
      if (i >= 0) f.splice(i, 1); else f.push(w.id);
      setOwnFavs(f); b.classList.toggle('fav', i < 0);
      if (sb.key === 'fav') openPanel('fav', false);
    });
    return b;
  }
  function panelItems(key, q) {
    var n = nav(), ws = cfg.widgets();
    var byLabel = function (a, b) { return a.label.localeCompare(b.label); };
    var match = function (w) { return !q || w.label.toLowerCase().indexOf(q) >= 0; };
    if (key === 'class') return (n.classes() || []).filter(function (c) { return match(c); }).map(function (c) {
      var b = el('button', 'dk-sb-item dk-pw' + (c.active ? ' on' : ''), '<span class="dk-ic">' + IC.people + '</span><span class="dk-lb">' + esc(c.label) + '</span>');
      b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); n.switchClass(c.id); foldAll(true); updateNavRows(); });
      return b;
    });
    if (key === 'lang') return (n.languages() || []).filter(function (l) { return match(l); }).map(function (l) {
      var b = el('button', 'dk-sb-item dk-pw' + (l.active ? ' on' : ''), '<span class="dk-ic dk-code">' + esc(l.code.toUpperCase()) + '</span><span class="dk-lb">' + esc(l.label) + '</span>');
      b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); n.setLanguage(l.code); foldAll(true); updateNavRows(); });
      return b;
    });
    var list;
    if (q) list = ws.filter(match).sort(byLabel);   // typing searches every widget, not just this list
    else if (key === 'fav') {
      var ids = cfg.favourites().concat(ownFavs()), seen = {};
      list = ids.filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; })
        .map(function (id) { return ws.filter(function (w) { return w.id === id; })[0]; }).filter(Boolean);
    } else list = ws.filter(function (w) { return 'cat:' + w.cat === key; }).sort(byLabel);
    return list.map(panelWidget);
  }
  function openPanel(key, focusSearch) {
    var s = nodes.sidebar; if (!s) return;
    expand();
    sb.key = key;
    Array.prototype.forEach.call(s.querySelectorAll('.dk-sb-item[data-key]'), function (b) { var on = b.dataset.key === key; b.classList.toggle('open', on); if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', String(on)); });
    var row = s.querySelector('.dk-sb-item[data-key="' + key + '"]');
    var p = nodes.panel || (nodes.panel = el('div', 'dk-sb-panel'));
    p.innerHTML = '';
    p.setAttribute('role', 'menu');
    var title = row ? row.querySelector('.dk-lb').textContent : '';
    var count = key.indexOf('cat:') === 0 ? cfg.widgets().filter(function (w) { return 'cat:' + w.cat === key; }).length : 0;
    p.appendChild(el('p', 'dk-sb-ph', esc(title) + (count ? ' <span class="dk-sb-count">' + count + '</span>' : '')));
    var search = el('input', 'dk-sb-search'); search.type = 'search'; search.placeholder = L(key === 'lang' ? 'searchLang' : key === 'class' ? 'searchClass' : 'search');
    search.setAttribute('aria-label', search.placeholder);
    p.appendChild(search);
    var list = el('div', 'dk-sb-list'); p.appendChild(list);
    function fill() {
      list.innerHTML = '';
      var items = panelItems(key, search.value.trim().toLowerCase());
      if (!items.length) list.appendChild(el('p', 'dk-sb-empty', esc(L(key === 'fav' && !search.value ? 'noFavs' : 'noMatch'))));
      items.forEach(function (b) { b.setAttribute('role', 'menuitem'); list.appendChild(b); });
    }
    fill();
    search.addEventListener('input', fill);
    if (!p._wired) {
      p._wired = true;
      p.addEventListener('mouseenter', function () { clearTimeout(sb.closeT); clearTimeout(sb.openT); });
      p.addEventListener('mouseleave', laterFold);
      p.addEventListener('mousemove', idle);
      p.addEventListener('keydown', panelKeys);
      p.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    }
    if (!p.parentNode) document.body.appendChild(p);
    if (focusSearch) search.focus();
  }
  function focusables(root) { return Array.prototype.slice.call(root.querySelectorAll('button.dk-sb-item,input.dk-sb-search')); }
  function moveFocus(root, d) { var f = focusables(root), i = f.indexOf(document.activeElement); var nx = f[Math.max(0, Math.min(f.length - 1, i + d))]; if (nx) nx.focus(); }
  function railKeys(e) {
    idle();
    var b = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.dk-sb-item[data-key]') : null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(nodes.sidebar, e.key === 'ArrowDown' ? 1 : -1); var nb = document.activeElement; if (nb && nb.getAttribute('aria-haspopup')) openPanel(nb.dataset.key, false); else closePanel(); }
    else if ((e.key === 'ArrowRight' || e.key === 'Enter') && b && b.getAttribute('aria-haspopup')) { e.preventDefault(); openPanel(b.dataset.key, true); }
    else if (e.key === 'Escape') { e.preventDefault(); if (sb.key) closePanel(); else { foldAll(true); if (document.activeElement) document.activeElement.blur(); } }
  }
  function panelKeys(e) {
    idle();
    var inSearch = document.activeElement && document.activeElement.classList.contains('dk-sb-search');
    if (e.key === 'ArrowDown' || (e.key === 'ArrowUp' && !inSearch)) { e.preventDefault(); moveFocus(nodes.panel, e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Escape' || (e.key === 'ArrowLeft' && !inSearch)) {
      e.preventDefault(); var key = sb.key; closePanel();
      var row = nodes.sidebar && nodes.sidebar.querySelector('.dk-sb-item[data-key="' + key + '"]'); if (row) row.focus();
    } else if (!inSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var s = nodes.panel.querySelector('.dk-sb-search'); if (s) { s.focus(); }   // typing a letter types into the search
    }
  }
  /** Rewrites the rows whose text depends on the app (class name, language, Light / Dark) without closing anything. */
  function updateNavRows() {
    var s = nodes.sidebar, n = nav(); if (!s) return;
    var set = function (key, text) { var b = s.querySelector('.dk-sb-item[data-key="' + key + '"] .dk-lb'); if (b) { b.textContent = text; b.parentNode.title = text; b.parentNode.setAttribute('aria-label', text); } };
    if (n.classLabel) set('class', n.classLabel());
    if (n.langLabel) set('lang', n.langLabel());
    var m = s.querySelector('.dk-sb-item[data-key="mode"]');
    if (m && n.isLight) { var lt = n.isLight(); m.querySelector('.dk-ic').innerHTML = lt ? IC.sun : IC.moon; m.querySelector('.dk-lb').textContent = lt ? L('light') : L('dark'); }
  }
  document.addEventListener('pointerdown', function (e) {   // a tap outside folds it (touch has no "pointer leaves")
    if (style !== 'sidebar' || !nodes.sidebar || nodes.sidebar.contains(e.target) || (nodes.panel && nodes.panel.contains(e.target))) return;
    if (nodes.sidebar.classList.contains('expanded')) foldAll(true);
  });

  /* ---------- circle and radial: two rings (menus scope, owner 11 Nov 2026) ----------
   * Inner ring: Favourites, each category and a gear, icons only. The hub in the middle shows the name of whatever the
   * pointer or focus is on (a click on it opens All widgets). Outer ring: the chosen list, at most 8 icons plus a
   * "+N" More button that opens the rest in a panel beside the ring (search + a grid of icons with names). The order
   * is most-used on this device (counted from opens; cfg.ringDefaults[catId] breaks ties on a fresh install) until
   * the teacher drags an icon: dropping an icon on another swaps them, from the ring or from the More panel, and that
   * list keeps the teacher's order from then on. The gear's ring: class, theme, language, Light / Dark, Settings.
   * Touch: the first tap shows the name in the hub, a second tap opens it; a long-press opens it at once.
   * Closes on Esc, a click outside, or after 8 s with no pointer near it. */
  var RING_MAX = 8, USES_KEY = 'dockstyle.uses', ORDER_KEY = 'dockstyle.order';
  function readJSON(k) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function launch(id) { if (!cfg.isOpen(id)) { var u = readJSON(USES_KEY); u[id] = (u[id] || 0) + 1; writeJSON(USES_KEY, u); } cfg.toggle(id); }
  function ringList(key) {
    var ws = cfg.widgets(), list;
    if (key === 'fav') {
      var seen = {};
      list = cfg.favourites().concat(ownFavs()).filter(function (id) { if (seen[id]) return false; seen[id] = 1; return true; })
        .map(function (id) { return ws.filter(function (w) { return w.id === id; })[0]; }).filter(Boolean);
    } else list = ws.filter(function (w) { return 'cat:' + w.cat === key; });
    var order = readJSON(ORDER_KEY)[key], uses = readJSON(USES_KEY);
    var def = (cfg.ringDefaults && cfg.ringDefaults[key.replace('cat:', '')]) || [];
    var rank = function (arr, id) { var i = arr ? arr.indexOf(id) : -1; return i < 0 ? 999 : i; };
    if (order) list.sort(function (a, b) { return rank(order, a.id) - rank(order, b.id) || (uses[b.id] || 0) - (uses[a.id] || 0); });
    else if (key !== 'fav') list.sort(function (a, b) { return (uses[b.id] || 0) - (uses[a.id] || 0) || rank(def, a.id) - rank(def, b.id) || a.label.localeCompare(b.label); });
    return list;
  }
  function swapOrder(key, a, b) {
    var ids = ringList(key).map(function (w) { return w.id; }), i = ids.indexOf(a), j = ids.indexOf(b);
    if (i < 0 || j < 0) return;
    ids[i] = b; ids[j] = a;
    var all = readJSON(ORDER_KEY); all[key] = ids; writeJSON(ORDER_KEY, all);
  }
  var ring = { armed: null, idleT: 0 };
  function closeRingPanel() { if (nodes.ringPanel) { nodes.ringPanel.remove(); nodes.ringPanel = null; } }
  function closeRings() {
    closeRingPanel(); clearTimeout(ring.idleT); ring.armed = null;
    if (nodes.rings) { nodes.rings.remove(); nodes.rings = null; }
    document.removeEventListener('keydown', ringKeys, true);
  }
  function ringKeys(e) {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (nodes.ringPanel) { closeRingPanel(); return; }
    closeRings(); if (nodes.launcher) nodes.launcher.focus();
  }
  function ringIdle() { clearTimeout(ring.idleT); ring.idleT = setTimeout(closeRings, 8000); }
  function place(node, cx, cy, r, a) { var rad = a * Math.PI / 180; node.style.left = (cx + r * Math.sin(rad)) + 'px'; node.style.top = (cy - r * Math.cos(rad)) + 'px'; }
  /** Drag an icon onto a ring icon to swap them (ring order is then the teacher's); a touch long-press opens it instead. */
  function ringDrag(b, key, onSwap) {
    b.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      var x0 = e.clientX, y0 = e.clientY, dragging = false, ghost = null, lp = 0;
      if (e.pointerType === 'touch') lp = setTimeout(function () { if (!dragging) { b._skip = true; launch(b.dataset.id); closeRings(); refresh(); } }, 550);
      function mv(ev) {
        var dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!dragging && dx * dx + dy * dy > 64) {
          dragging = true; clearTimeout(lp);
          ghost = b.cloneNode(true); ghost.className += ' dk-ghost'; ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
          document.body.appendChild(ghost); b.classList.add('dk-dragging');
        }
        if (dragging) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; ev.preventDefault(); }
      }
      function up(ev) {
        document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true);
        clearTimeout(lp);
        if (!dragging) return;
        b._skip = true; ghost.remove(); b.classList.remove('dk-dragging');
        var t = document.elementFromPoint(ev.clientX, ev.clientY); t = t && t.closest && t.closest('.dk-outer .dk-wid[data-id]');
        if (t && t !== b) { swapOrder(key, b.dataset.id, t.dataset.id); onSwap(); }
      }
      document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
    });
  }
  function openRings(cx, cy) {
    closeRings();
    var n = nav(), veil = el('div', 'dk-veil');
    var cats = cfg.categories().filter(function (c) { return cfg.widgets().some(function (w) { return w.cat === c[0]; }); });
    var inner = [{ key: 'fav', label: L('favourites'), icon: IC.star }].concat(cats.map(function (c) { return { key: 'cat:' + c[0], label: c[1], icon: (n.catIcon && n.catIcon(c[0])) || IC.folder }; }));
    if (n.openSettings || n.openTheme || n.languages) inner.push({ key: 'gear', label: L('settings'), icon: IC.gear });
    var W = window.innerWidth, H = window.innerHeight, R1 = 70, R2 = 146, pad = R2 + 34;
    cx = Math.max(pad, Math.min(W - pad, cx)); cy = Math.max(pad, Math.min(H - pad, cy));
    veil.addEventListener('click', closeRings);
    veil.addEventListener('contextmenu', function (e) { e.preventDefault(); closeRings(); });
    veil.addEventListener('pointerdown', function (e) { sb.ptr = e.pointerType || 'mouse'; ringIdle(); }, true);
    veil.addEventListener('pointermove', ringIdle);
    var rg = el('div', 'dk-rings'); rg.style.left = cx + 'px'; rg.style.top = cy + 'px';
    rg.setAttribute('role', 'menu'); rg.setAttribute('aria-label', L('widgets'));
    rg.addEventListener('click', function (e) { e.stopPropagation(); });
    veil.appendChild(rg);
    var hub = el('button', 'dk-hub', '<span class="dk-ic">' + TRAY_ICON + '</span><span class="dk-hub-name"></span>');
    hub.type = 'button'; hub.setAttribute('aria-label', L('tray'));
    hub.addEventListener('click', function (e) { e.stopPropagation(); closeRings(); cfg.openTray(); });
    hub.addEventListener('mouseenter', function () { say(L('tray')); });
    var hubName = hub.querySelector('.dk-hub-name');
    function say(t) { hubName.textContent = t; }
    rg.appendChild(hub);
    var outer = el('div', 'dk-outer'); rg.appendChild(outer);
    var current = null;
    function tapOpen(b, label, act) {
      b.addEventListener('mouseenter', function () { say(label); });
      b.addEventListener('focus', function () { say(label); });
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (b._skip) { b._skip = false; return; }
        if (sb.ptr === 'touch' && ring.armed !== b) { ring.armed = b; say(label); return; }   // first tap: the name; second: open
        act();
      });
    }
    function wid(w, key) {
      var b = el('button', 'dk-wid' + (cfg.isOpen(w.id) ? ' on' : ''), '<span class="dk-ic">' + w.icon + '</span><span class="dk-lb">' + esc(w.label) + '</span>');
      b.type = 'button'; b.dataset.id = w.id; b.setAttribute('aria-label', w.label); b.setAttribute('role', 'menuitem');
      tapOpen(b, w.label, function () { launch(w.id); closeRings(); refresh(); });
      ringDrag(b, key, function () { show(key); });
      return b;
    }
    function action(icon, label, fn) {
      var b = el('button', 'dk-wid', '<span class="dk-ic">' + icon + '</span><span class="dk-lb">' + esc(label) + '</span>');
      b.type = 'button'; b.setAttribute('aria-label', label); b.setAttribute('role', 'menuitem');
      tapOpen(b, label, function () { fn(b); });
      return b;
    }
    function lay(btns, mid) {
      var step = 24, start = mid - (btns.length - 1) * step / 2;
      btns.forEach(function (b, k) { place(b, 0, 0, R2, start + k * step); outer.appendChild(b); });
    }
    function show(key) {
      current = key; closeRingPanel(); outer.innerHTML = '';
      var idx = 0; inner.forEach(function (it, i) { if (it.key === key) idx = i; });
      Array.prototype.forEach.call(rg.querySelectorAll('.dk-cat'), function (b, j) { b.classList.toggle('on', j === idx); b.setAttribute('aria-expanded', String(j === idx)); });
      var mid = idx * 360 / inner.length, btns = [];
      if (key === 'gear') {
        if (n.classes) btns.push(action(IC.people, n.classLabel ? n.classLabel() : L('classes'), function (b) { listPanel(L('classes'), n.classes().map(function (c) { return { label: c.label, on: c.active, icon: IC.people, act: function () { n.switchClass(c.id); updateNavRows(); } }; }), b); }));
        if (n.openTheme) btns.push(action(IC.theme, L('theme'), function () { closeRings(); n.openTheme(); }));
        if (n.languages) btns.push(action(IC.globe, n.langLabel ? n.langLabel() : L('language'), function (b) { listPanel(L('language'), n.languages().map(function (l) { return { label: l.label, on: l.active, code: l.code, act: function () { n.setLanguage(l.code); updateNavRows(); } }; }), b); }));
        if (n.toggleMode) { var lt = n.isLight && n.isLight(); btns.push(action(lt ? IC.sun : IC.moon, lt ? L('light') : L('dark'), function (b) { n.toggleMode(); var now = n.isLight && n.isLight(); b.querySelector('.dk-ic').innerHTML = now ? IC.sun : IC.moon; var t = now ? L('light') : L('dark'); b.querySelector('.dk-lb').textContent = t; b.setAttribute('aria-label', t); say(t); })); }
        if (n.openSettings) btns.push(action(IC.gear, L('settings'), function () { closeRings(); n.openSettings(); }));
        return lay(btns, mid);
      }
      var list = ringList(key), cut = list.length > RING_MAX + 1 ? RING_MAX : list.length;
      list.slice(0, cut).forEach(function (w) { btns.push(wid(w, key)); });
      if (cut < list.length) {
        var rest = list.slice(cut), more = el('button', 'dk-wid dk-more', '<span class="dk-more-n">+' + rest.length + '</span>');
        var ml = L('more') + ' (' + rest.length + ')';
        more.type = 'button'; more.setAttribute('aria-label', ml); more.setAttribute('aria-haspopup', 'true');
        tapOpen(more, ml, function () { morePanel(key, rest, more); });
        btns.push(more);
      }
      lay(btns, mid);
    }
    function panelAt(anchor) {
      closeRingPanel();
      var p = el('div', 'dk-ring-panel'); p.addEventListener('click', function (e) { e.stopPropagation(); });
      var r = anchor.getBoundingClientRect(), x = r.right + 14, y = r.top - 140;
      if (x + 260 > W - 8) x = r.left - 274;
      p.style.left = Math.max(8, x) + 'px'; p.style.top = Math.max(8, Math.min(H - 360, y)) + 'px';
      veil.appendChild(p); nodes.ringPanel = p;
      return p;
    }
    function morePanel(key, rest, anchor) {
      var p = panelAt(anchor), cat = inner.filter(function (it) { return it.key === key; })[0];
      p.appendChild(el('p', 'dk-sb-ph', esc(cat ? cat.label : '') + ' <span class="dk-sb-count">' + rest.length + '</span>'));
      var search = el('input', 'dk-sb-search'); search.type = 'search'; search.placeholder = L('search'); search.setAttribute('aria-label', L('search'));
      p.appendChild(search);
      var grid = el('div', 'dk-rp-grid'); p.appendChild(grid);
      p.appendChild(el('p', 'dk-rp-hint', esc(L('dragHint'))));
      function fill() {
        var q = search.value.trim().toLowerCase(); grid.innerHTML = '';
        var src = q ? cfg.widgets().filter(function (w) { return w.label.toLowerCase().indexOf(q) >= 0; }) : rest;
        if (!src.length) grid.appendChild(el('p', 'dk-sb-empty', esc(L('noMatch'))));
        src.forEach(function (w) {
          var b = el('button', 'dk-rp-item' + (cfg.isOpen(w.id) ? ' on' : ''), '<span class="dk-ic">' + w.icon + '</span><span class="dk-lb">' + esc(w.label) + '</span>');
          b.type = 'button'; b.dataset.id = w.id; b.title = w.label;
          b.addEventListener('click', function (e) { e.stopPropagation(); if (b._skip) { b._skip = false; return; } launch(w.id); closeRings(); refresh(); });
          b.addEventListener('mouseenter', function () { say(w.label); });
          if (!q) ringDrag(b, key, function () { show(key); });
          grid.appendChild(b);
        });
      }
      fill(); search.addEventListener('input', fill); search.focus();
    }
    function listPanel(title, items, anchor) {
      var p = panelAt(anchor);
      p.appendChild(el('p', 'dk-sb-ph', esc(title)));
      var list = el('div', 'dk-sb-list'); p.appendChild(list);
      items.forEach(function (it) {
        var b = el('button', 'dk-sb-item dk-pw' + (it.on ? ' on' : ''), '<span class="dk-ic' + (it.code ? ' dk-code' : '') + '">' + (it.code ? esc(it.code.toUpperCase()) : it.icon) + '</span><span class="dk-lb">' + esc(it.label) + '</span>');
        b.type = 'button'; b.addEventListener('click', function (e) { e.stopPropagation(); it.act(); closeRings(); });
        list.appendChild(b);
      });
    }
    inner.forEach(function (it, i) {
      var b = el('button', 'dk-cat', '<span class="dk-ic">' + it.icon + '</span>');
      b.type = 'button'; b.setAttribute('aria-haspopup', 'true'); b.setAttribute('aria-label', it.label);
      place(b, 0, 0, R1, i * 360 / inner.length);
      b.addEventListener('mouseenter', function () { say(it.label); if (current !== it.key) show(it.key); });
      b.addEventListener('focus', function () { say(it.label); if (current !== it.key) show(it.key); });
      b.addEventListener('click', function (e) { e.stopPropagation(); say(it.label); show(it.key); var f = outer.querySelector('button'); if (f && sb.ptr !== 'touch') f.focus(); });
      rg.appendChild(b);
    });
    document.body.appendChild(veil); nodes.rings = veil;
    nodes.rings._show = show;
    document.addEventListener('keydown', ringKeys, true);
    if (inner.length) { show(inner[0].key); say(inner[0].label); }
    var first = rg.querySelector('.dk-cat'); if (first && sb.ptr !== 'touch') first.focus();
    ringIdle();
  }
  function buildLauncher() {
    var b = nodes.launcher || (nodes.launcher = el('button', 'dk-launcher', TRAY_ICON));
    b.type = 'button'; b.title = L('widgets'); b.setAttribute('aria-label', L('widgets')); b.setAttribute('aria-haspopup', 'menu');
    b.onpointerdown = function (e) { sb.ptr = e.pointerType || 'mouse'; };
    b.onclick = function () { var r = b.getBoundingClientRect(); nodes.rings ? closeRings() : openRings(r.left + r.width / 2, r.top + r.height / 2); };
    if (!b.parentNode) document.body.appendChild(b);
  }
  var press = null;
  function onContext(e) {
    if (style !== 'radial') return;
    var wall = document.getElementById('wall');
    if (!wall || !wall.contains(e.target) || e.target.closest('.widget,.panel,[data-widget],input,textarea,[contenteditable]')) return;
    e.preventDefault(); openRings(e.clientX, e.clientY);
  }
  function onDown(e) {
    sb.ptr = e.pointerType || 'mouse';
    if (style !== 'radial' || e.pointerType !== 'touch') return;
    var x = e.clientX, y = e.clientY, t = e.target;
    press = setTimeout(function () { onContext({ target: t, clientX: x, clientY: y, preventDefault: function () {} }); }, 550);
  }
  function onUp() { clearTimeout(press); }

  /* ---------- switching ---------- */
  function clear() {
    closeRings(); undecorateDock();
    if (nodes.sidebar) { closePanel(); nodes.sidebar.remove(); nodes.sidebar = null; }
    if (nodes.launcher) { nodes.launcher.remove(); nodes.launcher = null; }
    STYLES.forEach(function (s) { document.body.classList.remove('dk-' + s); });
    document.body.classList.remove('dk-pinned');
    var dock = document.getElementById('dock'); if (dock) { dock.removeEventListener('mousemove', onMagnify); dock.removeEventListener('mouseleave', offMagnify); }
    ['bg', 'line', 'ink', 'acc', 'hov'].forEach(function (k) { document.body.style.removeProperty('--dk-' + k); });
  }
  /** Shows a style. item: the dock store item (its optional colours), or null for the standard docks. */
  function apply(s, item) {
    if (!cfg) return;
    clear();
    style = STYLES.indexOf(s) >= 0 ? s : 'standard';
    if (style === 'standard') return;
    document.body.classList.add('dk-' + style);
    if (item && item.tokens) Object.keys(item.tokens).forEach(function (k) { document.body.style.setProperty('--dk-' + k, item.tokens[k]); });
    if (style === 'float' || style === 'magnify') decorateDock();
    if (style === 'magnify') { var dock = document.getElementById('dock'); dock.addEventListener('mousemove', onMagnify); dock.addEventListener('mouseleave', offMagnify); }
    if (style === 'sidebar') buildSidebar();
    if (style === 'circle') buildLauncher();
  }
  /** Re-marks open widgets (call when a widget opens or closes, or the widget list changes). */
  function refresh() {
    if (!cfg) return;
    if (style === 'sidebar') { if (!nodes.sidebar) buildSidebar(); else updateNavRows(); }   // never rebuilt while open: level 2 would snap shut
    Array.prototype.forEach.call(document.querySelectorAll('.dk-sb-item[data-id],.dk-wid[data-id]'), function (b) { b.classList.toggle('on', !!cfg.isOpen(b.dataset.id)); });
  }
  /** cfg: { widgets() -> [{ id, label, icon, cat }], categories() -> [[id, label]], favourites() -> [id], isOpen(id),
   *        toggle(id), openTray(), labels:{ tray, widgets, favourites, pin, unpin, classes, theme, language, light, dark,
   *        settings, search, searchClass, searchLang, noMatch, noFavs }, nav: { … } (the sidebar's app rows, above) } */
  function configure(c) {
    cfg = c;
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerdown', onDown); document.addEventListener('pointerup', onUp); document.addEventListener('pointercancel', onUp);
  }
  root.DockStyle = { STYLES: STYLES, MAX_DOCK: MAX_DOCK, configure: configure, apply: apply, refresh: refresh, foldSidebar: function () { foldAll(true); }, current: function () { return style; }, openRings: openRings, closeRings: closeRings };
})(typeof self !== 'undefined' ? self : this);
