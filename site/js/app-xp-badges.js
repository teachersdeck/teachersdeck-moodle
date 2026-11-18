/* ---------------- XP + stats engine (ported from StudentDeck v0.7.3, minus Class/reward points) ----------------
   awardXP(source, amount) is the one door XP goes through. Time in every open widget is counted automatically by the
   5-second tick below; any source name passed to awardXP() shows up in "XP by source" on its own (unlisted sources get
   DEFAULT_CAP per day). Add a row to XP_RULES only for a nicer label (t('xp_src_<name>')) or its own cap.
   Everything lives under its own localStorage key (td_xp_v1), NOT in the per-class state, so XP, levels and document time
   follow the teacher across classes. Nothing here is synced anywhere. */
const XKEY = 'td_xp_v1';
function xFresh(){ return { xp:{ total:0, streak:0, last:'', log:[] }, stats:{ daily:{} }, totals:{}, feed:[], badges:{ earned:{}, init:false, bestStreak:0 }, docTime:{}, filesSort:'recent', docToReading:false, pdfTools:false }; }
function xLoad(){
  if(KINDER) return xFresh();   // Kinder: no XP system
  let s = {}; try{ s = JSON.parse(localStorage.getItem(XKEY)) || {}; }catch(e){}
  const f = xFresh();
  return { ...f, ...s, xp:{ ...f.xp, ...s.xp }, stats:{ ...f.stats, ...s.stats } };
}
const tdx = xLoad();
function xSave(){ if(KINDER) return; try{ localStorage.setItem(XKEY, JSON.stringify(tdx)); }catch(e){ /* not persisted */ } }
window.addEventListener('storage', e=>{      // another TeachersDeck tab changed the stats
  if(e.key !== XKEY || !e.newValue) return;
  const s = xLoad(); Object.keys(tdx).forEach(k=> delete tdx[k]); Object.assign(tdx, s);
  drawXP(0, false); updateBadgeChip(false); refreshStats();
});
const xDayKey = d => new Date(d).toLocaleDateString('en-CA');           // local YYYY-MM-DD
const xPad = n => String(n).padStart(2, '0');
const fmtDur = s => s >= 3600 ? `${Math.floor(s/3600)}h ${xPad(Math.floor(s%3600/60))}m` : s >= 60 ? `${Math.floor(s/60)}m` : `${s}s`;
const xEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const XP_RULES = {
  daily:      { cap:5 },     // first open of the day
  docs:       { cap:20 },    // 1 XP per DOC_XP_SECS of active time with a document open, at most DOC_XP_PER_DOC per document per day
  lesson:     { cap:30 },    // a lesson saved to the calendar from the Lesson Planner (10 each)
  assignment: { cap:20 },    // a new assignment posted (5 each)
  attendance: { cap:5 }      // attendance marked for today
};
const DEFAULT_CAP = 50, SOFT_CEILING = 150, IDLE_MS = 5 * 60 * 1000;
const DOC_KEY = 'docs', DOC_XP_SECS = 300, DOC_XP_PER_DOC = 8, DOC_IDLE_MS = 15 * 60 * 1000;
const levelStart = L => 100 * (L - 1) + 25 * (L - 1) * (L - 2);           // total XP at which level L begins: 0, 100, 250, 450…
function levelInfo(total){ let L = 1; while(total >= levelStart(L + 1)) L++; return { level:L, into: total - levelStart(L), need: levelStart(L + 1) - levelStart(L) }; }
const streakMult = () => { const n = tdx.xp.streak; return n >= 2 ? Math.min(1.5, 1 + 0.1 * (n - 1)) : 1; };
const xpSrcLabel = s => STRINGS['xp_src_' + s] ? t('xp_src_' + s) : STRINGS['act_' + s] ? t('act_' + s) : s;
function dayRec(d = xDayKey(Date.now())){
  return tdx.stats.daily[d] || (tdx.stats.daily[d] = { xp:0, xpBy:{}, timeBy:{}, readEntries:0, readMin:0, lessons:0, assignments:0, attendance:0, acts:{}, opens:{} });
}
let statsRedraw = null, readingRedraw = null, filesRedraw = null, badgeCaseRedraw = null;
const refreshStats = () => { statsRedraw && statsRedraw(); badgeCaseRedraw && badgeCaseRedraw(); };
function stat(k, n = 1){ if(KINDER) return; const r = dayRec(); r[k] = (r[k] || 0) + n; xSave(); refreshStats(); }

/* ---------------- v0.16.0 — Activity tracking ----------------
   Every meaningful action in every widget is recorded here, not just the three that used to earn XP.
     logAct(kind, detail, n, xp)  counts the action (day record .acts[kind], lifetime tdx.totals[kind]) and adds a line to the
                                  activity feed (tdx.feed, newest last, capped at 400). Repeats of the same thing within 90 s fold
                                  into one line with a ×count.
     track(kind, detail, n)       logAct + awardXP(kind, <xp each>) — what the widgets call.
   ACT is the one table to edit: kind -> [category, emoji, XP each, XP cap per day]. XP 0 = counted but earns nothing.
   Labels are t('act_<kind>') and t('actcat_<category>'). Lessons, assignments and attendance keep their older day-record
   fields (lessons / assignments / attendance) — actCount() reads those for them so nothing is counted twice. */
const ACT_CATS = ['plan', 'teach', 'time', 'media', 'lang', 'tools', 'cloud'];
const ACT = {
  // planning
  lesson:      ['plan',  '📘', 10, 30],
  assignment:  ['plan',  '📝',  5, 20],
  event:       ['plan',  '📅',  2, 10],
  report:      ['plan',  '🧾',  3,  9],
  // running the class
  daily:       ['teach', '🌅',  5,  5],
  attendance:  ['teach', '🧑‍🎓',  5,  5],
  pick:        ['teach', '🎯',  1,  5],
  groups:      ['teach', '👥',  2,  6],
  score:       ['teach', '🏆',  1,  5],
  poll:        ['teach', '📊',  1,  5],
  ticket:      ['teach', '🎫',  1,  5],
  hallpass:    ['teach', '🚪',  1,  4],
  checklist:   ['teach', '✅',  1,  5],
  noise:       ['teach', '🎤',  1,  3],
  announce:    ['teach', '📢',  2,  6],
  instruct:    ['teach', '📋',  1,  5],
  traffic:     ['teach', '🚦',  0,  0],
  dice:        ['teach', '🎲',  0,  0],
  // timing + reading
  timer:       ['time',  '⏲️',  1,  5],
  stopwatch:   ['time',  '⏱️',  1,  3],
  reading:     ['time',  '📚',  1,  5],
  // media + files
  docopen:     ['media', '📄',  0,  0],
  file:        ['media', '📁',  1,  5],
  game:        ['media', '🎮',  2,  6],
  music:       ['media', '🎵',  1,  5],
  video:       ['media', '🎬',  1,  5],
  sfx:         ['media', '🔊',  0,  0],
  // language
  tts:         ['lang',  '🗣️',  1,  4],
  convo:       ['lang',  '💬',  1,  5],
  idiom:       ['lang',  '📖',  1,  3],
  grammar:     ['lang',  '✏️',  1,  3],
  // tools
  qr:          ['tools', '▦',   1,  3],
  meet:        ['tools', '📹',  1,  3],
  // cloud classroom
  cloudpoints: ['cloud', '⭐',  1, 10],
  notehome:    ['cloud', '✉️',  2, 10],
  reward:      ['cloud', '🎁',  1,  3]
};
Object.keys(ACT).forEach(k => { if(!XP_RULES[k] && ACT[k][3]) XP_RULES[k] = { cap:ACT[k][3], quiet:true }; });   // quiet: no "daily limit reached" toast for the small stuff

const LEGACY_DAY_FIELD = { lesson:'lessons', assignment:'assignments', attendance:'attendance' };
const actCount = (r, k) => LEGACY_DAY_FIELD[k] ? (r[LEGACY_DAY_FIELD[k]] || 0) : ((r.acts || {})[k] || 0);
const dayActs = r => Object.keys(ACT).reduce((a, k) => a + actCount(r, k), 0);
const widgetSecs = r => Object.entries(r.timeBy || {}).filter(([k]) => k !== DOC_KEY).reduce((a, [, c]) => a + c, 0);   // document time overlaps widget time, so it isn't added

function logAct(kind, detail, n = 1, xp = 0){
  if(KINDER) return;
  const r = dayRec(), now = Date.now(), d = detail ? String(detail).slice(0, 80) : '';
  r.acts = r.acts || {}; r.acts[kind] = (r.acts[kind] || 0) + n;
  const T = tdx.totals || (tdx.totals = {}); T[kind] = (T[kind] || 0) + n;
  const F = tdx.feed || (tdx.feed = []), last = F[F.length - 1];
  if(last && last.k === kind && (last.d || '') === d && now - last.t < 90000){ last.c = (last.c || 1) + n; last.t = now; last.x = (last.x || 0) + xp; }
  else { F.push({ t:now, k:kind, d, c:n, x:xp }); if(F.length > 400) F.splice(0, F.length - 400); }
  xSave(); refreshStats();
}
function track(kind, detail, n = 1){
  const a = ACT[kind], xp = a && a[2] ? awardXP(kind, a[2]) : 0;
  logAct(kind, detail, n, xp);
}
function exportStatsCsv(){
  const kinds = Object.keys(ACT), days = Object.keys(tdx.stats.daily).sort();
  const head = ['date', 'xp', 'active_seconds', 'document_seconds', 'reading_minutes', ...kinds];
  const rows = days.map(k => { const r = tdx.stats.daily[k]; return [k, r.xp || 0, widgetSecs(r), (r.timeBy || {})[DOC_KEY] || 0, r.readMin || 0, ...kinds.map(a => actCount(r, a))]; });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([(window.Watermark ? Watermark.stamp([head, ...rows].map(r => r.join(',')).join('\n')) : [head, ...rows].map(r => r.join(',')).join('\n'))], { type:'text/csv' }));
  a.download = `teachersdeck-stats-${xDayKey(Date.now())}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
/* ---------------- v0.17.0 — Badges for gaining XP (ported from StudentDeck v0.9.6) ----------------
   Everything here is derived from numbers TeachersDeck already keeps — total XP, level, the streak, each day's XP and where it came from — so a badge
   can't be earned any way XP itself can't (the daily caps and the ~150 XP soft ceiling already limit it). Each badge is { id, group, tier 1-4 (bronze,
   silver, gold, diamond), icon, dk (description string key), n (the target), u (unit), val(ctx) }: it is earned when val(ctx) >= n, once, and stays earned.
   Names are t('bdn_<id>'), descriptions t(dk). What is stored is only tdx.badges = { earned: { id: { t: when, old?: 1 } }, init, bestStreak } in td_xp_v1 —
   on this device, like the rest of the XP, nothing is synced.
   The first time this runs on a device that already has history, every badge that history qualifies for is awarded SILENTLY (marked `old`) and a single
   message says how many — no flood of pop-ups. After that, each new badge pops up when the XP that earned it lands. */
const BADGE_GROUPS = ['xp', 'level', 'streak', 'day', 'mix', 'skill', 'habit'];
const BADGES = [
  ...[[50, '🌱', 1], [100, '💯', 1], [250, '⭐', 1], [500, '🌟', 2], [1000, '🏆', 2], [2500, '👑', 3], [5000, '💎', 4]]
    .map(([n, icon, tier]) => ({ id:'xp_' + n, group:'xp', tier, icon, dk:'bd_d_xp', n, u:'xp', val: c => c.total })),
  ...[[3, '🚀', 1], [5, '🎯', 1], [8, '🎓', 2], [10, '🔟', 3], [15, '🧠', 3], [20, '🧙', 4]]
    .map(([n, icon, tier]) => ({ id:'lv_' + n, group:'level', tier, icon, dk:'bd_d_lv', n, u:'', val: c => c.level })),
  ...[[3, '🔥', 1], [7, '🗓️', 2], [14, '🌠', 2], [30, '🌙', 3], [100, '🌋', 4]]
    .map(([n, icon, tier]) => ({ id:'st_' + n, group:'streak', tier, icon, dk:'bd_d_st', n, u:'days', val: c => c.bestStreak })),
  ...[[50, '☀️', 1], [100, '⚡', 2], [150, '🏋️', 3]]
    .map(([n, icon, tier]) => ({ id:'day_' + n, group:'day', tier, icon, dk:'bd_d_day', n, u:'xp', val: c => c.bestDay })),
  ...[[4, '🧩', 2], [7, '🌈', 3], [10, '🧭', 4]]
    .map(([n, icon, tier]) => ({ id:'mix_' + n, group:'mix', tier, icon, dk:'bd_d_mix', n, u:'things', val: c => c.maxSources })),
  ...[['lesson', '📐', 90, 2, ['lesson']], ['assignment', '📝', 60, 1, ['assignment']], ['attendance', '🧑‍🎓', 25, 1, ['attendance']], ['docs', '📄', 40, 1, ['docs']],
      ['groups', '👥', 12, 1, ['groups']], ['pick', '🙋', 10, 1, ['pick']], ['score', '🥇', 15, 1, ['score']], ['check', '📊', 20, 1, ['poll', 'ticket']],
      ['game', '🎮', 24, 2, ['game']], ['media', '🎬', 20, 1, ['music', 'video']], ['lang', '🗣️', 20, 2, ['tts', 'convo', 'idiom', 'grammar']],
      ['time', '⏲️', 20, 1, ['timer', 'stopwatch']], ['reading', '📚', 15, 1, ['reading']], ['plan', '📅', 24, 1, ['event', 'report']],
      ['cloud', '💫', 30, 2, ['cloudpoints']], ['home', '✉️', 20, 2, ['notehome']]]
    .map(([k, icon, n, tier, src]) => ({ id:'sk_' + k, group:'skill', tier, icon, dk:'bd_d_src', n, u:'xp', src, val: c => src.reduce((a, s) => a + (c.by[s] || 0), 0) })),
  ...[[7, '🌿', 1], [30, '🍀', 2], [100, '🏛️', 3]]
    .map(([n, icon, tier]) => ({ id:'hab_' + n, group:'habit', tier, icon, dk:'bd_d_hab', n, u:'days', val: c => c.activeDays }))
];
const bdName = b => t('bdn_' + b.id);
const bdDesc = b => t(b.dk, { n:b.n.toLocaleString(), src:(b.src || []).map(s => xpSrcLabel(s)).join(' / ').toLowerCase() });
const bdUnit = b => b.u ? ' ' + t('bd_u_' + b.u) : '';
function bdState(){ const B = tdx.badges || (tdx.badges = {}); if(!B.earned) B.earned = {}; return B; }
function badgeCtx(){                                                  // one pass over the day records gives every number a badge needs
  const B = bdState(), ctx = { total:tdx.xp.total, level:levelInfo(tdx.xp.total).level, bestStreak:Math.max(B.bestStreak || 0, tdx.xp.streak || 0), bestDay:0, maxSources:0, activeDays:0, by:{} };
  Object.values(tdx.stats.daily).forEach(r => {
    if((r.xp || 0) > 0) ctx.activeDays++;
    ctx.bestDay = Math.max(ctx.bestDay, r.xp || 0);
    let kinds = 0; Object.entries(r.xpBy || {}).forEach(([k, n]) => { ctx.by[k] = (ctx.by[k] || 0) + n; if(k !== 'daily' && n > 0) kinds++; });
    ctx.maxSources = Math.max(ctx.maxSources, kinds);
  });
  return ctx;
}
const sxStill = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function sxBurst(host, x, y, n = 12){                                 // a little shower of stars at a point inside `host` (the host must be positioned)
  if(sxStill() || !host) return;
  for(let i = 0; i < n; i++){ const p = document.createElement('s'), a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 46;
    p.className = 'sx-spark'; p.textContent = Math.random() < 0.5 ? '\u2726' : '\u2727';
    p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 12}px;animation-delay:${Math.random() * 0.25}s;font-size:${9 + Math.random() * 9}px`;
    host.appendChild(p); setTimeout(() => p.remove(), 1400); }
}
const medalHtml = (b, on) => `<span class="medal t${b.tier}${on ? ' on' : ''}" aria-hidden="true"><span class="mi">${b.icon}</span></span>`;
/* ---------------- Badge Display Case: shared building blocks ----------------
   The teacher's own case (renderBadgeCase) and the per-student case inside Badges & Rewards (badgeDetailHtml)
   draw the same hero-spot + next-up + shelves-by-group layout, from two different badge catalogs (BADGES/
   bdState() vs SS_BADGES/ssBadgeCtx()) with different field names and a different "earned" test. Each
   normalizes its own badges into { tier, icon, name, desc, on, progress(0-1), countLine?, earnedLine? } —
   countLine/earnedLine are optional since the recomputed SS_BADGES engine has no per-badge earn date and no
   per-badge unit label to show a count against — then calls these to build the markup. */
function bcTileHtml(b, n){
  const extra = b.on ? (b.earnedLine ? `<em>${b.earnedLine}</em>` : '')
    : `<div class="bd-bar sx-xpbar"><i style="width:${Math.round(b.progress * 100)}%"></i></div>${b.countLine ? `<em>${b.countLine}</em>` : ''}`;
  return `<div class="bd t${b.tier}${b.on ? ' on' : ''}" data-on="${b.on ? 1 : 0}"${n != null ? ` style="--n:${n}"` : ''} title="${xEsc(b.desc)}">${medalHtml(b, b.on)}<b>${xEsc(b.name)}</b><small>${xEsc(b.desc)}</small>${extra}</div>`;
}
function bcNextUpHtml(b){
  return `<div class="bd-nx t${b.tier}">${medalHtml(b, false)}<div><b>${xEsc(b.name)}</b><small>${xEsc(b.desc)}</small><div class="bd-bar sx-xpbar"><i style="width:${Math.round(b.progress * 100)}%"></i></div>${b.countLine ? `<em>${b.countLine}</em>` : ''}</div></div>`;
}
function bcHeroHtml(spot, countLabel, extraHtml, emptyLabel){
  return `<div class="bc-hero">
      ${spot ? `<span class="bc-spot">${medalHtml(spot, true)}</span><div class="bc-hero-t"><p class="bc-count">${countLabel}</p>${extraHtml || ''}</div>`
        : `<span class="bc-spot empty" aria-hidden="true">🏅</span><div class="bc-hero-t"><p class="small-hint">${emptyLabel}</p></div>`}
    </div>`;
}
function bcCabinetHtml(shelfRows, filterAttr){   // shelfRows: [[groupLabel, tilesHtml], ...]
  return `<div class="bgal bc-cabinet"${filterAttr ? ` data-f="${filterAttr}"` : ''}>${shelfRows.map(([label, html]) => `<section class="bc-shelf"><h5>${label}</h5><div class="bd-grid">${html}</div><div class="bc-ledge" aria-hidden="true"></div></section>`).join('')}</div>`;
}
const badgeQ = []; let badgeBusy = false;
function popBadge(b){ if(KINDER) return; badgeQ.push(b); if(!badgeBusy) nextBadgePop(); }
function nextBadgePop(){
  const b = badgeQ.shift(); if(!b){ badgeBusy = false; return; }
  badgeBusy = true;
  const el = document.createElement('div'); el.className = 'badge-pop'; el.setAttribute('role', 'status');
  el.innerHTML = `${medalHtml(b, true)}<div class="bp-t"><small>${t('bd_new')}</small><b>${xEsc(bdName(b))}</b><span>${xEsc(bdDesc(b))}</span></div>`;
  el.addEventListener('click', () => { el.remove(); openBadges(); nextBadgePop(); });
  document.body.appendChild(el); sxBurst(el, 40, 40, 16);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); nextBadgePop(); }, 380); }, 4300);
}
function updateBadgeChip(pulse){
  const n = Object.keys(bdState().earned).length, chip = document.getElementById('badge-chip'); if(!chip) return;
  document.getElementById('badge-n').textContent = n; chip.title = t('bd_chip_tip', { n, total:BADGES.length });
  if(pulse && !sxStill()){ chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse'); }
}
function grantBadge(b, silent){
  const B = bdState(); if(B.earned[b.id]) return false;
  B.earned[b.id] = silent ? { t:Date.now(), old:1 } : { t:Date.now() }; return true;
}
function checkBadges(){
  if(KINDER) return;
  const B = bdState(); B.bestStreak = Math.max(B.bestStreak || 0, tdx.xp.streak || 0);
  const c = badgeCtx(), fresh = BADGES.filter(b => !B.earned[b.id] && b.val(c) >= b.n), first = !B.init;
  if(first){                                                          // first run with history: award quietly, say so once
    fresh.forEach(b => grantBadge(b, true)); B.init = true; xSave();
    if(fresh.length) toast(t(fresh.length === 1 ? 'bd_have_one' : 'bd_have_many', { n:fresh.length }), 4800);
  } else if(fresh.length){
    fresh.forEach(b => grantBadge(b, false)); xSave();
    fresh.slice(0, 3).forEach(popBadge); if(fresh.length > 3) setTimeout(() => toast(t('bd_more_toast', { n:fresh.length - 3 }), 3600), 600);
    refreshStats();
  }
  updateBadgeChip(fresh.length > 0 && !first);
}
function openBadges(){                                                // header chip / pop-up click: opens the Badge Display Case
  if(!state.active.badgecase) toggleWidget('badgecase');
}

const capSeen = new Set();
function awardXP(source, amount){
  if(KINDER) return 0;
  const rule = XP_RULES[source] || { cap:DEFAULT_CAP }, r = dayRec();
  let n = Math.round(amount * streakMult());
  if(r.xp >= SOFT_CEILING) n = Math.ceil(n / 2);                             // past ~150 XP a day, everything earns half
  n = Math.min(n, rule.cap - (r.xpBy[source] || 0));
  if(n <= 0){ const k = source + xDayKey(Date.now()); if(!capSeen.has(k)){ capSeen.add(k); if(!rule.quiet) toast(t('xp_cap_reached', { src: xpSrcLabel(source) })); } return 0; }
  const before = levelInfo(tdx.xp.total).level;
  tdx.xp.total += n; r.xp += n; r.xpBy[source] = (r.xpBy[source] || 0) + n;
  tdx.xp.log.push({ t:Date.now(), s:source, n }); if(tdx.xp.log.length > 100) tdx.xp.log.shift();
  xSave(); drawXP(n, levelInfo(tdx.xp.total).level > before); checkBadges(); refreshStats(); return n;
}
function drawXP(gain, up){
  const lv = document.getElementById('xp-lv'); if(!lv) return;
  const L = levelInfo(tdx.xp.total);
  lv.textContent = 'Lv ' + L.level;
  document.getElementById('xp-fill').style.width = Math.round(L.into / L.need * 100) + '%';
  document.getElementById('xp-tot').textContent = tdx.xp.total + ' XP';
  if(gain){ const p = document.getElementById('xp-pop'); p.textContent = '+' + gain + ' XP'; p.classList.remove('go'); void p.offsetWidth; p.classList.add('go'); }
  if(up) toast(t('xp_level_up', { n:L.level }), 3500);
}
function touchDay(){                                                         // first visit of a day: streak + 5 XP
  if(KINDER) return;
  const today = xDayKey(Date.now()), X = tdx.xp; if(X.last === today) return;
  X.streak = X.last === xDayKey(Date.now() - 864e5) ? X.streak + 1 : 1; X.last = today; dayRec(); xSave();
  logAct('daily', '', 1, awardXP('daily', 5));
}

/* Per-document time. tdx.docTime[fileId] = { name, kind, secs, opens, last } is the lifetime total for one file or link (kept
   in localStorage, so it survives the file being removed and never rewrites a saved PDF). Today's seconds for each document
   live on the day record as docSecs[fileId], and the XP already granted for it as docUnitsBy[fileId] — that is what enforces
   DOC_XP_PER_DOC, so one PDF left open can't earn the whole daily document allowance. */
const docKeyOf = d => d.id || ('n:' + d.name), docCapSeen = new Set();
function docEntry(d){
  const T = tdx.docTime, k = docKeyOf(d);
  if(!T[k]){
    const keys = Object.keys(T); if(keys.length >= 100){ keys.sort((a, c) => (T[a].last || 0) - (T[c].last || 0)); delete T[keys[0]]; }     // keep the list bounded
    T[k] = { name:d.name, kind:d.kind, secs:0, opens:0, last:Date.now() };
  }
  T[k].name = d.name; return T[k];
}
function noteDocOpen(d){ const e = docEntry(d); e.opens++; e.last = Date.now(); xSave(); logAct('docopen', d.name); }
function trackDoc(d, secs){                                                  // returns today's seconds for this one document
  const e = docEntry(d), r = dayRec(), k = docKeyOf(d); e.secs += secs; e.last = Date.now();
  r.docSecs = r.docSecs || {}; return (r.docSecs[k] = (r.docSecs[k] || 0) + secs);
}
function docXpGranted(d){ const r = dayRec(); return ((r.docUnitsBy || {})[docKeyOf(d)]) || 0; }

/* Reading Log link (off by default for teachers — turn it on in the toolbar's Track menu): when a document is closed, and every
   ~30 s while it's open, today's minutes on it go to ONE Reading Log entry per document per day (entry.doc = the document's key).
   The minutes count in the Reading stats but earn no extra XP — the document already earned 'docs' XP — and each minute is counted
   once even if the entry is deleted and re-made. */
function logDocToReading(d){                                                 // returns the minutes now on today's entry (0 = nothing to log yet)
  const r = dayRec(), k = docKeyOf(d), min = Math.min(600, Math.floor(((r.docSecs || {})[k] || 0) / 60)); if(min < 1) return 0;
  const E = state.readingLog.entries, today = xDayKey(Date.now()); r.docLogged = r.docLogged || {};
  const counted = r.docLogged[k] || 0; let e = E.find(x => x.doc === k && x.date === today);
  if(!e){ e = { id:cid(), name:'📄 ' + d.name, minutes:min, at:Date.now(), doc:k, date:today }; E.unshift(e); } else e.minutes = min;
  if(min > counted){ if(!counted) stat('readEntries'); stat('readMin', min - counted); r.docLogged[k] = min; }
  saveState(); if(readingRedraw) readingRedraw(); return min;
}
function closeDocLog(){                                                      // called when a document is closed or swapped
  if(!docCur || !tdx.docToReading) return;
  const mins = logDocToReading(docCur); if(mins) toast(t('doc_logged_toast', { min:mins, name:docCur.name || '' }));
}

/* Time in widgets: every 5 s, each open widget gets the elapsed seconds — but only while this tab is visible and there has been
   input in the last 5 minutes, so a forgotten tab earns nothing. Document time is counted separately (timeBy.docs) and, unlike
   widget time, earns XP. Reading happens inside the iframe, whose scrolling never reaches this page, so a document counts while
   the tab is visible AND the window has focus, and after DOC_IDLE_MS with no input here a "Still reading?" card pauses the clock. */
let lastTick = Date.now(), lastInput = Date.now(), lastDocPoke = Date.now(), ticks = 0;
['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(ev => window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive:true }));
setInterval(()=>{
  const now = Date.now(), dt = Math.min(15, Math.round((now - lastTick) / 1000)); lastTick = now;
  if(document.visibilityState !== 'visible' || !dt) return;
  const r = dayRec(), tb = r.timeBy; let counted = false;
  if(now - lastInput <= IDLE_MS){
    Object.keys(state.active).filter(id => state.active[id] && widgetEls[id]).forEach(id => { tb[id] = (tb[id] || 0) + dt; counted = true; });
  }
  if(docStageOpen() && docCur && document.hasFocus()){
    if(now - Math.max(lastInput, lastDocPoke) <= DOC_IDLE_MS){
      tb[DOC_KEY] = (tb[DOC_KEY] || 0) + dt; counted = true;
      const k = docKeyOf(docCur), todayDoc = trackDoc(docCur, dt);
      r.docUnitsBy = r.docUnitsBy || {};
      const got = r.docUnitsBy[k] || 0, due = Math.min(Math.floor(todayDoc / DOC_XP_SECS), DOC_XP_PER_DOC) - got;   // one XP unit per full DOC_XP_SECS, up to DOC_XP_PER_DOC per document per day
      if(due > 0){
        r.docUnitsBy[k] = got + due; awardXP('docs', due);
        if(got + due >= DOC_XP_PER_DOC && !docCapSeen.has(k + xDayKey(now))){ docCapSeen.add(k + xDayKey(now)); toast(t('doc_cap_toast')); }
      }
      drawDocTime();
    } else docAskStillReading();
  }
  if(counted && ++ticks % 6 === 0){ if(docStageOpen() && docCur && tdx.docToReading) logDocToReading(docCur); xSave(); refreshStats(); }   // write to storage every ~30 s, not every tick
}, 5000);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) xSave(); else { lastTick = Date.now(); touchDay(); } });
window.addEventListener('pagehide', ()=>{ if(docStageOpen()) closeDocLog(); xSave(); });

/* Stats & XP — a full-screen widget (v0.16.0), animated like StudentDeck's (v0.17.0). Everything shown comes from tdx (td_xp_v1): the day records, the
   activity feed, the badges and the per-document times. The range chips (Today / 7 / 30 days / All) drive the tiles, breakdowns and feed; the trend and
   the calendar always show their own fixed window.
   Motion: on opening, and when the range changes (fx), the cards rise in one after another, bars/columns grow, squares pop, rows slide in, numbers count
   up and the level bar fills with a glint and a shower of stars. Hover animates whatever the pointer is on (CSS, "Stats & XP animation" in style.css).
   Everything respects the system "reduce motion" setting. While the pointer is on the page the 10-second refresh waits (a redraw would restart whatever
   is animating under it) and runs as soon as the pointer leaves. */
function renderStats(body){
  let range = 'week', metric = 'xp', feedCat = 'all', feedMax = 40;
  let ci = 0, fx = true, fxCols = false, dirty = false;                    // ci: card number (staggered entrance); fx: play the entrance this time; fxCols: only the trend columns regrow
  const RANGES = [['today', 'stats_today', 0], ['week', 'stats_week', 6], ['month', 'stats_month', 29], ['all', 'stats_all', null]];
  body.innerHTML = `<div class="sx-wrap"><div id="sx-top"></div><div id="sx-main"></div></div>`;
  const dayKeys = () => { const all = Object.keys(tdx.stats.daily), n = RANGES.find(r => r[0] === range)[2]; if(n === null) return all; const cut = xDayKey(Date.now() - n * 864e5); return all.filter(k => k >= cut); };
  // The period of equal length right before the current range — e.g. "week" compares the last 7 days to the 7 before that.
  // Powers the trend stoplight on every raw-count tile, same idea as AdminDeck's School Stats (no "all time" equivalent: null).
  const prevDayKeys = () => { const n = RANGES.find(r => r[0] === range)[2]; if(n === null) return null;
    const all = Object.keys(tdx.stats.daily), hi = xDayKey(Date.now() - (n + 1) * 864e5), lo = xDayKey(Date.now() - (2 * n + 1) * 864e5);
    return all.filter(k => k >= lo && k <= hi); };
  const sumBasic = ks => { const s = { xp:0, acts:0, totalT:0, docT:0, lessons:0, assignments:0, attendance:0, readEntries:0, readMin:0 };
    ks.forEach(k => { const r = tdx.stats.daily[k]; if(!r) return;
      s.xp += r.xp || 0; s.readEntries += r.readEntries || 0; s.readMin += r.readMin || 0;
      Object.keys(ACT).forEach(a => { s.acts += actCount(r, a); });
      s.lessons += r.lessons || 0; s.assignments += r.assignments || 0; s.attendance += r.attendance || 0;
      s.totalT += widgetSecs(r); s.docT += (r.timeBy || {})[DOC_KEY] || 0; });
    return s; };
  const fmtDay = k => new Date(k + 'T12:00').toLocaleDateString(state.lang || 'en', { month:'short', day:'numeric' });
  const wLabel = id => { const w = WIDGETS.find(x => x.id === id); return w ? widgetLabel(w.labelKey) : id; };
  const bars = rows => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map((r, n) => `<div class="sx-bar" style="--n:${n}"><span title="${xEsc(r.l)}">${xEsc(r.l)}</span><div><i style="width:${Math.round(r.v / mx * 100)}%"></i></div><b>${xEsc(r.t)}</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`; };
  const chip = (attr, val, label, on) => `<button type="button" class="sx-chip${on ? ' on' : ''}" data-${attr}="${val}">${label}</button>`;
  const card = (title, html, cls = '', id = '') => `<section class="sx-card ${cls}"${id ? ` id="${id}"` : ''} style="--i:${ci++}"><h4>${title}</h4>${html}</section>`;

  function countUp(el, delay = 0){                                          // 0 -> its own number, easing out; text after the number (units, dates) stays put
    if(!el || sxStill()) return;
    const raw = el.dataset.raw || (el.dataset.raw = el.textContent), m = /^(\d+(?:\.\d+)?)([\s\S]*)$/.exec(raw); if(!m || +m[1] === 0) return;
    const end = +m[1], dec = (m[1].split('.')[1] || '').length, t0 = performance.now() + delay, dur = 750; cancelAnimationFrame(el._raf);
    const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = (end * e).toFixed(dec) + m[2]; if(k < 1) el._raf = requestAnimationFrame(step); else el.textContent = raw; };
    el.textContent = '0' + m[2]; el._raf = requestAnimationFrame(step);
  }

  function draw(){
    const keepScroll = body.scrollTop, days = tdx.stats.daily, keys = dayKeys(), X = tdx.xp, L = levelInfo(X.total), m = streakMult(), pct = Math.round(L.into / L.need * 100);
    const A = {}, xpBy = {}, timeBy = {}, opens = {}, T = { xp:0, acts:0, readEntries:0, readMin:0 }; let best = null, activeDays = 0; ci = 0;
    keys.forEach(k => { const r = days[k];
      T.xp += r.xp || 0; T.readEntries += r.readEntries || 0; T.readMin += r.readMin || 0;
      Object.keys(ACT).forEach(a => { const n = actCount(r, a); if(n){ A[a] = (A[a] || 0) + n; T.acts += n; } });
      Object.entries(r.xpBy || {}).forEach(([s, n]) => { xpBy[s] = (xpBy[s] || 0) + n; });
      Object.entries(r.timeBy || {}).forEach(([w, n]) => { timeBy[w] = (timeBy[w] || 0) + n; });
      Object.entries(r.opens || {}).forEach(([w, n]) => { opens[w] = (opens[w] || 0) + n; });
      if(dayActs(r) || r.xp || widgetSecs(r)) activeDays++;
      if(!best || (r.xp || 0) > best.v) best = { k, v:r.xp || 0 };
    });
    const totalT = Object.entries(timeBy).filter(([k]) => k !== DOC_KEY).reduce((a, [, c]) => a + c, 0), docT = timeBy[DOC_KEY] || 0;
    const topW = Object.entries(timeBy).filter(([k]) => k !== DOC_KEY).sort((a, c) => c[1] - a[1])[0];
    const todayRec = days[xDayKey(Date.now())] || {};

    /* ---- top: level, streak, range, export ---- */
    body.querySelector('#sx-top').innerHTML = `<div class="sx-hero">
      <div class="sx-lvl"><div class="sx-big">Lv ${L.level}</div><div class="sx-lvl-bar"><div class="sx-xpbar"><i style="width:${fx && !sxStill() ? 0 : pct}%"></i></div>
        <div class="small-hint">${t('stats_to_next', { into:L.into, need:L.need, next:L.level + 1, total:X.total })}</div></div></div>
      <div class="sx-pills"><span class="sx-pill">${t('stats_streak', { n:X.streak })}</span>${m > 1 ? `<span class="sx-pill">${t('stats_bonus', { m:m.toFixed(1) })}</span>` : ''}<span class="sx-pill">${t('stats_today_xp', { n:todayRec.xp || 0, max:SOFT_CEILING })}</span></div>
      <div class="sx-tools"><div class="sx-range" role="group" aria-label="${t('stats_range')}">${RANGES.map(([k, key]) => chip('r', k, t(key), range === k)).join('')}</div>
        <button type="button" class="sx-chip" data-export>${t('stats_export')}</button></div></div>`;

    /* ---- tiles ---- */
    const daysSt = range === 'week' ? stoplight('days', activeDays) : null;         // day-count thresholds assume a 7-day week
    const prevKeys = prevDayKeys(), P = prevKeys ? sumBasic(prevKeys) : null;        // null on "all time" — no equal-length period before it
    const trendSt = (cur, prevVal) => P ? stoplight('trend', stPct(cur, prevVal)) : null;
    const tiles = [['stats_xp_earned', T.xp, trendSt(T.xp, P && P.xp)], ['stats_tile_acts', T.acts, trendSt(T.acts, P && P.acts)], ['stats_active', fmtDur(totalT), trendSt(totalT, P && P.totalT)], ['stats_doc_time', fmtDur(docT), trendSt(docT, P && P.docT)], ['stats_tile_days', activeDays, daysSt],
      ['stats_lessons', A.lesson || 0, trendSt(A.lesson || 0, P && P.lessons)], ['stats_assignments', A.assignment || 0, trendSt(A.assignment || 0, P && P.assignments)], ['stats_attendance', A.attendance || 0, trendSt(A.attendance || 0, P && P.attendance)], ['stats_reading', `${T.readEntries} · ${T.readMin} min`, trendSt(T.readMin, P && P.readMin)],
      ['stats_tile_top', topW ? wLabel(topW[0]) : '—'], ['stats_tile_best', best && best.v ? `${fmtDay(best.k)} · ${best.v} XP` : '—']];

    /* ---- trend (14 days) ---- */
    const N = 14, trend = Array.from({ length:N }, (_, i) => { const k = xDayKey(Date.now() - (N - 1 - i) * 864e5), r = days[k] || {};
      return { k, v: metric === 'xp' ? (r.xp || 0) : metric === 'acts' ? dayActs(r) : Math.round(widgetSecs(r) / 60) }; }), mxT = Math.max(1, ...trend.map(d => d.v));
    const unitOf = { xp:'XP', acts:t('stats_metric_acts'), min:'min' }[metric];

    /* ---- calendar heat map (15 weeks, Monday-first, newest column on the right) ---- */
    const W = 15, dow = (new Date().getDay() + 6) % 7, first = Date.now() - ((W - 1) * 7 + dow) * 864e5, todayK = xDayKey(Date.now());
    const cells = Array.from({ length:W * 7 }, (_, i) => { const k = xDayKey(first + i * 864e5), r = days[k] || {}; return { k, future:k > todayK, v:dayActs(r) + (widgetSecs(r) >= 300 ? 1 : 0), xp:r.xp || 0, a:dayActs(r) }; });
    const mxH = Math.max(1, ...cells.map(c => c.v));

    /* ---- activity breakdown by category ---- */
    const cats = ACT_CATS.map(c => { const rows = Object.keys(ACT).filter(k => ACT[k][0] === c && A[k]).map(k => ({ l:`${ACT[k][1]} ${t('act_' + k)}`, v:A[k], t:String(A[k]) })).sort((a, b) => b.v - a.v);
      return `<div class="sx-cat"><h5>${t('actcat_' + c)}<b>${rows.reduce((a, r) => a + r.v, 0)}</b></h5>${bars(rows)}</div>`; }).join('');

    /* ---- XP rules + today's progress ---- */
    const xb = todayRec.xpBy || {};
    const ruleKeys = ['daily', 'docs', 'lesson', 'assignment', 'attendance', ...Object.keys(ACT)].filter((k, i, a) => a.indexOf(k) === i && XP_RULES[k]);
    const rules = ruleKeys.map((s, n) => { const cap = XP_RULES[s].cap, got = xb[s] || 0, unit = s === 'docs' ? t('stats_rule_docs', { max:DOC_XP_PER_DOC }) : t('stats_rule_each', { n:(ACT[s] || [])[2] });
      return `<div class="sx-rule${got >= cap ? ' full' : ''}" style="--n:${Math.min(n, 14)}"><span>${ACT[s] ? ACT[s][1] + ' ' : '📄 '}${xEsc(xpSrcLabel(s))}</span><small>${xEsc(unit)}</small><div class="sx-meter"><i style="width:${Math.min(100, Math.round(got / cap * 100))}%"></i></div><b>${got}/${cap}</b></div>`; }).join('');

    /* ---- rows ---- */
    const xpRows = Object.keys({ ...XP_RULES, ...xpBy }).map(s => ({ l:xpSrcLabel(s), v:xpBy[s] || 0, t:(xpBy[s] || 0) + ' XP' })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const timeRows = [...WIDGETS.map(w => ({ id:w.id, l:widgetLabel(w.labelKey) })), { id:DOC_KEY, l:t('stats_open_docs') }].map(w => ({ l:w.l, v:timeBy[w.id] || 0, t:fmtDur(timeBy[w.id] || 0) + (opens[w.id] ? ' · ' + t('stats_opens', { n:opens[w.id] }) : ''), o:opens[w.id] || 0 })).filter(r => r.v || r.o).sort((a, c) => c.v - a.v || c.o - a.o);
    const docRows = Object.values(tdx.docTime).filter(e => e.secs).sort((a, c) => c.secs - a.secs).slice(0, 8).map(e => ({ l:(e.kind === 'pdf' ? '📕 ' : '🔗 ') + e.name, v:e.secs, t:fmtDur(e.secs) + (e.opens ? ' · ' + t('stats_opens', { n:e.opens }) : '') }));

    /* ---- feed ---- */
    const keySet = new Set(keys), all = (tdx.feed || []).filter(e => keySet.has(xDayKey(e.t)) && (feedCat === 'all' || (ACT[e.k] || [])[0] === feedCat)).reverse(), shown = all.slice(0, feedMax);
    const dayLabel = k => k === todayK ? t('stats_day_today') : k === xDayKey(Date.now() - 864e5) ? t('stats_day_yest') : new Date(k + 'T12:00').toLocaleDateString(state.lang || 'en', { weekday:'long', month:'short', day:'numeric' });
    let feedHtml = '', lastDay = '';
    shown.forEach((e, n) => { const k = xDayKey(e.t), a = ACT[e.k] || ['', '•', 0, 0];
      if(k !== lastDay){ lastDay = k; feedHtml += `<div class="sx-fday">${xEsc(dayLabel(k))}</div>`; }
      feedHtml += `<div class="sx-frow" style="--n:${Math.min(n, 14)}"><time>${new Date(e.t).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</time><span class="sx-fic">${a[1]}</span><span class="sx-ftxt"><b>${xEsc(t('act_' + e.k))}</b>${e.c > 1 ? ` <em>×${e.c}</em>` : ''}${e.d ? ` <i>${xEsc(e.d)}</i>` : ''}</span>${e.x ? `<span class="sx-fxp">+${e.x} XP</span>` : ''}</div>`; });

    const trendCard = card(t('stats_h_trend'), `<div class="sx-range sx-range-sm">${[['xp', 'XP'], ['acts', t('stats_metric_acts')], ['min', t('stats_metric_min')]].map(([k, l]) => chip('m', k, l, metric === k)).join('')}</div>
      <div class="sx-cols sx-cols-lg">${trend.map((d, n) => `<div class="sx-col" style="--n:${n}" data-v="${d.v} ${unitOf}" title="${d.k}: ${d.v} ${unitOf}"><em>${d.v || ''}</em><i style="height:${Math.round(d.v / mxT * 100)}%"></i><span>${new Date(d.k + 'T12:00').toLocaleDateString(state.lang || 'en', { weekday:'narrow' })}<small>${+d.k.slice(8)}</small></span></div>`).join('')}</div>`);
    const heatCard = card(t('stats_h_heat'), `<div class="sx-heat" role="img" aria-label="${t('stats_h_heat')}">${cells.map((c, n) => `<i class="sx-hm${c.future ? ' x' : ' l' + (c.v ? Math.max(1, Math.ceil(c.v / mxH * 4)) : 0)}" style="--n:${n};--d:${((n * 37) % 23) / 10}s" title="${c.k}: ${c.a} · ${c.xp} XP"></i>`).join('')}</div>
      <div class="sx-legend">${t('stats_less')} <i class="sx-hm l0"></i><i class="sx-hm l1"></i><i class="sx-hm l2"></i><i class="sx-hm l3"></i><i class="sx-hm l4"></i> ${t('stats_more')}</div>`);
    const actsCard = card(`${t('stats_h_acts')} <span class="small-hint">${t('stats_acts_hint')}</span>`, `<div class="sx-cats">${cats}</div>`, 'wide');
    const xpCard = card(t('stats_h_xpby'), bars(xpRows));
    const timeCard = card(`${t('stats_h_time')} <span class="small-hint">${t('stats_while_active')}</span>`, bars(timeRows));
    const rulesCard = card(`${t('stats_h_rules')} <span class="small-hint">${t('stats_rules_hint', { max:SOFT_CEILING })}</span>`, rules);
    const docsCard = card(`${t('stats_h_docs')} <span class="small-hint">${t('stats_all_time')}</span>`, bars(docRows));
    const feedCard = card(`${t('stats_h_feed')} <span class="small-hint">${all.length}</span>`, `<div class="sx-range sx-range-sm">${chip('fc', 'all', t('stats_feed_all'), feedCat === 'all')}${ACT_CATS.map(c => chip('fc', c, t('actcat_' + c), feedCat === c)).join('')}</div>
      ${feedHtml || `<p class="small-hint">${t('stats_empty_feed')}</p>`}
      ${all.length > shown.length ? `<button type="button" class="sx-chip sx-more" data-more>${t('stats_more_btn', { n:all.length - shown.length })}</button>` : ''}`, 'wide');

    body.querySelector('#sx-main').innerHTML = `${stoplightLegendHtml()}<div class="sx-tiles">${tiles.map(([key, v, st], n) => `<div class="sx-tile" style="--n:${n}"${st ? ` data-st="${st}"` : ''}><b>${xEsc(v)}</b><span>${t(key)}</span></div>`).join('')}</div>
      <div class="sx-grid">${trendCard}${heatCard}${actsCard}${xpCard}${timeCard}${rulesCard}${docsCard}${feedCard}</div>`;
    body.scrollTop = keepScroll;

    const main = body.querySelector('#sx-main'), top = body.querySelector('#sx-top');
    main.classList.toggle('fx-in', fx); top.classList.toggle('fx-lvl', fx); main.classList.toggle('fx-cols', fxCols);
    if(fx){                                                              // the entrance: cards rise in, bars and columns grow, squares pop, numbers count up, the level bar fills
      const bar = top.querySelector('.sx-xpbar i');
      if(bar && !sxStill()) requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.width = pct + '%';
        setTimeout(() => { const r = bar.getBoundingClientRect(), h = top.getBoundingClientRect(); sxBurst(top, Math.max(8, r.right - h.left), r.top - h.top + r.height / 2, 14); }, 750);
      }));
      main.querySelectorAll('.sx-tile b').forEach((el, n) => countUp(el, 250 + n * 40));
      setTimeout(() => { main.classList.remove('fx-in'); top.classList.remove('fx-lvl'); }, 2400);
      fx = false;
    }
    if(fxCols){ setTimeout(() => main.classList.remove('fx-cols'), 1500); fxCols = false; }
  }
  body.addEventListener('click', e => {
    const c = e.target.closest('[data-r],[data-m],[data-fc],[data-more],[data-export]'); if(!c) return;
    if('export' in c.dataset){ exportStatsCsv(); return; }
    if('r' in c.dataset){ range = c.dataset.r; feedMax = 40; fx = true; }
    else if('m' in c.dataset){ metric = c.dataset.m; fxCols = true; }
    else if('fc' in c.dataset){ feedCat = c.dataset.fc; feedMax = 40; }
    else if('more' in c.dataset) feedMax += 60;
    draw();
  });
  // Hover: a tile's number counts up again; the level badge throws a few stars. (Everything else on hover is CSS.)
  body.addEventListener('mouseover', e => {
    const tile = e.target.closest('.sx-tile'); if(tile && !tile.contains(e.relatedTarget)) countUp(tile.querySelector('b'));
    const lvl = e.target.closest('.sx-lvl'); if(lvl && !lvl.contains(e.relatedTarget)){ const top = body.querySelector('#sx-top'), r = lvl.getBoundingClientRect(), h = top.getBoundingClientRect(); sxBurst(top, r.left - h.left + 40, r.top - h.top + r.height / 2, 10); }
  });
  const live = () => { if(body.matches(':hover')) dirty = true; else { dirty = false; draw(); } };
  body.addEventListener('mouseleave', () => { if(dirty){ dirty = false; draw(); } });
  statsRedraw = live; draw(); const iv = setInterval(live, 10000);
  return ()=>{ clearInterval(iv); if(statsRedraw === live) statsRedraw = null; };
}

/* ---------------- Badge Display Case (v0.22.1) ----------------
   The teacher's own badges — split out of My Stats & XP into its own widget so Stats stays about activity, not a trophy
   wall. Same hero-spot + shelf chrome as the Badges tab's per-student case (Rewards & Points) and ParentDeck's Badge
   Display Case — reuses the existing .bc-hero/.bc-cabinet/.bc-shelf CSS, just with the teacher's own BADGES/bdState(). */
function renderBadgeCase(body){
  let badgeFilter = 'all', fx = true;
  const chip = (attr, val, label, on) => `<button type="button" class="sx-chip${on ? ' on' : ''}" data-${attr}="${val}">${label}</button>`;
  const fmtDay = k => new Date(k + 'T12:00').toLocaleDateString(state.lang || 'en', { month:'short', day:'numeric' });
  const nf = v => Math.round(v).toLocaleString();
  function draw(){
    const B = bdState(), C = badgeCtx(), earned = BADGES.filter(x => B.earned[x.id]), n = earned.length, pct = Math.round(n / BADGES.length * 100);
    const prog = x => Math.min(1, x.val(C) / x.n);
    // normalize into the shape bcTileHtml/bcNextUpHtml/bcHeroHtml expect — see their comment, above medalHtml
    const norm = x => { const on = !!B.earned[x.id], e = B.earned[x.id];
      return { ...x, name:bdName(x), desc:bdDesc(x), on, progress:prog(x),
        countLine:`${nf(Math.min(x.val(C), x.n))} / ${nf(x.n)}${bdUnit(x)}`,
        earnedLine: on ? (e.old ? t('bd_old') : t('bd_earned', { date:fmtDay(xDayKey(e.t)) })) : null }; };
    const next = BADGES.filter(x => !B.earned[x.id]).sort((a, c) => prog(c) - prog(a)).slice(0, 3).map(norm);
    const spot = earned.slice().sort((a, c) => (B.earned[c.id].t || 0) - (B.earned[a.id].t || 0))[0];
    let k = 0;
    const keep = body.scrollTop;
    const shelves = BADGE_GROUPS.map(g => [t('bdg_' + g), BADGES.filter(x => x.group === g).map(x => bcTileHtml(norm(x), k++)).join('')]);
    body.innerHTML = bcHeroHtml(spot && norm(spot), t('bd_of', { n:`<b>${n}</b>`, total:BADGES.length }), spot ? `<div class="xpbar wide"><i style="width:${pct}%"></i></div>` : '', t('rp_badges_none_yet'))
      + `<div class="sx-range sx-range-sm" role="group" aria-label="${t('bd_h')}">${[['all', 'bd_f_all'], ['on', 'bd_f_on'], ['off', 'bd_f_off']].map(([f, key]) => chip('bf', f, t(key), badgeFilter === f)).join('')}</div>
      ${next.length ? `<p class="bd-next-h">${t('bd_next')}</p><div class="bd-next">${next.map(bcNextUpHtml).join('')}</div>` : `<p class="small-hint">${t('bd_all_done')}</p>`}
      ` + bcCabinetHtml(shelves, badgeFilter);
    body.classList.toggle('fx-in', fx);
    if(fx){ setTimeout(() => body.classList.remove('fx-in'), 2400); fx = false; }
    body.scrollTop = keep;
  }
  body.addEventListener('click', e => { const f = e.target.closest('[data-bf]'); if(f){ badgeFilter = f.dataset.bf; draw(); } });
  badgeCaseRedraw = draw; draw();
  return () => { if(badgeCaseRedraw === draw) badgeCaseRedraw = null; };
}

