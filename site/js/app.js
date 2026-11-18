/* ---------------- Init ---------------- */
function init(){
  // One-time cleanup: the local database used to be named "widget-wall"
  // (from before the app was renamed to TeachersDeck). It's fully replaced
  // by the "TeachersDeck" database now, so remove the old one rather than
  // leaving orphaned data sitting in the browser. Best-effort and silent —
  // this is harmless if it's already gone.
  try{ indexedDB.deleteDatabase('widget-wall'); }catch(e){}

  if(KINDER) purgeKinderHidden();
  const tidied = curateWidgetsOnce();
  ensureDockPlacement();
  buildLangToggle();
  rebuildAllDocks();
  wireClasses();
  wireAppTray();
  wireDockDrag();
  buildLangSelects();
  buildLayoutModeSelector();
  buildDockPlacementList();
  buildDrawerSettings();
  buildEmojiToggle();
  buildCalendarSystemSelect();
  localizeNode(document);
  buildPresetSwatches();
  applyTheme();
  initCustomBg();
  if(typeof DeckMode !== 'undefined'){            // Light / Dark (js/mode.js), top of the Theme drawer
    modeSwitch = DeckMode.mountSwitch(document.getElementById('mode-switch'), { label:t('mode_title'), light:t('mode_light'), dark:t('mode_dark') });
    modeToggle = DeckMode.mountSwitch(document.getElementById('mode-toggle'), { label:t('mode_title'), light:t('mode_light'), dark:t('mode_dark') }, { compact:true });
    DeckMode.onChange(()=>{ applyTheme(); buildPresetSwatches(); });   // a preset background follows the mode; a teacher's own image doesn't change
  }
  if(!KINDER){ buildProStatus(); recheckLicenseIfNeeded(); }   // Kinder: no Pro card, prompts or licence checks
  const verEl = document.getElementById('app-version');
  if(verEl) verEl.textContent = `${t('version_label')} ${APP_VERSION}`;
  const xpPill = document.getElementById('xp-pill');
  const badgeChip = document.getElementById('badge-chip');
  const applyXpVisibility = ()=>{ if(xpPill) xpPill.hidden = !state.showXp; if(badgeChip) badgeChip.hidden = !state.showXp; };
  applyXpVisibility();
  if(xpPill) xpPill.addEventListener('click', ()=> toggleWidget('stats'));
  if(badgeChip) badgeChip.addEventListener('click', openBadges);
  document.addEventListener('keydown', e=>{       // Esc closes the full-screen Stats & XP (unless you're typing in something else)
    if(e.key !== 'Escape' || !state.active.stats || !widgetEls.stats) return;
    const wmb = document.getElementById('wm-backdrop'); if(wmb && !wmb.hidden) return;
    const a = document.activeElement;
    if(a && a !== document.body && !widgetEls.stats.el.contains(a)) return;
    toggleWidget('stats');
  });
  const xpToggle = document.getElementById('show-xp-toggle');
  if(xpToggle){ xpToggle.checked = !!state.showXp; xpToggle.addEventListener('change', ()=>{ state.showXp = xpToggle.checked; saveState(); applyXpVisibility(); }); }
  drawXP(0, false);
  touchDay();
  checkBadges();
  WIDGETS.filter(w=> w.full && state.active[w.id]).forEach(w=>{ state.active[w.id] = false; });   // a full-screen widget doesn't reopen over the whole page on every new tab
  Object.keys(state.active).filter(id=>state.active[id] && isOff(id)).forEach(id=>{ state.active[id] = false; });   // deactivated since last time
  Object.keys(state.active).filter(id=>state.active[id]).forEach(id=> openWidget(id));
  const wmOpen = document.getElementById('wm-open'); if(wmOpen) wmOpen.addEventListener('click', openWidgetManager);
  updateWmSummary();
  if(tidied) setTimeout(()=> toast(t('wm_tidy_toast', { n:tidied }), 7000), 2200);
  checkScoreboardTransfer(); // catches a game's "send scores" that arrived while this tab was closed
  if(!Object.keys(state.active).some(id=>state.active[id])){
    openWidget('clock'); saveState();
  }
  checkReminders();
  setInterval(checkReminders, 30000);
}
// platform (Canvas): the launch's one-time code exchange (js/canvas.js) is async and decides whether this visitor is a
// teacher at all, so init() waits for canvas.js to call it. Everywhere else it runs straight away.
if(PF && PF.deferInit) window.__tdInit = init;
else init();

/* TEST (branch glass-blue-test): dock styles (js/dockstyle.js) know TeachersDeck's widgets, categories and tray */
if(typeof DockStyle !== 'undefined'){
  DockStyle.configure({
    widgets: () => WIDGETS.filter(w => !isOff(w.id)).map(w => ({ id: w.id, label: widgetLabel(w.labelKey).replace(/^[^\p{L}\p{N}]+/u, ''), icon: iconSvg(w.icon), cat: w.cat })),   // the dock shows its own icon: no leading emoji
    categories: () => CATEGORIES.map(c => [c.id, t(c.labelKey)]),
    favourites: () => widgetsFor('bottom').map(w => w.id),
    isOpen: id => !!widgetEls[id], toggle: id => toggleWidget(id), openTray: () => openAppTray(),
    labels: state.lang === 'vi'
      ? { tray:'Tất cả tiện ích', widgets:'Tiện ích', favourites:'Yêu thích', pin:'Giữ mở', unpin:'Thu gọn', classes:'Lớp', theme:'Giao diện',
          language:'Ngôn ngữ', light:'Sáng', dark:'Tối', settings:'Cài đặt', search:'Tìm tiện ích', searchClass:'Tìm lớp', searchLang:'Tìm ngôn ngữ',
          noMatch:'Không tìm thấy', noFavs:'Nhấp chuột phải vào tiện ích để thêm vào Yêu thích', more:'Thêm', dragHint:'Kéo một biểu tượng lên vòng để đổi chỗ' }
      : { tray:'All widgets', widgets:'Widgets', favourites:'Favourites', pin:'Keep open', unpin:'Let it fold', classes:'Classes', theme:'Theme',
          language:'Language', light:'Light', dark:'Dark', settings:'Settings', search:'Search widgets', searchClass:'Search classes', searchLang:'Search languages',
          noMatch:'Nothing found', noFavs:'Right-click a widget to add it to Favourites', more:'More', dragHint:'Drag an icon onto the ring to swap it in' },
    ringDefaults: { tools:['traffic','dice','namepicker','groupmaker','checklist','poll','scoreboard','exitticket'] },   // a fresh install's outer ring, before usage counts
    nav: {   // menus scope step 2: what the top bar did, inside the sidebar
      classLabel: () => classDisplayName(activeClass()),
      classes: () => classes.list.map(c => ({ id: c.id, label: classDisplayName(c), active: c.id === classes.active })),
      switchClass: id => switchClass(id),
      languages: () => LANGS.map(l => ({ code: l.code, label: l.name, active: l.code === state.lang })),
      langLabel: () => (LANGS.find(l => l.code === state.lang) || LANGS[0]).name,
      setLanguage: code => setLanguage(code),
      isLight: () => typeof DeckMode !== 'undefined' && DeckMode.get() === 'light',
      toggleMode: () => { if(typeof DeckMode !== 'undefined') DeckMode.set(DeckMode.get() === 'light' ? 'dark' : 'light'); },
      openTheme: () => { const b = document.getElementById('btn-theme'); if(b) b.click(); },
      openSettings: () => { const b = document.getElementById('btn-settings'); if(b) b.click(); },
      catIcon: id => iconSvg({ time:'clock', media:'musicNote', tools:'clipboard', language:'chat', cloud:'cloud', course:'book' }[id] || 'files'),
    },
  });
  applyTdDock();
}

/* TEST (branch glass-blue-test), menus scope step 1: the top bar (#dock-top: class, language, theme, Light / Dark,
   Settings) stays reachable with every dock style. Floating, Magnifying and Circle tuck it away; it drops down when the
   pointer rests on the top 6 px for 120 ms, closes 600 ms after the pointer leaves (or with Esc), stays down while the
   class list is open or focus is inside it. Touchscreens get a pull handle at the top centre; Tab opens it.
   Theme → Dock → Top bar: "Always shown" keeps it visible. Sidebar hides it (its contents move into the sidebar);
   Standard and Radial keep it as before. */
var TOPBAR_DROP_STYLES = ['float', 'magnify', 'circle'];
var topBar = (function(){
  let edge = null, handle = null, openT = 0, closeT = 0;
  const bar = () => document.getElementById('dock-top');
  const isDrop = () => document.body.classList.contains('tb-drop');
  const menuOpen = () => { const m = document.getElementById('class-menu'); return !!(m && !m.hidden); };
  function open(){ clearTimeout(closeT); document.body.classList.add('tb-open'); }
  function close(force){
    clearTimeout(openT);
    const b = bar();
    if(!force && (menuOpen() || (b && b.contains(document.activeElement)))) return;
    document.body.classList.remove('tb-open');
  }
  function laterClose(){ clearTimeout(closeT); closeT = setTimeout(()=>close(false), 600); }
  function build(){
    if(edge) return;
    edge = document.createElement('div'); edge.id = 'tb-edge'; edge.setAttribute('aria-hidden', 'true');
    edge.addEventListener('mouseenter', ()=>{ if(!isDrop()) return; clearTimeout(openT); openT = setTimeout(open, 120); });
    edge.addEventListener('mouseleave', ()=>{ clearTimeout(openT); if(!document.body.classList.contains('tb-open')) return; laterClose(); });
    handle = document.createElement('button'); handle.id = 'tb-handle'; handle.type = 'button';
    handle.setAttribute('aria-label', t('ix_show_the_top_bar'));
    handle.addEventListener('click', ()=>{ document.body.classList.contains('tb-open') ? close(true) : open(); });
    let y0 = null;
    handle.addEventListener('touchstart', e=>{ y0 = e.touches[0].clientY; }, { passive:true });
    handle.addEventListener('touchmove', e=>{ if(y0 !== null && e.touches[0].clientY - y0 > 16){ open(); y0 = null; } }, { passive:true });
    document.body.appendChild(edge); document.body.appendChild(handle);
    const b = bar();
    if(b){
      b.addEventListener('mouseenter', ()=>{ if(isDrop()) clearTimeout(closeT); });
      b.addEventListener('mouseleave', ()=>{ if(isDrop()) laterClose(); });
      b.addEventListener('focusin', ()=>{ if(isDrop()) open(); });
      b.addEventListener('focusout', ()=>{ if(isDrop()) laterClose(); });
    }
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && isDrop() && document.body.classList.contains('tb-open') && !menuOpen()) close(true); });
    document.addEventListener('pointerdown', e=>{   // a tap elsewhere folds it (touch has no "pointer leaves")
      if(!isDrop() || !document.body.classList.contains('tb-open')) return;
      const b = bar(); if((b && b.contains(e.target)) || e.target === handle || menuOpen()) return;
      close(true);
    });
  }
  return { build, close };
})();
applyTopBarMode();

/* Polish phase 5 (TEST): the idle clock. With a premium theme that has a watch face, after a few minutes with no pointer,
   key or touch (and nothing running: Timer, Stopwatch, Noise Meter), the theme's face fills the screen as a projector
   screensaver, with the time and date under it. Any move, key or tap brings the wall back. Theme → "Watch face when
   idle" turns it off. ?idle=10 shortens the wait to 10 seconds for testing. */
var tdIdle = (function(){   // var: buildPresetSwatches() asks for it before this line runs
  const q = Number(new URLSearchParams(location.search).get('idle'));
  const WAIT = (q > 0 && q < 3600 ? q : 180) * 1000;
  let timer = 0, overlay = null, face = null, tick = 0;
  function enabled(){ const s = premiumSkins(); return !!(s && s.faces.length) && state.idleClock !== false; }
  function arm(){ clearTimeout(timer); if(enabled()) timer = setTimeout(show, WAIT); }
  function show(){
    if(overlay || !enabled()) return;
    if(document.body.classList.contains('td-busy') || document.querySelector('.drawer:not([hidden])') || document.hidden){ arm(); return; }
    const s = premiumSkins(), f = s.faces.find(x => x.key === state.premiumFace) || s.faces[0];
    overlay = document.createElement('div'); overlay.className = 'td-idle';
    overlay.innerHTML = '<div class="td-idle-face"></div><div class="td-idle-time"></div><div class="td-idle-date"></div>';
    document.body.appendChild(overlay);
    face = StoreCore.mountFace(overlay.querySelector('.td-idle-face'), f, { lang: state.lang === 'vi' ? 'vi' : 'en', reduceMotion: reduceMotionNow() });
    const tEl = overlay.querySelector('.td-idle-time'), dEl = overlay.querySelector('.td-idle-date');
    const paint = () => { const d = new Date(); let h = d.getHours() % 12 || 12; tEl.textContent = `${h}:${String(d.getMinutes()).padStart(2,'0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`; dEl.textContent = d.toLocaleDateString(LOCALE_MAP[state.lang] || 'en-US', { weekday:'long', month:'long', day:'numeric' }); };
    paint(); tick = setInterval(paint, 15000);
    requestAnimationFrame(()=> overlay && overlay.classList.add('on'));
  }
  function hide(){
    if(!overlay) return;
    clearInterval(tick); if(face) face.stop(); face = null;
    const o = overlay; overlay = null; o.classList.remove('on'); setTimeout(()=> o.remove(), 300);
  }
  function wake(){ if(overlay) hide(); arm(); }
  ['pointermove','pointerdown','keydown','wheel','touchstart'].forEach(ev => document.addEventListener(ev, wake, { passive:true, capture:true }));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) arm(); });
  arm();
  return { arm, hide };
})();
document.getElementById('idle-clock-toggle')?.addEventListener('change', e=>{ state.idleClock = e.target.checked; saveState(); tdIdle.arm(); });
buildIdleSwitch();

/* Floating icons (Pro; menus scope, owner 11 Nov 2026): take the panel away behind a dock so its icons float on the
   wallpaper by themselves, chosen per dock. Each icon keeps a faint backing and a soft shadow so it stays readable
   on any background (css/premium.css, body.df-*). Without Pro the switches show a Pro badge and open the Pro window. */
var FLOAT_PARTS = [['bottom', 'Bottom dock', 'Dock dưới'], ['sides', 'Side docks', 'Dock bên'], ['top', 'Top bar', 'Thanh trên'], ['rings', 'Rings', 'Vòng tròn']];
applyFloatingIcons(); buildFloatingIcons();
