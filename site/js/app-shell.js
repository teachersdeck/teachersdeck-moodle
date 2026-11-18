/* ---------------- IndexedDB (files + images) ---------------- */
const idb = {
  _db:null,
  open(){
    if(this._db) return Promise.resolve(this._db);
    return new Promise((resolve,reject)=>{
      if(typeof indexedDB === 'undefined'){
        reject(new Error('indexedDB unavailable in this browsing context'));
        return;
      }
      // Bumped 1 -> 2: earlier builds hardcoded version 1 even as object
      // stores were added over time, so onupgradeneeded never re-ran for
      // anyone whose "TeachersDeck" DB already existed at version 1 without
      // a given store (e.g. a browser profile that first touched this DB
      // before the "images" store existed) — put()/get() on that store then
      // fails silently. The version bump forces onupgradeneeded to run once
      // for everybody; the per-store `contains()` checks below are already
      // idempotent, so this is safe to bump again in the future the same way.
      const req = indexedDB.open('TeachersDeck', 4);
      req.onupgradeneeded = e=>{
        const db = e.target.result;
        if(!db.objectStoreNames.contains('files')) db.createObjectStore('files',{keyPath:'id'});
        if(!db.objectStoreNames.contains('images')) db.createObjectStore('images',{keyPath:'id'});
        if(!db.objectStoreNames.contains('games')) db.createObjectStore('games',{keyPath:'id'});
        if(!db.objectStoreNames.contains('music')) db.createObjectStore('music',{keyPath:'id'});
        if(!db.objectStoreNames.contains('videos')) db.createObjectStore('videos',{keyPath:'id'});
        if(!db.objectStoreNames.contains('sounds')) db.createObjectStore('sounds',{keyPath:'id'});
        if(!db.objectStoreNames.contains('gdocs')) db.createObjectStore('gdocs',{keyPath:'sha'});   // Office file hash -> converted Google file (v0.13.0)
        if(!db.objectStoreNames.contains('boards')) db.createObjectStore('boards',{keyPath:'id'});   // DrawDeck boards (v0.22.0)
      };
      req.onsuccess = e=>{
        const db = e.target.result;
        // If another tab (or a newer build) needs to upgrade the DB, let go of
        // our connection instead of blocking it — a blocked upgrade just hangs.
        db.onversionchange = ()=>{ db.close(); if(this._db === db) this._db = null; };
        this._db = db; resolve(db);
      };
      req.onerror = e=> reject(e.target && e.target.error ? e.target.error : e);
      req.onblocked = ()=> reject(new Error('indexedDB upgrade blocked — another tab has this app open'));
    });
  },
  async put(store, record){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const tx = db.transaction(store,'readwrite');
      tx.objectStore(store).put(record);
      tx.oncomplete = ()=>res(true);
      tx.onerror = e=>rej(e);
    });
  },
  async delete(store, id){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const tx = db.transaction(store,'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = ()=>res(true);
      tx.onerror = e=>rej(e);
    });
  },
  async getAll(store){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const tx = db.transaction(store,'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = ()=>res(req.result || []);
      req.onerror = e=>rej(e);
    });
  },
  async get(store,id){
    const db = await this.open();
    return new Promise((res,rej)=>{
      const tx = db.transaction(store,'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = ()=>res(req.result || null);
      req.onerror = e=>rej(e);
    });
  }
};

function toast(msg, ms){
  const el = document.getElementById('toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toast._h);
  toast._h = setTimeout(()=> el.hidden = true, ms || 2200);
}

/* ---------------- Icons (inline, stroke-based) ---------------- */
const ICONS = {
  draw:`<path d="M4 20l1.2-4.3L16 5l3 3L8.3 18.8 4 20Z"/><path d="M14 7l3 3"/><path d="M3 4h6M3 8h3" opacity=".55"/>`,
  stats:`<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>`,
  clock:`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
  tellingtime:`<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l-3.8 2.2"/><path d="M12 3v1.6M21 12h-1.6M12 21v-1.6M3 12h1.6"/>`,
  timer:`<path d="M10 2h4"/><path d="M12 6v0"/><circle cx="12" cy="14" r="8"/><path d="M12 14V9"/><path d="M18 6l1.5-1.5"/>`,
  stopwatch:`<circle cx="12" cy="13" r="8"/><path d="M12 13V9"/><path d="M9 3h6"/>`,
  traffic:`<rect x="8" y="2" width="8" height="20" rx="4"/><circle cx="12" cy="6.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="17.5" r="1.4"/>`,
  dice:`<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.3"/><circle cx="16" cy="8" r="1.3"/><circle cx="8" cy="16" r="1.3"/><circle cx="16" cy="16" r="1.3"/><circle cx="12" cy="12" r="1.3"/>`,
  checklist:`<path d="M4 6h1M4 12h1M4 18h1"/><path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.3 6l.7.7L5.3 5.4" stroke-width="0"/>`,
  people:`<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 14a5 5 0 0 1 5.5 5"/>`,
  shuffle:`<path d="M3 6h3.5c1.3 0 2.5.7 3.2 1.8l4.6 7.4c.7 1.1 1.9 1.8 3.2 1.8H21"/><path d="M17 4l4 3-4 3"/><path d="M3 18h3.5c1.3 0 2.5-.7 3.2-1.8"/><path d="M17 20l4-3-4-3"/>`,
  files:`<path d="M4 4h6l2 2h8v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>`,
  game:`<rect x="2" y="8" width="20" height="10" rx="5"/><path d="M7 11v4M5 13h4"/><circle cx="16" cy="11.5" r="1"/><circle cx="18.5" cy="14" r="1"/>`,
  trophy:`<path d="M7 3h10v4a5 5 0 0 1-10 0V3Z"/><path d="M7 4H4.5A2.5 2.5 0 0 0 4 8.9L7 11"/><path d="M17 4h2.5A2.5 2.5 0 0 1 20 8.9L17 11"/><path d="M12 12v3.5"/><path d="M9 20h6"/><path d="M9.6 16.5h4.8l.5 3.5H9.1l.5-3.5Z"/>`,
  settings:`<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4L19.4 13Z"/>`,
  close:`<path d="M6 6l12 12M18 6L6 18"/>`,
  pin:`<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z"/><path d="M12 14v7"/>`,
  expand:`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`,
  grip:`<circle cx="9" cy="6.5" r="1.3"/><circle cx="15" cy="6.5" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17.5" r="1.3"/><circle cx="15" cy="17.5" r="1.3"/>`,
  minimize:`<path d="M5 12h14"/>`,
  restore:`<rect x="6" y="6" width="12" height="12" rx="2"/>`,
  calendar:`<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/><circle cx="8" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="16" cy="14" r="1"/>`,
  chevronLeft:`<path d="M14.5 5 8 12l6.5 7"/>`,
  chevronRight:`<path d="M9.5 5 16 12l-6.5 7"/>`,
  bell:`<path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z"/><path d="M10 19a2 2 0 0 0 4 0"/>`,
  plus:`<path d="M12 5v14M5 12h14"/>`,
  poll:`<rect x="4" y="11" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="16" y="14" width="4" height="6" rx="1"/>`,
  mic:`<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0"/><path d="M12 17v4"/><path d="M8.5 21h7"/>`,
  musicNote:`<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
  videoCam:`<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4"/>`,
  speaker:`<path d="M4 9v6h3.5l5 4V5l-5 4H4Z"/><path d="M16 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6.5a8 8 0 0 1 0 11"/>`,
  qrcode:`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14v3M14 19h2M19 19h2"/>`,
  door:`<rect x="5" y="2.5" width="12" height="19" rx="1"/><circle cx="14" cy="12" r="1"/><path d="M17 21.5h4M3 21.5h4"/>`,
  swap:`<path d="M4 8h13"/><path d="M13 4l4 4-4 4"/><path d="M20 16H7"/><path d="M11 12l-4 4 4 4"/>`,
  clipboard:`<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="8.5" y="2" width="7" height="3.5" rx="1"/><path d="M8.5 11h7M8.5 15h7M8.5 19h4"/>`,
  report:`<path d="M4 20V4"/><path d="M4 20h16"/><path d="M7 16l3.5-5 3 2.5L18 8"/><circle cx="18" cy="8" r="1.3"/>`,
  chat:`<path d="M4 5h16v11H9l-4 4V5Z"/><path d="M8 9h8M8 12.5h5"/>`,
  quote:`<path d="M7 8c-2 0-3.3 1.6-3.3 3.7 0 2.2 1.6 3.6 3.2 3.6.2 1.7-.9 3-2.6 3.4l.5 1.6c3-.5 4.6-2.6 4.6-5.8V8H7Zm9 0c-2 0-3.3 1.6-3.3 3.7 0 2.2 1.6 3.6 3.2 3.6.2 1.7-.9 3-2.6 3.4l.5 1.6c3-.5 4.6-2.6 4.6-5.8V8H16Z"/>`,
  book:`<path d="M4 4.5c2.5-1 5.5-1 8 0v15c-2.5-1-5.5-1-8 0v-15Z"/><path d="M20 4.5c-2.5-1-5.5-1-8 0v15c2.5-1 5.5-1 8 0v-15Z"/>`,
  lessonplan:`<path d="M6 3h8.5L19 7.5V21H6V3Z"/><path d="M14 3v5h5"/><path d="M9 12.5h7M9 16h7M9 9h3"/>`,
  cloud:`<path d="M7 18a4.5 4.5 0 0 1-.6-8.96 5.5 5.5 0 0 1 10.7-1.6A4 4 0 0 1 17.5 18H7Z"/>`,
  mail:`<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M4 7.5l8 6 8-6"/>`
};
function iconSvg(name, cls=''){
  return `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name]||''}</svg>`;
}

/* ---------------- Widget registry ---------------- */
/* Each widget: id, label, icon, w/h default, render(body, ctx) */
/* DrawDeck (v0.22.0): full-screen whiteboard + mind map + flowchart. The widget lives in js/drawdeck.js; this is only the glue. */
Object.assign(STRINGS, DrawDeck.strings);
/* Whiteboard background (Nov 2026, hq/docs/WHITEBOARD-SCOPE.md): DrawDeck's engine on the wall, under the widgets, with a
   corner radial menu (js/whiteboard.js). Picked in Theme → Backgrounds; state.whiteboard is per class (so is its board). */
if(typeof TDWhiteboard !== 'undefined'){
  Object.assign(STRINGS, TDWhiteboard.strings);
  TDWhiteboard.setup({
    t, toast: (m, ms) => toast(m, ms), idb: () => idb,
    tier: () => (isPro() || (typeof TD_STORE !== 'undefined' && TD_STORE.has('whiteboard-premium')) ? 'pro' : 'free'),   // Pro includes it, or the store key owns it (250,000 VND)
    classId: () => activeClassId(), className: () => classDisplayName(activeClass()),
    get: k => state[k], set: (k, v) => { state[k] = v; saveState(); },
    wanted: () => !!state.whiteboard,
    // TinyTeachersDeck: bigger free markers (8 px), DrawDeck's preschool tools in the bars, an adult clears the board
    preschool: KINDER, markerSize: KINDER ? 2 : undefined,
    adultGate: KINDER ? () => (window.KinderAdultGate ? window.KinderAdultGate() : false) : null,
    onLocked: () => openWhiteboardOffer(),
    // "Open in DrawDeck" (premium): the full DrawDeck opens on this class's whiteboard board; the wall comes back when it closes
    openFull: id => {
      try{ const p = JSON.parse(localStorage.getItem('td_drawdeck_v1') || '{}') || {}; p.last = id; localStorage.setItem('td_drawdeck_v1', JSON.stringify(p)); }catch(e){}
      TDWhiteboard.suspend();
      if(!widgetEls.drawdeck) toggleWidget('drawdeck'); else TDWhiteboard.resume();
    },
    cloudClassId: () => (!KINDER && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession() && state.cloudClassId) ? state.cloudClassId : null,
    share: (dataUrl) => TDCloud.shareBoard(state.cloudClassId, dataUrl),
    stopShare: () => TDCloud.stopSharingBoard(state.cloudClassId),
    assignBoard: (title, thumbDataUrl, imageDataUrl) => TDCloud.assignBoard(state.cloudClassId, title, thumbDataUrl, imageDataUrl),
    watermark: (typeof Watermark !== 'undefined') ? Watermark : null,
    download: (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  });
}
function renderDrawDeck(body, ctx){
  const off = DrawDeck.mount(body, {
    t, toast,
    tracing: KINDER,   // TinyTeachersDeck: tracing pages for letters, numbers, names, strokes and shapes
    preschool: KINDER, kidModeSwitch: KINDER,   // drawing only, the preschool maths and templates; Kid Mode for a child at the screen
    kidModeUnlock: KINDER ? () => (window.KinderAdultGate ? window.KinderAdultGate() : false) : undefined,   // js/kinder-widgets.js: the PIN, or a sum
    close: ()=>toggleWidget('drawdeck'),
    idb,
    watermark: (typeof Watermark !== 'undefined') ? Watermark : null,
    download: (blob, name)=>{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    },
    // "Share this page with the class" (v0.26.0) needs a linked cloud class to share into (never in the Kinder edition: no StudentDeck).
    cloudClassId: () => (!KINDER && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession() && state.cloudClassId) ? state.cloudClassId : null,
    share: (dataUrl) => TDCloud.shareBoard(state.cloudClassId, dataUrl),
    stopShare: () => TDCloud.stopSharingBoard(state.cloudClassId),
    // "Assign this page to students" (v0.29.0, backend v2.9.0) — DrawDeck scope step D.
    assignBoard: (title, thumbDataUrl, imageDataUrl) => TDCloud.assignBoard(state.cloudClassId, title, thumbDataUrl, imageDataUrl)
  });
  // the Whiteboard background lent its board to this DrawDeck ("Open in DrawDeck"): it takes it back when DrawDeck closes
  return () => { off(); if(typeof TDWhiteboard !== 'undefined') setTimeout(() => TDWhiteboard.resume(), 0); };
}

const WIDGETS = [
  { id:'clock', cat:'time', labelKey:'clock', icon:'clock', w:200, h:246, render:(b, c) => renderClock(b, c) },
  { id:'timer', cat:'time', labelKey:'timer', icon:'timer', w:220, h:210, render:(b, c) => renderTimer(b, c) },
  { id:'stopwatch', cat:'time', labelKey:'stopwatch', icon:'stopwatch', w:220, h:280, render:(b, c) => renderStopwatch(b, c) },
  { id:'tellingtime', cat:'time', labelKey:'tellingtime', icon:'tellingtime', w:340, h:500, render:(b, c) => renderTellingTime(b, c) },   // Telling Time (Nov 2026): free; its premium faces are Pro
  { id:'traffic', cat:'tools', labelKey:'traffic', icon:'traffic', w:180, h:250, render:(b, c) => renderTraffic(b, c) },
  { id:'dice', cat:'tools', labelKey:'dice', icon:'dice', w:200, h:200, render:(b, c) => renderDice(b, c) },
  { id:'checklist', cat:'tools', labelKey:'checklist', icon:'checklist', w:260, h:270, render:(b, c) => renderChecklist(b, c) },
  { id:'files', cat:'media', labelKey:'files', icon:'files', w:280, h:280, render:(b, c) => renderFiles(b, c) },
  { id:'games', cat:'media', labelKey:'games', icon:'game', w:330, h:500, render:(b, c) => renderGames(b, c), pro:true },
  { id:'scoreboard', cat:'tools', labelKey:'scoreboard', icon:'trophy', w:260, h:440, render:(b, c) => renderScoreboard(b, c) },
  { id:'calendar', cat:'time', labelKey:'calendar', icon:'calendar', w:300, h:440, render:(b, c) => renderCalendar(b, c) },
  { id:'assignments', cat:'tools', labelKey:'assignments', icon:'clipboard', w:320, h:480, render:(b, c) => renderAssignments(b, c) },
  { id:'progressreports', cat:'tools', labelKey:'progressreports', icon:'report', w:340, h:520, render:(b, c) => renderProgressReports(b, c) },
  { id:'poll', cat:'tools', labelKey:'poll', icon:'poll', w:270, h:320, render:(b, c) => renderPoll(b, c) },
  { id:'noise', cat:'media', labelKey:'noise', icon:'mic', w:300, h:540, render:(b, c) => renderNoise(b, c) },
  { id:'music', cat:'media', labelKey:'music', icon:'musicNote', w:290, h:380, render:(b, c) => renderMusic(b, c), pro:true },
  { id:'videoplayer', cat:'media', labelKey:'video_player', icon:'videoCam', w:340, h:400, render:(b, c) => renderVideoPlayer(b, c), pro:true },
  { id:'soundboard', cat:'media', labelKey:'soundboard', icon:'speaker', w:280, h:320, render:(b, c) => renderSoundboard(b, c), pro:true },
  { id:'attendance', cat:'time', labelKey:'attendance', icon:'people', w:260, h:380, render:(b, c) => renderAttendance(b, c), pro:true },
  { id:'groupmaker', cat:'tools', labelKey:'groupmaker', icon:'shuffle', w:280, h:360, render:(b, c) => renderGroupMaker(b, c), pro:true },
  { id:'exitticket', cat:'tools', labelKey:'exitticket', icon:'poll', w:260, h:320, render:(b, c) => renderExitTicket(b, c), pro:true },
  { id:'agenda', cat:'tools', labelKey:'agenda', icon:'clipboard', w:300, h:360, render:(b, c) => renderAgenda(b, c), pro:true },
  { id:'meet', cat:'cloud', labelKey:'meet', icon:'videoCam', w:290, h:380, render:(b, c) => renderMeet(b, c), pro:true },
  { id:'qrcode', cat:'tools', labelKey:'qrcode', icon:'qrcode', w:260, h:340, render:(b, c) => renderQrCode(b, c), pro:true },
  { id:'countdown', cat:'time', labelKey:'countdown', icon:'timer', w:240, h:220, render:(b, c) => renderCountdown(b, c), pro:true },
  { id:'hallpass', cat:'time', labelKey:'hallpass', icon:'door', w:260, h:360, render:(b, c) => renderHallPass(b, c), pro:true },
  { id:'readinglog', cat:'time', labelKey:'readinglog', icon:'stopwatch', w:270, h:400, render:(b, c) => renderReadingLog(b, c), pro:true },
  { id:'ttsreader', cat:'language', labelKey:'ttsreader', icon:'mic', w:300, h:320, render:(b, c) => renderTtsReader(b, c), pro:true },
  { id:'unitconverter', cat:'tools', labelKey:'unitconverter', icon:'swap', w:270, h:300, render:(b, c) => renderUnitConverter(b, c), pro:true },
  { id:'announcements', cat:'tools', labelKey:'announcements', icon:'bell', w:280, h:360, render:(b, c) => renderAnnouncements(b, c), pro:true },
  { id:'instructions', cat:'tools', labelKey:'instructions', icon:'clipboard', w:300, h:340, render:(b, c) => renderInstructions(b, c), pro:true },
  { id:'convocards', cat:'language', labelKey:'convocards', icon:'chat', w:280, h:320, render:(b, c) => renderConvoCards(b, c), pro:true },
  { id:'idiomday', cat:'language', labelKey:'idiomday', icon:'quote', w:280, h:300, render:(b, c) => renderIdiomDay(b, c), pro:true },
  { id:'grammarref', cat:'language', labelKey:'grammarref', icon:'book', w:280, h:340, render:(b, c) => renderGrammarRef(b, c), pro:true },
  { id:'namepicker', cat:'tools', labelKey:'namepicker', icon:'shuffle', w:240, h:220, render:(b, c) => renderNamePicker(b, c) },
  { id:'classbuilder', cat:'tools', labelKey:'classbuilder', icon:'people', w:580, h:640, render:(b, c) => renderClassBuilder(b, c) },   // v0.19.0
  { id:'lessonplanner', cat:'cloud', labelKey:'lessonplanner', icon:'lessonplan', w:330, h:610, render:(b, c) => renderLessonPlanner(b, c), pro:true },
  { id:'cloudclass', cat:'cloud', labelKey:'cloudclass', icon:'cloud', w:420, h:580, render:(b, c) => renderCloudClass(b, c) },
  { id:'rewardpoints', cat:'cloud', labelKey:'rewardpoints', icon:'trophy', w:680, h:580, render:(b, c) => renderRewardPoints(b, c) },   // v0.21.0 (v0.22.0: gained a Badges tab — id kept as 'rewardpoints' so saved layouts and docks carry over)
  { id:'noteshome', cat:'cloud', labelKey:'noteshome', icon:'mail', w:840, h:600, render:(b, c) => renderNotesHome(b, c) },
  { id:'classactivity', cat:'cloud', labelKey:'classactivity', icon:'stats', w:380, h:560, render:(b, c) => renderStudentStats(b, c), full:true },   // v0.20.0: Student Stats — full screen (id kept as 'classactivity' so saved layouts and docks carry over)
  { id:'stats', cat:'tools', labelKey:'stats', icon:'stats', w:360, h:540, render:(b, c) => renderStats(b, c), full:true },
  { id:'badgecase', cat:'tools', labelKey:'badgecase', icon:'trophy', w:420, h:560, render:(b, c) => renderBadgeCase(b, c), full:true },   // v0.22.1: the teacher's own badges, split out of My Stats & XP
  { id:'scrapreview', cat:'cloud', labelKey:'scrapreview', icon:'clipboard', w:420, h:560, render:(b, c) => renderScrapReview(b, c) },   // v0.27.0: approve/hide Scrapdeck pages students shared (M3)
  { id:'boardreview', cat:'cloud', labelKey:'boardreview', icon:'report', w:420, h:560, render:(b, c) => renderBoardReview(b, c) },   // v0.29.0 (backend v2.9.0): review Board Assignments submissions and award XP (DrawDeck scope step D)
  { id:'drawdeck', cat:'tools', labelKey:'drawdeck', icon:'draw', w:380, h:560, render:(b, c) => renderDrawDeck(b, c), full:true }   // v0.22.0: DrawDeck — whiteboard, mind map, flowchart (full screen)
];
/* UniDeck phase 1 (LectureDeck's Course mode): LectureDeck's own js/course-mode.js lists its widgets in window.UNI_WIDGETS
   ({ id, cat, title, desc, icon, w, h, render }). They join the registry only in the university edition, in a "Courses"
   category of the app tray, with their labels added to STRINGS (English, and Vietnamese from titleVi/descVi). TeachersDeck never loads that file. */
const UNI_WIDGET_DEFS = (UNI ? (window.UNI_WIDGETS || []) : []).concat(KINDER ? (window.KINDER_WIDGETS || []) : []);   // Kinder: js/kinder-widgets.js, same shape
UNI_WIDGET_DEFS.forEach(w => {
  // Kinder: a widget marked `replaces` takes the place of the TeachersDeck widget with the same id (Agenda Board becomes
  // Today's Plan, Name Picker becomes Helper of the Day…), so saved layouts and dock places carry over.
  const at = WIDGETS.findIndex(x => x.id === w.id), swap = at >= 0 && KINDER && w.replaces;
  if(at >= 0 && !swap) return;
  if(swap) WIDGETS.splice(at, 1);
  STRINGS['uw_' + w.id] = (!swap && STRINGS['uw_' + w.id]) || { en: w.title, ...(w.titleVi ? { vi: w.titleVi } : {}) };   // titleVi / descVi: UniDeck's Vietnamese
  STRINGS['wc_' + w.id] = (!swap && STRINGS['wc_' + w.id]) || { en: w.desc || '', ...(w.descVi ? { vi: w.descVi } : {}) };
  WIDGETS.push({ id:w.id, cat:w.cat || 'course', labelKey:'uw_' + w.id, icon:w.icon || 'clipboard', w:w.w, h:w.h, render:w.render, full:!!w.full });
});
if(UNI) STRINGS.cat_course = STRINGS.cat_course || { en:'Courses', vi:'Khóa học' };
/* UniDeck (LectureDeck): school-only widgets leave the registry in the university edition. They are built on StudentDeck's
   class join codes and points, ParentDeck's families, or primary-school routines, none of which UniDeck has: Cloud Class
   (Course builder replaces it), Reward Points, Notes Home, Class Activity, Progress Reports, Scrapbook Review, Board
   Review and Hall Pass. Saved layouts and dock places for them are left untouched. TeachersDeck keeps them all. */
const UNI_SCHOOL_ONLY = ['cloudclass', 'rewardpoints', 'noteshome', 'classactivity', 'progressreports', 'scrapreview', 'boardreview', 'hallpass'];
if(UNI) for(let i = WIDGETS.length - 1; i >= 0; i--) if(UNI_SCHOOL_ONLY.includes(WIDGETS[i].id)) WIDGETS.splice(i, 1);
/* Kinder edition (TinyTeachersDeck scope, section 4.3): 24 widgets leave the registry. They need student accounts, points,
   XP or homework, are teacher XP, are school-age or English practice, or are not a preschool task. Hidden means hidden
   everywhere: purgeKinderHidden() also forgets their open state, positions and dock places (their code and data stay).
   KINDER_ORDER is the app-tray and first-run dock order; KINDER_STRINGS (js/kinder-strings.js) renames what stays. */
const KINDER_HIDDEN = ['cloudclass', 'rewardpoints', 'assignments', 'boardreview', 'scrapreview', 'classactivity', 'classbuilder',
  'stats', 'badgecase', 'exitticket', 'poll', 'readinglog', 'ttsreader', 'unitconverter', 'idiomday', 'grammarref', 'convocards',
  'instructions', 'stopwatch', 'countdown', 'hallpass', 'meet', 'videoplayer', 'qrcode'];
const KINDER_ORDER = ['myclass', 'attendance', 'dailyreport', 'agenda', 'noteshome', 'calendar', 'timer', 'music', 'checklist',
  'clock', 'noise', 'soundboard', 'files', 'groupmaker', 'namepicker', 'lessonplanner', 'progressreports', 'announcements',
  'games', 'drawdeck', 'scoreboard', 'traffic', 'dice'];
if(KINDER){
  for(let i = WIDGETS.length - 1; i >= 0; i--) if(KINDER_HIDDEN.includes(WIDGETS[i].id)) WIDGETS.splice(i, 1);
  const rank = id => { const k = KINDER_ORDER.indexOf(id); return k < 0 ? 999 : k; };
  WIDGETS.sort((a, b) => rank(a.id) - rank(b.id));
  const KS = window.KINDER_STRINGS || {};
  Object.keys(KS).forEach(k => { STRINGS[k] = { ...(STRINGS[k] || {}), ...KS[k] }; });
}

const wall = document.getElementById('wall');
const dock = document.getElementById('dock');
const widgetEls = {}; // id -> {el, cleanup}

/* ---------------- Widget curation (v0.18.0) ----------------
   39 widgets is more than a classroom needs and more than the docks hold (10 + 5 + 5 + 5), so some are redundant: a smaller tool that a bigger one already
   covers, a launcher for something the browser does, or a novelty. A widget can be DEACTIVATED: it disappears from every dock, the app tray and the dock settings, can't be
   opened, and is closed if it was open — but its code and saved data stay, and it comes back with one switch in Manage widgets.
   • WIDGET_TIERS is the recommendation: 'core' = best to keep, 'keep' = worth keeping, 'shelve' = recommended to deactivate. Reasons are t('wc_<id>').
   • Which widgets are deactivated is a global preference (td_widgets_v1), not per class: { curated, off:{id:true}, parked:{id:1} }.
   • The first launch of this version deactivates the 'shelve' widgets the teacher has NEVER used (no recorded time/opens, not open now). Used ones are left alone.
   • `parked`: widgets that were deactivated before they were ever given a dock slot. Reactivating one gives it the first free slot instead of leaving it in the tray. */
const WPREF_KEY = 'td_widgets_v1';
const wprefs = (() => { let s = null; try{ s = JSON.parse(localStorage.getItem(WPREF_KEY)); }catch(e){} s = (s && typeof s === 'object') ? s : {}; return { curated:!!s.curated, off:{ ...(s.off || {}) }, parked:{ ...(s.parked || {}) } }; })();
const saveWprefs = () => { try{ localStorage.setItem(WPREF_KEY, JSON.stringify(wprefs)); }catch(e){} };
const isOff = id => !KINDER && (!!wprefs.off[id] || !!(PF && PF.hides(id)));   // Kinder: the school decides, so nothing is switched off here   // platform: the widgets this platform leaves out
const WIDGET_TIERS = {
  core:   ['classbuilder', 'clock', 'timer', 'namepicker', 'groupmaker', 'scoreboard', 'poll', 'attendance', 'traffic', 'noise', 'agenda', 'files', 'calendar', 'assignments', 'progressreports', 'lessonplanner', 'cloudclass', 'rewardpoints', 'noteshome'],
  keep:   ['tellingtime', 'checklist', 'games', 'music', 'hallpass', 'qrcode', 'ttsreader', 'convocards', 'idiomday', 'grammarref', 'instructions', 'classactivity', 'stats', 'badgecase', 'drawdeck', 'scrapreview', 'boardreview'],
  shelve: ['stopwatch', 'dice', 'videoplayer', 'soundboard', 'exitticket', 'meet', 'countdown', 'unitconverter', 'announcements', 'readinglog']
};
const tierOf = id => Object.keys(WIDGET_TIERS).find(k => WIDGET_TIERS[k].includes(id)) || 'keep';
function widgetUsage(id){                         // what the teacher has actually done with it, from the same day records Stats & XP uses
  const days = tdx.stats.daily, cut = xDayKey(Date.now() - 29 * 864e5); let opens = 0, secs = 0, o30 = 0, s30 = 0, last = '';
  Object.keys(days).sort().forEach(k => { const o = (days[k].opens || {})[id] || 0, s = (days[k].timeBy || {})[id] || 0; if(o || s) last = k; opens += o; secs += s; if(k >= cut){ o30 += o; s30 += s; } });
  return { opens, secs, o30, s30, last, any: opens > 0 || secs >= 30 || !!state.active[id] };
}
function purgeKinderHidden(){                     // Kinder: hidden means hidden everywhere (saved layouts from an older build too)
  let changed = false;
  [state.active, state.layout, state.dockPlacement, state.dockVisible, wprefs.off, wprefs.parked].forEach(o => {
    if(o) KINDER_HIDDEN.forEach(id => { if(id in o){ delete o[id]; changed = true; } });
  });
  if(changed){ saveState(); saveWprefs(); }
}
function curateWidgetsOnce(){                     // first launch of this version: tidy away the recommended widgets the teacher has never touched
  if(KINDER || wprefs.curated || (PF && PF.fixedWidgets)) return 0;   // platform: its own widget list is the curation
  let n = 0; WIDGET_TIERS.shelve.forEach(id => { if(WIDGETS.some(w => w.id === id) && !widgetUsage(id).any){ wprefs.off[id] = true; n++; } });
  wprefs.curated = true; saveWprefs(); return n;
}
function placeInFreeDock(id){ const d = ['bottom', 'left', 'right'].find(k => placementCount(k) < DOCK_CAPS[k]); if(d) state.dockPlacement[id] = d; }
function setWidgetOff(id, off){
  if(!WIDGETS.some(w => w.id === id) || !!wprefs.off[id] === !!off) return;
  if(off){ wprefs.off[id] = true; if(state.active[id]) closeWidget(id); }
  else { delete wprefs.off[id]; if(wprefs.parked[id] || !state.dockPlacement[id]) placeInFreeDock(id); delete wprefs.parked[id]; }
  saveWprefs(); saveState(); rebuildAllDocks(); syncDock(); wmRender();
}
function applyWidgetRecommendations(){           // deactivate every recommended widget except the ones in use
  let n = 0, kept = 0;
  WIDGET_TIERS.shelve.forEach(id => { if(isOff(id)) return; if(widgetUsage(id).any){ kept++; return; } wprefs.off[id] = true; if(state.active[id]) closeWidget(id); n++; });
  saveWprefs(); saveState(); rebuildAllDocks(); syncDock(); wmRender();
  toast(t('wm_apply_toast', { n, kept:kept ? t('wm_apply_kept', { n:kept }) : '' }), 4200);
}
function reactivateAllWidgets(){
  Object.keys(wprefs.off).forEach(id => { delete wprefs.off[id]; if(wprefs.parked[id] || !state.dockPlacement[id]) placeInFreeDock(id); delete wprefs.parked[id]; });
  saveWprefs(); saveState(); rebuildAllDocks(); syncDock(); wmRender(); toast(t('wm_react_toast'), 3000);
}
function fillFreeDockSlots(){                    // promote widgets that only live in the app tray into any free dock slots, best ones first
  const rank = id => ({ core:0, keep:1, shelve:2 })[tierOf(id)];
  const cand = WIDGETS.filter(w => !isOff(w.id) && state.dockPlacement[w.id] === 'hidden').sort((a, b) => rank(a.id) - rank(b.id)); let n = 0;
  cand.forEach(w => { const before = state.dockPlacement[w.id]; placeInFreeDock(w.id); if(state.dockPlacement[w.id] !== before) n++; });
  saveState(); rebuildAllDocks(); syncDock(); wmRender(); toast(t('wm_fill_toast', { n }), 3200);
}
function updateWmSummary(){
  const on = WIDGETS.filter(w => !isOff(w.id)).length, el = document.getElementById('wm-settings-sum');
  if(el) el.textContent = t('wm_sum', { on, off:WIDGETS.length - on });
}

/* the Manage widgets screen (a dialog built on first use) */
function wmEl(){
  let b = document.getElementById('wm-backdrop'); if(b) return b;
  b = document.createElement('div'); b.className = 'wm-backdrop'; b.id = 'wm-backdrop'; b.hidden = true;
  b.innerHTML = `<div class="wm" role="dialog" aria-modal="true" aria-labelledby="wm-title"><div class="wm-head"><div><h2 id="wm-title"></h2><p class="wm-sum" id="wm-sum"></p></div>
    <button type="button" class="icon-btn" id="wm-close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></button></div>
    <p class="wm-sub" id="wm-sub"></p><div class="wm-actions" id="wm-actions"></div><div class="wm-body" id="wm-body"></div></div>`;
  document.body.appendChild(b);
  b.addEventListener('click', e => {
    if(e.target === b){ closeWidgetManager(); return; }
    const a = e.target.closest('[data-wm]'); if(!a) return;
    if(a.dataset.wm === 'close') closeWidgetManager();
    else if(a.dataset.wm === 'apply') applyWidgetRecommendations();
    else if(a.dataset.wm === 'all') reactivateAllWidgets();
    else if(a.dataset.wm === 'fill') fillFreeDockSlots();
  });
  b.querySelector('#wm-close').addEventListener('click', closeWidgetManager);
  b.addEventListener('change', e => { const c = e.target.closest('input[data-wid]'); if(c) setWidgetOff(c.dataset.wid, !c.checked); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !b.hidden){ e.stopPropagation(); closeWidgetManager(); } }, true);
  return b;
}
function wmRender(){
  const b = document.getElementById('wm-backdrop'); updateWmSummary(); if(!b || b.hidden) return;
  const keep = b.querySelector('#wm-body').scrollTop, off = WIDGETS.filter(w => isOff(w.id)).length, on = WIDGETS.length - off;
  b.querySelector('#wm-title').textContent = t('wm_title'); b.querySelector('#wm-sum').textContent = t('wm_sum', { on, off }); b.querySelector('#wm-sub').textContent = t('wm_sub');
  const canApply = WIDGET_TIERS.shelve.some(id => !isOff(id)), canFill = WIDGETS.some(w => !isOff(w.id) && state.dockPlacement[w.id] === 'hidden') && ['bottom', 'left', 'right'].some(d => placementCount(d) < DOCK_CAPS[d]);
  b.querySelector('#wm-actions').innerHTML = `${canApply ? `<button type="button" class="sx-chip on" data-wm="apply">${t('wm_apply')}</button>` : ''}${off ? `<button type="button" class="sx-chip" data-wm="all">${t('wm_react_all')}</button>` : ''}${canFill ? `<button type="button" class="sx-chip" data-wm="fill">${t('wm_fill')}</button>` : ''}`;
  const fmtD = k => new Date(k + 'T12:00').toLocaleDateString(state.lang || 'en', { month:'short', day:'numeric', year:'numeric' });
  const row = w => { const tier = tierOf(w.id), u = widgetUsage(w.id), isoff = isOff(w.id);
    const use = (u.o30 || u.s30) ? t('wm_used', { n:u.o30, t:fmtDur(u.s30) }) : u.last ? t('wm_used_old', { date:fmtD(u.last) }) : t('wm_used_none');
    return `<label class="wm-row${isoff ? ' off' : ''}"><span class="wm-tx"><b>${xEsc(widgetLabel(w.labelKey))}</b><span class="wm-info" tabindex="0" title="${xEsc(t('wc_' + w.id))}" aria-label="${xEsc(t('wc_' + w.id))}">ⓘ</span><em class="wm-tag t-${tier}">${t('wm_tag_' + tier)}</em>${tier === 'shelve' && !isoff && u.any ? `<em class="wm-tag t-use">${t('wm_you_use')}</em>` : ''}
      <small class="wm-use">${xEsc(use)}</small></span><span class="wm-sw"><input type="checkbox" data-wid="${w.id}" ${isoff ? '' : 'checked'} aria-label="${xEsc(widgetLabel(w.labelKey))}"><i></i></span></label>`; };
  b.querySelector('#wm-body').innerHTML = ['shelve', 'core', 'keep'].map(tier => { const ws = WIDGETS.filter(w => tierOf(w.id) === tier); if(!ws.length) return '';
    return `<h3 class="wm-h t-${tier}">${t('wm_sec_' + tier)} <span>${ws.filter(w => !isOff(w.id)).length}/${ws.length}</span></h3><p class="wm-why">${t('wm_why_' + tier)}</p><div class="wm-list">${ws.map(row).join('')}</div>`; }).join('');
  b.querySelector('#wm-body').scrollTop = keep;
}
function openWidgetManager(){ const b = wmEl(); b.hidden = false; wmRender(); const x = b.querySelector('#wm-close'); if(x) x.focus(); }
function closeWidgetManager(){ const b = document.getElementById('wm-backdrop'); if(b) b.hidden = true; }

/* ---------------- Multi-dock placement (bottom/left/right) ----------------
   50+ widgets won't fit in one bar, so each widget lives in exactly one
   launcher: the bottom dock, the left drawer, the right drawer, the top
   dock (icon-only, left-justified right after the brand name), or hidden.
   Bottom holds up to 10, everywhere else holds up to 5. ---------------- */
const DOCK_CAPS = { bottom:KINDER ? 5 : 10, left:5, right:5, top:5 };   // Kinder: five big icons on a phone

function widgetsFor(loc){
  const list = WIDGETS.filter(w => state.dockPlacement[w.id] === loc && !isOff(w.id));
  // The order the teacher dragged the icons into comes first (before the cap below, so a dragged icon is never the one
  // capped out); widgets never dragged keep the registry order after them.
  const order = state.dockOrder[loc] || [], at = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  list.sort((a, b) => at(a.id) - at(b.id));
  // Defensive cap at render time too, not just when a widget is newly
  // assigned — a widget added to the registry before caps existed, or a
  // state migrated before this fix, could otherwise carry more than
  // DOCK_CAPS[loc] entries. Anything past the cap simply doesn't render in
  // that dock; it's still reachable any time via the app tray.
  const cap = DOCK_CAPS[loc];
  return cap ? list.slice(0, cap) : list;
}
function placementCount(loc){ return widgetsFor(loc).length; }

function ensureDockPlacement(){
  const noneAssignedYet = Object.keys(state.dockPlacement).length === 0;
  let changed = false;
  // Track how many widgets have already landed in each capped dock so the
  // very first automatic assignment respects DOCK_CAPS too, instead of
  // splitting every non-bottom widget 50/50 into left/right regardless of
  // their 5-widget caps.
  const counts = { bottom:0, left:0, right:0, top:0 };
  WIDGETS.forEach(w=>{
    const p = state.dockPlacement[w.id];
    if(p && counts[p] !== undefined) counts[p]++;
  });
  let sideToggle = 0;
  WIDGETS.forEach(w=>{
    if(state.dockPlacement[w.id]) return; // already placed
    if(isOff(w.id)){ state.dockPlacement[w.id] = 'hidden'; wprefs.parked[w.id] = 1; changed = true; return; }   // deactivated: don't spend a dock slot on it
    let target;
    if(noneAssignedYet){
      // First run migrating from the old single bottom-dock build: keep
      // every widget reachable — fill the bottom dock first (up to its own
      // cap), then alternate into the left/right drawers up to their caps.
      // Anything left over once every capped dock is full goes to 'hidden' —
      // still reachable any time via the app tray.
      if(state.dockVisible[w.id] === false){
        target = 'hidden';
      } else if(counts.bottom < DOCK_CAPS.bottom){
        target = 'bottom';
      } else {
        const trySide = (sideToggle % 2 === 0) ? 'left' : 'right';
        const otherSide = trySide === 'left' ? 'right' : 'left';
        if(counts[trySide] < DOCK_CAPS[trySide]) target = trySide;
        else if(counts[otherSide] < DOCK_CAPS[otherSide]) target = otherSide;
        else target = 'hidden';
        sideToggle++;
      }
    } else {
      // A widget added to the registry later than the user's saved state.
      target = 'hidden';
      if(w.id === 'classbuilder' || w.id === 'rewardpoints'){ const d = ['bottom', 'left', 'right'].find(k => counts[k] < DOCK_CAPS[k]); if(d) target = d; }   // Class Builder (v0.19.0) and Reward Points (v0.21.0) take a free dock slot on upgrade
    }
    state.dockPlacement[w.id] = target;
    counts[target] = (counts[target] || 0) + 1;
    changed = true;
  });
  if(changed){ saveState(); saveWprefs(); }
}

function makeDockButton(w){
  const btn = document.createElement('button');
  btn.className = 'dock-item' + (state.active[w.id] ? ' active' : '');
  btn.dataset.id = w.id;
  btn.innerHTML = `<span class="dock-ic">${iconSvg(w.icon)}</span><span data-i18n-widget-label="${w.labelKey}">${widgetLabel(w.labelKey)}</span>`;
  btn.addEventListener('click', ()=> toggleWidget(w.id));
  return btn;
}

function buildDock(){
  dock.innerHTML = '';
  widgetsFor('bottom').forEach(w=> dock.appendChild(makeDockButton(w)));
  // Settings used to live here as the last bottom-dock item; it now lives in
  // the top pill row (see SETTINGS_PILL / buildTopDock()) instead.
  dock.classList.toggle('hover-collapsible', !!(ENTERPRISE_FEATURES && state.hoverOpen));
  applyDockAutoHide();
}

// Bottom dock only (the edge drawers' hover-open stays an enterprise option). The tab
// on the dock's top edge stays as the handle: .auto-hide on #dock-wrap slides the whole
// unit down until only the tab shows; hovering it (or focusing a dock button) reveals the dock.
function applyDockAutoHide(){
  const w = document.getElementById('dock-wrap');
  if(w) w.classList.toggle('auto-hide', !!state.dockAutoHide);
}

/* ---------------- Layout modes ----------------
   Compact/Cozy are presets that decide dock *visibility* for the
   left/right drawers automatically; Custom hands that decision back to the
   per-drawer toggles in Settings. None of this touches state.dockPlacement —
   a widget's assigned dock is unchanged, only whether that dock is shown.
   They also decide whether widget emoji icons show (Compact: hidden, Cozy:
   shown); in Custom mode that's instead controlled by the separate
   "Show emoji icons" checkbox (state.showEmojisCustom). */
const LAYOUT_MODES = ['compact','cozy','custom'];

function effectiveSideVisible(side){ // 'left' | 'right'
  if(state.layoutMode === 'compact') return false;
  if(state.layoutMode === 'cozy') return true;
  return state.edgeDock[side].visible;
}

function emojisVisible(){
  if(state.layoutMode === 'compact') return false;
  if(state.layoutMode === 'cozy') return true;
  return !!state.showEmojisCustom;
}

// Strips one leading emoji (plus any joiner/variation-selector codepoints
// that are part of the same glyph, e.g. "🧑‍🎓" or "⏱️") and the space after
// it, so a widget label like "📅 Calendar" becomes "Calendar". No-op on a
// label with no leading emoji, and on the non-English strings, which were
// never given emoji prefixes in the first place.
function stripLeadingEmoji(s){
  return String(s).replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '');
}

// The one place that decides whether a widget's on-screen label carries its
// emoji — used everywhere a widget name is shown (dock buttons, the app
// tray, an open widget's title bar) instead of calling t() directly.
function widgetLabel(key){
  const s = t(key);
  return emojisVisible() ? s : stripLeadingEmoji(s);
}

function buildSideDock(side){ // 'left' | 'right'
  const wrapper = document.getElementById(`dock-${side}`);
  const box = document.getElementById(`dock-${side}-items`);
  box.innerHTML = '';
  widgetsFor(side).forEach(w=> box.appendChild(makeDockButton(w)));
  wrapper.hidden = !effectiveSideVisible(side);
  wrapper.classList.toggle('hover-collapsible', !!(ENTERPRISE_FEATURES && state.hoverOpen));
}

function buildLayoutModeSelector(){
  const grid = document.getElementById('layout-mode-grid');
  if(!grid) return;
  grid.innerHTML = '';
  LAYOUT_MODES.forEach(mode=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layout-mode-opt' + (state.layoutMode === mode ? ' active' : '');
    btn.dataset.mode = mode;
    btn.innerHTML = `
      <span class="layout-mode-name" data-i18n="layout_mode_${mode}">${t('layout_mode_'+mode)}</span>
      <span class="layout-mode-desc" data-i18n="layout_mode_${mode}_desc">${t('layout_mode_'+mode+'_desc')}</span>
    `;
    btn.addEventListener('click', ()=>{
      if(state.layoutMode === mode) return;
      state.layoutMode = mode;
      saveState();
      rebuildAllDocks();
      buildLayoutModeSelector();
      buildDrawerSettings();
      buildDockPlacementList();
      buildEmojiToggle();
      localizeNode(document); // refreshes already-open widgets' title-bar labels
    });
    grid.appendChild(btn);
  });
}

function buildEmojiToggle(){
  const chk = document.getElementById('show-emojis-toggle');
  if(!chk) return;
  const locked = state.layoutMode !== 'custom';
  chk.checked = emojisVisible();
  chk.disabled = locked;
  chk.closest('.switch-row').classList.toggle('locked', locked);
  const lockHint = document.getElementById('emoji-lock-hint');
  if(lockHint) lockHint.hidden = !locked;
  chk.onchange = e=>{
    state.showEmojisCustom = e.target.checked;
    saveState();
    rebuildAllDocks();
    localizeNode(document);
  };
}

/* ---------------- App tray (Android-style "show every widget" sheet) ----------------
   Independent of layout mode and dockPlacement — always lists every widget
   in WIDGETS, so it's the one guaranteed way to reach a widget whose dock
   is currently hidden (e.g. everything but the bottom dock in Compact mode). */
function makeAppTrayButton(w){
  const btn = document.createElement('button');
  btn.className = 'app-tray-item' + (state.active[w.id] ? ' active' : '');
  btn.dataset.id = w.id;
  btn.innerHTML = `<span class="dock-ic">${iconSvg(w.icon)}</span><span data-i18n-widget-label="${w.labelKey}">${widgetLabel(w.labelKey)}</span>`;
  btn.addEventListener('click', ()=> toggleWidget(w.id));
  return btn;
}

const CATEGORIES = [
  { id:'time', labelKey:'cat_time' },
  { id:'media', labelKey:'cat_media' },
  { id:'tools', labelKey:'cat_tools' },
  { id:'language', labelKey:'cat_language' },
  { id:'cloud', labelKey:'cat_cloud' }
];
if(UNI) CATEGORIES.unshift({ id:'course', labelKey:'cat_course' });   // UniDeck: LectureDeck's Course mode widgets come first
if(UNI) WIDGET_TIERS.core.push(...UNI_WIDGET_DEFS.map(w => w.id));
function buildAppTray(){
  const grid = document.getElementById('app-tray-grid');
  if(!grid) return;
  grid.innerHTML = '';
  CATEGORIES.forEach(c=>{
    const ws = WIDGETS.filter(w=> w.cat === c.id && !isOff(w.id));
    if(!ws.length) return;
    const h = document.createElement('p');
    h.className = 'app-tray-cat';
    h.dataset.i18n = c.labelKey;
    h.textContent = t(c.labelKey);
    grid.appendChild(h);
    ws.forEach(w=> grid.appendChild(makeAppTrayButton(w)));
  });
  WIDGETS.filter(w=> !isOff(w.id) && !CATEGORIES.some(c=> c.id === w.cat)).forEach(w=> grid.appendChild(makeAppTrayButton(w)));   // safety net: a widget with no category still shows
  const mb = document.createElement('button'); mb.type = 'button'; mb.className = 'app-tray-manage'; mb.textContent = t('wm_open');
  mb.addEventListener('click', ()=>{ closeAppTray(); openWidgetManager(); }); grid.appendChild(mb);
}

function openAppTray(){
  const backdrop = document.getElementById('app-tray-backdrop');
  const tab = document.getElementById('app-tray-tab');
  if(!backdrop || !tab) return;
  backdrop.hidden = false;
  tab.classList.add('open');
  tab.setAttribute('aria-expanded','true');
}
function closeAppTray(){
  const backdrop = document.getElementById('app-tray-backdrop');
  const tab = document.getElementById('app-tray-tab');
  if(!backdrop || !tab) return;
  backdrop.hidden = true;
  tab.classList.remove('open');
  tab.setAttribute('aria-expanded','false');
}
function wireAppTray(){
  const tab = document.getElementById('app-tray-tab');
  const backdrop = document.getElementById('app-tray-backdrop');
  const handle = document.getElementById('app-tray-handle');
  if(!tab || !backdrop || !handle) return;
  tab.addEventListener('click', ()=>{ backdrop.hidden ? openAppTray() : closeAppTray(); });
  handle.addEventListener('click', closeAppTray);
  backdrop.addEventListener('click', e=>{ if(e.target === backdrop) closeAppTray(); });
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && !backdrop.hidden) closeAppTray(); });
}

function makeTopDockButton(w){
  // Icon-only (no label) so it fits the header's height; the widget name
  // shows as a tooltip/aria-label instead. Recreated fresh on every rebuild —
  // unlike the pill drawer, these buttons carry no state of their own, so
  // there's no risk of the "moved singleton" bug that hit the lang/theme pills.
  const btn = document.createElement('button');
  btn.className = 'dock-top-item' + (state.active[w.id] ? ' active' : '');
  btn.dataset.id = w.id;
  btn.title = t(w.labelKey);
  btn.setAttribute('aria-label', t(w.labelKey));
  btn.innerHTML = iconSvg(w.icon);
  btn.addEventListener('click', ()=> toggleWidget(w.id));
  return btn;
}

function buildTopWidgetDock(){
  const box = document.getElementById('dock-top-widgets');
  box.innerHTML = '';
  widgetsFor('top').forEach(w=> box.appendChild(makeTopDockButton(w)));
}

/* ---------------- Top pill drawer (translate / theme / future toggles) ----------------
   A single left-justified row, capped at 5 slots — anchored to the top-right
   so it never sits over the brand mark on the left. ---------------- */
const PILL_CAP = 5;
const PILLS = [
  { id:'classes', el: ()=> document.getElementById('class-pill-wrap') },
  { id:'lang', el: ()=> document.getElementById('lang-toggle') },
  { id:'theme', el: ()=> document.getElementById('btn-theme') },
  { id:'mode', el: ()=> document.getElementById('mode-toggle') }    // Light / Dark: last pill, so it sits just left of Settings as in every suite app
];
// Settings pill: always shown, always last (far right) in whichever row the
// pills currently live in. Deliberately kept out of PILLS/pillsInTop() so it
// can't be capped out by PILL_CAP or reassigned to 'hidden' from the "Top bar
// pills" picker — Settings needs to always be reachable.
const SETTINGS_PILL = { el: ()=> document.getElementById('btn-settings') };
function pillsInTop(){
  return PILLS.filter(p => (state.pillPlacement[p.id] || 'top') === 'top').slice(0, PILL_CAP);
}

function buildTopDock(){
  // IMPORTANT: the language-toggle and theme-button elements are singletons
  // (they carry their own live click handlers/state) that get *moved* between
  // the header and this drawer, never recreated. Never clear their container
  // with innerHTML — that destroys the actual nodes, and every getElementById
  // lookup after that returns null, permanently disappearing the pills. Just
  // appendChild() each one to wherever it belongs; appendChild moves a node
  // that's already in the document rather than duplicating it.
  const wrapper = document.getElementById('dock-top');
  const box = document.getElementById('pills-top');
  const topActions = document.querySelector('.top-actions');

  const settingsEl = SETTINGS_PILL.el();

  if(!state.edgeDock.top.visible){
    wrapper.hidden = true;
    PILLS.forEach(p=>{ const el = p.el(); if(el) topActions.appendChild(el); });
    if(settingsEl) topActions.appendChild(settingsEl); // appended last = rightmost
    buildClassPill();
    return;
  }
  wrapper.hidden = false;
  wrapper.classList.toggle('hover-collapsible', !!(ENTERPRISE_FEATURES && state.hoverOpen));
  const inTop = new Set(pillsInTop().map(p=> p.id));
  PILLS.forEach(p=>{
    const el = p.el();
    if(!el) return;
    if(inTop.has(p.id)) box.appendChild(el);
    else topActions.appendChild(el); // placed 'hidden' — still needs a home in the DOM
  });
  if(settingsEl) box.appendChild(settingsEl); // appended last = rightmost in the pill row
  buildClassPill(); // the class pill may have just moved rows — re-side its menu
}

function rebuildAllDocks(){
  buildDock();
  buildSideDock('left');
  buildSideDock('right');
  buildTopWidgetDock();
  buildTopDock();
  buildAppTray();
  updateWmSummary();
}

const PLACEMENT_OPTIONS = ['bottom','left','right','top','hidden'];

function buildDockPlacementList(){
  const box = document.getElementById('dock-vis-list');
  box.innerHTML = '';
  // Placing icons works in every layout mode (v0.42.0), as dragging them does: the mode only decides which docks are shown
  const lockHint = document.getElementById('dock-buttons-lock-hint');
  if(lockHint) lockHint.hidden = true;
  WIDGETS.filter(w=> !isOff(w.id)).forEach(w=>{
    const row = document.createElement('div');
    row.className = 'dock-vis-row placement-row';
    row.innerHTML = `<span data-i18n="${w.labelKey}">${t(w.labelKey)}</span>`;
    const sel = document.createElement('select');
    PLACEMENT_OPTIONS.forEach(opt=>{
      const o = document.createElement('option');
      o.value = opt;
      o.setAttribute('data-i18n', 'placement_'+opt);
      o.textContent = t('placement_'+opt);
      sel.appendChild(o);
    });
    sel.value = state.dockPlacement[w.id] || 'hidden';
    sel.addEventListener('change', ()=>{
      const target = sel.value;
      if(target !== 'hidden' && placementCount(target) >= DOCK_CAPS[target]){
        toast(t('drawer_full_toast', { side: t('placement_'+target), max: DOCK_CAPS[target] }));
        sel.value = state.dockPlacement[w.id] || 'hidden';
        return;
      }
      state.dockPlacement[w.id] = target;
      saveState();
      rebuildAllDocks();
    });
    row.appendChild(sel);
    box.appendChild(row);
  });
}

/* Dragging launchers (js/dockdrag.js): a dock icon to another place or dock, a tray icon onto a dock, a dock icon onto
   the tray tab (off the docks). The drag file checks the caps; this saves the move once, on drop, and rebuilds. */
function wireDockDrag(){
  if(!window.DockDrag) return;
  DockDrag.init({
    zones: { bottom:'#dock', left:'#dock-left-items', right:'#dock-right-items', top:'#dock-top-widgets' },
    item: '.dock-item[data-id], .dock-top-item[data-id]',
    caps: DOCK_CAPS,
    tray: { grid:'#app-tray-grid', item:'.app-tray-item[data-id]', tab:'#app-tray-tab, #dock .dk-tray-btn' },   // the floating and magnifying docks hide the tab and carry a tray button
    move(id, loc, ids){
      const from = state.dockPlacement[id];
      state.dockPlacement[id] = loc;
      if(from && from !== loc && state.dockOrder[from]) state.dockOrder[from] = state.dockOrder[from].filter(x => x !== id);
      if(ids) state.dockOrder[loc] = ids;
      saveState();
      rebuildAllDocks();
      buildDockPlacementList();
    },
    full(loc){ toast(t('drawer_full_toast', { side: t('placement_'+loc), max: DOCK_CAPS[loc] })); },
    closeTray: closeAppTray,
    openTray: openAppTray
  });
}

function buildDrawerSettings(){
  // NOTE: unlike buildDockPlacementList (which rebuilds fresh <select>
  // elements every call), these checkboxes/selects are static nodes from
  // index.html that this function now re-visits every time the layout mode
  // changes — so listeners are assigned via .onchange (idempotent) rather
  // than .addEventListener (which would stack a new handler on every call).
  const rcChk = document.getElementById('gdrive-remove-copy');
  if(rcChk){
    rcChk.checked = !!state.docViewer.removeCopyOnClose;
    rcChk.onchange = e=>{ state.docViewer.removeCopyOnClose = e.target.checked; saveState(); };
  }
  const delAll = document.getElementById('gdrive-delete-all');
  if(delAll) delAll.onclick = ()=> deleteConvertedFiles();
  const autoHideChk = document.getElementById('dock-autohide-toggle');
  if(autoHideChk){
    autoHideChk.checked = !!state.dockAutoHide;
    autoHideChk.onchange = e=>{ state.dockAutoHide = e.target.checked; saveState(); applyDockAutoHide(); };
  }
  const leftChk = document.getElementById('drawer-left-visible');
  const rightChk = document.getElementById('drawer-right-visible');
  const locked = state.layoutMode !== 'custom';
  // "Show top drawer" and "Open drawers on hover" were removed from the
  // settings menu (index.html) — state.edgeDock.top.visible / state.hoverOpen
  // still exist but are no longer user-editable from here.

  leftChk.checked = effectiveSideVisible('left');
  rightChk.checked = effectiveSideVisible('right');

  leftChk.disabled = locked;
  rightChk.disabled = locked;
  leftChk.closest('.switch-row').classList.toggle('locked', locked);
  rightChk.closest('.switch-row').classList.toggle('locked', locked);
  const lockHint = document.getElementById('drawers-lock-hint');
  if(lockHint) lockHint.hidden = !locked;

  leftChk.onchange = e=>{ state.edgeDock.left.visible = e.target.checked; saveState(); rebuildAllDocks(); };
  rightChk.onchange = e=>{ state.edgeDock.right.visible = e.target.checked; saveState(); rebuildAllDocks(); };

  const langSel = document.getElementById('pill-place-lang');
  const themeSel = document.getElementById('pill-place-theme');
  langSel.value = state.pillPlacement.lang || 'top';
  themeSel.value = state.pillPlacement.theme || 'top';
  const classSel = document.getElementById('pill-place-classes');
  classSel.value = state.pillPlacement.classes || 'top';
  const modeSel = document.getElementById('pill-place-mode');
  modeSel.value = state.pillPlacement.mode || 'top';
  [['classes', classSel], ['lang', langSel], ['theme', themeSel], ['mode', modeSel]].forEach(([id, sel])=>{
    sel.onchange = ()=>{
      const target = sel.value;
      if(target === 'top' && pillsInTop().length >= PILL_CAP && state.pillPlacement[id] !== 'top'){
        toast(t('drawer_full_toast', { side: t('pills_section'), max: PILL_CAP }));
        sel.value = state.pillPlacement[id] || 'top';
        return;
      }
      state.pillPlacement[id] = target;
      saveState();
      buildTopDock();
      buildClassPill();
    };
  });
}

/* Phase 1 (UI polish): text widgets grow with their window, like Instructions does. The widget's content is zoomed to the
   largest size at which it still fits (never smaller than today's 100%, at most 400%); more content than fits scrolls
   as before. The content sits in one .fit-wrap inside the body; a widget that redraws its body is re-wrapped. */
const AUTO_FIT = new Set(['checklist','calendar','announcements','agenda','idiomday','grammarref','convocards',
  'exitticket','hallpass','poll','readinglog','timer','stopwatch','countdown','dice']);
function attachAutoFit(id, body){
  if(!AUTO_FIT.has(id) || body._autoFit) return;
  let raf = 0, busy = false;
  function wrap(){
    const kids = [...body.childNodes];
    if(kids.length === 1 && kids[0].classList && kids[0].classList.contains('fit-wrap')) return kids[0];
    const w = document.createElement('div'); w.className = 'fit-wrap';
    kids.forEach(k=>w.appendChild(k));
    body.appendChild(w);
    return w;
  }
  function fit(){
    busy = true;
    const w = wrap();
    const cs = getComputedStyle(body);
    const availH = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const availW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if(availH <= 0 || availW <= 0 || body.closest('.minimized')){ busy = false; return; }
    const fits = z => { w.style.zoom = z; w.style.width = (availW / z) + 'px'; return w.scrollHeight * z <= availH + 1 && w.scrollWidth <= availW / z + 1; };
    let lo = 1, hi = 4;
    if(!fits(1)){ fits(1); busy = false; return; }   // too much content: 100% and scroll, as before
    if(fits(hi)) lo = hi;
    else for(let i = 0; i < 9; i++){ const mid = (lo + hi) / 2; if(fits(mid)) lo = mid; else hi = mid; }
    fits(Math.floor(lo * 100) / 100);
    busy = false;
  }
  const schedule = () => { if(busy) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(schedule) : null;
  if(ro) ro.observe(body);
  const mo = new MutationObserver(schedule);
  mo.observe(body, { childList:true, subtree:true, characterData:true });
  body.addEventListener('input', schedule);
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  body._autoFit = { schedule };
  schedule();
}

function rerenderWidget(id){
  const rec = widgetEls[id];
  if(!rec) return;
  const def = WIDGETS.find(w=>w.id===id);
  if(!def) return;
  if(typeof rec.cleanup === 'function') rec.cleanup();
  const body = rec.el.querySelector('.widget-body');
  body.innerHTML = '';
  rec.cleanup = def.render(body, { id, toast, preset: pfPreset(id) });
  attachAutoFit(id, body);
}

const CAL_SYSTEM_OPTIONS = [
  { value:'gregorian', key:'cal_sys_gregorian' },
  { value:'lunar', key:'cal_sys_lunar' },
  { value:'both', key:'cal_sys_both' }
];

function buildCalendarSystemSelect(){
  const sel = document.getElementById('calendar-system-select');
  sel.innerHTML = CAL_SYSTEM_OPTIONS.map(o=>`<option value="${o.value}" data-i18n="${o.key}">${t(o.key)}</option>`).join('');
  sel.value = state.calendarSystem;
  sel.addEventListener('change', ()=>{
    state.calendarSystem = sel.value;
    saveState();
    rerenderWidget('clock');
    rerenderWidget('calendar');
  });
}

function toggleWidget(id){
  if(isOff(id)){ const d = WIDGETS.find(w=>w.id===id); toast(t('wm_off_toast', { name:d ? widgetLabel(d.labelKey) : id }), 3600); return; }
  if(!state.active[id] && isProWidget(id) && !isPro()){
    openProModal(id);
    return;
  }
  if(state.active[id]){
    closeWidget(id);
  }else{
    openWidget(id);
    if(!KINDER){   // Kinder: no activity table and no usage statistics
      const od = dayRec(); od.opens = od.opens || {}; od.opens[id] = (od.opens[id] || 0) + 1; xSave();
      if(window.TDUsage) window.TDUsage.track('widget_open', { widget: id });
    }   // anonymous usage statistics (js/usage.js)
  }
  saveState();
  syncDock();
}
function syncDock(){
  document.querySelectorAll('.dock-item[data-id], .dock-top-item[data-id], .app-tray-item[data-id]').forEach(b=>{
    b.classList.toggle('active', !!state.active[b.dataset.id]);
  });
}

function openWidget(id){
  if(isOff(id)){ state.active[id] = false; return; }
  if(isProWidget(id) && !isPro()){ state.active[id] = false; return; }   // v0.21.3: also when a saved layout reopens it (the dock path shows the Pro dialog)
  const def = WIDGETS.find(w=>w.id===id);
  if(!def || widgetEls[id]) { state.active[id]=true; return; }
  state.active[id] = true;

  const layout = state.layout[id] || defaultLayout(def);
  state.layout[id] = layout;

  // Pinned widgets sit above the document stage. A widget opened while a
  // document is on screen is pinned automatically so it is never hidden behind it.
  const pinnedNow = !def.full && (!!layout.onTop || docStageOpen());
  if(pinnedNow) layout.onTop = true;
  const el = document.createElement('section');
  el.className = 'widget' + (def.full ? ' widget-full' : '') + (layout.minimized && !def.full ? ' minimized' : '') + (pinnedNow ? ' is-pinned' : '');
  el.dataset.onTop = pinnedNow ? '1' : '0';
  el.dataset.wid = id;   // which widget this is (js/bento.js: tile sizes and order on phones and tablets)
  el.classList.add('td-opening'); el.addEventListener('animationend', ()=> el.classList.remove('td-opening'), { once:true });   // polish phase 4
  if(!def.full){          // a full-screen widget is sized by CSS (.widget-full), not by a saved layout
    el.style.left = layout.x+'px';
    el.style.top = layout.y+'px';
    el.style.width = layout.w+'px';
    if(layout.h && !layout.minimized) el.style.height = layout.h+'px';
  }
  el.innerHTML = `
    <div class="widget-head">
      <button class="widget-drag" aria-label="${t('move_action')}" data-i18n-aria="move_action">${iconSvg('grip','wsvg')}</button>
      <span class="widget-title" data-i18n-widget-label="${def.labelKey}">${widgetLabel(def.labelKey)}</span>
      <div class="widget-head-actions">
        <button class="widget-pin" type="button" aria-pressed="${pinnedNow?'true':'false'}" data-i18n-aria-dyn data-key="${pinnedNow?'doc_pin_off':'doc_pin_on'}" aria-label="${t(pinnedNow?'doc_pin_off':'doc_pin_on')}" title="${t(pinnedNow?'doc_pin_off':'doc_pin_on')}">${iconSvg('pin','wsvg')}</button>
        <button class="widget-min" data-i18n-aria-dyn data-key="${layout.minimized ? 'restore_action' : 'minimize_action'}" aria-label="${t(layout.minimized ? 'restore_action' : 'minimize_action')}">${iconSvg(layout.minimized ? 'restore' : 'minimize','wsvg')}</button>
        <button class="widget-close" aria-label="${t('close')}" data-i18n-aria="close">${iconSvg('close','wsvg')}</button>
      </div>
    </div>
    <div class="widget-body"></div>
    <div class="widget-resize"><svg viewBox="0 0 14 14"><path d="M12 2L2 12M12 7L7 12M12 12h0" stroke="currentColor" stroke-width="1.4"/></svg></div>
  `;
  wall.appendChild(el);
  widgetEls[id] = { el, cleanup:null };
  // A widget you've just opened belongs on top. Without this it sat under any
  // panel that had already been clicked (those carry a z-index, a new one has
  // none), so its title-bar buttons could be unreachable behind another panel.
  bringToFront(el);

  makeDraggable(el, id);
  makeResizable(el, id);
  el.querySelector('.widget-close').addEventListener('click', ()=>{
    toggleWidget(id);
  });
  el.querySelector('.widget-min').addEventListener('click', ()=>{
    toggleMinimize(id);
  });
  el.querySelector('.widget-pin').addEventListener('click', ()=>{
    setPinned(id, el.dataset.onTop !== '1');
  });

  const body = el.querySelector('.widget-body');
  const cleanup = def.render(body, { id, toast, preset: pfPreset(id) });
  widgetEls[id].cleanup = cleanup;
  attachAutoFit(id, body);
}

function toggleMinimize(id){
  const rec = widgetEls[id];
  const layout = state.layout[id];
  if(!rec || !layout) return;
  const minBtn = rec.el.querySelector('.widget-min');
  if(!layout.minimized){
    layout.prevH = rec.el.offsetHeight;
    layout.minimized = true;
    rec.el.classList.add('minimized');
    rec.el.style.height = '';
  } else {
    layout.minimized = false;
    rec.el.classList.remove('minimized');
    rec.el.style.height = (layout.prevH || layout.h || 200) + 'px';
  }
  minBtn.innerHTML = iconSvg(layout.minimized ? 'restore' : 'minimize','wsvg');
  minBtn.dataset.key = layout.minimized ? 'restore_action' : 'minimize_action';
  minBtn.setAttribute('aria-label', t(minBtn.dataset.key));
  saveState();
}

function closeWidget(id){
  state.active[id] = false;
  const rec = widgetEls[id];
  if(rec){
    if(typeof rec.cleanup === 'function') rec.cleanup();
    rec.el.remove();
    delete widgetEls[id];
  }
}

function defaultLayout(def){
  const usedCount = Object.keys(state.layout).length;
  return {
    x: 24 + (usedCount % 4) * 40,
    y: 90 + (usedCount % 4) * 34,
    w: def.w, h: def.h
  };
}

/* ---------------- Drag + resize ----------------
   Dragging used to stop after a pixel or two: the pointerdown handler called
   wall.appendChild(el) to bring the panel to the front, which removes and
   re-inserts the node — and re-inserting the element holding the pointer
   capture makes the browser release that capture and fire pointercancel, so
   the drag ended immediately. Fixed by bringing panels forward with a z-index
   counter instead (no DOM move), tracking the gesture in one window-level
   handler so a lost capture can't strand it, and making the whole title bar
   draggable rather than just the small grip.
   ---------------------------------------------------------------- */
/* Two z-index bands share the wall with the document stage (see "Document
   stage" below): ordinary widgets live in 11..979, the stage sits at DOC_Z,
   and widgets the teacher has pinned ("keep on top of the document") live
   above it at DOC_Z+1 and up. Docks, drawers and dialogs are outside the wall
   and always stay above all of this. */
const DOC_Z = 1000;
let topZ = 10;               // last z handed out in the ordinary band
let topPinZ = DOC_Z;         // last z handed out in the pinned band
let docStage = null;         // built lazily by buildDocStage()
let docCur = null;           // the document currently on the stage, or null
function bringToFront(el){
  document.querySelectorAll('.widget.is-front').forEach(w=>{ if(w !== el) w.classList.remove('is-front'); });   // polish phase 4: css/polish.css
  el.classList.add('is-front');
  const pinned = el.dataset.onTop === '1';
  // Already the front-most panel in its band (typing in a widget re-clicks it
  // constantly): leave the counter alone instead of inflating it on every click.
  if(+el.style.zIndex && +el.style.zIndex === (pinned ? topPinZ : topZ)) return;
  el.style.zIndex = pinned ? ++topPinZ : ++topZ;
  // A New Tab page can stay open all day. Renumber the ordinary band in place
  // (no DOM moves, so pointer capture is untouched) before it could reach the stage.
  if(!pinned && topZ >= DOC_Z - 20) renormalizeZ(false);
}
function renormalizeZ(pinnedBand){
  const els = [...wall.querySelectorAll('.widget')]
    .filter(e => (e.dataset.onTop === '1') === pinnedBand)
    .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
  let z = pinnedBand ? DOC_Z : 10;
  els.forEach(e => { e.style.zIndex = ++z; });
  if(pinnedBand) topPinZ = z; else topZ = z;
}
function setPinned(id, on){
  const rec = widgetEls[id];
  if(!rec) return;
  const el = rec.el;
  el.dataset.onTop = on ? '1' : '0';
  el.classList.toggle('is-pinned', !!on);
  const b = el.querySelector('.widget-pin');
  if(b){
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.dataset.key = on ? 'doc_pin_off' : 'doc_pin_on';
    b.setAttribute('aria-label', t(b.dataset.key));
    b.title = t(b.dataset.key);
  }
  if(state.layout[id]) state.layout[id].onTop = !!on;
  el.style.zIndex = '';
  bringToFront(el);
  saveState();
}

// Moving and resizing go through js/winmove.js, one file in all four apps (cleanup Phase 2): one press at a time,
// followed on the whole window, so closing a widget can't leave handlers behind and a lost capture can't strand a drag.
const docShield = on => { if(docStage) docStage.el.classList.toggle('shielded', on); };   // an iframe would swallow the pointer mid-drag

function makeDraggable(el, id){
  WinMove.attach({ el, handle: el.querySelector('.widget-head'), kind: 'move',
    skip: e => !!e.target.closest('.widget-head-actions') || el.classList.contains('widget-full'),   // the buttons stay clickable; full-screen widgets don't move
    bounds: WinMove.wallBounds(wall),
    start: () => { bringToFront(el); el.classList.add('dragging'); docShield(true); },
    // offsetLeft/Top are relative to the wall, the same frame the saved left/top are written in
    end: () => { el.classList.remove('dragging'); docShield(false); const L = state.layout[id]; if(L){ L.x = el.offsetLeft; L.y = el.offsetTop; saveState(); } } });
  // Touching a panel anywhere raises it, so the one you're using sits on top.
  el.addEventListener('pointerdown', ()=> bringToFront(el));
}

function makeResizable(el, id){
  WinMove.attach({ el, handle: el.querySelector('.widget-resize'), kind: 'size', minW: 180, minH: 140,
    start: () => { bringToFront(el); docShield(true); },
    end: () => { docShield(false); const L = state.layout[id]; if(L){ L.w = el.offsetWidth; L.h = el.offsetHeight; saveState(); } } });
}

