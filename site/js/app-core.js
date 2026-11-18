/* =========================================================
   TeachersDeck — core shell
   Storage model:
     localStorage  -> small state (layout, active widgets, theme id, roster, checklist)
     IndexedDB     -> larger blobs (uploaded files, custom background/logo images), db name "TeachersDeck"
   ========================================================= */

const LS_KEY = 'ww_state_v1';

/* Platform builds — TeachersDeck for ClassIn and TeachersDeck for Canvas (PLATFORMS.md). tools/build_platform.py puts
   the platform's own js/platform.js first on the page, and that file sets window.TD_PLATFORM. The extension, the web
   version and UniDeck have no such file, so PF is null there and every "platform:" hook in this file does nothing. */
const PF = window.TD_PLATFORM || null;
const pfPreset = id => (PF && PF.presetFor) ? PF.presetFor(id) : null;   // a ClassIn link's preset for this widget, or null

// Feature flag for enterprise-tier-only UI (school/company logo upload,
// "open drawers on hover"). Off for now — hidden from index.html and gated
// off here; flip to true (and restore the hidden markup) to re-enable.
const ENTERPRISE_FEATURES = false;

/* ---------------- Classes (multiple independent decks) ----------------
   A teacher with several classes a day keeps one TeachersDeck per class.
   Each class has its OWN copy of everything that lives in `state` — roster,
   open widgets and their positions, theme/background, checklist, scoreboard,
   attendance, agenda, layout mode, language, dock placement, the lot — stored
   under its own localStorage key. Switching class reloads the page so the new
   class comes up as a clean instance (every widget re-inits from its own
   state) rather than trying to hot-swap 4,000 lines of live UI.

   Shared across all classes (deliberately — it's one teacher, one browser):
   the IndexedDB media library (files, games, music, videos, sounds), the
   school logo, and the Pro license. Background IMAGES are per class (each
   class stores its own image id in state.activeBgId).

   Key layout:
     td_classes_v1      -> { active:<id>, list:[{id,name}, ...] }  (the index)
     ww_state_v1        -> state for the first/default class (unchanged, so
                           anyone upgrading keeps their existing deck as-is)
     ww_state_v1::<id>  -> state for every class added after that
   ---------------------------------------------------------------- */
const CLASSES_KEY = 'td_classes_v1';
const DEFAULT_CLASS_ID = 'default';
const MAX_CLASSES = 12;

// The Pro license is ONE per teacher/browser, so it lives under its own key
// instead of inside each class's state. (Before v0.9.11 it was saved inside
// every class's state, so a new or switched class came up as Free.)
const LICENSE_LS_KEY = 'td_license_v1';
function readSharedLicense(){
  try{
    const l = JSON.parse(localStorage.getItem(LICENSE_LS_KEY));
    return (l && typeof l === 'object' && typeof l.key === 'string') ? l : null;
  }catch(e){ return null; }
}
function writeSharedLicense(l){
  try{ localStorage.setItem(LICENSE_LS_KEY, JSON.stringify(l)); }catch(e){ /* not persisted */ }
}
// Called once at startup, after `state` exists. Uses the shared license; if
// there isn't one yet (first launch of this build), adopts the best license
// found in any class's saved state — a Pro one beats a Free one, then the
// most recently checked wins — and writes it to the shared key.
function adoptSharedLicense(){
  let shared = readSharedLicense();
  if(!shared){
    let best = null;
    (classes.list || []).forEach(c=>{
      try{
        const st = JSON.parse(localStorage.getItem(classStateKey(c.id)));
        const l = st && st.license;
        if(!l || !l.key) return;
        if(!best || (l.pro && !best.pro) || (!!l.pro === !!best.pro && (l.lastCheck||0) > (best.lastCheck||0))) best = l;
      }catch(e){}
    });
    if(best){ shared = best; writeSharedLicense(shared); }
  }
  if(shared) state.license = shared;
}
function setLicense(l){
  state.license = l;
  writeSharedLicense(l);
  saveState();
  if(typeof TDWhiteboard !== 'undefined') TDWhiteboard.refreshTier();
}

function loadClasses(){
  let idx = null;
  try{ idx = JSON.parse(localStorage.getItem(CLASSES_KEY)); }catch(e){}
  if(!idx || !Array.isArray(idx.list) || !idx.list.length){
    // First run on this build: the deck that already exists becomes class one.
    idx = { active: DEFAULT_CLASS_ID, list: [{ id: DEFAULT_CLASS_ID, name: '' }] };
  }
  if(!idx.list.some(c=> c.id === idx.active)) idx.active = idx.list[0].id;
  return idx;
}
const classes = loadClasses();
function saveClasses(){
  try{ localStorage.setItem(CLASSES_KEY, JSON.stringify(classes)); }catch(e){ /* not persisted */ }
}
function activeClassId(){ return classes.active; }
function activeClass(){ return classes.list.find(c=> c.id === classes.active) || classes.list[0]; }
function classStateKey(id){ return id === DEFAULT_CLASS_ID ? LS_KEY : `${LS_KEY}::${id}`; }
// Per-class background image id, so each class can have its own photo while
// the ids stay stable. The default class keeps the historical 'background' id.
function bgIdForClass(){
  return activeClassId() === DEFAULT_CLASS_ID ? 'background' : `background::${activeClassId()}`;
}

const state = loadState() || {
  theme: 'dusk',
  dim: false,
  customBg: false,
  logo: false,
  active: {},           // widgetId -> true if open
  layout: {},           // widgetId -> {x,y,w,h}
  roster: ['Alex','Bao','Chen','Dara','Elif','Farid','Grace','Huy'],
  checklist: [
    { id: cid(), text: 'Warm-up: greet a partner in English', done: false },
    { id: cid(), text: 'Vocabulary review', done: false },
    { id: cid(), text: 'Pair reading activity', done: false }
  ],
  scoreboard: [
    { name:'Team One', score:0 },
    { name:'Team Two', score:0 },
    { name:'Team Three', score:0 },
    { name:'Team Four', score:0 }
  ],
  lang: (window.DECK_EDITION && window.DECK_EDITION.kinder) ? 'vi' : 'en',   // TinyTeachersDeck (the Kinder edition) starts in Vietnamese
  langPair: (window.DECK_EDITION && window.DECK_EDITION.kinder) ? ['vi','en'] : ['en','vi'],
  dockVisible: {},
  calendarEvents: [],
  notifsEnabled: false,
  calendarSystem: 'gregorian',
  poll: { question:'', options:[{id:cid(),text:'',votes:0},{id:cid(),text:'',votes:0}] },
  musicStream: { type:'', url:'' },
  videoStream: { type:'', url:'' },
  spotifyUrl: '',
  sfxVolume: 0.8,
  license: { key:'', pro:false },
  attendance: {},                     // 'YYYY-MM-DD' -> { studentName: 'present'|'absent'|'late' }
  groupMaker: { mode:'groups', count:4, size:4, lastKey:'' },
  exitTicket: { question:'', tallies:{ got_it:0, almost:0, need_help:0 } },
  agenda: { schedule:'', objective:'', doNow:'' },
  qrHistory: [],
  countdown: { label:'', date:'' },
  hallPass: { current:null, log:[] },   // current: {name, dest, start} | null
  readingLog: { minutes:15, entries:[] },
  ttsText: '',
  announcements: [],                  // { id, text, pinned, createdAt, expiresAt|null }
  instructionsBoard: { title:'', steps:[], current:0 },
  layoutMode: 'cozy',                  // 'compact' | 'cozy' | 'custom' — see LAYOUT_MODES below
  showEmojisCustom: true,              // whether widget emoji icons show while layoutMode === 'custom'
  cloudClassId: null                   // backend classId this local class is linked to, if any (see js/cloud.js)
};

// Fill in fields for anyone with a state saved before this field existed
if(!state.scoreboard){
  state.scoreboard = [
    { name:'Team One', score:0 },
    { name:'Team Two', score:0 },
    { name:'Team Three', score:0 },
    { name:'Team Four', score:0 }
  ];
}
if(!state.lang) state.lang = (window.DECK_EDITION && window.DECK_EDITION.kinder) ? 'vi' : 'en';
if(PF && PF.lang) state.lang = PF.lang;   // platform: ?lang= on a ClassIn link, or the Canvas launch's locale
document.documentElement.lang = state.lang;   // from the start, not only after a switch: js/bento.js and UniDeck's Course mode read it
if(!state.school) state.school = null;   // platform (Canvas): { schoolId, schoolName, pro }, kept by watchMySchool()
if(!state.langPair) state.langPair = (window.DECK_EDITION && window.DECK_EDITION.kinder) ? ['vi','en'] : ['en','vi'];
if(!state.dockVisible) state.dockVisible = {};
if(!state.calendarEvents) state.calendarEvents = [];
if(!state.assignments) state.assignments = [];   // Assignments widget — each entry also mirrors a linked event into state.calendarEvents (id `assign-<id>`), so the Calendar widget is the one canonical place due dates show up. Synced to classes/{id}/homework by TDCloud.syncHomework, same as the calendar is synced.
if(!state.progressReports) state.progressReports = [];   // Progress Reports widget — per-student, pushed straight to that one student's record in Firestore (TDCloud.sendProgressReport), unlike Assignments/Calendar which broadcast to the whole class. Each one also mirrors a run of future reminder dates into state.calendarEvents (ids `pr-<reportId>-<n>`) per its weekly/bi-weekly/monthly cadence, same "Calendar is canonical" pattern as Assignments.
if(!state.meetLink) state.meetLink = '';   // Google Meet widget — Phase 1: just a saved, reusable meeting link opened in a new tab (meet.google.com needs its own tab either way; the app can't host a Meet call inside an iframe). No API, no OAuth, no backend.
if(!state.lessonPlanner) state.lessonPlanner = {};   // Lesson Planner draft (filled in by lpEnsure)
if(!state.notifsEnabled) state.notifsEnabled = false;
if(!state.calendarSystem) state.calendarSystem = 'gregorian';
if(!state.poll) state.poll = { question:'', options:[{id:cid(),text:'',votes:0},{id:cid(),text:'',votes:0}] };
if(!state.musicStream) state.musicStream = { type:'', url:'' };
if(!state.videoStream) state.videoStream = { type:'', url:'' };
if(!state.spotifyUrl) state.spotifyUrl = '';
if(state.sfxVolume === undefined) state.sfxVolume = 0.8;
if(!state.license) state.license = { key:'', pro:false };
adoptSharedLicense();
if(typeof TD_DEMO !== 'undefined' && TD_DEMO.active) TD_DEMO.seed(state, classes);   // v0.15.3 — js/demo.js: a linked pretend cloud class, homework, calendar and open Cloud widgets
if(!state.edgeDock) state.edgeDock = { left:{visible:true}, right:{visible:true}, top:{visible:true} };
if(!state.edgeDock.left) state.edgeDock.left = { visible:true };
if(!state.edgeDock.right) state.edgeDock.right = { visible:true };
if(!state.edgeDock.top) state.edgeDock.top = { visible:true };
if(state.hoverOpen === undefined) state.hoverOpen = false;
if(state.dockAutoHide === undefined) state.dockAutoHide = false;
if(!state.docViewer) state.docViewer = { removeCopyOnClose:false };   // Office-to-Google: delete the Google copy when the document is closed   // bottom dock slides away, leaving only its tab; hover the tab to bring it back
if(!state.dockPlacement) state.dockPlacement = {}; // widgetId -> 'bottom' | 'left' | 'right' | 'hidden'
if(!state.dockOrder) state.dockOrder = {};         // dock -> [widgetId, …] in the order the teacher dragged them (js/dockdrag.js); widgets not listed follow in the usual order
if(!state.attendance) state.attendance = {};
if(!state.groupMaker) state.groupMaker = { mode:'groups', count:4, size:4, lastKey:'' };
if(!state.exitTicket) state.exitTicket = { question:'', tallies:{ got_it:0, almost:0, need_help:0 } };
if(!state.agenda) state.agenda = { schedule:'', objective:'', doNow:'' };
if(!state.qrHistory) state.qrHistory = [];
if(!state.countdown) state.countdown = { label:'', date:'' };
if(!state.hallPass) state.hallPass = { current:null, log:[] };
if(!state.readingLog) state.readingLog = { minutes:15, entries:[] };
if(state.ttsText === undefined) state.ttsText = '';
if(!state.announcements) state.announcements = [];
if(!state.instructionsBoard) state.instructionsBoard = { title:'', steps:[], current:0 };
if(!state.noiseMeter) state.noiseMeter = { style:'circle' };   // Noise Meter: 'circle' | 'vbar' | 'hbar'
if(state.cloudClassId === undefined) state.cloudClassId = null;
if(state.activeBgId === undefined) state.activeBgId = null;
if(state.acceptAdminTheme === undefined) state.acceptAdminTheme = true;   // v0.15.2: take the theme your school's AdminDeck pushes
if(!state.adminThemeSeen) state.adminThemeSeen = {};                      //   cloud classId -> version already applied
// Pre-v0.6.4 saves: a custom background existed only as state.customBg===true
// with a fixed idb id 'background' and nothing else pointing at it.
if(state.customBg === true && !state.activeBgId){
  state.activeBgId = 'background';
}
// v0.6.4 briefly stored a list of saved backgrounds (state.customBgList) —
// that gallery UI was reverted, but keep whichever one was last active
// (or the most recent upload) as the single current background rather than
// losing it, then drop the list.
if(Array.isArray(state.customBgList)){
  if(!state.activeBgId && state.customBgList.length){
    state.activeBgId = state.customBgList[state.customBgList.length - 1];
  }
  delete state.customBgList;
}
// Anyone with state saved before layout modes existed keeps their exact
// current dock/drawer setup untouched — migrate them to 'custom' rather than
// silently snapping them into 'cozy' (which would force both side
// drawers back on even if they'd deliberately turned one off). Brand-new
// installs get the 'cozy' default set in the state literal above.
if(!state.layoutMode) state.layoutMode = 'custom';
// v0.9.8 renamed the 'comfortable' preset to 'cozy' (label only — same
// behavior); migrate anyone who already had it saved under the old name.
if(state.layoutMode === 'comfortable') state.layoutMode = 'cozy';
if(state.showEmojisCustom === undefined) state.showEmojisCustom = true;
if(state.showXp === undefined) state.showXp = true;   // XP pill in the header (v0.14.0)
if(!state.pillPlacement) state.pillPlacement = { classes:'top', lang:'top', theme:'top' }; // pillId -> 'top' | 'hidden'
if(!state.pillPlacement.classes) state.pillPlacement.classes = 'top'; // added with the classes pill
Object.keys(state.pillPlacement).forEach(id=>{
  if(state.pillPlacement[id] !== 'hidden') state.pillPlacement[id] = 'top'; // collapse old topLeft/topRight values
});

/* Which app this is: this app's own js/edition.js (the first script on the page) sets window.DECK_EDITION — the app's
   name, its version and the edition. UNI = the university edition (UniDeck); U(schoolText, uniText) picks the wording
   for the current edition; APP = the app's name for anything shown to the user. This file is shared with UniDeck's copy
   of the app (teachersdeck/unideck, tools/sync_shared.py): edit it here, keep one-app-only behaviour behind UNI or U().
   KINDER = the Kinder edition (TinyTeachersDeck, teachersdeck/kinderdeck-suite, synced the same way): a classroom app for
   preschool teachers. It hides the school-age widgets, the XP system, Pro and Manage widgets; TeachersDeck never sets it. */
const ED = window.DECK_EDITION || { name: 'TeachersDeck', version: '0.0.0', uni: false };
const UNI = !!ED.uni, KINDER = !!ED.kinder, APP = ED.name || 'TeachersDeck', U = (school, uni) => (UNI ? uni : school);
const APP_VERSION = ED.version;

/* ---------------- Students with Vietnamese-format names (v0.19.0) ----------------
   state.students = [{ id, fam, mid, giv, en }] — family name (Họ), middle name (Tên đệm), given name (Tên) and an OPTIONAL English name.
   state.roster is still the plain list of names every other widget reads (Name Picker, Group Maker, Attendance, Hall Pass…); it is DERIVED from
   state.students by syncRoster() using the "show names as" choice (state.rosterNames: 'both' = "Nguyễn Văn An (Andy)", 'english', 'vietnamese').
   Attendance and Hall Pass remember students by that name, so renaming a student moves their records with them (renameStudentKeys). */
function splitVietnameseName(full){
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return { fam:'', mid:'', giv:'' };
  if(parts.length === 1) return { fam:'', mid:'', giv:parts[0] };
  return { fam:parts[0], mid:parts.slice(1, -1).join(' '), giv:parts[parts.length - 1] };
}
function parseStudentLine(line){     // "Nguyễn Văn An, Andy"  ·  "Nguyễn Văn An (Andy)"  ·  "Nguyễn Văn An - Andy"  ·  "Nguyễn Văn An"
  line = String(line || '').replace(/ {2,}/g, ' ').trim();
  if(!line) return null;
  let vi = line, en = '';
  let m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(line);
  if(m){ vi = m[1]; en = m[2]; }
  else{
    m = /^(.*?)\s*[,;\t|]\s*(.*)$/.exec(line) || /^(.*?)\s+-\s+(.*)$/.exec(line);
    if(m){ vi = m[1]; en = m[2]; }
  }
  vi = vi.trim(); en = en.trim();
  if(!vi && !en) return null;
  return { id:cid(), ...splitVietnameseName(vi), en };
}
const viFullName = s => [s.fam, s.mid, s.giv].map(x => String(x || '').trim()).filter(Boolean).join(' ');
function studentDisplay(s, mode){
  mode = mode || state.rosterNames || 'both';
  const vi = viFullName(s), en = String(s.en || '').trim();
  if(mode === 'english') return en || vi;
  if(mode === 'vietnamese' || !en) return vi || en;
  return `${vi} (${en})`;
}
function syncRoster(save){
  state.roster = state.students.map(s => studentDisplay(s)).filter(Boolean);
  if(save !== false) saveState();
}
function renameStudentKeys(map){     // oldDisplay -> newDisplay, for everything that remembers a student by name
  const keys = Object.keys(map).filter(k => map[k] && map[k] !== k);
  if(!keys.length) return;
  Object.keys(state.attendance || {}).forEach(d => {
    const day = state.attendance[d], out = {};
    Object.keys(day).forEach(k => { out[map[k] || k] = day[k]; });
    state.attendance[d] = out;
  });
  const hp = state.hallPass;
  if(hp){ (hp.log || []).forEach(e => { if(map[e.name]) e.name = map[e.name]; }); if(hp.current && map[hp.current.name]) hp.current.name = map[hp.current.name]; }
}
function mutateStudents(fn){         // change the student list, move their records if a display name changed, rebuild state.roster, save
  const before = new Map(state.students.map(s => [s.id, studentDisplay(s)]));
  fn();
  const map = {};
  state.students.forEach(s => { const o = before.get(s.id); if(o !== undefined){ const n = studentDisplay(s); if(n && o !== n) map[o] = n; } });
  renameStudentKeys(map);
  syncRoster(true);
  document.querySelectorAll('[data-i18n-count]').forEach(el => { el.textContent = t('roster_count', { n:state.roster.length }); });
}
const CB_SEED_PREFIX = 'td_seed_students::';
function ensureStudents(){           // once per start: take a freshly created class's students, or derive them from the old plain roster
  let seed = null;
  try{ const k = CB_SEED_PREFIX + activeClassId(), raw = localStorage.getItem(k); if(raw){ seed = JSON.parse(raw); localStorage.removeItem(k); } }catch(e){}
  if(Array.isArray(seed)) state.students = seed;
  if(!Array.isArray(state.students)) state.students = (state.roster || []).map(n => ({ id:cid(), ...splitVietnameseName(n), en:'' }));
  syncRoster(false);
}
if(!state.rosterNames) state.rosterNames = 'both';
ensureStudents();
if(!state.nhLayoutV21){ state.nhLayoutV21 = true; const nl = state.layout && state.layout.noteshome; if(nl && nl.w && nl.w < 640){ nl.w = 840; if(nl.h) nl.h = Math.max(nl.h, 600); if(nl.x) nl.x = Math.max(0, Math.min(nl.x, innerWidth - 860)); } }   // v0.21.0: Notes Home is two panes now

/* =========================================================
   TeachersDeck Pro — licensing & payment config
   -----------------------------------------------------------------
   Pro is unlocked with a license key that is checked against a
   Cloud Functions backend (not part of this package), not just a
   client-side formula. Each key
   binds to one device on first activation — activateLicense on the
   server rejects a second, different device trying the same key —
   which is what stops a key being handed on to someone else. Voiding
   a key in the admin tool also takes
   effect the next time that copy checks in (recheckLicenseIfNeeded,
   called on every app launch, throttled to once a day).

   validateLicenseKeyFormat() below is only an instant client-side
   shape check before bothering the server; the server alone decides
   whether a key is genuine.
   Licensing uses plain fetch(), not the Firebase SDK TDCloud/Cloud
   Class loads, so it keeps working even in the packed Chrome-extension
   build where that SDK load is blocked by Manifest V3's CSP.

   If the license backend hasn't been deployed yet (or the device is
   offline), a previously-activated key keeps working for up to
   LICENSE_OFFLINE_GRACE_MS before failing closed — see
   recheckLicenseIfNeeded().
   ========================================================= */
// v2.3.0: real subscription pricing (official pricing sheet). VND only; must equal the quote engine and the backend's
// payments.js PRICES (the server prices every order; these are only shown).
const PRO_PRICING_VND = { monthly: 120000, annual: 1050000, founding: 650000 };   // halved (owner, 18 Nov 2026)
// v0.41.0: paid by VietQR only, with a note token per order (createOrder). The bank account comes from the backend,
// so the order form, the HSBC constants and the Stripe/card link are gone.

// ---- Pro gate (v0.21.3) — the decided split; reasons in PRO-TIERS.md at the repository root ----
// PRO_GATE_ENABLED is THE switch. While it is false (testing / beta distribution) nothing is locked: every widget and
// every Pro feature (background photo, school logo, drawer customisation, Office full screen) is open, exactly as in the
// earlier testing mode. Set it to true at launch to require an activated licence. ?progate=1 in the address previews the
// gate on this device without changing it. Never gated: anything in the teacher → student → parent → admin loop.
const PRO_GATE_ENABLED = false;
const PRO_GATE = !KINDER && (PRO_GATE_ENABLED || new URLSearchParams(location.search).get('progate') === '1');   // Kinder: the school's licence unlocks everything
const PRO_WIDGETS_DECIDED = [
  'lessonplanner', 'games', 'scoreboard', 'poll', 'exitticket', 'groupmaker', 'noise', 'music', 'videoplayer', 'soundboard', 'meet',
  'qrcode', 'hallpass', 'readinglog', 'ttsreader', 'unitconverter', 'announcements', 'instructions', 'convocards', 'idiomday', 'grammarref',
  'drawdeck'   // decided 2026-10-24, per the DrawDeck scope doc's decision #1
];
const PRO_WIDGET_IDS = PRO_GATE ? PRO_WIDGETS_DECIDED : [];
function isPro(){ return !PRO_GATE || !!(state.license && state.license.pro) || !!(PF && PF.schoolPro && state.school && state.school.pro); }   // platform (Canvas): school-level Pro
function isProWidget(id){ return PRO_WIDGET_IDS.includes(id); }
// Floating dock icons are premium even while the Pro gate is off (owner, 18 Nov 2026): a real Pro licence (or the
// school's), or an owned dock style from the store. Everyone else has the standard dock.
function ownsFloatingDocks(){ return !!(state.license && state.license.pro) || !!(PF && PF.schoolPro && state.school && state.school.pro)
  || (typeof TD_STORE !== 'undefined' && typeof TD_STORE.has === 'function' && ['dock-float', 'dock-magnify', 'dock-sidebar', 'dock-circle', 'dock-radial'].some(s => TD_STORE.has(s))); }

// ---- License key format: TDPRO-AAAA-BBBB-CCCC ----------------------------
// A shape check only, so a mistyped key is rejected instantly without a round
// trip. It says nothing about whether a key is genuine: keys are minted and
// verified by the license backend (activateLicenseOnline below), which keeps the
// checksum rules server-side. Nothing in this file can produce a valid key.
function validateLicenseKeyFormat(key){
  if(!key) return false;
  return /^TDPRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key.trim().toUpperCase());
}

// ---- Export watermarking, tied to the active Pro license -----------------
// Every Pro-only export that produces a document a teacher could hand or
// forward to someone else (right now: the Lesson Planner's Word download)
// carries a short opaque token in the file's own metadata — never in the
// visible content — derived from the license key that unlocked it plus this
// device. It doesn't stop copying, and it isn't encryption; the point is
// purely traceability, the same spirit as activateLicense's one-key-one-
// device binding. If a filled-in template turns up being resold or shared
// well outside one classroom, the token in it can be matched back to a
// (key, device) pair by the license admin tool.
// Keep watermarkHash identical to the admin tool's copy or old exports
// stop matching.
const PRO_WATERMARK_SALT = 'teachersdeck-watermark-2026';
function watermarkHash(str){
  let h = 0;
  const s = PRO_WATERMARK_SALT + str;
  for(let i=0;i<s.length;i++){ h = ((h<<5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(36).toUpperCase().padStart(6,'0').slice(0,6);
}
// Stable for a given (license key, device) pair, so every export made from
// the same activated copy carries the same token — that repetition is what
// makes separately-leaked copies correlatable back to one source. Safe to
// call even when Pro isn't active (falls back to a device-only token) since
// nothing should rely on watermarking to gate access — isProWidget/isPro
// already do that; this only ever runs after that check has passed.
function exportWatermarkToken(){
  const key = (state.license && state.license.key) || 'UNLICENSED';
  return watermarkHash(`${key}::${deviceId()}`);
}
// v0.21.4: every export is watermarked the same way (js/watermark.js — the identical hash and salt as above).
if(window.Watermark) Watermark.configure({ identity: ()=> `${(state.license && state.license.key) || 'UNLICENSED'}::${deviceId()}` });
/* ---- Official-build check (anti-theft, v0.21.4) ----
   The extension ID comes from the manifest's "key" (dliphbbeinjlpcnpenllgaddihpkamcl), so a copy republished under another ID shows a notice and
   cannot activate Pro. The Chrome Web Store build runs as gemkljlgmnajlmdlcgdegpegaoiahaea (the store's own ID; its manifest has no "key"). Pages served
   outside an extension (demo/testing over http) are not checked. */
// UniDeck: LectureDeck runs this same file under its own extension ID, listed in its own js/edition.js (officialIds).
const OFFICIAL_IDS = ['dliphbbeinjlpcnpenllgaddihpkamcl', 'gemkljlgmnajlmdlcgdegpegaoiahaea', ...((ED && ED.officialIds) || [])];
function isOfficialBuild(){ try{ return !(window.chrome && chrome.runtime && chrome.runtime.id) || OFFICIAL_IDS.includes(chrome.runtime.id); }catch(e){ return true; } }
if(!isOfficialBuild()) document.addEventListener('DOMContentLoaded', ()=>{
  const n = document.createElement('div'); n.className = 'unofficial-build'; n.setAttribute('role', 'alert');
  n.textContent = `This copy of ${APP} is not an official build. Pro and licence activation are switched off. Please install the official version.`;
  document.body.prepend(n);
});


// ---- Online activation against the license Cloud Functions ---------------
const LICENSE_FN_REGION = 'us-central1';
function licenseFnBase(){
  if(window.TDBackend) return TDBackend.base();   // lights-on: backend.json says where the functions run
  const projectId = (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId) || '';
  if(!projectId) return null;
  return `https://${LICENSE_FN_REGION}-${projectId}.cloudfunctions.net`;
}
function deviceId(){
  let id;
  try{ id = localStorage.getItem('td_device_id'); }catch(e){}
  if(!id){
    id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
       : 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try{ localStorage.setItem('td_device_id', id); }catch(e){}
  }
  return id;
}
const LICENSE_RECHECK_MS = 24*60*60*1000;          // re-validate with the server at most once a day
const LICENSE_OFFLINE_GRACE_MS = 7*24*60*60*1000;  // trust a cached "valid" for up to 7 days without a round-trip

async function callLicenseFn(name, body){
  if(window.TDBackend) await TDBackend.ready;   // lights-on: the address backend.json names (js/backend.js)
  const base = licenseFnBase();
  if(!base) { const e = new Error('not-configured'); throw e; }
  let res;
  try{
    res = await fetch(`${base}/${name}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(body||{})
    });
  } catch(networkErr){
    const e = new Error('network'); throw e;
  }
  let data = {};
  try{ data = await res.json(); }catch(e){}
  if(!res.ok){
    const e = new Error(data.error || `HTTP ${res.status}`);
    e.status = res.status;
    e.code = data.code;
    throw e;
  }
  return data;
}

// Activates a key on THIS device. Resolves to { ok, reason } rather than
// throwing, so callers don't need try/catch for the expected failure cases.
async function activateLicenseOnline(rawKey){
  if(!isOfficialBuild()) return { ok:false, reason:'unofficial' };
  const key = (rawKey||'').trim().toUpperCase();
  if(!validateLicenseKeyFormat(key)) return { ok:false, reason:'format' };
  try{
    await callLicenseFn('activateLicense', { key, deviceId: deviceId() });
    setLicense({ key, pro:true, lastCheck: Date.now() });
    return { ok:true };
  } catch(e){
    if(e.message === 'not-configured') return { ok:false, reason:'not-configured' };
    if(e.message === 'network') return { ok:false, reason:'network' };
    if(e.status === 409) return { ok:false, reason:'device-mismatch' };
    if(e.status === 403) return { ok:false, reason: e.code === 'expired' ? 'expired' : 'revoked' };
    if(e.status === 404) return { ok:false, reason:'not-found' };
    return { ok:false, reason:'network' };
  }
}

// Re-validates the currently-active license with the server. Called once on
// every app launch (throttled to LICENSE_RECHECK_MS) so a key that gets
// Voided by the admin — or was activated elsewhere and this copy is
// the one that should lose access — actually gets deactivated here without
// the teacher doing anything. Fails closed if it's been offline too long.
async function recheckLicenseIfNeeded(){
  const lic = state.license;
  if(!lic || !lic.key || !lic.pro) return;
  if(lic.lastCheck && (Date.now() - lic.lastCheck) < LICENSE_RECHECK_MS) return;
  try{
    const data = await callLicenseFn('checkLicense', { key: lic.key, deviceId: deviceId() });
    if(data.valid){
      setLicense(Object.assign({}, state.license, { lastCheck: Date.now() }));
    } else {
      setLicense({ key: lic.key, pro:false });
      buildProStatus();
      toast(t(data.reason === 'expired' ? 'pro_license_expired' : 'pro_license_revoked'));
    }
  } catch(e){
    if(lic.lastCheck && (Date.now() - lic.lastCheck) > LICENSE_OFFLINE_GRACE_MS){
      setLicense({ key: lic.key, pro:false });
      buildProStatus();
    }
    // otherwise: offline/unreachable but still inside the grace window — stay Pro, try again next launch
  }
}

// Another tab (another class) activated, voided or re-checked the license.
window.addEventListener('storage', e=>{
  if(e.key !== LICENSE_LS_KEY) return;
  const l = readSharedLicense();
  if(l){ state.license = l; try{ buildProStatus(); }catch(err){} }
});

function cid(){ return Math.random().toString(36).slice(2,9); }

function loadState(){
  try{ return JSON.parse(localStorage.getItem(classStateKey(activeClassId()))); }catch(e){ return null; }
}
function saveState(){
  // Storage can be blocked (sandboxed/embedded preview, some private modes).
  // Don't let that throw and abort whatever the caller was about to do next
  // (e.g. applying a theme) — just keep running from memory.
  try{ localStorage.setItem(classStateKey(activeClassId()), JSON.stringify(state)); }catch(e){ /* not persisted */ }
  // Mirror the local calendar up to the linked cloud class, if any (no-op,
  // near-instantly, when nothing changed or no class is linked — see
  // TDCloud.syncCalendar in js/cloud.js). This is what lets StudentDeck and
  // ParentDeck see a teacher's calendar events.
  // Kinder (TinyTeachersDeck): no Cloud Class, no StudentDeck — the calendar stays on this device, and families get the
  // class's news through Notices (classes/{id}/classNotices) instead.
  if(!KINDER && typeof TDCloud !== 'undefined' && state.cloudClassId){
    TDCloud.syncCalendar(state.cloudClassId, state.calendarEvents);
    TDCloud.syncHomework(state.cloudClassId, state.assignments);
    // Progress Reports are NOT mirrored here — each one is sent once, straight to its one
    // student (TDCloud.sendProgressReport, called directly from the widget's submit handler),
    // not continuously re-synced like the class-wide calendar/homework lists above.
  }
}

