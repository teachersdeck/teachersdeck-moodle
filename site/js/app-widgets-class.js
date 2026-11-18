/* ---------------- Widget implementations ---------------- */

/* TEST (branch glass-blue-test): the Glass Blue pack's watch faces, noise meter and traffic light.
   They show while the Glass Blue theme is picked (Theme → Backgrounds). Packs: js/premium-packs.js, drawn by js/store-core.js. */
var tdPremiumCache = null;
function tdPremiumSet(themeId){
  if(!tdPremiumCache){
    tdPremiumCache = {};
    const raw = (window.TD_PREMIUM_PACKS || []);
    if(window.StoreCore) raw.forEach(r=>{
      const v = StoreCore.validateStorePack(r); if(!v.ok){ console.warn('TeachersDeck: pack refused', r && r.id, v.error); return; }
      const pk = v.pack, all = tdPremiumCache.all || (tdPremiumCache.all = { faces:[], meters:[], lights:[] });
      pk.items.forEach(it=>{
        const o = Object.assign({ key: pk.id + (pk.items.length > 1 ? ':' + it.id : ''), pack: pk.id }, it);
        if(pk.kind === 'face') all.faces.push(o);
        else if(pk.kind === 'meter') all.meters.push(o);
        else if(pk.kind === 'light') all.lights.push(o);
      });
    });
  }
  if(themeId === '*') return tdPremiumCache.all || { faces:[], meters:[], lights:[] };
  // A theme's own set comes from its theme pack: face-<pack>-…, meter-<pack>, light-<pack> (Tết's theme is pack tet-2027)
  const pid = THEME_PACK_OF[themeId] || themeId, all = tdPremiumCache.all || { faces:[], meters:[], lights:[] };
  return { faces: all.faces.filter(f=>f.pack.indexOf('face-' + pid + '-') === 0),
    meter: all.meters.find(m=>m.pack === 'meter-' + pid) || null, light: all.lights.find(l=>l.pack === 'light-' + pid) || null };
}
const THEME_PACK_OF = { tet: 'tet-2027' };
function tdThemeItem(themeId){
  if(!window.StoreCore) return null;
  for(const r of (window.TD_PREMIUM_PACKS || [])){
    if(!r || r.kind !== 'theme') continue;
    const v = StoreCore.validateStorePack(r); if(!v.ok) continue;
    const it = v.pack.items.find(i => i.id === themeId); if(it) return it;
  }
  return null;
}
/* 11 Nov: what the Clock, Noise Meter and Traffic Light show. The theme's own set, then what was picked under "More…".
   The Clock row stays short: the face in use, the theme's own, the last ones used (at most 5) + Classic + More. */
function premiumSkins(){
  const pt = premiumTheme(), own = pt ? tdPremiumSet(pt.id) : { faces:[], meter:null, light:null }, all = tdPremiumSet('*');
  const find = (list, key) => key ? list.find(x=>x.key===key) || null : null;
  const faces = own.faces.slice(), cur = find(all.faces, state.premiumFace);
  if(cur && !faces.some(f=>f.key===cur.key)) faces.unshift(cur);
  (state.recentFaces || []).forEach(k=>{ const f = find(all.faces, k); if(f && !faces.some(x=>x.key===k) && faces.length < 5) faces.push(f); });
  return { faces, meter: find(all.meters, state.meterSkin) || own.meter, light: find(all.lights, state.lightSkin) || own.light, all };
}
/* "More…": every face, meter or light, grouped (faces by what they are). Picking one keeps it for this widget. */
function openSkinPicker(kind){
  const vi = state.lang === 'vi', all = tdPremiumSet('*');
  const list = kind === 'face' ? all.faces : kind === 'meter' ? all.meters : all.lights;
  const curKey = kind === 'face' ? state.premiumFace : kind === 'meter' ? state.meterSkin : state.lightSkin;
  const FORMS = [['watch', t('ix_wrist_watches')], ['pocket', t('ix_pocket_watches')], ['wall', t('ix_wall_clocks')], ['alarm', t('ix_alarm_clocks')], ['desk', t('ix_desk_clocks')]];
  const groups = kind === 'face' ? FORMS.map(([f, label])=>[label, list.filter(x=>(x.form||'watch')===f)]) : [[kind === 'meter' ? (t('ix_noise_meters')) : (t('ix_traffic_lights')), list]];
  const veil = document.createElement('div'); veil.className = 'skin-picker-veil';
  const title = kind === 'face' ? (t('ix_choose_a_clock_face')) : kind === 'meter' ? (t('ix_choose_a_noise_meter')) : (t('ix_choose_a_traffic_light'));
  veil.innerHTML = `<div class="skin-picker" role="dialog" aria-modal="true" aria-label="${title}"><h3><span>${title}</span><button type="button" class="sp-close" aria-label="${t('pro_close')}">×</button></h3>` +
    `<div class="sp-grid"><button type="button" class="sp-opt${!curKey ? ' on' : ''}" data-k=""><span class="sp-art" style="font-size:12px">${t('ix_the_theme_s_own')}</span>${t('ix_default')}</button></div>` +
    groups.filter(g=>g[1].length).map(([label, items])=>`<h4>${label}</h4><div class="sp-grid">` + items.map((x, i)=>`<button type="button" class="sp-opt${x.key===curKey?' on':''}" data-k="${x.key}"><span class="sp-art">${StoreCore.scopeSvg(x.svg, 'sp' + kind + i + '-')}</span>${x.name[vi?'vi':'en']}</button>`).join('') + '</div>').join('') + '</div>';
  const close = ()=>{ veil.remove(); document.removeEventListener('keydown', esc, true); };
  const esc = e=>{ if(e.key === 'Escape'){ e.stopPropagation(); close(); } };
  veil.addEventListener('click', e=>{
    if(e.target === veil || e.target.closest('.sp-close')){ close(); return; }
    const b = e.target.closest('.sp-opt'); if(!b) return;
    const k = b.dataset.k || null;
    if(kind === 'face'){ state.premiumFace = k; if(k){ state.recentFaces = [k].concat((state.recentFaces||[]).filter(x=>x!==k)).slice(0, 4); } }
    else if(kind === 'meter'){ state.meterSkin = k; if(state.noiseMeter && k) state.noiseMeter.style = 'skin'; }
    else state.lightSkin = k;
    saveState(); close(); rerenderWidget(kind === 'face' ? 'clock' : kind === 'meter' ? 'noise' : 'traffic');
  });
  document.addEventListener('keydown', esc, true);
  document.body.appendChild(veil);
  const f = veil.querySelector('.sp-opt.on') || veil.querySelector('.sp-opt'); if(f) f.focus();
}
document.addEventListener('click', e=>{ const b = e.target.closest('[data-skin-more]'); if(b){ e.stopPropagation(); openSkinPicker(b.dataset.skinMore); } });   // polish phase 2: the Theme alone decides (a photo behind it keeps it)
const reduceMotionNow = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function refreshSkinnedWidgets(){ ['clock','traffic','noise'].forEach(id=>{ if(widgetEls[id]) rerenderWidget(id); }); }

/* Polish phase 5: while a Timer, Stopwatch or Noise Meter runs, nothing moves behind it and the idle clock stays away. */
const tdBusySet = new Set();
function tdBusy(key, on){ if(on) tdBusySet.add(key); else tdBusySet.delete(key); document.body.classList.toggle('td-busy', tdBusySet.size > 0); if(typeof TDWallpaper !== 'undefined') TDWallpaper.pause(tdBusySet.size > 0); }

function renderClock(body){
  const skins = premiumSkins();
  if(skins && skins.faces.length && state.premiumFace !== 'classic') return renderSkinClock(body, skins);
  const classicCleanup = renderClassicClock(body);
  body.appendChild(faceSwitcher(skins));
  return classicCleanup;
}
/* 13 Nov: one button under the clock (the face in use) opens js/facepicker.js, a carousel of every face grouped by kind,
   so the widget stays the same size however many faces there are. Suggested first: Classic, the theme's own, the recent ones. */
function faceSwitcher(skins){
  const vi = state.lang === 'vi', L = vi ? 'vi' : 'en';
  const cur = state.premiumFace === 'classic' || !skins.faces.length ? 'classic' : (skins.faces.some(f=>f.key===state.premiumFace) ? state.premiumFace : skins.faces[0].key);
  const curFace = cur === 'classic' ? null : skins.all.faces.find(f=>f.key===cur) || null;
  const row = document.createElement('div'); row.className = 'fp-row';
  if(typeof FacePicker === 'undefined') return row;
  const btn = FacePicker.trigger({ lang: L, current: curFace ? { name: curFace.name[L] || curFace.name.en, swatch: curFace.swatch } : null });
  FacePicker.attach(btn, ()=>{
    const FORMS = [['watch', t('ix_wrist_watches')], ['pocket', t('ix_pocket')], ['wall', t('ix_wall')], ['alarm', t('ix_alarm')], ['desk', t('ix_desk')]];
    const SUG = t('ix_suggested'), seen = new Set();
    const opt = (f, group)=>{ seen.add(f.key); return { key:f.key, name:f.name[L] || f.name.en, swatch:f.swatch, svg:f.svg, group }; };
    const options = [{ key:'classic', name: t('ix_classic'), swatch:'#F4F1EA', svg: classicClockSvg().replace(/ class="[^"]*"/g, ''), group:SUG }];
    skins.faces.forEach(f=>options.push(opt(f, SUG)));
    FORMS.forEach(([form, label])=>skins.all.faces.forEach(f=>{ if((f.form||'watch') === form && !seen.has(f.key)) options.push(opt(f, label)); }));
    return { lang: L, options, current: cur, title: t('ix_choose_a_clock_face'), refocus: ()=>widgetEls.clock && widgetEls.clock.el.querySelector('.fp-trigger'),
      onPick: k=>{ state.premiumFace = k; if(k !== 'classic'){ state.recentFaces = [k].concat((state.recentFaces||[]).filter(x=>x!==k)).slice(0, 4); } saveState(); rerenderWidget('clock'); } };
  });
  row.appendChild(btn);
  return row;
}
function renderSkinClock(body, skins){
  const face = skins.faces.find(f=>f.key===state.premiumFace) || skins.faces[0];
  body.innerHTML = `<div class="skin-face"></div><div class="clock-date">--</div>`;
  const ctl = StoreCore.mountFace(body.querySelector('.skin-face'), face, { lang: state.lang==='vi'?'vi':'en', reduceMotion: reduceMotionNow() });
  body.appendChild(faceSwitcher(skins));
  const dateEl = body.querySelector('.clock-date');
  function tickDate(){
    const d = new Date();
    dateEl.textContent = state.calendarSystem === 'lunar' ? lunarFullLabel(d)
      : d.toLocaleDateString(LOCALE_MAP[state.lang] || 'en-US', {weekday:'short', month:'short', day:'numeric'});
  }
  tickDate(); const iv = setInterval(tickDate, 30000);
  return ()=>{ ctl.stop(); clearInterval(iv); };
}
// Phase 1 (UI polish): the built-in face is an SVG, so it stays sharp at any window size (css/scale.css sizes it).
function classicClockSvg(){
  let ticks = '';
  for(let i=0;i<60;i++){
    const a = i*6*Math.PI/180, major = i%5===0, r1 = major ? 80 : 85, r2 = 89;
    const x1 = (100+r1*Math.sin(a)).toFixed(2), y1 = (100-r1*Math.cos(a)).toFixed(2), x2 = (100+r2*Math.sin(a)).toFixed(2), y2 = (100-r2*Math.cos(a)).toFixed(2);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${major?'#8f8a7c':'#c9c3b3'}" stroke-width="${major?3.2:1.4}" stroke-linecap="round"/>`;
  }
  return `<svg class="clock-svg" viewBox="0 0 200 200" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <defs><radialGradient id="ck-face" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#fbf9f4"/><stop offset="1" stop-color="#ede8dc"/></radialGradient></defs>
    <circle cx="100" cy="100" r="99" fill="url(#ck-face)"/>
    <circle cx="100" cy="100" r="95.5" fill="none" stroke="#dcd7c9" stroke-width="7"/>
    ${ticks}
    <line class="ck-h" x1="100" y1="108" x2="100" y2="48" stroke="#20242b" stroke-width="7" stroke-linecap="round"/>
    <line class="ck-m" x1="100" y1="110" x2="100" y2="26" stroke="#20242b" stroke-width="4.6" stroke-linecap="round"/>
    <line class="ck-s" x1="100" y1="118" x2="100" y2="20" stroke="#E06565" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="6.5" fill="#20242b"/><circle cx="100" cy="100" r="2.4" fill="#E06565"/>
  </svg>`;
}
function renderClassicClock(body){
  body.innerHTML = `
    ${classicClockSvg()}
    <div class="clock-digital">--:--</div>
    <div class="clock-date">--</div>
    <div class="clock-lunar"></div>
  `;
  const hr = body.querySelector('.ck-h'), min = body.querySelector('.ck-m'), sec = body.querySelector('.ck-s');
  const digital = body.querySelector('.clock-digital'), dateEl = body.querySelector('.clock-date');
  const lunarEl = body.querySelector('.clock-lunar');
  function tick(){
    const d = new Date();
    const h = d.getHours()%12, m = d.getMinutes(), s = d.getSeconds();
    hr.setAttribute('transform', `rotate(${h*30 + m*0.5} 100 100)`);
    min.setAttribute('transform', `rotate(${m*6 + s*0.1} 100 100)`);
    sec.setAttribute('transform', `rotate(${s*6} 100 100)`);
    let hh = d.getHours()%12; if(hh===0) hh=12;
    digital.textContent = `${hh}:${String(m).padStart(2,'0')} ${d.getHours()>=12?'PM':'AM'}`;
    if(state.calendarSystem === 'lunar'){
      dateEl.textContent = lunarFullLabel(d);
      lunarEl.textContent = '';
    } else {
      dateEl.textContent = d.toLocaleDateString(LOCALE_MAP[state.lang] || 'en-US', {weekday:'short', month:'short', day:'numeric'});
      lunarEl.textContent = state.calendarSystem === 'both' ? lunarFullLabel(d) : '';
    }
  }
  tick();
  const iv = setInterval(tick, 1000);
  return ()=>clearInterval(iv);
}

/* Telling Time (Nov 2026): the tile is js/tellingtime-tile.js on the engine js/tellingtime.js (the same files in StudentDeck).
   Free; the premium clock faces follow the Pro gate. Kinder (when it syncs this): o'clock and half past, the basic face. */
function renderTellingTime(body){
  if(!window.TellingTimeTile || !window.TellingTime){ body.textContent = 'Telling Time is not in this build.'; return null; }
  return TellingTimeTile.mount(body, {
    lang: () => document.documentElement.lang || state.lang,
    isPro,
    openPro: () => openProModal('tellingtime'),
    maxStep: KINDER ? 2 : 6,
    faces: KINDER ? ['basic'] : null
  });
}

function renderTimer(body, ctx){
  body.innerHTML = `
    <div class="big-readout">05:00</div>
    <div class="btn-row" style="margin-bottom:10px">
      <button class="wbtn" data-m="-1">-1m</button>
      <button class="wbtn" data-m="1">+1m</button>
      <button class="wbtn" data-m="5">+5m</button>
    </div>
    <div class="btn-row">
      <button class="wbtn primary" id="t-start" data-i18n-dyn data-key="start">${t('start')}</button>
      <button class="wbtn" id="t-reset" data-i18n="reset_btn">${t('reset_btn')}</button>
    </div>
  `;
  let total = 300, remaining = 300, running=false, iv=null;
  const pre = ctx && ctx.preset; if(pre){ total = remaining = pre.seconds; }   // platform (ClassIn): ?min=&sec=
  if(window.TD_BOARD) TD_BOARD.audioHint();   // platform (ClassIn): the one-time "Share audio" reminder
  const readout = body.querySelector('.big-readout');
  function render(){
    const m = Math.floor(remaining/60), s = remaining%60;
    readout.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  body.querySelectorAll('[data-m]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const delta = parseInt(b.dataset.m)*60;
      total = Math.max(60, total+delta);
      if(!running) remaining = total;
      render();
    });
  });
  const startBtn = body.querySelector('#t-start');
  function setRunning(isRunning){
    running = isRunning; tdBusy('timer', running);
    startBtn.dataset.key = running ? 'pause' : 'start';
    startBtn.textContent = t(startBtn.dataset.key);
  }
  startBtn.addEventListener('click', ()=>{
    if(!running){
      if(total<=0){ toast(t('timer_add_time')); return; }
      if(remaining<=0) remaining = total;
    }
    setRunning(!running);
    if(running){
      track('timer', fmtDur(remaining));
      iv = setInterval(()=>{
        remaining--;
        if(remaining<=0){ remaining=0; setRunning(false); clearInterval(iv); toast(t('time_up')); if(window.TD_BOARD) TD_BOARD.timerDone(); }   // platform (ClassIn): chime + full-window cue
        render();
      },1000);
    } else clearInterval(iv);
  });
  body.querySelector('#t-reset').addEventListener('click', ()=>{
    // Fully clear the cached duration, not just the countdown — otherwise
    // hitting Start again silently resumes the old number instead of
    // requiring a fresh +1m/+5m before it can run.
    clearInterval(iv); setRunning(false); total = 0; remaining = 0; render();
  });
  render();
  if(pre && pre.go) startBtn.click();   // platform (ClassIn): ?go=1
  return ()=>{ clearInterval(iv); tdBusy('timer', false); };
}

function renderStopwatch(body, ctx){
  body.innerHTML = `
    <div class="big-readout">00:00.0</div>
    <div class="btn-row">
      <button class="wbtn primary" id="s-start" data-i18n-dyn data-key="start">${t('start')}</button>
      <button class="wbtn" id="s-lap" data-i18n="lap">${t('lap')}</button>
      <button class="wbtn" id="s-reset" data-i18n="reset_btn">${t('reset_btn')}</button>
    </div>
    <ul class="lap-list" id="s-laps"></ul>
  `;
  let elapsed=0, running=false, iv=null, last=0, laps=[];
  const readout = body.querySelector('.big-readout');
  const lapsEl = body.querySelector('#s-laps');
  function fmt(ms){
    const cs = Math.floor(ms/100);
    const m = Math.floor(cs/600), s = Math.floor(cs/10)%60, d = cs%10;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;
  }
  function render(){ readout.textContent = fmt(elapsed); }
  function renderLaps(){
    lapsEl.innerHTML = laps.map((lapMs, i)=>{
      const prev = i>0 ? laps[i-1] : 0;
      return `<li><span>${t('lap')} ${i+1}</span><span>${fmt(lapMs-prev)}</span><span class="lap-total">${fmt(lapMs)}</span></li>`;
    }).reverse().join('');
  }
  const startBtn = body.querySelector('#s-start');
  const lapBtn = body.querySelector('#s-lap');
  function setRunning(isRunning){
    running = isRunning; tdBusy('stopwatch', running);
    startBtn.dataset.key = running ? 'stop' : 'start';
    startBtn.textContent = t(startBtn.dataset.key);
    lapBtn.disabled = !running;
  }
  startBtn.addEventListener('click', ()=>{
    setRunning(!running);
    if(running){
      track('stopwatch');
      last = Date.now();
      iv = setInterval(()=>{
        const now = Date.now();
        elapsed += now-last; last = now;
        render();
      },100);
    } else clearInterval(iv);
  });
  lapBtn.addEventListener('click', ()=>{
    if(!running) return;
    laps.push(elapsed);
    renderLaps();
  });
  body.querySelector('#s-reset').addEventListener('click', ()=>{
    clearInterval(iv); setRunning(false); elapsed=0; laps=[]; render(); renderLaps();
  });
  setRunning(false);
  render();
  renderLaps();
  if(ctx && ctx.preset && ctx.preset.go) startBtn.click();   // platform (ClassIn): ?go=1
  return ()=>{ clearInterval(iv); tdBusy('stopwatch', false); };
}

function renderTraffic(body, ctx){
  const skins = premiumSkins();
  if(skins && skins.light){
    body.innerHTML = `<div class="skin-light"></div><p class="traffic-hint" data-i18n="traffic_hint">${t('traffic_hint')}</p><div class="skin-switch"><button type="button" class="skin-more" data-skin-more="light">${t('ix_more_lights')}</button></div>`;
    const box = body.querySelector('.skin-light');
    const ctl = StoreCore.mountLight(box, skins.light);
    const names = ['red','yellow','green'];
    box.querySelectorAll('[data-lamp]').forEach(g=>{
      g.style.cursor = 'pointer';
      g.addEventListener('click', ()=>{ const i = +g.getAttribute('data-lamp'); ctl.set(i); track('traffic', names[i]); });
    });
    const pl = ctx && ctx.preset && ctx.preset.light; if(pl && names.includes(pl)) ctl.set(names.indexOf(pl));
    return null;
  }
  setTimeout(()=>{ if(!body.querySelector('[data-skin-more]')){ const r = document.createElement('div'); r.className = 'skin-switch';
    r.innerHTML = `<button type="button" class="skin-more" data-skin-more="light">${t('ix_more_lights')}</button>`; body.appendChild(r); } }, 0);
  // Phase 1 (UI polish): an SVG, so it scales sharply with the window (css/scale.css).
  const lamp = (c, cy, hi, mid, lo) => `<g class="tl-lamp traffic-lamp ${c}" data-c="${c}">
      <circle class="tl-glow" cx="50" cy="${cy}" r="27" fill="${mid}" filter="url(#tl-blur)"/>
      <circle cx="50" cy="${cy}" r="24" fill="url(#tl-off)"/>
      <circle class="tl-on" cx="50" cy="${cy}" r="24" fill="url(#tl-${c})"/>
      <circle cx="50" cy="${cy}" r="24" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="2"/>
    </g>`;
  const grad = (c, hi, mid, lo) => `<radialGradient id="tl-${c}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${hi}"/><stop offset=".6" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient>`;
  body.innerHTML = `
    <svg class="tl-svg" viewBox="0 0 100 238" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="tl-housing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2e33"/><stop offset="1" stop-color="#17191c"/></linearGradient>
        <radialGradient id="tl-off" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#3c3f44"/><stop offset=".72" stop-color="#16181b"/></radialGradient>
        ${grad('red','#ff8f8f','#E0555A','#a02c2c')}${grad('yellow','#fbe38a','#E8C93D','#a3891c')}${grad('green','#9df0bf','#4FD18A','#1f8a56')}
        <filter id="tl-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      </defs>
      <rect x="32" y="1" width="36" height="10" rx="5" fill="#111"/>
      <rect x="6" y="8" width="88" height="200" rx="18" fill="url(#tl-housing)" stroke="rgba(0,0,0,.5)" stroke-width="2"/>
      <rect x="8" y="9.5" width="84" height="3" rx="1.5" fill="rgba(255,255,255,.06)"/>
      ${lamp('red',46)}${lamp('yellow',108)}${lamp('green',170)}
      <rect x="43" y="207" width="14" height="22" rx="3" fill="#111"/>
    </svg>
    <p class="traffic-hint" data-i18n="traffic_hint">${t('traffic_hint')}</p>
  `;
  const lamps = body.querySelectorAll('.tl-lamp');
  lamps.forEach(l=>{
    l.addEventListener('click', ()=>{
      lamps.forEach(x=>x.classList.remove('on'));
      l.classList.add('on');
      track('traffic', l.dataset.c);
    });
  });
  { const pl = ctx && ctx.preset && ctx.preset.light; const on = pl && body.querySelector('.tl-lamp.' + pl); if(on) on.classList.add('on'); }   // platform (ClassIn): ?light=
  return null;
}

/* ---- Dice graphics ---- */
const PIP_LAYOUTS = {
  1:[[50,50]],
  2:[[26,26],[74,74]],
  3:[[26,26],[50,50],[74,74]],
  4:[[26,26],[74,26],[26,74],[74,74]],
  5:[[26,26],[74,26],[50,50],[26,74],[74,74]],
  6:[[26,22],[74,22],[26,50],[74,50],[26,78],[74,78]]
};
function d6Svg(value){
  const pips = PIP_LAYOUTS[value] || PIP_LAYOUTS[1];
  const dots = pips.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="7.5" fill="#20242b"/>`).join('');
  return `<svg viewBox="0 0 100 100" class="die-face">
    <rect x="6" y="6" width="88" height="88" rx="16" fill="#F4F1EA" stroke="#cfc9b8" stroke-width="2"/>
    ${dots}
  </svg>`;
}
function d20Svg(value){
  // 10-point star-ish faceted outline standing in for a d20, with facet lines to center
  const cx=50, cy=52, R=42;
  const pts = [];
  for(let i=0;i<10;i++){
    const ang = (Math.PI*2*i/10) - Math.PI/2;
    const r = i%2===0 ? R : R*0.82;
    pts.push([cx+r*Math.cos(ang), cy+r*Math.sin(ang)]);
  }
  const outline = pts.map(p=>p.join(',')).join(' ');
  const facets = pts.map(p=>`<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#c78a2e" stroke-width="1"/>`).join('');
  return `<svg viewBox="0 0 100 104" class="die-face">
    <polygon points="${outline}" fill="#E8A33D" stroke="#8a5a1a" stroke-width="2.5" stroke-linejoin="round"/>
    ${facets}
    <text x="${cx}" y="${cy+8}" text-anchor="middle" font-family="Quicksand, sans-serif" font-weight="700" font-size="30" fill="#231604">${value}</text>
  </svg>`;
}
function diceFace(sides, value){ return sides===20 ? d20Svg(value) : d6Svg(value); }

function renderDice(body){
  body.innerHTML = `
    <div class="dice-stage" id="dice-stage"></div>
    <div class="btn-row">
      <button class="wbtn" data-sides="6">d6</button>
      <button class="wbtn" data-sides="20">d20</button>
      <button class="wbtn primary" id="dice-roll" data-i18n="roll">${t('roll')}</button>
    </div>
  `;
  let sides = 6;
  const stage = body.querySelector('#dice-stage');
  stage.innerHTML = diceFace(sides, 1);

  body.querySelectorAll('[data-sides]').forEach(b=>{
    b.addEventListener('click', ()=>{
      sides = parseInt(b.dataset.sides);
      stage.innerHTML = diceFace(sides, 1);
    });
  });
  body.querySelector('#dice-roll').addEventListener('click', ()=>{
    track('dice', 'd' + sides);
    let n = 0;
    const iv = setInterval(()=>{
      const val = 1 + Math.floor(Math.random()*sides);
      stage.innerHTML = diceFace(sides, val);
      n++;
      if(n>10) clearInterval(iv);
    }, 60);
  });
  return null;
}

function renderChecklist(body){
  function draw(){
    body.innerHTML = `
      <div class="checklist-row">
        <input type="text" id="cl-input" placeholder="${t('add_placeholder')}" data-i18n-placeholder="add_placeholder">
        <button class="wbtn primary" id="cl-add" data-i18n="add_btn">${t('add_btn')}</button>
      </div>
      <ul class="check-items"></ul>
    `;
    const ul = body.querySelector('.check-items');
    state.checklist.forEach(item=>{
      const li = document.createElement('li');
      li.className = item.done ? 'done' : '';
      li.innerHTML = `<input type="checkbox" ${item.done?'checked':''}> <span></span><button aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>`;
      li.querySelector('span').textContent = item.text;
      li.querySelector('input').addEventListener('change', e=>{
        item.done = e.target.checked; saveState(); draw();
        if(item.done) track('checklist', item.text);
      });
      li.querySelector('button').addEventListener('click', ()=>{
        state.checklist = state.checklist.filter(x=>x.id!==item.id);
        saveState(); draw();
      });
      ul.appendChild(li);
    });
    if(!state.checklist.length){   // polish phase 4: an empty list says what to do instead of showing a blank box
      const vi = state.lang === 'vi';
      ul.insertAdjacentHTML('afterend', `<div class="td-empty"><span class="td-empty-ic">✅</span><span><strong>${t('ix_nothing_on_the_list_yet')}</strong><br>${t('ix_type_a_task_above_and_press_add')}</span></div>`);
      const inp = body.querySelector('#cl-input'); if(inp) setTimeout(()=>{ if(document.activeElement === document.body) inp.focus({ preventScroll:true }); }, 0);
    }
    body.querySelector('#cl-add').addEventListener('click', addItem);
    body.querySelector('#cl-input').addEventListener('keydown', e=>{ if(e.key==='Enter') addItem(); });
    function addItem(){
      const input = body.querySelector('#cl-input');
      const text = input.value.trim();
      if(!text) return;
      state.checklist.push({ id:cid(), text, done:false });
      saveState(); draw();
    }
  }
  draw();
  return null;
}

function renderNamePicker(body){
  body.innerHTML = `
    <div class="picker-name" data-i18n="tap_pick">${t('tap_pick')}</div>
    <div class="btn-row">
      <button class="wbtn primary" id="np-pick" data-i18n="pick_student">${t('pick_student')}</button>
    </div>
    <p class="picker-count" data-i18n-count></p>
  `;
  const nameEl = body.querySelector('.picker-name');
  const countEl = body.querySelector('.picker-count');
  function refreshCount(){
    countEl.textContent = t('roster_count', { n: state.roster.length });
  }
  body.querySelector('#np-pick').addEventListener('click', ()=>{
    if(!state.roster.length){
      nameEl.removeAttribute('data-i18n');
      nameEl.textContent = t('add_students_prompt');
      return;
    }
    track('pick');
    let n=0;
    const iv = setInterval(()=>{
      nameEl.removeAttribute('data-i18n');
      nameEl.textContent = state.roster[Math.floor(Math.random()*state.roster.length)];
      n++;
      if(n>10) clearInterval(iv);
    }, 60);
  });
  refreshCount();
  return null;
}

/* ---------------- Office files via Google (Pro) ----------------
   Word / PowerPoint / Excel can't be rendered by the browser, so they are converted
   once to a Google Doc / Slides / Sheet in the teacher's own Drive (js/gdrive.js) and
   the result is shown on the stage like any pasted Google link. The converted file is
   remembered by a SHA-256 of the original bytes (IndexedDB store "gdocs"), so the same
   file is never converted twice. The Pro check is here, at the single entry point. */
async function sha256Hex(blob){
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function showDocStatus(msg, opts){
  const st = buildDocStage();
  opts = opts || {};
  st.statusMsg.textContent = msg;
  st.spinner.hidden = !opts.spinner;
  st.statusActions.innerHTML = '';
  (opts.actions || []).forEach(a=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wbtn' + (a.primary ? ' primary' : '');
    b.textContent = a.label;
    b.addEventListener('click', a.fn);
    st.statusActions.appendChild(b);
  });
  st.status.hidden = false;
}

function officeErrorMessage(e){
  if(typeof TDDrive !== 'undefined' && e instanceof TDDrive.DriveError){
    const r = e.reason || '';
    if(r === 'not_configured') return t('doc_office_not_set');
    if(e.status === 403 && /storageQuota/i.test(r)) return t('doc_err_quota');
    if(e.status === 413 || /uploadTooLarge|fileTooLarge|tooLarge/i.test(r)) return t('doc_err_large');
    if(e.status === 403 || /admin_policy|access_denied|org_internal|disallowed/i.test(r)) return t('doc_err_blocked', { id: TDDrive.clientId() });
    if(/^auth_|permission_denied/.test(r)) return t('doc_err_signin');
    if(r === 'network' || e.status === 0 && r === '') return t('doc_err_network');
    return t('doc_err_failed');
  }
  if(e instanceof TypeError) return t('doc_err_network');      // fetch() rejected: offline / blocked
  return t('doc_err_failed');
}

async function showOffice(f, force){
  const ext = extOf(f.name);
  const openOriginal = ()=> launchInApp(f);
  if(!isPro()){ openProModal(); return; }                       // <-- the Pro gate for Office conversion
  if(typeof TDDrive === 'undefined' || !TDDrive.isOfficeExt(ext) || !TDDrive.isConfigured()){
    openOriginal();
    return;
  }
  const st = buildDocStage();
  if(docConvAbort) docConvAbort.abort();
  const ctl = docConvAbort = new AbortController();
  const seq = ++docSeq;
  closeDocLog();
  clearDocFrame();
  closeDocMenu();
  docCur = { kind:'office', id:f.id, name:f.name, blob:f.blob };
  st.title.textContent = f.name;
  st.hint.hidden = true; st.editBtn.hidden = true; st.reconvertBtn.hidden = true;
  st.setCollapsed(false);
  st.el.hidden = false;
  document.body.classList.add('doc-open');
  updateDocTop();
  showDocStatus(t('doc_converting'), { spinner:true, actions:[{ label:t('doc_cancel'), fn:closeDocViewer }] });
  try{
    const sha = await sha256Hex(f.blob);
    let row = force ? null : await idb.get('gdocs', sha);
    if(row && !(await TDDrive.exists(row.fileId, ctl.signal))){
      await idb.delete('gdocs', sha);          // trashed or deleted in Drive since: convert again
      row = null;
    }
    if(!row){
      const r = await TDDrive.convert(f.blob, f.name, ext, { signal: ctl.signal, sha });
      row = { sha, name:f.name, fileId:r.id, gtype:r.gtype, owner:r.owner, created:Date.now() };
      await idb.put('gdocs', row);
    }
    if(seq !== docSeq) return;                 // closed or replaced while converting
    const base = 'https://docs.google.com/' + row.gtype + '/d/' + row.fileId;
    const acct = row.owner ? '?authuser=' + encodeURIComponent(row.owner) : '';
    docConvAbort = null;
    openDocViewer({
      id:f.id, kind:'google', name:f.name, src: base + '/preview' + acct,
      tabUrl: base + '/edit' + acct, editUrl: base + '/edit' + acct,
      office:{ sha:row.sha, fileId:row.fileId, rec:f }
    });
  }catch(e){
    if(seq !== docSeq || (e && e.name === 'AbortError')) return;
    console.warn('TeachersDeck: Office conversion failed', e);
    docConvAbort = null;
    showDocStatus(officeErrorMessage(e), { actions:[
      { label:t('doc_retry'), primary:true, fn:()=> showOffice(f, force) },
      { label:t('doc_open_original'), fn:openOriginal },
      { label:t('doc_close'), fn:closeDocViewer }
    ] });
  }
}

async function reconvertOffice(){
  const o = docCur && docCur.office;
  if(!o) return;
  try{ await TDDrive.trash(o.fileId); }catch(e){ /* best effort: the old copy just stays in Drive */ }
  await idb.delete('gdocs', o.sha);
  showOffice(o.rec, true);
}

async function deleteConvertedFiles(){
  if(!isPro()){ openProModal(); return; }
  const rows = await idb.getAll('gdocs');
  if(!rows.length){ toast(t('gdrive_none')); return; }
  if(typeof TDDrive === 'undefined' || !TDDrive.isConfigured()){ toast(t('doc_office_not_set'), 4500); return; }
  let n = 0;
  try{
    for(const r of rows){ await TDDrive.trash(r.fileId); await idb.delete('gdocs', r.sha); n++; }
  }catch(e){
    console.warn('TeachersDeck: could not delete converted files', e);
    toast(officeErrorMessage(e), 5000);
    if(n) toast(t('gdrive_deleted', { n }), 3000);
    return;
  }
  toast(t('gdrive_deleted', { n }));
}

const EXT_LABEL = { pdf:'PDF', ppt:'PPT', pptx:'PPT', doc:'DOC', docx:'DOC', xls:'XLS', xlsx:'XLS' };
function extOf(name){
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

/* ---------------- Office files: desktop app or Google viewer (v0.14.1) ----------------
   PowerPoint / Word / Excel files can be shown two ways: converted through Google and shown in the viewer (showOffice, needs the
   Google connection), or launched in the installed desktop app. The app launch downloads a copy to Downloads/TeachersDeck and asks
   Chrome to open it with the default program (chrome.downloads.open), which needs the optional "downloads" permissions —
   requested the first time you use it. Edits made in PowerPoint save to that downloaded copy, not to the stored file. Outside the
   extension (plain web page) it falls back to an ordinary download. */
const OFFICE_APP = { ppt:'PowerPoint', pptx:'PowerPoint', pps:'PowerPoint', ppsx:'PowerPoint', doc:'Word', docx:'Word', xls:'Excel', xlsx:'Excel' };
const appNameFor = name => OFFICE_APP[extOf(name)] || 'Office';
const isOfficeFile = f => f && f.kind !== 'glink' && typeof TDDrive !== 'undefined' && TDDrive.isOfficeExt(extOf(f.name));
const officeCanConvert = () => typeof TDDrive !== 'undefined' && TDDrive.isConfigured();
const officePref = () => tdx.officePref || (officeCanConvert() ? 'google' : 'app');
function openOfficeFile(f){ if(officePref() === 'app' || !officeCanConvert()) launchInApp(f); else showOffice(f); }
function plainDownload(f){
  const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=> URL.revokeObjectURL(a.href), 30000);
}
async function launchInApp(f){
  const app = appNameFor(f.name), perms = { permissions:['downloads', 'downloads.open'] };
  if(typeof chrome === 'undefined' || !chrome.permissions || !chrome.runtime || !chrome.runtime.id){ plainDownload(f); toast(t('office_downloaded')); return; }
  try{
    let ok = await new Promise(r => chrome.permissions.contains(perms, r));
    if(!ok) ok = await new Promise(r => chrome.permissions.request(perms, r));
    if(!ok){ plainDownload(f); toast(t('office_perm_denied'), 4500); return; }
    const url = URL.createObjectURL(f.blob), safe = f.name.replace(/[\\/:*?"<>|]+/g, '_');
    toast(t('office_launching', { app }), 4500);
    chrome.downloads.download({ url, filename:'TeachersDeck/' + safe, conflictAction:'uniquify', saveAs:false }, id => {
      if(chrome.runtime.lastError || id === undefined){ console.warn('TeachersDeck: download failed', chrome.runtime.lastError); plainDownload(f); return; }
      const done = d => {
        if(d.id !== id || !d.state) return;
        if(d.state.current === 'complete'){ chrome.downloads.onChanged.removeListener(done); chrome.downloads.open(id); setTimeout(()=> URL.revokeObjectURL(url), 30000); }
        else if(d.state.current === 'interrupted'){ chrome.downloads.onChanged.removeListener(done); }
      };
      chrome.downloads.onChanged.addListener(done);
    });
  }catch(e){ console.warn('TeachersDeck: launch in app failed', e); plainDownload(f); toast(t('office_downloaded')); }
}

/* v0.17.0 strings: badges for gaining XP. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  bd_h:          { en:'Badges', vi:'Huy hiệu' },
  bd_new:        { en:'New badge!', vi:'Huy hiệu mới!' },
  bd_of:         { en:'{n} of {total} earned', vi:'Đã nhận {n} / {total}' },
  bd_f_all:      { en:'All', vi:'Tất cả' },
  bd_f_on:       { en:'Earned', vi:'Đã nhận' },
  bd_f_off:      { en:'Locked', vi:'Chưa mở' },
  bd_next:       { en:'Next up', vi:'Sắp đạt' },
  bd_all_done:   { en:'Every badge earned. Legend.', vi:'Đã nhận mọi huy hiệu. Huyền thoại!' },
  bd_old:        { en:'Earned before badges began', vi:'Đạt trước khi có huy hiệu' },
  bd_earned:     { en:'Earned {date}', vi:'Nhận ngày {date}' },
  bd_chip_tip:   { en:'{n} of {total} badges earned — open them', vi:'Đã nhận {n} / {total} huy hiệu — nhấn để xem' },
  bd_have_one:   { en:'🏅 You already earned 1 badge! Open Stats & XP to see it.', vi:'🏅 Bạn đã đạt 1 huy hiệu! Mở Thống kê & XP để xem.' },
  bd_have_many:  { en:'🏅 You already earned {n} badges! Open Stats & XP to see them.', vi:'🏅 Bạn đã đạt {n} huy hiệu! Mở Thống kê & XP để xem.' },
  bd_more_toast: { en:'🏅 …and {n} more new badges!', vi:'🏅 …và {n} huy hiệu mới nữa!' },
  bd_u_xp:       { en:'XP', vi:'XP' },
  bd_u_days:     { en:'days', vi:'ngày' },
  bd_u_things:   { en:'things', vi:'hoạt động' },
  stats_tile_badges: { en:'Badges earned', vi:'Huy hiệu đã nhận' },

  bdg_xp:     { en:'Milestones', vi:'Cột mốc' },
  bdg_level:  { en:'Levels', vi:'Cấp độ' },
  bdg_streak: { en:'Streaks', vi:'Chuỗi ngày' },
  bdg_day:    { en:'Big days', vi:'Ngày lớn' },
  bdg_mix:    { en:'Variety', vi:'Đa dạng' },
  bdg_skill:  { en:'Skills', vi:'Kỹ năng' },
  bdg_habit:  { en:'Habits', vi:'Thói quen' },

  bd_d_xp:  { en:'Earn {n} XP in total', vi:'Tích lũy tổng cộng {n} XP' },
  bd_d_lv:  { en:'Reach level {n}', vi:'Đạt cấp {n}' },
  bd_d_st:  { en:'Keep a {n}-day streak', vi:'Giữ chuỗi {n} ngày' },
  bd_d_day: { en:'Earn {n} XP in a single day', vi:'Nhận {n} XP trong một ngày' },
  bd_d_mix: { en:'Earn XP from {n} different things in one day', vi:'Nhận XP từ {n} hoạt động khác nhau trong một ngày' },
  bd_d_src: { en:'Earn {n} XP from {src}', vi:'Nhận {n} XP từ {src}' },
  bd_d_hab: { en:'Be active on {n} different days', vi:'Hoạt động trong {n} ngày khác nhau' },

  bdn_xp_50:   { en:'First sparks', vi:'Tia lửa đầu' },
  bdn_xp_100:  { en:'Century', vi:'Tròn trăm' },
  bdn_xp_250:  { en:'Rising star', vi:'Ngôi sao đang lên' },
  bdn_xp_500:  { en:'Shining bright', vi:'Tỏa sáng' },
  bdn_xp_1000: { en:'Thousand club', vi:'Câu lạc bộ nghìn XP' },
  bdn_xp_2500: { en:'XP champion', vi:'Nhà vô địch XP' },
  bdn_xp_5000: { en:'XP legend', vi:'Huyền thoại XP' },
  bdn_lv_3:    { en:'Lift-off', vi:'Cất cánh' },
  bdn_lv_5:    { en:'On target', vi:'Đúng mục tiêu' },
  bdn_lv_8:    { en:'Scholar', vi:'Học giả' },
  bdn_lv_10:   { en:'Double digits', vi:'Hai chữ số' },
  bdn_lv_15:   { en:'Brainiac', vi:'Thiên tài' },
  bdn_lv_20:   { en:'Grand master', vi:'Đại sư' },
  bdn_st_3:    { en:'On a roll', vi:'Đang thăng hoa' },
  bdn_st_7:    { en:'Week warrior', vi:'Chiến binh tuần' },
  bdn_st_14:   { en:'Fortnight focus', vi:'Tập trung hai tuần' },
  bdn_st_30:   { en:'Month master', vi:'Bậc thầy tháng' },
  bdn_st_100:  { en:'Unstoppable', vi:'Không thể cản' },
  bdn_day_50:  { en:'Good day', vi:'Ngày tốt' },
  bdn_day_100: { en:'Power day', vi:'Ngày bùng nổ' },
  bdn_day_150: { en:'Maximum effort', vi:'Hết mình' },
  bdn_mix_4:   { en:'All-rounder', vi:'Đa năng' },
  bdn_mix_7:   { en:'Whole toolbox', vi:'Cả hộp đồ nghề' },
  bdn_mix_10:  { en:'Grand tour', vi:'Vòng quanh công cụ' },
  bdn_sk_lesson:     { en:'Lesson architect', vi:'Kiến trúc sư bài học' },
  bdn_sk_assignment: { en:'Homework giver', vi:'Người giao bài' },
  bdn_sk_attendance: { en:'Roll-call regular', vi:'Điểm danh đều đặn' },
  bdn_sk_docs:       { en:'Document diver', vi:'Thợ lặn tài liệu' },
  bdn_sk_groups:     { en:'Team builder', vi:'Người xây nhóm' },
  bdn_sk_pick:       { en:'Fair picker', vi:'Chọn công bằng' },
  bdn_sk_score:      { en:'Score keeper', vi:'Người giữ điểm' },
  bdn_sk_check:      { en:'Check for understanding', vi:'Kiểm tra mức hiểu' },
  bdn_sk_game:       { en:'Game on', vi:'Vào cuộc chơi' },
  bdn_sk_media:      { en:'Media maestro', vi:'Nhạc trưởng đa phương tiện' },
  bdn_sk_lang:       { en:'Language coach', vi:'Huấn luyện viên ngôn ngữ' },
  bdn_sk_time:       { en:'Time keeper', vi:'Người giữ thời gian' },
  bdn_sk_reading:    { en:'Reading champion', vi:'Nhà vô địch đọc sách' },
  bdn_sk_plan:       { en:'Calendar keeper', vi:'Người giữ lịch' },
  bdn_sk_cloud:      { en:'Encourager', vi:'Người khích lệ' },
  bdn_sk_home:       { en:'Home connector', vi:'Cầu nối gia đình' },
  bdn_hab_7:   { en:'First week', vi:'Tuần đầu tiên' },
  bdn_hab_30:  { en:'Month of teaching', vi:'Tháng giảng dạy' },
  bdn_hab_100: { en:'100 days', vi:'100 ngày' }
});

/* v0.18.0 strings: Manage widgets (deactivate / reactivate). Languages not listed fall back to English. */
Object.assign(STRINGS, {
  wm_title:       { en:'Manage widgets', vi:'Quản lý widget' },
  wm_open:        { en:'Manage widgets…', vi:'Quản lý widget…' },
  wm_sum:         { en:'{on} active · {off} deactivated', vi:'{on} đang bật · {off} đã tắt' },
  wm_sub:         { en:'Deactivated widgets disappear from every dock and the app tray, and keep their saved data. Switch one back on any time.', vi:'Widget đã tắt sẽ biến mất khỏi mọi thanh dock và khay ứng dụng nhưng vẫn giữ dữ liệu. Bật lại bất cứ lúc nào.' },
  wm_sec_shelve:  { en:'Recommended to deactivate', vi:'Nên tắt' },
  wm_sec_core:    { en:'Best to keep', vi:'Nên giữ nhất' },
  wm_sec_keep:    { en:'Worth keeping', vi:'Đáng giữ' },
  wm_why_shelve:  { en:'Overlap with another widget, only launch something the browser already does, or are mostly novelties.', vi:'Trùng với widget khác, chỉ mở thứ trình duyệt đã làm được, hoặc chủ yếu để vui.' },
  wm_why_core:    { en:'The daily classroom essentials, and the ones connected to StudentDeck. Nothing else replaces them.', vi:'Những công cụ thiết yếu hằng ngày và những widget kết nối với StudentDeck. Không gì thay thế được.' },
  wm_why_keep:    { en:'Distinct and useful for the right lesson, just less often than the essentials.', vi:'Riêng biệt và hữu ích cho đúng bài học, chỉ ít dùng hơn các công cụ thiết yếu.' },
  wm_tag_core:    { en:'Best', vi:'Nên giữ' },
  wm_tag_keep:    { en:'Keep', vi:'Giữ' },
  wm_tag_shelve:  { en:'Deactivate', vi:'Nên tắt' },
  wm_you_use:     { en:'You use this', vi:'Bạn đang dùng' },
  wm_apply:       { en:'Apply recommendations', vi:'Áp dụng đề xuất' },
  wm_react_all:   { en:'Reactivate all', vi:'Bật lại tất cả' },
  wm_fill:        { en:'Fill free dock slots', vi:'Lấp chỗ trống trên dock' },
  wm_used:        { en:'Used {n}× · {t} in the last 30 days', vi:'Dùng {n} lần · {t} trong 30 ngày qua' },
  wm_used_old:    { en:'Last used {date}', vi:'Dùng lần cuối {date}' },
  wm_used_none:   { en:'Not used yet', vi:'Chưa dùng' },
  wm_apply_toast: { en:'Deactivated {n} widgets{kept}.', vi:'Đã tắt {n} widget{kept}.' },
  wm_apply_kept:  { en:' ({n} you use were left on)', vi:' (giữ lại {n} widget bạn đang dùng)' },
  wm_react_toast: { en:'All widgets reactivated.', vi:'Đã bật lại tất cả widget.' },
  wm_fill_toast:  { en:'Moved {n} widgets into free dock slots.', vi:'Đã chuyển {n} widget vào chỗ trống trên dock.' },
  wm_off_toast:   { en:'“{name}” is deactivated. Switch it back on in Manage widgets.', vi:'“{name}” đã tắt. Bật lại trong Quản lý widget.' },
  wm_tidy_toast:  { en:'Tidied up: {n} rarely-needed widgets deactivated. Settings → Manage widgets brings them back.', vi:'Đã dọn gọn: tắt {n} widget ít cần. Vào Cài đặt → Quản lý widget để bật lại.' },

  /* why each widget is where it is */
  wc_clock:           { en:'Always-on classroom clock; costs nothing and every lesson uses it.', vi:'Đồng hồ lớp học luôn bật; không tốn gì và buổi học nào cũng dùng.' },
  wc_timer:           { en:'The most-used classroom tool: activities, transitions, tests.', vi:'Công cụ dùng nhiều nhất: hoạt động, chuyển tiết, kiểm tra.' },
  wc_namepicker:      { en:'Fair, quick student picking from your roster.', vi:'Chọn học sinh nhanh và công bằng từ danh sách lớp.' },
  wc_groupmaker:      { en:'Instant groups or pairs from your roster; hard to replace.', vi:'Chia nhóm/cặp tức thì từ danh sách lớp; khó thay thế.' },
  wc_scoreboard:      { en:'Team scores for games and competitions.', vi:'Điểm theo đội cho trò chơi và thi đua.' },
  wc_poll:            { en:'Fast check-for-understanding; also covers exit tickets.', vi:'Kiểm tra mức hiểu nhanh; cũng thay được Phiếu ra cửa.' },
  wc_attendance:      { en:'Daily roll call, saved per class.', vi:'Điểm danh hằng ngày, lưu theo lớp.' },
  wc_scrapreview:     { en:'Approve or hide scrapbook pages students shared from StudentDeck.', vi:'Duyệt hoặc ẩn các trang sổ lưu niệm học sinh chia sẻ từ StudentDeck.' },
  wc_boardreview:     { en:'Review what students drew on a DrawDeck page you assigned, and award XP.', vi:'Duyệt những gì học sinh vẽ trên trang DrawDeck bạn đã giao, và trao XP.' },
  wc_traffic:         { en:'Zero-setup signal for noise and behaviour.', vi:'Tín hiệu về độ ồn và nề nếp, không cần thiết lập.' },
  wc_noise:           { en:'Live noise meter on the board; students self-regulate.', vi:'Đo độ ồn trực tiếp trên bảng; học sinh tự điều chỉnh.' },
  wc_agenda:          { en:'Schedule, objective and do-now in one board.', vi:'Lịch học, mục tiêu và việc làm ngay trên một bảng.' },
  wc_files:           { en:'Opens your documents and links — the hub for lesson materials.', vi:'Mở tài liệu và liên kết — trung tâm học liệu bài giảng.' },
  wc_calendar:        { en:'Events and reminders; syncs to StudentDeck.', vi:'Sự kiện và nhắc nhở; đồng bộ với StudentDeck.' },
  wc_assignments:     { en:'Homework list that syncs to StudentDeck.', vi:'Danh sách bài tập đồng bộ với StudentDeck.' },
  wc_progressreports: { en:'Per-student reports sent straight to the student.', vi:'Báo cáo từng học sinh gửi thẳng cho học sinh.' },
  wc_lessonplanner:   { en:'Plans lessons and earns XP; shares to the cloud class.', vi:'Soạn bài và nhận XP; chia sẻ với lớp đám mây.' },
  wc_cloudclass:      { en:'The link to StudentDeck: roster, points, rewards.', vi:'Cầu nối với StudentDeck: danh sách, điểm, phần thưởng.' },
  wc_noteshome:       { en:'Sends positive notes home in a click.', vi:'Gửi lời nhắn tích cực về nhà chỉ với một cú nhấp.' },
  wc_checklist:       { en:'Quick personal to-do list.', vi:'Danh sách việc cần làm nhanh.' },
  wc_games:           { en:'Classroom games for English practice.', vi:'Trò chơi lớp học để luyện tiếng Anh.' },
  wc_music:           { en:'Background music and listening clips from your files.', vi:'Nhạc nền và bài nghe từ tệp của bạn.' },
  wc_hallpass:        { en:'Tracks who is out of the room and for how long.', vi:'Theo dõi ai đang ra ngoài và trong bao lâu.' },
  wc_qrcode:          { en:'Puts any link on the board for students’ phones.', vi:'Đưa liên kết lên bảng để học sinh quét bằng điện thoại.' },
  wc_ttsreader:       { en:'Reads text aloud for listening practice.', vi:'Đọc to văn bản để luyện nghe.' },
  wc_convocards:      { en:'Speaking prompts for pair work.', vi:'Gợi ý nói cho hoạt động theo cặp.' },
  wc_idiomday:        { en:'A daily idiom to start the lesson.', vi:'Một thành ngữ mỗi ngày để mở đầu bài học.' },
  wc_grammarref:      { en:'Quick grammar reference for the board.', vi:'Tra cứu nhanh ngữ pháp trên bảng.' },
  wc_instructions:    { en:'Step-by-step directions, with a Vietnamese line.', vi:'Hướng dẫn từng bước, kèm dòng tiếng Việt.' },
  wc_stats:           { en:'Your XP, streaks and activity history.', vi:'XP, chuỗi ngày và lịch sử hoạt động của bạn.' },
  wc_badgecase:       { en:'Your own badge display case — every badge you’ve earned, on shelves.', vi:'Tủ huy hiệu của riêng bạn — mọi huy hiệu bạn đã đạt, trưng bày trên kệ.' },
  wc_tellingtime:     { en:'Teach telling the time in English: drag the hands, hide and reveal, British or American.', vi:'Dạy xem giờ bằng tiếng Anh: kéo kim, ẩn rồi hiện đáp án, Anh-Anh hoặc Anh-Mỹ.' },
  wc_stopwatch:       { en:'Rarely needed — Timer covers almost every case.', vi:'Ít khi cần — Hẹn giờ đã đáp ứng gần như mọi trường hợp.' },
  wc_dice:            { en:'A novelty; Name Picker and Group Maker cover classroom randomising.', vi:'Chủ yếu để vui; Chọn tên và Chia nhóm đã lo phần ngẫu nhiên.' },
  wc_videoplayer:     { en:'Overlaps Files (open a link) and the browser; local clips are heavy.', vi:'Trùng với Tệp (mở liên kết) và trình duyệt; video cục bộ khá nặng.' },
  wc_soundboard:      { en:'A novelty; Music Player handles audio.', vi:'Chủ yếu để vui; Trình phát nhạc đã lo phần âm thanh.' },
  wc_exitticket:      { en:'A three-button tally — Poll does this and more.', vi:'Chỉ là bộ đếm ba nút — Bình chọn làm được và hơn thế.' },
  wc_meet:            { en:'Only opens Meet; a bookmark or a Calendar link does the same.', vi:'Chỉ mở Meet; dấu trang hoặc liên kết trong Lịch cũng làm được.' },
  wc_countdown:       { en:'One date only; Calendar already holds dates with reminders.', vi:'Chỉ một ngày; Lịch đã lưu ngày kèm nhắc nhở.' },
  wc_unitconverter:   { en:'Not classroom-specific; any search box does it.', vi:'Không dành riêng cho lớp học; ô tìm kiếm nào cũng làm được.' },
  wc_announcements:   { en:'Overlaps Agenda Board and Notes Home.', vi:'Trùng với Bảng chương trình và Ghi chú gửi nhà.' },
  wc_readinglog:      { en:'A reading timer — Timer plus document reading time covers it.', vi:'Chỉ là hẹn giờ đọc — Hẹn giờ và thời gian đọc tài liệu đã đủ.' }
});

/* v0.16.0 strings: full-screen Stats & XP, activity tracking. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  stats_month:      { en:'30 days', vi:'30 ngày' },
  stats_today_xp:   { en:'Today: {n} XP · half rate after {max}', vi:'Hôm nay: {n} XP · giảm một nửa sau {max}' },
  stats_export:     { en:'⬇ Export CSV', vi:'⬇ Xuất CSV' },
  stats_tile_acts:  { en:'Activities logged', vi:'Hoạt động đã ghi' },
  stats_tile_days:  { en:'Active days', vi:'Ngày hoạt động' },
  stats_tile_top:   { en:'Most-used tool', vi:'Công cụ dùng nhiều nhất' },
  stats_tile_best:  { en:'Best XP day', vi:'Ngày nhiều XP nhất' },
  stats_h_trend:    { en:'Last 14 days', vi:'14 ngày qua' },
  stats_h_heat:     { en:'Activity calendar · 15 weeks', vi:'Lịch hoạt động · 15 tuần' },
  stats_h_acts:     { en:'Everything you did', vi:'Mọi việc bạn đã làm' },
  stats_acts_hint:  { en:'(counts in the chosen time range)', vi:'(theo khoảng thời gian đã chọn)' },
  stats_h_rules:    { en:'How XP works · today', vi:'Cách tính XP · hôm nay' },
  stats_rules_hint: { en:'(earned / daily limit — everything earns half after {max} XP)', vi:'(đã nhận / giới hạn ngày — sau {max} XP chỉ nhận một nửa)' },
  stats_rule_each:  { en:'{n} XP each', vi:'{n} XP mỗi lần' },
  stats_rule_docs:  { en:'1 XP per 5 min open · max {max} per document', vi:'1 XP mỗi 5 phút mở · tối đa {max} mỗi tài liệu' },
  stats_h_feed:     { en:'Activity feed', vi:'Nhật ký hoạt động' },
  stats_feed_all:   { en:'All', vi:'Tất cả' },
  stats_empty_feed: { en:'No activity in this range yet — use any widget and it shows up here.', vi:'Chưa có hoạt động nào trong khoảng này — hãy dùng một widget bất kỳ, nó sẽ hiện ở đây.' },
  stats_more_btn:   { en:'Show {n} more', vi:'Hiện thêm {n}' },
  stats_metric_acts:{ en:'Activities', vi:'Hoạt động' },
  stats_metric_min: { en:'Active min', vi:'Phút hoạt động' },
  stats_less:       { en:'Less', vi:'Ít' },
  stats_more:       { en:'More', vi:'Nhiều' },
  stats_opens:      { en:'{n} opens', vi:'mở {n} lần' },
  stats_day_today:  { en:'Today', vi:'Hôm nay' },
  stats_day_yest:   { en:'Yesterday', vi:'Hôm qua' },
  stats_close_hint: { en:'Esc to close', vi:'Nhấn Esc để đóng' },

  actcat_plan:  { en:'Planning', vi:'Lập kế hoạch' },
  actcat_teach: { en:'Running the class', vi:'Điều hành lớp học' },
  actcat_time:  { en:'Timing & reading', vi:'Bấm giờ & đọc' },
  actcat_media: { en:'Media & files', vi:'Đa phương tiện & tệp' },
  actcat_lang:  { en:'Language', vi:'Ngôn ngữ' },
  actcat_tools: { en:'Tools', vi:'Công cụ' },
  actcat_cloud: { en:'Cloud classroom', vi:'Lớp học đám mây' },

  act_lesson:      { en:'Lessons planned', vi:'Bài học đã lập' },
  act_assignment:  { en:'Assignments posted', vi:'Bài tập đã giao' },
  act_event:       { en:'Calendar events added', vi:'Sự kiện lịch đã thêm' },
  act_report:      { en:'Progress reports written', vi:'Báo cáo tiến độ đã viết' },
  act_daily:       { en:'Daily visits', vi:'Lượt truy cập hằng ngày' },
  act_attendance:  { en:'Attendance taken', vi:'Lần điểm danh' },
  act_pick:        { en:'Students picked', vi:'Lượt chọn học sinh' },
  act_groups:      { en:'Groups made', vi:'Lần chia nhóm' },
  act_score:       { en:'Scoreboard points', vi:'Lần ghi điểm' },
  act_poll:        { en:'Poll votes', vi:'Phiếu bình chọn' },
  act_ticket:      { en:'Exit ticket taps', vi:'Lượt chạm phiếu ra cửa' },
  act_hallpass:    { en:'Hall passes', vi:'Giấy ra ngoài' },
  act_checklist:   { en:'Checklist items done', vi:'Mục danh sách đã xong' },
  act_noise:       { en:'Noise meter sessions', vi:'Lần đo độ ồn' },
  act_announce:    { en:'Announcements posted', vi:'Thông báo đã đăng' },
  act_instruct:    { en:'Instruction steps added', vi:'Bước hướng dẫn đã thêm' },
  act_traffic:     { en:'Traffic light changes', vi:'Lần đổi đèn giao thông' },
  act_dice:        { en:'Dice rolled', vi:'Lần tung xúc xắc' },
  act_timer:       { en:'Timers started', vi:'Lần bắt đầu hẹn giờ' },
  act_stopwatch:   { en:'Stopwatches started', vi:'Lần bắt đầu bấm giờ' },
  act_reading:     { en:'Reading log entries', vi:'Mục nhật ký đọc' },
  act_docopen:     { en:'Documents opened', vi:'Tài liệu đã mở' },
  act_file:        { en:'Files added', vi:'Tệp đã thêm' },
  act_game:        { en:'Games played', vi:'Trò chơi đã chơi' },
  act_music:       { en:'Tracks played', vi:'Bài nhạc đã phát' },
  act_video:       { en:'Clips played', vi:'Video đã phát' },
  act_sfx:         { en:'Sounds played', vi:'Âm thanh đã phát' },
  act_tts:         { en:'Text read aloud', vi:'Lần đọc to văn bản' },
  act_convo:       { en:'Conversation cards', vi:'Thẻ hội thoại' },
  act_idiom:       { en:'Idioms browsed', vi:'Thành ngữ đã xem' },
  act_grammar:     { en:'Grammar topics viewed', vi:'Chủ đề ngữ pháp đã xem' },
  act_qr:          { en:'QR codes made', vi:'Mã QR đã tạo' },
  act_meet:        { en:'Meet sessions', vi:'Phiên Meet' },
  act_cloudpoints: { en:'Class Points awarded', vi:'Lần tặng điểm lớp' },
  act_notehome:    { en:'Notes sent home', vi:'Ghi chú gửi về nhà' },
  act_reward:      { en:'Rewards added', vi:'Phần thưởng đã thêm' }
});

