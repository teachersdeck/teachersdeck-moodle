/* ---------------- Theme drawer ---------------- */
/* ---- Moved here from the end of js/app.js when it was split (cleanup Phase 4): code above init() calls these
   while the page loads, and only a single file hoisted them. The vars they test are set at the end of js/app.js. */
var TOPBAR_DROP_STYLES, topBar, tdIdle, FLOAT_PARTS;
function radialDocks(){ return ['off','compact','keep'].includes(state.radialDocks) ? state.radialDocks : 'off'; }
function tbDropStyle(){   // a dock style whose top bar tucks away: Floating, Magnifying, Circle, and Radial unless it keeps the docks
  const s = state.dockStyle || 'standard';
  return (TOPBAR_DROP_STYLES || ['float','magnify','circle']).includes(s) || (s === 'radial' && radialDocks() !== 'keep');
}
function applyTopBarMode(){
  const s = state.dockStyle || 'standard';
  document.body.classList.toggle('rad-off', s === 'radial' && radialDocks() === 'off');
  document.body.classList.toggle('rad-compact', s === 'radial' && radialDocks() === 'compact');
  const dropStyle = tbDropStyle();
  const drop = dropStyle && state.topBarMode !== 'shown';
  document.body.classList.toggle('tb-drop', drop);
  document.body.classList.toggle('tb-keep', dropStyle && !drop);
  if(!topBar) return;   // called by applyTdDock() before this part of the file has run; the call below catches up
  if(drop) topBar.build(); else topBar.close(true);
}
function buildIdleSwitch(){
  const row = document.getElementById('idle-clock-row'); if(!row) return;
  const s = premiumSkins();
  row.hidden = !(s && s.faces.length);
  row.querySelector('span').textContent = t('ix_watch_face_when_idle');
  const cb = row.querySelector('input'); cb.checked = state.idleClock !== false;
}
function applyFloatingIcons(){
  const f = (ownsFloatingDocks() && state.dockFrameless) || {};
  FLOAT_PARTS.forEach(([k]) => document.body.classList.toggle('df-' + k, !!f[k]));
}
function buildFloatingIcons(){
  const box = document.getElementById('floating-icons'); if(!box || !FLOAT_PARTS) return;   // FLOAT_PARTS is set at the end of this file; the call at startup comes first
  const vi = state.lang === 'vi', pro = ownsFloatingDocks(), f = state.dockFrameless || {};
  box.innerHTML = '';
  const head = document.createElement('p'); head.className = 'drawer-label floating-head';
  head.innerHTML = `<span></span><span class="pro-badge">Pro</span>`;
  head.querySelector('span').textContent = t('ix_floating_icons_no_dock_frame');
  box.appendChild(head);
  const row = document.createElement('div'); row.className = 'topbar-mode floating-opts';
  FLOAT_PARTS.forEach(([k, en, viL])=>{
    const b = document.createElement('button'); b.type = 'button';
    const on = pro && !!f[k];
    b.className = 'topbar-mode-opt' + (on ? ' active' : '') + (pro ? '' : ' locked'); b.setAttribute('aria-pressed', on);
    b.textContent = vi ? viL : en;
    b.addEventListener('click', ()=>{
      if(!ownsFloatingDocks()){ openProModal(); return; }
      state.dockFrameless = Object.assign({}, state.dockFrameless, { [k]: !f[k] });
      saveState(); applyFloatingIcons(); buildFloatingIcons();
    });
    row.appendChild(b);
  });
  box.appendChild(row);
}

const PRESETS = [
  { id:'dusk',  css:'linear-gradient(180deg,#1a2740 0%, #2c3b57 38%, #3f4f68 62%, #263248 100%)' },
  { id:'chalk', css:'linear-gradient(180deg,#2b2f26 0%, #3a4032 60%, #23261e 100%)' },
  { id:'ocean', css:'linear-gradient(180deg,#0e2f3f 0%, #164a5c 55%, #0c2733 100%)' },
  { id:'sunrise', css:'linear-gradient(180deg,#3a2140 0%, #7a4a55 45%, #c98a5e 100%)' },
  { id:'slate', css:'linear-gradient(180deg,#20242c 0%, #2b3038 100%)' },
  { id:'plain', css:'#12161C' },
  // Polish phase 4 (TEST): two free classroom backgrounds; css/polish.css adds their texture
  { id:'paper', name:'Paper', css:'linear-gradient(180deg,#2b2721 0%, #25221d 55%, #1f1c18 100%)', light:'linear-gradient(180deg,#f8f4ea 0%, #f3ede0 60%, #efe8d9 100%)' },
  { id:'chalkboard', name:'Chalkboard', css:'linear-gradient(180deg,#1f3a2c 0%, #284836 55%, #1b3326 100%)', light:'linear-gradient(180deg,#e7f0ea 0%, #dce9e1 60%, #e3eee7 100%)' }
];
const presetBg = p => (p.light && document.documentElement.dataset.mode === 'light') ? p.light
  : (typeof DeckMode !== 'undefined') ? DeckMode.background(p.id, p.css) : p.css;   // Light mode: the same preset, pale (js/mode.js)
/* Polish phase 2 (TEST): Theme and Background are two settings.
   state.uiTheme   'classic' | a premium theme id ('glass-blue'): colours, drawings in Clock / Noise Meter / Traffic Light
   state.bgTheme   true = the premium theme's own background; false = the preset in state.theme
   state.customBg  true = your own image (as before; it wins over both)
   state.photoTint true = wash your image with the theme's colour (offered with a premium theme over a photo; off by default) */
/* TEST (branch glass-blue-test): every theme in js/premium-packs.js (all the Item Store's theme packs) is a premium theme
   here, open to everyone. Glass Blue and the launch themes first, then the seasonal ones. */
function addStoreThemes(){   // 13 Nov: runs again when the Shop brings a theme (tdStoreArrived)
  if(!window.StoreCore) return;
  const ORDER = ['glass-blue','aurora','ivory','obsidian','noel','tet'], found = [];
  (window.TD_PREMIUM_PACKS || []).forEach(r=>{
    if(!r || r.kind !== 'theme') return;
    const v = StoreCore.validateStorePack(r); if(!v.ok) return;
    v.pack.items.forEach(it=>{ if(!PRESETS.some(p=>p.id===it.id) && !found.some(f=>f.id===it.id)) found.push({ id:it.id, name:it.name.en, nameVi:it.name.vi, premium:true,
      css:StoreCore.themeBackground(it, false), light:it.light || undefined, pack:v.pack.id }); });
  });
  found.sort((a,b)=> (ORDER.indexOf(a.id)+1 || 99) - (ORDER.indexOf(b.id)+1 || 99));
  found.forEach(f=>PRESETS.push(f));
}
addStoreThemes();
const PREMIUM_THEMES = PRESETS.filter(p => p.premium);
if(state.theme && PREMIUM_THEMES.some(p => p.id === state.theme)){ state.uiTheme = state.theme; state.theme = 'dusk'; state.bgTheme = true; }   // saves from the first test build
if(!state.uiTheme || (state.uiTheme !== 'classic' && !PREMIUM_THEMES.some(p => p.id === state.uiTheme))) state.uiTheme = 'classic';
// ?theme=glass-blue opens the app in that theme (for testing the demo); your own background, if you have one, stays
{ const q = new URLSearchParams(location.search).get('theme');
  if(q && PREMIUM_THEMES.some(p=>p.id===q) && state.uiTheme !== q){ state.uiTheme = q; if(!state.customBg) state.bgTheme = true; state.premiumFace = null; if(state.noiseMeter) state.noiseMeter.style = 'skin'; } }
const premiumTheme = () => PREMIUM_THEMES.find(p => p.id === state.uiTheme) || null;

const bgLayer = document.getElementById('bg-layer');
const bgOverlay = document.getElementById('bg-overlay');
let logoImgEl = null;
// School/company logo upload is an enterprise-tier feature — see
// ENTERPRISE_FEATURES near the top of this file. Deactivated and hidden in
// index.html for now (upload row hidden, logo-preview box removed).
// Object URL of a background that was applied from the picked file but could
// NOT be saved (e.g. storage blocked in an embedded/sandboxed preview). It
// shows for this session only; null whenever the background is saved/preset.
let sessionBgUrl = null;

function paintPreset(){
  const pt = premiumTheme();
  const p = (pt && state.bgTheme) ? pt : (PRESETS.find(p=>p.id===state.theme && !p.premium) || PRESETS[0]);
  bgLayer.style.background = presetBg(p);
  bgLayer.style.backgroundSize = 'cover';
}

function applyTheme(){
  const root = document.documentElement, pt = premiumTheme(), photo = !!(sessionBgUrl || state.customBg);
  if(pt) root.dataset.tdTheme = pt.id; else delete root.dataset.tdTheme;
  root.dataset.tdBg = photo ? 'image' : (pt && state.bgTheme ? 'theme' : 'preset');
  root.dataset.tdBgid = photo ? '' : (pt && state.bgTheme ? pt.id : state.theme);   // css/polish.css: paper / chalkboard texture   // css/premium.css: stronger glass over a photo
  if(pt && photo && state.photoTint) root.dataset.tdTint = '1'; else delete root.dataset.tdTint;
  // polish phase 5: the theme pack's display font (THEME_FONTS in js/store-core.js) for titles and big readouts
  const tItem = pt && typeof tdThemeItem === 'function' ? tdThemeItem(pt.id) : null;
  if(tItem && window.StoreCore && StoreCore.THEME_FONTS[tItem.font]) root.style.setProperty('--theme-font', StoreCore.THEME_FONTS[tItem.font]);
  else root.style.removeProperty('--theme-font');
  applySkin(tItem);
  if(sessionBgUrl){
    bgLayer.style.background = `center/cover no-repeat url(${sessionBgUrl})`;
  } else if(state.customBg){
    // custom image is applied async from IDB (see initCustomBg)
  } else {
    paintPreset();
  }
  applyWallpaper(tItem, photo);
  bgOverlay.classList.toggle('no-dim', !state.dim);
  if(typeof TDWhiteboard !== 'undefined') TDWhiteboard.sync(!!state.whiteboard);
}
/* 13 Nov: a premium theme's animated wallpaper (js/wallpaper.js) over its CSS gradient, which stays underneath as the
   fallback. Only with the theme's own background, in dark mode, and while "Moving wallpaper" is on (Theme menu). */
let wallpaperKey = '';
function applyWallpaper(tItem, photo){
  if(typeof TDWallpaper === 'undefined') return;
  const w = tItem && tItem.wallpaper;
  const want = !!(w && state.bgTheme && !photo && state.wallpaper !== false && document.documentElement.dataset.mode !== 'light');
  const key = want ? JSON.stringify(w) : '';
  if(key === wallpaperKey && (!want || TDWallpaper.active())) return;
  wallpaperKey = key;
  if(want) TDWallpaper.mount(w, { before: bgOverlay }); else TDWallpaper.unmount();
  TDWallpaper.pause(tdBusySet.size > 0);
}

/* 11 Nov: every theme colours the docks and windows. A premium theme brings its pack's tokens; each free background
   has its own small set (Dusk keeps the classic look). css/premium.css reads the --sk-* tokens under html[data-td-skin]. */
const PRESET_SKINS = {
  chalk:     { bgs:'#2b2f26', card:'rgba(74,82,62,.55)', line:'rgba(205,215,180,.26)', ink:'#eef1e4', muted:'#c3c9b0', acc:'#d9c27a', bt:'#2a2306', dock:'rgba(36,40,31,.86)', hov:'rgba(255,255,255,.10)' },
  ocean:     { bgs:'#0e2f3f', card:'rgba(22,74,92,.48)', line:'rgba(140,220,230,.30)', ink:'#e6fbff', muted:'#a6d4dd', acc:'#5fd3d6', bt:'#032a2c', dock:'rgba(10,40,52,.86)', hov:'rgba(255,255,255,.12)' },
  sunrise:   { bgs:'#3a2140', card:'rgba(122,74,85,.42)', line:'rgba(255,200,160,.30)', ink:'#fff1e8', muted:'#e8c3b4', acc:'#ffb27a', bt:'#3a1600', dock:'rgba(58,33,64,.86)', hov:'rgba(255,255,255,.12)' },
  slate:     { bgs:'#20242c', card:'rgba(52,58,68,.62)', line:'rgba(200,210,225,.22)', ink:'#eef1f6', muted:'#b4bccb', acc:'#9fb4d6', bt:'#141a26', dock:'rgba(30,34,42,.9)', hov:'rgba(255,255,255,.10)' },
  plain:     { bgs:'#12161c', card:'rgba(32,38,47,.72)', line:'rgba(255,255,255,.12)', ink:'#eef1f6', muted:'#a7afbd', acc:'#e0a93b', bt:'#231803', dock:'rgba(20,24,31,.92)', hov:'rgba(255,255,255,.08)' },
  paper:     { bgs:'#25221d', card:'rgba(64,58,48,.6)', line:'rgba(230,215,190,.24)', ink:'#f6efe2', muted:'#cfc2aa', acc:'#e0b46a', bt:'#2b1d05', dock:'rgba(43,39,33,.9)', hov:'rgba(255,255,255,.10)' },
  chalkboard:{ bgs:'#1f3a2c', card:'rgba(44,78,60,.55)', line:'rgba(200,235,210,.26)', ink:'#f2f7f1', muted:'#c0d6c8', acc:'#f2efe0', bt:'#1d2b22', dock:'rgba(26,48,37,.9)', hov:'rgba(255,255,255,.10)' },
};
function skinRgb(c, fallback){   // '#rrggbb' | '#rgb' | 'rgba(r,g,b,a)' -> 'r,g,b'
  const s = String(c || '').trim(); let m;
  if((m = /^#([0-9a-f]{6})/i.exec(s))) return [0,2,4].map(i=>parseInt(m[1].substr(i,2),16)).join(',');
  if((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])/i.exec(s))) return [m[1],m[2],m[3]].map(h=>parseInt(h+h,16)).join(',');
  if((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s))) return [m[1],m[2],m[3]].join(',');
  return fallback || '0,0,0';
}
const SKIN_PROPS = ['--sk-ink0','--sk-ink1','--sk-ink2','--sk-ink3','--sk-card','--sk-head','--sk-hov','--sk-dock','--sk-dock-soft','--sk-drawer','--sk-pill','--sk-line','--sk-line-rgb',
  '--sk-ink','--sk-muted','--sk-acc','--sk-acc-rgb','--sk-acc-hi','--sk-acc-hi-rgb','--sk-on','--sk-on-rgb','--sk-radius','--sk-shadow-rgb','--sk-card-photo','--sk-tint','--sk-idle-a','--sk-idle-b'];
function applySkin(item){
  const root = document.documentElement, pt = premiumTheme();
  const tk = item ? item.tokens : (!pt && PRESET_SKINS[state.theme]) || null;
  themeArt(item);   // the theme's own artwork from its pack, and its finishing touches (data-td-deco)
  themeGreeting(item);
  if(!tk){ delete root.dataset.tdSkin; SKIN_PROPS.forEach(k=>root.style.removeProperty(k)); return; }
  const bgs = tk.bgs, acc = tk.acc, accRgb = skinRgb(acc), mix = (rgb, w) => rgb.split(',').map(v=>Math.round(+v + (255 - +v) * w)).join(',');
  const dark = skinRgb(bgs).split(',').map(v=>Math.round(+v * .35)).join(',');
  const set = (k, v) => root.style.setProperty(k, v);
  set('--sk-ink0', bgs); set('--sk-ink1', `color-mix(in srgb, ${bgs} 88%, #ffffff)`); set('--sk-ink2', `color-mix(in srgb, ${bgs} 80%, #ffffff)`); set('--sk-ink3', `color-mix(in srgb, ${bgs} 70%, #ffffff)`);
  set('--sk-card', tk.card); set('--sk-head', `color-mix(in srgb, ${tk.card} 55%, transparent)`); set('--sk-hov', tk.hov);
  set('--sk-dock', tk.dock); set('--sk-dock-soft', `color-mix(in srgb, ${tk.dock} 76%, transparent)`); set('--sk-drawer', `color-mix(in srgb, ${bgs} 94%, transparent)`);
  set('--sk-pill', `color-mix(in srgb, ${tk.hov} 65%, transparent)`); set('--sk-line', tk.line); set('--sk-line-rgb', skinRgb(tk.line, '160,210,255'));
  set('--sk-ink', tk.ink); set('--sk-muted', tk.muted); set('--sk-acc', acc); set('--sk-acc-rgb', accRgb);
  set('--sk-acc-hi', `rgb(${mix(accRgb, .3)})`); set('--sk-acc-hi-rgb', mix(accRgb, .3)); set('--sk-on', tk.bt); set('--sk-on-rgb', skinRgb(tk.bt));
  set('--sk-radius', ((item && item.radius) || 16) + 'px'); set('--sk-shadow-rgb', dark);
  set('--sk-card-photo', `color-mix(in srgb, ${bgs} 34%, transparent)`); set('--sk-tint', `linear-gradient(135deg, rgba(${skinRgb(bgs)},.55), rgba(${accRgb},.30))`);
  set('--sk-idle-a', `rgba(${skinRgb(bgs)},.72)`); set('--sk-idle-b', `rgba(${dark},.94)`);
  root.dataset.tdSkin = pt ? pt.id : state.theme;
}
/* 13 Nov (owner's mockups): a theme's own words in the top bar — its greeting from the pack (Tết: "Chúc Mừng Năm Mới ·
   Đinh Mùi 2027") and a "Premium · name" badge. Plain text (textContent); css/premium.css places and hides it. */
function themeGreeting(item){
  const root = document.documentElement, pt = premiumTheme(), g = item && item.greeting;
  let el = document.getElementById('td-greet');
  if(!g || !pt){ delete root.dataset.tdGreet; if(el) el.hidden = true; return; }
  if(!el){
    el = document.createElement('div'); el.id = 'td-greet';
    el.innerHTML = '<span class="tg-text"></span><span class="tg-badge"></span>';
    const top = document.querySelector('.topbar'), after = document.getElementById('dock-top-widgets');
    if(after && after.parentNode) after.after(el); else if(top) top.appendChild(el); else return;
  }
  el.hidden = false;
  const vi = state.lang === 'vi';
  el.querySelector('.tg-text').textContent = g[vi ? 'vi' : 'en'] || g.en;
  el.querySelector('.tg-badge').textContent = (t('ix_premium')) + ((vi && pt.nameVi) || pt.name);
  root.dataset.tdGreet = '1';
}
/* A premium theme's artwork (js/themeart.js draws what its pack carries; css/themeart.css places it). */
function themeArt(item) {
  if (typeof TDThemeArt === 'undefined') { document.documentElement.dataset.tdDeco = (item && item.deco) || 'none'; return; }
  TDThemeArt.apply(item, d => { const bg = document.getElementById('bg-overlay') || document.getElementById('bg-layer'); if (bg && bg.parentNode) bg.parentNode.insertBefore(d, bg.nextSibling); else document.body.prepend(d); });
}

async function initCustomBg(){
  if(state.customBg){
    try{
      const rec = await idb.get('images', state.activeBgId || 'background');
      if(rec){
        const url = URL.createObjectURL(rec.blob);
        bgLayer.style.background = `center/cover no-repeat url(${url})`;
      } else if(!sessionBgUrl){
        paintPreset();   // saved image is gone — show the theme instead of a blank layer
      }
    }catch(err){
      console.error('TeachersDeck: failed to load custom background', err);
      if(!sessionBgUrl) paintPreset();
    }
  }
  if(ENTERPRISE_FEATURES && state.logo){
    try{
      const rec = await idb.get('images','logo');
      if(rec){
        const url = URL.createObjectURL(rec.blob);
        if(!logoImgEl){
          logoImgEl = document.createElement('img');
          logoImgEl.className = 'bg-logo-mark';
          document.body.appendChild(logoImgEl);
        }
        logoImgEl.src = url;
        document.getElementById('logo-preview').src = url;
        document.getElementById('logo-preview-row').hidden = false;
      }
    }catch(err){ console.error('TeachersDeck: failed to load logo', err); }
  }
}

/* TEST (branch glass-blue-test): the Item Store's five dock styles in Theme → Dock, open to everyone here.
   js/dockstyle.js (= studentdeck/js/dockstyle.js on item-store) draws them; the dock packs are in js/premium-packs.js. */
function tdDockItems(){
  const out = [];
  (window.TD_PREMIUM_PACKS || []).forEach(r=>{
    if(!window.StoreCore || !r || r.kind !== 'dock') return;
    const v = StoreCore.validateStorePack(r); if(!v.ok) return;
    v.pack.items.forEach(it=>out.push(it));
  });
  return out;
}
function applyTdDock(){
  if(typeof DockStyle === 'undefined') return;
  const it = tdDockItems().find(d=>d.style === state.dockStyle);
  DockStyle.apply(it ? it.style : 'standard', it || null);
  if(typeof applyTopBarMode === 'function') applyTopBarMode();
}
function buildDockSwatches(){
  const grid = document.getElementById('dock-styles'); if(!grid) return;
  grid.innerHTML = '';
  const vi = state.lang === 'vi';
  const opts = [{ style:'standard', name:{ en:'Standard', vi:'Tiêu chuẩn' }, swatch:'linear-gradient(180deg,#2a3542,#161c25)' }].concat(tdDockItems());
  opts.forEach(o=>{
    const b = document.createElement('button'); b.type = 'button';
    const on = (state.dockStyle || 'standard') === o.style;
    b.className = 'dock-style-opt' + (on ? ' active' : '');
    b.setAttribute('aria-pressed', on);
    b.innerHTML = `<span class="dock-style-sw"></span><span class="dock-style-name"></span>`;
    b.querySelector('.dock-style-sw').style.background = o.swatch || '#1e2732';
    b.querySelector('.dock-style-name').textContent = o.name[vi ? 'vi' : 'en'] || o.name.en;
    b.addEventListener('click', ()=>{
      state.dockStyle = o.style; saveState(); applyTdDock(); buildDockSwatches();
      if(o.style === 'radial' && !state.radialHintSeen){   // one time: how to open the rings
        state.radialHintSeen = true; saveState();
        toast(t('ix_right_click_an_empty_part_of_the_scr'), 7000);
      }
    });
    grid.appendChild(b);
  });
  // With Radial (owner 11 Nov 2026): the rings hold every widget and the gear holds settings, so the docks can go
  const rm = document.getElementById('radial-mode');
  if(rm){
    rm.hidden = state.dockStyle !== 'radial';
    rm.innerHTML = '';
    const cur = ['off','compact','keep'].includes(state.radialDocks) ? state.radialDocks : 'off';
    [['off', t('ix_docks_off')], ['compact', t('ix_compact_dock')], ['keep', t('ix_keep_docks')]].forEach(([k, label])=>{
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'topbar-mode-opt' + (cur === k ? ' active' : ''); b.setAttribute('aria-pressed', cur === k); b.textContent = label;
      b.addEventListener('click', ()=>{ state.radialDocks = k; saveState(); applyTopBarMode(); buildDockSwatches(); });
      rm.appendChild(b);
    });
  }
  buildFloatingIcons();
  // Top bar: drop down at the top edge (default for Floating, Magnifying, Circle, and Radial without docks) or always shown
  const tb = document.getElementById('topbar-mode'); if(!tb) return;
  const applies = tbDropStyle();
  tb.hidden = !applies;
  tb.innerHTML = '';
  [['drop', t('ix_drop_down_at_the_top_edge')], ['shown', t('ix_always_shown')]].forEach(([k, label])=>{
    const b = document.createElement('button'); b.type = 'button';
    const on = (state.topBarMode === 'shown' ? 'shown' : 'drop') === k;
    b.className = 'topbar-mode-opt' + (on ? ' active' : ''); b.setAttribute('aria-pressed', on); b.textContent = label;
    b.addEventListener('click', ()=>{ state.topBarMode = k; saveState(); applyTopBarMode(); buildDockSwatches(); });
    tb.appendChild(b);
  });
}

function setUiTheme(id){
  const was = premiumSkins();
  const arriving = id !== 'classic' && state.uiTheme !== id;
  state.uiTheme = id;
  const pt = premiumTheme();
  if(arriving && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)){   // polish phase 5: a 1 s arrival
    const r = document.documentElement; r.classList.remove('td-arrive'); void r.offsetWidth; r.classList.add('td-arrive');
    setTimeout(()=> r.classList.remove('td-arrive'), 1100);
  }
  if(pt){ if(!state.customBg && !sessionBgUrl) state.bgTheme = true; state.premiumFace = null; state.meterSkin = null; state.lightSkin = null; if(state.noiseMeter) state.noiseMeter.style = 'skin'; }
  else state.bgTheme = false;
  saveState(); applyTheme(); buildPresetSwatches();
  if(was || premiumSkins()) refreshSkinnedWidgets();
}
function useBackground(kind, presetId){   // kind: 'theme' (the premium theme's own) | 'preset' | 'whiteboard'
  if(kind === 'whiteboard'){ state.whiteboard = true; saveState(); applyTheme(); buildPresetSwatches(); return; }   // over the current background (Premium: "ink on my background")
  state.whiteboard = false;
  if(sessionBgUrl){ URL.revokeObjectURL(sessionBgUrl); sessionBgUrl = null; }
  state.customBg = false;
  state.bgTheme = kind === 'theme';
  if(kind === 'preset') state.theme = presetId;
  saveState(); applyTheme(); buildPresetSwatches();
}
function buildPresetSwatches(){
  buildDockSwatches();
  const vi = state.lang === 'vi', pt = premiumTheme(), photo = !!(state.customBg || sessionBgUrl);
  document.querySelectorAll('[data-td-label]').forEach(el=>{ const k = el.dataset.tdLabel; el.textContent = k === 'theme' ? (t('theme_title')) : (t('ix_dock')); });
  { const r = document.getElementById('bg-photo-reset'); if(r) r.textContent = t('ix_use_a_background_instead'); }
  // Theme row: Classic + the premium themes (with the Shop: only the ones bought)
  const tg = document.getElementById('ui-themes');
  if(tg){
    tg.innerHTML = '';
    [{ id:'classic', name: t('ix_classic'), css: presetBg(PRESETS[0]) }].concat(PREMIUM_THEMES.map(p => ({ id:p.id, name:p.name, css:p.css, premium:true }))).forEach(o=>{
      const b = document.createElement('button'); b.type = 'button';
      const on = state.uiTheme === o.id;
      b.className = 'ui-theme-opt' + (on ? ' active' : '') + (o.premium ? ' premium' : '');
      b.setAttribute('aria-pressed', on);
      b.innerHTML = '<span class="ui-theme-sw"></span><span class="ui-theme-name"></span>';
      b.querySelector('.ui-theme-sw').style.background = o.css;
      b.querySelector('.ui-theme-name').textContent = o.name;
      b.addEventListener('click', ()=> setUiTheme(o.id));
      tg.appendChild(b);
    });
    // 13 Nov (owner): the same card deck as the Clock's faces, for browsing every theme with a preview of each
    let row = document.getElementById('ui-theme-browse');
    if(!row){ row = document.createElement('div'); row.id = 'ui-theme-browse'; row.className = 'fp-row'; tg.after(row); }
    row.innerHTML = '';
    if(typeof FacePicker !== 'undefined'){
      const all = [{ id:'classic', name: t('ix_classic'), css: presetBg(PRESETS[0]) }].concat(PREMIUM_THEMES.map(p => ({ id:p.id, name:(vi && p.nameVi) || p.name, css:p.css, premium:true })));
      const cur = all.find(o=>o.id === state.uiTheme) || all[0];
      const btn = FacePicker.trigger({ lang: vi ? 'vi' : 'en', label: t('ix_browse_themes'), current: { name: cur.name, swatch: cur.css } });
      FacePicker.attach(btn, ()=>({ lang: vi ? 'vi' : 'en', title: t('ix_choose_a_theme'), current: state.uiTheme,
        options: all.map(o=>({ key:o.id, name:o.name, bg:o.css, mock:true, group: o.premium ? 'Premium' : (t('plan_free_title')) })),
        onPick: id=>setUiTheme(id), refocus: ()=>document.querySelector('#ui-theme-browse .fp-trigger') }));
      row.appendChild(btn);
      if(typeof TD_STORE !== 'undefined' && TD_STORE.enabled){   // 13 Nov (owner): the store in the LMS editions (js/tdstore.js)
        const shop = document.createElement('button'); shop.type = 'button'; shop.className = 'fp-trigger td-shop-open';
        shop.innerHTML = '<span class="fp-trigger-sw td-shop-sw" aria-hidden="true">🛍</span><span class="fp-trigger-name"></span>';
        shop.querySelector('.fp-trigger-name').textContent = t('ix_shop');
        shop.setAttribute('aria-haspopup', 'dialog');
        shop.addEventListener('click', e=>{ e.stopPropagation(); openTdShop(shop); });
        row.appendChild(shop);
      }
    }
  }
  // Background row: the theme's own background (premium themes only), then the six presets; your image is the upload below
  const grid = document.getElementById('theme-presets');
  grid.innerHTML = '';
  const wbOk = typeof TDWhiteboard !== 'undefined' && !document.documentElement.classList.contains('bento');
  const opts = (wbOk ? [{ kind:'whiteboard', p:{ id:'whiteboard', css:'#fff' }, title: t('wb_name') }] : [])
    .concat(pt ? [{ kind:'theme', p:pt, title: t('ix_theme_s_background') }] : [])
    .concat(PRESETS.filter(p=>!p.premium).map(p=>({ kind:'preset', p, title:p.name || p.id })));
  opts.forEach(o=>{
    const sw = document.createElement('div');
    const on = o.kind === 'whiteboard' ? !!state.whiteboard : (!state.whiteboard && !photo && (o.kind === 'theme' ? (pt && state.bgTheme) : (!(pt && state.bgTheme) && state.theme === o.p.id)));
    sw.className = 'swatch' + (o.kind === 'theme' ? ' premium theme-bg' : '') + (o.kind === 'whiteboard' ? ' wb-swatch' : '') + (on ? ' active' : '');
    sw.style.background = o.kind === 'whiteboard' ? '#fff' : presetBg(o.p);
    sw.title = o.title; sw.setAttribute('role', 'button'); sw.setAttribute('aria-label', o.title); sw.setAttribute('aria-pressed', String(!!on));
    sw.addEventListener('click', ()=> useBackground(o.kind, o.p.id));
    grid.appendChild(sw);
  });
  // "Your image" status + the tint switch (a premium theme over your photo)
  const st = document.getElementById('bg-photo-state');
  if(st){
    st.hidden = !photo;
    st.querySelector('.bg-photo-text').textContent = t('ix_using_your_image');
  }
  if(typeof buildIdleSwitch === 'function') buildIdleSwitch();
  if(typeof tdIdle !== 'undefined') tdIdle.arm();
  const tint = document.getElementById('photo-tint-row');
  if(tint){
    tint.hidden = !(pt && photo);
    const cb = tint.querySelector('input'); cb.checked = !!state.photoTint;
    tint.querySelector('span').textContent = t('ix_tint_my_image_a', { a: pt ? pt.name : '' });
  }
  const wp = document.getElementById('wallpaper-row');
  if(wp){
    const tItem = pt && typeof tdThemeItem === 'function' ? tdThemeItem(pt.id) : null;
    wp.hidden = !(tItem && tItem.wallpaper && state.bgTheme && !photo);
    wp.querySelector('input').checked = state.wallpaper !== false;
    wp.querySelector('span').textContent = t('ix_moving_wallpaper');
  }
}
document.getElementById('wallpaper-toggle')?.addEventListener('change', e=>{ state.wallpaper = e.target.checked; saveState(); applyTheme(); });
document.getElementById('photo-tint-toggle')?.addEventListener('change', e=>{ state.photoTint = e.target.checked; saveState(); applyTheme(); });
document.getElementById('bg-photo-reset')?.addEventListener('click', ()=> useBackground(premiumTheme() ? 'theme' : 'preset', state.theme && !PRESETS.find(p=>p.id===state.theme)?.premium ? state.theme : 'dusk'));

document.querySelector('label[for="bg-upload"]').addEventListener('click', e=>{
  if(!isPro()){ e.preventDefault(); openProModal('bg'); }
});
document.getElementById('bg-upload').addEventListener('change', async e=>{
  const file = e.target.files[0];
  e.target.value = '';   // lets the same file be picked again later
  if(!file) return;
  state.whiteboard = false;   // your image is a background of its own (Premium Whiteboard can write over it: "ink on my background")
  // 1) Show it right away, straight from the picked file — this doesn't depend
  //    on any browser storage, so the background always changes.
  if(sessionBgUrl) URL.revokeObjectURL(sessionBgUrl);
  sessionBgUrl = URL.createObjectURL(file);
  applyTheme();
  buildPresetSwatches();
  // 2) Then try to remember it (single slot, id 'background', as before). If
  //    storage is unavailable or stalls, the background still stays for this
  //    session and we say it won't be remembered.
  try{
    await Promise.race([
      idb.put('images', { id:bgIdForClass(), blob:file }),
      new Promise((_,rej)=> setTimeout(()=> rej(new Error('timed out saving background')), 6000))
    ]);
    state.activeBgId = bgIdForClass();
    state.customBg = true;
    saveState();
    sessionBgUrl = null;      // saved: from here on it loads from storage like any custom background
    buildPresetSwatches();
    toast(t('bg_updated'));
  }catch(err){
    console.error('TeachersDeck: background applied but could not be saved', err);
    toast(t('bg_not_saved'), 5000);
  }
});

if(ENTERPRISE_FEATURES){
  document.querySelector('label[for="logo-upload"]').addEventListener('click', e=>{
    if(!isPro()){ e.preventDefault(); openProModal('logo'); }
  });
  document.getElementById('logo-upload').addEventListener('change', async e=>{
    const file = e.target.files[0];
    e.target.value = '';
    if(!file) return;
    try{
      await idb.put('images', { id:'logo', blob:file });
    }catch(err){
      console.error('TeachersDeck: logo upload failed', err);
      toast(t('bg_upload_failed'), 5000);
      return;
    }
    state.logo = true;
    saveState();
    initCustomBg();
    toast(t('logo_updated'));
  });

  document.getElementById('logo-remove').addEventListener('click', async ()=>{
    await idb.delete('images','logo');
    state.logo = false; saveState();
    if(logoImgEl) logoImgEl.remove();
    logoImgEl = null;
    document.getElementById('logo-preview-row').hidden = true;
    toast(t('logo_removed'));
  });
}

document.getElementById('dim-toggle').addEventListener('change', e=>{
  state.dim = e.target.checked; saveState(); applyTheme();
});

/* ---------------- School theme pushed from AdminDeck (v0.15.2) ----------------
   AdminDeck (the school admin's dashboard) can send a background — one of the six built-in themes or a photo — and the dim setting to the
   classes of its choice. It lands in classes/{id}/adminTheme/current; this watches that document for the Cloud Class linked to the class
   that is open (state.cloudClassId) and applies each new version ONCE, as that class's background. After that it is an ordinary background:
   change it whenever you like, and it is not re-applied until the admin sends a newer version. Switch "Accept school themes" off in Settings
   to ignore pushes altogether. Needs Cloud Class sign-in; with no Firebase or no linked class this does nothing. */
Object.assign(STRINGS, {
  demo_section: { en:'Demo', vi:'Dùng thử' },
  demo_settings_hint: { en:'Explore the Cloud features (Cloud Class, Class Activity, Notes Home, progress reports and sync) with sample data. Nothing is sent and your own classes are not touched.', vi:'Khám phá các tính năng Cloud (Lớp Cloud, Hoạt động lớp, Ghi chú về nhà, báo cáo tiến độ và đồng bộ) bằng dữ liệu mẫu. Không có gì được gửi đi và các lớp của bạn không bị thay đổi.' },
  demo_try_label: { en:'Try the Cloud demo', vi:'Dùng thử bản demo Cloud' },
  demo_exit_label: { en:'Exit the Cloud demo', vi:'Thoát bản demo Cloud' },
  demo_try_btn: { en:'Try the demo', vi:'Dùng thử' },
  admin_theme_applied: { en:'Your school sent a new background for this class', vi:'Trường vừa gửi hình nền mới cho lớp này' },
  accept_admin_theme_label: { en:'Accept school themes from AdminDeck', vi:'Nhận chủ đề do trường gửi từ AdminDeck' },
  accept_admin_theme_hint: { en:'When your school\u2019s admin sends a background, it is applied once to the class that is open. You can change it afterwards.', vi:'Khi quản trị viên của trường gửi hình nền, hình nền được áp dụng một lần cho lớp đang mở. Bạn vẫn có thể đổi lại sau đó.' }
});
function notConfiguredHtml(){          // v0.15.3: the "not connected" message, with a way to see the Cloud features anyway
  return `<p class="small-hint">${t('cc_not_configured')}</p><div class="btn-row" style="justify-content:center;margin-top:10px"><button class="wbtn primary" data-td-demo-start>${t('demo_try_btn')}</button></div>`;
}
document.addEventListener('click', e=>{ if(e.target.closest('[data-td-demo-start]')) TD_DEMO.enter(); });
{
  const b = document.getElementById('td-demo-toggle');
  if(b){
    if(TD_DEMO.active) b.setAttribute('data-i18n','demo_exit_label');
    b.addEventListener('click', ()=> TD_DEMO.active ? TD_DEMO.exit() : TD_DEMO.enter());
  }
}
let adminThemeUnsub = null, adminThemeFor = null;
const ADMIN_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;
function dataUrlToBlob(url){
  const m = ADMIN_IMAGE_RE.exec(url); if(!m) return null;
  const bin = atob(m[2]), bytes = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type:'image/' + m[1] });
}
async function applyAdminTheme(classId, th){
  if(state.acceptAdminTheme === false) return;
  const version = Number(th && th.version) || 0;
  if(!version || version <= (state.adminThemeSeen[classId] || 0)) return;          // already applied (or nonsense) — apply each push once
  let blob = null;
  if(th.image){
    if(typeof th.image !== 'string' || th.image.length > 800000) return;
    blob = dataUrlToBlob(th.image); if(!blob) return;
  } else if(!PRESETS.some(p=>p.id === th.preset)) return;
  if(blob){
    try{ await idb.put('images', { id:bgIdForClass(), blob }); }
    catch(err){ console.error('TeachersDeck: could not save the school background', err); return; }   // not marked as seen: it will retry next time
    if(sessionBgUrl){ URL.revokeObjectURL(sessionBgUrl); sessionBgUrl = null; }
    state.activeBgId = bgIdForClass(); state.customBg = true;
  } else {
    if(sessionBgUrl){ URL.revokeObjectURL(sessionBgUrl); sessionBgUrl = null; }
    state.theme = th.preset; state.customBg = false; state.bgTheme = false;   // a school's background is a Background: the teacher's Theme stays
  }
  if(typeof th.dim === 'boolean') state.dim = th.dim;
  state.adminThemeSeen[classId] = version;
  saveState();
  const dimBox = document.getElementById('dim-toggle'); if(dimBox) dimBox.checked = !!state.dim;
  applyTheme(); if(blob) initCustomBg(); buildPresetSwatches();
  toast(t('admin_theme_applied'), 5000);
}
function watchAdminTheme(){
  const want = (TDCloud.isConfigured() && TDCloud.getSession() && state.cloudClassId) ? state.cloudClassId : null;
  if(want === adminThemeFor) return;
  if(adminThemeUnsub){ adminThemeUnsub(); adminThemeUnsub = null; }
  adminThemeFor = want;
  if(want) adminThemeUnsub = TDCloud.subscribeAdminTheme(want, th=>{ if(th) applyAdminTheme(want, th); });
}
TDCloud.onAuthChanged(watchAdminTheme);

/* platform (Canvas): keep state.school, and so isPro(), in step with the signed-in teacher's school — joined with a code
   or assigned by a Canvas launch. schools/* has no client rule, so the pro flag comes from the getMySchoolPro callable
   (js/cloud.js), not a direct read. Off unless the platform asks for school-level Pro. */
let schoolUnsub = null;
function watchMySchool(){
  if(!(PF && PF.schoolPro)) return;
  if(schoolUnsub){ schoolUnsub(); schoolUnsub = null; }
  if(!(TDCloud.isConfigured() && TDCloud.getSession() && TDCloud.subscribeMySchool)){ state.school = null; return; }
  schoolUnsub = TDCloud.subscribeMySchool(s=>{ state.school = (s && s.schoolId) ? s : null; buildProStatus(); });
}
TDCloud.onAuthChanged(watchMySchool);
setInterval(watchAdminTheme, 4000);                      // picks up a class switch / Cloud Class link without touching those code paths
{
  const acc = document.getElementById('accept-admin-theme');
  if(acc){ acc.checked = state.acceptAdminTheme !== false; acc.addEventListener('change', e=>{ state.acceptAdminTheme = e.target.checked; saveState(); }); }
}

/* ---------------- Classes: top-bar switcher + Settings manager ----------------
   The pill shows the class that's open; its menu switches class. Switching
   saves the current class, points the index at the new one and reloads, so
   every widget comes back up from that class's own saved state. ------------ */
function classDisplayName(c){
  return (c && c.name && c.name.trim()) ? c.name.trim() : t('class_default_name');
}

function buildClassPill(){
  const wrap = document.getElementById('class-pill-wrap');
  const nameEl = document.getElementById('class-pill-name');
  if(!wrap || !nameEl) return;
  nameEl.textContent = classDisplayName(activeClass());
  wrap.querySelector('.class-pill').title = t('class_switch_label');
  // In the top pill row the pill sits on the left, so drop the menu leftwards;
  // in the header's right-hand actions it drops rightwards.
  wrap.classList.toggle('align-left', wrap.parentElement && wrap.parentElement.id === 'pills-top');
}

function buildClassMenu(){
  const menu = document.getElementById('class-menu');
  if(!menu) return;
  menu.innerHTML = '';
  classes.list.forEach(c=>{
    const btn = document.createElement('button');
    btn.className = 'class-menu-item' + (c.id === activeClassId() ? ' active' : '');
    const mm = classMeta(c.id);
    btn.innerHTML = `<span class="class-menu-name"></span><span class="class-menu-meta">${mm.n}${mm.cloud ? ' ☁️' : ''}</span><span class="class-menu-tick">${c.id === activeClassId() ? '✓' : ''}</span>`;
    btn.querySelector('.class-menu-name').textContent = classDisplayName(c);
    btn.addEventListener('click', ()=> switchClass(c.id));
    menu.appendChild(btn);
  });
  if(KINDER) return;   // Kinder: no new class, no Class Builder
  const sep = document.createElement('div');
  sep.className = 'class-menu-sep';
  menu.appendChild(sep);
  const nw = document.createElement('button');
  nw.className = 'class-menu-item manage';
  nw.textContent = t('cb_new_menu');
  nw.addEventListener('click', ()=>{ closeClassMenu(); openClassBuilder('classes', { newClass:true }); });
  menu.appendChild(nw);
  const manage = document.createElement('button');
  manage.className = 'class-menu-item manage';
  manage.textContent = t('class_manage');
  manage.addEventListener('click', ()=>{ closeClassMenu(); openClassBuilder('classes'); });
  menu.appendChild(manage);
}

function openClassMenu(){
  buildClassMenu();
  document.getElementById('class-menu').hidden = false;
  document.getElementById('class-pill').setAttribute('aria-expanded','true');
}
function closeClassMenu(){
  const menu = document.getElementById('class-menu');
  if(menu) menu.hidden = true;
  const pill = document.getElementById('class-pill');
  if(pill) pill.setAttribute('aria-expanded','false');
}

function switchClass(id){
  closeClassMenu();
  if(id === activeClassId()) return;
  if(!classes.list.some(c=> c.id === id)) return;
  saveState();            // flush the class we're leaving (its key is still the active one)
  classes.active = id;
  saveClasses();
  location.reload();      // reopen as that class's own instance
}

function newClassId(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function addClass(name, copyCurrent, students){
  if(classes.list.length >= MAX_CLASSES){ toast(t('class_max', { max: MAX_CLASSES })); return; }
  const id = newClassId();
  saveState();            // make sure the class we're leaving is on disk first
  if(copyCurrent){
    try{ localStorage.setItem(classStateKey(id), JSON.stringify(Object.assign({}, state, { cloudClassId:null }))); }catch(e){}   // a copy is NOT linked to the same cloud class
  }
  if(Array.isArray(students)){ try{ localStorage.setItem(CB_SEED_PREFIX + id, JSON.stringify(students)); }catch(e){} }   // v0.19.0: a new class starts with the students typed in Class Builder
  classes.list.push({ id, name: (name || '').trim() });
  classes.active = id;
  saveClasses();
  location.reload();
}

function renameClass(id, name){
  const c = classes.list.find(x=> x.id === id);
  if(!c) return;
  c.name = (name || '').trim();
  saveClasses();
  buildClassPill();
}

async function deleteClass(id){
  if(classes.list.length <= 1){ toast(t('class_last')); return; }
  const c = classes.list.find(x=> x.id === id);
  if(!c) return;
  if(!confirm(t('class_delete_confirm', { name: classDisplayName(c) }))) return;
  const wasActive = id === activeClassId();
  // its own saved state, and its own background image
  try{ localStorage.removeItem(classStateKey(id)); }catch(e){}
  const bgId = id === DEFAULT_CLASS_ID ? 'background' : `background::${id}`;
  try{ await idb.delete('images', bgId); }catch(e){ /* nothing saved, or storage blocked */ }
  classes.list = classes.list.filter(x=> x.id !== id);
  if(wasActive){
    classes.active = classes.list[0].id;
    saveClasses();
    location.reload();    // the open class just went away — open the next one
    return;
  }
  saveClasses();
  buildClassList();
  buildClassPill();
  toast(t('class_deleted'));
}

function buildClassList(){            // v0.19.0: the class list moved into Class Builder; Settings keeps a one-line summary
  const el = document.getElementById('classes-summary');
  if(el) el.textContent = t('cb_settings_sum', { name:classDisplayName(activeClass()), n:state.roster.length });
  if(cbRedraw) cbRedraw();
}

function wireClasses(){
  const pill = document.getElementById('class-pill');
  if(!pill) return;
  pill.addEventListener('click', e=>{
    e.stopPropagation();
    const menu = document.getElementById('class-menu');
    if(menu.hidden) openClassMenu(); else closeClassMenu();
  });
  document.addEventListener('click', e=>{
    const wrap = document.getElementById('class-pill-wrap');
    if(wrap && !wrap.contains(e.target)) closeClassMenu();
  });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeClassMenu(); });

  const cbOpenBtn = document.getElementById('class-builder-open');
  if(cbOpenBtn) cbOpenBtn.addEventListener('click', ()=> openClassBuilder('classes'));
  buildClassList();
  buildClassPill();
}

/* ---------------- Drawers open/close ---------------- */
function wireDrawer(btnId, drawerId, closeId){
  const drawer = document.getElementById(drawerId);
  document.getElementById(btnId).addEventListener('click', ()=>{ drawer.hidden = false; });
  document.getElementById(closeId).addEventListener('click', ()=>{ drawer.hidden = true; });
}
wireDrawer('btn-theme','theme-drawer','theme-close');
wireDrawer('btn-settings','settings-drawer','settings-close');

/* ---------------- TeachersDeck Pro ---------------- */
function buildProStatus(){
  const badge = document.getElementById('pro-badge');
  const text = document.getElementById('pro-status-text');
  const licenseRow = document.getElementById('pro-license-row');
  const upgradeBtn = document.getElementById('pro-upgrade-open');
  if(isPro()){
    badge.textContent = 'PRO'; badge.classList.add('is-pro');
    text.textContent = t('pro_status_pro'); text.removeAttribute('data-i18n');
    licenseRow.hidden = true;
    upgradeBtn.hidden = true;
  } else {
    badge.textContent = 'FREE'; badge.classList.remove('is-pro');
    text.textContent = t('pro_status_free'); text.setAttribute('data-i18n','pro_status_free');
    licenseRow.hidden = false;
    upgradeBtn.hidden = UNI || !!(PF && !PF.proPurchase);   // no purchase in UniDeck (campus plan) or an LMS edition that doesn't sell Pro (Moodle: the order form or a quote); ClassIn and Canvas sell it (owner, 13 Nov 2026); a key can always be entered
  }
}

/* ---- Pro by VietQR (v0.41.0, backend v2.30.0) ----
   createOrder prices the plan on the server and returns a note token (TD K7Q4M9), the QR and the bank account.
   The order is kept on this device (PRO_ORDER_KEY) and polled with getOrder until the owner marks it paid; then the
   key, already bound to this device, is activated here. Cards, Stripe and the order form are gone (owner, 7 Nov 2026). */
const PRO_ORDER_KEY = 'td_pro_order';
const PRO_ORDER_POLL_MS = 20000;
let proOrderTimer = null;
const vndFmt = n => Number(n).toLocaleString(state.lang === 'vi' ? 'vi-VN' : 'en-US') + '₫';
function readProOrder(){ try{ return JSON.parse(localStorage.getItem(PRO_ORDER_KEY)); }catch(e){ return null; } }
function saveProOrder(o){ try{ o ? localStorage.setItem(PRO_ORDER_KEY, JSON.stringify(o)) : localStorage.removeItem(PRO_ORDER_KEY); }catch(e){} }
function selectedPlan(){ const r = document.querySelector('input[name="pay-plan"]:checked'); return r ? r.value : 'annual'; }

function buildPayStep1(){
  document.getElementById('pay-price-monthly').textContent = t('pay_per_month', { price: vndFmt(PRO_PRICING_VND.monthly) });
  document.getElementById('pay-price-annual').textContent = t('pay_per_year', { price: vndFmt(PRO_PRICING_VND.annual) });
  document.getElementById('pay-price-founding').textContent = t('pay_per_year', { price: vndFmt(PRO_PRICING_VND.founding) });
  const renew = state.license && state.license.key;
  const note = document.getElementById('pay-renew-note');
  note.hidden = !renew;
  if(renew) note.textContent = t('pay_renew_note', { key: state.license.key });
  const em = document.getElementById('pay-email');
  if(!em.value){ try{ em.value = localStorage.getItem('td_pay_email') || ''; }catch(e){} }
  document.getElementById('pay-start-msg').hidden = true;
}
function showPayStep(n){
  document.getElementById('pay-step-1').hidden = n !== 1;
  document.getElementById('pay-step-2').hidden = n !== 2;
}
function showProOrder(o){
  document.getElementById('vietqr-qr-box').innerHTML = o.qrUrl ? `<img src="${escHtml(o.qrUrl)}" alt="VietQR">` : '';
  document.getElementById('pay-amount').textContent = vndFmt(o.amount);
  document.getElementById('pay-token').textContent = o.token;
  const b = o.bank || {};
  document.getElementById('vietqr-account-details').innerHTML = b.account ? `
    <div class="vietqr-acct-line vietqr-acct-name">${escHtml(b.accountName || '')}</div>
    <div class="vietqr-acct-line vietqr-acct-number">${escHtml(b.account)}</div>
    <div class="vietqr-acct-line">${escHtml(b.bankName || '')}</div>` : '';
  showPayStep(2);
}
async function startProOrder(){
  const msg = document.getElementById('pay-start-msg'), btn = document.getElementById('pay-start');
  msg.hidden = true;
  if(!isOfficialBuild()){ msg.textContent = t('pro_unofficial'); msg.hidden = false; return; }
  const email = document.getElementById('pay-email').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ msg.textContent = t('pay_email_needed'); msg.hidden = false; document.getElementById('pay-email').focus(); return; }
  const plan = selectedPlan();
  const body = { product:'teachersdeck', cycle: plan === 'monthly' ? 'monthly' : 'annual', founding: plan === 'founding',
    email, name: document.getElementById('pay-name').value.trim(), deviceId: deviceId() };
  if(state.license && state.license.key) body.renewKey = state.license.key;
  btn.disabled = true;
  try{
    const o = await callLicenseFn('createOrder', body);
    try{ localStorage.setItem('td_pay_email', email); }catch(e){}
    saveProOrder({ id:o.id, secret:o.secret, token:o.token, amount:o.amount, qrUrl:o.qrUrl, bank:o.bank, at:Date.now() });
    showProOrder(o);
    pollProOrder();
  } catch(e){
    msg.textContent = t({ 'payments-off':'pay_off', 'founding-full':'pay_founding_full', 'too-many-open':'pay_too_many' }[e.code] || (e.message === 'network' || e.message === 'not-configured' ? 'pro_license_network_error' : 'pay_failed'));
    msg.hidden = false;
  } finally { btn.disabled = false; }
}
// Checks the saved order once; activates Pro when it's paid. Safe to call on every launch.
async function checkProOrder(){
  const saved = readProOrder(); if(!saved) return null;
  let o;
  try{ o = await callLicenseFn('getOrder', { id: saved.id, secret: saved.secret }); }
  catch(e){ if(e.status === 404) saveProOrder(null); return null; }
  if(o.status === 'paid' && o.key){
    saveProOrder(null);
    const r = await activateLicenseOnline(o.key);
    if(r.ok){ setLicense(Object.assign({}, state.license, { key:o.key, pro:true, lastCheck:Date.now() })); buildProStatus(); toast(t(o.renewed ? 'pay_renewed' : 'pay_done')); closeProModal(); }
    return o;
  }
  if(o.status === 'cancelled'){ saveProOrder(null); if(!proModalBackdrop.hidden){ buildPayStep1(); showPayStep(1); } return o; }
  return o;
}
function pollProOrder(){
  clearTimeout(proOrderTimer);
  if(!readProOrder() || proModalBackdrop.hidden) return;
  proOrderTimer = setTimeout(async ()=>{ await checkProOrder(); pollProOrder(); }, PRO_ORDER_POLL_MS);
}

/* ---- The Shop in the LMS editions (owner, 13 Nov 2026; js/tdstore.js, backend teacherStore.js) ----
   Theme → Shop opens the card deck with every theme, watch face and dock sold to teachers (price on each card,
   "Yours" on what the store key owns). Buy → the same VietQR path as Pro, one item per order; the owner presses Mark
   paid; the item arrives here (checked every 20 s while the dialog is open, and at every start) and is put on. */
const tdShopVi = () => state.lang === 'vi';
const SHOP_POLL_MS = 20000;
let tdShopTimer = null, tdShopCatalog = null;
if(typeof TD_STORE !== 'undefined' && (TD_STORE.enabled || TD_STORE.features)){   // features: the Premium Whiteboard, in every edition that takes payments
  TD_STORE.setCaller(callLicenseFn);
  TD_STORE.onArrive(tdStoreArrived);
  TD_STORE.onChange(() => { if(typeof TDWhiteboard !== 'undefined') TDWhiteboard.refreshTier(); });
  setTimeout(()=>{ (TD_STORE.pendingOrder() ? TD_STORE.checkOrder().then(r=>{ if(r && r.status === 'paid') tdShopPaid(r); }) : TD_STORE.refresh()).catch(()=>{}); }, 1500);
}
/** Bought packs came down: the app takes them in without a reload. */
function tdStoreArrived(fresh){
  tdPremiumCache = null;
  addStoreThemes();
  PRESETS.filter(p=>p.premium && !PREMIUM_THEMES.includes(p)).forEach(p=>PREMIUM_THEMES.push(p));
  buildPresetSwatches(); refreshSkinnedWidgets();
  const names = fresh.map(p=>p.name[tdShopVi() ? 'vi' : 'en'] || p.name.en).join(', ');
  const appName = (window.DECK_EDITION && DECK_EDITION.name) || 'TeachersDeck';   // LectureDeck, TinyTeachersDeck
  if(names) toast((t('ix_now_in_a', { a: appName })) + names);
}
/** The Premium Whiteboard (owner, 15 Nov 2026): a locked whiteboard button offers it. 250,000 VND on the store key, or
    TeachersDeck Pro, which includes it. The pay dialog is the Shop's; the price here is only shown (the server prices). */
const WB_SKU = 'whiteboard-premium', WB_PRICE = 250000;
function openWhiteboardOffer(){
  if(typeof TD_STORE === 'undefined' || !TD_STORE.features){ toast(t('wb_locked'), 5000); openProModal(); return; }
  openTdShopPay({ key: WB_SKU, name: t('wb_premium'), price: WB_PRICE, blurb: t('wb_premium_blurb'), altPro: !isPro() && !UNI && !(PF && !PF.proPurchase) });
}
/** Puts on what was just bought (or picked from what the key owns). */
function tdShopApply(sku){
  if(sku === WB_SKU){ if(typeof TDWhiteboard !== 'undefined'){ TDWhiteboard.refreshTier(); } toast(t('wb_premium_on')); return; }
  const pack = (window.TD_PREMIUM_PACKS || []).find(p=>p && p.id === sku); if(!pack) return;
  const it = pack.items[0];
  if(pack.kind === 'theme'){ setUiTheme(it.id); }
  else if(pack.kind === 'face'){ state.premiumFace = pack.items.length > 1 ? pack.id + ':' + it.id : pack.id; saveState(); if(widgetEls.clock) rerenderWidget('clock'); else openWidget('clock'); }
  else if(pack.kind === 'dock'){ state.dockStyle = it.style; saveState(); applyTdDock(); buildDockSwatches(); }
}
async function openTdShop(anchor){
  const vi = tdShopVi(), L = vi ? 'vi' : 'en';
  let cat;
  try{ cat = tdShopCatalog = await TD_STORE.catalog(); }
  catch(e){ toast(t('ix_the_shop_could_not_open_check_the_co')); return; }
  const owned = new Set(cat.owned || []);
  const KINDS = { theme: t('ix_themes'), face: t('ix_watch_faces'), dock: t('ix_docks') };
  const options = [];
  ['theme', 'face', 'dock'].forEach(kind => cat.catalog.filter(i=>i.kind === kind).forEach(i=>{
    const pv = (cat.previews || {})[i.sku], first = pv && pv.items && pv.items[0];
    const o = { key: i.sku, name: i.name[L] || i.name.en, group: KINDS[kind], badge: owned.has(i.sku) ? (t('ix_yours')) : vndFmt(i.price), price: i.price, owned: owned.has(i.sku) };
    if(kind === 'theme' && first && window.StoreCore){ o.bg = StoreCore.themeBackground(first, false); o.mock = true; }
    else if(kind === 'face' && first){ o.svg = first.svg; o.swatch = first.swatch; }
    else if(first){ o.swatch = first.swatch; }
    options.push(o);
  }));
  if(!options.length){ toast(t('ix_nothing_in_the_shop_yet')); return; }
  FacePicker.open({ anchor, lang: L, options, current: '', title: t('ix_shop'),
    pickLabel: o=> o.owned ? (t('ix_use')) : (t('ix_buy')) + vndFmt(o.price),
    onPick: sku=>{ const o = options.find(x=>x.key === sku); if(o && o.owned) tdShopApply(sku); else openTdShopPay(o); },
    refocus: ()=>document.querySelector('#ui-theme-browse .td-shop-open') });
}
/* The pay dialog: the item, an email for the receipt and the store key, then the VietQR code and the note token. */
function tdShopDialog(){
  let d = document.getElementById('td-shop-pay');
  if(d) return d;
  d = document.createElement('div'); d.id = 'td-shop-pay'; d.className = 'pro-modal-backdrop'; d.hidden = true;
  d.innerHTML = `<div class="pro-modal td-shop-modal" role="dialog" aria-modal="true" aria-labelledby="tsp-title">
    <div class="drawer-head"><h2 id="tsp-title"></h2><button class="icon-btn" id="tsp-close" type="button" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button></div>
    <div class="drawer-body">
    <div id="tsp-step1">
      <p class="tsp-item"><b id="tsp-name"></b> · <span id="tsp-price"></span></p>
      <p class="muted tsp-blurb" id="tsp-blurb" hidden></p>
      <p class="tsp-alt" id="tsp-alt" hidden><span id="tsp-alt-t"></span> <button class="ghost-btn" id="tsp-alt-pro" type="button"></button></p>
      <label class="tsp-label"><span id="tsp-email-l"></span><input type="email" id="tsp-email" autocomplete="email"></label>
      <p class="muted tsp-note" id="tsp-note"></p>
      <button class="primary-btn" id="tsp-start" type="button" style="width:100%; margin-top:4px"></button>
      <p class="dock-vis-hint" id="tsp-msg" role="alert" hidden></p>
    </div>
    <div id="tsp-step2" hidden>
      <div class="qr-box" id="tsp-qr"></div>
      <p class="pay-amount" id="tsp-amount"></p>
      <div class="pay-token-row"><span class="pay-token" id="tsp-token"></span><button type="button" class="ghost-btn" id="tsp-copy"></button></div>
      <div class="vietqr-account-details" id="tsp-bank"></div>
      <p class="dock-vis-hint pay-wait" id="tsp-wait"></p>
      <p class="dock-vis-hint" style="text-align:center"><button class="ghost-btn" id="tsp-cancel" type="button"></button></p>
    </div>
    <details class="tsp-key"><summary id="tsp-key-s"></summary>
      <div class="tsp-key-row"><input type="text" id="tsp-key" placeholder="SK-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false"><button class="ghost-btn" id="tsp-key-use" type="button"></button></div>
      <p class="dock-vis-hint" id="tsp-key-msg"></p>
    </details>
    </div>
  </div>`;
  document.body.appendChild(d);
  const close = ()=>{ d.hidden = true; clearTimeout(tdShopTimer); };
  d.addEventListener('click', e=>{ if(e.target === d) close(); });
  d.querySelector('#tsp-close').addEventListener('click', close);
  d.addEventListener('keydown', e=>{ if(e.key === 'Escape'){ e.stopPropagation(); close(); } });
  d.querySelector('#tsp-start').addEventListener('click', tdShopStart);
  d.querySelector('#tsp-alt-pro').addEventListener('click', ()=>{ close(); openProModal(); });
  d.querySelector('#tsp-copy').addEventListener('click', ()=>{ const o = TD_STORE.pendingOrder(); if(o && navigator.clipboard) navigator.clipboard.writeText(o.token).then(()=>toast(t('ix_copied'))).catch(()=>{}); });
  d.querySelector('#tsp-cancel').addEventListener('click', ()=>{ TD_STORE.cancelLocal(); clearTimeout(tdShopTimer); tdShopShow(); });
  d.querySelector('#tsp-key-use').addEventListener('click', async ()=>{
    const vi = tdShopVi(), msg = d.querySelector('#tsp-key-msg');
    try{ const fresh = await TD_STORE.useKey(d.querySelector('#tsp-key').value); msg.textContent = fresh.length ? '' : (t('ix_key_in_use_your_items_are_here')); tdShopShow(); }
    catch(e){ msg.textContent = e.code === 'bad-key' ? (t('ix_a_store_key_looks_like_sk_xxxx_xxxx_')) : e.status === 404 ? (t('ix_no_such_store_key')) : (t('ix_could_not_connect')); }
  });
  return d;
}
let tdShopItem = null;
function openTdShopPay(item){
  tdShopItem = item || null;
  const d = tdShopDialog(); tdShopShow(); d.hidden = false;
  const f = d.querySelector(TD_STORE.pendingOrder() ? '#tsp-copy' : '#tsp-email'); if(f) f.focus();
  if(TD_STORE.pendingOrder()) tdShopPoll(true);
}
function tdShopShow(){
  const d = tdShopDialog(), vi = tdShopVi(), o = TD_STORE.pendingOrder(), it = tdShopItem;
  const $ = s=>d.querySelector(s);
  $('#tsp-title').textContent = t('ix_buy_from_the_shop');
  $('#tsp-name').textContent = it ? it.name : '';
  $('#tsp-price').textContent = it ? vndFmt(it.price) : '';
  $('#tsp-blurb').hidden = !(it && it.blurb); $('#tsp-blurb').textContent = (it && it.blurb) || '';
  $('#tsp-alt').hidden = !(it && it.altPro && !o); $('#tsp-alt-t').textContent = t('wb_pro_alt'); $('#tsp-alt-pro').textContent = t('wb_see_pro');
  $('#tsp-email-l').textContent = t('ix_email_for_the_receipt_and_your_store');
  const em = $('#tsp-email'); if(!em.value){ try{ em.value = localStorage.getItem('td_pay_email') || ''; }catch(e){} }
  $('#tsp-note').textContent = TD_STORE.key()
    ? (t('ix_this_goes_on_your_store_key_a', { a: TD_STORE.key() }))
    : (t('ix_once_paid_you_get_a_store_key_to_use'));
  $('#tsp-start').textContent = t('ix_pay_with_vietqr');
  $('#tsp-copy').textContent = t('ix_copy');
  $('#tsp-cancel').textContent = t('ix_cancel_this_order');
  $('#tsp-key-s').textContent = TD_STORE.key() ? (t('ix_your_store_key_a', { a: TD_STORE.key() })) : (t('ix_i_have_a_store_key'));
  $('#tsp-key-use').textContent = t('ix_use_key');
  $('#tsp-step1').hidden = !!o || !it; $('#tsp-step2').hidden = !o;
  if(o){
    $('#tsp-qr').innerHTML = o.qrUrl ? `<img src="${escHtml(o.qrUrl)}" alt="VietQR">` : '';
    $('#tsp-amount').textContent = vndFmt(o.amount);
    $('#tsp-token').textContent = o.token;
    const b = o.bank || {};
    $('#tsp-bank').innerHTML = b.account ? `<div class="vietqr-acct-line vietqr-acct-name">${escHtml(b.accountName || '')}</div><div class="vietqr-acct-line vietqr-acct-number">${escHtml(b.account)}</div><div class="vietqr-acct-line">${escHtml(b.bankName || '')}</div>` : '';
    $('#tsp-wait').textContent = t('ix_keep_a_in_the_transfer_note_exactly_', { a: o.token });
  }
}
async function tdShopStart(){
  const d = tdShopDialog(), vi = tdShopVi(), msg = d.querySelector('#tsp-msg'), btn = d.querySelector('#tsp-start');
  msg.hidden = true;
  if(!tdShopItem) return;
  const email = d.querySelector('#tsp-email').value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ msg.textContent = t('pay_email_needed'); msg.hidden = false; d.querySelector('#tsp-email').focus(); return; }
  btn.disabled = true;
  try{
    await TD_STORE.order(tdShopItem.key, email, deviceId());
    try{ localStorage.setItem('td_pay_email', email); }catch(e){}
    tdShopShow(); tdShopPoll(false);
  } catch(e){
    msg.textContent = e.code === 'owned' ? (t('ix_your_store_key_already_has_this'))
      : e.code === 'payments-off' ? t('pay_off') : e.code === 'too-many-open' ? t('pay_too_many')
      : e.code === 'not-released' ? (t('ix_this_one_is_not_out_yet'))
      : (e.message === 'network' || e.message === 'not-configured') ? t('pro_license_network_error') : t('pay_failed');
    msg.hidden = false;
  } finally { btn.disabled = false; }
}
function tdShopPoll(now){
  clearTimeout(tdShopTimer);
  const d = document.getElementById('td-shop-pay');
  if(!TD_STORE.pendingOrder() || !d || d.hidden) return;
  tdShopTimer = setTimeout(async ()=>{
    try{ const r = await TD_STORE.checkOrder(); if(r && r.status === 'paid'){ tdShopPaid(r); return; } if(!TD_STORE.pendingOrder()) tdShopShow(); }catch(e){}
    tdShopPoll(false);
  }, now ? 0 : SHOP_POLL_MS);
}
function tdShopPaid(r){
  const d = document.getElementById('td-shop-pay'); if(d) d.hidden = true;
  clearTimeout(tdShopTimer);
  toast(t('ix_paid_your_store_key_a', { a: r.storeKey }));
  if(r.sku) tdShopApply(r.sku);
}

const proModalBackdrop = document.getElementById('pro-modal-backdrop');
function openProModal(){
  if(UNI){ toast(t('pro_uni_campus')); return; }   // UniDeck: Pro comes with the campus plan, never bought by a lecturer here
  if(PF && !PF.proPurchase){ toast(t('pro_platform_order', { name: PF.name || 'TeachersDeck' })); return; }   // Moodle: 1,250,000 VND a teacher a year, by the order form or a quote (owner, 8 Nov 2026); ClassIn and Canvas sell Pro here (13 Nov 2026)
  const saved = readProOrder();
  if(saved){ showProOrder(saved); } else { buildPayStep1(); showPayStep(1); }
  proModalBackdrop.hidden = false;
  if(saved) checkProOrder().then(()=> pollProOrder());
}
function closeProModal(){ proModalBackdrop.hidden = true; clearTimeout(proOrderTimer); }
document.getElementById('pro-upgrade-open').addEventListener('click', ()=> openProModal());
document.getElementById('pro-modal-close').addEventListener('click', closeProModal);
proModalBackdrop.addEventListener('click', e=>{ if(e.target === proModalBackdrop) closeProModal(); });
document.getElementById('pay-start').addEventListener('click', startProOrder);
document.getElementById('pay-token-copy').addEventListener('click', ()=>{
  const tok = document.getElementById('pay-token').textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(tok) : Promise.reject()).then(()=> toast(t('pay_copied')), ()=> toast(tok));
});
document.getElementById('pay-cancel-local').addEventListener('click', e=>{
  e.preventDefault();
  if(!confirm(t('pay_start_over_confirm'))) return;
  saveProOrder(null); clearTimeout(proOrderTimer); buildPayStep1(); showPayStep(1);
});
// A saved order is checked once at launch, so Pro switches on even if the teacher closed the window while waiting.
setTimeout(()=>{ if(readProOrder()) checkProOrder(); }, 4000);

document.getElementById('pro-license-activate').addEventListener('click', async ()=>{
  const input = document.getElementById('pro-license-input');
  const btn = document.getElementById('pro-license-activate');
  const key = input.value;
  if(!validateLicenseKeyFormat(key)){ toast(t('pro_license_invalid')); return; }
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t('pro_license_checking');
  const result = await activateLicenseOnline(key);
  btn.disabled = false;
  btn.textContent = prevLabel;
  if(result.ok){
    toast(t('pro_license_valid'));
    buildProStatus();
    closeProModal();
    return;
  }
  const msgKey = {
    'format': 'pro_license_invalid',
    'not-found': 'pro_license_invalid',
    'device-mismatch': 'pro_license_device_mismatch',
    'revoked': 'pro_license_revoked',
    'expired': 'pro_license_expired',
    'not-configured': 'pro_license_network_error',
    'network': 'pro_license_network_error',
  }[result.reason] || 'pro_license_invalid';
  toast(t(msgKey));
});

/* ---------------- Settings: reset ---------------- */
document.getElementById('reset-layout').addEventListener('click', ()=>{
  state.layout = {};
  Object.keys(state.active).filter(id=>state.active[id]).forEach(id=>{
    closeWidget(id); openWidget(id);
  });
  saveState();
  toast(t('layout_reset_toast'));
  document.getElementById('settings-drawer').hidden = true;
});
document.getElementById('reset-all').addEventListener('click', ()=>{
  if(!confirm(t('reset_all_confirm'))) return;
  // every class's state, not just the active one
  classes.list.forEach(c=>{ try{ localStorage.removeItem(classStateKey(c.id)); }catch(e){} });
  try{ localStorage.removeItem(CLASSES_KEY); }catch(e){}
  localStorage.removeItem(LS_KEY);
  try{ localStorage.removeItem(XKEY); }catch(e){}
  try{ localStorage.removeItem('td_drawdeck_v1'); }catch(e){}   // DrawDeck prefs (its boards live in the IndexedDB deleted below)
  indexedDB.deleteDatabase('TeachersDeck');
  location.reload();
});

/* ---------------- Language: quick toggle + settings pickers ---------------- */
function setLanguage(code){
  state.lang = code;
  { const pt = premiumTheme(); themeGreeting(pt ? tdThemeItem(pt.id) : null); }   // the theme's greeting in the new language
  saveState();
  document.documentElement.lang = code;
  localizeNode(document);
  rebuildAllDocks();
  buildLangToggle();
  buildClassPill();
  buildClassList();
  [modeSwitch, modeToggle].forEach(sw=>{ if(sw) sw.relabel({ label:t('mode_title'), light:t('mode_light'), dark:t('mode_dark') }); });
}
let modeSwitch = null, modeToggle = null;   // the Light / Dark switch in the Theme drawer, and its icon-only twin in the top bar (set in init)

function buildLangToggle(){
  const box = document.getElementById('lang-toggle');
  box.innerHTML = '';
  state.langPair.forEach(code=>{
    const lang = LANGS.find(l=>l.code===code);
    if(!lang) return;
    const btn = document.createElement('button');
    btn.textContent = lang.code.toUpperCase();
    btn.title = lang.name;
    btn.className = state.lang === code ? 'active' : '';
    btn.addEventListener('click', ()=> setLanguage(code));
    box.appendChild(btn);
  });
}

function buildLangSelects(){
  const sel1 = document.getElementById('lang-select-1');
  const sel2 = document.getElementById('lang-select-2');
  [sel1, sel2].forEach(sel=>{
    sel.innerHTML = LANGS.map(l=>`<option value="${l.code}">${l.name}</option>`).join('');
  });
  sel1.value = state.langPair[0];
  sel2.value = state.langPair[1];

  function onPairChange(){
    state.langPair = [sel1.value, sel2.value];
    saveState();
    if(!state.langPair.includes(state.lang)){
      setLanguage(state.langPair[0]);
    } else {
      buildLangToggle();
    }
  }
  sel1.addEventListener('change', onPairChange);
  sel2.addEventListener('change', onPairChange);
}

/* ---------------- Cloud Class award-reason presets ----------------
   Quick-pick reasons shown in the roster's "Quick reason…" dropdown, so a
   teacher can award (or dock) points with one click instead of typing a
   reason and pressing +5/-5 every time. Each entry needs a unique `key`
   (used to build the dropdown's option value and to look up its i18n
   label, `cc_reason_<key>` in STRINGS above — add translations there if
   you want this in more than English) and a `points` delta: positive for
   MERIT_REASONS, negative for DEMERIT_REASONS. Add, remove, or re-point
   entries here; no other code needs to change. Anything not covered here
   still works via "Custom reason…" + the existing +5/-5 buttons. */
const MERIT_REASONS = [
  { key:'participation', points:1 },
  { key:'helping',       points:2 },
  { key:'kindness',      points:2 },
  { key:'great_work',    points:5 },
];
const DEMERIT_REASONS = [
  { key:'late',              points:-1 },
  { key:'talking',           points:-1 },
  { key:'not_listening',     points:-1 },
  { key:'not_participating', points:-1 },
  { key:'fighting',          points:-5 },
];

