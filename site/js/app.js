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
  lang: 'en',
  langPair: ['en','vi'],
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
if(!state.lang) state.lang = 'en';
if(PF && PF.lang) state.lang = PF.lang;   // platform: ?lang= on a ClassIn link, or the Canvas launch's locale
if(!state.school) state.school = null;   // platform (Canvas): { schoolId, schoolName, pro }, kept by watchMySchool()
if(!state.langPair) state.langPair = ['en','vi'];
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
   of the app (teachersdeck/unideck, tools/sync_shared.py): edit it here, keep one-app-only behaviour behind UNI or U(). */
const ED = window.DECK_EDITION || { name: 'TeachersDeck', version: '0.0.0', uni: false };
const UNI = !!ED.uni, APP = ED.name || 'TeachersDeck', U = (school, uni) => (UNI ? uni : school);
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
// Customers fill this out first.
const ORDER_FORM_URL = 'https://forms.gle/SGUgGpgLyEjNu5iS8';
// v2.3.0: real subscription pricing (official pricing sheet). VND-only — the old one-time
// PRO_PRICE_USD/PRO_PRICE_VND pair is gone; see backend/functions/src/license.js for the
// matching billingCycle/expiresAt fields this prices against.
const PRO_PRICING_VND = { monthly: 240000, annual: 2100000, founding: 1300000 };

// --- Payment method 1: HSBC VietQR (bank transfer, shown first) ---
// BETA BUILD: the account details below are intentionally blank, so the VietQR panel
// just says payments are switched off.
const HSBC_VIETQR_BIN = '458761';      // HSBC Vietnam's NAPAS bank BIN (public info; verify at vietqr.io)
const HSBC_ACCOUNT_NUMBER = '';
const HSBC_ACCOUNT_NAME = '';
const HSBC_BANK_NAME = 'HSBC Vietnam';
const HSBC_ACCOUNT_NUMBER_DISPLAY = '';
const HSBC_SWIFT_CODE = '';
const HSBC_BRANCH_ADDRESS = '';

// --- Payment method 2: Stripe (card), or swap for another Asian processor ---
// Easiest no-backend option: create a Stripe "Payment Link" (dashboard.stripe.com/payment-links)
// for the Pro price and paste its URL here. Alternatives that also work without a
// backend: PayPal.me link, a Wise payment request link, or a 2Checkout/Xendit/
// PayerMax checkout link — anything that's just a URL can go in STRIPE_PAYMENT_LINK.
const STRIPE_PAYMENT_LINK = '';        // TODO: e.g. 'https://buy.stripe.com/xxxxxxxx'
const CARD_PROCESSOR_LABEL = 'Card (Stripe)'; // change if using a different processor

// ---- Pro gate (v0.21.3) — the decided split; reasons in PRO-TIERS.md at the repository root ----
// PRO_GATE_ENABLED is THE switch. While it is false (testing / beta distribution) nothing is locked: every widget and
// every Pro feature (background photo, school logo, drawer customisation, Office full screen) is open, exactly as in the
// earlier testing mode. Set it to true at launch to require an activated licence. ?progate=1 in the address previews the
// gate on this device without changing it. Never gated: anything in the teacher → student → parent → admin loop.
const PRO_GATE_ENABLED = false;
const PRO_GATE = PRO_GATE_ENABLED || new URLSearchParams(location.search).get('progate') === '1';
const PRO_WIDGETS_DECIDED = [
  'lessonplanner', 'games', 'scoreboard', 'poll', 'exitticket', 'groupmaker', 'noise', 'music', 'videoplayer', 'soundboard', 'meet',
  'qrcode', 'hallpass', 'readinglog', 'ttsreader', 'unitconverter', 'announcements', 'instructions', 'convocards', 'idiomday', 'grammarref',
  'drawdeck'   // decided 2026-10-24, per the DrawDeck scope doc's decision #1
];
const PRO_WIDGET_IDS = PRO_GATE ? PRO_WIDGETS_DECIDED : [];
function isPro(){ return !PRO_GATE || !!(state.license && state.license.pro) || !!(PF && PF.schoolPro && state.school && state.school.pro); }   // platform (Canvas): school-level Pro
function isProWidget(id){ return PRO_WIDGET_IDS.includes(id); }

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
   cannot activate Pro. Update OFFICIAL_IDS if the Chrome Web Store assigns a different ID when you publish. Pages served
   outside an extension (demo/testing over http) are not checked. */
// UniDeck: LectureDeck runs this same file under its own extension ID, listed in its own js/edition.js (officialIds).
const OFFICIAL_IDS = ['dliphbbeinjlpcnpenllgaddihpkamcl', ...((ED && ED.officialIds) || [])];
function isOfficialBuild(){ try{ return !(window.chrome && chrome.runtime && chrome.runtime.id) || OFFICIAL_IDS.includes(chrome.runtime.id); }catch(e){ return true; } }
if(!isOfficialBuild()) document.addEventListener('DOMContentLoaded', ()=>{
  const n = document.createElement('div'); n.className = 'unofficial-build'; n.setAttribute('role', 'alert');
  n.textContent = `This copy of ${APP} is not an official build. Pro and licence activation are switched off. Please install the official version.`;
  document.body.prepend(n);
});


// ---- Online activation against the license Cloud Functions ---------------
const LICENSE_FN_REGION = 'us-central1';
function licenseFnBase(){
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
  if(typeof TDCloud !== 'undefined' && state.cloudClassId){
    TDCloud.syncCalendar(state.cloudClassId, state.calendarEvents);
    TDCloud.syncHomework(state.cloudClassId, state.assignments);
    // Progress Reports are NOT mirrored here — each one is sent once, straight to its one
    // student (TDCloud.sendProgressReport, called directly from the widget's submit handler),
    // not continuously re-synced like the class-wide calendar/homework lists above.
  }
}

/* =========================================================
   Localization
   ========================================================= */
const LANGS = [
  { code:'en', name:'English' },
  { code:'vi', name:'Tiếng Việt' },
  { code:'es', name:'Español' },
  { code:'fr', name:'Français' },
  { code:'zh', name:'中文' },
  { code:'ja', name:'日本語' },
  { code:'ko', name:'한국어' },
  { code:'tl', name:'Tagalog' }
];
const LOCALE_MAP = { en:'en-US', vi:'vi-VN', es:'es-ES', fr:'fr-FR', zh:'zh-CN', ja:'ja-JP', ko:'ko-KR', tl:'fil-PH' };

const STRINGS = {
  clock:        { en:'⏰ Clock', vi:'Đồng hồ', es:'Reloj', fr:'Horloge', zh:'时钟', ja:'時計', ko:'시계', tl:'Orasan' },
  timer:        { en:'⏱️ Timer', vi:'Hẹn giờ', es:'Temporizador', fr:'Minuteur', zh:'计时器', ja:'タイマー', ko:'타이머', tl:'Timer' },
  stopwatch:    { en:'⏲️ Stopwatch', vi:'Bấm giờ', es:'Cronómetro', fr:'Chronomètre', zh:'秒表', ja:'ストップウォッチ', ko:'스톱워치', tl:'Stopwatch' },
  traffic:      { en:'🚦 Traffic Light', vi:'Đèn giao thông', es:'Semáforo', fr:'Feu tricolore', zh:'交通灯', ja:'信号機', ko:'신호등', tl:'Ilaw-trapiko' },
  dice:         { en:'🎲 Dice', vi:'Xúc xắc', es:'Dados', fr:'Dés', zh:'骰子', ja:'サイコロ', ko:'주사위', tl:'Dice' },
  checklist:    { en:'✅ Checklist', vi:'Danh sách việc', es:'Lista de tareas', fr:'Liste de tâches', zh:'清单', ja:'チェックリスト', ko:'체크리스트', tl:'Tsekliste' },
  namepicker:   { en:'🎯 Name Picker', vi:'Chọn tên học sinh', es:'Selector de nombres', fr:'Sélecteur de noms', zh:'随机点名', ja:'名前選び', ko:'이름 뽑기', tl:'Pumili ng Pangalan' },
  files:        { en:'📁 Files', vi:'Tệp tin', es:'Archivos', fr:'Fichiers', zh:'文件', ja:'ファイル', ko:'파일', tl:'Mga File' },
  games:        { en:'🎮 Games', vi:'Trò chơi', es:'Juegos', fr:'Jeux', zh:'游戏', ja:'ゲーム', ko:'게임', tl:'Mga Laro' },
  scoreboard:   { en:'🏆 Scoreboard', vi:'Bảng điểm', es:'Marcador', fr:'Tableau des scores', zh:'计分板', ja:'スコアボード', ko:'점수판', tl:'Scoreboard' },
  settings:     { en:'Settings', vi:'Cài đặt', es:'Configuración', fr:'Paramètres', zh:'设置', ja:'設定', ko:'설정', tl:'Mga Setting' },
  cloudclass:   { en:'☁️ Cloud Class' },
  cc_not_configured: { en:'Cloud Class isn\u2019t set up yet. A developer needs to fill in js/firebase-config.js with your Firebase project\u2019s config to turn this on.' },
  cc_signin:    { en:'🔑 Sign in with Google' },
  cc_wrong_account: { en:'That class isn\u2019t linked to this Google account \u2014 pick or create one below.' },
  cc_signed_in_as: { en:'👋 Signed in as {name}' },
  cc_sign_out:  { en:'Sign out' },
  cc_create_class: { en:'✨ Create a cloud class' },
  cc_class_name_ph: { en:'Class name' },
  cc_or_pick:   { en:'or pick one you already created:' },
  cc_student_code: { en:'🎓 Student join code' },
  cc_parent_code: { en:'👪 Parent join code' },
  cc_regenerate: { en:'🔄 Regenerate' },
  cc_copy:      { en:'📋 Copy' },
  cc_copied:    { en:'Copied {code}' },
  cc_copy_fail: { en:'Couldn\'t copy automatically — select the code and press Ctrl/⌘+C.' },
  cc_ranking_visibility: { en:'🏅 Ranking shown to students as' },
  cc_roster:    { en:'🧑‍🎓 Roster ({n} joined)' },
  cc_no_students: { en:'No students have joined with the class code yet.' },
  cc_remove_student: { en:'Remove student' },
  cc_remove_student_confirm: { en:'Remove {name} from the class? This deletes their Class Points, redeemed rewards history, notes sent home, parent links and synced XP — they\u2019d need to rejoin with the class code to come back.' },
  cc_dup_name_badge: { en:'possible duplicate' },
  cc_dup_name_hint: { en:'Two students are joined under the same name — likely one joined twice instead of resuming with their PIN. Check with them before removing one.' },
  cc_award_reason_ph: { en:'Reason (optional)' },
  cc_rewards:   { en:'🎁 Rewards catalog' },
  cc_reward_name_ph: { en:'Reward name' },
  cc_reward_cost_ph: { en:'Cost' },
  cc_add_reward: { en:'➕ Add reward' },
  cc_no_rewards: { en:'No rewards yet — add one above so students can redeem points for it! 🎉' },
  cc_pts:       { en:'⭐ pts' },
  cc_pick_reason: { en:'Quick reason…' },
  cc_merit_group: { en:'\ud83d\ude42 Merit' },
  cc_demerit_group: { en:'\ud83d\ude41 Demerit' },
  cc_custom_reason: { en:'\u270f\ufe0f Custom reason\u2026' },
  cc_reason_participation:    { en:'Participation' },
  cc_reason_helping:          { en:'Helping a classmate' },
  cc_reason_kindness:         { en:'Kindness' },
  cc_reason_great_work:       { en:'Great work' },
  cc_reason_late:             { en:'Late' },
  cc_reason_talking:          { en:'Talking' },
  cc_reason_not_listening:    { en:'Not listening' },
  cc_reason_not_participating:{ en:'Not participating' },
  cc_reason_fighting:         { en:'Fighting' },
  cc_sync_names:      { en:'\u21bb Copy names to Class list' },
  cc_sync_names_done: { en:'Added {n} name(s) to the Class list (Name Picker, Attendance, Group Maker, Hall Pass).' },
  cc_sync_names_none: { en:'Class list is already up to date.' },
  cc_sync_names_empty:{ en:'No students have joined yet — nothing to copy.' },

  theme_title:  { en:'Theme', vi:'Giao diện', es:'Tema', fr:'Thème', zh:'主题', ja:'テーマ', ko:'테마', tl:'Tema' },
  mode_title:   { en:'Mode', vi:'Chế độ', es:'Modo', fr:'Mode', zh:'模式', ja:'モード', ko:'모드', tl:'Mode' },
  mode_light:   { en:'Light', vi:'Sáng', es:'Claro', fr:'Clair', zh:'浅色', ja:'ライト', ko:'라이트', tl:'Maliwanag' },
  mode_dark:    { en:'Dark', vi:'Tối', es:'Oscuro', fr:'Sombre', zh:'深色', ja:'ダーク', ko:'다크', tl:'Madilim' },
  backgrounds:  { en:'Backgrounds', vi:'Hình nền', es:'Fondos', fr:'Arrière-plans', zh:'背景', ja:'背景', ko:'배경', tl:'Mga Background' },
  your_image:   { en:'Your image or logo', vi:'Hình ảnh hoặc logo của bạn', es:'Tu imagen o logo', fr:'Votre image ou logo', zh:'您的图片或标志', ja:'画像またはロゴ', ko:'이미지 또는 로고', tl:'Larawan o logo mo' },
  upload_bg:    { en:'Upload a background image', vi:'Tải lên hình nền', es:'Subir una imagen de fondo', fr:"Importer une image de fond", zh:'上传背景图片', ja:'背景画像をアップロード', ko:'배경 이미지 업로드', tl:'Mag-upload ng background na larawan' },
  upload_logo:  { en:'Upload a school / company logo', vi:'Tải lên logo trường / công ty', es:'Subir el logo de la escuela / empresa', fr:"Importer le logo de l'école / l'entreprise", zh:'上传学校/公司标志', ja:'学校・会社のロゴをアップロード', ko:'학교/회사 로고 업로드', tl:'Mag-upload ng logo ng paaralan / kumpanya' },
  remove_logo:  { en:'Remove logo', vi:'Xóa logo', es:'Quitar logo', fr:'Retirer le logo', zh:'移除标志', ja:'ロゴを削除', ko:'로고 제거', tl:'Alisin ang logo' },
  dim_bg:       { en:'Dim background (better contrast)', vi:'Làm tối nền (tăng độ tương phản)', es:'Oscurecer el fondo (mejor contraste)', fr:"Assombrir l'arrière-plan (meilleur contraste)", zh:'使背景变暗（提高对比度）', ja:'背景を暗くする（コントラスト向上）', ko:'배경 어둡게 하기 (대비 향상)', tl:'Padilimin ang background (mas magandang contrast)' },

  settings_title:  { en:'Settings', vi:'Cài đặt', es:'Configuración', fr:'Paramètres', zh:'设置', ja:'設定', ko:'설정', tl:'Mga Setting' },
  language_section:{ en:'Language', vi:'Ngôn ngữ', es:'Idioma', fr:'Langue', zh:'语言', ja:'言語', ko:'언어', tl:'Wika' },
  dock_buttons: { en:'Dock buttons', vi:'Nút trên thanh dock', es:'Botones del dock', fr:'Boutons du dock', zh:'底部工具栏按钮', ja:'ドックのボタン', ko:'독 버튼', tl:'Mga Button sa Dock' },
  dock_buttons_hint: { en:'Choose where each widget\u2019s launcher lives — bottom dock, a side drawer, or hidden', vi:'Chọn nơi hiển thị nút mở từng widget — thanh dock dưới, ngăn hai bên, hoặc ẩn' },
  placement_bottom: { en:'Bottom dock', vi:'Thanh dock dưới' },
  placement_left:   { en:'Left drawer', vi:'Ngăn bên trái' },
  placement_right:  { en:'Right drawer', vi:'Ngăn bên phải' },
  placement_top:    { en:'Top dock (5 max)', vi:'Thanh dock trên cùng (tối đa 5)' },
  placement_hidden: { en:'Hidden', vi:'Ẩn' },
  layout_mode_section: { en:'Layout mode', vi:'Chế độ bố cục' },
  layout_mode_hint: { en:'Choose how docks and the widget tray are arranged', vi:'Chọn cách sắp xếp các thanh dock và khay widget' },
  layout_mode_compact: { en:'Compact', vi:'Gọn' },
  layout_mode_compact_desc: { en:'Just the bottom dock — tap the arrow above it for an app tray with every widget', vi:'Chỉ có thanh dock dưới — chạm mũi tên phía trên để mở khay ứng dụng chứa mọi widget' },
  layout_mode_cozy: { en:'Cozy', vi:'Thoải mái' },
  layout_mode_cozy_desc: { en:'Bottom, left and right docks all shown', vi:'Hiện đầy đủ thanh dock dưới, trái và phải' },
  layout_mode_custom: { en:'Custom', vi:'Tùy chỉnh' },
  layout_mode_custom_desc: { en:'Pick each widget\u2019s dock and toggle drawers yourself', vi:'Tự chọn thanh dock cho từng widget và tự bật/tắt ngăn kéo' },
  layout_lock_hint: { en:'Set by the layout mode above — switch to Custom to control this yourself', vi:'Do chế độ bố cục ở trên quyết định — chuyển sang Tùy chỉnh để tự điều chỉnh' },
  app_tray_open: { en:'Open app tray', vi:'Mở khay ứng dụng' },
  // ---- Document stage + "keep on top" pin (v0.12.0)
  doc_show:        { en:'Show full screen', vi:'Hiển thị toàn màn hình' },
  doc_toolbar:     { en:'Document toolbar', vi:'Thanh công cụ tài liệu' },
  doc_pin_on:      { en:'Keep on top of the document', vi:'Giữ phía trên tài liệu' },
  doc_pin_off:     { en:'Stop keeping on top of the document', vi:'Bỏ giữ phía trên tài liệu' },
  doc_widgets_menu:{ en:'Widgets', vi:'Widget' },
  doc_widgets_hint:{ en:'Tick a widget to keep it on top of the document.', vi:'Đánh dấu widget để giữ nó phía trên tài liệu.' },
  doc_pin_all:     { en:'Pin all', vi:'Ghim tất cả' },
  doc_unpin_all:   { en:'Unpin all', vi:'Bỏ ghim tất cả' },
  doc_no_widgets:  { en:'No widgets are open. Open one from the dock and it will appear on top.', vi:'Chưa mở widget nào. Mở một widget từ thanh dock, nó sẽ hiện ở phía trên.' },
  doc_edit_google: { en:'Edit in Google', vi:'Chỉnh sửa trong Google' },
  doc_open_tab:    { en:'Open in tab', vi:'Mở trong tab' },
  doc_close:       { en:'Close document', vi:'Đóng tài liệu' },
  doc_collapse:    { en:'Hide toolbar', vi:'Ẩn thanh công cụ' },
  doc_expand:      { en:'Show toolbar', vi:'Hiện thanh công cụ' },
  doc_not_loading: { en:'Not loading? Open in a tab', vi:'Không tải được? Mở trong tab' },
  doc_fallback_msg:{ en:'Google may be refusing to show this inside TeachersDeck (you may not be signed in, or the link may not be shared with you). Open it in its own tab instead.', vi:'Google có thể không cho hiển thị tài liệu này trong TeachersDeck (có thể bạn chưa đăng nhập, hoặc liên kết chưa được chia sẻ). Hãy mở nó trong một tab riêng.' },
  doc_add_link:    { en:'Add Google link', vi:'Thêm liên kết Google' },
  doc_link_ph:     { en:'Paste a Google Docs, Slides, Sheets, Forms or Drive link', vi:'Dán liên kết Google Docs, Slides, Sheets, Forms hoặc Drive' },
  doc_name_ph:     { en:'Name (optional)', vi:'Tên (không bắt buộc)' },
  doc_link_invalid:{ en:'That doesn’t look like a Google Docs, Slides, Sheets, Forms or Drive link. (A Google Forms editor link can’t be shown; use the form’s send/preview link.)', vi:'Liên kết này có vẻ không phải từ Google Docs, Slides, Sheets, Forms hoặc Drive. (Liên kết chỉnh sửa Google Forms không hiển thị được; hãy dùng liên kết gửi/xem trước của biểu mẫu.)' },
  doc_link_added:  { en:'Google link added', vi:'Đã thêm liên kết Google' },
  doc_office_tab:  { en:'Office files can’t be shown full screen yet — opening it in a new tab.', vi:'Chưa thể hiển thị tệp Office toàn màn hình — đang mở trong tab mới.' },
  doc_pdf_error:   { en:'Couldn’t open that PDF here.', vi:'Không thể mở tệp PDF này tại đây.' },
  dock_autohide_label:{ en:'Hide the bottom dock until I hover its tab', vi:'Ẩn thanh dock phía dưới cho đến khi tôi rê chuột vào thẻ của nó' },
  dock_autohide_hint: { en:'The dock slides away and only its small tab stays at the bottom edge. Point at the tab (or press Tab to a dock button) to bring it back.', vi:'Thanh dock trượt xuống và chỉ còn lại thẻ nhỏ ở cạnh dưới. Rê chuột vào thẻ (hoặc nhấn Tab tới một nút dock) để hiện lại.' },
  // ---- Office files shown full screen via Google (v0.13.0, Pro)
  doc_converting:   { en:'Converting to a Google file\u2026 this takes a few seconds the first time.', vi:'Đang chuyển sang tệp Google\u2026 lần đầu sẽ mất vài giây.' },
  doc_cancel:       { en:'Cancel', vi:'Hủy' },
  doc_retry:        { en:'Try again', vi:'Thử lại' },
  doc_open_original:{ en:'Open the original in a tab', vi:'Mở tệp gốc trong tab' },
  doc_reconvert:    { en:'Re-convert', vi:'Chuyển đổi lại' },
  doc_office_not_set:{ en:'Showing Office files full screen needs a one-time Google setup that hasn\u2019t been done for this copy of TeachersDeck. Opening the file in a tab instead.', vi:'Hiển thị tệp Office toàn màn hình cần thiết lập Google một lần mà bản TeachersDeck này chưa có. Đang mở tệp trong tab.' },
  doc_err_signin:   { en:'Google sign-in didn\u2019t finish. Press Try again and allow access to the files TeachersDeck creates.', vi:'Chưa hoàn tất đăng nhập Google. Nhấn Thử lại và cho phép truy cập các tệp TeachersDeck tạo.' },
  doc_err_blocked:  { en:'Google refused. If this is a school account, your Google admin may have blocked this app. Ask them to allow this client ID: {id}', vi:'Google từ chối. Nếu đây là tài khoản trường, quản trị viên Google có thể đã chặn ứng dụng này. Hãy nhờ họ cho phép client ID: {id}' },
  doc_err_quota:    { en:'Your Google Drive is full, so the file couldn\u2019t be converted.', vi:'Google Drive của bạn đã đầy nên không thể chuyển đổi tệp.' },
  doc_err_large:    { en:'That file is too large for Google to convert.', vi:'Tệp này quá lớn để Google chuyển đổi.' },
  doc_err_network:  { en:'Couldn\u2019t reach Google. Check your connection and try again.', vi:'Không kết nối được với Google. Hãy kiểm tra mạng rồi thử lại.' },
  doc_err_failed:   { en:'Google couldn\u2019t convert this file.', vi:'Google không thể chuyển đổi tệp này.' },
  gdrive_section:   { en:'Google documents', vi:'Tài liệu Google' },
  gdrive_hint:      { en:'Word, PowerPoint and Excel files shown full screen are converted to Google Docs, Slides and Sheets in a \u201cTeachersDeck Converted\u201d folder in your Google Drive (Pro).', vi:'Tệp Word, PowerPoint và Excel hiển thị toàn màn hình được chuyển thành Google Docs, Slides và Sheets trong thư mục \u201cTeachersDeck Converted\u201d trên Google Drive của bạn (Pro).' },
  gdrive_remove_copy:{ en:'Remove the Google copy when I close the document', vi:'Xóa bản sao Google khi tôi đóng tài liệu' },
  gdrive_delete_all:{ en:'Delete converted files', vi:'Xóa các tệp đã chuyển đổi' },
  gdrive_deleted:   { en:'Moved {n} converted file(s) to the Google Drive trash.', vi:'Đã chuyển {n} tệp đã chuyển đổi vào thùng rác Google Drive.' },
  gdrive_none:      { en:'No converted files to delete.', vi:'Không có tệp đã chuyển đổi nào để xóa.' },
  app_tray_close: { en:'Close app tray', vi:'Đóng khay ứng dụng' },
  app_tray_title: { en:'All widgets', vi:'Tất cả widget' },
  drawers_section:  { en:'Side drawers', vi:'Ngăn hai bên' },
  drawer_left_visible_label:  { en:'Show left drawer', vi:'Hiện ngăn bên trái' },
  emoji_section: { en:'Widget icons', vi:'Biểu tượng widget' },
  show_emojis_label: { en:'Show emoji icons', vi:'Hiện biểu tượng cảm xúc' },
  drawer_right_visible_label: { en:'Show right drawer', vi:'Hiện ngăn bên phải' },
  drawer_top_visible_label:   { en:'Show top drawer', vi:'Hiện ngăn trên cùng' },
  drawer_hover_label: { en:'Open drawers on hover', vi:'Mở ngăn khi rê chuột tới mép màn hình' },
  drawer_hover_hint:  { en:'On: drawers tuck away to a thin edge strip and pop open when your mouse reaches that edge (bottom, top, left and right). Off: any drawer you\u2019ve made visible above just stays fully open.', vi:'Bật: các ngăn thu lại thành một dải mỏng ở mép màn hình và tự mở ra khi chuột chạm mép đó (trên, dưới, trái, phải). Tắt: ngăn nào đang hiện ở trên sẽ luôn mở rộng sẵn.' },
  drawer_full_toast: { en:'{side} is full ({max} max)', vi:'{side} đã đầy (tối đa {max})' },
  pills_section:      { en:'Top bar pills', vi:'Nút nhanh trên cùng' },
  pills_section_hint: { en:'Where the language switch, theme button and Light / Dark switch appear when the top drawer is on', vi:'Nơi hiển thị nút chuyển ngôn ngữ, nút giao diện và nút Sáng / Tối khi ngăn trên cùng đang mở' },
  pill_lang_label:  { en:'Language switch', vi:'Nút chuyển ngôn ngữ' },
  pill_theme_label: { en:'Theme button', vi:'Nút giao diện' },
  pill_mode_label: { en:'Light / Dark switch', vi:'Nút Sáng / Tối', es:'Interruptor Claro / Oscuro', fr:'Bouton Clair / Sombre', zh:'浅色 / 深色切换', ja:'ライト / ダーク切り替え', ko:'라이트 / 다크 전환', tl:'Switch ng Maliwanag / Madilim' },
  placement_shown: { en:'Shown', vi:'Hiện' },
  version_label: { en:'Version', vi:'Phiên bản' },
  quick_lang_1: { en:'Quick language 1', vi:'Ngôn ngữ nhanh 1', es:'Idioma rápido 1', fr:'Langue rapide 1', zh:'快捷语言 1', ja:'クイック言語 1', ko:'빠른 언어 1', tl:'Mabilis na wika 1' },
  quick_lang_2: { en:'Quick language 2', vi:'Ngôn ngữ nhanh 2', es:'Idioma rápido 2', fr:'Langue rapide 2', zh:'快捷语言 2', ja:'クイック言語 2', ko:'빠른 언어 2', tl:'Mabilis na wika 2' },
  roster_label: { en:'Class list (used by Name Picker)', vi:'Danh sách lớp (dùng cho Chọn tên học sinh)', es:'Lista de la clase (usada por el selector de nombres)', fr:'Liste de classe (utilisée par le sélecteur de noms)', zh:'班级名单（用于随机点名）', ja:'クラス名簿（名前選びで使用）', ko:'학급 명단 (이름 뽑기에 사용)', tl:'Listahan ng klase (ginagamit ng Pumili ng Pangalan)' },
  roster_placeholder:{ en:'One student name per line', vi:'Mỗi dòng một tên học sinh', es:'Un nombre de estudiante por línea', fr:"Un nom d'élève par ligne", zh:'每行一个学生姓名', ja:'1行に生徒の名前を1つ', ko:'한 줄에 학생 이름 하나씩', tl:'Isang pangalan ng estudyante bawat linya' },
  save_roster:  { en:'Save class list', vi:'Lưu danh sách lớp', es:'Guardar lista de la clase', fr:'Enregistrer la liste de classe', zh:'保存班级名单', ja:'クラス名簿を保存', ko:'학급 명단 저장', tl:'I-save ang listahan ng klase' },
  layout_label: { en:'Layout', vi:'Bố cục', es:'Diseño', fr:'Disposition', zh:'布局', ja:'レイアウト', ko:'레이아웃', tl:'Layout' },
  reset_layout: { en:'Reset widget positions', vi:'Đặt lại vị trí widget', es:'Restablecer posición de los widgets', fr:'Réinitialiser la position des widgets', zh:'重置小组件位置', ja:'ウィジェットの位置をリセット', ko:'위젯 위치 재설정', tl:'I-reset ang posisyon ng mga widget' },
  reset_all:    { en:'Reset everything', vi:'Đặt lại tất cả', es:'Restablecer todo', fr:'Tout réinitialiser', zh:'重置全部', ja:'すべてリセット', ko:'전체 재설정', tl:'I-reset lahat' },
  reset_all_confirm:{ en:'This clears widgets, theme, files and the class list on this device. Continue?', vi:'Thao tác này sẽ xóa widget, giao diện, tệp tin và danh sách lớp trên thiết bị này. Tiếp tục?', es:'Esto borrará los widgets, el tema, los archivos y la lista de la clase en este dispositivo. ¿Continuar?', fr:'Cela effacera les widgets, le thème, les fichiers et la liste de classe sur cet appareil. Continuer ?', zh:'此操作将清除本设备上的小组件、主题、文件和班级名单。是否继续？', ja:'この操作でウィジェット、テーマ、ファイル、クラス名簿がこの端末から削除されます。続行しますか？', ko:'이 기기의 위젯, 테마, 파일, 학급 명단이 모두 삭제됩니다. 계속할까요?', tl:'Buburahin nito ang mga widget, tema, file, at listahan ng klase sa device na ito. Magpatuloy?' },

  file_added:   { en:'File added — stored in this browser only', vi:'Đã thêm tệp — chỉ lưu trên trình duyệt này', es:'Archivo añadido — guardado solo en este navegador', fr:'Fichier ajouté — enregistré uniquement dans ce navigateur', zh:'已添加文件 — 仅保存在此浏览器中', ja:'ファイルを追加しました — このブラウザにのみ保存されます', ko:'파일이 추가되었습니다 — 이 브라우저에만 저장됨', tl:'Naidagdag ang file — naka-save lang sa browser na ito' },
  game_saved:   { en:'Game saved — quick-start it anytime from this widget', vi:'Đã lưu trò chơi — khởi chạy nhanh bất cứ lúc nào từ widget này', es:'Juego guardado — inícialo rápidamente desde este widget cuando quieras', fr:'Jeu enregistré — lancez-le rapidement depuis ce widget quand vous voulez', zh:'已保存游戏 — 随时可在此小组件中快速启动', ja:'ゲームを保存しました — このウィジェットからいつでもすぐに起動できます', ko:'게임이 저장되었습니다 — 이 위젯에서 언제든 빠르게 실행하세요', tl:'Na-save ang laro — pwede itong i-launch agad mula sa widget na ito' },
  class_list_saved:{ en:'Class list saved', vi:'Đã lưu danh sách lớp', es:'Lista de la clase guardada', fr:'Liste de classe enregistrée', zh:'已保存班级名单', ja:'クラス名簿を保存しました', ko:'학급 명단이 저장되었습니다', tl:'Na-save ang listahan ng klase' },
  layout_reset_toast:{ en:'Layout reset', vi:'Đã đặt lại bố cục', es:'Diseño restablecido', fr:'Disposition réinitialisée', zh:'布局已重置', ja:'レイアウトをリセットしました', ko:'레이아웃이 재설정되었습니다', tl:'Na-reset ang layout' },
  lessonplanner: { en:'🗒️ Lesson Planner', vi:'Kế hoạch bài giảng', es:'Planificador de clases', fr:'Plan de cours', zh:'教案', ja:'授業計画', ko:'수업 계획서', tl:'Plano ng Aralin' },
  lp_topic: { en:'Lesson topic', vi:'Chủ đề bài học', es:'Tema de la clase', fr:'Sujet de la leçon', zh:'课题', ja:'授業のテーマ', ko:'수업 주제', tl:'Paksa ng aralin' },
  lp_teacher: { en:'Teacher', vi:'Giáo viên', es:'Docente', fr:'Enseignant(e)', zh:'教师', ja:'教師', ko:'교사', tl:'Guro' },
  lp_subject: { en:'Subject / Course', vi:'Môn học / Khóa học', es:'Asignatura / Curso', fr:'Matière / Cours', zh:'学科 / 课程', ja:'教科 / コース', ko:'과목 / 강좌', tl:'Asignatura / Kurso' },
  lp_class: { en:'Grade level / Class', vi:'Khối / Lớp', es:'Nivel / Clase', fr:'Niveau / Classe', zh:'年级 / 班级', ja:'学年 / クラス', ko:'학년 / 반', tl:'Baitang / Klase' },
  lp_start: { en:'Start time', vi:'Giờ bắt đầu', es:'Hora de inicio', fr:'Heure de début', zh:'开始时间', ja:'開始時刻', ko:'시작 시간', tl:'Oras ng simula' },
  lp_duration: { en:'Duration (min)', vi:'Thời lượng (phút)', es:'Duración (min)', fr:'Durée (min)', zh:'时长（分钟）', ja:'所要時間（分）', ko:'수업 시간(분)', tl:'Tagal (minuto)' },
  lp_sec_content: { en:'Objectives & materials', vi:'Mục tiêu & học liệu', es:'Objetivos y materiales', fr:'Objectifs et matériel', zh:'目标与材料', ja:'目標と教材', ko:'목표 및 자료', tl:'Mga layunin at kagamitan' },
  lp_objectives: { en:'Learning objectives', vi:'Mục tiêu học tập', es:'Objetivos de aprendizaje', fr:'Objectifs d\'apprentissage', zh:'学习目标', ja:'学習目標', ko:'학습 목표', tl:'Mga layunin sa pagkatuto' },
  lp_materials: { en:'Materials & resources', vi:'Học liệu & tài nguyên', es:'Materiales y recursos', fr:'Matériel et ressources', zh:'材料与资源', ja:'教材・リソース', ko:'준비물 및 자료', tl:'Mga kagamitan at sanggunian' },
  lp_pacing: { en:'Pacing (minutes)', vi:'Phân bổ thời gian (phút)', es:'Ritmo (minutos)', fr:'Déroulé (minutes)', zh:'时间安排（分钟）', ja:'時間配分（分）', ko:'시간 배분(분)', tl:'Takbo ng aralin (minuto)' },
  lp_phase_1: { en:'Hook / Introduction', vi:'Khởi động / Giới thiệu', es:'Gancho / Introducción', fr:'Accroche / Introduction', zh:'导入', ja:'導入', ko:'도입', tl:'Panimula / Hook' },
  lp_phase_2: { en:'Direct instruction', vi:'Giảng dạy trực tiếp', es:'Instrucción directa', fr:'Enseignement explicite', zh:'讲授', ja:'直接指導', ko:'직접 교수', tl:'Direktang pagtuturo' },
  lp_phase_3: { en:'Guided practice', vi:'Luyện tập có hướng dẫn', es:'Práctica guiada', fr:'Pratique guidée', zh:'指导练习', ja:'誘導練習', ko:'안내된 연습', tl:'Ginabayang pagsasanay' },
  lp_phase_4: { en:'Independent practice', vi:'Luyện tập độc lập', es:'Práctica independiente', fr:'Pratique autonome', zh:'独立练习', ja:'個別練習', ko:'독립 연습', tl:'Malayang pagsasanay' },
  lp_phase_5: { en:'Closure / wrap-up', vi:'Kết thúc / Tổng kết', es:'Cierre', fr:'Clôture / Bilan', zh:'总结', ja:'まとめ', ko:'마무리', tl:'Pagtatapos' },
  lp_total: { en:'Total: {n} min', vi:'Tổng: {n} phút', es:'Total: {n} min', fr:'Total : {n} min', zh:'合计：{n} 分钟', ja:'合計：{n}分', ko:'합계: {n}분', tl:'Kabuuan: {n} min' },
  lp_open_word: { en:'Open in Word', vi:'Mở bằng Word', es:'Abrir en Word', fr:'Ouvrir dans Word', zh:'在 Word 中打开', ja:'Word で開く', ko:'Word로 열기', tl:'Buksan sa Word' },
  lp_open_docs: { en:'Open in Google Docs', vi:'Mở bằng Google Docs', es:'Abrir en Google Docs', fr:'Ouvrir dans Google Docs', zh:'在 Google 文档中打开', ja:'Google ドキュメントで開く', ko:'Google 문서로 열기', tl:'Buksan sa Google Docs' },
  lp_also_cal: { en:'Also save to the calendar', vi:'Đồng thời lưu vào lịch', es:'Guardar también en el calendario', fr:'Enregistrer aussi dans le calendrier', zh:'同时保存到日历', ja:'カレンダーにも保存', ko:'캘린더에도 저장', tl:'I-save din sa kalendaryo' },
  lp_save_cal: { en:'Save to calendar', vi:'Lưu vào lịch', es:'Guardar en el calendario', fr:'Enregistrer au calendrier', zh:'保存到日历', ja:'カレンダーに保存', ko:'캘린더에 저장', tl:'I-save sa kalendaryo' },
  lp_new: { en:'New lesson', vi:'Bài học mới', es:'Nueva clase', fr:'Nouvelle leçon', zh:'新建课程', ja:'新しい授業', ko:'새 수업', tl:'Bagong aralin' },
  lp_hint: { en:'Word: downloads a filled-in copy of your lesson plan template. Google Docs: copies the plan, then opens a new document — paste it in.', vi:'Word: tải về bản kế hoạch đã điền sẵn. Google Docs: sao chép kế hoạch rồi mở tài liệu mới — dán vào.', es:'Word: descarga una copia rellenada de tu plantilla. Google Docs: copia el plan y abre un documento nuevo — pégalo allí.', fr:'Word : télécharge une copie remplie de votre modèle. Google Docs : copie le plan puis ouvre un nouveau document — collez-le.', zh:'Word：下载已填写内容的教案模板副本。Google 文档：复制教案并打开新文档 — 粘贴即可。', ja:'Word：入力済みの授業計画テンプレートをダウンロードします。Google ドキュメント：計画をコピーして新規ドキュメントを開きます — 貼り付けてください。', ko:'Word: 내용이 채워진 수업 계획서 사본을 내려받습니다. Google 문서: 계획을 복사하고 새 문서를 엽니다 — 붙여넣으세요.', tl:'Word: nagda-download ng napunang kopya ng iyong lesson plan template. Google Docs: kokopyahin ang plano at magbubukas ng bagong dokumento — i-paste ito.' },
  lp_word_done: { en:'Downloaded — open it in Word to finish the plan:', vi:'Đã tải về — mở bằng Word để hoàn thiện:', es:'Descargado — ábrelo en Word para completar el plan:', fr:'Téléchargé — ouvrez-le dans Word pour terminer le plan :', zh:'已下载 — 用 Word 打开以完成教案：', ja:'ダウンロードしました — Word で開いて仕上げてください：', ko:'다운로드했습니다 — Word로 열어 계획을 완성하세요:', tl:'Na-download — buksan sa Word para tapusin ang plano:' },
  lp_docs_copied: { en:'Plan copied — press {key} in the new Google Doc.', vi:'Đã sao chép — nhấn {key} trong tài liệu Google mới.', es:'Plan copiado — pulsa {key} en el nuevo documento de Google.', fr:'Plan copié — appuyez sur {key} dans le nouveau document Google.', zh:'教案已复制 — 在新的 Google 文档中按 {key}。', ja:'計画をコピーしました — 新しい Google ドキュメントで {key} を押してください。', ko:'계획을 복사했습니다 — 새 Google 문서에서 {key}를 누르세요.', tl:'Nakopya ang plano — pindutin ang {key} sa bagong Google Doc.' },
  lp_docs_nocopy: { en:'Google Docs opened, but the plan couldn\'t be copied. Use Open in Word and upload the file to Google Drive instead.', vi:'Đã mở Google Docs nhưng không thể sao chép kế hoạch. Hãy dùng "Mở bằng Word" rồi tải tệp lên Google Drive.', es:'Se abrió Google Docs, pero no se pudo copiar el plan. Usa «Abrir en Word» y sube el archivo a Google Drive.', fr:'Google Docs est ouvert, mais le plan n\'a pas pu être copié. Utilisez « Ouvrir dans Word » puis importez le fichier dans Google Drive.', zh:'Google 文档已打开，但无法复制教案。请使用“在 Word 中打开”，再将文件上传到 Google 云端硬盘。', ja:'Google ドキュメントを開きましたが、計画をコピーできませんでした。「Word で開く」を使い、ファイルを Google ドライブにアップロードしてください。', ko:'Google 문서를 열었지만 계획을 복사하지 못했습니다. "Word로 열기"를 사용한 뒤 파일을 Google 드라이브에 업로드하세요.', tl:'Nabuksan ang Google Docs, pero hindi nakopya ang plano. Gamitin ang "Buksan sa Word" at i-upload ang file sa Google Drive.' },
  lp_docs_blocked: { en:'Your browser blocked the new tab — allow pop-ups for this page and try again.', vi:'Trình duyệt đã chặn tab mới — hãy cho phép cửa sổ bật lên cho trang này rồi thử lại.', es:'El navegador bloqueó la pestaña nueva — permite las ventanas emergentes para esta página e inténtalo de nuevo.', fr:'Le navigateur a bloqué le nouvel onglet — autorisez les fenêtres pop-up pour cette page et réessayez.', zh:'浏览器拦截了新标签页 — 请允许此页面的弹出窗口后重试。', ja:'ブラウザが新しいタブをブロックしました。このページのポップアップを許可してからもう一度お試しください。', ko:'브라우저가 새 탭을 차단했습니다. 이 페이지의 팝업을 허용한 뒤 다시 시도하세요.', tl:'Na-block ng browser ang bagong tab — payagan ang pop-ups para sa page na ito at subukan muli.' },
  lp_err_word: { en:'Couldn\'t build the Word file.', vi:'Không thể tạo tệp Word.', es:'No se pudo crear el archivo de Word.', fr:'Impossible de créer le fichier Word.', zh:'无法生成 Word 文件。', ja:'Word ファイルを作成できませんでした。', ko:'Word 파일을 만들 수 없습니다.', tl:'Hindi nagawa ang Word file.' },
  lp_err_docs: { en:'Couldn\'t open Google Docs.', vi:'Không thể mở Google Docs.', es:'No se pudo abrir Google Docs.', fr:'Impossible d\'ouvrir Google Docs.', zh:'无法打开 Google 文档。', ja:'Google ドキュメントを開けませんでした。', ko:'Google 문서를 열 수 없습니다.', tl:'Hindi mabuksan ang Google Docs.' },
  lp_cal_saved: { en:'Saved to the calendar.', vi:'Đã lưu vào lịch.', es:'Guardado en el calendario.', fr:'Enregistré dans le calendrier.', zh:'已保存到日历。', ja:'カレンダーに保存しました。', ko:'캘린더에 저장했습니다.', tl:'Na-save sa kalendaryo.' },
  lp_cal_updated: { en:'Calendar updated.', vi:'Đã cập nhật lịch.', es:'Calendario actualizado.', fr:'Calendrier mis à jour.', zh:'日历已更新。', ja:'カレンダーを更新しました。', ko:'캘린더를 업데이트했습니다.', tl:'Na-update ang kalendaryo.' },
  lp_need_topic: { en:'Add a lesson topic to save it to the calendar.', vi:'Hãy nhập chủ đề bài học để lưu vào lịch.', es:'Añade un tema de clase para guardarla en el calendario.', fr:'Ajoutez un sujet de leçon pour l\'enregistrer au calendrier.', zh:'请先填写课题，才能保存到日历。', ja:'カレンダーに保存するには授業のテーマを入力してください。', ko:'캘린더에 저장하려면 수업 주제를 입력하세요.', tl:'Maglagay ng paksa ng aralin para ma-save sa kalendaryo.' },
  lp_on_calendar: { en:'On the calendar:', vi:'Trên lịch:', es:'En el calendario:', fr:'Au calendrier :', zh:'已在日历：', ja:'カレンダー：', ko:'캘린더:', tl:'Nasa kalendaryo:' },
  lp_cal_outdated: { en:'changes not saved to the calendar yet', vi:'thay đổi chưa được lưu vào lịch', es:'cambios aún sin guardar en el calendario', fr:'modifications pas encore enregistrées au calendrier', zh:'更改尚未保存到日历', ja:'変更はまだカレンダーに保存されていません', ko:'변경 사항이 아직 캘린더에 저장되지 않았습니다', tl:'hindi pa nase-save sa kalendaryo ang mga pagbabago' },
  lp_event_prefix: { en:'Lesson', vi:'Bài học', es:'Clase', fr:'Leçon', zh:'课程', ja:'授業', ko:'수업', tl:'Aralin' },
  classes_section:{ en:'Classes', vi:'Lớp học', es:'Clases', fr:'Classes', zh:'班级', ja:'クラス', ko:'수업', tl:'Mga Klase' },
  classes_hint: { en:'Each class keeps its own roster, widgets, layout and theme. Switching opens that class.', vi:'Mỗi lớp có danh sách, tiện ích, bố cục và giao diện riêng. Chuyển lớp sẽ mở lớp đó.', es:'Cada clase guarda su propia lista, widgets, diseño y tema. Cambiar abre esa clase.', fr:'Chaque classe garde sa liste, ses widgets, sa disposition et son thème. Changer ouvre cette classe.', zh:'每个班级保留自己的名单、小组件、布局和主题。切换即可打开该班级。', ja:'各クラスは名簿・ウィジェット・レイアウト・テーマを個別に保持します。切り替えるとそのクラスが開きます。', ko:'각 수업은 명단, 위젯, 레이아웃, 테마를 따로 유지합니다. 전환하면 해당 수업이 열립니다.', tl:'May sariling roster, widget, layout at tema ang bawat klase. Ang paglipat ay magbubukas ng klaseng iyon.' },
  class_default_name: { en:'My class', vi:'Lớp của tôi', es:'Mi clase', fr:'Ma classe', zh:'我的班级', ja:'マイクラス', ko:'내 수업', tl:'Aking klase' },
  class_switch_label: { en:'Switch class', vi:'Chuyển lớp', es:'Cambiar de clase', fr:'Changer de classe', zh:'切换班级', ja:'クラスを切り替え', ko:'수업 전환', tl:'Magpalit ng klase' },
  class_manage:  { en:'Manage classes…', vi:'Quản lý lớp…', es:'Gestionar clases…', fr:'Gérer les classes…', zh:'管理班级…', ja:'クラスを管理…', ko:'수업 관리…', tl:'Pamahalaan ang mga klase…' },
  class_name_ph: { en:'Class name (e.g. 7A Monday)', vi:'Tên lớp (vd: 7A thứ Hai)', es:'Nombre de la clase (p. ej. 7A lunes)', fr:'Nom de la classe (ex. 7A lundi)', zh:'班级名称（例如 7A 周一）', ja:'クラス名（例：7A 月曜）', ko:'수업 이름 (예: 7A 월요일)', tl:'Pangalan ng klase (hal. 7A Lunes)' },
  class_add:     { en:'Add a class', vi:'Thêm lớp', es:'Añadir una clase', fr:'Ajouter une classe', zh:'添加班级', ja:'クラスを追加', ko:'수업 추가', tl:'Magdagdag ng klase' },
  class_add_btn: { en:'Create & open', vi:'Tạo và mở', es:'Crear y abrir', fr:'Créer et ouvrir', zh:'创建并打开', ja:'作成して開く', ko:'만들고 열기', tl:'Gumawa at buksan' },
  class_copy:    { en:'Copy this class', vi:'Sao chép lớp này', es:'Copiar esta clase', fr:'Copier cette classe', zh:'复制此班级', ja:'このクラスを複製', ko:'이 수업 복제', tl:'Kopyahin ang klaseng ito' },
  class_copy_hint:{ en:'Makes a new class with the same widgets, layout and theme — handy for a second section.', vi:'Tạo lớp mới với cùng tiện ích, bố cục và giao diện — tiện cho lớp thứ hai.', es:'Crea una clase nueva con los mismos widgets, diseño y tema — útil para otra sección.', fr:'Crée une classe avec les mêmes widgets, disposition et thème — pratique pour une autre section.', zh:'创建具有相同小组件、布局和主题的新班级 — 适合另一个班。', ja:'同じウィジェット・レイアウト・テーマの新しいクラスを作成します（別クラスに便利）。', ko:'같은 위젯, 레이아웃, 테마로 새 수업을 만듭니다 — 다른 반에 유용합니다.', tl:'Gumagawa ng bagong klase na may parehong widget, layout at tema — praktikal para sa ibang seksyon.' },
  class_copy_suffix:{ en:'copy', vi:'bản sao', es:'copia', fr:'copie', zh:'副本', ja:'コピー', ko:'복사본', tl:'kopya' },
  class_switch_to:{ en:'Open', vi:'Mở', es:'Abrir', fr:'Ouvrir', zh:'打开', ja:'開く', ko:'열기', tl:'Buksan' },
  class_current: { en:'Open now', vi:'Đang mở', es:'Abierta ahora', fr:'Ouverte', zh:'当前打开', ja:'表示中', ko:'현재 열림', tl:'Bukas ngayon' },
  class_delete:  { en:'Delete class', vi:'Xóa lớp', es:'Eliminar clase', fr:'Supprimer la classe', zh:'删除班级', ja:'クラスを削除', ko:'수업 삭제', tl:'Burahin ang klase' },
  class_delete_confirm: { en:'Delete "{name}"? Its roster, layout and settings are erased. Your files, games and music library are shared and stay.', vi:'Xóa "{name}"? Danh sách, bố cục và cài đặt của lớp sẽ bị xóa. Thư viện tệp, trò chơi và nhạc dùng chung vẫn được giữ.', es:'¿Eliminar "{name}"? Se borran su lista, diseño y ajustes. Tu biblioteca de archivos, juegos y música es compartida y se conserva.', fr:'Supprimer « {name} » ? Sa liste, sa disposition et ses réglages seront effacés. Votre bibliothèque de fichiers, jeux et musique est partagée et sera conservée.', zh:'删除"{name}"？其名单、布局和设置将被清除。文件、游戏和音乐库为共享内容，会保留。', ja:'「{name}」を削除しますか？名簿・レイアウト・設定は消去されます。ファイル・ゲーム・音楽のライブラリは共有のため残ります。', ko:'"{name}"을(를) 삭제할까요? 명단, 레이아웃, 설정이 지워집니다. 파일·게임·음악 라이브러리는 공유되어 유지됩니다.', tl:'Burahin ang "{name}"? Mabubura ang roster, layout at settings nito. Nananatili ang shared na library ng files, games at musika.' },
  class_deleted: { en:'Class deleted', vi:'Đã xóa lớp', es:'Clase eliminada', fr:'Classe supprimée', zh:'班级已删除', ja:'クラスを削除しました', ko:'수업이 삭제되었습니다', tl:'Nabura ang klase' },
  class_last:    { en:"That's your only class — it can't be deleted", vi:'Đây là lớp duy nhất — không thể xóa', es:'Es tu única clase — no se puede eliminar', fr:"C'est votre seule classe — impossible de la supprimer", zh:'这是您唯一的班级 — 无法删除', ja:'唯一のクラスのため削除できません', ko:'유일한 수업이라 삭제할 수 없습니다', tl:'Ito lang ang klase mo — hindi ito mabubura' },
  class_max:     { en:'You can have up to {max} classes', vi:'Bạn có thể có tối đa {max} lớp', es:'Puedes tener hasta {max} clases', fr:"Vous pouvez avoir jusqu'à {max} classes", zh:'最多可创建 {max} 个班级', ja:'クラスは最大 {max} 個までです', ko:'최대 {max}개의 수업을 만들 수 있습니다', tl:'Hanggang {max} klase lang ang pwede' },
  pill_classes_label: { en:'Class switcher', vi:'Bộ chuyển lớp', es:'Selector de clase', fr:'Sélecteur de classe', zh:'班级切换器', ja:'クラス切り替え', ko:'수업 전환기', tl:'Panlipat ng klase' },
  bg_updated:   { en:'Background updated', vi:'Đã cập nhật hình nền', es:'Fondo actualizado', fr:'Arrière-plan mis à jour', zh:'背景已更新', ja:'背景を更新しました', ko:'배경이 업데이트되었습니다', tl:'Na-update ang background' },
  bg_upload_failed: { en:"Couldn't save that image — this window may block storage (embedded preview or private mode). Try a regular browser tab.", vi:'Không thể lưu ảnh — cửa sổ này có thể chặn bộ nhớ (chế độ xem nhúng hoặc riêng tư). Hãy thử trong một tab trình duyệt thông thường.', es:'No se pudo guardar la imagen — esta ventana puede bloquear el almacenamiento (vista previa incrustada o modo privado). Prueba en una pestaña normal del navegador.', fr:"Impossible d'enregistrer cette image — cette fenêtre bloque peut-être le stockage (aperçu intégré ou navigation privée). Essayez dans un onglet de navigateur normal.", zh:'无法保存该图片 — 此窗口可能禁用了存储（嵌入式预览或隐私模式）。请在普通浏览器标签页中重试。', ja:'画像を保存できませんでした — このウィンドウでは保存が制限されている可能性があります（埋め込みプレビューやプライベートモード）。通常のブラウザタブでお試しください。', ko:'이미지를 저장하지 못했습니다 — 이 창에서 저장소가 차단되었을 수 있습니다(임베디드 미리보기 또는 비공개 모드). 일반 브라우저 탭에서 시도해 보세요.', tl:'Hindi na-save ang larawan — maaaring naka-block ang storage sa window na ito (embedded preview o private mode). Subukan sa regular na browser tab.' },
  bg_not_saved: { en:"Background applied — but this window can't save it, so it will reset on reload. Open the app in a regular browser tab to keep it.", vi:'Đã áp dụng hình nền — nhưng cửa sổ này không thể lưu nên sẽ đặt lại khi tải lại. Hãy mở ứng dụng trong tab trình duyệt thông thường để giữ lại.', es:'Fondo aplicado — pero esta ventana no puede guardarlo, así que se restablecerá al recargar. Abre la app en una pestaña normal del navegador para conservarlo.', fr:"Arrière-plan appliqué — mais cette fenêtre ne peut pas l'enregistrer, il sera réinitialisé au rechargement. Ouvrez l'app dans un onglet de navigateur normal pour le conserver.", zh:'背景已应用 — 但此窗口无法保存，刷新后将恢复。请在普通浏览器标签页中打开应用以保留。', ja:'背景を適用しました — ただしこのウィンドウでは保存できないため、再読み込みするとリセットされます。保持するには通常のブラウザタブでアプリを開いてください。', ko:'배경이 적용되었습니다 — 하지만 이 창에서는 저장할 수 없어 새로고침하면 초기화됩니다. 유지하려면 일반 브라우저 탭에서 앱을 여세요.', tl:'Na-apply ang background — pero hindi ito ma-save ng window na ito, kaya magre-reset ito kapag nag-reload. Buksan ang app sa regular na browser tab para mapanatili.' },
  logo_updated: { en:'Logo added', vi:'Đã thêm logo', es:'Logo añadido', fr:'Logo ajouté', zh:'已添加标志', ja:'ロゴを追加しました', ko:'로고가 추가되었습니다', tl:'Naidagdag ang logo' },
  logo_removed: { en:'Logo removed', vi:'Đã xóa logo', es:'Logo eliminado', fr:'Logo retiré', zh:'已移除标志', ja:'ロゴを削除しました', ko:'로고가 제거되었습니다', tl:'Naalis ang logo' },
  time_up:      { en:'Time!', vi:'Hết giờ!', es:'¡Se acabó el tiempo!', fr:'Temps écoulé !', zh:'时间到！', ja:'時間切れ！', ko:'시간 종료!', tl:'Oras na!' },
  timer_add_time:{ en:'Add some time before starting', vi:'Thêm thời gian trước khi bắt đầu', es:'Agrega tiempo antes de empezar', fr:'Ajoutez du temps avant de démarrer', zh:'开始前请先添加时间', ja:'開始する前に時間を追加してください', ko:'시작하기 전에 시간을 추가하세요', tl:'Magdagdag muna ng oras bago simulan' },
  lap:          { en:'Lap', vi:'Vòng', es:'Vuelta', fr:'Tour', zh:'圈', ja:'ラップ', ko:'랩', tl:'Lap' },

  start:        { en:'Start', vi:'Bắt đầu', es:'Iniciar', fr:'Démarrer', zh:'开始', ja:'開始', ko:'시작', tl:'Simulan' },
  pause:        { en:'Pause', vi:'Tạm dừng', es:'Pausar', fr:'Pause', zh:'暂停', ja:'一時停止', ko:'일시정지', tl:'I-pause' },
  stop:         { en:'Stop', vi:'Dừng', es:'Detener', fr:'Arrêter', zh:'停止', ja:'停止', ko:'정지', tl:'Ihinto' },
  reset_btn:    { en:'Reset', vi:'Đặt lại', es:'Restablecer', fr:'Réinitialiser', zh:'重置', ja:'リセット', ko:'재설정', tl:'I-reset' },
  browse_btn:   { en:'Browse', vi:'Duyệt tệp', es:'Explorar', fr:'Parcourir', zh:'浏览', ja:'参照', ko:'찾아보기', tl:'Mag-browse' },
  traffic_hint: { en:'Tap a light to signal noise level', vi:'Chạm vào đèn để báo hiệu mức độ ồn', es:'Toca una luz para indicar el nivel de ruido', fr:'Touchez un feu pour indiquer le niveau de bruit', zh:'点击信号灯以表示噪音等级', ja:'ライトをタップして騒音レベルを知らせましょう', ko:'신호등을 탭하여 소음 수준을 표시하세요', tl:'Pindutin ang isang ilaw para sa antas ng ingay' },
  roll:         { en:'Roll', vi:'Tung', es:'Lanzar', fr:'Lancer', zh:'掷骰子', ja:'振る', ko:'굴리기', tl:'Ihagis' },
  add_placeholder:{ en:'Add an item…', vi:'Thêm một mục…', es:'Añadir un elemento…', fr:'Ajouter un élément…', zh:'添加一项…', ja:'項目を追加…', ko:'항목 추가…', tl:'Magdagdag ng item…' },
  add_btn:      { en:'Add', vi:'Thêm', es:'Añadir', fr:'Ajouter', zh:'添加', ja:'追加', ko:'추가', tl:'Idagdag' },
  tap_pick:     { en:'Tap Pick', vi:'Chạm để chọn', es:'Toca para elegir', fr:'Touchez pour choisir', zh:'点击抽取', ja:'タップして選ぶ', ko:'탭하여 선택', tl:'Pindutin para pumili' },
  pick_student: { en:'Pick a student', vi:'Chọn học sinh', es:'Elegir estudiante', fr:'Choisir un élève', zh:'抽取学生', ja:'生徒を選ぶ', ko:'학생 선택', tl:'Pumili ng estudyante' },
  roster_count: { en:'{n} students in class list — edit in Settings', vi:'{n} học sinh trong danh sách lớp — chỉnh sửa trong Cài đặt', es:'{n} estudiantes en la lista de la clase — edítala en Configuración', fr:'{n} élèves dans la liste de classe — modifiez-la dans Paramètres', zh:'班级名单中有 {n} 名学生 — 请在设置中编辑', ja:'クラス名簿に{n}人の生徒がいます — 設定で編集できます', ko:'학급 명단에 {n}명의 학생이 있습니다 — 설정에서 편집하세요', tl:'{n} estudyante sa listahan ng klase — i-edit sa Mga Setting' },
  add_students_prompt:{ en:'Add students in Settings', vi:'Thêm học sinh trong Cài đặt', es:'Añade estudiantes en Configuración', fr:'Ajoutez des élèves dans Paramètres', zh:'请在设置中添加学生', ja:'設定で生徒を追加してください', ko:'설정에서 학생을 추가하세요', tl:'Magdagdag ng estudyante sa Mga Setting' },
  files_drop:   { en:'Click to add a PDF, PowerPoint, Word or Excel file', vi:'Nhấn để thêm tệp PDF, PowerPoint, Word hoặc Excel', es:'Toca para añadir un PDF, PowerPoint, Word o Excel', fr:'Touchez pour ajouter un PDF, PowerPoint, Word ou Excel', zh:'点击添加 PDF、PowerPoint、Word 或 Excel 文件', ja:'タップしてPDF、PowerPoint、Word、Excelファイルを追加', ko:'탭하여 PDF, PowerPoint, Word, Excel 파일 추가', tl:'Pindutin para magdagdag ng PDF, PowerPoint, Word, o Excel file' },
  files_empty:  { en:'No files added yet', vi:'Chưa có tệp nào được thêm', es:'Aún no se han añadido archivos', fr:'Aucun fichier ajouté pour le moment', zh:'尚未添加文件', ja:'まだファイルがありません', ko:'아직 추가된 파일이 없습니다', tl:'Wala pang naidaragdag na file' },
  games_drop:   { en:'Click to add an HTML game (single .html file)', vi:'Nhấn để thêm trò chơi HTML (một tệp .html)', es:'Toca para añadir un juego HTML (un solo archivo .html)', fr:'Touchez pour ajouter un jeu HTML (un seul fichier .html)', zh:'点击添加 HTML 游戏（单个 .html 文件）', ja:'タップしてHTMLゲームを追加（.htmlファイル1つ）', ko:'탭하여 HTML 게임 추가 (.html 파일 1개)', tl:'Pindutin para magdagdag ng HTML na laro (iisang .html file)' },
  games_note:   { en:'Java or Python games need converting to HTML/JS to run here — ask if you want help with that.', vi:'Trò chơi viết bằng Java hoặc Python cần được chuyển sang HTML/JS để chạy ở đây — hãy hỏi nếu bạn cần trợ giúp.', es:'Los juegos en Java o Python deben convertirse a HTML/JS para funcionar aquí — pregunta si necesitas ayuda con eso.', fr:"Les jeux en Java ou Python doivent être convertis en HTML/JS pour fonctionner ici — demandez de l'aide si besoin.", zh:'Java 或 Python 游戏需要转换为 HTML/JS 才能在此运行 — 如需帮助请告诉我们。', ja:'JavaやPythonのゲームはここで動かすためにHTML/JSへ変換する必要があります — お手伝いが必要なら聞いてください。', ko:'Java나 Python 게임은 여기서 실행하려면 HTML/JS로 변환해야 합니다 — 도움이 필요하면 말씀해 주세요.', tl:'Ang mga larong Java o Python ay kailangang i-convert sa HTML/JS para tumakbo dito — magtanong lang kung kailangan mo ng tulong.' },
  games_empty:  { en:'No games added yet', vi:'Chưa có trò chơi nào được thêm', es:'Aún no se han añadido juegos', fr:'Aucun jeu ajouté pour le moment', zh:'尚未添加游戏', ja:'まだゲームがありません', ko:'아직 추가된 게임이 없습니다', tl:'Wala pang naidaragdag na laro' },
  games_mine:   { en:'My games', vi:'Trò chơi của tôi', es:'Mis juegos', fr:'Mes jeux', zh:'我的游戏', ja:'マイゲーム', ko:'내 게임', tl:'Mga laro ko' },
  games_builtin:{ en:'Built-in games', vi:'Trò chơi có sẵn', es:'Juegos incluidos', fr:'Jeux inclus', zh:'内置游戏', ja:'内蔵ゲーム', ko:'내장 게임', tl:'Kasamang mga laro' },
  how_to_play:  { en:'How to play', vi:'Cách chơi', es:'Cómo jugar', fr:'Comment jouer', zh:'玩法说明', ja:'遊び方', ko:'게임 방법', tl:'Paano laruin' },
  sb_sub:       { en:"Tap a team's points to keep score", vi:'Chạm vào điểm của đội để ghi điểm', es:'Toca los puntos de un equipo para llevar el marcador', fr:"Touchez les points d'une équipe pour marquer", zh:'点击某队的分数即可计分', ja:'チームの得点をタップしてスコアを記録', ko:'팀의 점수를 탭하여 기록하세요', tl:'Pindutin ang puntos ng koponan para mag-score' },
  sb_reset:     { en:'Reset all scores', vi:'Đặt lại tất cả điểm số', es:'Restablecer todos los puntos', fr:'Réinitialiser tous les scores', zh:'重置所有分数', ja:'すべてのスコアをリセット', ko:'모든 점수 재설정', tl:'I-reset lahat ng puntos' },
  sb_transfer_received: { en:'Scores received in Scoreboard', vi:'Đã nhận điểm vào Bảng điểm', es:'Puntuaciones recibidas en el Marcador', fr:'Scores reçus dans le Tableau des scores', zh:'已在计分板中收到分数', ja:'スコアボードにスコアを受信しました', ko:'스코어보드에 점수를 받았습니다', tl:'Natanggap ang mga puntos sa Scoreboard' },
  games_unreachable_toast: { en:"Couldn't open this game — built-in games only work when TeachersDeck is served as real files (a local web server or the Chrome extension), not this single-page preview.", vi:'Không thể mở trò chơi này — trò chơi có sẵn chỉ hoạt động khi TeachersDeck được chạy dưới dạng tệp thật (máy chủ web cục bộ hoặc tiện ích Chrome), không phải bản xem trước một trang này.', es:'No se pudo abrir este juego — los juegos incluidos solo funcionan cuando TeachersDeck se sirve como archivos reales (un servidor web local o la extensión de Chrome), no esta vista previa de una sola página.', fr:"Impossible d'ouvrir ce jeu — les jeux intégrés ne fonctionnent que lorsque TeachersDeck est servi en tant que vrais fichiers (un serveur web local ou l'extension Chrome), pas cet aperçu monopage.", zh:'无法打开此游戏——内置游戏仅在 TeachersDeck 以真实文件形式提供时（本地网页服务器或 Chrome 扩展程序）才能运行，此单页预览无法运行。', ja:'このゲームを開けませんでした — 内蔵ゲームはTeachersDeckが実際のファイルとして配信されている場合（ローカルWebサーバーまたはChrome拡張機能）にのみ動作します。この単一ページのプレビューでは動作しません。', ko:'이 게임을 열 수 없습니다 — 내장 게임은 TeachersDeck이 실제 파일로 제공될 때(로컬 웹 서버 또는 Chrome 확장 프로그램)만 작동하며 이 단일 페이지 미리보기에서는 작동하지 않습니다.', tl:'Hindi mabuksan ang larong ito — ang mga kasamang laro ay gumagana lang kapag ang TeachersDeck ay ini-serve bilang tunay na mga file (isang lokal na web server o ang Chrome extension), hindi itong single-page na preview.' },
  close:        { en:'Close', vi:'Đóng', es:'Cerrar', fr:'Fermer', zh:'关闭', ja:'閉じる', ko:'닫기', tl:'Isara' },
  play:         { en:'Play', vi:'Chơi', es:'Reproducir', fr:'Lire', zh:'播放', ja:'再生', ko:'재생', tl:'I-play' },
  remove:       { en:'Remove', vi:'Xóa', es:'Eliminar', fr:'Retirer', zh:'移除', ja:'削除', ko:'제거', tl:'Alisin' },
  open_action:  { en:'Open', vi:'Mở', es:'Abrir', fr:'Ouvrir', zh:'打开', ja:'開く', ko:'열기', tl:'Buksan' },
  move_action:  { en:'Move', vi:'Di chuyển', es:'Mover', fr:'Déplacer', zh:'移动', ja:'移動', ko:'이동', tl:'Ilipat' },
  minimize_action:{ en:'Minimize', vi:'Thu nhỏ', es:'Minimizar', fr:'Réduire', zh:'最小化', ja:'最小化', ko:'최소화', tl:'I-minimize' },
  restore_action:{ en:'Restore', vi:'Khôi phục', es:'Restaurar', fr:'Restaurer', zh:'还原', ja:'元に戻す', ko:'복원', tl:'I-restore' },

  calendar_system_label:{ en:'Date system', vi:'Hệ lịch', es:'Sistema de fechas', fr:'Système de dates', zh:'历法', ja:'暦の種類', ko:'날짜 체계', tl:'Sistema ng Petsa' },
  cal_sys_gregorian:{ en:'Gregorian', vi:'Dương lịch', es:'Gregoriano', fr:'Grégorien', zh:'公历', ja:'新暦（グレゴリオ暦）', ko:'양력', tl:'Gregorian' },
  cal_sys_lunar:{ en:'Lunar', vi:'Âm lịch', es:'Lunar', fr:'Lunaire', zh:'农历', ja:'旧暦（太陰暦）', ko:'음력', tl:'Lunar' },
  cal_sys_both:{ en:'Both (Gregorian + Lunar)', vi:'Cả hai (Dương lịch + Âm lịch)', es:'Ambos (gregoriano y lunar)', fr:'Les deux (grégorien + lunaire)', zh:'公历和农历都显示', ja:'両方（新暦＋旧暦）', ko:'둘 다 (양력 + 음력)', tl:'Pareho (Gregorian + Lunar)' },
  lunar_prefix:{ en:'Lunar', vi:'ÂL', es:'Lunar', fr:'Lun.', zh:'农历', ja:'旧暦', ko:'음력', tl:'Lunar' },
  leap_suffix:{ en:' (leap)', vi:' (nhuận)', es:' (bisiesto)', fr:' (bissextile)', zh:'（闰）', ja:'（閏）', ko:' (윤달)', tl:' (leap)' },

  poll:         { en:'📊 Poll', vi:'Bình chọn', es:'Encuesta', fr:'Sondage', zh:'投票', ja:'投票', ko:'투표', tl:'Botohan' },
  poll_manage:  { en:'Edit poll', vi:'Sửa bình chọn', es:'Editar encuesta', fr:'Modifier le sondage', zh:'编辑投票', ja:'投票を編集', ko:'투표 수정', tl:'I-edit ang Botohan' },
  poll_question_label:{ en:'Question', vi:'Câu hỏi', es:'Pregunta', fr:'Question', zh:'问题', ja:'質問', ko:'질문', tl:'Tanong' },
  poll_option_label:{ en:'Option', vi:'Lựa chọn', es:'Opción', fr:'Option', zh:'选项', ja:'選択肢', ko:'옵션', tl:'Pagpipilian' },
  poll_add_option:{ en:'Add option', vi:'Thêm lựa chọn', es:'Añadir opción', fr:'Ajouter une option', zh:'添加选项', ja:'選択肢を追加', ko:'옵션 추가', tl:'Magdagdag ng Pagpipilian' },
  poll_reset_votes:{ en:'Reset votes', vi:'Đặt lại số phiếu', es:'Restablecer votos', fr:'Réinitialiser les votes', zh:'重置票数', ja:'投票をリセット', ko:'투표 재설정', tl:'I-reset ang mga Boto' },
  poll_total_votes:{ en:'{n} votes', vi:'{n} phiếu bầu', es:'{n} votos', fr:'{n} votes', zh:'{n} 票', ja:'{n}票', ko:'{n}표', tl:'{n} boto' },
  poll_tap_hint:{ en:'Tap an option each time someone votes for it', vi:'Chạm vào lựa chọn mỗi khi có người bình chọn', es:'Toca una opción cada vez que alguien vote por ella', fr:'Touchez une option à chaque vote pour elle', zh:'每次有人投票就点击该选项', ja:'投票があるたびに選択肢をタップしてください', ko:'투표할 때마다 해당 옵션을 탭하세요', tl:'Pindutin ang pagpipilian tuwing may boboto dito' },
  poll_min_options:{ en:'A poll needs at least 2 options', vi:'Cần ít nhất 2 lựa chọn', es:'Una encuesta necesita al menos 2 opciones', fr:'Un sondage nécessite au moins 2 options', zh:'投票至少需要2个选项', ja:'投票には少なくとも2つの選択肢が必要です', ko:'투표에는 최소 2개의 옵션이 필요합니다', tl:'Kailangan ng hindi bababa sa 2 pagpipilian' },

  noise:        { en:'🔊 Noise Meter', vi:'Máy đo tiếng ồn', es:'Medidor de ruido', fr:'Sonomètre', zh:'噪音检测器', ja:'騒音メーター', ko:'소음 측정기', tl:'Panukat ng Ingay' },
  noise_enable: { en:'Enable microphone', vi:'Bật micro', es:'Activar micrófono', fr:'Activer le microphone', zh:'启用麦克风', ja:'マイクを有効にする', ko:'마이크 활성화', tl:'I-enable ang mikropono' },
  noise_stop:   { en:'Turn off microphone', vi:'Tắt micro', es:'Apagar micrófono', fr:'Désactiver le microphone', zh:'关闭麦克风', ja:'マイクをオフにする', ko:'마이크 끄기', tl:'Patayin ang mikropono' },
  noise_quiet:  { en:'Quiet', vi:'Yên tĩnh', es:'Silencio', fr:'Calme', zh:'安静', ja:'静か', ko:'조용함', tl:'Tahimik' },
  noise_ok:     { en:'OK', vi:'Bình thường', es:'Aceptable', fr:'Correct', zh:'适中', ja:'普通', ko:'적당함', tl:'Katamtaman' },
  noise_loud:   { en:'Too loud', vi:'Quá ồn', es:'Demasiado ruido', fr:'Trop bruyant', zh:'太吵了', ja:'うるさい', ko:'너무 시끄러움', tl:'Sobrang ingay' },
  noise_approx_note:{ en:'Approximate reading from your device microphone — not a calibrated sound level meter.', vi:'Chỉ số ước tính từ micro thiết bị — không phải máy đo độ ồn đã hiệu chuẩn.', es:'Lectura aproximada del micrófono de tu dispositivo — no es un medidor de sonido calibrado.', fr:"Mesure approximative via le microphone de l'appareil — pas un sonomètre calibré.", zh:'来自设备麦克风的近似读数 — 并非经过校准的声级计。', ja:'デバイスのマイクによるおおよその値です — 校正済みの騒音計ではありません。', ko:'기기 마이크의 대략적인 값입니다 — 보정된 소음계가 아닙니다.', tl:'Tinatayang reading mula sa mikropono ng device — hindi ito calibrated na sound level meter.' },
  noise_denied: { en:"Microphone access was blocked. Allow it in your browser's site settings and try again.", vi:'Quyền truy cập micro đã bị chặn. Hãy cho phép trong cài đặt trang web của trình duyệt rồi thử lại.', es:'Se bloqueó el acceso al micrófono. Permítelo en la configuración del sitio de tu navegador e inténtalo de nuevo.', fr:"L'accès au microphone a été bloqué. Autorisez-le dans les paramètres du site de votre navigateur et réessayez.", zh:'麦克风访问被阻止。请在浏览器的网站设置中允许后重试。', ja:'マイクへのアクセスがブロックされました。ブラウザのサイト設定で許可してから再度お試しください。', ko:'마이크 접근이 차단되었습니다. 브라우저의 사이트 설정에서 허용한 후 다시 시도하세요.', tl:'Na-block ang access sa mikropono. Payagan ito sa site settings ng browser mo at subukan ulit.' },
  noise_no_mic: { en:'No microphone was found on this device.', vi:'Không tìm thấy micro trên thiết bị này.', es:'No se encontró ningún micrófono en este dispositivo.', fr:"Aucun microphone n'a été trouvé sur cet appareil.", zh:'未在此设备上找到麦克风。', ja:'このデバイスにマイクが見つかりませんでした。', ko:'이 기기에서 마이크를 찾을 수 없습니다.', tl:'Walang nahanap na mikropono sa device na ito.' },
  noise_grant_needed:{ en:"Chrome can't show the microphone prompt on the New Tab page. Allow it once on the setup page, then come back and click Enable microphone again.", vi:'Chrome không hiện được hộp thoại xin quyền micro trên trang Tab mới. Hãy cho phép một lần ở trang thiết lập, rồi quay lại và nhấn Bật micro lần nữa.' },
  noise_grant_btn:{ en:'Open microphone setup', vi:'Mở trang thiết lập micro' },
  noise_insecure:{ en:"Microphone access needs a secure context — load this as the Chrome extension or serve it over http://localhost, not by opening the file directly.", vi:'Truy cập micro cần một môi trường bảo mật — hãy tải ứng dụng này dưới dạng tiện ích Chrome hoặc chạy qua http://localhost, không mở trực tiếp tệp.', es:'El acceso al micrófono necesita un contexto seguro — cárgalo como la extensión de Chrome o sírvelo desde http://localhost, no abriendo el archivo directamente.', fr:"L'accès au microphone nécessite un contexte sécurisé — chargez ceci en tant qu'extension Chrome ou servez-le via http://localhost, pas en ouvrant le fichier directement.", zh:'麦克风访问需要安全环境 — 请以 Chrome 扩展程序方式加载，或通过 http://localhost 提供服务，而不要直接打开文件。', ja:'マイクへのアクセスには安全なコンテキストが必要です — Chrome拡張機能として読み込むか、http://localhost経由で提供してください。ファイルを直接開かないでください。', ko:'마이크 접근에는 보안 컨텍스트가 필요합니다 — 파일을 직접 여는 대신 Chrome 확장 프로그램으로 불러오거나 http://localhost로 제공하세요.', tl:'Ang access sa mikropono ay nangangailangan ng secure context — i-load ito bilang Chrome extension o i-serve sa pamamagitan ng http://localhost, huwag buksan ang file nang direkta.' },
  noise_styles_label:{ en:'Meter style', vi:'Kiểu đồng hồ đo' },
  noise_style_circle:{ en:'Circle meter', vi:'Đồng hồ tròn' },
  noise_style_vbar:  { en:'Vertical bar meter', vi:'Thanh dọc' },
  noise_style_hbar:  { en:'Horizontal bar meter', vi:'Thanh ngang' },
  noise_peak_hold:   { en:'Peak hold', vi:'Giữ mức cao nhất' },
  noise_graph_title: { en:'Noise over time', vi:'Tiếng ồn theo thời gian' },
  noise_graph_empty: { en:'Turn on the microphone to start the graph.', vi:'Bật micro để bắt đầu vẽ biểu đồ.' },
  noise_clear_graph: { en:'Clear graph', vi:'Xóa biểu đồ' },

  music:        { en:'🎵 Music Player', vi:'Trình phát nhạc', es:'Reproductor de música', fr:'Lecteur de musique', zh:'音乐播放器', ja:'音楽プレーヤー', ko:'음악 플레이어', tl:'Music Player' },
  video_player: { en:'🎬 Video Player', vi:'Trình phát video', es:'Reproductor de video', fr:'Lecteur vidéo', zh:'视频播放器', ja:'動画プレーヤー', ko:'동영상 플레이어', tl:'Video Player' },
  tab_my_files: { en:'My files', vi:'Tệp của tôi', es:'Mis archivos', fr:'Mes fichiers', zh:'我的文件', ja:'マイファイル', ko:'내 파일', tl:'Mga File Ko' },
  tab_stream:   { en:'Stream', vi:'Phát trực tuyến', es:'Transmitir', fr:'Diffuser', zh:'在线播放', ja:'ストリーミング', ko:'스트리밍', tl:'Stream' },
  tab_youtube:  { en:'YouTube', vi:'YouTube', es:'YouTube', fr:'YouTube', zh:'YouTube', ja:'YouTube', ko:'YouTube', tl:'YouTube' },
  tab_spotify:  { en:'Spotify', vi:'Spotify', es:'Spotify', fr:'Spotify', zh:'Spotify', ja:'Spotify', ko:'Spotify', tl:'Spotify' },
  mp_add_files: { en:'Add music files', vi:'Thêm tệp nhạc', es:'Añadir archivos de música', fr:'Ajouter des fichiers audio', zh:'添加音乐文件', ja:'音楽ファイルを追加', ko:'음악 파일 추가', tl:'Magdagdag ng Music File' },
  mp_empty:     { en:'No music added yet', vi:'Chưa có nhạc nào được thêm', es:'Aún no se ha añadido música', fr:'Aucune musique ajoutée pour le moment', zh:'尚未添加音乐', ja:'まだ音楽が追加されていません', ko:'아직 추가된 음악이 없습니다', tl:'Wala pang naidaragdag na music' },
  vp_add_files: { en:'Add video files', vi:'Thêm tệp video', es:'Añadir archivos de video', fr:'Ajouter des fichiers vidéo', zh:'添加视频文件', ja:'動画ファイルを追加', ko:'동영상 파일 추가', tl:'Magdagdag ng Video File' },
  vp_empty:     { en:'No videos added yet', vi:'Chưa có video nào được thêm', es:'Aún no se han añadido videos', fr:'Aucune vidéo ajoutée pour le moment', zh:'尚未添加视频', ja:'まだ動画が追加されていません', ko:'아직 추가된 동영상이 없습니다', tl:'Wala pang naidaragdag na video' },
  stream_placeholder:{ en:'Paste a YouTube or SoundCloud link', vi:'Dán liên kết YouTube hoặc SoundCloud', es:'Pega un enlace de YouTube o SoundCloud', fr:'Collez un lien YouTube ou SoundCloud', zh:'粘贴 YouTube 或 SoundCloud 链接', ja:'YouTubeまたはSoundCloudのリンクを貼り付け', ko:'YouTube 또는 SoundCloud 링크를 붙여넣으세요', tl:'I-paste ang link ng YouTube o SoundCloud' },
  stream_invalid:{ en:"Couldn't recognize that link — try a YouTube or SoundCloud URL", vi:'Không nhận diện được liên kết này — hãy thử URL YouTube hoặc SoundCloud', es:'No se reconoció ese enlace — prueba con una URL de YouTube o SoundCloud', fr:"Ce lien n'a pas été reconnu — essayez une URL YouTube ou SoundCloud", zh:'无法识别该链接 — 请尝试使用 YouTube 或 SoundCloud 网址', ja:'そのリンクは認識できませんでした — YouTubeまたはSoundCloudのURLをお試しください', ko:'해당 링크를 인식할 수 없습니다 — YouTube 또는 SoundCloud URL을 시도해 보세요', tl:'Hindi nakilala ang link na iyon — subukan ang YouTube o SoundCloud URL' },
  youtube_placeholder:{ en:'Paste a YouTube video or playlist link', vi:'Dán liên kết video hoặc danh sách phát YouTube', es:'Pega un enlace de video o lista de reproducción de YouTube', fr:'Collez un lien de vidéo ou de playlist YouTube', zh:'粘贴 YouTube 视频或播放列表链接', ja:'YouTubeの動画または再生リストのリンクを貼り付け', ko:'YouTube 동영상 또는 재생목록 링크를 붙여넣으세요', tl:'I-paste ang link ng YouTube video o playlist' },
  youtube_external_msg:{ en:'Opened in a new browser tab.', vi:'Đã mở trong một tab trình duyệt mới.', es:'Se abrió en una nueva pestaña del navegador.', fr:'Ouvert dans un nouvel onglet du navigateur.', zh:'已在新的浏览器标签页中打开。', ja:'新しいブラウザタブで開きました。', ko:'새 브라우저 탭에서 열렸습니다.', tl:'Nabuksan sa bagong tab ng browser.' },
  open_in_youtube:{ en:'Open in YouTube', vi:'Mở trong YouTube', es:'Abrir en YouTube', fr:'Ouvrir dans YouTube', zh:'在 YouTube 中打开', ja:'YouTubeで開く', ko:'YouTube에서 열기', tl:'Buksan sa YouTube' },
  spotify_placeholder:{ en:'Paste a Spotify playlist or track link', vi:'Dán liên kết danh sách phát hoặc bài hát Spotify', es:'Pega un enlace de lista de reproducción o canción de Spotify', fr:'Collez un lien de playlist ou de piste Spotify', zh:'粘贴 Spotify 播放列表或歌曲链接', ja:'Spotifyのプレイリストまたは曲のリンクを貼り付け', ko:'Spotify 재생목록 또는 트랙 링크를 붙여넣으세요', tl:'I-paste ang link ng Spotify playlist o track' },
  spotify_open: { en:'Open in Spotify', vi:'Mở trong Spotify', es:'Abrir en Spotify', fr:'Ouvrir dans Spotify', zh:'在 Spotify 中打开', ja:'Spotifyで開く', ko:'Spotify에서 열기', tl:'Buksan sa Spotify' },
  spotify_note: { en:"Full playback inside this widget would need a Spotify Premium account and your own registered Spotify app (OAuth) — this opens your playlist in Spotify instead. Ask if you'd like that deeper integration built.", vi:'Để phát nhạc trực tiếp trong widget này cần tài khoản Spotify Premium và ứng dụng Spotify do bạn tự đăng ký (OAuth) — thay vào đó, nút này sẽ mở danh sách phát của bạn trong Spotify. Hãy cho tôi biết nếu bạn muốn xây dựng tích hợp sâu hơn.', es:'La reproducción completa dentro de este widget necesitaría una cuenta Spotify Premium y tu propia app de Spotify registrada (OAuth) — en su lugar, esto abre tu lista en Spotify. Avísame si quieres esa integración más profunda.', fr:"Une lecture complète dans ce widget nécessiterait un compte Spotify Premium et votre propre application Spotify enregistrée (OAuth) — ceci ouvre plutôt votre playlist dans Spotify. Dites-le-moi si vous voulez cette intégration plus poussée.", zh:'要在此小组件内完整播放，需要 Spotify Premium 账户和您自己注册的 Spotify 应用（OAuth）— 此按钮会改为在 Spotify 中打开您的播放列表。如果需要更深入的集成，请告诉我。', ja:'このウィジェット内で完全に再生するにはSpotify Premiumアカウントと独自に登録したSpotifyアプリ（OAuth）が必要です — 代わりにこれはSpotifyでプレイリストを開きます。より深い連携が必要な場合はお知らせください。', ko:'이 위젯 안에서 완전히 재생하려면 Spotify Premium 계정과 직접 등록한 Spotify 앱(OAuth)이 필요합니다 — 대신 이 버튼은 Spotify에서 재생목록을 엽니다. 더 깊은 연동이 필요하면 말씀해 주세요.', tl:'Ang buong playback sa loob ng widget na ito ay mangangailangan ng Spotify Premium account at sarili mong nakarehistrong Spotify app (OAuth) — sa halip, bubuksan nito ang playlist mo sa Spotify. Sabihin lang kung gusto mo ng mas malalim na integrasyon.' },

  soundboard:   { en:'🔈 Soundboard', vi:'Bảng âm thanh', es:'Tablero de sonidos', fr:'Table des sons', zh:'音效板', ja:'サウンドボード', ko:'사운드보드', tl:'Soundboard' },
  sfx_add:      { en:'Add sound effects (mp3, wav)', vi:'Thêm hiệu ứng âm thanh (mp3, wav)', es:'Añadir efectos de sonido (mp3, wav)', fr:'Ajouter des effets sonores (mp3, wav)', zh:'添加音效（mp3、wav）', ja:'効果音を追加（mp3、wav）', ko:'효과음 추가 (mp3, wav)', tl:'Magdagdag ng Sound Effect (mp3, wav)' },
  sfx_empty:    { en:'No sounds added yet', vi:'Chưa có âm thanh nào được thêm', es:'Aún no se han añadido sonidos', fr:'Aucun son ajouté pour le moment', zh:'尚未添加音效', ja:'まだ効果音が追加されていません', ko:'아직 추가된 소리가 없습니다', tl:'Wala pang naidaragdag na tunog' },
  sfx_stop:     { en:'Stop', vi:'Dừng', es:'Detener', fr:'Arrêter', zh:'停止', ja:'停止', ko:'정지', tl:'Ihinto' },
  sfx_volume:   { en:'Volume', vi:'Âm lượng', es:'Volumen', fr:'Volume', zh:'音量', ja:'音量', ko:'음량', tl:'Lakas ng Tunog' },

  calendar:     { en:'📅 Calendar', vi:'Lịch', es:'Calendario', fr:'Calendrier', zh:'日历', ja:'カレンダー', ko:'캘린더', tl:'Kalendaryo' },
  cal_manage:   { en:'Manage events', vi:'Quản lý sự kiện', es:'Gestionar eventos', fr:'Gérer les événements', zh:'管理活动', ja:'予定を管理', ko:'일정 관리', tl:'Pamahalaan ang mga Event' },
  cal_back:     { en:'Back to calendar', vi:'Quay lại lịch', es:'Volver al calendario', fr:'Retour au calendrier', zh:'返回日历', ja:'カレンダーに戻る', ko:'캘린더로 돌아가기', tl:'Bumalik sa kalendaryo' },
  cal_today:    { en:'Today', vi:'Hôm nay', es:'Hoy', fr:"Aujourd'hui", zh:'今天', ja:'今日', ko:'오늘', tl:'Ngayon' },
  cal_no_events:{ en:'No events on this day', vi:'Không có sự kiện nào trong ngày này', es:'No hay eventos este día', fr:"Aucun événement ce jour-là", zh:'这一天没有活动', ja:'この日に予定はありません', ko:'이 날짜에는 일정이 없습니다', tl:'Walang event sa araw na ito' },
  cal_add_event:{ en:'Add event', vi:'Thêm sự kiện', es:'Añadir evento', fr:'Ajouter un événement', zh:'添加活动', ja:'予定を追加', ko:'일정 추가', tl:'Magdagdag ng Event' },
  cal_edit_event:{ en:'Edit event', vi:'Sửa sự kiện', es:'Editar evento', fr:"Modifier l'événement", zh:'编辑活动', ja:'予定を編集', ko:'일정 수정', tl:'I-edit ang Event' },
  cal_title:    { en:'Title', vi:'Tiêu đề', es:'Título', fr:'Titre', zh:'标题', ja:'タイトル', ko:'제목', tl:'Pamagat' },
  cal_date:     { en:'Date', vi:'Ngày', es:'Fecha', fr:'Date', zh:'日期', ja:'日付', ko:'날짜', tl:'Petsa' },
  cal_time:     { en:'Time (optional)', vi:'Giờ (không bắt buộc)', es:'Hora (opcional)', fr:'Heure (facultatif)', zh:'时间（可选）', ja:'時間（任意）', ko:'시간 (선택사항)', tl:'Oras (opsyonal)' },
  cal_reminder: { en:'Reminder', vi:'Nhắc nhở', es:'Recordatorio', fr:'Rappel', zh:'提醒', ja:'リマインダー', ko:'알림', tl:'Paalala' },
  cal_rem_none: { en:'No reminder', vi:'Không nhắc', es:'Sin recordatorio', fr:'Aucun rappel', zh:'不提醒', ja:'リマインダーなし', ko:'알림 없음', tl:'Walang paalala' },
  cal_rem_at:   { en:'At event time', vi:'Đúng giờ sự kiện', es:'A la hora del evento', fr:"À l'heure de l'événement", zh:'活动开始时', ja:'予定の時刻に', ko:'일정 시각에', tl:'Sa oras ng event' },
  cal_rem_5:    { en:'5 minutes before', vi:'Trước 5 phút', es:'5 minutos antes', fr:'5 minutes avant', zh:'提前5分钟', ja:'5分前', ko:'5분 전', tl:'5 minuto bago' },
  cal_rem_15:   { en:'15 minutes before', vi:'Trước 15 phút', es:'15 minutos antes', fr:'15 minutes avant', zh:'提前15分钟', ja:'15分前', ko:'15분 전', tl:'15 minuto bago' },
  cal_rem_30:   { en:'30 minutes before', vi:'Trước 30 phút', es:'30 minutos antes', fr:'30 minutes avant', zh:'提前30分钟', ja:'30分前', ko:'30분 전', tl:'30 minuto bago' },
  cal_rem_60:   { en:'1 hour before', vi:'Trước 1 giờ', es:'1 hora antes', fr:'1 heure avant', zh:'提前1小时', ja:'1時間前', ko:'1시간 전', tl:'1 oras bago' },
  cal_notes:    { en:'Notes (optional)', vi:'Ghi chú (không bắt buộc)', es:'Notas (opcional)', fr:'Notes (facultatif)', zh:'备注（可选）', ja:'メモ（任意）', ko:'메모 (선택사항)', tl:'Mga Tala (opsyonal)' },
  cal_save:     { en:'Save event', vi:'Lưu sự kiện', es:'Guardar evento', fr:"Enregistrer l'événement", zh:'保存活动', ja:'予定を保存', ko:'일정 저장', tl:'I-save ang Event' },
  cal_cancel:   { en:'Cancel', vi:'Hủy', es:'Cancelar', fr:'Annuler', zh:'取消', ja:'キャンセル', ko:'취소', tl:'Kanselahin' },
  cal_all_events:{ en:'All events', vi:'Tất cả sự kiện', es:'Todos los eventos', fr:'Tous les événements', zh:'所有活动', ja:'すべての予定', ko:'모든 일정', tl:'Lahat ng Event' },
  cal_none_yet: { en:'No events yet', vi:'Chưa có sự kiện nào', es:'Aún no hay eventos', fr:"Pas encore d'événement", zh:'暂无活动', ja:'まだ予定はありません', ko:'아직 일정이 없습니다', tl:'Wala pang event' },
  cal_add_to_google:{ en:'Add to Google Calendar', vi:'Thêm vào Google Calendar', es:'Añadir a Google Calendar', fr:'Ajouter à Google Agenda', zh:'添加到 Google 日历', ja:'Googleカレンダーに追加', ko:'Google 캘린더에 추가', tl:'Idagdag sa Google Calendar' },
  cal_import_ics:{ en:'Import from Google Calendar (.ics file)', vi:'Nhập từ Google Calendar (tệp .ics)', es:'Importar desde Google Calendar (archivo .ics)', fr:'Importer depuis Google Agenda (fichier .ics)', zh:'从 Google 日历导入（.ics 文件）', ja:'Googleカレンダーからインポート（.icsファイル）', ko:'Google 캘린더에서 가져오기 (.ics 파일)', tl:'Mag-import mula sa Google Calendar (.ics file)' },
  cal_import_hint:{ en:'In Google Calendar, export a calendar or event as .ics, then add the file here.', vi:'Trong Google Calendar, xuất lịch hoặc sự kiện dưới dạng .ics, rồi thêm tệp đó vào đây.', es:'En Google Calendar, exporta un calendario o evento como .ics y añádelo aquí.', fr:'Dans Google Agenda, exportez un agenda ou un événement en .ics, puis ajoutez le fichier ici.', zh:'在 Google 日历中将日历或活动导出为 .ics 文件，然后在此处添加。', ja:'Googleカレンダーでカレンダーや予定を.ics形式でエクスポートし、ここに追加してください。', ko:'Google 캘린더에서 캘린더나 일정을 .ics로 내보낸 후 여기에 추가하세요.', tl:'Sa Google Calendar, i-export ang kalendaryo o event bilang .ics, tapos idagdag ang file dito.' },
  cal_import_done:{ en:'Imported {n} event(s)', vi:'Đã nhập {n} sự kiện', es:'Se importaron {n} evento(s)', fr:'{n} événement(s) importé(s)', zh:'已导入 {n} 个活动', ja:'{n}件の予定をインポートしました', ko:'{n}개의 일정을 가져왔습니다', tl:'Na-import ang {n} event' },
  cal_enable_notifs:{ en:'Enable desktop notifications', vi:'Bật thông báo trên máy tính', es:'Activar notificaciones de escritorio', fr:'Activer les notifications', zh:'启用桌面通知', ja:'デスクトップ通知を有効にする', ko:'데스크톱 알림 사용', tl:'I-enable ang desktop notifications' },
  cal_notifs_on:{ en:'Desktop notifications enabled', vi:'Đã bật thông báo trên máy tính', es:'Notificaciones de escritorio activadas', fr:'Notifications activées', zh:'桌面通知已启用', ja:'デスクトップ通知が有効になりました', ko:'데스크톱 알림이 활성화되었습니다', tl:'Na-enable na ang desktop notifications' },
  cal_notifs_denied:{ en:'Notifications are blocked — enable them in your browser settings', vi:'Thông báo đang bị chặn — hãy bật trong cài đặt trình duyệt', es:'Las notificaciones están bloqueadas — actívalas en la configuración del navegador', fr:'Les notifications sont bloquées — activez-les dans les paramètres du navigateur', zh:'通知已被阻止 — 请在浏览器设置中启用', ja:'通知がブロックされています — ブラウザの設定で有効にしてください', ko:'알림이 차단되어 있습니다 — 브라우저 설정에서 활성화하세요', tl:'Naka-block ang mga notification — i-enable ito sa settings ng browser' },
  reminder_popup_title:{ en:'Event reminder', vi:'Nhắc nhở sự kiện', es:'Recordatorio de evento', fr:"Rappel d'événement", zh:'活动提醒', ja:'予定のリマインダー', ko:'일정 알림', tl:'Paalala sa Event' },
  cal_untitled: { en:'(untitled event)', vi:'(sự kiện chưa đặt tên)', es:'(evento sin título)', fr:'(événement sans titre)', zh:'（未命名活动）', ja:'（無題の予定）', ko:'(제목 없는 일정)', tl:'(walang pamagat na event)' },
  dismiss:      { en:'Dismiss', vi:'Đóng thông báo', es:'Descartar', fr:'Ignorer', zh:'关闭提醒', ja:'閉じる', ko:'닫기', tl:'Isara ang paalala' },

  pro_section_title: { en:'TeachersDeck Pro', vi:'TeachersDeck Pro' },
  pro_status_free: { en:'You\'re on the Free plan', vi:'Bạn đang dùng gói Miễn phí' },
  pro_status_pro: { en:'Pro unlocked — thank you!', vi:'Đã mở khóa Pro — cảm ơn bạn!' },
  pro_upgrade_btn: { en:'Upgrade to Pro', vi:'Nâng cấp lên Pro' },
  pro_license_label: { en:'Already purchased? Enter your license key', vi:'Đã mua rồi? Nhập mã bản quyền của bạn' },
  pro_license_placeholder: { en:'TDPRO-XXXX-XXXX-XXXX', vi:'TDPRO-XXXX-XXXX-XXXX' },
  pro_activate_btn: { en:'Activate', vi:'Kích hoạt' },
  pro_license_invalid: { en:'That license key isn\'t valid', vi:'Mã bản quyền không hợp lệ' },
  pro_license_valid: { en:'Pro unlocked on this device', vi:'Đã mở khóa Pro trên thiết bị này' },
  pro_license_checking: { en:'Checking…', vi:'Đang kiểm tra…' },
  pro_license_device_mismatch: { en:'That key is already activated on a different device. If this is your own computer (for example you reinstalled or reloaded the extension), ask us to release the key and try again.', vi:'Mã này đã được kích hoạt trên một thiết bị khác. Nếu đây là máy của bạn (ví dụ bạn đã cài lại hoặc tải lại tiện ích), hãy nhờ chúng tôi giải phóng mã rồi thử lại.' },
  pro_license_revoked: { en:'This license is no longer valid — Pro features have been turned off', vi:'Mã bản quyền này không còn hiệu lực — các tính năng Pro đã bị tắt' },
  pro_license_expired: { en:'Your subscription has expired — renew to keep Pro features', vi:'Gói đăng ký của bạn đã hết hạn — gia hạn để tiếp tục dùng tính năng Pro' },
  pro_license_network_error: { en:'Couldn\'t reach the license server — check your connection and try again', vi:'Không thể kết nối máy chủ cấp phép — kiểm tra kết nối mạng và thử lại' },
  pro_modal_title: { en:'Upgrade to TeachersDeck Pro', vi:'Nâng cấp lên TeachersDeck Pro' },
  pro_modal_subtitle: { en:'Monthly or annual subscription. Unlocks on this browser.', vi:'Đăng ký theo tháng hoặc theo năm. Mở khóa trên trình duyệt này.' },
  pro_close: { en:'Close', vi:'Đóng' },
  plan_free_title: { en:'Free', vi:'Miễn phí' },
  plan_pro_title: { en:'Pro', vi:'Pro' },
  plan_free_f1: { en:'Clock, timer & stopwatch', vi:'Đồng hồ, hẹn giờ & bấm giờ' },
  plan_free_f2: { en:'Built-in calendar', vi:'Lịch tích hợp' },
  plan_free_f3: { en:'Lesson files on this device', vi:'Tệp bài học trên thiết bị này' },
  plan_pro_f1: { en:'Everything in Free', vi:'Tất cả tính năng của gói Miễn phí' },
  plan_pro_f2: { en:'Traffic light, dice, checklist, scoreboard, poll, noise meter', vi:'Đèn giao thông, xúc xắc, danh sách việc, bảng điểm, khảo sát, đo tiếng ồn' },
  plan_pro_f3: { en:'Games, music & video player, soundboard', vi:'Trò chơi, nhạc & video, bảng âm thanh' },
  plan_pro_f4: { en:'Custom background & side drawer customization', vi:'Ảnh nền tùy chỉnh & tùy chỉnh ngăn kéo bên' },
  pay_tab_vietqr: { en:'VietQR (Bank transfer)', vi:'VietQR (Chuyển khoản)' },
  pay_tab_card: { en:'{label}', vi:'{label}' },
  pay_bank_transfer_heading: { en:'Pay by Bank Transfer', vi:'Thanh toán qua chuyển khoản' },
  pay_step1_heading: { en:'Step 1 — Fill out the order form', vi:'Bước 1 — Điền phiếu đặt mua' },
  pay_step1_copy: { en:'Tell us who the license is for. It opens in a new tab.', vi:'Cho chúng tôi biết mã bản quyền dành cho ai. Biểu mẫu mở trong tab mới.' },
  pay_step1_btn: { en:'Open the order form', vi:'Mở phiếu đặt mua' },
  pay_step1_done: { en:'Already submitted the form? Continue to payment', vi:'Đã gửi biểu mẫu? Tiếp tục thanh toán' },
  pay_step2_heading: { en:'Step 2 — Pay by Bank Transfer', vi:'Bước 2 — Thanh toán qua chuyển khoản' },
  vietqr_instructions: { en:'Scan with any Vietnamese banking app to pay {price}. Use the same email you entered on the order form so we can match your payment and send your license key.', vi:'Quét bằng ứng dụng ngân hàng bất kỳ để thanh toán {price}. Dùng cùng email bạn đã điền trong phiếu đặt mua để chúng tôi đối chiếu thanh toán và gửi mã bản quyền.' },
  vietqr_not_configured: { en:'Payments are switched off in this beta build.', vi:'Bản thử nghiệm này đã tắt tính năng thanh toán.' },
  vietqr_swift_label: { en:'SWIFT', vi:'SWIFT' },
  card_instructions: { en:'Pay {price} securely by card.', vi:'Thanh toán {price} an toàn bằng thẻ.' },
  pay_card_btn: { en:'Pay with {label}', vi:'Thanh toán bằng {label}' },
  card_not_configured: { en:'Card payment isn\'t set up yet — add a payment link in js/app.js (search STRIPE_PAYMENT_LINK).', vi:'Thanh toán bằng thẻ chưa được thiết lập — thêm liên kết thanh toán trong js/app.js (tìm STRIPE_PAYMENT_LINK).' },
  pro_locked_hint: { en:'This is a Pro feature.', vi:'Đây là tính năng của Pro.' },

  /* ---- Wave 1 widgets ---- */
  attendance:   { en:'🙋 Attendance Tracker', vi:'Điểm danh' },
  att_present:  { en:'Present', vi:'Có mặt' },
  att_absent:   { en:'Absent', vi:'Vắng' },
  att_late:     { en:'Late', vi:'Trễ' },
  att_export:   { en:'Export day (.csv)', vi:'Xuất ngày (.csv)' },
  att_no_roster:{ en:'Add students under Settings → Class list first.', vi:'Hãy thêm học sinh trong Cài đặt → Danh sách lớp trước.' },
  att_date_label:{ en:'Date', vi:'Ngày' },
  att_summary:  { en:'{present} present · {absent} absent · {late} late', vi:'{present} có mặt · {absent} vắng · {late} trễ' },

  groupmaker:   { en:'🔀 Group Maker', vi:'Chia nhóm' },
  gm_mode_groups:{ en:'Number of groups', vi:'Số nhóm' },
  gm_mode_size: { en:'Students per group', vi:'Số học sinh mỗi nhóm' },
  gm_shuffle:   { en:'Shuffle', vi:'Xáo trộn' },
  gm_no_roster: { en:'Add students under Settings → Class list first.', vi:'Hãy thêm học sinh trong Cài đặt → Danh sách lớp trước.' },
  gm_group_label:{ en:'Group {n}', vi:'Nhóm {n}' },

  exitticket:   { en:'🎫 Exit Ticket', vi:'Phiếu ra lớp' },
  et_question_placeholder:{ en:'Type today\'s check-in question…', vi:'Nhập câu hỏi kiểm tra nhanh hôm nay…' },
  et_got_it:    { en:'Got it', vi:'Đã hiểu' },
  et_almost:    { en:'Almost', vi:'Gần hiểu' },
  et_need_help: { en:'Need help', vi:'Cần giúp đỡ' },
  et_hint:      { en:'Tap a button once per raised hand', vi:'Chạm một lần cho mỗi tay giơ lên' },
  et_reset:     { en:'Reset tally', vi:'Đặt lại số đếm' },

  agenda:       { en:'📋 Agenda Board', vi:'Bảng chương trình' },
  agenda_schedule_label:{ en:'Today\'s schedule', vi:'Lịch trình hôm nay' },
  agenda_objective_label:{ en:'Objective', vi:'Mục tiêu' },
  agenda_donow_label:{ en:'Do now', vi:'Bắt đầu ngay' },
  agenda_schedule_placeholder:{ en:'e.g. 9:00 warm-up · 9:15 grammar · 9:40 practice', vi:'ví dụ: 9:00 khởi động · 9:15 ngữ pháp · 9:40 luyện tập' },
  agenda_objective_placeholder:{ en:'Students will be able to…', vi:'Học sinh sẽ có thể…' },
  agenda_donow_placeholder:{ en:'Write today\'s date and one new word you know', vi:'Viết ngày hôm nay và một từ mới bạn biết' },

  qrcode:       { en:'🔳 QR Code Generator', vi:'Tạo mã QR' },
  qr_placeholder:{ en:'Paste a link or type text…', vi:'Dán liên kết hoặc nhập văn bản…' },
  qr_generate:  { en:'Generate', vi:'Tạo mã' },
  qr_hint:      { en:'Generated entirely on this device — nothing is sent anywhere.', vi:'Được tạo hoàn toàn trên thiết bị này — không gửi đi đâu cả.' },
  qr_download:  { en:'Download PNG', vi:'Tải xuống PNG' },
  qr_empty:     { en:'Enter a link or some text first', vi:'Hãy nhập liên kết hoặc văn bản trước' },

  countdown:    { en:'⏳ Days-Until Countdown', vi:'Đếm ngược ngày' },
  cd_label_placeholder:{ en:'What are we counting down to?', vi:'Đếm ngược đến sự kiện nào?' },
  cd_date_label:{ en:'Date', vi:'Ngày' },
  cd_days_left: { en:'{n} days to go', vi:'Còn {n} ngày' },
  cd_one_day:   { en:'1 day to go', vi:'Còn 1 ngày' },
  cd_today:     { en:'Today!', vi:'Hôm nay!' },
  cd_past:      { en:'That date has passed', vi:'Ngày đó đã qua' },
  cd_set_prompt:{ en:'Set a date below to start the countdown', vi:'Chọn ngày bên dưới để bắt đầu đếm ngược' },

  hallpass:     { en:'🚪 Hall Pass Tracker', vi:'Theo dõi ra ngoài' },
  hp_student_label:{ en:'Student', vi:'Học sinh' },
  hp_dest_placeholder:{ en:'Destination (restroom, office…)', vi:'Nơi đến (nhà vệ sinh, văn phòng…)' },
  hp_send_out:  { en:'Send out', vi:'Cho ra ngoài' },
  hp_return:    { en:'Mark returned', vi:'Đánh dấu đã về' },
  hp_out_since: { en:'{name} — out to {dest}', vi:'{name} — đang đến {dest}' },
  hp_log_title: { en:'Today\'s log', vi:'Nhật ký hôm nay' },
  hp_no_roster: { en:'Add students under Settings → Class list first.', vi:'Hãy thêm học sinh trong Cài đặt → Danh sách lớp trước.' },
  hp_busy:      { en:'Someone is already out — mark them returned first.', vi:'Đã có học sinh ra ngoài — hãy đánh dấu đã về trước.' },
  hp_clear_log: { en:'Clear log', vi:'Xóa nhật ký' },

  readinglog:   { en:'📖 Reading Timer & Log', vi:'Hẹn giờ & nhật ký đọc sách' },
  rl_minutes_label:{ en:'Silent reading minutes', vi:'Số phút đọc thầm' },
  rl_log_title: { en:'Reading log', vi:'Nhật ký đọc sách' },
  rl_student_placeholder:{ en:'Student name', vi:'Tên học sinh' },
  rl_note_placeholder:{ en:'Book / notes (optional)', vi:'Sách / ghi chú (tuỳ chọn)' },
  rl_log_entry: { en:'{name} — {min} min', vi:'{name} — {min} phút' },
  rl_clear_log: { en:'Clear log', vi:'Xóa nhật ký' },

  ttsreader:    { en:'🗣️ Text-to-Speech Reader', vi:'Đọc văn bản' },
  tts_placeholder:{ en:'Paste or type text to read aloud…', vi:'Dán hoặc nhập văn bản để đọc to…' },
  tts_play:     { en:'Read aloud', vi:'Đọc to' },
  tts_stop:     { en:'Stop', vi:'Dừng' },
  tts_speed:    { en:'Speed', vi:'Tốc độ' },
  tts_voice:    { en:'Voice', vi:'Giọng đọc' },
  tts_unsupported:{ en:'Text-to-speech isn\'t supported in this browser.', vi:'Trình duyệt này không hỗ trợ đọc văn bản.' },

  unitconverter:{ en:'🔁 Unit Converter', vi:'Đổi đơn vị' },
  uc_category:  { en:'Category', vi:'Loại' },
  uc_length:    { en:'Length', vi:'Chiều dài' },
  uc_weight:    { en:'Weight', vi:'Cân nặng' },
  uc_temperature:{ en:'Temperature', vi:'Nhiệt độ' },
  uc_currency:  { en:'Currency', vi:'Tiền tệ' },
  uc_currency_note:{ en:'Approximate fixed rates, not live — for classroom estimates only.', vi:'Tỷ giá cố định gần đúng, không cập nhật trực tiếp — chỉ để ước tính trong lớp.' },

  announcements:{ en:'📣 Announcements Board', vi:'Bảng thông báo' },
  ann_placeholder:{ en:'Write an announcement…', vi:'Viết thông báo…' },
  ann_pin:      { en:'Pin', vi:'Ghim' },
  ann_expiry:   { en:'Auto-expire after', vi:'Tự ẩn sau' },
  ann_no_expiry:{ en:'Never', vi:'Không bao giờ' },
  ann_post:     { en:'Post', vi:'Đăng' },
  ann_empty:    { en:'No announcements yet.', vi:'Chưa có thông báo nào.' },
  ann_pinned_badge:{ en:'Pinned', vi:'Đã ghim' },

  instructions: { en:'📝 Instructions Display', vi:'Bảng hướng dẫn' },
  ins_title_placeholder:{ en:'Activity title (optional)', vi:'Tên hoạt động (tuỳ chọn)' },
  ins_step_placeholder:{ en:'Step text…', vi:'Nội dung bước…' },
  ins_add_step: { en:'Add step', vi:'Thêm bước' },
  ins_step_of:  { en:'Step {cur} of {total}', vi:'Bước {cur} / {total}' },
  ins_prev:     { en:'Previous', vi:'Trước' },
  ins_next:     { en:'Next', vi:'Tiếp theo' },
  ins_edit:     { en:'Edit steps', vi:'Chỉnh sửa các bước' },
  ins_done_editing:{ en:'Done editing', vi:'Xong chỉnh sửa' },
  ins_empty:    { en:'Add steps to build a set of directions.', vi:'Thêm các bước để tạo hướng dẫn.' },
  ins_show_vi:  { en:'Show Vietnamese below the English', vi:'Hiện tiếng Việt bên dưới tiếng Anh' },
  ins_auto_vi:  { en:'Auto-translate new steps to Vietnamese', vi:'Tự động dịch các bước mới sang tiếng Việt' },
  ins_translate:{ en:'Translate to Vietnamese', vi:'Dịch sang tiếng Việt' },
  ins_translate_all:{ en:'🌐 Translate all steps to Vietnamese', vi:'🌐 Dịch tất cả các bước sang tiếng Việt' },
  ins_vi_placeholder:{ en:'Vietnamese translation (you can edit it)…', vi:'Bản dịch tiếng Việt (có thể chỉnh sửa)…' },
  ins_vi_toggle:{ en:'Vietnamese', vi:'Tiếng Việt' },
  ins_title_vi_placeholder:{ en:'Vietnamese title (you can edit it)…', vi:'Tiêu đề tiếng Việt (có thể chỉnh sửa)…' },
  ins_view_all:{ en:'All steps', vi:'Tất cả các bước' },
  ins_view_one:{ en:'One at a time', vi:'Từng bước một' },
  ins_translate_failed:{ en:"Couldn't translate — check your internet connection, or type the Vietnamese yourself.", vi:'Không dịch được — kiểm tra kết nối mạng, hoặc tự nhập tiếng Việt.' },

  convocards:   { en:'💬 Conversation Starter Cards', vi:'Thẻ gợi ý hội thoại' },
  cc_topic_label:{ en:'Topic', vi:'Chủ đề' },
  cc_difficulty_label:{ en:'Difficulty', vi:'Độ khó' },
  cc_all:       { en:'All', vi:'Tất cả' },
  cc_next_card: { en:'Next card', vi:'Thẻ tiếp theo' },
  cc_diff_easy: { en:'Easy', vi:'Dễ' },
  cc_diff_medium:{ en:'Medium', vi:'Trung bình' },
  cc_diff_hard: { en:'Hard', vi:'Khó' },

  idiomday:     { en:'💡 Idiom of the Day', vi:'Thành ngữ hôm nay' },
  idiom_meaning:{ en:'Meaning', vi:'Ý nghĩa' },
  idiom_example:{ en:'Example', vi:'Ví dụ' },
  idiom_shuffle:{ en:'Show another', vi:'Xem thành ngữ khác' },
  idiom_back_today:{ en:'Back to today', vi:'Quay lại hôm nay' },

  grammarref:   { en:'📚 Grammar Quick-Reference', vi:'Tra cứu ngữ pháp nhanh' },
  gr_rule:      { en:'Rule', vi:'Quy tắc' },
  gr_examples:  { en:'Examples', vi:'Ví dụ' },

  assignments:       { en:'Assignments', vi:'Bài tập' },
  asg_new:           { en:'New assignment', vi:'Bài tập mới' },
  asg_title:         { en:'Title', vi:'Tiêu đề' },
  asg_subject:       { en:'Subject', vi:'Môn học' },
  asg_due_date:      { en:'Due date', vi:'Hạn nộp' },
  asg_due_time:      { en:'Due time', vi:'Giờ hạn nộp' },
  asg_points:        { en:'Points', vi:'Điểm' },
  asg_instructions:  { en:'Instructions', vi:'Hướng dẫn' },
  asg_push:          { en:'Push to class', vi:'Gửi tới lớp' },
  asg_save:          { en:'Save assignment', vi:'Lưu bài tập' },
  asg_cancel:        { en:'Cancel', vi:'Hủy' },
  asg_edit:          { en:'Edit assignment', vi:'Sửa bài tập' },
  asg_none_yet:      { en:'No assignments yet — create one above.', vi:'Chưa có bài tập nào — hãy tạo một bài ở trên.' },
  asg_list_title:    { en:'All assignments', vi:'Tất cả bài tập' },
  asg_due_label:     { en:'Due', vi:'Hạn' },
  asg_no_due:        { en:'No due date', vi:'Không có hạn' },
  asg_synced:        { en:'Synced to class', vi:'Đã đồng bộ với lớp' },
  asg_not_synced:    { en:'Not connected to a cloud class — link one in Cloud Class to push this to students', vi:'Chưa kết nối lớp trên đám mây — liên kết trong Cloud Class để gửi bài tập này cho học sinh' },
  asg_calendar_link: { en:'Also adds a due-date event to the Calendar', vi:'Cũng thêm sự kiện hạn nộp vào Lịch' },
  asg_delete_confirm:{ en:'Delete this assignment? It will also be removed from students\u2019 homework list and the calendar.', vi:'Xóa bài tập này? Bài tập cũng sẽ bị xóa khỏi danh sách bài tập của học sinh và khỏi lịch.' },
  cal_assignment_tag:{ en:'Assignment', vi:'Bài tập' },

  progressreports:    { en:'Progress Reports', vi:'Báo cáo tiến bộ' },
  pr_new:             { en:'New report', vi:'Báo cáo mới' },
  pr_student:         { en:'Student', vi:'Học sinh' },
  pr_student_hint:    { en:'From your Cloud Class roster — connect Cloud Class first if this is empty.', vi:'Từ danh sách lớp trên Cloud Class — hãy kết nối Cloud Class trước nếu danh sách trống.' },
  pr_no_roster:       { en:'Connect Cloud Class under the Cloud Class widget to see your students here.', vi:'Hãy kết nối Cloud Class trong tiện ích Cloud Class để thấy học sinh ở đây.' },
  pr_skills:          { en:'Skills', vi:'Kỹ năng' },
  pr_improve:         { en:'Things to improve', vi:'Điều cần cải thiện' },
  pr_strengths:       { en:'Strengths', vi:'Điểm mạnh' },
  pr_next_focus:      { en:'Next Learning Focus', vi:'Trọng tâm học tập tiếp theo' },
  pr_score:           { en:'Overall Performance — Score', vi:'Kết quả chung — Điểm số' },
  pr_score_out_of:    { en:'out of 10', vi:'trên 10' },
  pr_frequency:       { en:'Report frequency', vi:'Tần suất báo cáo' },
  pr_weekly:          { en:'Weekly', vi:'Hằng tuần' },
  pr_biweekly:        { en:'Bi-weekly', vi:'Hai tuần một lần' },
  pr_monthly:         { en:'Monthly', vi:'Hằng tháng' },
  pr_start_date:      { en:'Start date for the first report', vi:'Ngày bắt đầu báo cáo đầu tiên' },
  pr_calendar_link:   { en:'Also schedules this report\\u2019s future dates on the Calendar, as reminders to come back and fill each one in.', vi:'Cũng lên lịch các ngày báo cáo tiếp theo trên Lịch, như lời nhắc để quay lại điền từng báo cáo.' },
  pr_send:            { en:'Send to ParentDeck', vi:'Gửi tới ParentDeck' },
  pr_cancel:          { en:'Cancel', vi:'Hủy' },
  pr_back:            { en:'Back', vi:'Quay lại' },
  pr_none_yet:        { en:'No progress reports sent yet — create one above.', vi:'Chưa có báo cáo tiến bộ nào — hãy tạo một báo cáo ở trên.' },
  pr_list_title:      { en:'Sent reports', vi:'Báo cáo đã gửi' },
  pr_sent_label:      { en:'Sent', vi:'Đã gửi' },
  pr_synced:          { en:'Sent to ParentDeck', vi:'Đã gửi tới ParentDeck' },
  pr_not_synced:      { en:'Saved here, but not connected to a cloud class — link one in Cloud Class to actually send this to the parent', vi:'Đã lưu ở đây, nhưng chưa kết nối lớp trên đám mây — hãy liên kết trong Cloud Class để gửi báo cáo này tới phụ huynh' },
  pr_delete_confirm:  { en:'Delete this progress report? Its scheduled calendar reminders will be removed too; it will stay visible to the parent in ParentDeck since it was already sent.', vi:'Xóa báo cáo tiến bộ này? Các lời nhắc trên lịch cũng sẽ bị xóa; báo cáo vẫn hiển thị cho phụ huynh trong ParentDeck vì đã được gửi.' },
  pr_select_student:  { en:'Choose a student', vi:'Chọn một học sinh' },
  pr_select_frequency:{ en:'Pick a frequency', vi:'Chọn một tần suất' },
  cal_progress_report_tag: { en:'Progress Report', vi:'Báo cáo tiến bộ' },

  meet:              { en:'📹 Google Meet', vi:'Google Meet' },
  meet_start_new:    { en:'Start a new Meet', vi:'Bắt đầu Meet mới' },
  meet_join_saved:   { en:'Join class Meet', vi:'Tham gia Meet của lớp' },
  meet_link_label:   { en:'Class Meet link (reused every time)', vi:'Liên kết Meet của lớp (dùng lại mỗi lần)' },
  meet_link_ph:      { en:'Paste your meet.google.com/xxx-xxxx-xxx link here', vi:'Dán liên kết meet.google.com/xxx-xxxx-xxx vào đây' },
  meet_save:         { en:'Save link', vi:'Lưu liên kết' },
  meet_saved:        { en:'Saved \u2014 this link opens every time you tap "Join class Meet."', vi:'Đã lưu \u2014 liên kết này sẽ mở mỗi khi bạn nhấn "Tham gia Meet của lớp."' },
  meet_clear:        { en:'Remove saved link', vi:'Xóa liên kết đã lưu' },
  meet_no_link_hint: { en:'No class link saved yet. Click "Start a new Meet," then copy the meeting URL Google gives you back into the field below \u2014 that turns it into your class\u2019s reusable link.', vi:'Chưa lưu liên kết lớp. Nhấn "Bắt đầu Meet mới," sau đó sao chép URL cuộc họp mà Google cung cấp vào ô bên dưới \u2014 thao tác này biến nó thành liên kết dùng lại của lớp bạn.' },
  meet_show_qr:      { en:'Show QR to join', vi:'Hiện mã QR để tham gia' },
  meet_new_tab_hint: { en:'Opens in a new tab \u2014 Google doesn\u2019t allow Meet calls to run inside another site.', vi:'Mở ở tab mới \u2014 Google không cho phép cuộc gọi Meet chạy trong một trang khác.' },
  meet_invalid_link: { en:'That doesn\u2019t look like a meet.google.com link.', vi:'Liên kết này có vẻ không phải từ meet.google.com.' }
};

/* v0.14.0 strings: categories, Stats & XP, document tracking. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  cat_time:     { en:'Time', vi:'Thời gian', es:'Tiempo', fr:'Temps', zh:'时间', ja:'時間', ko:'시간', tl:'Oras' },
  cat_media:    { en:'Media', vi:'Đa phương tiện', es:'Multimedia', fr:'Médias', zh:'媒体', ja:'メディア', ko:'미디어', tl:'Media' },
  cat_tools:    { en:'Classroom tools', vi:'Công cụ lớp học', es:'Herramientas de aula', fr:'Outils de classe', zh:'课堂工具', ja:'授業ツール', ko:'수업 도구', tl:'Gamit sa klase' },
  cat_language: { en:'Language', vi:'Ngôn ngữ', es:'Idiomas', fr:'Langue', zh:'语言', ja:'言語', ko:'언어', tl:'Wika' },
  cat_cloud:    { en:'Cloud classroom', vi:'Lớp học đám mây', es:'Aula en la nube', fr:'Classe cloud', zh:'云课堂', ja:'クラウド教室', ko:'클라우드 교실', tl:'Cloud classroom' },
  noteshome:           { en:'✉️ Notes Home', vi:'✉️ Ghi chú gửi phụ huynh' },
  nh_need_cloud:       { en:'Notes Home sends notes to parents through your cloud class. Link a cloud class first.', vi:'Ghi chú gửi phụ huynh được gửi qua lớp học đám mây của bạn. Hãy liên kết một lớp trước.' },
  nh_open_cloudclass:  { en:'Open Cloud Class', vi:'Mở Cloud Class' },
  nh_privacy:          { en:'Private to each student\u2019s parents — not shown to the student or other families.', vi:'Chỉ phụ huynh của từng học sinh thấy — học sinh và các gia đình khác không thấy.' },
  nh_sign_as:          { en:'Sign notes as', vi:'Ký tên ghi chú là' },
  nh_sign_as_ph:       { en:'e.g. Ms. Linh', vi:'ví dụ: Cô Linh' },
  nh_sign_as_hint:     { en:'Parents see your class name and this name.', vi:'Phụ huynh sẽ thấy tên lớp và tên này.' },
  nh_send_to:          { en:'Send to', vi:'Gửi cho' },
  nh_all:              { en:'Select all', vi:'Chọn tất cả' },
  nh_none:             { en:'None', vi:'Bỏ chọn' },
  nh_selected:         { en:'{n} selected', vi:'Đã chọn {n}' },
  nh_no_students:      { en:'No students have joined yet.', vi:'Chưa có học sinh nào tham gia.' },
  nh_mood:             { en:'Mood', vi:'Cảm xúc' },
  nh_smiley:           { en:'🙂 Smiley', vi:'🙂 Mặt cười' },
  nh_frowny:           { en:'🙁 Frowny', vi:'🙁 Mặt buồn' },
  nh_text_ph:          { en:'Write a short note for the parent…', vi:'Viết một ghi chú ngắn cho phụ huynh…' },
  nh_send:             { en:'📨 Send note', vi:'📨 Gửi ghi chú' },
  nh_sending:          { en:'Sending…', vi:'Đang gửi…' },
  nh_sent_one:         { en:'Note sent.', vi:'Đã gửi ghi chú.' },
  nh_sent_many:        { en:'Notes sent to {n} students.', vi:'Đã gửi ghi chú cho {n} học sinh.' },
  nh_err_students:     { en:'Pick at least one student.', vi:'Hãy chọn ít nhất một học sinh.' },
  nh_err_mood:         { en:'Pick a smiley or a frowny face.', vi:'Hãy chọn mặt cười hoặc mặt buồn.' },
  nh_err_frowny_text:  { en:'A frowny note needs a few words so the parent knows what happened.', vi:'Ghi chú mặt buồn cần vài dòng để phụ huynh biết chuyện gì đã xảy ra.' },
  nh_none_yet:         { en:'No notes sent yet.', vi:'Chưa gửi ghi chú nào.' },
  nh_unread_count:     { en:'{n} unread', vi:'{n} chưa đọc' },
  nh_status_sent:      { en:'📨 Sent', vi:'📨 Đã gửi' },
  nh_status_read:      { en:'✅ Read {time}', vi:'✅ Đã đọc {time}' },
  nh_sent_at:          { en:'Sent {time}', vi:'Gửi lúc {time}' },
  nh_delete_tip:       { en:'Take back this note (only while it is unread)', vi:'Thu hồi ghi chú (chỉ khi chưa được đọc)' },
  nh_delete_confirm:   { en:'Delete this note? The parent has not opened it yet, so they will never see it.', vi:'Xóa ghi chú này? Phụ huynh chưa mở nên sẽ không bao giờ thấy nó.' },
  nh_delete_failed:    { en:'A parent has just opened this note, so it can’t be taken back. Send a follow-up note instead.', vi:'Phụ huynh vừa mở ghi chú này nên không thể thu hồi. Hãy gửi một ghi chú bổ sung.' },
  nh_load_failed:      { en:'Couldn’t load sent notes — the cloud backend may need updating.', vi:'Không tải được các ghi chú đã gửi — có thể cần cập nhật backend đám mây.' },
  nh_backend_old:      { en:'Notes Home needs the v1.3.0 backend update. Ask whoever manages your Firebase project to deploy it.', vi:'Ghi chú gửi phụ huynh cần bản cập nhật backend v1.3.0. Hãy nhờ người quản lý dự án Firebase triển khai.' },

  stats:          { en:'📈 Stats & XP', vi:'Thống kê & XP' },
  badgecase:      { en:'🏅 My Badge Display Case', vi:'🏅 Tủ huy hiệu của tôi' },
  scrapreview:    { en:'📒 Scrapbook Review', vi:'📒 Duyệt sổ lưu niệm' },
  boardreview:    { en:'📋 Board Assignments', vi:'📋 Bài giao trên bảng' },
  xp_pill_tip:    { en:'Stats & XP — click to open', vi:'Thống kê & XP — nhấn để mở' },
  show_xp_label:  { en:'Show XP in the header', vi:'Hiện XP trên thanh tiêu đề' },
  stats_range:    { en:'Time range', vi:'Khoảng thời gian' },
  stats_today:    { en:'Today', vi:'Hôm nay' },
  stats_week:     { en:'7 days', vi:'7 ngày' },
  stats_all:      { en:'All time', vi:'Tất cả' },
  stats_to_next:  { en:'{into} / {need} XP to level {next} · {total} XP total', vi:'{into} / {need} XP để lên cấp {next} · tổng {total} XP' },
  stats_streak:   { en:'🔥 Streak: {n} day(s)', vi:'🔥 Chuỗi ngày: {n}' },
  stats_bonus:    { en:'×{m} XP bonus', vi:'thưởng ×{m} XP' },
  stats_xp_earned:{ en:'XP earned', vi:'XP đã nhận' },
  stats_lessons:  { en:'Lessons planned', vi:'Bài học đã lập' },
  stats_assignments:{ en:'Assignments posted', vi:'Bài tập đã giao' },
  stats_attendance:{ en:'Attendance taken', vi:'Lần điểm danh' },
  stats_reading:  { en:'Reading log (entries · min)', vi:'Nhật ký đọc (mục · phút)' },
  stats_active:   { en:'Active time', vi:'Thời gian hoạt động' },
  stats_doc_time: { en:'Time with documents', vi:'Thời gian với tài liệu' },
  stats_h_xpby:   { en:'XP by source', vi:'XP theo nguồn' },
  stats_h_time:   { en:'Time in each widget', vi:'Thời gian trong mỗi widget' },
  stats_h_docs:   { en:'Top documents', vi:'Tài liệu dùng nhiều nhất' },
  stats_h_7d:     { en:'XP, last 7 days', vi:'XP 7 ngày qua' },
  stats_h_recent: { en:'Recent XP', vi:'XP gần đây' },
  stats_while_active:{ en:'(while you\u2019re active)', vi:'(khi bạn đang hoạt động)' },
  stats_all_time: { en:'(all time)', vi:'(tất cả)' },
  stats_open_docs:{ en:'📄 Open documents', vi:'📄 Tài liệu đang mở' },
  stats_none:     { en:'Nothing yet.', vi:'Chưa có gì.' },
  stats_no_xp:    { en:'No XP yet — do something!', vi:'Chưa có XP — hãy bắt đầu nào!' },
  xp_src_daily:   { en:'Daily visit', vi:'Truy cập hằng ngày' },
  xp_src_docs:    { en:'Reading documents', vi:'Đọc tài liệu' },
  xp_src_lesson:  { en:'Lessons planned', vi:'Lập bài học' },
  xp_src_assignment:{ en:'Assignments posted', vi:'Giao bài tập' },
  xp_src_attendance:{ en:'Attendance taken', vi:'Điểm danh' },
  xp_cap_reached: { en:'Daily XP limit reached for {src}.', vi:'Đã đạt giới hạn XP hằng ngày cho {src}.' },
  xp_level_up:    { en:'Level up! You reached level {n} 🎉', vi:'Lên cấp! Bạn đã đạt cấp {n} 🎉' },

  doc_time:       { en:'⏱ {here} here · {today} today · {xp}/{max} XP', vi:'⏱ {here} tại đây · {today} hôm nay · {xp}/{max} XP' },
  doc_time_tip:   { en:'This document today · all documents today · XP this document has earned today (max {max})', vi:'Tài liệu này hôm nay · mọi tài liệu hôm nay · XP tài liệu này đã nhận hôm nay (tối đa {max})' },
  doc_track:      { en:'📎 Track', vi:'📎 Theo dõi' },
  doc_track_tip:  { en:'Show this time in your Reading Log', vi:'Hiện thời gian này trong Nhật ký đọc' },
  doc_track_hint: { en:'Time with this document can also show up here.', vi:'Thời gian với tài liệu này cũng có thể hiện ở đây.' },
  doc_track_reading:{ en:'📚 Add to the Reading Log when I close it', vi:'📚 Thêm vào Nhật ký đọc khi tôi đóng' },
  doc_logged_toast:{ en:'📚 {min} min of “{name}” is in your Reading Log', vi:'📚 {min} phút “{name}” đã vào Nhật ký đọc' },
  doc_pdf_tools:  { en:'🛠 PDF tools', vi:'🛠 Công cụ PDF' },
  doc_pdf_tools_tip:{ en:'Show or hide Chrome\u2019s PDF toolbar (page, zoom, print). Reloads the PDF.', vi:'Hiện hoặc ẩn thanh công cụ PDF của Chrome (trang, thu phóng, in). Sẽ tải lại PDF.' },
  doc_fullscreen: { en:'Full screen on / off', vi:'Bật / tắt toàn màn hình' },
  doc_fullscreen_fail:{ en:'This browser window wouldn\u2019t go full screen.', vi:'Cửa sổ trình duyệt này không vào được toàn màn hình.' },
  doc_still_reading:{ en:'📖 Still reading? The document timer is paused.', vi:'📖 Bạn còn đang đọc? Đồng hồ tài liệu đang tạm dừng.' },
  doc_still_reading_aria:{ en:'Still reading?', vi:'Bạn còn đang đọc?' },
  doc_still_yes:  { en:'Yes, keep counting', vi:'Có, tiếp tục đếm' },
  doc_cap_toast:  { en:'That\u2019s the most XP this document earns today — your time still counts. Try another one for more! 📄', vi:'Đó là XP tối đa tài liệu này mang lại hôm nay — thời gian vẫn được tính. Hãy thử tài liệu khác! 📄' },
  files_sort:     { en:'Sort by', vi:'Sắp xếp theo' },
  files_sort_recent:{ en:'Last opened', vi:'Mở gần nhất' },
  files_sort_time:{ en:'Most time', vi:'Nhiều thời gian nhất' },
  files_sort_added:{ en:'Date added', vi:'Ngày thêm' },
  files_time_hint:{ en:'📄 Time you spend with a document open counts toward Stats & XP.', vi:'📄 Thời gian mở tài liệu được tính vào Thống kê & XP.' },
  files_time_tip: { en:'Time with this document, all time · opened {n}×', vi:'Thời gian với tài liệu này, tất cả · đã mở {n} lần' }
});

Object.assign(STRINGS, {
  office_open_app:  { en:'Open in {app}', vi:'Mở bằng {app}' },
  office_launching: { en:'Opening in {app}… edits are saved to the copy in Downloads/TeachersDeck.', vi:'Đang mở bằng {app}… chỉnh sửa được lưu vào bản sao trong Downloads/TeachersDeck.' },
  office_downloaded:{ en:'Downloaded — open it from your Downloads folder.', vi:'Đã tải xuống — hãy mở từ thư mục Downloads.' },
  office_perm_denied:{ en:'Permission not granted, so the file was downloaded instead.', vi:'Chưa được cấp quyền nên tệp được tải xuống thay thế.' },
  files_office_pref:{ en:'PowerPoint / Word / Excel open in', vi:'PowerPoint / Word / Excel mở bằng' },
  files_office_google:{ en:'Google viewer (here)', vi:'Trình xem Google (tại đây)' },
  files_office_app: { en:'Desktop app', vi:'Ứng dụng máy tính' },
  files_show_here:  { en:'Show here', vi:'Hiện tại đây' }
});
/* v0.15.0 strings: Class Activity widget, roster activity badges, Notes Home. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  ca_need_class:   { en:'Sign in and link a class in Cloud Class to see what your students are doing.', vi:'Hãy đăng nhập và liên kết một lớp trong Cloud Class để xem học sinh đang làm gì.' },
  ca_this_week:    { en:'This week · whole class', vi:'Tuần này · cả lớp' },
  ca_active:       { en:'Active', vi:'Hoạt động' },
  ca_reading:      { en:'Reading (min)', vi:'Đọc (phút)' },
  ca_focus:        { en:'Focus sessions', vi:'Phiên tập trung' },
  ca_games:        { en:'Games', vi:'Trò chơi' },
  ca_idioms:       { en:'Idioms', vi:'Thành ngữ' },
  ca_words:        { en:'Words saved', vi:'Từ đã lưu' },
  ca_cards:        { en:'Cards reviewed', vi:'Thẻ đã ôn' },
  ca_students:     { en:'Students', vi:'Học sinh' },
  ca_students_hint:{ en:'🔥 streak · ✅ homework done / assigned · last active · 📖 reading this week. Students who haven\u2019t been active for 3+ days are listed first.', vi:'🔥 chuỗi ngày · ✅ bài tập đã làm / đã giao · hoạt động gần nhất · 📖 đọc tuần này. Học sinh không hoạt động 3 ngày trở lên được xếp lên đầu.' },
  ca_no_students:  { en:'No students have joined yet.', vi:'Chưa có học sinh nào tham gia.' },
  ca_hw_title:     { en:'Homework completion', vi:'Hoàn thành bài tập' },
  ca_hw_none:      { en:'No assignments yet — add some in the Assignments widget.', vi:'Chưa có bài tập — hãy thêm trong widget Bài tập.' },
  ca_feed_title:   { en:'Recent points', vi:'Điểm gần đây' },
  ca_feed_none:    { en:'No points activity yet.', vi:'Chưa có hoạt động điểm nào.' },
  ca_redeem_toast: { en:'🎁 {name} spent {n} pts — {reason}', vi:'🎁 {name} đã dùng {n} điểm — {reason}' },
  ca_someone:      { en:'A student', vi:'Một học sinh' },
  ca_today:        { en:'today', vi:'hôm nay' },
  ca_yesterday:    { en:'yesterday', vi:'hôm qua' },
  ca_days_ago:     { en:'{n}d ago', vi:'{n} ngày trước' },
  ca_never:        { en:'not yet', vi:'chưa' },
  ca_privacy:      { en:'Journal entries stay private on the student\u2019s device and are never shown here. Activity is reported by each student\u2019s own device — a guide, not a score.', vi:'Nhật ký luôn riêng tư trên thiết bị của học sinh và không bao giờ hiển thị ở đây. Hoạt động do thiết bị của từng học sinh báo cáo — chỉ để tham khảo, không phải điểm số.' },
  cc_act_tip:      { en:'Streak · homework done / assigned · last active', vi:'Chuỗi ngày · bài tập đã làm / đã giao · hoạt động gần nhất' },
  cc_note_btn:     { en:'Send a note home (opens Notes Home)', vi:'Gửi ghi chú về nhà' }
});
function t(key, vars){
  const entry = STRINGS[key];
  let str = (entry && (entry[state.lang] || entry.en)) || key;
  if(vars){
    Object.keys(vars).forEach(k=>{ str = str.replace(`{${k}}`, vars[k]); });
  }
  return str;
}

function localizeNode(root){
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-widget-label]').forEach(el=>{ el.textContent = widgetLabel(el.dataset.i18nWidgetLabel); });
  root.querySelectorAll('[data-i18n-dyn]').forEach(el=>{ el.textContent = t(el.dataset.key); });
  root.querySelectorAll('[data-i18n-count]').forEach(el=>{ el.textContent = t('roster_count', { n: state.roster.length }); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPlaceholder); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-aria-dyn]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.key)); });
  root.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title = t(el.dataset.i18nTitle); });
}

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
function renderDrawDeck(body, ctx){
  return DrawDeck.mount(body, {
    t, toast,
    close: ()=>toggleWidget('drawdeck'),
    idb,
    watermark: (typeof Watermark !== 'undefined') ? Watermark : null,
    download: (blob, name)=>{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    },
    // "Share this page with the class" (v0.26.0) needs a linked cloud class to share into.
    cloudClassId: () => (typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession() && state.cloudClassId) ? state.cloudClassId : null,
    share: (dataUrl) => TDCloud.shareBoard(state.cloudClassId, dataUrl),
    stopShare: () => TDCloud.stopSharingBoard(state.cloudClassId),
    // "Assign this page to students" (v0.29.0, backend v2.9.0) — DrawDeck scope step D.
    assignBoard: (title, thumbDataUrl, imageDataUrl) => TDCloud.assignBoard(state.cloudClassId, title, thumbDataUrl, imageDataUrl)
  });
}

const WIDGETS = [
  { id:'clock', cat:'time', labelKey:'clock', icon:'clock', w:200, h:222, render:renderClock },
  { id:'timer', cat:'time', labelKey:'timer', icon:'timer', w:220, h:210, render:renderTimer },
  { id:'stopwatch', cat:'time', labelKey:'stopwatch', icon:'stopwatch', w:220, h:280, render:renderStopwatch },
  { id:'traffic', cat:'tools', labelKey:'traffic', icon:'traffic', w:180, h:250, render:renderTraffic },
  { id:'dice', cat:'tools', labelKey:'dice', icon:'dice', w:200, h:200, render:renderDice },
  { id:'checklist', cat:'tools', labelKey:'checklist', icon:'checklist', w:260, h:270, render:renderChecklist },
  { id:'files', cat:'media', labelKey:'files', icon:'files', w:280, h:280, render:renderFiles },
  { id:'games', cat:'media', labelKey:'games', icon:'game', w:330, h:500, render:renderGames, pro:true },
  { id:'scoreboard', cat:'tools', labelKey:'scoreboard', icon:'trophy', w:260, h:440, render:renderScoreboard },
  { id:'calendar', cat:'time', labelKey:'calendar', icon:'calendar', w:300, h:440, render:renderCalendar },
  { id:'assignments', cat:'tools', labelKey:'assignments', icon:'clipboard', w:320, h:480, render:renderAssignments },
  { id:'progressreports', cat:'tools', labelKey:'progressreports', icon:'report', w:340, h:520, render:renderProgressReports },
  { id:'poll', cat:'tools', labelKey:'poll', icon:'poll', w:270, h:320, render:renderPoll },
  { id:'noise', cat:'media', labelKey:'noise', icon:'mic', w:300, h:540, render:renderNoise },
  { id:'music', cat:'media', labelKey:'music', icon:'musicNote', w:290, h:380, render:renderMusic, pro:true },
  { id:'videoplayer', cat:'media', labelKey:'video_player', icon:'videoCam', w:340, h:400, render:renderVideoPlayer, pro:true },
  { id:'soundboard', cat:'media', labelKey:'soundboard', icon:'speaker', w:280, h:320, render:renderSoundboard, pro:true },
  { id:'attendance', cat:'time', labelKey:'attendance', icon:'people', w:260, h:380, render:renderAttendance, pro:true },
  { id:'groupmaker', cat:'tools', labelKey:'groupmaker', icon:'shuffle', w:280, h:360, render:renderGroupMaker, pro:true },
  { id:'exitticket', cat:'tools', labelKey:'exitticket', icon:'poll', w:260, h:320, render:renderExitTicket, pro:true },
  { id:'agenda', cat:'tools', labelKey:'agenda', icon:'clipboard', w:300, h:360, render:renderAgenda, pro:true },
  { id:'meet', cat:'cloud', labelKey:'meet', icon:'videoCam', w:290, h:380, render:renderMeet, pro:true },
  { id:'qrcode', cat:'tools', labelKey:'qrcode', icon:'qrcode', w:260, h:340, render:renderQrCode, pro:true },
  { id:'countdown', cat:'time', labelKey:'countdown', icon:'timer', w:240, h:220, render:renderCountdown, pro:true },
  { id:'hallpass', cat:'time', labelKey:'hallpass', icon:'door', w:260, h:360, render:renderHallPass, pro:true },
  { id:'readinglog', cat:'time', labelKey:'readinglog', icon:'stopwatch', w:270, h:400, render:renderReadingLog, pro:true },
  { id:'ttsreader', cat:'language', labelKey:'ttsreader', icon:'mic', w:300, h:320, render:renderTtsReader, pro:true },
  { id:'unitconverter', cat:'tools', labelKey:'unitconverter', icon:'swap', w:270, h:300, render:renderUnitConverter, pro:true },
  { id:'announcements', cat:'tools', labelKey:'announcements', icon:'bell', w:280, h:360, render:renderAnnouncements, pro:true },
  { id:'instructions', cat:'tools', labelKey:'instructions', icon:'clipboard', w:300, h:340, render:renderInstructions, pro:true },
  { id:'convocards', cat:'language', labelKey:'convocards', icon:'chat', w:280, h:320, render:renderConvoCards, pro:true },
  { id:'idiomday', cat:'language', labelKey:'idiomday', icon:'quote', w:280, h:300, render:renderIdiomDay, pro:true },
  { id:'grammarref', cat:'language', labelKey:'grammarref', icon:'book', w:280, h:340, render:renderGrammarRef, pro:true },
  { id:'namepicker', cat:'tools', labelKey:'namepicker', icon:'shuffle', w:240, h:220, render:renderNamePicker },
  { id:'classbuilder', cat:'tools', labelKey:'classbuilder', icon:'people', w:580, h:640, render:renderClassBuilder },   // v0.19.0
  { id:'lessonplanner', cat:'cloud', labelKey:'lessonplanner', icon:'lessonplan', w:330, h:610, render:renderLessonPlanner, pro:true },
  { id:'cloudclass', cat:'cloud', labelKey:'cloudclass', icon:'cloud', w:420, h:580, render:renderCloudClass },
  { id:'rewardpoints', cat:'cloud', labelKey:'rewardpoints', icon:'trophy', w:680, h:580, render:renderRewardPoints },   // v0.21.0 (v0.22.0: gained a Badges tab — id kept as 'rewardpoints' so saved layouts and docks carry over)
  { id:'noteshome', cat:'cloud', labelKey:'noteshome', icon:'mail', w:840, h:600, render:renderNotesHome },
  { id:'classactivity', cat:'cloud', labelKey:'classactivity', icon:'stats', w:380, h:560, render:renderStudentStats, full:true },   // v0.20.0: Student Stats — full screen (id kept as 'classactivity' so saved layouts and docks carry over)
  { id:'stats', cat:'tools', labelKey:'stats', icon:'stats', w:360, h:540, render:renderStats, full:true },
  { id:'badgecase', cat:'tools', labelKey:'badgecase', icon:'trophy', w:420, h:560, render:renderBadgeCase, full:true },   // v0.22.1: the teacher's own badges, split out of My Stats & XP
  { id:'scrapreview', cat:'cloud', labelKey:'scrapreview', icon:'clipboard', w:420, h:560, render:renderScrapReview },   // v0.27.0: approve/hide Scrapdeck pages students shared (M3)
  { id:'boardreview', cat:'cloud', labelKey:'boardreview', icon:'report', w:420, h:560, render:renderBoardReview },   // v0.29.0 (backend v2.9.0): review Board Assignments submissions and award XP (DrawDeck scope step D)
  { id:'drawdeck', cat:'tools', labelKey:'drawdeck', icon:'draw', w:380, h:560, render:renderDrawDeck, full:true }   // v0.22.0: DrawDeck — whiteboard, mind map, flowchart (full screen)
];
/* UniDeck phase 1 (LectureDeck's Course mode): LectureDeck's own js/course-mode.js lists its widgets in window.UNI_WIDGETS
   ({ id, cat, title, desc, icon, w, h, render }). They join the registry only in the university edition, in a "Courses"
   category of the app tray, with their labels added to STRINGS (English for now). TeachersDeck never loads that file. */
const UNI_WIDGET_DEFS = UNI ? (window.UNI_WIDGETS || []) : [];
UNI_WIDGET_DEFS.forEach(w => {
  if(WIDGETS.some(x => x.id === w.id)) return;
  STRINGS['uw_' + w.id] = STRINGS['uw_' + w.id] || { en: w.title };
  STRINGS['wc_' + w.id] = STRINGS['wc_' + w.id] || { en: w.desc || '' };
  WIDGETS.push({ id:w.id, cat:w.cat || 'course', labelKey:'uw_' + w.id, icon:w.icon || 'clipboard', w:w.w, h:w.h, render:w.render, full:!!w.full });
});
if(UNI) STRINGS.cat_course = STRINGS.cat_course || { en:'Courses' };
/* UniDeck (LectureDeck): school-only widgets leave the registry in the university edition. They are built on StudentDeck's
   class join codes and points, ParentDeck's families, or primary-school routines, none of which UniDeck has: Cloud Class
   (Course builder replaces it), Reward Points, Notes Home, Class Activity, Progress Reports, Scrapbook Review, Board
   Review and Hall Pass. Saved layouts and dock places for them are left untouched. TeachersDeck keeps them all. */
const UNI_SCHOOL_ONLY = ['cloudclass', 'rewardpoints', 'noteshome', 'classactivity', 'progressreports', 'scrapreview', 'boardreview', 'hallpass'];
if(UNI) for(let i = WIDGETS.length - 1; i >= 0; i--) if(UNI_SCHOOL_ONLY.includes(WIDGETS[i].id)) WIDGETS.splice(i, 1);

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
const isOff = id => !!wprefs.off[id] || !!(PF && PF.hides(id));   // platform: the widgets this platform leaves out
const WIDGET_TIERS = {
  core:   ['classbuilder', 'clock', 'timer', 'namepicker', 'groupmaker', 'scoreboard', 'poll', 'attendance', 'traffic', 'noise', 'agenda', 'files', 'calendar', 'assignments', 'progressreports', 'lessonplanner', 'cloudclass', 'rewardpoints', 'noteshome'],
  keep:   ['checklist', 'games', 'music', 'hallpass', 'qrcode', 'ttsreader', 'convocards', 'idiomday', 'grammarref', 'instructions', 'classactivity', 'stats', 'badgecase', 'drawdeck', 'scrapreview', 'boardreview'],
  shelve: ['stopwatch', 'dice', 'videoplayer', 'soundboard', 'exitticket', 'meet', 'countdown', 'unitconverter', 'announcements', 'readinglog']
};
const tierOf = id => Object.keys(WIDGET_TIERS).find(k => WIDGET_TIERS[k].includes(id)) || 'keep';
function widgetUsage(id){                         // what the teacher has actually done with it, from the same day records Stats & XP uses
  const days = tdx.stats.daily, cut = xDayKey(Date.now() - 29 * 864e5); let opens = 0, secs = 0, o30 = 0, s30 = 0, last = '';
  Object.keys(days).sort().forEach(k => { const o = (days[k].opens || {})[id] || 0, s = (days[k].timeBy || {})[id] || 0; if(o || s) last = k; opens += o; secs += s; if(k >= cut){ o30 += o; s30 += s; } });
  return { opens, secs, o30, s30, last, any: opens > 0 || secs >= 30 || !!state.active[id] };
}
function curateWidgetsOnce(){                     // first launch of this version: tidy away the recommended widgets the teacher has never touched
  if(wprefs.curated || (PF && PF.fixedWidgets)) return 0;   // platform: its own widget list is the curation
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
const DOCK_CAPS = { bottom:10, left:5, right:5, top:5 };

function widgetsFor(loc){
  const list = WIDGETS.filter(w => state.dockPlacement[w.id] === loc && !isOff(w.id));
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
  const locked = state.layoutMode !== 'custom';
  const lockHint = document.getElementById('dock-buttons-lock-hint');
  if(lockHint) lockHint.hidden = !locked;
  WIDGETS.filter(w=> !isOff(w.id)).forEach(w=>{
    const row = document.createElement('div');
    row.className = 'dock-vis-row placement-row' + (locked ? ' locked' : '');
    row.innerHTML = `<span data-i18n="${w.labelKey}">${t(w.labelKey)}</span>`;
    const sel = document.createElement('select');
    sel.disabled = locked;
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

function rerenderWidget(id){
  const rec = widgetEls[id];
  if(!rec) return;
  const def = WIDGETS.find(w=>w.id===id);
  if(!def) return;
  if(typeof rec.cleanup === 'function') rec.cleanup();
  const body = rec.el.querySelector('.widget-body');
  body.innerHTML = '';
  rec.cleanup = def.render(body, { id, toast, preset: pfPreset(id) });
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
    const od = dayRec(); od.opens = od.opens || {}; od.opens[id] = (od.opens[id] || 0) + 1; xSave();
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

// One gesture at a time, tracked here; the window listeners below are the only
// ones, so closing a widget can't leave handlers behind.
let gesture = null;   // { kind:'move'|'size', el, id, pointerId, sx, sy, ox, oy }

function startGesture(g){
  if(gesture && gesture.pointerId !== g.pointerId) endGesture();   // a stuck prior gesture would otherwise leave stale drag state and never let go
  gesture = g;
  bringToFront(g.el);
  if(g.kind === 'move') g.el.classList.add('dragging');
  // An iframe swallows pointer events. If pointer capture were ever lost mid-drag
  // the document underneath would grab the gesture, so shield it while dragging/resizing.
  if(docStage) docStage.el.classList.add('shielded');
}

function moveGesture(e){
  if(!gesture || e.pointerId !== gesture.pointerId) return;
  const g = gesture;
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if(g.kind === 'move'){
    // Keep the panel reachable: never past the top or left edge, and always
    // leave enough of the title bar on screen (roughly the grip and the start
    // of the title) that it can be grabbed and dragged back.
    const maxX = Math.max(0, wall.clientWidth - 150);
    const maxY = Math.max(0, wall.clientHeight - 44);
    g.el.style.left = Math.min(maxX, Math.max(0, g.ox + dx)) + 'px';
    g.el.style.top  = Math.min(maxY, Math.max(0, g.oy + dy)) + 'px';
  } else {
    g.el.style.width  = Math.max(180, g.ox + dx) + 'px';
    g.el.style.height = Math.max(140, g.oy + dy) + 'px';
  }
}

function endGesture(e){
  if(!gesture) return;
  if(e && e.pointerId !== undefined && e.pointerId !== gesture.pointerId) return;
  const g = gesture;
  gesture = null;
  g.el.classList.remove('dragging');
  if(docStage) docStage.el.classList.remove('shielded');
  const layout = state.layout[g.id];
  if(layout){
    if(g.kind === 'move'){
      // offsetLeft/Top are relative to the wall, the same frame the saved
      // left/top are written in — getBoundingClientRect would be viewport-based.
      layout.x = g.el.offsetLeft;
      layout.y = g.el.offsetTop;
    } else {
      layout.w = g.el.offsetWidth;
      layout.h = g.el.offsetHeight;
    }
    saveState();
  }
}

window.addEventListener('pointermove', moveGesture);
window.addEventListener('pointerup', endGesture);
window.addEventListener('pointercancel', endGesture);
window.addEventListener('blur', ()=> endGesture());

function makeDraggable(el, id){
  const head = el.querySelector('.widget-head');
  head.addEventListener('pointerdown', e=>{
    if(e.button != null && e.button !== 0) return;         // left button or touch only
    if(e.target.closest('.widget-head-actions')) return;    // minimise + close stay clickable
    if(el.classList.contains('widget-full')) return;        // full-screen widgets don't move
    startGesture({ kind:'move', el, id, pointerId:e.pointerId, sx:e.clientX, sy:e.clientY, ox:el.offsetLeft, oy:el.offsetTop });
    try{ head.setPointerCapture(e.pointerId); }catch(err){ /* capture is a nicety, not a requirement */ }
    e.preventDefault();
  });
  // Touching a panel anywhere raises it, so the one you're using sits on top.
  el.addEventListener('pointerdown', ()=> bringToFront(el));
}

function makeResizable(el, id){
  const handle = el.querySelector('.widget-resize');
  handle.addEventListener('pointerdown', e=>{
    if(e.button != null && e.button !== 0) return;
    startGesture({ kind:'size', el, id, pointerId:e.pointerId, sx:e.clientX, sy:e.clientY, ox:el.offsetWidth, oy:el.offsetHeight });
    try{ handle.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    e.stopPropagation();
  });
}

/* ---------------- Widget implementations ---------------- */

function renderClock(body){
  body.innerHTML = `
    <div class="clock-face">
      <div class="clock-hand hr"></div>
      <div class="clock-hand min"></div>
      <div class="clock-hand sec"></div>
      <div class="clock-dot"></div>
    </div>
    <div class="clock-digital">--:--</div>
    <div class="clock-date">--</div>
    <div class="clock-lunar"></div>
  `;
  const hr = body.querySelector('.hr'), min = body.querySelector('.min'), sec = body.querySelector('.sec');
  const digital = body.querySelector('.clock-digital'), dateEl = body.querySelector('.clock-date');
  const lunarEl = body.querySelector('.clock-lunar');
  function tick(){
    const d = new Date();
    const h = d.getHours()%12, m = d.getMinutes(), s = d.getSeconds();
    hr.style.transform = `rotate(${h*30 + m*0.5}deg)`;
    min.style.transform = `rotate(${m*6}deg)`;
    sec.style.transform = `rotate(${s*6}deg)`;
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
    running = isRunning;
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
  return ()=>clearInterval(iv);
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
    running = isRunning;
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
  return ()=>clearInterval(iv);
}

function renderTraffic(body, ctx){
  body.innerHTML = `
    <div class="traffic-housing">
      <div class="traffic-hood"></div>
      <div class="traffic-lamp red" data-c="red"></div>
      <div class="traffic-lamp yellow" data-c="yellow"></div>
      <div class="traffic-lamp green" data-c="green"></div>
      <div class="traffic-base"></div>
    </div>
    <p class="traffic-hint" data-i18n="traffic_hint">${t('traffic_hint')}</p>
  `;
  const lamps = body.querySelectorAll('.traffic-lamp');
  lamps.forEach(l=>{
    l.addEventListener('click', ()=>{
      lamps.forEach(x=>x.classList.remove('on'));
      l.classList.add('on');
      track('traffic', l.dataset.c);
    });
  });
  { const pl = ctx && ctx.preset && ctx.preset.light; const lamp = pl && body.querySelector('.traffic-lamp.' + pl); if(lamp) lamp.classList.add('on'); }   // platform (ClassIn): ?light=
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

/* ---------------- XP + stats engine (ported from StudentDeck v0.7.3, minus Class/reward points) ----------------
   awardXP(source, amount) is the one door XP goes through. Time in every open widget is counted automatically by the
   5-second tick below; any source name passed to awardXP() shows up in "XP by source" on its own (unlisted sources get
   DEFAULT_CAP per day). Add a row to XP_RULES only for a nicer label (t('xp_src_<name>')) or its own cap.
   Everything lives under its own localStorage key (td_xp_v1), NOT in the per-class state, so XP, levels and document time
   follow the teacher across classes. Nothing here is synced anywhere. */
const XKEY = 'td_xp_v1';
function xFresh(){ return { xp:{ total:0, streak:0, last:'', log:[] }, stats:{ daily:{} }, totals:{}, feed:[], badges:{ earned:{}, init:false, bestStreak:0 }, docTime:{}, filesSort:'recent', docToReading:false, pdfTools:false }; }
function xLoad(){
  let s = {}; try{ s = JSON.parse(localStorage.getItem(XKEY)) || {}; }catch(e){}
  const f = xFresh();
  return { ...f, ...s, xp:{ ...f.xp, ...s.xp }, stats:{ ...f.stats, ...s.stats } };
}
const tdx = xLoad();
function xSave(){ try{ localStorage.setItem(XKEY, JSON.stringify(tdx)); }catch(e){ /* not persisted */ } }
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
function stat(k, n = 1){ const r = dayRec(); r[k] = (r[k] || 0) + n; xSave(); refreshStats(); }

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
function popBadge(b){ badgeQ.push(b); if(!badgeBusy) nextBadgePop(); }
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

/* ---------------- Document stage ----------------
   A full-screen layer inside #wall, between the ordinary widgets (below) and
   the pinned widgets (above) — see the z-index bands next to bringToFront().
   It shows one document at a time in an iframe:
     - a PDF from the Files widget, in the browser's own PDF viewer (a blob URL,
       deliberately NOT sandboxed: a sandboxed frame disables Chrome's PDF viewer);
     - a pasted Google Docs / Slides / Sheets / Forms / Drive link, as its
       embeddable /preview (or published) URL, in a sandboxed frame. The /edit
       URL cannot be framed (Google sends X-Frame-Options: SAMEORIGIN), so
       "Edit in Google" opens it in a tab instead.
   Closing the stage removes the iframe and revokes the blob URL. */
const GOOGLE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';
const GDOC_LABEL = { document:'DOC', presentation:'SLIDES', spreadsheets:'SHEET', forms:'FORM', drive:'DRIVE' };
const GDOC_NAME  = { document:'Google Doc', presentation:'Google Slides', spreadsheets:'Google Sheet', forms:'Google Form', drive:'Drive file' };
let docLoadTimer = null;
let docSeq = 0;                 // bumped whenever the stage's document changes
let docConvAbort = null;        // AbortController for an Office conversion in flight

function parseGoogleLink(raw){
  let u;
  try{ u = new URL(String(raw || '').trim()); }catch(e){ return null; }
  if(u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase(), path = u.pathname;
  let m;
  if(host === 'docs.google.com'){
    m = /^\/(document|presentation|spreadsheets|forms)(?:\/u\/\d+)?\/d\/(e\/)?([A-Za-z0-9_-]+)/.exec(path);
    if(!m) return null;
    const gtype = m[1], published = !!m[2], id = m[3];
    const base = 'https://docs.google.com/' + gtype + '/d/' + (published ? 'e/' : '') + id;
    if(gtype === 'forms'){
      if(!published) return null;     // the form editor can't be framed; only the live form (viewform) can
      return { gtype, id, src: base + '/viewform?embedded=true', tab: base + '/viewform' };
    }
    if(published){
      const src = gtype === 'document' ? '/pub?embedded=true' : gtype === 'presentation' ? '/embed' : '/pubhtml?widget=true&headers=false';
      const tab = gtype === 'spreadsheets' ? '/pubhtml' : '/pub';
      return { gtype, id, src: base + src, tab: base + tab };
    }
    return { gtype, id, src: base + '/preview', tab: base + '/edit' };
  }
  if(host === 'drive.google.com'){
    m = /^\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/.exec(path);
    const id = m ? m[1] : (path === '/open' ? u.searchParams.get('id') : null);
    if(!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return { gtype:'drive', id, src:'https://drive.google.com/file/d/' + id + '/preview', tab:'https://drive.google.com/file/d/' + id + '/view' };
  }
  return null;
}

function docStageOpen(){ return !!(docStage && !docStage.el.hidden); }




function openDocMenu(){
  closeDocMenu();
  const menu = docStage.menu;
  const open = WIDGETS.filter(d => state.active[d.id] && widgetEls[d.id]);
  menu.innerHTML = '';
  const hint = document.createElement('p');
  hint.className = 'doc-menu-hint';
  hint.textContent = t('doc_widgets_hint');
  menu.appendChild(hint);
  if(!open.length){
    const none = document.createElement('p');
    none.className = 'doc-menu-empty';
    none.textContent = t('doc_no_widgets');
    menu.appendChild(none);
  } else {
    const bar = document.createElement('div');
    bar.className = 'doc-menu-bar';
    [['doc_pin_all', true], ['doc_unpin_all', false]].forEach(([key, on])=>{
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'doc-menu-link'; b.textContent = t(key);
      b.addEventListener('click', ()=>{ open.forEach(d => setPinned(d.id, on)); openDocMenu(); });
      bar.appendChild(b);
    });
    menu.appendChild(bar);
    open.forEach(d=>{
      const row = document.createElement('label');
      row.className = 'doc-menu-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = widgetEls[d.id].el.dataset.onTop === '1';
      cb.addEventListener('change', ()=> setPinned(d.id, cb.checked));
      const span = document.createElement('span');
      span.textContent = widgetLabel(d.labelKey);
      row.appendChild(cb); row.appendChild(span);
      menu.appendChild(row);
    });
  }
  menu.hidden = false;
  docStage.menuBtn.setAttribute('aria-expanded', 'true');
}


// doc: { kind:'pdf', name, blob }  or  { kind:'google', name, src, tabUrl, editUrl }

function docXpLine(){ return docCur ? docXpGranted(docCur) : 0; }
function drawDocTime(){
  if(!docStage || !docStage.time) return;
  const r = dayRec(), here = docCur ? ((r.docSecs || {})[docKeyOf(docCur)] || 0) : 0;
  docStage.time.textContent = t('doc_time', { here:fmtDur(here), today:fmtDur(r.timeBy[DOC_KEY] || 0), xp:docXpLine(), max:DOC_XP_PER_DOC });
  docStage.time.title = t('doc_time_tip', { max:DOC_XP_PER_DOC });
}
function docAskStillReading(){ if(docStage && docStage.idle.hidden) docStage.idle.hidden = false; }

// While a document is open the app header and the document toolbar share ONE slim row: keep the toolbar clear of the brand and
// the top widget launchers (left) and of the pills / top drawer (right).
function updateDocTop(){
  const br = document.querySelector('.brand'), ta = document.querySelector('.top-actions'), tw = document.getElementById('dock-top-widgets'), xp = document.getElementById('xp-pill'), bc = document.getElementById('badge-chip'), dt = document.getElementById('dock-top');
  if(!br) return;
  let l = Math.ceil(br.getBoundingClientRect().right) + 12;
  [xp, bc, tw].forEach(n => { if(n && n.getClientRects().length) l = Math.max(l, Math.ceil(n.getBoundingClientRect().right) + 12); });
  let r = 12;
  [ta, dt].forEach(n => { if(n && !n.hidden && n.getClientRects().length && n.children.length) r = Math.max(r, Math.ceil(window.innerWidth - n.getBoundingClientRect().left) + 12); });
  if(l > 40 && r < window.innerWidth * 0.6){ const st = document.documentElement.style; st.setProperty('--hdr-l', l + 'px'); st.setProperty('--hdr-r', r + 'px'); }
  // One shared row only if the toolbar's buttons (plus a little room for the title) fit between the two header groups;
  // otherwise the toolbar drops to its own row under the header (still kept clear of the top drawer on the right).
  const tools = docStage && docStage.el.querySelector('.doc-tools');
  if(tools){ document.body.classList.toggle('doc-two-row', window.innerWidth < 900 || window.innerWidth - l - r < tools.offsetWidth + 150); }
}

function buildDocStage(){
  if(docStage) return docStage;
  const el = document.createElement('div');
  el.className = 'doc-stage';
  el.id = 'doc-stage';
  el.hidden = true;
  el.innerHTML = `
    <div class="doc-toolbar" role="toolbar" aria-label="${t('doc_toolbar')}" data-i18n-aria="doc_toolbar">
      <span class="doc-title"></span>
      <span class="doc-time" title=""></span>
      <button type="button" class="doc-hint" hidden data-i18n="doc_not_loading">${t('doc_not_loading')}</button>
      <div class="doc-tools">
        <div class="doc-menu-wrap">
          <button type="button" class="doc-btn doc-track-btn" aria-haspopup="true" aria-expanded="false" data-i18n="doc_track" data-i18n-title="doc_track_tip" title="${t('doc_track_tip')}">${t('doc_track')}</button>
          <div class="doc-menu doc-track-menu" hidden></div>
        </div>
        <div class="doc-menu-wrap">
          <button type="button" class="doc-btn doc-widgets-btn" aria-haspopup="true" aria-expanded="false">${iconSvg('pin','wsvg')}<span data-i18n="doc_widgets_menu">${t('doc_widgets_menu')}</span></button>
          <div class="doc-menu doc-widgets-menu" hidden></div>
        </div>
        <button type="button" class="doc-btn doc-reconvert" hidden data-i18n="doc_reconvert">${t('doc_reconvert')}</button>
        <button type="button" class="doc-btn doc-edit" hidden data-i18n="doc_edit_google">${t('doc_edit_google')}</button>
        <button type="button" class="doc-btn doc-tab" data-i18n="doc_open_tab">${t('doc_open_tab')}</button>
        <button type="button" class="doc-btn doc-app" hidden></button>
        <button type="button" class="doc-btn doc-pdftools" hidden aria-pressed="false" data-i18n="doc_pdf_tools" data-i18n-title="doc_pdf_tools_tip" title="${t('doc_pdf_tools_tip')}">${t('doc_pdf_tools')}</button>
        <button type="button" class="doc-btn doc-full" aria-label="${t('doc_fullscreen')}" title="${t('doc_fullscreen')}" data-i18n-aria="doc_fullscreen" data-i18n-title="doc_fullscreen">⛶</button>
        <button type="button" class="doc-btn doc-collapse" data-i18n-aria="doc_collapse" data-i18n-title="doc_collapse" aria-label="${t('doc_collapse')}" title="${t('doc_collapse')}">▴</button>
        <button type="button" class="doc-btn primary doc-close" data-i18n="doc_close">${t('doc_close')}</button>
      </div>
    </div>
    <button type="button" class="doc-handle" hidden data-i18n-aria="doc_expand" data-i18n-title="doc_expand" aria-label="${t('doc_expand')}" title="${t('doc_expand')}">▾</button>
    <div class="doc-frame-wrap"></div>
    <div class="doc-status" hidden>
      <div class="doc-spinner" aria-hidden="true"></div>
      <p class="doc-status-msg" role="status"></p>
      <div class="doc-status-actions"></div>
    </div>
    <div class="doc-idle" role="alertdialog" aria-label="${t('doc_still_reading_aria')}" data-i18n-aria="doc_still_reading_aria" hidden>
      <p data-i18n="doc_still_reading">${t('doc_still_reading')}</p>
      <button type="button" class="wbtn primary doc-idle-yes" data-i18n="doc_still_yes">${t('doc_still_yes')}</button>
    </div>
    <div class="doc-fallback" hidden>
      <p data-i18n="doc_fallback_msg">${t('doc_fallback_msg')}</p>
      <button type="button" class="wbtn primary doc-fallback-tab" data-i18n="doc_open_tab">${t('doc_open_tab')}</button>
    </div>`;
  wall.appendChild(el);
  const q = sel => el.querySelector(sel);
  docStage = {
    el,
    title: q('.doc-title'), time: q('.doc-time'), hint: q('.doc-hint'), wrap: q('.doc-frame-wrap'),
    menu: q('.doc-widgets-menu'), menuBtn: q('.doc-widgets-btn'),
    tmenu: q('.doc-track-menu'), tmenuBtn: q('.doc-track-btn'), pdfBtn: q('.doc-pdftools'),
    editBtn: q('.doc-edit'), tabBtn: q('.doc-tab'), appBtn: q('.doc-app'), fallback: q('.doc-fallback'), idle: q('.doc-idle'),
    reconvertBtn: q('.doc-reconvert'), status: q('.doc-status'), statusMsg: q('.doc-status-msg'),
    statusActions: q('.doc-status-actions'), spinner: q('.doc-spinner'),
    handle: q('.doc-handle')
  };
  const openTab = ()=> docOpenInTab();
  docStage.tabBtn.addEventListener('click', openTab);
  q('.doc-fallback-tab').addEventListener('click', openTab);
  docStage.hint.addEventListener('click', openTab);
  docStage.editBtn.addEventListener('click', ()=>{
    if(docCur && docCur.editUrl) window.open(docCur.editUrl, '_blank', 'noopener');
  });
  docStage.appBtn.addEventListener('click', ()=>{ if(docCur && docCur.office && docCur.office.rec) launchInApp(docCur.office.rec); });
  q('.doc-close').addEventListener('click', closeDocViewer);
  q('.doc-idle-yes').addEventListener('click', ()=>{ lastDocPoke = Date.now(); docStage.idle.hidden = true; });
  docStage.reconvertBtn.addEventListener('click', ()=> reconvertOffice());
  const setCollapsed = on=>{
    el.classList.toggle('collapsed', on);
    document.body.classList.toggle('doc-collapsed', on);
    docStage.handle.hidden = !on;
    q('.doc-toolbar').hidden = on;
    if(!on) requestAnimationFrame(updateDocTop);
  };
  q('.doc-collapse').addEventListener('click', ()=> setCollapsed(true));
  docStage.handle.addEventListener('click', ()=> setCollapsed(false));
  docStage.setCollapsed = setCollapsed;
  docStage.menuBtn.addEventListener('click', e=>{
    e.stopPropagation();
    if(docStage.menu.hidden) openDocMenu(); else closeDocMenu();
  });
  docStage.menu.addEventListener('click', e=> e.stopPropagation());
  docStage.tmenuBtn.addEventListener('click', e=>{
    e.stopPropagation();
    if(docStage.tmenu.hidden) openTrackMenu(); else closeDocMenu();
  });
  docStage.tmenu.addEventListener('click', e=> e.stopPropagation());
  q('.doc-full').addEventListener('click', toggleDocFullscreen);
  docStage.pdfBtn.addEventListener('click', ()=>{ tdx.pdfTools = !tdx.pdfTools; xSave(); reloadPdfFrame(); });
  document.addEventListener('click', closeDocMenu);
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeDocMenu(); });
  window.addEventListener('resize', updateDocTop);
  if(typeof ResizeObserver !== 'undefined'){
    const ro = new ResizeObserver(updateDocTop);
    ['.brand', '.top-actions', '#dock-top-widgets', '#xp-pill', '#badge-chip', '#dock-top'].forEach(s => { const n = document.querySelector(s); if(n) ro.observe(n); });
  }
  // Focus moving into the iframe means the teacher just clicked into the document: that's activity we can see.
  window.addEventListener('blur', ()=> setTimeout(()=>{
    if(docStageOpen() && document.activeElement && document.activeElement.tagName === 'IFRAME' && el.contains(document.activeElement)){ lastDocPoke = Date.now(); docStage.idle.hidden = true; }
  }, 0));
  return docStage;
}

function toggleDocFullscreen(){
  try{
    if(document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(()=> toast(t('doc_fullscreen_fail')));
  }catch(e){ /* unsupported */ }
}

function closeDocMenu(){
  if(!docStage) return;
  if(!docStage.menu.hidden){ docStage.menu.hidden = true; docStage.menuBtn.setAttribute('aria-expanded', 'false'); }
  if(!docStage.tmenu.hidden){ docStage.tmenu.hidden = true; docStage.tmenuBtn.setAttribute('aria-expanded', 'false'); }
}

function openTrackMenu(){
  if(!docStage || !docCur) return;
  closeDocMenu();
  const menu = docStage.tmenu;
  menu.innerHTML = '';
  const hint = document.createElement('p');
  hint.className = 'doc-menu-hint';
  hint.textContent = t('doc_track_hint');
  menu.appendChild(hint);
  const row = document.createElement('label');
  row.className = 'doc-menu-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = !!tdx.docToReading;
  cb.addEventListener('change', ()=>{ tdx.docToReading = cb.checked; xSave(); });
  const sp = document.createElement('span');
  sp.textContent = t('doc_track_reading');
  row.appendChild(cb); row.appendChild(sp);
  menu.appendChild(row);
  menu.hidden = false;
  docStage.tmenuBtn.setAttribute('aria-expanded', 'true');
}

// Chrome's PDF viewer reads display options from the URL fragment: toolbar=0 hides its top bar, navpanes=0 the thumbnail
// sidebar. Both are hidden by default (more room to read); the toolbar's "PDF tools" button brings them back for zoom,
// page jump, download and print. Chrome decides whether to honour these options.
const pdfFrag = () => '#' + (tdx.pdfTools ? '' : 'toolbar=0&navpanes=0&') + 'view=FitH';
function reloadPdfFrame(){      // a fragment change alone doesn't re-apply these options, so swap in a fresh iframe (reading position is lost)
  if(!docStage || !docCur || docCur.kind !== 'pdf') return;
  const old = docStage.wrap.querySelector('iframe');
  if(!old) return;
  const f = document.createElement('iframe');
  f.title = old.title; f.setAttribute('allow', 'fullscreen'); f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.src = docCur.objUrl + pdfFrag();
  old.replaceWith(f);
  docStage.pdfBtn.setAttribute('aria-pressed', String(!!tdx.pdfTools));
  lastDocPoke = Date.now();
}

function clearDocFrame(){
  if(docLoadTimer){ clearTimeout(docLoadTimer); docLoadTimer = null; }
  if(docStage){
    docStage.wrap.innerHTML = '';        // removing the iframe stops whatever it was loading/playing
    docStage.fallback.hidden = true;
    docStage.status.hidden = true;
    docStage.idle.hidden = true;
  }
  if(docCur && docCur.objUrl){ try{ URL.revokeObjectURL(docCur.objUrl); }catch(e){} }
}

// doc: { id?, kind:'pdf', name, blob }  or  { id?, kind:'google', name, src, tabUrl, editUrl }
function openDocViewer(doc){
  docSeq++;                      // supersedes any conversion still in flight
  const st = buildDocStage();
  closeDocLog();
  clearDocFrame();
  closeDocMenu();
  docCur = doc;
  noteDocOpen(doc);
  let src;
  if(doc.kind === 'pdf'){
    // Files picked from disk can arrive without a MIME type; Chrome only
    // hands a blob to its PDF viewer when it is labelled application/pdf.
    const blob = doc.blob.type === 'application/pdf' ? doc.blob : new Blob([doc.blob], { type:'application/pdf' });
    doc.objUrl = URL.createObjectURL(blob);
    src = doc.objUrl + pdfFrag();
  } else {
    src = doc.src;
  }
  const frame = document.createElement('iframe');
  frame.title = doc.name || '';
  frame.setAttribute('allow', 'fullscreen');
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  if(doc.kind === 'google') frame.setAttribute('sandbox', GOOGLE_SANDBOX);
  st.title.textContent = doc.name || '';
  st.hint.hidden = doc.kind !== 'google';
  st.editBtn.hidden = !(doc.kind === 'google' && doc.editUrl);
  st.reconvertBtn.hidden = !doc.office;
  st.appBtn.hidden = !(doc.office && doc.office.rec);
  if(!st.appBtn.hidden) st.appBtn.textContent = '🖥 ' + t('office_open_app', { app:appNameFor(doc.name) });
  st.pdfBtn.hidden = doc.kind !== 'pdf';
  st.pdfBtn.setAttribute('aria-pressed', String(!!tdx.pdfTools));
  // A page Google refuses to frame fires no error, only (at best) a load of
  // its error page. If nothing has loaded after 6 s, say what to do.
  if(doc.kind === 'google'){
    docLoadTimer = setTimeout(()=>{ docLoadTimer = null; st.fallback.hidden = false; }, 6000);
    frame.addEventListener('load', ()=>{ if(docLoadTimer){ clearTimeout(docLoadTimer); docLoadTimer = null; } });
  }
  frame.src = src;
  st.wrap.appendChild(frame);
  st.setCollapsed(false);
  st.el.hidden = false;
  document.body.classList.add('doc-open');
  updateDocTop();
  lastDocPoke = Date.now();
  drawDocTime();
  // Widgets that were already open stay where they are: behind the document
  // unless pinned. The Widgets menu in the toolbar is the way to bring one forward.
}

function closeDocViewer(){
  if(!docStage) return;
  docSeq++;
  if(docConvAbort){ docConvAbort.abort(); docConvAbort = null; }
  closeDocMenu();
  closeDocLog();
  const o = docCur && docCur.office;
  if(o && state.docViewer && state.docViewer.removeCopyOnClose && typeof TDDrive !== 'undefined'){
    TDDrive.trash(o.fileId).then(()=> idb.delete('gdocs', o.sha)).catch(e=> console.warn('TeachersDeck: could not remove the Google copy', e));
  }
  clearDocFrame();
  docStage.el.hidden = true;
  docCur = null;
  document.body.classList.remove('doc-open', 'doc-collapsed');
  xSave(); refreshStats();
  if(filesRedraw) filesRedraw();
}


function docOpenInTab(){
  if(!docCur) return;
  if(docCur.kind === 'office'){ window.open(URL.createObjectURL(docCur.blob), '_blank'); return; }
  if(docCur.kind === 'pdf'){
    // A fresh blob URL: the stage's own one is revoked when the stage closes.
    const blob = docCur.blob.type === 'application/pdf' ? docCur.blob : new Blob([docCur.blob], { type:'application/pdf' });
    window.open(URL.createObjectURL(blob), '_blank');
  } else {
    window.open(docCur.tabUrl, '_blank', 'noopener');
  }
}

function renderFiles(body){
  body.innerHTML = `
    <div class="file-drop"><button type="button" class="file-drop-browse" id="file-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
    <input type="file" id="file-input" hidden multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx">
    <form class="file-glink" id="file-glink" autocomplete="off">
      <input type="text" id="glink-url" placeholder="${t('doc_link_ph')}" data-i18n-placeholder="doc_link_ph" aria-label="${t('doc_add_link')}" data-i18n-aria="doc_add_link">
      <input type="text" id="glink-name" placeholder="${t('doc_name_ph')}" data-i18n-placeholder="doc_name_ph">
      <button type="submit" class="wbtn" data-i18n="doc_add_link">${t('doc_add_link')}</button>
    </form>
    <div class="file-sortrow"><span class="small-hint" data-i18n="files_sort">${t('files_sort')}</span>
      <select id="file-sort" aria-label="${t('files_sort')}" data-i18n-aria="files_sort">
        <option value="recent" data-i18n="files_sort_recent">${t('files_sort_recent')}</option>
        <option value="time" data-i18n="files_sort_time">${t('files_sort_time')}</option>
        <option value="added" data-i18n="files_sort_added">${t('files_sort_added')}</option>
      </select></div>
    <div class="file-sortrow"><span class="small-hint" data-i18n="files_office_pref">${t('files_office_pref')}</span>
      <select id="file-office-pref" aria-label="${t('files_office_pref')}" data-i18n-aria="files_office_pref">
        <option value="google" data-i18n="files_office_google">${t('files_office_google')}</option>
        <option value="app" data-i18n="files_office_app">${t('files_office_app')}</option>
      </select></div>
    <ul class="file-list"></ul>
    <p class="small-hint" data-i18n="files_time_hint">${t('files_time_hint')}</p>
  `;
  const list = body.querySelector('.file-list');
  const input = body.querySelector('#file-input');
  body.querySelector('#file-browse').addEventListener('click', ()=> input.click());

  function showFile(f){
    if(f.kind === 'glink'){
      const g = parseGoogleLink(f.url);
      if(!g){ toast(t('doc_link_invalid')); return; }
      openDocViewer({ id:f.id, kind:'google', name:f.name, src:g.src, tabUrl:g.tab, editUrl: g.gtype === 'forms' ? null : g.tab });
      return;
    }
    if(extOf(f.name) === 'pdf' || (f.blob && f.blob.type === 'application/pdf')){
      openDocViewer({ id:f.id, kind:'pdf', name:f.name, blob:f.blob });
      return;
    }
    // Word / PowerPoint / Excel can't be rendered by the browser itself: Pro converts them
    // through Google (showOffice); anything else just opens in a tab.
    if(isOfficeFile(f)){ openOfficeFile(f); return; }
    toast(t('doc_office_tab'));
    window.open(URL.createObjectURL(f.blob), '_blank');
  }

  async function draw(){
    const files = await idb.getAll('files');
    const DT = tdx.docTime, by = tdx.filesSort;
    files.sort((a, c) => by === 'time' ? ((DT[c.id] || {}).secs || 0) - ((DT[a.id] || {}).secs || 0) || (c.added || 0) - (a.added || 0)
      : by === 'added' ? (c.added || 0) - (a.added || 0)
      : by === 'recent' ? ((DT[c.id] || {}).last || c.added || 0) - ((DT[a.id] || {}).last || a.added || 0)
      : 0);
    list.innerHTML = '';
    if(!files.length){
      list.innerHTML = `<li class="file-empty" data-i18n="files_empty">${t('files_empty')}</li>`;
      return;
    }
    files.forEach(f=>{
      const isLink = f.kind === 'glink';
      const li = document.createElement('li');
      const label = isLink ? (GDOC_LABEL[f.gtype] || 'LINK') : (EXT_LABEL[extOf(f.name)] || extOf(f.name).toUpperCase() || 'FILE');
      li.innerHTML = `<span class="ftype">${label}</span><span class="fname fname-link" role="button" tabindex="0"></span><span class="ftime"></span><button type="button" class="file-show" aria-label="${t('doc_show')}" title="${t('doc_show')}">${iconSvg('expand','wsvg')}</button><button type="button" class="file-open" aria-label="${t('open_action')}">↗</button><button type="button" class="file-del" aria-label="${t('remove')}" title="${t('remove')}">${iconSvg('close','wsvg')}</button>`;
      const nameEl = li.querySelector('.fname');
      nameEl.textContent = f.name;
      nameEl.title = f.name;
      const dt = DT[f.id];
      if(dt && dt.secs){ const tm = li.querySelector('.ftime'); tm.textContent = '⏱ ' + fmtDur(dt.secs); tm.title = t('files_time_tip', { n:dt.opens }); }
      const show = ()=> showFile(f);
      const office = isOfficeFile(f);
      const showHere = ()=> office ? (officeCanConvert() ? showOffice(f) : launchInApp(f)) : showFile(f);
      const openBtn = li.querySelector('.file-open');
      if(office){ openBtn.textContent = '🖥'; openBtn.title = openBtn.ariaLabel = t('office_open_app', { app:appNameFor(f.name) }); openBtn.classList.add('file-app'); }
      nameEl.addEventListener('click', show);
      nameEl.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); show(); } });
      li.querySelector('.file-show').addEventListener('click', showHere);
      li.querySelector('.file-open').addEventListener('click', ()=>{
        if(office){ launchInApp(f); return; }
        if(isLink){
          const g = parseGoogleLink(f.url);
          if(g) window.open(g.tab, '_blank', 'noopener');
          return;
        }
        const url = URL.createObjectURL(f.blob);
        window.open(url, '_blank');
      });
      li.querySelector('.file-del').addEventListener('click', async ()=>{
        await idb.delete('files', f.id);
        draw();
      });
      list.appendChild(li);
    });
  }

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('files', { id:cid(), name:file.name, blob:file, added:Date.now() });
      track('file', file.name);
    }
    input.value = '';
    draw();
    toast(t('file_added'));
  });

  body.querySelector('#file-glink').addEventListener('submit', async e=>{
    e.preventDefault();
    const urlEl = body.querySelector('#glink-url'), nameEl = body.querySelector('#glink-name');
    const g = parseGoogleLink(urlEl.value);
    if(!g){ toast(t('doc_link_invalid')); return; }
    const name = nameEl.value.trim() || (GDOC_NAME[g.gtype] + ' ' + g.id.slice(0, 6));
    await idb.put('files', { id:cid(), kind:'glink', name, url:urlEl.value.trim(), gtype:g.gtype, added:Date.now() });
    urlEl.value = ''; nameEl.value = '';
    draw();
    toast(t('doc_link_added'));
  });

  const sortEl = body.querySelector('#file-sort');
  sortEl.value = tdx.filesSort;
  sortEl.addEventListener('change', ()=>{ tdx.filesSort = sortEl.value; xSave(); draw(); });
  const prefEl = body.querySelector('#file-office-pref');
  prefEl.value = officePref();
  prefEl.addEventListener('change', ()=>{ tdx.officePref = prefEl.value; xSave(); });

  filesRedraw = draw;
  draw();
  return ()=>{ if(filesRedraw === draw) filesRedraw = null; };
}


function renderGames(body){
  body.innerHTML = `
    <div class="file-drop"><button type="button" class="file-drop-browse" id="game-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
    <input type="file" id="game-input" hidden multiple accept=".html,.htm">
    <p class="drawer-label" data-i18n="games_mine">${t('games_mine')}</p>
    <div class="game-grid"></div>
    <p class="file-empty" style="margin-top:6px" data-i18n="games_note">${t('games_note')}</p>
    <div class="games-builtin-section" hidden>
      <p class="drawer-label" data-i18n="games_builtin">${t('games_builtin')}</p>
      <div class="game-grid builtin-game-grid"></div>
    </div>
  `;
  const grid = body.querySelector('.game-grid:not(.builtin-game-grid)');
  const input = body.querySelector('#game-input');
  body.querySelector('#game-browse').addEventListener('click', ()=> input.click());
  const builtinSection = body.querySelector('.games-builtin-section');
  const builtinGrid = body.querySelector('.builtin-game-grid');

  function launch(g){
    track('game', String(g.name || '').replace(/\.(html?)$/i, ''));
    const url = URL.createObjectURL(g.blob);
    window.open(url, '_blank');
  }

  // Built-in games: static files in the games/ folder. The list comes from two
  // places so the games are there
  // however the app is opened:
  //   1. games/games.js — a script generated from games.json. A <script src>
  //      loads on every route (the extension,
  //      a web server, or index.html double-clicked from a folder), so this is
  //      what makes the games preloaded everywhere.
  //   2. games/games.json — fetched when the browser allows it (extension / web
  //      server), so a game added to games.json shows up right away. Browsers
  //      block that fetch for a double-clicked index.html, which is exactly why
  //      (1) exists. Entries here win over (1) when both name the same folder.
  async function drawBuiltin(){
    let list = Array.isArray(window.TD_BUILTIN_GAMES) ? window.TD_BUILTIN_GAMES.slice() : [];
    try{
      const res = await fetch('games/games.json');
      if(res.ok){
        const fresh = await res.json();
        if(Array.isArray(fresh)){
          const byFolder = new Map(list.map(g=>[g && g.folder, g]));
          fresh.forEach(g=>{ if(g && g.folder) byFolder.set(g.folder, g); });
          list = [...byFolder.values()];
        }
      }
    }catch(e){ /* fetch blocked (file://) — the preloaded list above is used */ }
    if(!Array.isArray(list) || !list.length){ builtinSection.hidden = true; return; }
    builtinSection.hidden = false;
    builtinGrid.innerHTML = '';
    list.forEach(g=>{
      if(!g || !g.folder || !g.entry) return;
      const tile = document.createElement('button');
      tile.className = 'game-tile';
      tile.title = `${t('play')} ${g.name || g.folder}`;
      tile.innerHTML = `
        ${g.instructions ? `<span class="game-tile-help" aria-label="${t('how_to_play')} ${g.name || g.folder}">?</span>` : ''}
        <span class="game-tile-play">${iconSvg('game')}</span>
        <span class="game-tile-name"></span>
      `;
      tile.querySelector('.game-tile-name').textContent = g.name || g.folder;
      tile.addEventListener('click', async ()=>{
        const url = `games/${g.folder}/${g.entry}`;
        track('game', g.name || g.folder);
        // Opened straight from a folder (file://), the browser won't let a
        // page fetch() sibling files, so the reachability check below would
        // always fail; the game opens fine as a file, so just open it.
        if(location.protocol === 'file:'){ window.open(url, '_blank'); return; }
        // Verify the file is actually reachable before opening a new tab —
        // window.open() itself can't report a 404, so without this check a
        // bad hosting context (single-file artifact, wrong server root) just
        // opens a blank/broken tab with no explanation. See
        // games_unreachable_toast below.
        try{
          const res = await fetch(url, { method:'HEAD' });
          if(!res.ok) throw new Error('not ok');
          window.open(url, '_blank');
        }catch(e){
          toast(t('games_unreachable_toast'));
        }
      });
      const helpBtn = tile.querySelector('.game-tile-help');
      if(helpBtn){
        helpBtn.addEventListener('click', async e=>{
          e.stopPropagation();
          const url = `games/${g.folder}/${g.instructions}`;
          if(location.protocol === 'file:'){ window.open(url, '_blank'); return; }
          try{
            const res = await fetch(url, { method:'HEAD' });
            if(!res.ok) throw new Error('not ok');
            window.open(url, '_blank');
          }catch(err){
            toast(t('games_unreachable_toast'));
          }
        });
      }
      builtinGrid.appendChild(tile);
    });
  }

  async function draw(){
    const games = await idb.getAll('games');
    grid.innerHTML = '';
    if(!games.length){
      grid.innerHTML = `<p class="file-empty" data-i18n="games_empty">${t('games_empty')}</p>`;
      return;
    }
    games.forEach(g=>{
      const tile = document.createElement('button');
      tile.className = 'game-tile';
      tile.title = `${t('play')} ${g.name}`;
      tile.innerHTML = `
        <span class="game-tile-remove" aria-label="${t('remove')} ${g.name}">${iconSvg('close','wsvg')}</span>
        <span class="game-tile-play">${iconSvg('game')}</span>
        <span class="game-tile-name"></span>
      `;
      tile.querySelector('.game-tile-name').textContent = g.name.replace(/\.(html?|HTML?)$/,'');
      tile.addEventListener('click', ()=> launch(g));
      tile.querySelector('.game-tile-remove').addEventListener('click', async e=>{
        e.stopPropagation();
        await idb.delete('games', g.id);
        draw();
      });
      grid.appendChild(tile);
    });
  }

  input.addEventListener('change', async ()=>{
    let firstAdded = null;
    for(const file of input.files){
      const rec = { id:cid(), name:file.name, blob:file, added:Date.now() };
      await idb.put('games', rec);
      if(!firstAdded) firstAdded = rec;
    }
    input.value = '';
    draw();
    if(firstAdded){
      toast(t('game_saved'));
      launch(firstAdded);
    }
  });

  draw();
  drawBuiltin();
  return null;
}

const SB_COLORS = ['#E4572E','#3B82C4','#D9A82E','#5C9A63'];

// ---------------- Scoreboard transfer (from games like Classroom Word Wheel) ----------------
// A game living in games/<folder>/ is same-origin with the app, so it can hand off
// scores via localStorage — the 'storage' event fires in this tab the instant another
// same-origin tab writes it, and checkScoreboardTransfer() catches anything sent while
// this tab wasn't open yet, the next time it loads.
const SB_TRANSFER_KEY = 'td_scoreboard_transfer';

function refreshScoreboardWidget(){
  const rec = widgetEls['scoreboard'];
  if(!rec) return;
  if(typeof rec.cleanup === 'function') rec.cleanup();
  const body = rec.el.querySelector('.widget-body');
  rec.cleanup = renderScoreboard(body);
}

function applyScoreboardTransfer(payload){
  if(!payload || !Array.isArray(payload.teams) || !payload.teams.length) return;
  state.scoreboard = payload.teams.map(team=>({
    name: String((team && team.name) || '').trim().slice(0,18) || 'Team',
    score: Number(team && team.score) || 0
  }));
  saveState();
  if(!state.active.scoreboard){
    openWidget('scoreboard');
  } else {
    refreshScoreboardWidget();
  }
  toast(t('sb_transfer_received') + (payload.from ? ` — ${payload.from}` : ''));
}

function checkScoreboardTransfer(){
  let raw;
  try{ raw = localStorage.getItem(SB_TRANSFER_KEY); }catch(e){ return; }
  if(!raw) return;
  try{ localStorage.removeItem(SB_TRANSFER_KEY); }catch(e){}
  try{ applyScoreboardTransfer(JSON.parse(raw)); }catch(e){ /* malformed payload — ignore */ }
}

window.addEventListener('storage', e=>{
  if(e.key === SB_TRANSFER_KEY && e.newValue) checkScoreboardTransfer();
});

function renderScoreboard(body, ctx){
  if(ctx && ctx.preset){ const pre = ctx.preset; state.scoreboard = pre.teams.map((name, i) => ({ name, score: (pre.keep && state.scoreboard[i]) ? state.scoreboard[i].score : 0 })); saveState(); }   // platform (ClassIn): ?teams=
  body.innerHTML = `
    <div class="sb">
      <p class="sb-sub" data-i18n="sb_sub">${t('sb_sub')}</p>
      <div class="sb-board"></div>
      <button class="sb-reset" data-i18n="sb_reset">${t('sb_reset')}</button>
    </div>
  `;
  const boardEl = body.querySelector('.sb-board');

  function draw(){
    const maxScore = Math.max(...state.scoreboard.map(team=>team.score));
    boardEl.innerHTML = '';
    state.scoreboard.forEach((team, i)=>{
      const card = document.createElement('div');
      const leading = maxScore > 0 && team.score === maxScore;
      card.className = 'sb-card' + (leading ? ' leading' : '');
      card.style.setProperty('--accent', SB_COLORS[i % SB_COLORS.length]);
      card.innerHTML = `
        <div class="sb-bar"></div>
        <div class="sb-row">
          <input class="sb-name" maxlength="18">
          <div class="sb-score"></div>
        </div>
        <div class="sb-btns">
          <button class="sb-btn minus" data-delta="-1">−1</button>
          <button class="sb-btn plus" data-delta="1">+1</button>
        </div>
      `;
      const nameInput = card.querySelector('.sb-name');
      const scoreEl = card.querySelector('.sb-score');
      nameInput.value = team.name;
      scoreEl.textContent = team.score;

      nameInput.addEventListener('change', ()=>{
        team.name = nameInput.value.trim() || team.name;
        saveState();
      });
      card.querySelectorAll('.sb-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const delta = parseInt(btn.dataset.delta, 10);
          team.score = Math.max(0, team.score + delta);
          track('score', team.name);
          saveState();
          draw();
          const bumpEl = boardEl.children[i].querySelector('.sb-score');
          bumpEl.classList.remove('bump');
          void bumpEl.offsetWidth;
          bumpEl.classList.add('bump');
        });
      });
      boardEl.appendChild(card);
    });
  }

  body.querySelector('.sb-reset').addEventListener('click', ()=>{
    state.scoreboard.forEach(t=> t.score = 0);
    saveState();
    draw();
  });

  draw();
  return null;
}

/* ---------------- Lunar calendar conversion (Vietnamese/Chinese lunisolar, UTC+7) ---------------- */
const LUNAR_TZ = 7;
function INT(d){ return Math.floor(d); }

function jdFromDate(dd, mm, yy){
  const a = INT((14-mm)/12);
  const y = yy + 4800 - a;
  const m = mm + 12*a - 3;
  let jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - INT(y/100) + INT(y/400) - 32045;
  if(jd < 2299161){
    jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - 32083;
  }
  return jd;
}

function NewMoon(k){
  const T = k/1236.85, T2 = T*T, T3 = T2*T, dr = Math.PI/180;
  let Jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
  Jd1 += 0.00033*Math.sin((166.56+132.87*T-0.009173*T2)*dr);
  const M = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3;
  const Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3;
  const F = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3;
  let C1 = (0.1734-0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*dr*M);
  C1 -= 0.4068*Math.sin(Mpr*dr) + 0.0161*Math.sin(dr*2*Mpr);
  C1 -= 0.0004*Math.sin(dr*3*Mpr);
  C1 += 0.0104*Math.sin(dr*2*F) - 0.0051*Math.sin(dr*(M+Mpr));
  C1 -= 0.0074*Math.sin(dr*(M-Mpr)) + 0.0004*Math.sin(dr*(2*F+M));
  C1 -= 0.0004*Math.sin(dr*(2*F-M)) - 0.0006*Math.sin(dr*(2*F+Mpr));
  C1 += 0.0010*Math.sin(dr*(2*F-Mpr)) + 0.0005*Math.sin(dr*(2*Mpr+M));
  let deltaT;
  if(T < -11) deltaT = 0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3;
  else deltaT = -0.000278 + 0.000265*T + 0.000262*T2;
  return Jd1 + C1 - deltaT;
}

function sunLongitude(jdn){
  const T = (jdn - 2451545.0)/36525, T2 = T*T, dr = Math.PI/180;
  const M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2;
  const L0 = 280.46645 + 36000.76983*T + 0.0003032*T2;
  let DL = (1.914600-0.004817*T-0.000014*T2)*Math.sin(dr*M);
  DL += (0.019993-0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
  let L = (L0+DL)*dr;
  L -= Math.PI*2*INT(L/(Math.PI*2));
  return L;
}

function getSunLongitude(dayNumber, tz){ return INT(sunLongitude(dayNumber - 0.5 - tz/24) / Math.PI * 6); }
function getNewMoonDay(k, tz){ return INT(NewMoon(k) + 0.5 + tz/24); }

function getLunarMonth11(yy, tz){
  const off = jdFromDate(31,12,yy) - 2415021;
  const k = INT(off/29.530588853);
  let nm = getNewMoonDay(k, tz);
  if(getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k-1, tz);
  return nm;
}

function getLeapMonthOffset(a11, tz){
  const k = INT((a11 - 2415021.076998695)/29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = getSunLongitude(getNewMoonDay(k+i, tz), tz);
  do{
    last = arc; i++;
    arc = getSunLongitude(getNewMoonDay(k+i, tz), tz);
  } while(arc !== last && i < 14);
  return i-1;
}

function convertSolar2Lunar(dd, mm, yy, tz){
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695)/29.530588853);
  let monthStart = getNewMoonDay(k+1, tz);
  if(monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  let a11 = getLunarMonth11(yy, tz);
  let b11 = a11;
  let lunarYear;
  if(a11 >= monthStart){ lunarYear = yy; a11 = getLunarMonth11(yy-1, tz); }
  else { lunarYear = yy+1; b11 = getLunarMonth11(yy+1, tz); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11)/29);
  let lunarLeap = 0, lunarMonth = diff + 11;
  if(b11 - a11 > 365){
    const leapOff = getLeapMonthOffset(a11, tz);
    if(diff >= leapOff){ lunarMonth = diff + 10; if(diff === leapOff) lunarLeap = 1; }
  }
  if(lunarMonth > 12) lunarMonth -= 12;
  if(lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day:lunarDay, month:lunarMonth, year:lunarYear, leap: lunarLeap===1 };
}

function lunarOf(dateObj){
  return convertSolar2Lunar(dateObj.getDate(), dateObj.getMonth()+1, dateObj.getFullYear(), LUNAR_TZ);
}
function lunarShortLabel(dateObj){
  const l = lunarOf(dateObj);
  return `${l.day}/${l.month}${l.leap ? t('leap_suffix') : ''}`;
}
function lunarFullLabel(dateObj){
  const l = lunarOf(dateObj);
  return `${t('lunar_prefix')} ${l.day}/${l.month}${l.leap ? ' '+t('leap_suffix') : ''}`;
}

/* ---------------- Calendar helpers ---------------- */
function pad2(n){ return String(n).padStart(2,'0'); }
function isoDate(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }
function todayISO(){ const d = new Date(); return isoDate(d.getFullYear(), d.getMonth()+1, d.getDate()); }

function buildGoogleCalUrl(ev){
  let datesParam;
  if(ev.time){
    const start = new Date(`${ev.date}T${ev.time}:00`);
    const end = new Date(start.getTime() + (Math.max(1, +ev.duration || 60))*60000);   // lessons carry their own length
    const fmt = d => `${d.getUTCFullYear()}${pad2(d.getUTCMonth()+1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
    datesParam = `${fmt(start)}/${fmt(end)}`;
  } else {
    const start = new Date(`${ev.date}T00:00:00`);
    const end = new Date(start.getTime() + 24*3600000);
    const fmtDate = d => `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
    datesParam = `${fmtDate(start)}/${fmtDate(end)}`;
  }
  const params = new URLSearchParams({ action:'TEMPLATE', text: ev.title || '', dates: datesParam, details: ev.notes || '' });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function unescapeICS(s){ return (s||'').replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\'); }

function parseICSDate(value, rawKey){
  const isAllDay = /VALUE=DATE/i.test(rawKey) || !/T/.test(value);
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if(!m) return { date: todayISO(), time:'' };
  const [, y, mo, d, hh, mi, ss, z] = m;
  if(isAllDay || !hh) return { date:`${y}-${mo}-${d}`, time:'' };
  if(z){
    const utc = new Date(Date.UTC(+y, +mo-1, +d, +hh, +mi, +(ss||0)));
    return { date: isoDate(utc.getFullYear(), utc.getMonth()+1, utc.getDate()), time:`${pad2(utc.getHours())}:${pad2(utc.getMinutes())}` };
  }
  return { date:`${y}-${mo}-${d}`, time:`${hh}:${mi}` };
}

function parseICS(text){
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  rawLines.forEach(line=>{
    if(/^[ \t]/.test(line) && lines.length) lines[lines.length-1] += line.slice(1);
    else lines.push(line);
  });
  const events = [];
  let cur = null;
  lines.forEach(line=>{
    if(/^BEGIN:VEVENT/.test(line)){ cur = {}; }
    else if(/^END:VEVENT/.test(line)){ if(cur && cur.date) events.push(cur); cur = null; }
    else if(cur){
      const idx = line.indexOf(':');
      if(idx < 0) return;
      const rawKey = line.slice(0, idx);
      const value = line.slice(idx+1);
      const key = rawKey.split(';')[0].toUpperCase();
      if(key === 'SUMMARY') cur.title = unescapeICS(value);
      else if(key === 'DESCRIPTION') cur.notes = unescapeICS(value);
      else if(key === 'DTSTART'){
        const parsed = parseICSDate(value, rawKey);
        cur.date = parsed.date; cur.time = parsed.time;
      }
    }
  });
  return events;
}

const REMINDER_OPTIONS = [
  { value:'none', key:'cal_rem_none' },
  { value:'at',   key:'cal_rem_at' },
  { value:'5',    key:'cal_rem_5' },
  { value:'15',   key:'cal_rem_15' },
  { value:'30',   key:'cal_rem_30' },
  { value:'60',   key:'cal_rem_60' }
];

function renderCalendar(body){
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = todayISO();
  let mode = 'calendar';
  let editingId = null;

  function eventsOn(dateStr){
    return state.calendarEvents.filter(e=>e.date===dateStr).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  }

  function draw(){
    body.innerHTML = mode === 'manage' ? manageMarkup() : calendarMarkup();
    if(mode === 'manage') wireManage(); else wireCalendar();
  }

  function calendarMarkup(){
    const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(LOCALE_MAP[state.lang]||'en-US', { month:'long', year:'numeric' });
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const weekdayFmt = new Intl.DateTimeFormat(LOCALE_MAP[state.lang]||'en-US', { weekday:'narrow' });
    let weekdayRow = '';
    for(let i=0;i<7;i++){ weekdayRow += `<span>${weekdayFmt.format(new Date(2023,0,1+i))}</span>`; }

    let cells = '';
    for(let i=0;i<firstDow;i++) cells += `<button class="cal-cell empty" disabled></button>`;
    const showLunar = state.calendarSystem === 'lunar' || state.calendarSystem === 'both';
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = isoDate(viewYear, viewMonth+1, d);
      const hasEvents = eventsOn(dateStr).length > 0;
      const isToday = dateStr === todayISO();
      const isSel = dateStr === selectedDate;
      const lunarTag = showLunar ? `<span class="cal-lunar-day">${lunarShortLabel(new Date(viewYear, viewMonth, d))}</span>` : '';
      cells += `<button class="cal-cell${isToday?' today':''}${isSel?' selected':''}" data-date="${dateStr}">${d}${lunarTag}${hasEvents?'<span class="cal-dot"></span>':''}</button>`;
    }

    const dayEvents = eventsOn(selectedDate);
    let dayLabel = new Date(selectedDate+'T00:00:00').toLocaleDateString(LOCALE_MAP[state.lang]||'en-US', { weekday:'long', month:'long', day:'numeric' });
    if(state.calendarSystem === 'lunar'){
      dayLabel = lunarFullLabel(new Date(selectedDate+'T00:00:00'));
    } else if(state.calendarSystem === 'both'){
      dayLabel += ` · ${lunarFullLabel(new Date(selectedDate+'T00:00:00'))}`;
    }
    const listHtml = dayEvents.length
      ? dayEvents.map(ev=>`
          <li class="cal-ev-row" data-id="${ev.id}">
            ${ev.time ? `<span class="cal-ev-time">${ev.time}</span>` : ''}
            <span class="cal-ev-title"></span>
            <button class="cal-ev-edit" aria-label="${t('cal_edit_event')}">${iconSvg('settings','wsvg')}</button>
            <button class="cal-ev-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
          </li>`).join('')
      : `<li class="file-empty" data-i18n="cal_no_events">${t('cal_no_events')}</li>`;

    return `
      <div class="cal-head">
        <button class="cal-nav" id="cal-prev">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month"></span>
        <button class="cal-nav" id="cal-next">${iconSvg('chevronRight','wsvg')}</button>
        <button class="cal-gear" id="cal-gear" aria-label="${t('cal_manage')}">${iconSvg('settings','wsvg')}</button>
      </div>
      <div class="cal-weekdays">${weekdayRow}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-day-head">
        <span class="cal-day-label"></span>
        <button class="cal-add-inline" id="cal-add-inline" aria-label="${t('cal_add_event')}">${iconSvg('plus','wsvg')}</button>
      </div>
      <ul class="cal-ev-list">${listHtml}</ul>
    `.replace('<span class="cal-month"></span>', `<span class="cal-month">${monthLabel}</span>`)
     .replace('<span class="cal-day-label"></span>', `<span class="cal-day-label">${dayLabel}</span>`);
  }

  function wireCalendar(){
    // fill event titles safely (avoid HTML injection from user text via innerHTML above)
    body.querySelectorAll('.cal-ev-row').forEach(row=>{
      const ev = state.calendarEvents.find(e=>e.id===row.dataset.id);
      if(ev) row.querySelector('.cal-ev-title').textContent = (ev.type==='assignment' ? '📘 ' : ev.type==='progress-report' ? '📈 ' : '') + (ev.title || t('cal_untitled'));
    });
    body.querySelector('#cal-prev').addEventListener('click', ()=>{
      viewMonth--; if(viewMonth<0){ viewMonth=11; viewYear--; } draw();
    });
    body.querySelector('#cal-next').addEventListener('click', ()=>{
      viewMonth++; if(viewMonth>11){ viewMonth=0; viewYear++; } draw();
    });
    body.querySelector('#cal-gear').addEventListener('click', ()=>{ mode='manage'; editingId=null; draw(); });
    body.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
      cell.addEventListener('click', ()=>{ selectedDate = cell.dataset.date; draw(); });
    });
    body.querySelector('#cal-add-inline').addEventListener('click', ()=>{
      mode='manage'; editingId=null; draw();
    });
    body.querySelectorAll('.cal-ev-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        editingId = btn.closest('.cal-ev-row').dataset.id;
        mode = 'manage'; draw();
      });
    });
    body.querySelectorAll('.cal-ev-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-ev-row').dataset.id;
        state.calendarEvents = state.calendarEvents.filter(e=>e.id!==id);
        saveState(); draw();
      });
    });
  }

  function manageMarkup(){
    const editing = editingId ? state.calendarEvents.find(e=>e.id===editingId) : null;
    const f = editing || { title:'', date:selectedDate, time:'', reminder:'none', notes:'' };
    const allEvents = [...state.calendarEvents].sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
    const allHtml = allEvents.length
      ? allEvents.map(ev=>`
          <li class="cal-all-row" data-id="${ev.id}">
            <div class="cal-all-meta">
              <span class="cal-all-date">${ev.date}${ev.time ? ' · '+ev.time : ''}</span>
              <span class="cal-all-title"></span>
            </div>
            <button class="cal-all-google" title="${t('cal_add_to_google')}">${iconSvg('calendar','wsvg')}</button>
            <button class="cal-all-edit" aria-label="${t('cal_edit_event')}">${iconSvg('settings','wsvg')}</button>
            <button class="cal-all-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
          </li>`).join('')
      : `<li class="file-empty" data-i18n="cal_none_yet">${t('cal_none_yet')}</li>`;

    return `
      <div class="cal-head">
        <button class="cal-nav" id="cal-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month" data-i18n="cal_manage">${t('cal_manage')}</span>
      </div>
      <form class="cal-form" id="cal-form">
        <label class="cal-field">
          <span data-i18n="cal_title">${t('cal_title')}</span>
          <input type="text" id="cf-title" value="${escHtml(f.title||'')}" maxlength="60">
        </label>
        <div class="cal-field-row">
          <label class="cal-field">
            <span data-i18n="cal_date">${t('cal_date')}</span>
            <input type="date" id="cf-date" value="${f.date}">
          </label>
          <label class="cal-field">
            <span data-i18n="cal_time">${t('cal_time')}</span>
            <input type="time" id="cf-time" value="${f.time||''}">
          </label>
        </div>
        <label class="cal-field" id="cf-reminder-wrap" ${f.time ? '' : 'hidden'}>
          <span data-i18n="cal_reminder">${t('cal_reminder')}</span>
          <select id="cf-reminder">
            ${REMINDER_OPTIONS.map(o=>`<option value="${o.value}" ${((f.reminder||'none')===o.value)?'selected':''}>${t(o.key)}</option>`).join('')}
          </select>
        </label>
        <label class="cal-field">
          <span data-i18n="cal_notes">${t('cal_notes')}</span>
          <textarea id="cf-notes" rows="2">${escHtml(f.notes||'')}</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="wbtn primary" data-i18n="cal_save">${t('cal_save')}</button>
          <button type="button" class="wbtn" id="cf-cancel" data-i18n="cal_cancel">${t('cal_cancel')}</button>
        </div>
      </form>

      <p class="drawer-label" style="margin-top:14px" data-i18n="cal_all_events">${t('cal_all_events')}</p>
      <ul class="cal-all-list">${allHtml}</ul>

      <p class="drawer-label" style="margin-top:14px" data-i18n="cal_import_ics">${t('cal_import_ics')}</p>
      <p class="dock-vis-hint" data-i18n="cal_import_hint">${t('cal_import_hint')}</p>
      <label class="file-drop" for="cf-ics"><span class="file-drop-btn" aria-hidden="true">+</span><span class="file-drop-text">${t('cal_import_ics')}</span></label>
      <input type="file" id="cf-ics" accept=".ics,text/calendar" hidden>

      <button class="ghost-btn" id="cf-notif" style="margin-top:14px" data-i18n="cal_enable_notifs">${t('cal_enable_notifs')}</button>
    `;
  }

  function wireManage(){
    body.querySelectorAll('.cal-all-row').forEach(row=>{
      const ev = state.calendarEvents.find(e=>e.id===row.dataset.id);
      if(ev) row.querySelector('.cal-all-title').textContent = (ev.type==='assignment' ? '📘 ' : ev.type==='progress-report' ? '📈 ' : '') + (ev.title || t('cal_untitled'));
    });
    body.querySelector('#cal-back').addEventListener('click', ()=>{ mode='calendar'; editingId=null; draw(); });

    const timeInput = body.querySelector('#cf-time');
    const remWrap = body.querySelector('#cf-reminder-wrap');
    timeInput.addEventListener('input', ()=>{ remWrap.hidden = !timeInput.value; });

    body.querySelector('#cf-cancel').addEventListener('click', ()=>{ mode='calendar'; editingId=null; draw(); });

    body.querySelector('#cal-form').addEventListener('submit', e=>{
      e.preventDefault();
      const title = body.querySelector('#cf-title').value.trim();
      const date = body.querySelector('#cf-date').value || selectedDate;
      const time = timeInput.value || '';
      const reminder = time ? body.querySelector('#cf-reminder').value : 'none';
      const notes = body.querySelector('#cf-notes').value.trim();
      if(editingId){
        const ev = state.calendarEvents.find(x=>x.id===editingId);
        if(ev){ ev.title=title; ev.date=date; ev.time=time; ev.reminder=reminder; ev.notes=notes; ev.fired=false; }
      } else {
        state.calendarEvents.push({ id:cid(), title, date, time, reminder, notes, fired:false });
        track('event', title);
      }
      saveState();
      selectedDate = date;
      mode = 'calendar'; editingId = null;
      draw();
    });

    body.querySelectorAll('.cal-all-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{ editingId = btn.closest('.cal-all-row').dataset.id; draw(); });
    });
    body.querySelectorAll('.cal-all-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        state.calendarEvents = state.calendarEvents.filter(e=>e.id!==id);
        if(editingId===id) editingId=null;
        saveState(); draw();
      });
    });
    body.querySelectorAll('.cal-all-google').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        const ev = state.calendarEvents.find(e=>e.id===id);
        if(ev) window.open(buildGoogleCalUrl(ev), '_blank');
      });
    });

    body.querySelector('#cf-ics').addEventListener('change', async e=>{
      const file = e.target.files[0];
      if(!file) return;
      const text = window.Watermark ? Watermark.strip(await file.text()) : await file.text();   // a watermarked export re-imports cleanly
      const imported = parseICS(text);
      imported.forEach(ev=>{
        state.calendarEvents.push({ id:cid(), title:ev.title||'', date:ev.date, time:ev.time||'', reminder:'none', notes:ev.notes||'', fired:false });
      });
      saveState();
      e.target.value = '';
      toast(t('cal_import_done', { n: imported.length }));
      draw();
    });

    body.querySelector('#cf-notif').addEventListener('click', ()=>{
      if(!('Notification' in window)){ return; }
      Notification.requestPermission().then(perm=>{
        if(perm === 'granted'){ state.notifsEnabled = true; saveState(); toast(t('cal_notifs_on')); }
        else { state.notifsEnabled = false; saveState(); toast(t('cal_notifs_denied')); }
      });
    });
  }

  draw();

  // Other widgets (the Lesson Planner) add events — show them straight away,
  // unless the event form is open, which a redraw would wipe.
  const onExternalChange = ()=>{ if(mode === 'calendar') draw(); };
  document.addEventListener('td:calendar-changed', onExternalChange);
  return ()=> document.removeEventListener('td:calendar-changed', onExternalChange);
}

/* =========================================================
   Assignments — create homework, push it to the class, and
   keep it mirrored into the canonical Calendar (state.calendarEvents,
   event id `assign-<assignmentId>`) so a due date only ever has to be
   set in one place. Pushing to students/parents happens the same way
   the Calendar already does: saveState() -> TDCloud.syncHomework(),
   which mirrors state.assignments up to classes/{id}/homework, read by
   StudentDeck's Homework To-Do widget and ParentDeck's Homework widget.
   ========================================================= */
function upsertAssignmentEvent(asg){
  const evId = 'assign-'+asg.id;
  state.calendarEvents = state.calendarEvents.filter(e=>e.id!==evId);
  if(asg.dueDate){
    state.calendarEvents.push({
      id: evId,
      title: (asg.subject ? `[${asg.subject}] ` : '') + (asg.title || t('cal_untitled')),
      date: asg.dueDate,
      time: asg.dueTime || '',
      reminder: asg.dueTime ? 'at' : 'none',
      notes: asg.instructions || '',
      type: 'assignment',
      assignmentId: asg.id,
      fired: false
    });
  }
}
function removeAssignmentEvent(assignmentId){
  state.calendarEvents = state.calendarEvents.filter(e=>e.id!=='assign-'+assignmentId);
}
function notifyCalendarChanged(){ document.dispatchEvent(new CustomEvent('td:calendar-changed')); }

// Adds n calendar months to an ISO date string, clamping to the last real day of the
// target month when the original day doesn't exist there (e.g. Jan 31 + 1 month -> Feb 28/29,
// not an invalid "Feb 31" or a silent rollover into March). Used by the Progress Reports
// widget's monthly cadence — the only one of its three frequencies that isn't a fixed
// number of days, so it can't just add n*86400000ms like weekly/bi-weekly do.
function addMonthsISO(dateStr, n){
  const [y,m,d] = dateStr.split('-').map(Number);
  const targetMonthFirst = new Date(y, (m-1)+n, 1);
  const lastDay = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth()+1, 0).getDate();
  return isoDate(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth()+1, Math.min(d, lastDay));
}

function renderAssignments(body){
  let mode = 'list';
  let editingId = null;

  function draw(){
    body.innerHTML = mode === 'form' ? formMarkup() : listMarkup();
    if(mode === 'form') wireForm(); else wireList();
  }

  function listMarkup(){
    const rows = [...state.assignments].sort((a,b)=> (a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    const listHtml = rows.length ? rows.map(a=>`
      <li class="cal-all-row" data-id="${a.id}">
        <div class="cal-all-meta">
          <span class="cal-all-date">${a.dueDate ? (t('asg_due_label')+': '+a.dueDate+(a.dueTime?' · '+a.dueTime:'')) : t('asg_no_due')}${a.subject?' · '+escHtml(a.subject):''}${a.points?' · '+a.points+ ' '+t('asg_points'):''}</span>
          <span class="cal-all-title"></span>
        </div>
        <button class="cal-all-edit" aria-label="${t('asg_edit')}">${iconSvg('settings','wsvg')}</button>
        <button class="cal-all-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
      </li>`).join('') : `<li class="file-empty" data-i18n="asg_none_yet">${t('asg_none_yet')}</li>`;
    const syncNote = state.cloudClassId ? t('asg_synced') : t('asg_not_synced');
    return `
      <div class="cal-head">
        <span class="cal-month" data-i18n="assignments">${t('assignments')}</span>
        <button class="cal-gear" id="asg-new" aria-label="${t('asg_new')}">${iconSvg('plus','wsvg')}</button>
      </div>
      <p class="dock-vis-hint">${escHtml(syncNote)}</p>
      <p class="drawer-label" data-i18n="asg_list_title">${t('asg_list_title')}</p>
      <ul class="cal-all-list">${listHtml}</ul>
    `;
  }

  function wireList(){
    body.querySelectorAll('.cal-all-row').forEach(row=>{
      const a = state.assignments.find(x=>x.id===row.dataset.id);
      if(a) row.querySelector('.cal-all-title').textContent = a.title || t('cal_untitled');
    });
    body.querySelector('#asg-new').addEventListener('click', ()=>{ editingId=null; mode='form'; draw(); });
    body.querySelectorAll('.cal-all-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{ editingId = btn.closest('.cal-all-row').dataset.id; mode='form'; draw(); });
    });
    body.querySelectorAll('.cal-all-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        if(!confirm(t('asg_delete_confirm'))) return;
        state.assignments = state.assignments.filter(a=>a.id!==id);
        removeAssignmentEvent(id);
        saveState(); notifyCalendarChanged(); draw();
      });
    });
  }

  function formMarkup(){
    const editing = editingId ? state.assignments.find(a=>a.id===editingId) : null;
    const f = editing || { title:'', subject:'', dueDate:todayISO(), dueTime:'', points:0, instructions:'' };
    return `
      <div class="cal-head">
        <button class="cal-nav" id="asg-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month">${editing ? t('asg_edit') : t('asg_new')}</span>
      </div>
      <form class="cal-form" id="asg-form">
        <label class="cal-field">
          <span data-i18n="asg_title">${t('asg_title')}</span>
          <input type="text" id="af-title" value="${escHtml(f.title||'')}" maxlength="80" required>
        </label>
        <div class="cal-field-row">
          <label class="cal-field">
            <span data-i18n="asg_subject">${t('asg_subject')}</span>
            <input type="text" id="af-subject" value="${escHtml(f.subject||'')}" maxlength="40">
          </label>
          <label class="cal-field">
            <span data-i18n="asg_points">${t('asg_points')}</span>
            <input type="number" id="af-points" min="0" step="1" value="${f.points||0}">
          </label>
        </div>
        <div class="cal-field-row">
          <label class="cal-field">
            <span data-i18n="asg_due_date">${t('asg_due_date')}</span>
            <input type="date" id="af-date" value="${f.dueDate||''}">
          </label>
          <label class="cal-field">
            <span data-i18n="asg_due_time">${t('asg_due_time')}</span>
            <input type="time" id="af-time" value="${f.dueTime||''}">
          </label>
        </div>
        <p class="dock-vis-hint" data-i18n="asg_calendar_link">${t('asg_calendar_link')}</p>
        <label class="cal-field">
          <span data-i18n="asg_instructions">${t('asg_instructions')}</span>
          <textarea id="af-instructions" rows="3">${escHtml(f.instructions||'')}</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="wbtn primary" data-i18n="asg_push">${t('asg_push')}</button>
          <button type="button" class="wbtn" id="af-cancel" data-i18n="asg_cancel">${t('asg_cancel')}</button>
        </div>
      </form>
    `;
  }

  function wireForm(){
    body.querySelector('#asg-back').addEventListener('click', ()=>{ mode='list'; editingId=null; draw(); });
    body.querySelector('#af-cancel').addEventListener('click', ()=>{ mode='list'; editingId=null; draw(); });
    body.querySelector('#asg-form').addEventListener('submit', e=>{
      e.preventDefault();
      const title = body.querySelector('#af-title').value.trim();
      if(!title) return;
      const subject = body.querySelector('#af-subject').value.trim();
      const points = parseInt(body.querySelector('#af-points').value, 10) || 0;
      const dueDate = body.querySelector('#af-date').value || '';
      const dueTime = body.querySelector('#af-time').value || '';
      const instructions = body.querySelector('#af-instructions').value.trim();
      let asg;
      if(editingId){
        asg = state.assignments.find(a=>a.id===editingId);
        Object.assign(asg, { title, subject, points, dueDate, dueTime, instructions });
      } else {
        asg = { id:cid(), title, subject, points, dueDate, dueTime, instructions, createdAt:Date.now() };
        state.assignments.push(asg);
        stat('assignments'); logAct('assignment', title, 1, awardXP('assignment', 5));
      }
      upsertAssignmentEvent(asg);
      saveState();
      notifyCalendarChanged();
      toast(state.cloudClassId ? t('asg_synced') : t('asg_not_synced'));
      mode = 'list'; editingId = null;
      draw();
    });
  }

  draw();
  const onExternalChange = ()=>{ if(mode==='list') draw(); };
  document.addEventListener('td:calendar-changed', onExternalChange);
  return ()=> document.removeEventListener('td:calendar-changed', onExternalChange);
}

/* =========================================================
   Progress Reports — per-student, not class-wide like Assignments/Calendar.
   The teacher picks one student off the LIVE Cloud Class roster (this widget
   subscribes to TDCloud.subscribeRoster itself, same call Cloud Class makes —
   there's no shared roster state to reach into from here), fills in the same
   fields as the Progress Report docx template, and Send writes straight to
   that one student's own students/{id}/progressReports/{reportId} doc
   (TDCloud.sendProgressReport) — ParentDeck's Progress Reports widget reads
   that same per-student subcollection. This is why it's a direct per-student
   write rather than a syncXxx(classId, list) mirror like Assignments/Calendar
   use: a progress report was never a class-wide broadcast to begin with.

   The weekly/bi-weekly/monthly + start-date picker doesn't resend future
   reports automatically — it schedules REMINDERS on the canonical Calendar
   (state.calendarEvents, ids `pr-<reportId>-<n>`, same "Calendar is the one
   canonical place dates show up" rule Assignments follows) for the teacher
   to come back and fill in each future occurrence themselves. PR_OCCURRENCES
   controls how many of those reminders get created per report.
   ========================================================= */
const PR_OCCURRENCES = 6;
const PR_STEP_DAYS = { weekly:7, biweekly:14 }; // monthly uses addMonthsISO instead, see below

function progressReportDates(startDate, frequency){
  const dates = [];
  for(let i=0;i<PR_OCCURRENCES;i++){
    if(frequency === 'monthly') dates.push(addMonthsISO(startDate, i));
    else dates.push(isoDate(...(function(){
      const d = new Date(startDate+'T00:00:00');
      d.setDate(d.getDate() + i*(PR_STEP_DAYS[frequency]||7));
      return [d.getFullYear(), d.getMonth()+1, d.getDate()];
    })()));
  }
  return dates;
}
function upsertProgressReportEvents(report){
  removeProgressReportEvents(report.id);
  progressReportDates(report.startDate, report.frequency).forEach((date, i)=>{
    state.calendarEvents.push({
      id: `pr-${report.id}-${i}`,
      title: `${t('cal_progress_report_tag')}: ${report.studentName}`,
      date, time:'', reminder:'none',
      notes: i===0 ? t('pr_sent_label') : '',
      type: 'progress-report',
      reportId: report.id,
      fired:false
    });
  });
}
function removeProgressReportEvents(reportId){
  state.calendarEvents = state.calendarEvents.filter(e=> e.reportId !== reportId);
}

function renderProgressReports(body){
  let mode = 'list';
  let roster = [];
  let unsubRoster = ()=>{};

  function draw(){
    body.innerHTML = mode === 'form' ? formMarkup() : listMarkup();
    if(mode === 'form') wireForm(); else wireList();
  }

  function listMarkup(){
    const rows = [...state.progressReports].sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
    const listHtml = rows.length ? rows.map(r=>`
      <li class="cal-all-row" data-id="${r.id}">
        <div class="cal-all-meta">
          <span class="cal-all-date">${escHtml(r.studentName)} · ${t('pr_'+r.frequency)} · ${r.score}/10</span>
          <span class="cal-all-title"></span>
        </div>
        <button class="cal-all-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
      </li>`).join('') : `<li class="file-empty" data-i18n="pr_none_yet">${t('pr_none_yet')}</li>`;
    const syncNote = state.cloudClassId ? t('pr_synced') : t('pr_not_synced');
    return `
      <div class="cal-head">
        <span class="cal-month" data-i18n="progressreports">${t('progressreports')}</span>
        <button class="cal-gear" id="pr-new" aria-label="${t('pr_new')}">${iconSvg('plus','wsvg')}</button>
      </div>
      <p class="dock-vis-hint">${escHtml(syncNote)}</p>
      <p class="drawer-label" data-i18n="pr_list_title">${t('pr_list_title')}</p>
      <ul class="cal-all-list">${listHtml}</ul>
    `;
  }

  function wireList(){
    body.querySelectorAll('.cal-all-row').forEach(row=>{
      const r = state.progressReports.find(x=>x.id===row.dataset.id);
      if(r) row.querySelector('.cal-all-title').textContent = `${t('pr_sent_label')} ${r.startDate}`;
    });
    body.querySelector('#pr-new').addEventListener('click', ()=>{ mode='form'; draw(); });
    body.querySelectorAll('.cal-all-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        if(!confirm(t('pr_delete_confirm'))) return;
        const r = state.progressReports.find(x=>x.id===id);
        state.progressReports = state.progressReports.filter(x=>x.id!==id);
        removeProgressReportEvents(id);
        saveState(); notifyCalendarChanged(); draw();
        if(r && state.cloudClassId){
          TDCloud.deleteProgressReport(r.studentId, id).catch(()=>{});
        }
      });
    });
  }

  function formMarkup(){
    const noRoster = !roster.length;
    const studentOpts = roster.map(s=>`<option value="${s.id}">${escHtml(s.displayName)}</option>`).join('');
    return `
      <div class="cal-head">
        <button class="cal-nav" id="pr-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month">${t('pr_new')}</span>
      </div>
      ${noRoster ? `<p class="dock-vis-hint">${t('pr_no_roster')}</p>` : `
      <form class="cal-form" id="pr-form">
        <label class="cal-field">
          <span data-i18n="pr_student">${t('pr_student')}</span>
          <select id="pf-student" required>
            <option value="" disabled selected>${t('pr_select_student')}</option>
            ${studentOpts}
          </select>
        </label>
        <p class="dock-vis-hint" data-i18n="pr_student_hint">${t('pr_student_hint')}</p>
        <label class="cal-field">
          <span data-i18n="pr_skills">${t('pr_skills')}</span>
          <textarea id="pf-skills" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_improve">${t('pr_improve')}</span>
          <textarea id="pf-improve" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_strengths">${t('pr_strengths')}</span>
          <textarea id="pf-strengths" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_next_focus">${t('pr_next_focus')}</span>
          <textarea id="pf-nextfocus" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_score">${t('pr_score')}</span>
          <input type="number" id="pf-score" min="0" max="10" step="1" value="0"> <span class="dock-vis-hint">${t('pr_score_out_of')}</span>
        </label>
        <p class="drawer-label" data-i18n="pr_frequency">${t('pr_frequency')}</p>
        <div id="pf-freq-row">
          <label class="chk-row"><input type="checkbox" class="pf-freq" value="weekly"> ${t('pr_weekly')}</label>
          <label class="chk-row"><input type="checkbox" class="pf-freq" value="biweekly"> ${t('pr_biweekly')}</label>
          <label class="chk-row"><input type="checkbox" class="pf-freq" value="monthly"> ${t('pr_monthly')}</label>
        </div>
        <label class="cal-field">
          <span data-i18n="pr_start_date">${t('pr_start_date')}</span>
          <input type="date" id="pf-startdate" value="${todayISO()}">
        </label>
        <p class="dock-vis-hint" data-i18n="pr_calendar_link">${t('pr_calendar_link')}</p>
        <div class="btn-row">
          <button type="submit" class="wbtn primary" data-i18n="pr_send">${t('pr_send')}</button>
          <button type="button" class="wbtn" id="pf-cancel" data-i18n="pr_cancel">${t('pr_cancel')}</button>
        </div>
      </form>`}
    `;
  }

  function wireForm(){
    body.querySelector('#pr-back').addEventListener('click', ()=>{ mode='list'; draw(); });
    if(!roster.length) return;
    body.querySelector('#pf-cancel').addEventListener('click', ()=>{ mode='list'; draw(); });
    // Checkboxes that behave as a single-select group: checking one unchecks the others,
    // rather than a <select> or radio group — matches how the frequency choice was asked
    // for, while still only ever allowing one frequency per report.
    const freqBoxes = [...body.querySelectorAll('.pf-freq')];
    freqBoxes.forEach(box=>{
      box.addEventListener('change', ()=>{
        if(box.checked) freqBoxes.forEach(b=>{ if(b!==box) b.checked = false; });
      });
    });
    body.querySelector('#pr-form').addEventListener('submit', e=>{
      e.preventDefault();
      const studentId = body.querySelector('#pf-student').value;
      const student = roster.find(s=>s.id===studentId);
      if(!student) return;
      const frequency = (freqBoxes.find(b=>b.checked)||{}).value;
      if(!frequency){ toast(t('pr_select_frequency')); return; }
      const startDate = body.querySelector('#pf-startdate').value || todayISO();
      const report = {
        id: cid(),
        studentId,
        studentName: student.displayName,
        classId: state.cloudClassId || '',
        skills: body.querySelector('#pf-skills').value.trim(),
        improve: body.querySelector('#pf-improve').value.trim(),
        strengths: body.querySelector('#pf-strengths').value.trim(),
        nextFocus: body.querySelector('#pf-nextfocus').value.trim(),
        score: Math.max(0, Math.min(10, parseInt(body.querySelector('#pf-score').value,10) || 0)),
        frequency, startDate,
        createdAt: Date.now()
      };
      state.progressReports.push(report);
      track('report', student.displayName || '');
      upsertProgressReportEvents(report);
      saveState();
      notifyCalendarChanged();
      if(state.cloudClassId){
        TDCloud.sendProgressReport(studentId, report)
          .then(()=> toast(t('pr_synced')))
          .catch(err=> toast(err.message||String(err)));
      } else {
        toast(t('pr_not_synced'));
      }
      mode = 'list';
      draw();
    });
  }

  draw();
  if(state.cloudClassId){
    unsubRoster = TDCloud.subscribeRoster(state.cloudClassId, list=>{ roster = list; if(mode==='form') draw(); });
  }
  const onExternalChange = ()=>{ if(mode==='list') draw(); };
  document.addEventListener('td:calendar-changed', onExternalChange);
  return ()=>{ unsubRoster(); document.removeEventListener('td:calendar-changed', onExternalChange); };
}

/* ---------------- Reminder engine (runs regardless of whether the widget is open) ---------------- */
function showReminderPopup(ev){
  const overlay = document.createElement('div');
  overlay.className = 'reminder-overlay';
  const when = new Date(`${ev.date}T${ev.time||'00:00'}:00`)
    .toLocaleString(LOCALE_MAP[state.lang]||'en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  overlay.innerHTML = `
    <div class="reminder-card">
      <p class="reminder-kicker">${t('reminder_popup_title')}</p>
      <h3></h3>
      <p class="reminder-meta"></p>
      <p class="reminder-notes"></p>
      <button class="wbtn primary">${t('dismiss')}</button>
    </div>
  `;
  overlay.querySelector('h3').textContent = ev.title || t('cal_untitled');
  overlay.querySelector('.reminder-meta').textContent = when;
  overlay.querySelector('.reminder-notes').textContent = ev.notes || '';
  overlay.querySelector('button').addEventListener('click', ()=> overlay.remove());
  document.body.appendChild(overlay);

  if(state.notifsEnabled && 'Notification' in window && Notification.permission === 'granted'){
    try{ new Notification(ev.title || t('cal_untitled'), { body: ev.notes || when }); }catch(err){}
  }
}

function checkReminders(){
  const now = new Date();
  let changed = false;
  state.calendarEvents.forEach(ev=>{
    if(ev.fired || !ev.time || !ev.reminder || ev.reminder === 'none') return;
    const evDate = new Date(`${ev.date}T${ev.time}:00`);
    const remindMinutes = ev.reminder === 'at' ? 0 : parseInt(ev.reminder, 10) || 0;
    const remindAt = new Date(evDate.getTime() - remindMinutes*60000);
    const graceMs = 60*60000;
    if(now >= remindAt && (evDate.getTime() - now.getTime()) > -graceMs){
      showReminderPopup(ev);
      ev.fired = true;
      changed = true;
    }
  });
  if(changed) saveState();
}

/* ---------------- Lesson Planner widget ----------------
   Fill in the essentials of a lesson, then:
     • Open in Word        -> downloads a copy of the Universal Lesson Planner
                              template with the header, objectives, materials
                              and pacing minutes already filled in (a browser
                              page can't launch Word itself, so the file lands
                              in Downloads, ready to open and finish).
     • Open in Google Docs -> copies the same plan to the clipboard as a
                              formatted table layout and opens a new, titled
                              Google Doc; paste with Ctrl/Cmd+V. (Pushing a
                              file straight into someone's Google Drive would
                              need a Google sign-in this app doesn't have.)
     • Save to calendar    -> puts the lesson in the Calendar widget as an
                              event (date, start time, length, reminder and a
                              summary in the notes). Saving again UPDATES that
                              event instead of adding a duplicate.
   The draft lives in state.lessonPlanner, so like everything else it is kept
   per class. The blank template is embedded in js/lesson-template.js and
   filled with JSZip (js/jszip.min.js), so it works offline and from file://.
   ---------------------------------------------------------------- */
const LP_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LP_PHASE_COUNT = 5;

function escHtml(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// XML text: same escapes, plus drop control characters XML forbids outright.
function escXml(s){
  return escHtml(s).replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
}

function lpEnsure(){
  const lp = state.lessonPlanner || (state.lessonPlanner = {});
  ['topic','teacher','subject','start','objectives','materials','eventId'].forEach(k=>{ if(typeof lp[k] !== 'string') lp[k] = ''; });
  if(!lp.date) lp.date = todayISO();
  if(!(lp.duration >= 0)) lp.duration = 45;
  if(!lp.reminder) lp.reminder = 'none';
  if(!Array.isArray(lp.phases) || lp.phases.length !== LP_PHASE_COUNT) lp.phases = new Array(LP_PHASE_COUNT).fill('');
  if(typeof lp.saveToCal !== 'boolean') lp.saveToCal = true;
  // Grade/Class starts as the name of the class that's open — once, never again,
  // so clearing it by hand sticks.
  if(lp.cls === undefined){
    const c = activeClass();
    lp.cls = (c && c.name && c.name.trim()) ? c.name.trim() : '';
  }
  return lp;
}

function lpDateLabel(dateStr, opts){
  const [y,m,d] = String(dateStr).split('-').map(Number);
  if(!y || !m || !d) return '';
  return new Date(y, m-1, d).toLocaleDateString(LOCALE_MAP[state.lang]||'en-US',
    opts || { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}
function lpEndTime(start, minutes){
  const [h,m] = start.split(':').map(Number);
  const total = (h*60 + m + minutes) % (24*60);
  return `${pad2(Math.floor(total/60))}:${pad2(total%60)}`;
}
function lpDurationLabel(lp){
  const d = lp.duration > 0 ? `${lp.duration} min` : '';
  if(lp.start && lp.duration > 0) return `${d} · ${lp.start}–${lpEndTime(lp.start, lp.duration)}`;
  return d || lp.start || '';
}
function lpTotalMinutes(lp){
  return lp.phases.reduce((s,v)=> s + (parseInt(v,10) > 0 ? parseInt(v,10) : 0), 0);
}
function lpFileName(lp){
  const base = (lp.topic || lp.subject || '').replace(/[\\/:*?"<>|$\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
  return ['Lesson Plan', base, lp.date].filter(Boolean).join(' - ') + '.docx';
}

/* ---- Word: fill the embedded template ---- */
function lpDocValues(lp){
  return {
    'Teacher:':            lp.teacher,
    'Subject / Course:':   lp.subject,
    'Date / Week:':        lp.date ? lpDateLabel(lp.date, { weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '',
    'Grade Level / Class:': lp.cls,
    'Lesson Topic:':       lp.topic,
    'Duration / Period:':  lpDurationLabel(lp)
  };
}

function lpFillDocXml(xml, lp){
  const INK = '212121';
  const splice = (s, from, to, text)=> s.slice(0, from) + text + s.slice(to);
  const positionsOf = (s, needle)=>{
    const out = []; let from = 0;
    for(;;){ const i = s.indexOf(needle, from); if(i < 0) return out; out.push(i); from = i + needle.length; }
  };

  // 1. The six header lines: "Label: ______" -> "Label: value". Blank values
  //    keep their underscores so they can still be written in by hand.
  const vals = lpDocValues(lp);
  Object.keys(vals).forEach(label=>{
    const v = String(vals[label] || '').trim();
    if(!v) return;
    const run = c => `<w:t>${label}</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${c}"/><w:sz w:val="20"/></w:rPr>`;
    const before = run('9E9E9E') + '<w:t xml:space="preserve"> ______________________</w:t>';
    const i = xml.indexOf(before);
    if(i < 0) return;
    xml = splice(xml, i, i + before.length, run(INK) + `<w:t xml:space="preserve"> ${escXml(v)}</w:t>`);
  });

  // 2. Objectives and materials: the two identical grey placeholder paragraphs,
  //    first = objectives, second = materials. One paragraph per typed line.
  const PH = '[Click here to type objectives/materials...]';
  const phPos = positionsOf(xml, PH);
  const texts = [lp.objectives, lp.materials];
  for(let k = Math.min(phPos.length, 2) - 1; k >= 0; k--){      // last first, so earlier offsets stay valid
    const text = String(texts[k] || '').trim();
    if(!text) continue;
    const pStart = xml.lastIndexOf('<w:p>', phPos[k]);
    const pEnd = xml.indexOf('</w:p>', phPos[k]) + '</w:p>'.length;
    if(pStart < 0 || pEnd < pStart) continue;
    const paras = text.split(/\r?\n/).map(l=> l.trim()).filter(Boolean).map(line =>
      `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${INK}"/><w:sz w:val="19"/></w:rPr><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`
    ).join('');
    xml = splice(xml, pStart, pEnd, paras);
  }

  // 3. Pacing: "____ min" in each of the five phase rows.
  const TIME = '<w:t>____ min</w:t>';
  const tPos = positionsOf(xml, TIME);
  for(let k = Math.min(tPos.length, LP_PHASE_COUNT) - 1; k >= 0; k--){
    const n = parseInt(lp.phases[k], 10);
    if(!(n > 0)) continue;
    xml = splice(xml, tPos[k], tPos[k] + TIME.length, `<w:t>${n} min</w:t>`);
  }
  return xml;
}

async function lpBuildDocx(lp){
  if(typeof JSZip === 'undefined') throw new Error('JSZip is not loaded');
  if(!window.LESSON_TEMPLATE_B64) throw new Error('the lesson plan template is missing');
  const zip = await JSZip.loadAsync(window.LESSON_TEMPLATE_B64, { base64:true });
  const entry = zip.file('word/document.xml');
  if(!entry) throw new Error('the template has no word/document.xml');
  zip.file('word/document.xml', lpFillDocXml(await entry.async('string'), lp));
  const coreEntry = zip.file('docProps/core.xml');
  if(coreEntry) zip.file('docProps/core.xml', lpWatermarkCoreXml(await coreEntry.async('string')));
  return zip.generateAsync({ type:'blob', mimeType: LP_DOCX_MIME, compression:'DEFLATE' });
}

// Stamps the export watermark into Word's own document properties instead of
// anywhere in the visible plan — Word never renders docProps on the page, so
// the printed/emailed plan looks completely ordinary while the file still
// carries a token tied to this license + device. Handles both the empty
// self-closing tags the bundled template ships with (<cp:keywords/>) and a
// non-empty tag, in case a future template already has keywords set.
function lpWatermarkCoreXml(xml){
  const token = exportWatermarkToken();
  xml = xml.replace(/<cp:keywords\/>|<cp:keywords>[\s\S]*?<\/cp:keywords>/,
    `<cp:keywords>td:${token}</cp:keywords>`);
  xml = xml.replace(/<cp:lastModifiedBy\/>|<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/,
    '<cp:lastModifiedBy>TeachersDeck</cp:lastModifiedBy>');
  return xml;
}

function lpDownload(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 60000);
}

/* ---- Google Docs: a formatted copy for pasting ---- */
function lpPlanHtml(lp){
  const F = "font-family:Arial,Helvetica,sans-serif;";
  const td = extra => `border:1px solid #CCCCCC;padding:6px 8px;vertical-align:top;${F}font-size:10pt;${extra||''}`;
  const th = `border:1px solid #CCCCCC;background-color:#EAF0F8;padding:6px 8px;${F}font-size:10pt;font-weight:bold;color:#1F3A60;text-align:left;`;
  const ph = txt => `<span style="color:#9E9E9E;font-style:italic;">${escHtml(txt)}</span>`;
  const multi = s => escHtml(s).replace(/\r?\n/g, '<br>');
  const val = (s, placeholder) => (s && String(s).trim()) ? multi(String(s).trim()) : ph(placeholder);
  const section = title => `<p style="${F}font-size:12pt;font-weight:bold;color:#1F3A60;margin:16pt 0 4pt;">${escHtml(title)}</p>`;
  const table = rows => `<table style="border-collapse:collapse;width:100%;">${rows}</table>`;
  const vals = lpDocValues(lp);
  const labels = Object.keys(vals);
  const headRows = [0,2,4].map(i => `<tr>${[i,i+1].map(j =>
    `<td style="${td('width:50%;')}"><b>${escHtml(labels[j])}</b> ${vals[labels[j]] ? escHtml(vals[labels[j]]) : ph('______________________')}</td>`).join('')}</tr>`).join('');
  const PROC = '[Describe steps, questions, and active student tasks here...]';
  const phaseNames = ['1. Hook / Introduction','2. Direct Instruction','3. Guided Practice','4. Independent Practice','5. Closure / Wrap-up'];
  const phaseRows = phaseNames.map((name,i)=>{
    const n = parseInt(lp.phases[i], 10);
    return `<tr><td style="${td('font-weight:bold;width:24%;')}">${escHtml(name)}</td><td style="${td('text-align:center;width:14%;')}">${n > 0 ? n + ' min' : ph('____ min')}</td><td style="${td()}">${ph(PROC)}</td></tr>`;
  }).join('');
  const box = txt => ph(txt);
  return `<meta charset="utf-8"><div>` +
    `<p style="${F}font-size:18pt;font-weight:bold;color:#1F3A60;text-align:center;margin:0 0 8pt;">UNIVERSAL LESSON PLANNER</p>` +
    table(headRows) +
    section('LEARNING OBJECTIVES & REQUIRED MATERIALS') +
    table(`<tr><td style="${th}width:50%;">Core Learning Objectives (SMART Criteria)</td><td style="${th}width:50%;">Required Materials &amp; Resources</td></tr>` +
          `<tr><td style="${td()}">${val(lp.objectives, '[Click here to type objectives/materials...]')}</td><td style="${td()}">${val(lp.materials, '[Click here to type objectives/materials...]')}</td></tr>`) +
    section('LESSON PACING TIMELINE & STRUCTURAL PHASES') +
    table(`<tr><td style="${th}">Lesson Phase</td><td style="${th}">Time</td><td style="${th}">Procedure / Teacher Activities &amp; Student Responses</td></tr>${phaseRows}`) +
    section('ASSESSMENT STRATEGIES & DIFFERENTIATION ACCOMMODATIONS') +
    table(`<tr><td style="${th}width:50%;">Assessment &amp; Verification (Checks for Understanding)</td><td style="${th}width:50%;">Differentiation &amp; Support (Scaffolding / Extension)</td></tr>` +
          `<tr><td style="${td()}">${box('[Type assessment checks or scaffolding criteria here...]')}</td><td style="${td()}">${box('[Type assessment checks or scaffolding criteria here...]')}</td></tr>`) +
    section('POST-LESSON REFLECTION & FUTURE EVALUATION') +
    table(`<tr><td style="${th}">Self-Reflection Notes (What worked well? What needs adjustments for next time?)</td></tr>` +
          `<tr><td style="${td()}">${box('[Reflect on timing, engagement strategies, and student comprehension data...]')}</td></tr>`) +
    `</div>`;
}

function lpPlanText(lp){
  const vals = lpDocValues(lp);
  const lines = ['UNIVERSAL LESSON PLANNER', ''];
  Object.keys(vals).forEach(k=> lines.push(`${k} ${vals[k] || '______________________'}`));
  lines.push('', 'LEARNING OBJECTIVES & REQUIRED MATERIALS', 'Core Learning Objectives (SMART Criteria):', lp.objectives.trim() || '[…]',
             '', 'Required Materials & Resources:', lp.materials.trim() || '[…]', '', 'LESSON PACING TIMELINE & STRUCTURAL PHASES');
  ['1. Hook / Introduction','2. Direct Instruction','3. Guided Practice','4. Independent Practice','5. Closure / Wrap-up'].forEach((name,i)=>{
    const n = parseInt(lp.phases[i], 10);
    lines.push(`${name} — ${n > 0 ? n + ' min' : '____ min'}`);
  });
  lines.push('', 'ASSESSMENT STRATEGIES & DIFFERENTIATION ACCOMMODATIONS', 'Assessment & Verification (Checks for Understanding):', '',
             'Differentiation & Support (Scaffolding / Extension):', '', 'POST-LESSON REFLECTION & FUTURE EVALUATION', 'Self-Reflection Notes:', '');
  return lines.join('\n');
}

/* Copy a short plain-text string (a join code). Clipboard API first; falls back
   to a hidden textarea + execCommand for http:// pages and extension contexts
   where navigator.clipboard is unavailable or refused. */
async function ccCopyText(text){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); return true; }
  }catch(err){ console.warn('TeachersDeck: clipboard API refused, trying the older copy command', err); }
  let ta = null;
  try{
    ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly','');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta); ta.select();
    return document.execCommand('copy');
  }catch(err){ return false; }
  finally{ if(ta && ta.parentNode) ta.parentNode.removeChild(ta); }
}

async function lpCopyPlan(lp){
  const html = lpPlanHtml(lp), text = lpPlanText(lp);
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([ new ClipboardItem({
        'text/html':  new Blob([(window.Watermark ? Watermark.stamp(html) : html)], { type:'text/html' }),
        'text/plain': new Blob([(window.Watermark ? Watermark.stamp(text) : text)], { type:'text/plain' })
      }) ]);
      return true;
    }
  }catch(err){ console.warn('TeachersDeck: clipboard API refused, trying the older copy command', err); }
  // Older route: select a rendered copy of the HTML and use the copy command.
  let holder = null;
  try{
    holder = document.createElement('div');
    holder.contentEditable = 'true';
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const range = document.createRange(); range.selectNodeContents(holder);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges();
    return !!ok;
  }catch(err){ return false; }
  finally{ if(holder) holder.remove(); }
}

function lpOpenGoogleDoc(lp){
  const title = lpFileName(lp).replace(/\.docx$/, '');
  const w = window.open('https://docs.google.com/document/create?title=' + encodeURIComponent(title), '_blank');
  if(w){ try{ w.opener = null; }catch(e){} }
  return !!w;
}

/* ---- Calendar ---- */
function lpEventFields(lp){
  let title = `${t('lp_event_prefix')}: ${lp.topic.trim()}`;
  if(lp.cls && lp.cls.trim()) title += ` — ${lp.cls.trim()}`;
  if(title.length > 60) title = title.slice(0, 59).trimEnd() + '…';   // the Calendar's own title limit
  const lines = [];
  const add = (label, v)=>{ if(v && String(v).trim()) lines.push(`${label}: ${String(v).trim()}`); };
  add(t('lp_teacher'), lp.teacher);
  add(t('lp_subject'), lp.subject);
  add(t('lp_class'), lp.cls);
  if(lp.duration > 0) lines.push(`${t('lp_duration')}: ${lp.duration}`);
  const phases = lp.phases.map((m,i)=> parseInt(m,10) > 0 ? `${t('lp_phase_'+(i+1))} ${parseInt(m,10)}` : '').filter(Boolean);
  if(phases.length) lines.push(`${t('lp_pacing')}: ${phases.join(' · ')}`);
  if(lp.objectives.trim()) lines.push('', `${t('lp_objectives')}:`, lp.objectives.trim());
  if(lp.materials.trim())  lines.push('', `${t('lp_materials')}:`, lp.materials.trim());
  const time = lp.start || '';
  return {
    title, date: lp.date, time,
    duration: lp.duration > 0 ? lp.duration : 0,
    reminder: time ? (lp.reminder || 'none') : 'none',     // a reminder needs a time to count back from
    notes: lines.join('\n')
  };
}

function lpSaveToCalendar(lp){
  if(!lp.topic.trim()) return { ok:false, reason:'topic' };
  if(!lp.date) return { ok:false, reason:'date' };
  const f = lpEventFields(lp);
  const existing = lp.eventId ? state.calendarEvents.find(e=> e.id === lp.eventId) : null;
  if(existing){
    Object.assign(existing, f, { fired:false });
  } else {
    lp.eventId = cid();
    state.calendarEvents.push({ id: lp.eventId, fired:false, lesson:true, ...f });
    stat('lessons'); logAct('lesson', f.title || '', 1, awardXP('lesson', 10));
  }
  saveState();
  document.dispatchEvent(new CustomEvent('td:calendar-changed'));
  return { ok:true, updated: !!existing };
}

function renderLessonPlanner(body){
  const lp = lpEnsure();
  let saveTimer = null, busy = false;
  const queueSave = ()=>{ clearTimeout(saveTimer); saveTimer = setTimeout(()=>{ saveTimer = null; saveState(); }, 250); };

  function markup(){
    const remOptions = REMINDER_OPTIONS.map(o=> `<option value="${o.value}">${escHtml(t(o.key))}</option>`).join('');
    const phaseRows = [1,2,3,4,5].map(n => `
      <label class="lp-phase-row">
        <span data-i18n="lp_phase_${n}">${escHtml(t('lp_phase_'+n))}</span>
        <input type="number" min="0" max="240" step="1" inputmode="numeric" data-phase="${n-1}">
      </label>`).join('');
    return `
      <div class="lp-wrap">
        <label class="cal-field"><span data-i18n="lp_topic">${escHtml(t('lp_topic'))}</span>
          <input type="text" id="lp-topic" maxlength="120"></label>
        <div class="cal-field-row">
          <label class="cal-field"><span data-i18n="cal_date">${escHtml(t('cal_date'))}</span><input type="date" id="lp-date"></label>
          <label class="cal-field"><span data-i18n="lp_start">${escHtml(t('lp_start'))}</span><input type="time" id="lp-start"></label>
        </div>
        <div class="cal-field-row">
          <label class="cal-field"><span data-i18n="lp_duration">${escHtml(t('lp_duration'))}</span><input type="number" id="lp-duration" min="0" max="480" step="5" inputmode="numeric"></label>
          <label class="cal-field"><span data-i18n="cal_reminder">${escHtml(t('cal_reminder'))}</span><select id="lp-remind">${remOptions}</select></label>
        </div>
        <div class="cal-field-row">
          <label class="cal-field"><span data-i18n="lp_teacher">${escHtml(t('lp_teacher'))}</span><input type="text" id="lp-teacher" maxlength="80"></label>
          <label class="cal-field"><span data-i18n="lp_subject">${escHtml(t('lp_subject'))}</span><input type="text" id="lp-subject" maxlength="80"></label>
        </div>
        <label class="cal-field"><span data-i18n="lp_class">${escHtml(t('lp_class'))}</span><input type="text" id="lp-class" maxlength="80"></label>

        <details class="lp-details">
          <summary><span data-i18n="lp_sec_content">${escHtml(t('lp_sec_content'))}</span></summary>
          <div class="lp-details-body">
            <label class="cal-field"><span data-i18n="lp_objectives">${escHtml(t('lp_objectives'))}</span><textarea id="lp-objectives" rows="3"></textarea></label>
            <label class="cal-field"><span data-i18n="lp_materials">${escHtml(t('lp_materials'))}</span><textarea id="lp-materials" rows="3"></textarea></label>
          </div>
        </details>
        <details class="lp-details">
          <summary><span data-i18n="lp_pacing">${escHtml(t('lp_pacing'))}</span></summary>
          <div class="lp-details-body">
            ${phaseRows}
            <p class="lp-total" id="lp-total"></p>
          </div>
        </details>

        <div class="lp-open-row">
          <button type="button" class="wbtn primary" id="lp-word"><span data-i18n="lp_open_word">${escHtml(t('lp_open_word'))}</span></button>
          <button type="button" class="wbtn primary" id="lp-docs"><span data-i18n="lp_open_docs">${escHtml(t('lp_open_docs'))}</span></button>
        </div>
        <label class="lp-check"><input type="checkbox" id="lp-cal"><span data-i18n="lp_also_cal">${escHtml(t('lp_also_cal'))}</span></label>
        <div class="btn-row">
          <button type="button" class="wbtn" id="lp-save-cal"><span data-i18n="lp_save_cal">${escHtml(t('lp_save_cal'))}</span></button>
          <button type="button" class="wbtn" id="lp-new"><span data-i18n="lp_new">${escHtml(t('lp_new'))}</span></button>
        </div>
        <p class="lp-status" id="lp-status" aria-live="polite"></p>
        <p class="lp-hint" data-i18n="lp_hint">${escHtml(t('lp_hint'))}</p>
      </div>`;
  }

  const $ = sel => body.querySelector(sel);

  function refreshTotal(){
    const n = lpTotalMinutes(lp);
    $('#lp-total').textContent = n > 0 ? t('lp_total', { n }) : '';
  }

  // "On the calendar: …" — and a nudge when the form has moved on from what was saved.
  function refreshStatus(){
    const el = $('#lp-status');
    const ev = lp.eventId ? state.calendarEvents.find(e=> e.id === lp.eventId) : null;
    if(!ev){ el.textContent = ''; el.classList.remove('stale'); return; }
    const when = lpDateLabel(ev.date) + (ev.time ? ` · ${ev.time}` : '');
    let stale = false;
    if(lp.topic.trim() && lp.date){
      const f = lpEventFields(lp);
      stale = ['title','date','time','duration','reminder','notes'].some(k=> (ev[k] || '') !== (f[k] || ''));
    }
    el.textContent = `✓ ${t('lp_on_calendar')} ${when}` + (stale ? ` — ${t('lp_cal_outdated')}` : '');
    el.classList.toggle('stale', stale);
  }

  function bindText(sel, key){
    const el = $(sel); el.value = lp[key] || '';
    el.addEventListener('input', ()=>{ lp[key] = el.value; queueSave(); refreshStatus(); });
  }

  function wire(){
    bindText('#lp-topic','topic'); bindText('#lp-teacher','teacher'); bindText('#lp-subject','subject'); bindText('#lp-class','cls');
    bindText('#lp-date','date'); bindText('#lp-start','start');
    bindText('#lp-objectives','objectives'); bindText('#lp-materials','materials');
    const dur = $('#lp-duration'); dur.value = lp.duration > 0 ? lp.duration : '';
    dur.addEventListener('input', ()=>{ lp.duration = Math.max(0, Math.min(480, parseInt(dur.value, 10) || 0)); queueSave(); refreshStatus(); });
    const rem = $('#lp-remind'); rem.value = lp.reminder;
    rem.addEventListener('change', ()=>{ lp.reminder = rem.value; queueSave(); refreshStatus(); });
    body.querySelectorAll('[data-phase]').forEach(inp=>{
      const i = +inp.dataset.phase;
      inp.value = lp.phases[i] || '';
      inp.addEventListener('input', ()=>{ lp.phases[i] = inp.value; queueSave(); refreshTotal(); refreshStatus(); });
    });
    const chk = $('#lp-cal'); chk.checked = lp.saveToCal;
    chk.addEventListener('change', ()=>{ lp.saveToCal = chk.checked; queueSave(); });
    $('#lp-word').addEventListener('click', ()=> run('word'));
    $('#lp-docs').addEventListener('click', ()=> run('docs'));
    $('#lp-save-cal').addEventListener('click', ()=>{
      const r = lpSaveToCalendar(lp);
      if(r.ok) toast(t(r.updated ? 'lp_cal_updated' : 'lp_cal_saved'));
      else { toast(t('lp_need_topic'), 4000); const tp = $('#lp-topic'); if(tp) tp.focus(); }
      refreshStatus();
    });
    $('#lp-new').addEventListener('click', ()=>{
      // Same teacher / subject / class / time slot; a fresh lesson.
      Object.assign(lp, { topic:'', objectives:'', materials:'', phases:new Array(LP_PHASE_COUNT).fill(''), eventId:'', date:todayISO() });
      saveState(); draw();
    });
    refreshTotal(); refreshStatus();
  }

  async function run(kind){
    if(busy) return;
    busy = true;
    body.querySelectorAll('#lp-word, #lp-docs').forEach(b=> b.disabled = true);
    try{
      let msg;
      if(kind === 'word'){
        const name = lpFileName(lp);
        lpDownload(await lpBuildDocx(lp), name);
        msg = `${t('lp_word_done')} ${name}`;
      } else {
        const copied = await lpCopyPlan(lp);
        const opened = lpOpenGoogleDoc(lp);
        const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
        msg = !opened ? t('lp_docs_blocked')
            : copied  ? t('lp_docs_copied', { key: /mac|iphone|ipad/i.test(plat) ? '⌘V' : 'Ctrl+V' })
            :           t('lp_docs_nocopy');
      }
      if(lp.saveToCal){
        const r = lpSaveToCalendar(lp);
        msg += ' ' + (r.ok ? t(r.updated ? 'lp_cal_updated' : 'lp_cal_saved') : t('lp_need_topic'));
      }
      toast(msg, 7000);
      refreshStatus();
    }catch(err){
      console.error('TeachersDeck: lesson planner', err);
      toast(t(kind === 'word' ? 'lp_err_word' : 'lp_err_docs'), 5000);
    }finally{
      busy = false;
      body.querySelectorAll('#lp-word, #lp-docs').forEach(b=> b.disabled = false);
    }
  }

  function draw(){ body.innerHTML = markup(); wire(); }
  draw();

  // Closing the widget mid-keystroke must not lose the last edit.
  return ()=>{ if(saveTimer){ clearTimeout(saveTimer); saveState(); } };
}

/* ---------------- Poll widget ---------------- */
function renderPoll(body){
  let mode = 'view';

  function draw(){
    body.innerHTML = mode === 'manage' ? manageMarkup() : viewMarkup();
    if(mode === 'manage') wireManage(); else wireView();
  }

  function viewMarkup(){
    const total = state.poll.options.reduce((s,o)=>s+o.votes, 0);
    const optsHtml = state.poll.options.map((o,i)=>{
      const pct = total > 0 ? Math.round((o.votes/total)*100) : 0;
      const color = SB_COLORS[i % SB_COLORS.length];
      return `
        <button class="poll-opt" data-id="${o.id}">
          <span class="poll-opt-bar" style="width:${pct}%; background:${color}"></span>
          <span class="poll-opt-label"></span>
          <span class="poll-opt-count">${o.votes}</span>
        </button>`;
    }).join('');
    return `
      <div class="cal-head">
        <span class="poll-q"></span>
        <button class="cal-gear" id="poll-gear" aria-label="${t('poll_manage')}">${iconSvg('settings','wsvg')}</button>
      </div>
      <p class="poll-hint" data-i18n="poll_tap_hint">${t('poll_tap_hint')}</p>
      <div class="poll-opts">${optsHtml}</div>
      <p class="poll-total"></p>
      <button class="ghost-btn" id="poll-reset" data-i18n="poll_reset_votes">${t('poll_reset_votes')}</button>
    `.replace('<p class="poll-total"></p>', `<p class="poll-total">${t('poll_total_votes', { n: total })}</p>`);
  }

  function wireView(){
    body.querySelector('.poll-q').textContent = state.poll.question || t('poll_question_label');
    body.querySelectorAll('.poll-opt').forEach(btn=>{
      const o = state.poll.options.find(x=>x.id===btn.dataset.id);
      if(o) btn.querySelector('.poll-opt-label').textContent = o.text || t('poll_option_label');
      btn.addEventListener('click', ()=>{
        if(o){ o.votes++; saveState(); draw(); track('poll', o.text); }
      });
    });
    body.querySelector('#poll-gear').addEventListener('click', ()=>{ mode='manage'; draw(); });
    body.querySelector('#poll-reset').addEventListener('click', ()=>{
      state.poll.options.forEach(o=> o.votes = 0);
      saveState(); draw();
    });
  }

  function manageMarkup(){
    const rowsHtml = state.poll.options.map(o=>`
      <li class="poll-edit-row" data-id="${o.id}">
        <input type="text" class="poll-edit-input" value="${(o.text||'').replace(/"/g,'&quot;')}" placeholder="${t('poll_option_label')}">
        <button class="poll-edit-remove" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
      </li>`).join('');
    return `
      <div class="cal-head">
        <button class="cal-nav" id="poll-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month" data-i18n="poll_manage">${t('poll_manage')}</span>
      </div>
      <label class="cal-field" style="margin-bottom:10px">
        <span data-i18n="poll_question_label">${t('poll_question_label')}</span>
        <input type="text" id="poll-q-input" value="${(state.poll.question||'').replace(/"/g,'&quot;')}" maxlength="80">
      </label>
      <ul class="poll-edit-list">${rowsHtml}</ul>
      <button class="ghost-btn" id="poll-add-opt" data-i18n="poll_add_option">${t('poll_add_option')}</button>
    `;
  }

  function wireManage(){
    body.querySelector('#poll-back').addEventListener('click', ()=>{ mode='view'; draw(); });
    body.querySelector('#poll-q-input').addEventListener('change', e=>{
      state.poll.question = e.target.value.trim();
      saveState();
    });
    body.querySelectorAll('.poll-edit-row').forEach(row=>{
      const o = state.poll.options.find(x=>x.id===row.dataset.id);
      row.querySelector('.poll-edit-input').addEventListener('change', e=>{
        if(o){ o.text = e.target.value.trim(); saveState(); }
      });
      row.querySelector('.poll-edit-remove').addEventListener('click', ()=>{
        if(state.poll.options.length <= 2){ toast(t('poll_min_options')); return; }
        state.poll.options = state.poll.options.filter(x=>x.id!==row.dataset.id);
        saveState(); draw();
      });
    });
    body.querySelector('#poll-add-opt').addEventListener('click', ()=>{
      if(state.poll.options.length >= 8) return;
      state.poll.options.push({ id:cid(), text:'', votes:0 });
      saveState(); draw();
    });
  }

  draw();
  return null;
}

/* ---------------- Noise Meter widget (microphone access) ----------------
   Three meter styles (circle / vertical bar / horizontal bar), a 3-second peak
   "peg", and a line graph of the whole session. The meter shows a rolling peak:
   when the level rises above what is displayed the meter jumps to it and stays
   pegged there for NOISE_HOLD_MS (restarting if something louder arrives), then
   falls back to the live level. The graph records the live level, not the peg. */
const NOISE_MAX = 100;            // full scale for the meter and graph (0 dBFS reads as 100)
const NOISE_HOLD_MS = 3000;       // how long the meter stays pegged at its highest level
const NOISE_FALL_PER_SEC = 35;    // after the peg, how fast it falls back to the live level
const NOISE_SAMPLE_MS = 250;      // graph resolution (doubles when the session gets long)
const NOISE_MAX_POINTS = 1200;    // beyond this, neighbouring samples are merged (keeping the max)
const NOISE_MIN_SPAN_MS = 30000;  // the graph is at least this wide, so a new session grows from the left
const NOISE_STYLES = ['circle','vbar','hbar'];
const NOISE_ICONS = {
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>',
  vbar:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8.5" y="3" width="7" height="18" rx="2"/><rect x="8.5" y="12" width="7" height="9" rx="2" fill="currentColor"/></svg>',
  hbar:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8.5" width="18" height="7" rx="2"/><rect x="3" y="8.5" width="9" height="7" rx="2" fill="currentColor"/></svg>'
};
// Graph data lives here, not inside the widget, so closing and reopening the widget keeps it.
const noiseHistory = { pts:[], step:NOISE_SAMPLE_MS };
function noiseZone(db){
  if(db < 50) return { key:'noise_quiet', cls:'quiet' };
  if(db < 70) return { key:'noise_ok',    cls:'ok' };
  return { key:'noise_loud', cls:'loud' };
}
function noiseFmtTime(ms){
  const s = Math.round(ms/1000);
  return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}

function renderNoise(body, ctx){
  let audioCtx = null, analyser = null, source = null, stream = null, rafId = null, running = false;
  let held = 0, holdUntil = 0, lastFrame = 0, lastSample = 0, bucketMax = 0;
  let ro = null;
  const hist = noiseHistory;
  if(ctx && ctx.preset && ctx.preset.go) setTimeout(()=>{ const b = body.querySelector('#noise-toggle'); if(b && !running) b.click(); }, 300);   // platform (ClassIn): ?go=1

  function styleKey(){
    const s = state.noiseMeter && state.noiseMeter.style;
    return NOISE_STYLES.includes(s) ? s : 'circle';
  }

  function stageMarkup(style){
    if(style === 'vbar'){
      return `<div class="noise-stage vbar">
        <div class="noise-vtrack"><div class="noise-mask"></div></div>
        <div class="noise-readout"><div class="noise-db">--</div><div class="noise-unit">dB</div></div>
      </div>`;
    }
    if(style === 'hbar'){
      return `<div class="noise-stage hbar">
        <div class="noise-readout"><span class="noise-db">--</span><span class="noise-unit">dB</span></div>
        <div class="noise-htrack"><div class="noise-mask"></div></div>
      </div>`;
    }
    return `<div class="noise-stage circle">
      <div class="noise-gauge"><div class="noise-db">--</div><div class="noise-unit">dB</div></div>
    </div>`;
  }

  function idleMarkup(){
    if(!window.isSecureContext){
      return `<p class="noise-msg" data-i18n="noise_insecure">${t('noise_insecure')}</p>`;
    }
    const cur = styleKey();
    const pickers = NOISE_STYLES.map(k=>
      `<button type="button" class="noise-style-btn${k===cur?' active':''}" data-style="${k}" aria-pressed="${k===cur}" title="${t('noise_style_'+k)}" aria-label="${t('noise_style_'+k)}" data-i18n-title="noise_style_${k}" data-i18n-aria="noise_style_${k}">${NOISE_ICONS[k]}</button>`
    ).join('');
    return `
      <div class="noise-wrap">
        <div class="noise-styles" role="group" aria-label="${t('noise_styles_label')}" data-i18n-aria="noise_styles_label">${pickers}</div>
        <div class="noise-stage-slot">${stageMarkup(cur)}</div>
        <div class="noise-status"><span class="noise-level-label">&nbsp;</span><span class="noise-peak-tag" data-i18n="noise_peak_hold">${t('noise_peak_hold')}</span></div>
        <div class="noise-graph">
          <div class="noise-graph-head"><span data-i18n="noise_graph_title">${t('noise_graph_title')}</span><button type="button" class="noise-graph-clear" id="noise-clear" data-i18n="noise_clear_graph">${t('noise_clear_graph')}</button></div>
          <div class="noise-graph-box"><canvas class="noise-canvas"></canvas></div>
        </div>
        <p class="noise-approx-note" data-i18n="noise_approx_note">${t('noise_approx_note')}</p>
        <button class="wbtn primary" id="noise-toggle" data-i18n-dyn data-key="noise_enable">${t('noise_enable')}</button>
        <p class="noise-msg" id="noise-msg"></p>
      </div>`;
  }

  function wire(){
    const btn = body.querySelector('#noise-toggle');
    if(!btn) return;
    btn.addEventListener('click', ()=>{ running ? stop() : start(); });
    body.querySelectorAll('.noise-style-btn').forEach(b=>{
      b.addEventListener('click', ()=> setStyle(b.dataset.style));
    });
    body.querySelector('#noise-clear').addEventListener('click', ()=>{
      hist.pts.length = 0; hist.step = NOISE_SAMPLE_MS;
      bucketMax = 0; lastSample = performance.now();
      drawGraph();
    });
    const box = body.querySelector('.noise-graph-box');
    if('ResizeObserver' in window && box){ ro = new ResizeObserver(()=> drawGraph()); ro.observe(box); }
    drawGraph();
  }

  function setStyle(style){
    if(!NOISE_STYLES.includes(style)) return;
    state.noiseMeter.style = style;
    saveState();
    body.querySelectorAll('.noise-style-btn').forEach(b=>{
      const on = b.dataset.style === style;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', on);
    });
    body.querySelector('.noise-stage-slot').innerHTML = stageMarkup(style);
    if(running) showLevel(held, holdActive(performance.now()));
    else showLevel(null, false);
  }

  // The meter is "pegged" only while it is held above the live level.
  function holdActive(now){ return now < holdUntil && held > liveNow + 0.5; }
  let liveNow = 0;

  // Paints the current meter style. v === null means idle (mic off).
  function showLevel(v, holding){
    const wrap  = body.querySelector('.noise-wrap');
    const stage = body.querySelector('.noise-stage');
    if(!wrap || !stage) return;
    const style = styleKey();
    const dbEl = stage.querySelector('.noise-db');
    const labelEl = body.querySelector('.noise-level-label');
    const mask = stage.querySelector('.noise-mask');
    wrap.classList.toggle('holding', !!holding);
    let pct = 0, zoneCls = '';
    if(v === null){
      if(dbEl) dbEl.textContent = '--';
      if(labelEl) labelEl.innerHTML = '&nbsp;';
    } else {
      const db = Math.round(v);
      const z = noiseZone(db);
      zoneCls = z.cls;
      pct = Math.max(0, Math.min(100, v / NOISE_MAX * 100));
      if(dbEl) dbEl.textContent = db;
      if(labelEl) labelEl.textContent = t(z.key);
    }
    const wanted = 'noise-stage ' + style + (zoneCls ? ' ' + zoneCls : '');
    if(stage.className !== wanted) stage.className = wanted;
    if(mask){
      if(style === 'vbar') mask.style.height = (100 - pct) + '%';
      else if(style === 'hbar') mask.style.width = (100 - pct) + '%';
    }
  }

  function showGrantHelp(msgEl){
    // On the extension's New Tab page Chrome usually dismisses the microphone
    // prompt, so send the teacher to a normal tab (mic.html) that can show it.
    msgEl.innerHTML = '';
    const p = document.createElement('div');
    p.textContent = t('noise_grant_needed');
    const b = document.createElement('button');
    b.className = 'wbtn'; b.style.marginTop = '8px';
    b.textContent = t('noise_grant_btn');
    b.addEventListener('click', ()=>{ window.open('mic.html', '_blank'); });
    msgEl.appendChild(p); msgEl.appendChild(b);
  }

  async function start(){
    const msgEl = body.querySelector('#noise-msg');
    if(msgEl) msgEl.textContent = '';
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      if(msgEl) msgEl.textContent = t('noise_insecure');
      return;
    }
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      track('noise');
    }catch(err){
      if(!msgEl) return;
      if(err && err.name === 'NotFoundError'){ msgEl.textContent = t('noise_no_mic'); return; }
      const inExtension = location.protocol === 'chrome-extension:';
      let blocked = false;
      try{
        const st = await navigator.permissions.query({ name:'microphone' });
        blocked = (st.state === 'denied');
      }catch(e){}
      // Extension page + not explicitly blocked in Chrome settings = the prompt
      // was dismissed/suppressed, not refused: offer the setup page.
      if(inExtension && !blocked) showGrantHelp(msgEl);
      else if(window.TD_BOARD && TD_BOARD.micHelp(msgEl, start)) { /* platform (ClassIn): ClassIn may be using the mic */ }
      else msgEl.textContent = t('noise_denied');
      return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended'){ try{ await audioCtx.resume(); }catch(e){} }
    source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    running = true;
    const btn = body.querySelector('#noise-toggle');
    if(btn){ btn.dataset.key = 'noise_stop'; btn.textContent = t('noise_stop'); }
    held = 0; holdUntil = 0; liveNow = 0; bucketMax = 0;
    lastFrame = lastSample = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now){
    if(!running || !analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for(let i=0;i<data.length;i++){
      const v = (data[i]-128)/128;
      sum += v*v;
    }
    const rms = Math.sqrt(sum/data.length);
    const dbfs = rms > 0 ? 20*Math.log10(rms) : -100;
    const live = Math.max(0, Math.min(NOISE_MAX, dbfs + 100));
    liveNow = live;
    if(live > bucketMax) bucketMax = live;

    // Peg: jump up to any new highest level and hold it; after the hold, fall back.
    if(live >= held){
      held = live; holdUntil = now + NOISE_HOLD_MS;
    } else if(now >= holdUntil){
      held = Math.max(live, held - NOISE_FALL_PER_SEC * (now - lastFrame) / 1000);
    }
    lastFrame = now;
    showLevel(held, holdActive(now));

    if(now - lastSample >= hist.step){
      pushSample(bucketMax);
      bucketMax = 0; lastSample = now;
      drawGraph();
    }
    rafId = requestAnimationFrame(loop);
  }

  function pushSample(v){
    hist.pts.push(Math.round(v*10)/10);
    if(hist.pts.length > NOISE_MAX_POINTS){
      const merged = [];
      for(let i=0;i<hist.pts.length;i+=2){
        merged.push(Math.max(hist.pts[i], i+1 < hist.pts.length ? hist.pts[i+1] : 0));
      }
      hist.pts = merged; hist.step *= 2;
    }
  }

  function drawGraph(){
    const cv = body.querySelector('.noise-canvas');
    if(!cv) return;
    const box = cv.parentElement;
    const w = box.clientWidth, h = box.clientHeight;
    if(!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if(cv.width !== Math.round(w*dpr) || cv.height !== Math.round(h*dpr)){
      cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const cs = getComputedStyle(body);
    const lo = cs.getPropertyValue('--text-lo').trim() || '#8A93A6';
    const lineCol = cs.getPropertyValue('--amber-hi').trim() || '#F5B85C';
    const padL = 24, padR = 8, padT = 8, padB = 18;
    const pw = w - padL - padR, ph = h - padT - padB;
    if(pw < 10 || ph < 10) return;
    const yOf = v => padT + ph * (1 - Math.max(0, Math.min(NOISE_MAX, v)) / NOISE_MAX);

    // zone bands, same colours and limits as the meter
    [[0,50,'79,209,138',.08],[50,70,'232,201,61',.09],[70,NOISE_MAX,'224,85,90',.10]].forEach(([a,b,rgb,al])=>{
      ctx.fillStyle = `rgba(${rgb},${al})`;
      ctx.fillRect(padL, yOf(b), pw, yOf(a) - yOf(b));
    });
    ctx.font = '9.5px Inter, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.strokeStyle = 'rgba(237,239,243,0.12)'; ctx.lineWidth = 1;
    ctx.fillStyle = lo;
    [0,50,70,NOISE_MAX].forEach(v=>{
      const y = Math.round(yOf(v)) + .5;
      ctx.setLineDash(v === 50 || v === 70 ? [3,3] : []);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL+pw, y); ctx.stroke();
      ctx.fillText(String(v), padL - 4, Math.min(h - padB, Math.max(padT + 3, yOf(v))));
    });
    ctx.setLineDash([]);

    const pts = hist.pts;
    const spanMs = Math.max(NOISE_MIN_SPAN_MS, pts.length * hist.step);
    ctx.textBaseline = 'top';
    ctx.fillStyle = lo;
    ctx.textAlign = 'left';   ctx.fillText('0:00', padL, h - padB + 4);
    ctx.textAlign = 'center'; ctx.fillText(noiseFmtTime(spanMs/2), padL + pw/2, h - padB + 4);
    ctx.textAlign = 'right';  ctx.fillText(noiseFmtTime(spanMs), padL + pw, h - padB + 4);

    if(pts.length < 2){
      ctx.fillStyle = lo; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('noise_graph_empty'), padL + pw/2, padT + ph/2);
      return;
    }
    const xOf = i => padL + ((i+1) * hist.step / spanMs) * pw;
    ctx.beginPath();
    pts.forEach((v,i)=>{ i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v)); });
    const lastX = xOf(pts.length-1), lastY = yOf(pts[pts.length-1]);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = lineCol;
    ctx.stroke();
    ctx.lineTo(lastX, yOf(0)); ctx.lineTo(xOf(0), yOf(0)); ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, padT+ph);
    g.addColorStop(0, 'rgba(245,184,92,0.28)'); g.addColorStop(1, 'rgba(245,184,92,0)');
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI*2); ctx.fillStyle = lineCol; ctx.fill();
  }

  function stop(){
    running = false;
    if(rafId) cancelAnimationFrame(rafId);
    if(source) try{ source.disconnect(); }catch(e){}
    if(audioCtx) try{ audioCtx.close(); }catch(e){}
    if(stream) stream.getTracks().forEach(tr=>tr.stop());
    audioCtx = null; analyser = null; source = null; stream = null; rafId = null;
    held = 0; holdUntil = 0; liveNow = 0;
    const btn = body.querySelector('#noise-toggle');
    if(btn){ btn.dataset.key = 'noise_enable'; btn.textContent = t('noise_enable'); }
    showLevel(null, false);      // the graph is kept so the lesson can be reviewed
  }

  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.innerHTML = idleMarkup();
  wire();

  return ()=>{ stop(); if(ro) ro.disconnect(); body.style.display = ''; body.style.flexDirection = ''; };
}

/* ---------------- Streaming URL helpers (no API key needed) ---------------- */
function parseYouTube(url){
  try{
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./,'');
    if(host === 'youtu.be'){
      return { type:'video', id: u.pathname.slice(1) };
    }
    if(host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com'){
      if(u.pathname.startsWith('/playlist')){
        const list = u.searchParams.get('list');
        return list ? { type:'playlist', id:list } : null;
      }
      const v = u.searchParams.get('v');
      const list = u.searchParams.get('list');
      if(v) return { type:'video', id:v, list };
      if(list) return { type:'playlist', id:list };
      if(u.pathname.startsWith('/embed/')){
        return { type:'video', id: u.pathname.split('/')[2] };
      }
    }
  }catch(e){}
  return null;
}
function youtubeWatchUrl(parsed){
  // YouTube links are opened in a real browser tab rather than embedded in an
  // iframe — YouTube's own embed rules (a real HTTP referer, no ad-blockers
  // stripping it, no plain-file:// origin) make in-widget embedding fragile
  // (see "Error 153" in past versions), and a full new tab always just works.
  if(!parsed) return '';
  if(parsed.type === 'playlist') return `https://www.youtube.com/playlist?list=${parsed.id}`;
  let src = `https://www.youtube.com/watch?v=${parsed.id}`;
  if(parsed.list) src += `&list=${parsed.list}`;
  return src;
}
function isSoundCloudUrl(url){
  try{ return new URL(url).hostname.replace(/^www\./,'') === 'soundcloud.com'; }
  catch(e){ return false; }
}
function soundcloudEmbedUrl(url){
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23e8a33d&auto_play=false&show_comments=false&visual=false`;
}

/* ---------------- Music Player widget ---------------- */
function renderMusic(body){
  body.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="files" data-i18n="tab_my_files">${t('tab_my_files')}</button>
      <button class="tab-btn" data-tab="stream" data-i18n="tab_stream">${t('tab_stream')}</button>
      <button class="tab-btn" data-tab="spotify" data-i18n="tab_spotify">${t('tab_spotify')}</button>
    </div>

    <div class="tab-panel" data-panel="files">
      <audio id="mp-audio" controls style="width:100%; margin-bottom:8px;"></audio>
      <p class="mp-now" id="mp-now">&nbsp;</p>
      <div class="file-drop"><button type="button" class="file-drop-browse" id="mp-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
      <input type="file" id="mp-input" hidden multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac">
      <ul class="file-list" id="mp-list"></ul>
    </div>

    <div class="tab-panel" data-panel="stream" hidden>
      <div class="stream-row">
        <input type="text" id="mp-stream-input" placeholder="${t('stream_placeholder')}" data-i18n-placeholder="stream_placeholder">
        <button class="wbtn primary" id="mp-stream-go">${t('play')}</button>
      </div>
      <p class="stream-msg" id="mp-stream-msg"></p>
      <div class="stream-embed" id="mp-stream-embed"></div>
    </div>

    <div class="tab-panel" data-panel="spotify" hidden>
      <div class="stream-row">
        <input type="text" id="mp-spotify-input" placeholder="${t('spotify_placeholder')}" data-i18n-placeholder="spotify_placeholder" value="${(state.spotifyUrl||'').replace(/"/g,'&quot;')}">
      </div>
      <button class="wbtn primary" id="mp-spotify-open" style="width:100%; margin-bottom:10px" data-i18n="spotify_open">${t('spotify_open')}</button>
      <p class="dock-vis-hint" data-i18n="spotify_note">${t('spotify_note')}</p>
    </div>
  `;

  wireTabs(body);

  const audio = body.querySelector('#mp-audio');
  const nowEl = body.querySelector('#mp-now');
  const list = body.querySelector('#mp-list');
  const input = body.querySelector('#mp-input');
  body.querySelector('#mp-browse').addEventListener('click', ()=> input.click());
  let tracks = [];
  let currentIdx = -1;

  async function draw(){
    tracks = (await idb.getAll('music')).sort((a,b)=>a.added-b.added);
    list.innerHTML = '';
    if(!tracks.length){
      list.innerHTML = `<li class="file-empty" data-i18n="mp_empty">${t('mp_empty')}</li>`;
      return;
    }
    tracks.forEach((tr,i)=>{
      const li = document.createElement('li');
      li.className = i===currentIdx ? 'playing' : '';
      li.innerHTML = `<span class="ftype">${i+1}</span><span class="fname"></span><button aria-label="${t('play')}">▶</button><button class="wminus" aria-label="${t('remove')}">−</button>`;
      li.querySelector('.fname').textContent = tr.name;
      const [playBtn, delBtn] = li.querySelectorAll('button');
      playBtn.addEventListener('click', ()=> playTrack(i));
      delBtn.addEventListener('click', async ()=>{
        await idb.delete('music', tr.id);
        if(i===currentIdx){ audio.pause(); audio.removeAttribute('src'); currentIdx=-1; nowEl.textContent='\u00A0'; }
        draw();
      });
      list.appendChild(li);
    });
  }

  function playTrack(i){
    if(i<0 || i>=tracks.length) return;
    currentIdx = i;
    track('music', tracks[i].name);
    audio.src = URL.createObjectURL(tracks[i].blob);
    audio.play();
    nowEl.textContent = tracks[i].name;
    draw();
  }

  audio.addEventListener('ended', ()=>{
    if(currentIdx+1 < tracks.length) playTrack(currentIdx+1);
  });

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('music', { id:cid(), name:file.name, blob:file, added:Date.now() });
    }
    input.value = '';
    draw();
  });

  // Stream tab (YouTube / SoundCloud)
  const streamInput = body.querySelector('#mp-stream-input');
  const streamEmbed = body.querySelector('#mp-stream-embed');
  const streamMsg = body.querySelector('#mp-stream-msg');
  function loadStream(url, userInitiated){
    const yt = parseYouTube(url);
    if(yt){
      state.musicStream = { type:'youtube', url };
      saveState();
      streamMsg.textContent = '';
      const watchUrl = youtubeWatchUrl(yt);
      if(userInitiated) window.open(watchUrl, '_blank', 'noopener');
      streamEmbed.innerHTML = `<div class="yt-external"><p>${t('youtube_external_msg')}</p><a class="wbtn primary" href="${watchUrl}" target="_blank" rel="noopener">${t('open_in_youtube')}</a></div>`;
      return;
    }
    if(isSoundCloudUrl(url)){
      state.musicStream = { type:'soundcloud', url };
      saveState();
      streamMsg.textContent = '';
      streamEmbed.innerHTML = `<iframe src="${soundcloudEmbedUrl(url)}" allow="autoplay"></iframe>`;
      return;
    }
    streamMsg.textContent = t('stream_invalid');
  }
  body.querySelector('#mp-stream-go').addEventListener('click', ()=>{
    const url = streamInput.value.trim();
    if(url) loadStream(url, true);
  });
  if(state.musicStream.url){
    streamInput.value = state.musicStream.url;
    loadStream(state.musicStream.url, false); // restoring saved state — show the card, don't pop a tab
  }

  // Spotify tab
  const spotifyInput = body.querySelector('#mp-spotify-input');
  body.querySelector('#mp-spotify-open').addEventListener('click', ()=>{
    const url = spotifyInput.value.trim();
    if(!url) return;
    state.spotifyUrl = url;
    saveState();
    window.open(url, '_blank');
  });

  draw();
  return null;
}

function wireTabs(body){
  const tabs = body.querySelectorAll('.tab-btn');
  tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabs.forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');
      body.querySelectorAll('.tab-panel').forEach(p=>{
        p.hidden = p.dataset.panel !== btn.dataset.tab;
      });
    });
  });
}

/* ---------------- Video Player widget ---------------- */
function renderVideoPlayer(body){
  body.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="files" data-i18n="tab_my_files">${t('tab_my_files')}</button>
      <button class="tab-btn" data-tab="youtube" data-i18n="tab_youtube">${t('tab_youtube')}</button>
    </div>

    <div class="tab-panel" data-panel="files">
      <video id="vp-video" controls style="width:100%; border-radius:8px; background:#000; margin-bottom:8px;"></video>
      <p class="mp-now" id="vp-now">&nbsp;</p>
      <div class="file-drop"><button type="button" class="file-drop-browse" id="vp-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
      <input type="file" id="vp-input" hidden multiple accept="video/*,.mp4,.webm,.mov,.mkv">
      <ul class="file-list" id="vp-list"></ul>
    </div>

    <div class="tab-panel" data-panel="youtube" hidden>
      <div class="stream-row">
        <input type="text" id="vp-yt-input" placeholder="${t('youtube_placeholder')}" data-i18n-placeholder="youtube_placeholder">
        <button class="wbtn primary" id="vp-yt-go">${t('play')}</button>
      </div>
      <p class="stream-msg" id="vp-yt-msg"></p>
      <div class="stream-embed video-embed" id="vp-yt-embed"></div>
    </div>
  `;

  wireTabs(body);

  const video = body.querySelector('#vp-video');
  const nowEl = body.querySelector('#vp-now');
  const list = body.querySelector('#vp-list');
  const input = body.querySelector('#vp-input');
  body.querySelector('#vp-browse').addEventListener('click', ()=> input.click());
  let clips = [];
  let currentIdx = -1;

  async function draw(){
    clips = (await idb.getAll('videos')).sort((a,b)=>a.added-b.added);
    list.innerHTML = '';
    if(!clips.length){
      list.innerHTML = `<li class="file-empty" data-i18n="vp_empty">${t('vp_empty')}</li>`;
      return;
    }
    clips.forEach((c,i)=>{
      const li = document.createElement('li');
      li.className = i===currentIdx ? 'playing' : '';
      li.innerHTML = `<span class="ftype">${i+1}</span><span class="fname"></span><button aria-label="${t('play')}">▶</button><button class="wminus" aria-label="${t('remove')}">−</button>`;
      li.querySelector('.fname').textContent = c.name;
      const [playBtn, delBtn] = li.querySelectorAll('button');
      playBtn.addEventListener('click', ()=> playClip(i));
      delBtn.addEventListener('click', async ()=>{
        await idb.delete('videos', c.id);
        if(i===currentIdx){ video.pause(); video.removeAttribute('src'); currentIdx=-1; nowEl.textContent='\u00A0'; }
        draw();
      });
      list.appendChild(li);
    });
  }

  function playClip(i){
    if(i<0 || i>=clips.length) return;
    currentIdx = i;
    track('video', clips[i].name);
    video.src = URL.createObjectURL(clips[i].blob);
    video.play();
    nowEl.textContent = clips[i].name;
    draw();
  }

  video.addEventListener('ended', ()=>{
    if(currentIdx+1 < clips.length) playClip(currentIdx+1);
  });

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('videos', { id:cid(), name:file.name, blob:file, added:Date.now() });
    }
    input.value = '';
    draw();
  });

  const ytInput = body.querySelector('#vp-yt-input');
  const ytEmbed = body.querySelector('#vp-yt-embed');
  const ytMsg = body.querySelector('#vp-yt-msg');
  function loadYoutube(url, userInitiated){
    const yt = parseYouTube(url);
    if(!yt){ ytMsg.textContent = t('stream_invalid'); return; }
    state.videoStream = { type:'youtube', url };
    saveState();
    ytMsg.textContent = '';
    const watchUrl = youtubeWatchUrl(yt);
    if(userInitiated) window.open(watchUrl, '_blank', 'noopener');
    ytEmbed.innerHTML = `<div class="yt-external"><p>${t('youtube_external_msg')}</p><a class="wbtn primary" href="${watchUrl}" target="_blank" rel="noopener">${t('open_in_youtube')}</a></div>`;
  }
  body.querySelector('#vp-yt-go').addEventListener('click', ()=>{
    const url = ytInput.value.trim();
    if(url) loadYoutube(url, true);
  });
  if(state.videoStream.url){
    ytInput.value = state.videoStream.url;
    loadYoutube(state.videoStream.url, false); // restoring saved state — show the card, don't pop a tab
  }

  draw();
  return null;
}

/* ---------------- Soundboard widget (attention-getter sound effects) ---------------- */
function renderSoundboard(body){
  body.innerHTML = `
    <div class="sfx-controls">
      <button class="wbtn" id="sfx-stop" data-i18n="sfx_stop">${t('sfx_stop')}</button>
      <label class="sfx-volume-row">
        <span data-i18n="sfx_volume">${t('sfx_volume')}</span>
        <input type="range" id="sfx-volume" min="0" max="1" step="0.05" value="${state.sfxVolume}">
      </label>
    </div>
    <div class="file-drop"><button type="button" class="file-drop-browse" id="sfx-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
    <input type="file" id="sfx-input" hidden multiple accept="audio/*,.mp3,.wav,.m4a,.ogg">
    <div class="game-grid sfx-grid"></div>
    <audio id="sfx-audio"></audio>
  `;

  const grid = body.querySelector('.sfx-grid');
  const input = body.querySelector('#sfx-input');
  body.querySelector('#sfx-browse').addEventListener('click', ()=> input.click());
  const audio = body.querySelector('#sfx-audio');
  const volumeSlider = body.querySelector('#sfx-volume');
  let sounds = [];
  let playingId = null;

  audio.volume = state.sfxVolume;
  volumeSlider.addEventListener('input', ()=>{
    state.sfxVolume = parseFloat(volumeSlider.value);
    audio.volume = state.sfxVolume;
    saveState();
  });

  function play(snd){
    track('sfx', snd.name);
    audio.pause();
    audio.src = URL.createObjectURL(snd.blob);
    audio.currentTime = 0;
    audio.play();
    playingId = snd.id;
    highlight();
  }
  audio.addEventListener('ended', ()=>{ playingId = null; highlight(); });
  body.querySelector('#sfx-stop').addEventListener('click', ()=>{
    audio.pause(); audio.currentTime = 0; playingId = null; highlight();
  });

  function highlight(){
    grid.querySelectorAll('.game-tile').forEach(tile=>{
      tile.classList.toggle('playing-sfx', tile.dataset.id === playingId);
    });
  }

  async function draw(){
    sounds = (await idb.getAll('sounds')).sort((a,b)=>a.added-b.added);
    grid.innerHTML = '';
    if(!sounds.length){
      grid.innerHTML = `<p class="file-empty" data-i18n="sfx_empty">${t('sfx_empty')}</p>`;
      return;
    }
    sounds.forEach(snd=>{
      const tile = document.createElement('button');
      tile.className = 'game-tile';
      tile.dataset.id = snd.id;
      tile.title = snd.name;
      tile.innerHTML = `
        <span class="game-tile-remove" aria-label="${t('remove')} ${snd.name}">${iconSvg('close','wsvg')}</span>
        <span class="game-tile-play">${iconSvg('speaker','wsvg')}</span>
        <span class="game-tile-name"></span>
      `;
      tile.querySelector('.game-tile-name').textContent = snd.name.replace(/\.[^.]+$/,'');
      tile.addEventListener('click', ()=> play(snd));
      tile.querySelector('.game-tile-remove').addEventListener('click', async e=>{
        e.stopPropagation();
        await idb.delete('sounds', snd.id);
        if(playingId === snd.id){ audio.pause(); playingId = null; }
        draw();
      });
      grid.appendChild(tile);
    });
    highlight();
  }

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('sounds', { id:cid(), name:file.name, blob:file, added:Date.now() });
    }
    input.value = '';
    draw();
  });

  draw();
  return ()=>{ audio.pause(); };
}

/* ---------------- Wave 1 widgets ---------------- */

function renderAttendance(body){
  function todayKey(d){ d = d||new Date(); return d.toISOString().slice(0,10); }
  let curDate = todayKey();
  /* v0.21.2: "Share with families" — when this class is linked to a cloud class and the teacher turns it on, each day's
     present / late / absent is copied to students/{id}/attendance/{date} for ParentDeck's Attendance widget (status only,
     never notes). Off by default: sharing attendance is the teacher's decision. Local names are matched to the cloud
     roster the same way Class Builder does (cbMatch); a name with no cloud student is simply not shared. */
  let cloudRoster = [], unsubRoster = null;
  const cloudOn = () => !!(state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession());
  if(cloudOn()) unsubRoster = TDCloud.subscribeRoster(state.cloudClassId, list=>{ cloudRoster = list || []; drawShare(); });
  function cloudIdsByName(){
    const { map } = cbMatch(state.students || [], cloudRoster), out = {};
    (state.students || []).forEach(s=>{ const hit = map.get(s.id); if(hit) out[studentDisplay(s)] = hit.id; });
    return out;
  }
  async function share(entries){
    if(!entries.length) return;
    try{ await TDCloud.syncAttendance(state.cloudClassId, entries); }
    catch(e){ toast(t('att_share_failed')); }
  }
  function shareDay(day, names){
    if(!state.attendanceShared || !cloudOn()) return;
    const ids = cloudIdsByName(), rec = state.attendance[day] || {};
    share(names.filter(n=> ids[n]).map(n=> ({ studentId: ids[n], day, status: rec[n] || null })));
  }
  function allEntries(clear){
    const ids = cloudIdsByName(), out = [], from = todayKey(new Date(Date.now() - 365 * 86400000));
    Object.keys(state.attendance || {}).filter(d=> d >= from).forEach(day=>{
      Object.entries(state.attendance[day] || {}).forEach(([n, s])=>{ if(ids[n]) out.push({ studentId: ids[n], day, status: clear ? null : s }); });
    });
    return out;
  }
  function drawShare(){
    const el = body.querySelector('#att-share');
    if(!el) return;
    if(!cloudOn()){ el.hidden = true; return; }
    el.hidden = false;
    const ids = cloudIdsByName(), matched = state.roster.filter(n=> ids[n]).length;
    el.innerHTML = `<label class="switch-row"><span>${t('att_share_label')}</span><input type="checkbox" id="att-share-on" ${state.attendanceShared ? 'checked' : ''}></label>
      <p class="small-hint">${state.attendanceShared ? t('att_share_on', { n: matched, total: state.roster.length }) : t('att_share_off')}</p>`;
    el.querySelector('#att-share-on').addEventListener('change', e=>{
      if(e.target.checked){
        if(!confirm(t('att_share_confirm'))){ e.target.checked = false; return; }
        state.attendanceShared = true; saveState(); share(allEntries(false));
      } else {
        const clear = confirm(t('att_unshare_confirm'));
        state.attendanceShared = false; saveState(); if(clear) share(allEntries(true));
      }
      drawShare();
    });
  }
  function dayRecord(){
    if(!state.attendance[curDate]) state.attendance[curDate] = {};
    return state.attendance[curDate];
  }
  function draw(){
    if(!state.roster.length){
      body.innerHTML = `<p class="small-hint" data-i18n="att_no_roster">${t('att_no_roster')}</p>`;
      return;
    }
    const rec = dayRecord();
    body.innerHTML = `
      <div class="att-date-row">
        <span class="field-label" data-i18n="att_date_label" style="margin:0">${t('att_date_label')}</span>
        <input type="date" id="att-date" value="${curDate}">
      </div>
      <div class="scroll-list" id="att-list"></div>
      <p class="att-summary" id="att-summary"></p>
      <div class="att-share" id="att-share" hidden></div>
      <div class="btn-row"><button class="wbtn" id="att-export" data-i18n="att_export">${t('att_export')}</button></div>
    `;
    drawShare();
    const list = body.querySelector('#att-list');
    state.roster.forEach(name=>{
      const status = rec[name] || '';
      const row = document.createElement('div');
      row.className = 'att-row';
      row.innerHTML = `
        <span class="att-name"></span>
        <div class="att-toggle">
          <button class="att-btn present ${status==='present'?'on':''}" data-status="present">P</button>
          <button class="att-btn late ${status==='late'?'on':''}" data-status="late">L</button>
          <button class="att-btn absent ${status==='absent'?'on':''}" data-status="absent">A</button>
        </div>
      `;
      row.querySelector('.att-name').textContent = name;
      row.querySelectorAll('[data-status]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const s = btn.dataset.status;
          rec[name] = rec[name] === s ? undefined : s;
          if(rec[name] === undefined) delete rec[name];
          else if(curDate === todayKey()){ const dr = dayRec(); if(!dr.attDone){ dr.attDone = true; stat('attendance'); logAct('attendance', '', 1, awardXP('attendance', 5)); } }
          shareDay(curDate, [name]);
          saveState();
          draw();
        });
      });
      list.appendChild(row);
    });
    const counts = { present:0, absent:0, late:0 };
    Object.values(rec).forEach(s=>{ if(counts[s]!==undefined) counts[s]++; });
    body.querySelector('#att-summary').textContent = t('att_summary', counts);
    body.querySelector('#att-date').addEventListener('change', e=>{
      curDate = e.target.value || todayKey();
      draw();
    });
    body.querySelector('#att-export').addEventListener('click', ()=>{
      const rows = [['Student','Status'], ...state.roster.map(n=>[n, rec[n]||''])];
      const csv = rows.map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([(window.Watermark ? Watermark.stamp(csv) : csv)], { type:'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `attendance-${curDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  draw();
  return ()=>{ if(unsubRoster) unsubRoster(); };
}

/* v0.27.0 (backend v2.8.0): Scrapbook Review — approve or hide pages students shared from StudentDeck's
   Scrapdeck ("Scrapdeck sharing", M3). Free widget (never gate the loop): listScrapPages/reviewScrapPage
   are Cloud Functions, not a live subscription, so this refetches after the teacher's own actions rather
   than updating in real time — acceptable for a one-teacher review queue. */
function renderScrapReview(body){
  const cloudOn = () => !!(state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession());
  let rows = [], filter = 'pending', loading = false, galleryOn = false, galleryBusy = false, galleryKnown = false;
  async function load(){
    if(!cloudOn()){ draw(); return; }
    loading = true; draw();
    try{ rows = await TDCloud.listScrapPages(state.cloudClassId); }
    catch(e){ toast(t('srv_load_fail')); rows = []; }
    loading = false; draw();
  }
  async function act(studentId, pageId, action){
    try{ await TDCloud.reviewScrapPage(studentId, pageId, action); toast(t(action === 'approve' ? 'srv_toast_approved' : 'srv_toast_hidden')); await load(); }
    catch(e){ toast(t('srv_action_fail')); }
  }
  function rowHtml(r){
    const aud = (r.audiences || []).map(a => a === 'family' ? t('srv_aud_family') : t('srv_aud_class')).join(' + ');
    return `<div class="srv-row">
      <img class="srv-thumb" src="${xEsc(r.thumbDataUrl || '')}" alt="">
      <div class="srv-meta">
        <b>${xEsc(r.title || '')}</b>
        <span class="small-hint">${xEsc(r.studentName || '')} · ${xEsc(aud)} · ${t('srv_status_' + r.status)}</span>
        ${r.caption ? `<p class="small-hint">${xEsc(r.caption)}</p>` : ''}
      </div>
      <div class="srv-actions">
        ${r.status !== 'approved' ? `<button class="wbtn" data-approve="${xEsc(r.pageId)}" data-student="${xEsc(r.studentId)}">${t('srv_approve')}</button>` : ''}
        ${r.status !== 'hidden' ? `<button class="wbtn" data-hide="${xEsc(r.pageId)}" data-student="${xEsc(r.studentId)}">${t('srv_hide')}</button>` : ''}
      </div>
    </div>`;
  }
  function draw(){
    if(!cloudOn()){ body.innerHTML = `<p class="small-hint">${t('srv_need_class')}</p>`; return; }
    const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter);
    const counts = { pending:0, approved:0, hidden:0 }; rows.forEach(r => { if(counts[r.status] != null) counts[r.status]++; });
    body.innerHTML = `
      <label class="switch-row"><span>${t('srv_gallery_label')}</span><input type="checkbox" id="srv-gallery" ${galleryOn ? 'checked' : ''} ${galleryBusy || !galleryKnown ? 'disabled' : ''}></label>
      <p class="small-hint">${t('srv_gallery_hint')}</p>
      <div class="btn-row srv-filter">
        <button class="chip ${filter === 'pending' ? 'on' : ''}" data-f="pending">${t('srv_f_pending')} (${counts.pending})</button>
        <button class="chip ${filter === 'approved' ? 'on' : ''}" data-f="approved">${t('srv_f_approved')} (${counts.approved})</button>
        <button class="chip ${filter === 'hidden' ? 'on' : ''}" data-f="hidden">${t('srv_f_hidden')} (${counts.hidden})</button>
        <button class="chip ${filter === 'all' ? 'on' : ''}" data-f="all">${t('srv_f_all')} (${rows.length})</button>
      </div>
      <div class="scroll-list srv-list">${loading ? `<p class="small-hint">${t('srv_loading')}</p>` : (shown.length ? shown.map(rowHtml).join('') : `<p class="small-hint">${t('srv_empty')}</p>`)}</div>
    `;
    const g = body.querySelector('#srv-gallery');
    if(g) g.addEventListener('change', async e => {
      const want = e.target.checked; galleryBusy = true; draw();
      try{ await TDCloud.setScrapGalleryOn(state.cloudClassId, want); galleryOn = want; }
      catch(err){ toast(t('srv_action_fail')); }
      galleryBusy = false; draw();
    });
    body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; draw(); }));
    body.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => act(b.dataset.student, b.dataset.approve, 'approve')));
    body.querySelectorAll('[data-hide]').forEach(b => b.addEventListener('click', () => act(b.dataset.student, b.dataset.hide, 'hide')));
  }
  let unsubClass = null;
  if(cloudOn()){
    unsubClass = TDCloud.subscribeClass(state.cloudClassId, c => { galleryOn = !!(c && c.scrapGalleryOn); galleryKnown = true; draw(); if(unsubClass){ unsubClass(); unsubClass = null; } });
  }
  load();
  return ()=>{ if(unsubClass) unsubClass(); };
}

/* v0.29.0 (backend v2.9.0): Board Assignments — review students' answers to a DrawDeck page assigned
   to the class and award XP (DrawDeck scope step D, "student boards"). New assignments are created from
   DrawDeck's More menu ("Assign this page to students"), not here; this widget is purely review/grading.
   Free widget (never gate the loop): grading what a student already submitted is part of the loop. */
function renderBoardReview(body){
  const cloudOn = () => !!(state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession());
  let assignments = [], unsubA = null, openId = null, rows = [], loadingRows = false;
  function load(){
    if(!cloudOn()){ draw(); return; }
    unsubA = TDCloud.subscribeBoardAssignments(state.cloudClassId, list => { assignments = list; draw(); });
  }
  async function loadRows(id){
    loadingRows = true; draw();
    try{ rows = await TDCloud.listBoardAnswers(state.cloudClassId, id); }
    catch(e){ toast(t('brv_load_fail')); rows = []; }
    loadingRows = false; draw();
  }
  async function toggleOpen(a){
    try{ await TDCloud.closeAssignment(state.cloudClassId, a.id, a.open === false); }
    catch(e){ toast(t('brv_action_fail')); }
  }
  async function award(row, input){
    const amount = Math.max(0, Math.min(10000, Math.round(+input.value || 0)));
    if(!amount){ toast(t('brv_amount_zero')); return; }
    try{ await TDCloud.awardBoardAnswer(state.cloudClassId, row.studentId, row.assignmentId, amount, t('brv_award_reason', { title: assignments.find(a=>a.id===openId)?.title || '' })); toast(t('brv_awarded', { n:amount })); loadRows(openId); }
    catch(e){ toast(t('brv_action_fail')); }
  }
  function rowHtml(r){
    return `<div class="srv-row">
      <img class="srv-thumb" src="${xEsc(r.thumbDataUrl || '')}" alt="">
      <div class="srv-meta">
        <b>${xEsc(r.studentName || '')}</b>
        <span class="small-hint">${r.awarded ? t('brv_graded', { n:r.awardedAmount||0 }) : t('brv_submitted')}</span>
      </div>
      <div class="srv-actions">
        ${r.awarded ? '' : `<input type="number" class="brv-xp" min="0" max="10000" placeholder="${xEsc(t('brv_xp_ph'))}" style="width:70px">
        <button class="wbtn" data-award="${xEsc(r.studentId)}">${t('brv_award')}</button>`}
      </div>
    </div>`;
  }
  function draw(){
    if(!cloudOn()){ body.innerHTML = `<p class="small-hint">${t('brv_need_class')}</p>`; return; }
    if(openId){
      const a = assignments.find(x => x.id === openId);
      body.innerHTML = `
        <button class="wbtn" id="brv-back">${t('brv_back')}</button>
        <h3 style="margin:8px 0 2px">${xEsc(a ? a.title : '')}</h3>
        <div class="scroll-list srv-list">${loadingRows ? `<p class="small-hint">${t('srv_loading')}</p>` : (rows.length ? rows.map(rowHtml).join('') : `<p class="small-hint">${t('brv_empty')}</p>`)}</div>
      `;
      body.querySelector('#brv-back').addEventListener('click', () => { openId = null; draw(); });
      body.querySelectorAll('[data-award]').forEach(b => b.addEventListener('click', () => {
        const row = rows.find(r => r.studentId === b.dataset.award);
        const input = b.parentElement.querySelector('.brv-xp');
        if(row && input) award(row, input);
      }));
      return;
    }
    body.innerHTML = `
      <div class="scroll-list srv-list">${assignments.length ? assignments.map(a => `
        <div class="srv-row">
          <img class="srv-thumb" src="${xEsc(a.thumbDataUrl || '')}" alt="">
          <div class="srv-meta">
            <b>${xEsc(a.title || '')}</b>
            <span class="small-hint">${a.open === false ? t('brv_closed') : t('brv_open')}</span>
          </div>
          <div class="srv-actions">
            <button class="wbtn" data-review="${xEsc(a.id)}">${t('brv_review')}</button>
            <button class="wbtn" data-toggle="${xEsc(a.id)}">${a.open === false ? t('brv_reopen') : t('brv_close')}</button>
          </div>
        </div>
      `).join('') : `<p class="small-hint">${t('brv_none')}</p>`}</div>
    `;
    body.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => { openId = b.dataset.review; rows = []; loadRows(openId); }));
    body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { const a = assignments.find(x=>x.id===b.dataset.toggle); if(a) toggleOpen(a); }));
  }
  load();
  return ()=>{ if(unsubA) unsubA(); };
}

function renderGroupMaker(body){
  function draw(){
    if(!state.roster.length){
      body.innerHTML = `<p class="small-hint" data-i18n="gm_no_roster">${t('gm_no_roster')}</p>`;
      return;
    }
    const gm = state.groupMaker;
    body.innerHTML = `
      <div class="gm-controls">
        <div class="field-block">
          <span class="field-label" data-i18n="gm_mode_groups">${t('gm_mode_groups')}</span>
          <input type="number" id="gm-count" min="2" max="${Math.max(2,state.roster.length)}" value="${gm.count}">
        </div>
        <button class="wbtn primary" id="gm-shuffle" data-i18n="gm_shuffle">${t('gm_shuffle')}</button>
      </div>
      <div class="gm-groups" id="gm-groups"></div>
    `;
    body.querySelector('#gm-count').addEventListener('change', e=>{
      gm.count = Math.max(2, parseInt(e.target.value)||2);
      saveState();
    });
    body.querySelector('#gm-shuffle').addEventListener('click', shuffle);
    renderGroups(gm.lastGroups);
  }
  function shuffle(){
    const gm = state.groupMaker;
    let names = state.roster.slice();
    let key;
    let attempt = 0;
    let groups;
    do{
      names = shuffleArray(state.roster.slice());
      groups = splitIntoGroups(names, gm.count);
      key = groups.map(g=>g.join(',')).join('|');
      attempt++;
    } while(key === gm.lastKey && attempt < 8 && state.roster.length > gm.count);
    gm.lastKey = key;
    gm.lastGroups = groups;
    saveState();
    renderGroups(groups);
    track('groups', groups.length + ' × ' + (state.roster.length ? Math.ceil(state.roster.length / groups.length) : 0));
  }
  function shuffleArray(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }
  function splitIntoGroups(names, count){
    count = Math.min(count, names.length);
    const groups = Array.from({length:count}, ()=>[]);
    names.forEach((n,i)=> groups[i%count].push(n));
    return groups;
  }
  function renderGroups(groups){
    const wrap = body.querySelector('#gm-groups');
    if(!wrap) return;
    wrap.innerHTML = '';
    (groups||[]).forEach((g,i)=>{
      const div = document.createElement('div');
      div.className = 'gm-group';
      div.innerHTML = `<h4></h4><p></p>`;
      div.querySelector('h4').textContent = t('gm_group_label', { n:i+1 });
      div.querySelector('p').textContent = g.join(', ');
      wrap.appendChild(div);
    });
  }
  draw();
  return null;
}

function renderExitTicket(body){
  function draw(){
    const et = state.exitTicket;
    body.innerHTML = `
      <input type="text" class="et-q-input" id="et-q" placeholder="${t('et_question_placeholder')}" data-i18n-placeholder="et_question_placeholder" value="${et.question ? et.question.replace(/"/g,'&quot;') : ''}">
      <div class="et-tally-row">
        <div class="et-tally" data-k="got_it"><span class="et-tally-count">${et.tallies.got_it}</span><span class="et-tally-label" data-i18n="et_got_it">${t('et_got_it')}</span></div>
        <div class="et-tally" data-k="almost"><span class="et-tally-count">${et.tallies.almost}</span><span class="et-tally-label" data-i18n="et_almost">${t('et_almost')}</span></div>
        <div class="et-tally" data-k="need_help"><span class="et-tally-count">${et.tallies.need_help}</span><span class="et-tally-label" data-i18n="et_need_help">${t('et_need_help')}</span></div>
      </div>
      <p class="small-hint" data-i18n="et_hint">${t('et_hint')}</p>
      <div class="btn-row"><button class="wbtn" id="et-reset" data-i18n="et_reset">${t('et_reset')}</button></div>
    `;
    body.querySelector('#et-q').addEventListener('input', e=>{ et.question = e.target.value; saveState(); });
    body.querySelectorAll('.et-tally').forEach(el=>{
      el.addEventListener('click', ()=>{
        et.tallies[el.dataset.k]++;
        track('ticket', ({ got_it:'Got it', almost:'Almost', need_help:'Need help' })[el.dataset.k] || el.dataset.k);
        saveState();
        el.querySelector('.et-tally-count').textContent = et.tallies[el.dataset.k];
      });
    });
    body.querySelector('#et-reset').addEventListener('click', ()=>{
      et.tallies = { got_it:0, almost:0, need_help:0 };
      saveState(); draw();
    });
  }
  draw();
  return null;
}

function renderAgenda(body, ctx){
  if(ctx && ctx.preset){ Object.assign(state.agenda, ctx.preset); saveState(); }   // platform (ClassIn): ?schedule=&objective=&donow=
  function draw(){
    const ag = state.agenda;
    body.innerHTML = `
      <div class="agenda-board">
        <div class="field-block">
          <span class="field-label" data-i18n="agenda_schedule_label">${t('agenda_schedule_label')}</span>
          <textarea id="ag-schedule" placeholder="${t('agenda_schedule_placeholder')}" data-i18n-placeholder="agenda_schedule_placeholder">${ag.schedule}</textarea>
        </div>
        <div class="field-block">
          <span class="field-label" data-i18n="agenda_objective_label">${t('agenda_objective_label')}</span>
          <textarea id="ag-objective" placeholder="${t('agenda_objective_placeholder')}" data-i18n-placeholder="agenda_objective_placeholder">${ag.objective}</textarea>
        </div>
        <div class="field-block">
          <span class="field-label" data-i18n="agenda_donow_label">${t('agenda_donow_label')}</span>
          <textarea id="ag-donow" placeholder="${t('agenda_donow_placeholder')}" data-i18n-placeholder="agenda_donow_placeholder">${ag.doNow}</textarea>
        </div>
      </div>
    `;
    ['schedule','objective','doNow'].forEach((key,i)=>{
      const idMap = ['ag-schedule','ag-objective','ag-donow'];
      body.querySelector('#'+idMap[i]).addEventListener('input', e=>{
        ag[key] = e.target.value; saveState();
      });
    });
  }
  draw();
  return null;
}

/* =========================================================
   Google Meet — Phase 1 of the video-conferencing scope: just a launcher,
   no API/OAuth/backend. Two things worth knowing:
   1) Meet calls can't run inside an iframe — Google blocks that (unlike
      Drive/Docs, which are built to be embedded) — so this always opens
      meet.google.com in a new tab, full stop, by design, not as a
      shortcut we plan to remove later.
   2) meet.google.com/new mints a brand-new random meeting on every visit
      and there's no API call here to read the resulting code back (it's
      a full page navigation, not a fetch), so a teacher who wants the
      *same* link every class copies it back in once — after that,
      "Join class Meet" reuses it and skips "New meeting" every time.
   ========================================================= */
function renderMeet(body){
  function draw(){
    const link = state.meetLink;
    body.innerHTML = `
      <div class="btn-row">
        <button class="wbtn" id="meet-new" data-i18n="meet_start_new">${t('meet_start_new')}</button>
      </div>
      <p class="small-hint" data-i18n="meet_new_tab_hint">${t('meet_new_tab_hint')}</p>
      <div style="border-top:1px solid var(--line); margin:12px 0"></div>
      <label class="cal-field">
        <span data-i18n="meet_link_label">${t('meet_link_label')}</span>
        <input type="text" id="meet-link-input" placeholder="${t('meet_link_ph')}" data-i18n-placeholder="meet_link_ph" value="${escHtml(link||'')}">
      </label>
      <div class="btn-row">
        <button class="wbtn" id="meet-save" data-i18n="meet_save">${t('meet_save')}</button>
        ${link ? `<button class="wbtn" id="meet-clear" data-i18n="meet_clear">${t('meet_clear')}</button>` : ''}
      </div>
      ${link ? `
        <div class="btn-row" style="margin-top:10px">
          <button class="wbtn primary" id="meet-join" data-i18n="meet_join_saved">${t('meet_join_saved')}</button>
          <button class="wbtn" id="meet-qr" data-i18n="meet_show_qr">${t('meet_show_qr')}</button>
        </div>
        <p class="small-hint" data-i18n="meet_saved">${t('meet_saved')}</p>
        <div class="qr-canvas-wrap" id="meet-qr-out" hidden></div>
      ` : `<p class="small-hint" data-i18n="meet_no_link_hint">${t('meet_no_link_hint')}</p>`}
    `;
    body.querySelector('#meet-new').addEventListener('click', ()=>{
      track('meet', 'new');
      window.open('https://meet.google.com/new', '_blank', 'noopener');
    });
    body.querySelector('#meet-save').addEventListener('click', ()=>{
      const val = body.querySelector('#meet-link-input').value.trim();
      if(val && !/meet\.google\.com/i.test(val)){ toast(t('meet_invalid_link')); return; }
      state.meetLink = val;
      saveState();
      draw();
    });
    const clearBtn = body.querySelector('#meet-clear');
    if(clearBtn) clearBtn.addEventListener('click', ()=>{
      state.meetLink = '';
      saveState();
      draw();
    });
    const joinBtn = body.querySelector('#meet-join');
    if(joinBtn) joinBtn.addEventListener('click', ()=>{
      track('meet', 'join');
      window.open(state.meetLink, '_blank', 'noopener');
    });
    const qrBtn = body.querySelector('#meet-qr');
    if(qrBtn) qrBtn.addEventListener('click', ()=>{
      const out = body.querySelector('#meet-qr-out');
      if(!out.hidden){ out.hidden = true; return; }
      if(typeof qrcode !== 'function'){ toast('QR library not loaded'); return; }
      const qr = qrcode(0, 'M');
      qr.addData(state.meetLink);
      qr.make();
      out.innerHTML = qr.createSvgTag(6, 8);
      out.hidden = false;
    });
  }
  draw();
  return null;
}

function renderQrCode(body){
  function draw(){
    body.innerHTML = `
      <input type="text" id="qr-input" placeholder="${t('qr_placeholder')}" data-i18n-placeholder="qr_placeholder" style="width:100%">
      <div class="btn-row" style="margin-top:8px"><button class="wbtn primary" id="qr-go" data-i18n="qr_generate">${t('qr_generate')}</button></div>
      <div class="qr-canvas-wrap" id="qr-out"></div>
      <div class="btn-row" id="qr-dl-row" hidden><button class="wbtn" id="qr-download" data-i18n="qr_download">${t('qr_download')}</button></div>
      <p class="small-hint" data-i18n="qr_hint">${t('qr_hint')}</p>
    `;
    function generate(){
      const val = body.querySelector('#qr-input').value.trim();
      const out = body.querySelector('#qr-out');
      const dlRow = body.querySelector('#qr-dl-row');
      if(!val){ toast(t('qr_empty')); return; }
      if(typeof qrcode !== 'function'){ toast('QR library not loaded'); return; }
      const qr = qrcode(0, 'M');
      qr.addData(val);
      qr.make();
      out.innerHTML = qr.createSvgTag(6, 8);
      track('qr', val.slice(0, 40));
      dlRow.hidden = false;
      const svgEl = out.querySelector('svg');
      body.querySelector('#qr-download').onclick = ()=>{
        const svgData = new XMLSerializer().serializeToString(svgEl);
        const canvas = document.createElement('canvas');
        const size = 400;
        canvas.width = size; canvas.height = size;
        const ctx2d = canvas.getContext('2d');
        const img = new Image();
        const svgBlob = new Blob([svgData], { type:'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        img.onload = ()=>{
          ctx2d.fillStyle = '#fff'; ctx2d.fillRect(0,0,size,size);
          ctx2d.drawImage(img,0,0,size,size);
          URL.revokeObjectURL(url);
          canvas.toBlob(blob=>{
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'qrcode.png';
            a.click();
          });
        };
        img.src = url;
      };
    }
    body.querySelector('#qr-go').addEventListener('click', generate);
    body.querySelector('#qr-input').addEventListener('keydown', e=>{ if(e.key==='Enter') generate(); });
  }
  draw();
  return null;
}

function renderCountdown(body){
  let iv;
  function draw(){
    const cd = state.countdown;
    body.innerHTML = `
      <div class="cd-days" id="cd-days">—</div>
      <div class="cd-label" id="cd-label"></div>
      <div class="field-block">
        <input type="text" id="cd-label-input" placeholder="${t('cd_label_placeholder')}" data-i18n-placeholder="cd_label_placeholder" value="${cd.label ? cd.label.replace(/"/g,'&quot;') : ''}" style="width:100%; margin-bottom:8px">
        <span class="field-label" data-i18n="cd_date_label">${t('cd_date_label')}</span>
        <input type="date" id="cd-date-input" value="${cd.date||''}">
      </div>
    `;
    body.querySelector('#cd-label-input').addEventListener('input', e=>{ cd.label = e.target.value; saveState(); tick(); });
    body.querySelector('#cd-date-input').addEventListener('change', e=>{ cd.date = e.target.value; saveState(); tick(); });
    tick();
  }
  function tick(){
    const cd = state.countdown;
    const daysEl = body.querySelector('#cd-days');
    const labelEl = body.querySelector('#cd-label');
    if(!daysEl) return;
    if(!cd.date){
      daysEl.textContent = '—';
      labelEl.textContent = t('cd_set_prompt');
      return;
    }
    const target = new Date(cd.date + 'T00:00:00');
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((target - todayMid) / 86400000);
    if(diffDays < 0){
      daysEl.textContent = '0';
      labelEl.textContent = t('cd_past');
    } else if(diffDays === 0){
      daysEl.textContent = '🎉';
      labelEl.textContent = (cd.label || t('cd_today'));
    } else {
      daysEl.textContent = String(diffDays);
      labelEl.textContent = (cd.label ? cd.label + ' — ' : '') + (diffDays===1 ? t('cd_one_day') : t('cd_days_left', {n:diffDays}));
    }
  }
  draw();
  iv = setInterval(tick, 60000);
  return ()=>clearInterval(iv);
}

function renderHallPass(body){
  function draw(){
    if(!state.roster.length){
      body.innerHTML = `<p class="small-hint" data-i18n="hp_no_roster">${t('hp_no_roster')}</p>`;
      return;
    }
    const hp = state.hallPass;
    let formHtml = '';
    if(hp.current){
      const mins = Math.max(0, Math.floor((Date.now() - hp.current.start)/60000));
      formHtml = `
        <div class="hp-current">
          <span></span>
          <button class="wbtn primary" id="hp-return" data-i18n="hp_return">${t('hp_return')}</button>
        </div>
      `;
    } else {
      formHtml = `
        <div class="hp-form">
          <select id="hp-student">${state.roster.map(n=>`<option value="${n}">${n}</option>`).join('')}</select>
          <input type="text" id="hp-dest" placeholder="${t('hp_dest_placeholder')}" data-i18n-placeholder="hp_dest_placeholder">
          <button class="wbtn primary" id="hp-send" data-i18n="hp_send_out">${t('hp_send_out')}</button>
        </div>
      `;
    }
    body.innerHTML = `
      ${formHtml}
      <p class="field-label" data-i18n="hp_log_title" style="margin-top:6px">${t('hp_log_title')}</p>
      <div class="scroll-list" id="hp-log"></div>
      <div class="btn-row" style="margin-top:8px"><button class="wbtn" id="hp-clear" data-i18n="hp_clear_log">${t('hp_clear_log')}</button></div>
    `;
    if(hp.current){
      const mins = Math.max(0, Math.floor((Date.now() - hp.current.start)/60000));
      body.querySelector('.hp-current span').textContent = t('hp_out_since', { name:hp.current.name, dest:hp.current.dest || '' }) + ` (${mins}m)`;
      body.querySelector('#hp-return').addEventListener('click', ()=>{
        const durMin = Math.max(0, Math.round((Date.now() - hp.current.start)/60000));
        hp.log.unshift({ name:hp.current.name, dest:hp.current.dest, minutes:durMin, at:Date.now() });
        hp.current = null;
        saveState(); draw();
      });
    } else {
      body.querySelector('#hp-send').addEventListener('click', ()=>{
        const name = body.querySelector('#hp-student').value;
        const dest = body.querySelector('#hp-dest').value.trim();
        hp.current = { name, dest, start:Date.now() };
        track('hallpass', name + (dest ? ' → ' + dest : ''));
        saveState(); draw();
      });
    }
    const logEl = body.querySelector('#hp-log');
    hp.log.slice(0,20).forEach(entry=>{
      const div = document.createElement('div');
      div.className = 'hp-log-item';
      const time = new Date(entry.at).toLocaleTimeString(LOCALE_MAP[state.lang]||'en-US', {hour:'2-digit',minute:'2-digit'});
      div.textContent = `${time} — ${entry.name} (${entry.dest||'—'}) · ${entry.minutes}m`;
      logEl.appendChild(div);
    });
    body.querySelector('#hp-clear').addEventListener('click', ()=>{
      hp.log = []; saveState(); draw();
    });
  }
  draw();
  const iv = setInterval(()=>{ if(state.hallPass.current) draw(); }, 30000);
  return ()=>clearInterval(iv);
}

function renderReadingLog(body){
  let total, remaining, running=false, iv=null;
  function draw(){
    const rl = state.readingLog;
    total = (rl.minutes||15) * 60;
    remaining = total;
    body.innerHTML = `
      <div class="big-readout" id="rl-readout">--:--</div>
      <div class="btn-row" style="margin-bottom:8px">
        <button class="wbtn" data-m="-5">-5m</button>
        <span class="field-label" style="margin:0; align-self:center" id="rl-mins-label"></span>
        <button class="wbtn" data-m="5">+5m</button>
      </div>
      <div class="btn-row" style="margin-bottom:12px">
        <button class="wbtn primary" id="rl-start" data-i18n-dyn data-key="start">${t('start')}</button>
        <button class="wbtn" id="rl-reset" data-i18n="reset_btn">${t('reset_btn')}</button>
      </div>
      <p class="field-label" data-i18n="rl_log_title">${t('rl_log_title')}</p>
      <div class="btn-row">
        <input type="text" id="rl-student" placeholder="${t('rl_student_placeholder')}" data-i18n-placeholder="rl_student_placeholder" style="flex:1">
        <input type="number" id="rl-log-min" value="${rl.minutes||15}" min="1" style="width:60px">
        <button class="wbtn" id="rl-add" data-i18n="add_btn">${t('add_btn')}</button>
      </div>
      <div class="scroll-list" id="rl-list" style="margin-top:8px"></div>
      <div class="btn-row" style="margin-top:8px"><button class="wbtn" id="rl-clear" data-i18n="rl_clear_log">${t('rl_clear_log')}</button></div>
    `;
    updateReadout();
    body.querySelectorAll('[data-m]').forEach(b=>{
      b.addEventListener('click', ()=>{
        rl.minutes = Math.max(1, (rl.minutes||15) + parseInt(b.dataset.m));
        saveState();
        if(!running){ total = rl.minutes*60; remaining = total; }
        updateReadout();
      });
    });
    const startBtn = body.querySelector('#rl-start');
    startBtn.addEventListener('click', ()=>{
      running = !running;
      startBtn.dataset.key = running ? 'pause' : 'start';
      startBtn.textContent = t(startBtn.dataset.key);
      if(running){
        iv = setInterval(()=>{
          remaining--;
          if(remaining<=0){ remaining=0; running=false; clearInterval(iv); startBtn.dataset.key='start'; startBtn.textContent=t('start'); toast(t('time_up')); }
          updateReadout();
        },1000);
      } else clearInterval(iv);
    });
    body.querySelector('#rl-reset').addEventListener('click', ()=>{
      clearInterval(iv); running=false; startBtn.dataset.key='start'; startBtn.textContent=t('start');
      remaining = total; updateReadout();
    });
    body.querySelector('#rl-add').addEventListener('click', ()=>{
      const name = body.querySelector('#rl-student').value.trim();
      const min = parseInt(body.querySelector('#rl-log-min').value)||0;
      if(!name || !min) return;
      rl.entries.unshift({ id:cid(), name, minutes:min, at:Date.now() });
      stat('readEntries'); stat('readMin', min); track('reading', name + ' · ' + min + ' min');
      body.querySelector('#rl-student').value = '';
      saveState(); renderList();
    });
    body.querySelector('#rl-clear').addEventListener('click', ()=>{
      rl.entries = []; saveState(); renderList();
    });
    renderList();
  }
  function updateReadout(){
    const el = body.querySelector('#rl-readout');
    const lbl = body.querySelector('#rl-mins-label');
    if(!el) return;
    const m = Math.floor(remaining/60), s = remaining%60;
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    if(lbl) lbl.textContent = (state.readingLog.minutes||15) + 'm';
  }
  function renderList(){
    const list = body.querySelector('#rl-list');
    if(!list) return;
    list.innerHTML = '';
    state.readingLog.entries.slice(0,30).forEach(e=>{
      const div = document.createElement('div');
      div.className = 'rl-log-item';
      div.innerHTML = `<span></span><button>${iconSvg('close','wsvg')}</button>`;
      div.querySelector('span').textContent = t('rl_log_entry', { name:e.name, min:e.minutes });
      div.querySelector('button').addEventListener('click', ()=>{
        state.readingLog.entries = state.readingLog.entries.filter(x=>x.id!==e.id);
        saveState(); renderList();
      });
      list.appendChild(div);
    });
  }
  draw();
  readingRedraw = ()=>{ if(body.isConnected) renderList(); };
  return ()=>{ clearInterval(iv); readingRedraw = null; };
}

function renderTtsReader(body){
  const supported = 'speechSynthesis' in window;
  function draw(){
    if(!supported){
      body.innerHTML = `<p class="small-hint" data-i18n="tts_unsupported">${t('tts_unsupported')}</p>`;
      return;
    }
    body.innerHTML = `
      <textarea id="tts-text" placeholder="${t('tts_placeholder')}" data-i18n-placeholder="tts_placeholder" style="width:100%; min-height:80px">${state.ttsText||''}</textarea>
      <div class="tts-row">
        <select id="tts-voice"></select>
      </div>
      <div class="tts-row">
        <span class="field-label" style="margin:0" data-i18n="tts_speed">${t('tts_speed')}</span>
        <input type="range" id="tts-rate" min="0.5" max="1.8" step="0.1" value="1">
      </div>
      <div class="btn-row">
        <button class="wbtn primary" id="tts-play" data-i18n="tts_play">${t('tts_play')}</button>
        <button class="wbtn" id="tts-stop" data-i18n="tts_stop">${t('tts_stop')}</button>
      </div>
    `;
    const textEl = body.querySelector('#tts-text');
    textEl.addEventListener('input', ()=>{ state.ttsText = textEl.value; saveState(); });
    const voiceSel = body.querySelector('#tts-voice');
    function loadVoices(){
      const voices = speechSynthesis.getVoices();
      voiceSel.innerHTML = voices.map((v,i)=>`<option value="${i}">${v.name} (${v.lang})</option>`).join('');
    }
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    body.querySelector('#tts-play').addEventListener('click', ()=>{
      speechSynthesis.cancel();
      const text = textEl.value.trim();
      if(!text) return;
      track('tts', text.slice(0, 40));
      const utter = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const idx = parseInt(voiceSel.value);
      if(voices[idx]) utter.voice = voices[idx];
      utter.rate = parseFloat(body.querySelector('#tts-rate').value);
      speechSynthesis.speak(utter);
    });
    body.querySelector('#tts-stop').addEventListener('click', ()=> speechSynthesis.cancel());
  }
  draw();
  return ()=>{ if(supported) speechSynthesis.cancel(); };
}

const UC_LENGTH = { m:1, km:1000, cm:0.01, mm:0.001, mi:1609.344, yd:0.9144, ft:0.3048, in:0.0254 };
const UC_WEIGHT = { kg:1, g:0.001, mg:0.000001, lb:0.45359237, oz:0.028349523125 };
const UC_CURRENCY = { USD:1, VND:25400, EUR:0.92, GBP:0.79, JPY:149, KRW:1330 };

function renderUnitConverter(body){
  function draw(){
    body.innerHTML = `
      <div class="field-block">
        <span class="field-label" data-i18n="uc_category">${t('uc_category')}</span>
        <select id="uc-cat">
          <option value="length" data-i18n="uc_length">${t('uc_length')}</option>
          <option value="weight" data-i18n="uc_weight">${t('uc_weight')}</option>
          <option value="temperature" data-i18n="uc_temperature">${t('uc_temperature')}</option>
          <option value="currency" data-i18n="uc_currency">${t('uc_currency')}</option>
        </select>
      </div>
      <div class="uc-row">
        <input type="number" id="uc-from-val" value="1">
        <select id="uc-from-unit"></select>
      </div>
      <div class="uc-row" style="justify-content:center">
        <button class="uc-swap-btn" id="uc-swap">${iconSvg('swap','wsvg')}</button>
      </div>
      <div class="uc-row">
        <input type="number" id="uc-to-val" readonly>
        <select id="uc-to-unit"></select>
      </div>
      <p class="small-hint" id="uc-note"></p>
    `;
    const catSel = body.querySelector('#uc-cat');
    const fromUnit = body.querySelector('#uc-from-unit');
    const toUnit = body.querySelector('#uc-to-unit');
    const fromVal = body.querySelector('#uc-from-val');
    const toVal = body.querySelector('#uc-to-val');
    const note = body.querySelector('#uc-note');

    function unitsFor(cat){
      if(cat==='length') return Object.keys(UC_LENGTH);
      if(cat==='weight') return Object.keys(UC_WEIGHT);
      if(cat==='currency') return Object.keys(UC_CURRENCY);
      return ['C','F'];
    }
    function populateUnits(){
      const cat = catSel.value;
      const units = unitsFor(cat);
      fromUnit.innerHTML = units.map(u=>`<option value="${u}">${u}</option>`).join('');
      toUnit.innerHTML = units.map(u=>`<option value="${u}">${u}</option>`).join('');
      if(units.length>1) toUnit.value = units[1];
      note.textContent = cat==='currency' ? t('uc_currency_note') : '';
      note.hidden = cat!=='currency';
      convert();
    }
    function convert(){
      const cat = catSel.value;
      const val = parseFloat(fromVal.value);
      if(isNaN(val)){ toVal.value=''; return; }
      let result;
      if(cat==='length'){
        result = val * UC_LENGTH[fromUnit.value] / UC_LENGTH[toUnit.value];
      } else if(cat==='weight'){
        result = val * UC_WEIGHT[fromUnit.value] / UC_WEIGHT[toUnit.value];
      } else if(cat==='currency'){
        result = val / UC_CURRENCY[fromUnit.value] * UC_CURRENCY[toUnit.value];
      } else {
        if(fromUnit.value===toUnit.value) result = val;
        else if(fromUnit.value==='C') result = val*9/5+32;
        else result = (val-32)*5/9;
      }
      toVal.value = Math.round(result*10000)/10000;
    }
    catSel.addEventListener('change', populateUnits);
    [fromUnit,toUnit,fromVal].forEach(el=> el.addEventListener('input', convert));
    body.querySelector('#uc-swap').addEventListener('click', ()=>{
      const fu = fromUnit.value, tu = toUnit.value;
      fromUnit.value = tu; toUnit.value = fu;
      convert();
    });
    populateUnits();
  }
  draw();
  return null;
}

function renderAnnouncements(body){
  function draw(){
    const now = Date.now();
    state.announcements = state.announcements.filter(a=> !a.expiresAt || a.expiresAt > now);
    const items = state.announcements.slice().sort((a,b)=> (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
    body.innerHTML = `
      <div class="ann-form">
        <textarea id="ann-text" placeholder="${t('ann_placeholder')}" data-i18n-placeholder="ann_placeholder"></textarea>
        <div class="ann-form-row">
          <label style="font-size:12px; display:flex; align-items:center; gap:4px"><input type="checkbox" id="ann-pin"> <span data-i18n="ann_pin">${t('ann_pin')}</span></label>
          <select id="ann-expiry" style="flex:1">
            <option value="0" data-i18n="ann_no_expiry">${t('ann_no_expiry')}</option>
            <option value="1">1d</option>
            <option value="3">3d</option>
            <option value="7">7d</option>
          </select>
          <button class="wbtn primary" id="ann-post" data-i18n="ann_post">${t('ann_post')}</button>
        </div>
      </div>
      <div class="scroll-list" id="ann-list"></div>
    `;
    const list = body.querySelector('#ann-list');
    if(!items.length){
      list.innerHTML = `<p class="small-hint" data-i18n="ann_empty">${t('ann_empty')}</p>`;
    }
    items.forEach(a=>{
      const div = document.createElement('div');
      div.className = 'ann-item' + (a.pinned ? ' pinned' : '');
      div.innerHTML = `
        <div class="ann-item-top">
          ${a.pinned ? `<span class="ann-badge" data-i18n="ann_pinned_badge">${t('ann_pinned_badge')}</span>` : '<span></span>'}
          <button aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
        </div>
        <p style="margin:0"></p>
      `;
      div.querySelector('p').textContent = a.text;
      div.querySelector('button').addEventListener('click', ()=>{
        state.announcements = state.announcements.filter(x=>x.id!==a.id);
        saveState(); draw();
      });
      list.appendChild(div);
    });
    body.querySelector('#ann-post').addEventListener('click', ()=>{
      const text = body.querySelector('#ann-text').value.trim();
      if(!text) return;
      const days = parseInt(body.querySelector('#ann-expiry').value)||0;
      track('announce', text.slice(0, 50));
      state.announcements.push({
        id:cid(), text,
        pinned: body.querySelector('#ann-pin').checked,
        createdAt: Date.now(),
        expiresAt: days ? Date.now() + days*86400000 : null
      });
      saveState(); draw();
    });
  }
  draw();
  return null;
}

/* ---------------- Instructions Display ----------------
   Text is sized to fit the widget: it grows and shrinks as you resize the
   window, so students at the back of the room can read it.
   Each step can carry a Vietnamese translation (step.vi) shown under the English. */
let _insTranslator = null;
function _withTimeout(promise, ms){
  return new Promise((resolve, reject)=>{
    const h = setTimeout(()=> reject(new Error('timeout')), ms);
    promise.then(v=>{ clearTimeout(h); resolve(v); }, e=>{ clearTimeout(h); reject(e); });
  });
}
function _decodeEntities(s){
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
}
function _chunkForTranslate(text, max){
  if(text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = []; let cur = '';
  sentences.forEach(s=>{
    while(s.length > max){ if(cur){ chunks.push(cur); cur=''; } chunks.push(s.slice(0,max)); s = s.slice(max); }
    if((cur ? cur+' ' : '').length + s.length > max){ if(cur) chunks.push(cur); cur = s; }
    else cur = cur ? cur+' '+s : s;
  });
  if(cur) chunks.push(cur);
  return chunks;
}
async function translateToVietnamese(text){
  text = (text||'').trim();
  if(!text) return '';
  // 1) Chrome's built-in on-device Translator (private, no network) — only if its Vietnamese
  //    language pack is already installed. Anything slow, missing or failing falls through to (2).
  try{
    if('Translator' in self){
      if(!_insTranslator){
        const opts = { sourceLanguage:'en', targetLanguage:'vi' };
        const avail = await _withTimeout(self.Translator.availability(opts), 1500);
        if(avail === 'available') _insTranslator = await _withTimeout(self.Translator.create(opts), 4000);
      }
      if(_insTranslator){
        const out = await _withTimeout(_insTranslator.translate(text), 8000);
        if(out && out.trim()) return out.trim();
      }
    }
  }catch(e){ _insTranslator = null; }
  // 2) Fallback: the free MyMemory web service (needs internet)
  const parts = [];
  for(const chunk of _chunkForTranslate(text, 450)){
    const res = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=en|vi');
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out = data && data.responseData && data.responseData.translatedText;
    if(!out || (data.responseStatus && Number(data.responseStatus) !== 200) || /MYMEMORY WARNING/i.test(out)) throw new Error('no translation');
    parts.push(_decodeEntities(out));
  }
  return parts.join(' ').trim();
}

// Steps are numbered automatically, so any "1." / "2)" the teacher typed (or the
// translator echoed back) is dropped — otherwise you'd see "1. 2. Talk about…".
function stripLeadNum(s){ return String(s == null ? '' : s).replace(/^\s*\d{1,2}\s*[.)]\s+/, '').trim(); }

function renderInstructions(body, ctx){
  const ib = state.instructionsBoard;
  if(ctx && ctx.preset){ const p = ctx.preset; ib.title = p.title; ib.titleVi = p.titleVi; ib.steps = p.steps.map(s => ({ id:cid(), text:s.text, vi:s.vi })); ib.current = 0; saveState(); }   // platform (ClassIn): ?title=&steps=
  if(ib.showVi === undefined) ib.showVi = true;
  if(ib.autoVi === undefined) ib.autoVi = true;
  if(ib.viewAll === undefined) ib.viewAll = false;
  if(ib.titleVi === undefined) ib.titleVi = '';
  // tidy anything saved by an earlier version that still carries typed-in numbers
  (function(){
    let dirty = false;
    const nt = stripLeadNum(ib.title); if(nt !== ib.title){ ib.title = nt; dirty = true; }
    const nv = stripLeadNum(ib.titleVi); if(nv !== ib.titleVi){ ib.titleVi = nv; dirty = true; }
    ib.steps.forEach(s=>{
      const a = stripLeadNum(s.text); if(a !== s.text){ s.text = a; dirty = true; }
      if(s.vi){ const b = stripLeadNum(s.vi); if(b !== s.vi){ s.vi = b; dirty = true; } }
    });
    if(dirty) saveState();
  })();
  let editing = false;
  let ro = null, raf = 0;

  // Biggest font size at which everything in the panel still fits.
  function fit(){
    const panel = body.querySelector('.ins-panel');
    const inner = panel && panel.firstElementChild;
    if(!panel || !inner) return;
    const cs = getComputedStyle(panel);
    const availH = panel.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const availW = panel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if(availH <= 0 || availW <= 0) return;
    inner.style.width = availW + 'px';
    let lo = 8, hi = Math.max(24, Math.min(Math.round(availH), 600)) + 1;
    while(hi - lo > 1){
      const mid = (lo + hi) >> 1;
      inner.style.fontSize = mid + 'px';
      if(inner.scrollHeight <= availH && inner.scrollWidth <= availW) lo = mid; else hi = mid;
    }
    inner.style.fontSize = lo + 'px';
  }
  function scheduleFit(){ cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); }
  function stopObserving(){ if(ro){ ro.disconnect(); ro = null; } cancelAnimationFrame(raf); }

  // key = step id, or '__title' for the title. apply(vi) stores the result.
  async function doTranslate(key, text, apply){
    const btn = body.querySelector(`.ins-tr[data-id="${key}"]`);
    if(btn){ btn.disabled = true; btn.textContent = '…'; }
    try{
      const vi = stripLeadNum(await translateToVietnamese(stripLeadNum(text)));
      apply(vi); saveState();
      const input = body.querySelector(`.ins-vi-input[data-id="${key}"]`);
      if(input) input.value = vi;
      // On the display (not the edit form) the new translation has to be drawn,
      // otherwise it only appears after the next click.
      if(!editing && body.isConnected) draw();
    }catch(e){
      toast(t('ins_translate_failed'), 4500);
    }finally{
      const b = body.querySelector(`.ins-tr[data-id="${key}"]`);
      if(b){ b.disabled = false; b.textContent = '🌐'; }
    }
  }
  function translateStep(step, force){
    if(!force && step.vi) return Promise.resolve();
    return doTranslate(step.id, step.text, vi=>{ step.vi = vi; });
  }
  function translateTitle(force){
    if(!ib.title || (!force && ib.titleVi)) return Promise.resolve();
    return doTranslate('__title', ib.title, vi=>{ ib.titleVi = vi; });
  }

  // English line, then (if switched on and present) the Vietnamese line under it.
  function addPair(parent, en, vi){
    const e = document.createElement('p'); e.className = 'ins-en'; e.textContent = en; parent.appendChild(e);
    if(ib.showVi && vi){ const v = document.createElement('p'); v.className = 'ins-vi'; v.textContent = vi; parent.appendChild(v); }
  }

  function draw(){
    stopObserving();
    if(ib.current >= ib.steps.length) ib.current = Math.max(0, ib.steps.length-1);
    const showPanel = !editing && ib.steps.length > 0;
    body.style.display = showPanel ? 'flex' : '';
    body.style.flexDirection = showPanel ? 'column' : '';

    if(editing){
      body.innerHTML = `
        <input type="text" id="ins-title" placeholder="${t('ins_title_placeholder')}" data-i18n-placeholder="ins_title_placeholder" style="width:100%; margin-bottom:6px">
        <div class="ins-title-vi-row">
          <input type="text" class="ins-vi-input" id="ins-title-vi" data-id="__title" placeholder="${t('ins_title_vi_placeholder')}">
          <button class="ins-tr" data-id="__title" title="${t('ins_translate')}" aria-label="${t('ins_translate')}">🌐</button>
        </div>
        <div class="scroll-list" id="ins-edit-list"></div>
        <div class="btn-row" style="margin:8px 0">
          <input type="text" id="ins-new-step" placeholder="${t('ins_step_placeholder')}" data-i18n-placeholder="ins_step_placeholder" style="flex:1">
          <button class="wbtn" id="ins-add" data-i18n="ins_add_step">${t('ins_add_step')}</button>
        </div>
        <div class="ins-opts">
          <label><input type="checkbox" id="ins-show-vi" ${ib.showVi?'checked':''}> <span data-i18n="ins_show_vi">${t('ins_show_vi')}</span></label>
          <label><input type="checkbox" id="ins-auto-vi" ${ib.autoVi?'checked':''}> <span data-i18n="ins_auto_vi">${t('ins_auto_vi')}</span></label>
          <button class="wbtn" id="ins-tr-all" data-i18n="ins_translate_all">${t('ins_translate_all')}</button>
        </div>
        <div class="btn-row"><button class="wbtn primary" id="ins-done" data-i18n="ins_done_editing">${t('ins_done_editing')}</button></div>
      `;
      const titleIn = body.querySelector('#ins-title');
      const titleViIn = body.querySelector('#ins-title-vi');
      titleIn.value = ib.title || '';
      titleViIn.value = ib.titleVi || '';
      titleIn.addEventListener('input', e=>{ ib.title = e.target.value; saveState(); });
      titleIn.addEventListener('change', ()=>{
        ib.title = stripLeadNum(titleIn.value); titleIn.value = ib.title;
        if(!ib.title){ ib.titleVi = ''; titleViIn.value = ''; saveState(); return; }
        saveState();
        if(ib.autoVi) translateTitle(true);
      });
      titleViIn.addEventListener('input', ()=>{ ib.titleVi = titleViIn.value; saveState(); });
      body.querySelector('.ins-tr[data-id="__title"]').addEventListener('click', ()=> translateTitle(true));

      const editList = body.querySelector('#ins-edit-list');
      ib.steps.forEach((s,i)=>{
        const row = document.createElement('div');
        row.className = 'ins-edit-row ins-edit-step';
        row.innerHTML = `
          <div class="ins-edit-main">
            <div class="ins-edit-en"></div>
            <input type="text" class="ins-vi-input" data-id="${s.id}" placeholder="${t('ins_vi_placeholder')}">
          </div>
          <div class="ins-edit-btns">
            <button class="ins-tr" data-id="${s.id}" title="${t('ins_translate')}" aria-label="${t('ins_translate')}">🌐</button>
            <button class="ins-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
          </div>`;
        row.querySelector('.ins-edit-en').textContent = `${i+1}. ${s.text}`;
        const viInput = row.querySelector('.ins-vi-input');
        viInput.value = s.vi || '';
        viInput.addEventListener('input', ()=>{ s.vi = viInput.value; saveState(); });
        row.querySelector('.ins-tr').addEventListener('click', ()=> translateStep(s, true));
        row.querySelector('.ins-del').addEventListener('click', ()=>{
          ib.steps.splice(i,1); saveState(); draw();
        });
        editList.appendChild(row);
      });
      function addStep(){
        const input = body.querySelector('#ins-new-step');
        const text = stripLeadNum(input.value);
        if(!text) return;
        const step = { id:cid(), text, vi:'' };
        ib.steps.push(step);
        track('instruct', text.slice(0, 50));
        saveState(); draw();
        body.querySelector('#ins-new-step').focus();
        if(ib.autoVi) translateStep(step, false);
      }
      body.querySelector('#ins-add').addEventListener('click', addStep);
      body.querySelector('#ins-new-step').addEventListener('keydown', e=>{ if(e.key==='Enter') addStep(); });
      body.querySelector('#ins-show-vi').addEventListener('change', e=>{ ib.showVi = e.target.checked; saveState(); });
      body.querySelector('#ins-auto-vi').addEventListener('change', e=>{ ib.autoVi = e.target.checked; saveState(); });
      body.querySelector('#ins-tr-all').addEventListener('click', async ()=>{
        await translateTitle(false);
        for(const s of ib.steps.filter(s=>!s.vi)) await translateStep(s, false);
      });
      body.querySelector('#ins-done').addEventListener('click', ()=>{ editing = false; draw(); });
    } else {
      if(!ib.steps.length){
        body.innerHTML = `
          <p class="small-hint" data-i18n="ins_empty">${t('ins_empty')}</p>
          <div class="btn-row" style="margin-top:8px"><button class="wbtn primary" id="ins-edit" data-i18n="ins_edit">${t('ins_edit')}</button></div>
        `;
        body.querySelector('#ins-edit').addEventListener('click', ()=>{ editing = true; draw(); });
        return;
      }
      body.innerHTML = `
        ${ib.viewAll ? '' : '<p class="ins-step-count"></p>'}
        <div class="ins-panel"><div class="ins-text${ib.viewAll?' all':''}"></div></div>
        ${ib.viewAll ? '' : `<div class="btn-row">
          <button class="wbtn" id="ins-prev" data-i18n="ins_prev">${t('ins_prev')}</button>
          <button class="wbtn" id="ins-next" data-i18n="ins_next">${t('ins_next')}</button>
        </div>`}
        <div class="btn-row ins-bar">
          <button class="wbtn" id="ins-edit" data-i18n="ins_edit">${t('ins_edit')}</button>
          <button class="wbtn ${ib.showVi?'primary':''}" id="ins-vi-toggle" aria-pressed="${ib.showVi?'true':'false'}">🇻🇳 <span data-i18n="ins_vi_toggle">${t('ins_vi_toggle')}</span></button>
          <button class="wbtn" id="ins-view-toggle">${ib.viewAll ? '1️⃣ ' + t('ins_view_one') : '📋 ' + t('ins_view_all')}</button>
        </div>
      `;
      const txt = body.querySelector('.ins-text');
      if(ib.title){
        const head = document.createElement('div'); head.className = 'ins-head';
        addPair(head, ib.title, ib.titleVi);
        txt.appendChild(head);
      }
      if(ib.viewAll){
        ib.steps.forEach((s,i)=>{
          const item = document.createElement('div'); item.className = 'ins-item';
          const num = document.createElement('span'); num.className = 'ins-num'; num.textContent = `${i+1}.`;
          const content = document.createElement('div'); content.className = 'ins-item-body';
          addPair(content, s.text, s.vi);
          item.appendChild(num); item.appendChild(content);
          txt.appendChild(item);
        });
      } else {
        const step = ib.steps[ib.current];
        body.querySelector('.ins-step-count').textContent = t('ins_step_of', { cur: ib.current+1, total: ib.steps.length });
        const one = document.createElement('div'); one.className = 'ins-one';
        addPair(one, step.text, step.vi);
        txt.appendChild(one);
        body.querySelector('#ins-prev').disabled = ib.current===0;
        body.querySelector('#ins-next').disabled = ib.current>=ib.steps.length-1;
        body.querySelector('#ins-prev').addEventListener('click', ()=>{ ib.current = Math.max(0, ib.current-1); saveState(); draw(); });
        body.querySelector('#ins-next').addEventListener('click', ()=>{ ib.current = Math.min(ib.steps.length-1, ib.current+1); saveState(); draw(); });
      }
      body.querySelector('#ins-edit').addEventListener('click', ()=>{ editing = true; draw(); });
      body.querySelector('#ins-vi-toggle').addEventListener('click', ()=>{ ib.showVi = !ib.showVi; saveState(); draw(); });
      body.querySelector('#ins-view-toggle').addEventListener('click', ()=>{ ib.viewAll = !ib.viewAll; saveState(); draw(); });

      // Re-fit whenever the widget window (or its panel) changes size.
      const panel = body.querySelector('.ins-panel');
      fit();
      if('ResizeObserver' in window){ ro = new ResizeObserver(scheduleFit); ro.observe(panel); }
      if(document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);
    }
  }
  draw();
  // On opening: translate anything that has no Vietnamese yet (the title included),
  // e.g. a title typed before this feature existed. Each item is tried once per open,
  // so an offline classroom doesn't get a stream of error messages.
  if(ib.autoVi){
    (async ()=>{
      if(ib.title && !ib.titleVi) await translateTitle(false);
      for(const st of ib.steps.filter(x=>!x.vi)) await translateStep(st, false);
    })();
  }
  // cleanup (called when the widget is closed or re-rendered)
  return ()=>{ stopObserving(); body.style.display = ''; body.style.flexDirection = ''; };
}

const CONVO_CARDS = [
  { text:"What's the best trip you've ever taken?", topic:'travel', diff:'easy' },
  { text:"If you could visit any country, where would you go and why?", topic:'travel', diff:'medium' },
  { text:"Describe a place you'd love to live someday.", topic:'travel', diff:'medium' },
  { text:"What's your favorite food, and how is it made?", topic:'food', diff:'easy' },
  { text:"Describe a meal you'll never forget.", topic:'food', diff:'medium' },
  { text:"Is street food better than restaurant food? Why or why not?", topic:'food', diff:'hard' },
  { text:"What's a hobby you'd like to start?", topic:'hobbies', diff:'easy' },
  { text:"Teach your partner one thing about your favorite hobby.", topic:'hobbies', diff:'medium' },
  { text:"If you had an extra 3 hours every day, what would you do with them?", topic:'hobbies', diff:'hard' },
  { text:"Who is someone you admire, and why?", topic:'people', diff:'medium' },
  { text:"Describe your best friend without saying their name.", topic:'people', diff:'easy' },
  { text:"What makes a good leader?", topic:'people', diff:'hard' },
  { text:"What's your morning routine like?", topic:'daily-life', diff:'easy' },
  { text:"What's the hardest part of your week?", topic:'daily-life', diff:'medium' },
  { text:"How has your daily life changed in the last five years?", topic:'daily-life', diff:'hard' },
  { text:"What's a movie or show everyone should watch?", topic:'entertainment', diff:'easy' },
  { text:"Do you prefer books or movies? Why?", topic:'entertainment', diff:'medium' },
  { text:"How do you think entertainment will change in the future?", topic:'entertainment', diff:'hard' },
  { text:"What's one thing you're grateful for today?", topic:'reflection', diff:'easy' },
  { text:"What's a mistake you learned something important from?", topic:'reflection', diff:'hard' }
];
const CC_TOPICS = ['travel','food','hobbies','people','daily-life','entertainment','reflection'];

function renderConvoCards(body){
  let idx = 0;
  function pool(){
    const topic = body.querySelector('#cc-topic')?.value || 'all';
    const diff = body.querySelector('#cc-diff')?.value || 'all';
    return CONVO_CARDS.filter(c=> (topic==='all'||c.topic===topic) && (diff==='all'||c.diff===diff));
  }
  function draw(){
    body.innerHTML = `
      <div class="cc-filters">
        <select id="cc-topic">
          <option value="all" data-i18n="cc_all">${t('cc_all')}</option>
          ${CC_TOPICS.map(tp=>`<option value="${tp}">${tp.replace('-',' ')}</option>`).join('')}
        </select>
        <select id="cc-diff">
          <option value="all" data-i18n="cc_all">${t('cc_all')}</option>
          <option value="easy" data-i18n="cc_diff_easy">${t('cc_diff_easy')}</option>
          <option value="medium" data-i18n="cc_diff_medium">${t('cc_diff_medium')}</option>
          <option value="hard" data-i18n="cc_diff_hard">${t('cc_diff_hard')}</option>
        </select>
      </div>
      <div class="cc-card" id="cc-text"></div>
      <div class="cc-card-tags" id="cc-tags"></div>
      <div class="btn-row"><button class="wbtn primary" id="cc-next" data-i18n="cc_next_card">${t('cc_next_card')}</button></div>
    `;
    body.querySelector('#cc-topic').addEventListener('change', next);
    body.querySelector('#cc-diff').addEventListener('change', next);
    body.querySelector('#cc-next').addEventListener('click', ()=>{ next(); track('convo'); });
    next();
  }
  function next(){
    const p = pool();
    const textEl = body.querySelector('#cc-text');
    const tagsEl = body.querySelector('#cc-tags');
    if(!p.length){ textEl.textContent = '—'; tagsEl.textContent=''; return; }
    idx = Math.floor(Math.random()*p.length);
    const card = p[idx];
    textEl.textContent = card.text;
    tagsEl.textContent = `${card.topic} · ${card.diff}`;
  }
  draw();
  return null;
}

const IDIOM_BANK = [
  { phrase:"Break the ice", meaning:"To start a conversation in a friendly way, especially with new people.", example:"She told a joke to break the ice on the first day of class." },
  { phrase:"Hit the books", meaning:"To study, especially seriously.", example:"I have a big test tomorrow, so I need to hit the books tonight." },
  { phrase:"Piece of cake", meaning:"Something very easy to do.", example:"Don't worry about the quiz — it's a piece of cake." },
  { phrase:"Under the weather", meaning:"Feeling slightly ill.", example:"I'm feeling a bit under the weather, so I might stay home today." },
  { phrase:"Cost an arm and a leg", meaning:"To be very expensive.", example:"That new phone cost an arm and a leg." },
  { phrase:"Once in a blue moon", meaning:"Something that happens very rarely.", example:"We only eat out once in a blue moon." },
  { phrase:"Bite the bullet", meaning:"To do something difficult or unpleasant that you've been avoiding.", example:"I finally bit the bullet and booked the dentist appointment." },
  { phrase:"Speak of the devil", meaning:"Said when the person you were just talking about arrives.", example:"Speak of the devil — here comes Maria now!" },
  { phrase:"Hit the nail on the head", meaning:"To describe exactly what is causing a situation or problem.", example:"You hit the nail on the head — that's exactly the issue." },
  { phrase:"Let the cat out of the bag", meaning:"To accidentally reveal a secret.", example:"I let the cat out of the bag about the surprise party." },
  { phrase:"On the same page", meaning:"To agree with or understand each other.", example:"Let's make sure we're on the same page before the meeting." },
  { phrase:"Better late than never", meaning:"It's better to do or arrive at something late than not at all.", example:"He finally sent the report — better late than never." },
  { phrase:"Call it a day", meaning:"To stop working on something, usually for the rest of the day.", example:"We've done a lot today — let's call it a day." },
  { phrase:"Cut corners", meaning:"To do something in the easiest or cheapest way, often lowering quality.", example:"The company cut corners on safety to save money." },
  { phrase:"Give someone the benefit of the doubt", meaning:"To trust what someone says even though you're not completely sure.", example:"I'll give him the benefit of the doubt this time." }
];

function dayOfYear(d){
  const start = new Date(d.getFullYear(),0,0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}

function renderIdiomDay(body){
  let showingToday = true;
  const todayIdx = dayOfYear(new Date()) % IDIOM_BANK.length;
  function draw(idx){
    const idiom = IDIOM_BANK[idx];
    body.innerHTML = `
      <div class="idiom-card">
        <p class="idiom-phrase"></p>
        <p><strong data-i18n="idiom_meaning">${t('idiom_meaning')}:</strong> <span id="idiom-meaning"></span></p>
        <p><strong data-i18n="idiom_example">${t('idiom_example')}:</strong> <span id="idiom-example"></span></p>
      </div>
      <div class="btn-row">
        <button class="wbtn" id="idiom-shuffle" data-i18n="idiom_shuffle">${t('idiom_shuffle')}</button>
        ${!showingToday ? `<button class="wbtn primary" id="idiom-today" data-i18n="idiom_back_today">${t('idiom_back_today')}</button>` : ''}
      </div>
    `;
    body.querySelector('.idiom-phrase').textContent = idiom.phrase;
    body.querySelector('#idiom-meaning').textContent = idiom.meaning;
    body.querySelector('#idiom-example').textContent = idiom.example;
    body.querySelector('#idiom-shuffle').addEventListener('click', ()=>{
      showingToday = false;
      draw(Math.floor(Math.random()*IDIOM_BANK.length));
      track('idiom');
    });
    const todayBtn = body.querySelector('#idiom-today');
    if(todayBtn) todayBtn.addEventListener('click', ()=>{ showingToday = true; draw(todayIdx); });
  }
  draw(todayIdx);
  return null;
}

const GRAMMAR_TOPICS = [
  { id:'present-simple', label:'Present Simple', rule:"Use for habits, facts, and routines. Add -s/-es for he/she/it.", examples:["I work every day.","She works on Mondays.","Water boils at 100°C."] },
  { id:'past-simple', label:'Past Simple', rule:"Use for finished actions at a specific past time. Regular verbs add -ed; many common verbs are irregular.", examples:["I walked to school.","She went to the store.","They didn't see the movie."] },
  { id:'present-continuous', label:'Present Continuous', rule:"Use am/is/are + verb-ing for actions happening now or temporary situations.", examples:["I am studying right now.","He is living in Hanoi this year.","They are not listening."] },
  { id:'articles', label:'Articles (a/an/the)', rule:"Use 'a/an' for a non-specific, singular, countable noun. Use 'the' for a specific noun both speakers know.", examples:["I saw a dog. The dog was brown.","She is an engineer.","Please close the door."] },
  { id:'plurals', label:'Plurals', rule:"Most nouns add -s. Nouns ending in -s, -x, -ch, -sh add -es. Nouns ending in consonant+y change y to i and add -es.", examples:["book → books","box → boxes","city → cities","child → children (irregular)"] },
  { id:'prepositions-time', label:'Prepositions of Time', rule:"Use 'at' for exact times, 'on' for days/dates, 'in' for months/years/longer periods.", examples:["at 7:00","on Monday","in July","in 2024"] },
  { id:'comparatives', label:'Comparatives & Superlatives', rule:"Short adjectives: add -er/-est. Long adjectives: use more/most.", examples:["fast → faster → fastest","beautiful → more beautiful → most beautiful","good → better → best (irregular)"] },
  { id:'modals', label:'Modal Verbs', rule:"Modals (can, could, should, must, may) are followed by the base form of the verb, with no 'to' and no -s.", examples:["She can swim.","You should study.","He must leave now."] }
];

function renderGrammarRef(body){
  let activeId = GRAMMAR_TOPICS[0].id;
  function draw(){
    body.innerHTML = `
      <div class="gr-topics">
        ${GRAMMAR_TOPICS.map(g=>`<button class="gr-topic-btn ${g.id===activeId?'active':''}" data-id="${g.id}">${g.label}</button>`).join('')}
      </div>
      <div class="gr-card"><h4></h4><p id="gr-rule"></p><p style="margin-top:8px"><strong data-i18n="gr_examples">${t('gr_examples')}:</strong></p><p id="gr-examples"></p></div>
    `;
    const topic = GRAMMAR_TOPICS.find(g=>g.id===activeId);
    body.querySelector('.gr-card h4').textContent = topic.label;
    body.querySelector('#gr-rule').textContent = topic.rule;
    body.querySelector('#gr-examples').innerHTML = topic.examples.map(e=>`• ${e}`).join('<br>');
    body.querySelectorAll('.gr-topic-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{ activeId = btn.dataset.id; draw(); track('grammar', btn.dataset.id); });
    });
  }
  draw();
  return null;
}


/* ---------------- Theme drawer ---------------- */
const PRESETS = [
  { id:'dusk',  css:'linear-gradient(180deg,#1a2740 0%, #2c3b57 38%, #3f4f68 62%, #263248 100%)' },
  { id:'chalk', css:'linear-gradient(180deg,#2b2f26 0%, #3a4032 60%, #23261e 100%)' },
  { id:'ocean', css:'linear-gradient(180deg,#0e2f3f 0%, #164a5c 55%, #0c2733 100%)' },
  { id:'sunrise', css:'linear-gradient(180deg,#3a2140 0%, #7a4a55 45%, #c98a5e 100%)' },
  { id:'slate', css:'linear-gradient(180deg,#20242c 0%, #2b3038 100%)' },
  { id:'plain', css:'#12161C' }
];
const presetBg = p => (typeof DeckMode !== 'undefined') ? DeckMode.background(p.id, p.css) : p.css;   // Light mode: the same preset, pale (js/mode.js)

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
  const p = PRESETS.find(p=>p.id===state.theme) || PRESETS[0];
  bgLayer.style.background = presetBg(p);
  bgLayer.style.backgroundSize = 'cover';
}

function applyTheme(){
  if(sessionBgUrl){
    bgLayer.style.background = `center/cover no-repeat url(${sessionBgUrl})`;
  } else if(state.customBg){
    // custom image is applied async from IDB (see initCustomBg)
  } else {
    paintPreset();
  }
  bgOverlay.classList.toggle('no-dim', !state.dim);
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

function buildPresetSwatches(){
  const grid = document.getElementById('theme-presets');
  grid.innerHTML = '';
  PRESETS.forEach(p=>{
    const sw = document.createElement('div');
    sw.className = 'swatch' + ((!state.customBg && !sessionBgUrl && state.theme===p.id) ? ' active' : '');
    sw.style.background = presetBg(p);
    sw.title = p.id;
    sw.addEventListener('click', ()=>{
      state.theme = p.id; state.customBg = false;
      if(sessionBgUrl){ URL.revokeObjectURL(sessionBgUrl); sessionBgUrl = null; }
      saveState(); applyTheme(); buildPresetSwatches();
    });
    grid.appendChild(sw);
  });
}

document.querySelector('label[for="bg-upload"]').addEventListener('click', e=>{
  if(!isPro()){ e.preventDefault(); openProModal('bg'); }
});
document.getElementById('bg-upload').addEventListener('change', async e=>{
  const file = e.target.files[0];
  e.target.value = '';   // lets the same file be picked again later
  if(!file) return;
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
    state.theme = th.preset; state.customBg = false;
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
function fmtPrice(){
  const m = PRO_PRICING_VND.monthly.toLocaleString('vi-VN'), y = PRO_PRICING_VND.annual.toLocaleString('vi-VN');
  return state.lang === 'vi' ? `${m}₫/tháng hoặc ${y}₫/năm` : `${m}₫/month or ${y}₫/year`;
}
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
    upgradeBtn.hidden = false;
  }
}

function buildVietQRPanel(){
  const box = document.getElementById('vietqr-qr-box');
  const details = document.getElementById('vietqr-account-details');
  document.getElementById('vietqr-copy').textContent = t('vietqr_instructions', { price: fmtPrice() });
  if(!HSBC_ACCOUNT_NUMBER){
    box.innerHTML = `<div class="qr-missing">${t('vietqr_not_configured')}</div>`;
    if(details) details.innerHTML = '';
    return;
  }
  const addInfo = encodeURIComponent('TeachersDeck Pro');
  const acctName = encodeURIComponent(HSBC_ACCOUNT_NAME || '');
  const url = `https://img.vietqr.io/image/${HSBC_VIETQR_BIN}-${HSBC_ACCOUNT_NUMBER}-compact2.png?amount=${PRO_PRICING_VND.annual}&addInfo=${addInfo}&accountName=${acctName}`;
  box.innerHTML = `<img src="${url}" alt="VietQR payment code">`;
  if(details){
    details.innerHTML = `
      <div class="vietqr-acct-line vietqr-acct-name">${escHtml(HSBC_ACCOUNT_NAME)}</div>
      <div class="vietqr-acct-line vietqr-acct-number">${escHtml(HSBC_ACCOUNT_NUMBER_DISPLAY)}</div>
      <div class="vietqr-acct-line">${escHtml(HSBC_BANK_NAME)}</div>
      <div class="vietqr-acct-line">${t('vietqr_swift_label')}: ${escHtml(HSBC_SWIFT_CODE)}</div>
      <div class="vietqr-acct-line vietqr-acct-address">${escHtml(HSBC_BRANCH_ADDRESS)}</div>
    `;
  }
}
function buildCardPanel(){
  document.getElementById('card-copy').textContent = t('card_instructions', { price: fmtPrice() });
  const link = document.getElementById('pay-card-link');
  if(!STRIPE_PAYMENT_LINK){
    link.removeAttribute('href');
    link.textContent = t('card_not_configured');
    link.style.opacity = .6; link.style.pointerEvents = 'none';
  } else {
    link.href = STRIPE_PAYMENT_LINK;
    link.textContent = t('pay_card_btn', { label: CARD_PROCESSOR_LABEL });
    link.style.opacity = 1; link.style.pointerEvents = 'auto';
  }
}
function buildPayTabs(){
  document.getElementById('pay-tab-card').dataset.key = 'pay_tab_card';
  document.getElementById('pay-tab-card').textContent = t('pay_tab_card', { label: CARD_PROCESSOR_LABEL });
}

const proModalBackdrop = document.getElementById('pro-modal-backdrop');
function showPayStep2(){ document.getElementById('pay-step-2').hidden = false; }
function openProModal(){
  document.getElementById('pay-order-form-link').href = ORDER_FORM_URL;
  document.getElementById('pay-step-2').hidden = true; // re-lock payment until the form is opened
  buildVietQRPanel();
  buildCardPanel();
  buildPayTabs();
  proModalBackdrop.hidden = false;
}
function closeProModal(){ proModalBackdrop.hidden = true; }
document.getElementById('pro-upgrade-open').addEventListener('click', ()=> openProModal());
document.getElementById('pro-modal-close').addEventListener('click', closeProModal);
proModalBackdrop.addEventListener('click', e=>{ if(e.target === proModalBackdrop) closeProModal(); });

document.getElementById('pay-order-form-link').addEventListener('click', ()=>{ showPayStep2(); });
document.getElementById('pay-form-done-link').addEventListener('click', e=>{ e.preventDefault(); showPayStep2(); });

document.getElementById('pay-tab-vietqr').addEventListener('click', ()=>{
  document.getElementById('pay-tab-vietqr').classList.add('active');
  document.getElementById('pay-tab-card').classList.remove('active');
  document.getElementById('pay-panel-vietqr').hidden = false;
  document.getElementById('pay-panel-card').hidden = true;
});
document.getElementById('pay-tab-card').addEventListener('click', ()=>{
  document.getElementById('pay-tab-card').classList.add('active');
  document.getElementById('pay-tab-vietqr').classList.remove('active');
  document.getElementById('pay-panel-card').hidden = false;
  document.getElementById('pay-panel-vietqr').hidden = true;
});

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

/* ---------------- Cloud Class (Firebase sync) ---------------- */
/* ---------------- Student activity hub + Class Activity widget (v0.15.0) ----------------
   Closes the loop on what StudentDeck already writes: students/{id}/homeworkDone and practiceDaily (readable by the
   class's teacher since backend v1.2.0), plus students/{id}.practice (streak, updatedAt) which the roster already
   carries. The hub keeps ONE pair of listeners per student no matter how many widgets are looking (Cloud Class roster
   badges and the Class Activity widget share it) and tears them all down when the last one closes.
   Boundary (spec §4.3): journal TEXT never leaves the student's device and nothing here reads or asks for it.
   practice.* / practiceDaily are self-reported by the student's device — activity information, never a score. */
const ActivityHub = (()=>{
  const data = {}, unsubs = {}, consumers = new Set();
  function emit(){ consumers.forEach(fn=>{ try{ fn(); }catch(e){} }); }
  function setRoster(ids){
    const want = new Set(ids);
    Object.keys(unsubs).forEach(id=>{ if(!want.has(id)){ try{ unsubs[id](); }catch(e){} delete unsubs[id]; delete data[id]; } });
    ids.forEach(id=>{ if(!unsubs[id]) unsubs[id] = TDCloud.subscribeStudentActivity(id, d=>{ data[id] = d; emit(); }); });
  }
  function stopAll(){ Object.keys(unsubs).forEach(id=>{ try{ unsubs[id](); }catch(e){} delete unsubs[id]; }); Object.keys(data).forEach(id=> delete data[id]); }
  function attach(fn){ consumers.add(fn); return ()=>{ consumers.delete(fn); if(!consumers.size) stopAll(); }; }
  return { setRoster, attach, get: id=> data[id] };
})();
const actDayKey = d => new Date(d).toLocaleDateString('en-CA');            // local YYYY-MM-DD — the same keys StudentDeck writes
function tsMs(v){ return v && v.toMillis ? v.toMillis() : (v && v.seconds ? v.seconds*1000 : (typeof v === 'number' ? v : null)); }
const ACT_FIELDS = ['readMin','focus','games','idioms','wordsSaved','cardsReviewed'];
function studentActivity(s){
  const a = ActivityHub.get(s.id) || { homeworkDone:{}, daily:{} };
  const ids = new Set((state.assignments||[]).map(x=> x.id));
  let hwDone = 0; Object.entries(a.homeworkDone).forEach(([id, r])=>{ if(r && r.done === true && ids.has(id)) hwDone++; });   // only assignments that still exist, so a rate can't pass 100%
  const week = {}; ACT_FIELDS.forEach(f=> week[f] = 0);
  for(let i=0;i<7;i++){ const r = a.daily[actDayKey(Date.now() - i*864e5)]; if(r) ACT_FIELDS.forEach(f=>{ week[f] += (+r[f] || 0); }); }
  const pr = s.practice || {};
  return { hwDone, hwTotal: ids.size, streak: pr.streak || 0, lastActive: Math.max(tsMs(pr.updatedAt) || 0, tsMs(s.lastActiveAt) || 0) || null, week, doneIds: a.homeworkDone };   // newest of: last practice sync, last join/resume
}
function agoText(ms){
  if(!ms) return t('ca_never');
  const d0 = new Date(); d0.setHours(0,0,0,0); const d1 = new Date(ms); d1.setHours(0,0,0,0);
  const n = Math.round((d0 - d1) / 864e5);
  return n <= 0 ? t('ca_today') : n === 1 ? t('ca_yesterday') : t('ca_days_ago', { n });
}
const isQuiet = ms => !ms || (Date.now() - ms) > 3*864e5;                  // no activity for 3+ days (or never)
const shortWhen = ms => ms ? new Date(ms).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

/* v0.20.0 strings: Student Stats. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  classactivity:   { en:'📊 Student Stats', vi:'📊 Thống kê học sinh' },
  wc_classactivity:{ en:'Full-screen class and per-student stats: XP, level, badges, status, homework.', vi:'Thống kê toàn màn hình cho lớp và từng học sinh: XP, cấp độ, huy hiệu, trạng thái, bài tập.' },
  ss_open:         { en:'Open {name}’s stats', vi:'Mở thống kê của {name}' },
  ss_back:         { en:'← All students', vi:'← Tất cả học sinh' },
  ss_no_xp:        { en:'No XP yet', vi:'Chưa có XP' },
  ss_cls_pts:      { en:'{n} class pts', vi:'{n} điểm lớp' },
  ss_overview_hint:{ en:'Lv and XP are what the student’s own StudentDeck reports; medals shown are milestone and level badges. Select a student for their full dashboard. Quiet students (3+ days) are listed first.', vi:'Cấp độ và XP do StudentDeck của học sinh báo cáo; huy hiệu hiển thị là mốc XP và cấp độ. Chọn một học sinh để xem bảng đầy đủ. Học sinh vắng 3+ ngày được xếp lên đầu.' },
  ss_foot:         { en:'Numbers are what each student’s StudentDeck reports — a guide, not a grade. Journal text and mood are never read.', vi:'Số liệu do StudentDeck của từng học sinh báo cáo — chỉ để tham khảo, không phải điểm số. Nhật ký và tâm trạng không bao giờ được đọc.' },
  ss_tile_xp:      { en:'XP earned', vi:'XP kiếm được' },
  ss_tile_hw:      { en:'Homework done', vi:'Bài tập đã xong' },
  ss_tile_read:    { en:'Reading', vi:'Đọc sách' },
  ss_games_val:    { en:'{s} started · {f} finished', vi:'{s} bắt đầu · {f} hoàn thành' },
  ss_tile_time:    { en:'Active time', vi:'Thời gian hoạt động' },
  ss_tile_cls:     { en:'Class points', vi:'Điểm lớp' },
  ss_tile_badges:  { en:'Badges', vi:'Huy hiệu' },
  ss_none:         { en:'No data yet', vi:'Chưa có dữ liệu' },
  ss_st_good:      { en:'On track', vi:'Đúng hướng' },
  ss_st_watch:     { en:'Needs monitoring', vi:'Cần theo dõi' },
  ss_st_off:       { en:'Off track', vi:'Chưa theo kịp' },
  ss_st_none:      { en:'No data yet', vi:'Chưa có dữ liệu' },
  stl_good:        { en:'On track', vi:'Đạt' },
  stl_watch:       { en:'Monitor', vi:'Theo dõi' },
  stl_bad:         { en:'Needs attention', vi:'Cần chú ý' },
  stl_how:         { en:'How are these colours worked out?', vi:'Màu sắc được tính như thế nào?' },
  stl_rule_days:   { en:'Active days this week: {g}+ is on track, {w}–{g} is worth monitoring, below {w} needs attention.', vi:'Số ngày hoạt động tuần này: từ {g} trở lên là đạt, {w}–{g} cần theo dõi, dưới {w} cần chú ý.' },
  stl_rule_share:  { en:'Share of a total (e.g. badges): {g}%+ is on track, {w}–{g}% is worth monitoring, below {w}% needs attention.', vi:'Tỷ lệ trên tổng (vd: huy hiệu): từ {g}% trở lên là đạt, {w}–{g}% cần theo dõi, dưới {w}% cần chú ý.' },
  stl_rule_trend:  { en:'Everything else (XP, activities, reading, time…) is judged against the period right before it of the same length: flat or up is on track, down to 10% is worth monitoring, down more than that needs attention.', vi:'Các chỉ số khác (XP, hoạt động, đọc sách, thời gian…) được so với cùng khoảng thời gian liền trước: giữ nguyên hoặc tăng là đạt, giảm đến 10% cần theo dõi, giảm hơn thế cần chú ý.' },
  ss_title_good:   { en:'{name} is on track', vi:'{name} đang đi đúng hướng' },
  ss_title_watch:  { en:'{name} needs monitoring', vi:'{name} cần được theo dõi' },
  ss_title_off:    { en:'{name} is off track', vi:'{name} đang chưa theo kịp' },
  ss_title_none:   { en:'Not enough data yet', vi:'Chưa đủ dữ liệu' },
  ss_sub_good:     { en:'Everything looks good over the past week or two.', vi:'Mọi thứ đều ổn trong một đến hai tuần qua.' },
  ss_sub_attn:     { en:'Worth a look: {list}', vi:'Cần chú ý: {list}' },
  ss_sub_none:     { en:'A status appears once {name}’s activity has synced.', vi:'Trạng thái sẽ hiển thị khi hoạt động của {name} được đồng bộ.' },
  ss_m_homework:   { en:'Homework', vi:'Bài tập' },
  ss_m_reading:    { en:'Reading', vi:'Đọc sách' },
  ss_m_practice:   { en:'Daily practice', vi:'Luyện tập hằng ngày' },
  ss_m_behaviour:  { en:'Behaviour', vi:'Hành vi' },
  ss_hw_val:       { en:'{done} of {total} marked done · last 4 weeks', vi:'{done}/{total} bài đã đánh dấu xong · 4 tuần qua' },
  ss_hw_none:      { en:'No homework due lately', vi:'Gần đây không có bài tập đến hạn' },
  ss_hw_hint:      { en:'{n} past due, not marked', vi:'{n} bài quá hạn, chưa đánh dấu' },
  ss_read_val:     { en:'{n} min in the last 7 days', vi:'{n} phút trong 7 ngày qua' },
  ss_read_hint:    { en:'Goal: {g} min a week', vi:'Mục tiêu: {g} phút mỗi tuần' },
  ss_prac_val:     { en:'Active {n} of the last 7 days', vi:'Hoạt động {n}/7 ngày qua' },
  ss_prac_hint:    { en:'Goal: {g}+ days a week', vi:'Mục tiêu: từ {g} ngày mỗi tuần' },
  ss_beh_good:     { en:'No notes of concern', vi:'Không có ghi chú cần lưu ý' },
  ss_beh_one:      { en:'1 note of concern or point deduction in the last 2 weeks', vi:'1 ghi chú cần lưu ý hoặc lần trừ điểm trong 2 tuần qua' },
  ss_beh_many:     { en:'{n} notes of concern or point deductions in the last 2 weeks', vi:'{n} ghi chú cần lưu ý hoặc lần trừ điểm trong 2 tuần qua' },
  ss_how:          { en:'How is this worked out?', vi:'Cách tính?' },
  ss_rule_hw:      { en:'Homework: on track at {g}%+ marked done, off track below {w}% (last 4 weeks). “Not marked” is not the same as “not done”.', vi:'Bài tập: đúng hướng khi đánh dấu xong từ {g}%, chưa theo kịp khi dưới {w}% (4 tuần qua). “Chưa đánh dấu” không có nghĩa là “chưa làm”.' },
  ss_rule_read:    { en:'Reading: on track at {g}+ minutes a week, off track below {w}.', vi:'Đọc sách: đúng hướng khi từ {g} phút mỗi tuần, chưa theo kịp khi dưới {w}.' },
  ss_rule_prac:    { en:'Daily practice: on track at {g}+ active days a week, off track below {w}.', vi:'Luyện tập: đúng hướng khi hoạt động từ {g} ngày mỗi tuần, chưa theo kịp khi dưới {w} ngày.' },
  ss_rule_beh:     { en:'Behaviour: on track with no notes of concern or point deductions in 2 weeks, needs monitoring with 1, off track with 2 or more. Same rules as ParentDeck’s Student Summary.', vi:'Hành vi: đúng hướng khi không có ghi chú cần lưu ý hay lần trừ điểm trong 2 tuần, cần theo dõi khi có 1, chưa theo kịp khi có từ 2. Cùng quy tắc với Tóm tắt học sinh của ParentDeck.' },
  ss_rule_all:     { en:'Overall: off track when two or more areas are off track; needs monitoring when one is off track or two need monitoring.', vi:'Tổng thể: chưa theo kịp khi có từ hai mục chưa theo kịp; cần theo dõi khi có một mục chưa theo kịp hoặc hai mục cần theo dõi.' },
  ss_nodata:       { en:'{name}’s StudentDeck hasn’t synced any activity yet.', vi:'StudentDeck của {name} chưa đồng bộ hoạt động nào.' },
  ss_ring_tip:     { en:'Level {n} · {p}% of the way to level {m}', vi:'Cấp {n} · đã đi {p}% tới cấp {m}' },
  ss_lv_progress:  { en:'{into} / {need} XP to level {next} · {total} XP total', vi:'{into} / {need} XP để lên cấp {next} · tổng {total} XP' },
  ss_day_one:      { en:'{n} day', vi:'{n} ngày' },
  ss_days_n:       { en:'{n} days', vi:'{n} ngày' },
  ss_streak:       { en:'streak', vi:'chuỗi ngày' },
  ss_bonus:        { en:'×{m} XP bonus', vi:'thưởng ×{m} XP' },
  ss_best_streak:  { en:'Best streak in synced history: {n} days', vi:'Chuỗi dài nhất trong lịch sử đã đồng bộ: {n} ngày' },
  ss_h_xpsrc:      { en:'XP by source', vi:'XP theo nguồn' },
  ss_h_time:       { en:'Time in each widget', vi:'Thời gian trong từng widget' },
  ss_h_xp7:        { en:'XP last 7 days', vi:'XP 7 ngày qua' },
  ss_h_games:      { en:'Game scores', vi:'Điểm trò chơi' },
  ss_h_recent:     { en:'Recent XP', vi:'XP gần đây' },
  ss_h_hw:         { en:'Homework', vi:'Bài tập' },
  ss_h_badges:     { en:'Badges', vi:'Huy hiệu' },
  ss_best:         { en:'best {n}', vi:'cao nhất {n}' },
  ss_needs_update: { en:'Appears once this student’s StudentDeck is updated.', vi:'Sẽ hiển thị khi StudentDeck của học sinh này được cập nhật.' },
  ss_badge_n:      { en:'{n} of {total} badges unlocked.', vi:'Đã mở {n}/{total} huy hiệu.' },
  ss_view_case:    { en:'View badge case →', vi:'Xem tủ huy hiệu →' },
  ss_badge_note:   { en:'StudentDeck doesn’t sync badges, so these are worked out with its own rules from the synced stats: XP total and level are exact; streaks, big days, variety, skills and habits use the last 200 days of synced activity, so an older achievement can be missing.', vi:'StudentDeck không đồng bộ huy hiệu, nên các huy hiệu này được tính bằng chính quy tắc của nó từ số liệu đã đồng bộ: tổng XP và cấp độ là chính xác; chuỗi ngày, ngày nổi bật, đa dạng, kỹ năng và thói quen dùng 200 ngày hoạt động gần nhất, nên thành tích cũ hơn có thể bị thiếu.' },
  ss_bg_xp:        { en:'Milestones', vi:'Mốc XP' },
  ss_bg_level:     { en:'Levels', vi:'Cấp độ' },
  ss_bg_streak:    { en:'Streaks', vi:'Chuỗi ngày' },
  ss_bg_day:       { en:'Big days', vi:'Ngày nổi bật' },
  ss_bg_mix:       { en:'Variety', vi:'Đa dạng' },
  ss_bg_skill:     { en:'Skills', vi:'Kỹ năng' },
  ss_bg_habit:     { en:'Habits', vi:'Thói quen' }
});

/* ---------------- Student Stats (v0.20.0) — the full-screen successor to Class Activity ----------------
   Overview: the class at a glance (animated tiles) and one card per student — level, XP (only once they have earned some), streak, homework,
   last active, status, and their top medals. Click a student for their dashboard: ParentDeck's status card (homework / reading / daily practice /
   behaviour) and the same stats ParentDeck reads — level ring, XP bar, streak, six range tiles, XP by source, time in each widget, XP last 7 days,
   game scores, recent XP — plus badges and homework. Animated the way StudentDeck's Stats & XP is (the sx-* motion in style.css).
   Boundaries: practice.* / practiceDaily are SELF-REPORTED by the student's device — a guide, never a grade. No journal text and no mood word is read.
   Badges are NOT synced by StudentDeck, so they are WORKED OUT here with StudentDeck's own rules from the synced stats (XP total and level are exact;
   streaks, big days, variety, skills and habits come from the last 200 days of synced activity, so an old achievement can be missing). */
const SS_BADGES = [
  ...[[50, '🌱', 'First sparks', 1], [100, '💯', 'Century', 1], [250, '⭐', 'Rising star', 1], [500, '🌟', 'Shining bright', 2], [1000, '🏆', 'Thousand club', 2], [2500, '👑', 'XP champion', 3], [5000, '💎', 'XP legend', 4]]
    .map(([n, icon, name, tier]) => ({ id:'xp_' + n, group:'xp', tier, icon, name, desc:`Earn ${n.toLocaleString()} XP in total`, need:n, val:c => c.total })),
  ...[[3, '🚀', 'Lift-off', 1], [5, '🎯', 'On target', 1], [8, '🎓', 'Scholar', 2], [10, '🔟', 'Double digits', 3], [15, '🧠', 'Brainiac', 3], [20, '🧙', 'Grand master', 4]]
    .map(([n, icon, name, tier]) => ({ id:'lv_' + n, group:'level', tier, icon, name, desc:`Reach level ${n}`, need:n, val:c => c.level })),
  ...[[3, '🔥', 'On a roll', 1], [7, '🗓️', 'Week warrior', 2], [14, '🌠', 'Fortnight focus', 2], [30, '🌙', 'Month master', 3], [100, '🌋', 'Unstoppable', 4]]
    .map(([n, icon, name, tier]) => ({ id:'st_' + n, group:'streak', tier, icon, name, desc:`Keep a ${n}-day streak`, need:n, val:c => c.bestStreak })),
  ...[[50, '☀️', 'Good day', 1], [100, '⚡', 'Power day', 2], [150, '🌋', 'Maximum effort', 3]]
    .map(([n, icon, name, tier]) => ({ id:'day_' + n, group:'day', tier, icon, name, desc:`Earn ${n} XP in a single day`, need:n, val:c => c.bestDay })),
  { id:'mix_4', group:'mix', tier:2, icon:'🧩', name:'All-rounder', desc:'Earn XP from 4 different things in one day', need:4, val:c => c.maxSources },
  { id:'mix_7', group:'mix', tier:3, icon:'🌈', name:'Whole toolbox', desc:'Earn XP from 7 different things in one day', need:7, val:c => c.maxSources },
  ...[['reading', '🐛', 'Bookworm', 150, 2, 'reading'], ['focus', '🔭', 'Laser focus', 150, 2, 'focus time'], ['todo', '🦸', 'Homework hero', 60, 2, 'homework'], ['game', '🎮', 'Game on', 120, 2, 'games'], ['idiom', '🗣️', 'Idiom ace', 25, 1, 'idioms'],
     ['words', '🔤', 'Word collector', 40, 1, 'saving words'], ['cards', '🃏', 'Card shark', 60, 2, 'flashcards'], ['journal', '📔', 'Dear diary', 30, 1, 'the journal'], ['notes', '🗒️', 'Note taker', 45, 1, 'the notepad'], ['docs', '📄', 'Document diver', 40, 1, 'open documents']]
    .map(([src, icon, name, n, tier, what]) => ({ id:'sk_' + src, group:'skill', tier, icon, name, desc:`Earn ${n} XP from ${what}`, need:n, val:c => c.by[src] || 0 })),
  ...[[7, '🌿', 'First week', 1], [30, '📅', 'Month of learning', 2], [100, '🏛️', '100 days', 3]]
    .map(([n, icon, name, tier]) => ({ id:'hab_' + n, group:'habit', tier, icon, name, desc:`Be active on ${n} different days`, need:n, val:c => c.activeDays }))
];
const SS_GROUPS = ['xp', 'level', 'streak', 'day', 'mix', 'skill', 'habit'];
const SS_L = {
  xs: { en:{ focus:'Focus', todo:'Homework', reading:'Reading', game:'Games', idiom:'Idioms', journal:'Journal', daily:'Daily visit', words:'Saving words', cards:'Flashcards', notes:'Notepad', docs:'Open documents' },
        vi:{ focus:'Tập trung', todo:'Bài tập', reading:'Đọc sách', game:'Trò chơi', idiom:'Thành ngữ', journal:'Nhật ký', daily:'Ghé hằng ngày', words:'Lưu từ vựng', cards:'Thẻ ghi nhớ', notes:'Sổ ghi chú', docs:'Tài liệu đã mở' } },
  w:  { en:{ timer:'Focus Timer', todo:'Homework', reading:'Reading Log', games:'Games Hub', idiom:'Idiom of the Day', stats:'Stats & XP', journey:'Journey', class:'Class', translate:'Translate', dict:'Dictionary', cards:'Flashcards', notes:'Notepad', files:'Files', docs:'Open documents' },
        vi:{ timer:'Đồng hồ tập trung', todo:'Bài tập', reading:'Nhật ký đọc', games:'Trò chơi', idiom:'Thành ngữ hằng ngày', stats:'Thống kê & XP', journey:'Hành trình', class:'Lớp học', translate:'Dịch', dict:'Từ điển', cards:'Thẻ ghi nhớ', notes:'Sổ ghi chú', files:'Tệp', docs:'Tài liệu đã mở' } }
};
const ssLabel = (g, k) => ((SS_L[g][state.lang === 'vi' ? 'vi' : 'en'] || {})[k]) || k;
const SS_RULES = { hwGood:80, hwWatch:50, readGood:70, readWatch:30, daysGood:4, daysWatch:2, behWatch:1, behOff:2, behDays:14 };   // the same thresholds as ParentDeck's STATUS_RULES
const SS_ICON = { good:'✅', watch:'👀', off:'⚠️', none:'⏳' };
// Same stoplight formula/colours as AdminDeck's School Stats and ParentDeck's Student Summary — for "My Stats & XP"'s tile grid.
// Same kinds as AdminDeck's School Stats (admindeck/js/schoolstats.js STOPLIGHT): 'days'/'share' judge an absolute number
// against a target; 'trend' (used for every raw-count tile — XP, activities, reading, etc.) judges % change vs the
// immediately-preceding period of equal length, exactly like AdminDeck's Homework/Reading/Focus/Active-time tiles —
// there's no universal "good" XP total, but "up from last time" vs "down" always means something.
const STOPLIGHT = { days:{ good:SS_RULES.daysGood, watch:SS_RULES.daysWatch, dir:'up' }, share:{ good:70, watch:40, dir:'up' }, trend:{ good:0, watch:-10, dir:'up' } };
function stoplight(kind, v){ const r = STOPLIGHT[kind]; if(!r || v == null) return null;
  const up = r.dir !== 'down';
  if(up ? v >= r.good : v <= r.good) return 'good'; if(up ? v >= r.watch : v <= r.watch) return 'watch'; return 'bad'; }
const stPct = (cur, prev) => (prev > 0 ? Math.round((cur - prev) / prev * 100) : null);   // same formula as AdminDeck's pct()
// The colour key above any stoplight-tiled grid, same shape as AdminDeck's School Stats legend.
function stoplightLegendHtml(){
  return `<div class="ss-stlegend">${['good', 'watch', 'bad'].map(k => `<span class="ss-st ss-stkey" data-st="${k}">${t('stl_' + k)}</span>`).join('')}
    <details><summary>${t('stl_how')}</summary><p>${t('stl_rule_days', { g:STOPLIGHT.days.good, w:STOPLIGHT.days.watch })}</p><p>${t('stl_rule_share', { g:STOPLIGHT.share.good, w:STOPLIGHT.share.watch })}</p><p>${t('stl_rule_trend')}</p></details></div>`;
}
const ssNum = n => Math.round(+n || 0).toLocaleString();
const ssShift = (k, n) => { const d = new Date(k + 'T12:00'); d.setDate(d.getDate() + n); return actDayKey(d); };
const ssActive = r => !!(r && ((r.xp || 0) > 0 || (r.readMin || 0) > 0 || (r.readEntries || 0) > 0 || (r.focus || 0) > 0 || (r.hw || 0) > 0 || (r.games || 0) > 0 || (r.idioms || 0) > 0));
const ssMult = n => n >= 2 ? Math.min(1.5, 1 + 0.1 * (n - 1)) : 1;
function ssStreak(P, daily){            // the synced streak is only as of the student's last visit: lapsed when their newest active day is older than yesterday
  const yest = ssShift(actDayKey(Date.now()), -1), days = Object.keys(daily).filter(k => ssActive(daily[k])).sort(), newest = days[days.length - 1] || '';
  const current = newest >= yest ? (P.streak || 0) : 0; let best = 0, run = 0, prev = null;
  days.forEach(k => { run = prev && ssShift(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  return { current, best:Math.max(best, current) };
}
function ssBadgeCtx(s, daily){
  const P = s.practice || {}, total = ssTotal(s, daily), ctx = { total, level:levelInfo(total).level, bestStreak:ssStreak(P, daily).best, bestDay:0, maxSources:0, activeDays:0, by:{} };
  Object.values(daily).forEach(r => {
    if((r.xp || 0) > 0) ctx.activeDays++;
    ctx.bestDay = Math.max(ctx.bestDay, r.xp || 0);
    let kinds = 0; Object.entries(r.xpBy || {}).forEach(([k, n]) => { ctx.by[k] = (ctx.by[k] || 0) + n; if(k !== 'daily' && n > 0) kinds++; });
    ctx.maxSources = Math.max(ctx.maxSources, kinds);
  });
  return ctx;
}
function ssTotal(s, daily){             // StudentDeck's synced XP total; an older StudentDeck doesn't send one, so fall back to the XP in the synced days
  const v = s.practice && s.practice.xpTotal; return typeof v === 'number' ? v : Object.values(daily || {}).reduce((a, r) => a + ((r && r.xp) || 0), 0);
}
function ssTopMedals(s, total){         // for the cards: only the two groups that are exact from synced data (XP total, level)
  const c = { total, level:levelInfo(total).level };
  return SS_BADGES.filter(b => (b.group === 'xp' || b.group === 'level') && b.val(c) >= b.need).sort((a, b) => b.tier - a.tier || b.need - a.need).slice(0, 4);
}
function ssStatus(s, act, notes, ledger){   // ParentDeck's Student Summary status, from what TeachersDeck can read
  const R = SS_RULES, daily = act.daily || {}, today = actDayKey(Date.now()), from = ssShift(today, -27), lvl = (v, g, w) => v >= g ? 'good' : v >= w ? 'watch' : 'off';
  const hasPractice = Object.keys(daily).length > 0 || ssTotal(s, daily) > 0, items = [];
  const rows = (state.assignments || []).filter(x => x.dueDate && x.dueDate >= from && x.dueDate <= today).map(x => ({ x, done:!!(act.homeworkDone[x.id] && act.homeworkDone[x.id].done) })).filter(r => r.x.dueDate < today || r.done);
  const done = rows.filter(r => r.done).length, open = rows.length - done;
  if(!rows.length) items.push({ key:'homework', level:'none', value:t('ss_hw_none') });
  else{ const pct = Math.round(done / rows.length * 100), level = lvl(pct, R.hwGood, R.hwWatch); items.push({ key:'homework', level, value:t('ss_hw_val', { done, total:rows.length }), hint:open && level !== 'good' ? t('ss_hw_hint', { n:open }) : '' }); }
  const keys7 = Array.from({ length:7 }, (_, i) => ssShift(today, -i)), readMin = keys7.reduce((a, k) => a + ((daily[k] && daily[k].readMin) || 0), 0), activeDays = keys7.filter(k => ssActive(daily[k])).length;
  items.push(hasPractice ? { key:'reading', level:lvl(readMin, R.readGood, R.readWatch), value:t('ss_read_val', { n:readMin }), hint:t('ss_read_hint', { g:R.readGood }) } : { key:'reading', level:'none', value:t('ss_none') });
  items.push(hasPractice ? { key:'practice', level:lvl(activeDays, R.daysGood, R.daysWatch), value:t('ss_prac_val', { n:activeDays }), hint:t('ss_prac_hint', { g:R.daysGood }) } : { key:'practice', level:'none', value:t('ss_none') });
  const since = Date.now() - R.behDays * 864e5;
  const concerns = (notes || []).filter(n => n.studentId === s.id && n.mood === 'frowny' && (tsMs(n.createdAt) || 0) >= since);
  const dem = (ledger || []).filter(e => e.studentId === s.id && (+e.delta || 0) < 0 && e.awardedBy !== 'self-redemption' && (tsMs(e.createdAt) || 0) >= since).length, nBeh = concerns.length + dem;
  items.push({ key:'behaviour', level:nBeh >= R.behOff ? 'off' : nBeh >= R.behWatch ? 'watch' : 'good', value:nBeh ? t(nBeh === 1 ? 'ss_beh_one' : 'ss_beh_many', { n:nBeh }) : t('ss_beh_good') });
  const known = items.filter(i => i.level !== 'none'), off = known.filter(i => i.level === 'off').length, watch = known.filter(i => i.level === 'watch').length;
  const overall = known.length < 2 ? 'none' : off >= 2 ? 'off' : (off === 1 || watch >= 2) ? 'watch' : 'good';
  return { items, overall, attention:known.filter(i => i.level !== 'good').map(i => t('ss_m_' + i.key)) };
}
function ssCountUp(el, delay = 0){       // 0 -> its own number, easing out (the same helper StudentDeck uses); text after the number stays put
  if(!el || sxStill()) return;
  const raw = el.dataset.raw || (el.dataset.raw = el.textContent), m = /^(\d[\d,]*(?:\.\d+)?)([\s\S]*)$/.exec(raw); if(!m) return;
  const end = +m[1].replace(/,/g, ''); if(!end) return;
  const t0 = performance.now() + delay, dur = 750; cancelAnimationFrame(el._raf);
  const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(end * e).toLocaleString() + m[2]; if(k < 1) el._raf = requestAnimationFrame(step); else el.textContent = raw; };
  el.textContent = '0' + m[2]; el._raf = requestAnimationFrame(step);
}

function renderStudentStats(body){
  let roster = [], ledger = [], notes = [], firstLedger = true, sel = null, detail = null, oRange = 'week', dRange = 'week', fx = true, lastSig = '', tm = 0;
  const seen = new Set(), unsubs = []; let detailUnsub = null;
  const esc = escHtml, chip = (attr, val, label, on) => `<button type="button" class="sx-chip${on ? ' on' : ''}" data-${attr}="${val}">${label}</button>`;
  const stopDetail = () => { if(detailUnsub){ try{ detailUnsub(); }catch(e){} detailUnsub = null; } detail = null; };
  function stopSubs(){ unsubs.forEach(u => { try{ u(); }catch(e){} }); unsubs.length = 0; stopDetail(); if(tm){ clearTimeout(tm); tm = 0; } }
  const nameOf = id => { const s = roster.find(x => x.id === id); return s ? s.displayName : t('ca_someone'); };
  const bars = rows => { const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map((r, n) => `<div class="sx-bar" style="--n:${n}"><span title="${esc(r.l)}">${esc(r.l)}</span><div><i style="width:${Math.round(r.v / mx * 100)}%"></i></div><b>${esc(r.t)}</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`; };
  const card = (title, html, cls, i) => `<section class="sx-card ${cls || ''}" style="--i:${i}"><h4>${title}</h4>${html}</section>`;
  const statusChip = o => `<span class="ss-stat st-${o}">${SS_ICON[o]} ${t('ss_st_' + o)}</span>`;
  const medalMini = list => list.map(b => `<span title="${esc(b.name)}">${medalHtml(b, true)}</span>`).join('');
  const rangeKeys = r => { const today = actDayKey(Date.now()); return r === 'today' ? [today] : Array.from({ length:7 }, (_, i) => ssShift(today, -i)); };
  // The equal-length period right before oRange, for the same trend-vs-last-time stoplight AdminDeck's School Stats uses.
  const prevRangeKeys = r => { const today = actDayKey(Date.now()); return r === 'today' ? [ssShift(today, -1)] : Array.from({ length:7 }, (_, i) => ssShift(today, -(7 + i))); };
  const sumRoster = (rows, keys) => { const tot = { xp:0, hw:0 }; ACT_FIELDS.forEach(f => { tot[f] = 0; });
    rows.forEach(r => keys.forEach(k => { const d = r.act.daily[k]; if(d){ ['xp', 'hw'].concat(ACT_FIELDS).forEach(f => { tot[f] += (+d[f] || 0); }); } })); return tot; };

  /* ----- the class ----- */
  function overviewHtml(){
    const keys = rangeKeys(oRange), rows = roster.map(s => ({ s, a:studentActivity(s), act:ActivityHub.get(s.id) || { homeworkDone:{}, daily:{} } }));
    const tot = sumRoster(rows, keys), prevTot = sumRoster(rows, prevRangeKeys(oRange));
    const trendSt = (cur, prevVal) => stoplight('trend', stPct(cur, prevVal));
    const active = rows.filter(r => !isQuiet(r.a.lastActive) && (Date.now() - r.a.lastActive) <= 7 * 864e5).length;
    const activeSt = roster.length ? stoplight('share', Math.round(active / roster.length * 100)) : null;
    const tiles = [[t('ca_active'), `${active}/${roster.length}`, activeSt], [t('ss_tile_xp'), ssNum(tot.xp), trendSt(tot.xp, prevTot.xp)], [t('ss_tile_hw'), ssNum(tot.hw), trendSt(tot.hw, prevTot.hw)], [t('ca_reading'), ssNum(tot.readMin), trendSt(tot.readMin, prevTot.readMin)], [t('ca_focus'), ssNum(tot.focus), trendSt(tot.focus, prevTot.focus)], [t('ca_games'), ssNum(tot.games), trendSt(tot.games, prevTot.games)], [t('ca_idioms'), ssNum(tot.idioms), trendSt(tot.idioms, prevTot.idioms)], [t('ca_words'), ssNum(tot.wordsSaved), trendSt(tot.wordsSaved, prevTot.wordsSaved)], [t('ca_cards'), ssNum(tot.cardsReviewed), trendSt(tot.cardsReviewed, prevTot.cardsReviewed)]];
    const sorted = rows.slice().sort((x, y) => (isQuiet(y.a.lastActive) - isQuiet(x.a.lastActive)) || String(x.s.displayName).localeCompare(String(y.s.displayName)));
    const cards = sorted.map(({ s, a, act }, n) => {
      const P = s.practice || {}, total = ssTotal(s, act.daily), L = levelInfo(total), pct = Math.round(L.into / L.need * 100), st = ssStatus(s, act, notes, ledger), medals = ssTopMedals(s, total), streak = ssStreak(P, act.daily).current;
      return `<button type="button" class="ss-stu${isQuiet(a.lastActive) ? ' quiet' : ''}" data-sid="${esc(s.id)}" style="--n:${n}" aria-label="${esc(t('ss_open', { name:s.displayName || '' }))}">
        <span class="ss-stu-top"><span class="ss-lv"><small>Lv</small><b>${L.level}</b></span><span class="ss-stu-name"><b>${esc(s.displayName || '')}</b>${statusChip(st.overall)}</span></span>
        <span class="ss-stu-xp">${total > 0 ? `<b data-count>${ssNum(total)} XP</b>` : `<span class="muted">${t('ss_no_xp')}</span>`}<span class="muted">🏫 ${t('ss_cls_pts', { n:ssNum(s.xp) })}</span></span>
        ${total > 0 ? `<span class="sx-xpbar ss-minibar"><i style="width:${pct}%"></i></span>` : ''}
        <span class="ss-stu-meta"><span title="${esc(t('cc_act_tip'))}">🔥${streak}</span><span>✅${a.hwDone}/${a.hwTotal}</span><span>📖${a.week.readMin}</span><span class="ca-ago">${esc(agoText(a.lastActive))}</span></span>
        <span class="ss-medals">${medals.length ? medalMini(medals) : ''}</span></button>`;
    }).join('') || `<p class="small-hint">${t('ca_no_students')}</p>`;
    const hw = (state.assignments || []).slice().sort((x, y) => String(x.dueDate || '9999').localeCompare(String(y.dueDate || '9999')));
    const hwRows = hw.map(x => { const done = rows.filter(r => r.act.homeworkDone[x.id] && r.act.homeworkDone[x.id].done === true).length, total = roster.length || 0; return { l:x.title || '—', v:done, t:`${done}/${total}`, max:total }; });
    const hwHtml = hw.length ? hwRows.map((r, n) => `<div class="sx-bar" style="--n:${n}"><span title="${esc(r.l)}">${esc(r.l)}</span><div><i style="width:${r.max ? Math.round(r.v / r.max * 100) : 0}%"></i></div><b>${esc(r.t)}</b></div>`).join('') : `<p class="small-hint">${t('ca_hw_none')}</p>`;
    const feed = ledger.length ? ledger.slice(0, 20).map(e => { const self = e.awardedBy === 'self-redemption', d = +e.delta || 0;
      return `<div class="ca-feedrow${self ? ' redeem' : ''}"><span>${self ? '🎁' : (d >= 0 ? '🙂' : '🙁')}</span><span class="ca-name">${esc(nameOf(e.studentId))} — ${esc(e.reason || '')}</span><b>${d > 0 ? '+' : ''}${d}</b><span class="small-hint">${esc(shortWhen(tsMs(e.createdAt)))}</span></div>`; }).join('') : `<p class="small-hint">${t('ca_feed_none')}</p>`;
    return `<div class="ss-bar"><h3 class="ss-h">${t('ca_this_week')}</h3><div class="sx-range" role="group">${chip('or', 'today', t('stats_today'), oRange === 'today')}${chip('or', 'week', t('stats_week'), oRange === 'week')}</div></div>
      ${stoplightLegendHtml()}
      <div class="sx-tiles">${tiles.map(([l, v, st], n) => `<div class="sx-tile" style="--n:${n}"${st ? ` data-st="${st}"` : ''}><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <h3 class="ss-h ss-h2">${t('ca_students')}</h3><p class="small-hint">${t('ss_overview_hint')}</p><div class="ss-grid">${cards}</div>
      <div class="sx-grid">${card('📚 ' + t('ca_hw_title'), hwHtml, '', 0)}${card('🏅 ' + t('ca_feed_title'), `<div class="ss-feed">${feed}</div>`, '', 1)}</div>
      <p class="small-hint ss-foot">${t('ss_foot')}</p>`;
  }

  /* ----- one student ----- */
  function detailHtml(){
    const s = roster.find(x => x.id === sel); if(!s) return null;
    const act = detail || ActivityHub.get(s.id) || { homeworkDone:{}, daily:{} }, daily = act.daily || {}, P = s.practice || { xpTotal:0, streak:0 }, today = actDayKey(Date.now()), cut = ssShift(today, -6);
    const keys = Object.keys(daily).filter(k => dRange === 'today' ? k === today : dRange === 'week' ? k >= cut : true);
    const T = { xp:0, hw:0, readEntries:0, readMin:0, focus:0, games:0, gamesStarted:0, idioms:0, wordsSaved:0, cardsReviewed:0 }, xpBy = {}, timeBy = {};
    keys.forEach(k => { const r = daily[k]; Object.keys(T).forEach(f => { T[f] += r[f] || 0; }); Object.entries(r.xpBy || {}).forEach(([a, n]) => { xpBy[a] = (xpBy[a] || 0) + n; }); Object.entries(r.timeBy || {}).forEach(([w, n]) => { timeBy[w] = (timeBy[w] || 0) + n; }); });
    const totalT = Object.values(timeBy).reduce((a, c) => a + c, 0), total = ssTotal(s, daily), L = levelInfo(total), pctL = Math.round(L.into / L.need * 100);
    const stk = ssStreak(P, daily), mult = ssMult(stk.current), st = ssStatus(s, act, notes, ledger), ctx = ssBadgeCtx(s, daily);
    const nEarned = SS_BADGES.filter(b => b.val(ctx) >= b.need).length;
    const days7 = [6, 5, 4, 3, 2, 1, 0].map(i => { const k = ssShift(today, -i); return { k, v:(daily[k] || {}).xp || 0 }; }), mx7 = Math.max(1, ...days7.map(d => d.v)), bestI = days7.reduce((b, d, i) => d.v > days7[b].v ? i : b, 0);
    const C = 188.5, none = !Object.keys(daily).length && !total;
    const xpRows = Object.keys(xpBy).map(k => ({ l:ssLabel('xs', k), v:xpBy[k], t:xpBy[k] + ' XP' })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const timeRows = Object.keys(timeBy).map(k => ({ l:ssLabel('w', k), v:timeBy[k], t:fmtDur(timeBy[k]) })).filter(r => r.v).sort((a, c) => c.v - a.v);
    const games = P.gameScores ? Object.values(P.gameScores) : null, recent = (P.recentXp || []).slice(-8).reverse();
    const tiles = [['⭐', t('ss_tile_xp'), ssNum(T.xp)], ['📘', t('ss_tile_hw'), ssNum(T.hw)], ['📖', t('ss_tile_read'), `${ssNum(T.readEntries)} · ${ssNum(T.readMin)} min`], ['🎮', t('ca_games'), t('ss_games_val', { s:T.gamesStarted, f:T.games })],
      ['⏱', t('ca_focus'), ssNum(T.focus)], ['⚡', t('ss_tile_time'), fmtDur(totalT)], ['🗣️', t('ca_idioms'), ssNum(T.idioms)], ['🔤', t('ca_words'), ssNum(T.wordsSaved)], ['🃏', t('ca_cards'), ssNum(T.cardsReviewed)], ['🏫', t('ss_tile_cls'), ssNum(s.xp)], ['🏅', t('ss_tile_badges'), `${nEarned} / ${SS_BADGES.length}`]];
    const stItems = st.items.map(i => `<div class="ss-chk st-${i.level}"><b>${SS_ICON[i.level]} ${t('ss_m_' + i.key)}</b><span>${esc(i.value)}</span>${i.hint ? `<small>${esc(i.hint)}</small>` : ''}</div>`).join('');
    const headline = st.overall === 'none' ? t('ss_title_none') : t('ss_title_' + st.overall, { name:esc(s.displayName || '') });
    const sub = st.overall === 'none' ? t('ss_sub_none', { name:esc(s.displayName || '') }) : st.attention.length ? t('ss_sub_attn', { list:st.attention.join(', ') }) : t('ss_sub_good');
    const R = SS_RULES, how = `<details class="ss-how"><summary>${t('ss_how')}</summary><p>${t('ss_rule_hw', { g:R.hwGood, w:R.hwWatch })}</p><p>${t('ss_rule_read', { g:R.readGood, w:R.readWatch })}</p><p>${t('ss_rule_prac', { g:R.daysGood, w:R.daysWatch })}</p><p>${t('ss_rule_beh')}</p><p>${t('ss_rule_all')}</p></details>`;
    // The full badge gallery lives in the Badges & Rewards widget's own display case (badgeDetailHtml) — this is just a glance + a link there, not a second copy of it.
    const topMedals = ssTopMedals(s, total);
    const badgeSummary = `<p class="small-hint">${t('ss_badge_n', { n:nEarned, total:SS_BADGES.length })}</p>
      ${topMedals.length ? `<span class="ss-medals">${medalMini(topMedals)}</span>` : ''}
      <button type="button" class="wbtn" data-viewcase="${esc(s.id)}">${t('ss_view_case')}</button>`;
    const hwList = (state.assignments || []).slice().sort((x, y) => String(y.dueDate || '').localeCompare(String(x.dueDate || ''))).slice(0, 12).map(x => { const d = act.homeworkDone[x.id] && act.homeworkDone[x.id].done === true; return `<div class="srow"><span>${esc(x.title || '—')}</span><span class="muted">${esc(x.dueDate || '')}</span><b>${d ? '✅' : '·'}</b></div>`; }).join('') || `<p class="small-hint">${t('ca_hw_none')}</p>`;
    const sparkles = `<span class="ss-flame${stk.current ? '' : ' off'}" aria-hidden="true">${stk.current ? '🔥' : '💤'}</span>`;
    return `<div class="ss-bar"><button type="button" class="sx-chip" data-back>${t('ss_back')}</button><h3 class="ss-h">${esc(s.displayName || '')}</h3>${statusChip(st.overall)}
        <div class="sx-range" role="group">${[['today', 'stats_today'], ['week', 'stats_week'], ['all', 'stats_all']].map(([r, key]) => chip('dr', r, t(key), dRange === r)).join('')}</div></div>
      <section class="sx-card ss-status st-${st.overall}" style="--i:0"><h4>${SS_ICON[st.overall]} ${headline}</h4><p class="small-hint">${sub}</p><div class="ss-chks">${stItems}</div>${how}</section>
      ${none ? `<p class="small-hint">${t('ss_nodata', { name:esc(s.displayName || '') })}</p>` : ''}
      <div class="ss-hero" style="--i:1"><div class="ss-ring" title="${esc(t('ss_ring_tip', { n:L.level, p:pctL, m:L.level + 1 }))}"><svg viewBox="0 0 72 72" aria-hidden="true"><circle class="rg-bg" cx="36" cy="36" r="30"/><circle class="rg-fg" cx="36" cy="36" r="30" stroke-dasharray="${(pctL / 100 * C).toFixed(1)} ${C}" transform="rotate(-90 36 36)"/></svg><span class="ss-lv2"><small>Lv</small><b>${L.level}</b></span></div>
        <div class="ss-xpcol"><b class="ss-xptot">${total > 0 ? `<span data-count>${ssNum(total)} XP</span>` : t('ss_no_xp')}</b><div class="sx-xpbar"><i style="width:${pctL}%"></i></div><div class="small-hint">${t('ss_lv_progress', { into:ssNum(L.into), need:ssNum(L.need), next:L.level + 1, total:ssNum(total) })}</div></div>
        <div class="ss-streak">${sparkles}<div><b>${t(stk.current === 1 ? 'ss_day_one' : 'ss_days_n', { n:stk.current })}</b> <span class="muted">${t('ss_streak')}${mult > 1 ? ' · ' + t('ss_bonus', { m:mult.toFixed(1) }) : ''}</span><div class="muted">${t('ss_best_streak', { n:stk.best })}</div></div></div></div>
      <div class="sx-tiles">${tiles.map(([em, l, v], n) => `<div class="sx-tile" style="--n:${n}"><b>${esc(v)}</b><span><em>${em}</em> ${esc(l)}</span></div>`).join('')}</div>
      <div class="sx-grid">
        ${card('⚡ ' + t('ss_h_xpsrc'), bars(xpRows), '', 2)}${card('⏱ ' + t('ss_h_time'), bars(timeRows), '', 3)}
        ${card('📈 ' + t('ss_h_xp7'), `<div class="sx-cols sx-cols-lg">${days7.map((d, n) => `<div class="sx-col${n === bestI && d.v ? ' best' : ''}" style="--n:${n}" title="${d.k}: ${d.v} XP"><em>${d.v || ''}</em><i style="height:${Math.round(d.v / mx7 * 100)}%"></i><span>${new Date(d.k + 'T12:00').toLocaleDateString(state.lang || 'en', { weekday:'narrow' })}<small>${+d.k.slice(8)}</small></span></div>`).join('')}</div>`, '', 4)}
        ${card('🎮 ' + t('ss_h_games'), games ? (games.map(g => `<div class="srow"><span>${esc(g.name || '')}</span><span class="muted">${g.best !== null && g.best !== undefined ? t('ss_best', { n:g.best }) : ''}</span><b>${g.plays || 0}×</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`) : `<p class="small-hint">${t('ss_needs_update')}</p>`, '', 5)}
        ${card('✨ ' + t('ss_h_recent'), recent.map(e => `<div class="srow"><span>${esc(new Date(e.t).toLocaleTimeString(state.lang || 'en', { hour:'2-digit', minute:'2-digit' }))} · ${esc(ssLabel('xs', e.s))}</span><b>+${esc(e.n)}</b></div>`).join('') || `<p class="small-hint">${t('stats_none')}</p>`, '', 6)}
        ${card('📚 ' + t('ss_h_hw'), hwList, '', 7)}
        ${card('🏅 ' + t('ss_h_badges'), badgeSummary, '', 8)}</div>
      <p class="small-hint ss-foot">${t('ss_foot')}</p>`;
  }

  /* ----- drawing (the entrance plays on opening, switching view or range — never on a live update) ----- */
  function paint(){
    const host = body.querySelector('.ss-host'); if(!host) return;
    const html = sel ? detailHtml() : overviewHtml();
    if(html === null){ sel = null; stopDetail(); fx = true; return paint(); }
    const sig = (sel || '') + '|' + oRange + dRange + html;
    if(sig === lastSig && !fx) return;
    lastSig = sig; const keep = body.scrollTop;
    host.classList.toggle('fx-in', fx); host.innerHTML = html;
    if(fx){
      host.querySelectorAll('.sx-tile b, [data-count]').forEach((el, n) => ssCountUp(el, 250 + n * 40));
      const bar = host.querySelector('.ss-hero .sx-xpbar i');
      if(bar && !sxStill()) setTimeout(() => { const r = bar.getBoundingClientRect(), h = host.getBoundingClientRect(); sxBurst(host, r.right - h.left - 4, r.top - h.top + 5, 10); }, 900);
      setTimeout(() => host.classList.remove('fx-in'), 2600); fx = false;
    }
    body.scrollTop = keep;
  }
  function schedule(){ if(!tm) tm = setTimeout(() => { tm = 0; paint(); }, 150); }
  function openStudent(id){ stopDetail(); sel = id; fx = true; paint(); detailUnsub = TDCloud.subscribeStudentActivity(id, d => { detail = d; schedule(); }, 200); }

  function draw(){
    stopSubs(); firstLedger = true; seen.clear(); sel = null; fx = true; lastSig = '';
    if(!TDCloud.isConfigured()){ body.innerHTML = notConfiguredHtml(); return; }
    if(!TDCloud.getSession() || !state.cloudClassId){ body.innerHTML = `<p class="small-hint">${t('ca_need_class')}</p>`; return; }
    body.innerHTML = '<div class="sx-wrap ss-wrap"><div class="ss-host"></div></div>';
    const wrap = body.querySelector('.ss-wrap');
    wrap.addEventListener('click', e => {
      const stu = e.target.closest('[data-sid]'); if(stu){ openStudent(stu.dataset.sid); return; }
      if(e.target.closest('[data-back]')){ stopDetail(); sel = null; fx = true; paint(); return; }
      const o = e.target.closest('[data-or]'); if(o){ oRange = o.dataset.or; fx = true; paint(); return; }
      const d = e.target.closest('[data-dr]'); if(d){ dRange = d.dataset.dr; fx = true; paint(); return; }
      const vc = e.target.closest('[data-viewcase]'); if(vc){ requestBadgeCase(vc.dataset.viewcase); }
    });
    unsubs.push(ActivityHub.attach(schedule));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list => { roster = list; ActivityHub.setRoster(list.map(s => s.id)); schedule(); }));
    unsubs.push(TDCloud.subscribeNotes(state.cloudClassId, (list, err) => { notes = err ? [] : list; schedule(); }));
    unsubs.push(TDCloud.subscribeLedger(state.cloudClassId, rows => {
      ledger = rows;
      rows.forEach(e => {           // A point drop always gets a visible reason (spec §4.4): toast each NEW self-redemption — never the ones already there when this opened.
        if(!seen.has(e.id)){ seen.add(e.id); if(!firstLedger && e.awardedBy === 'self-redemption') toast(t('ca_redeem_toast', { name:nameOf(e.studentId), n:Math.abs(+e.delta || 0), reason:String(e.reason || '').replace(/^Redeemed:\s*/, '') })); }
      });
      firstLedger = false; schedule();
    }));
    paint();
  }
  const unsubAuth = TDCloud.onAuthChanged(draw);
  draw();
  return () => { stopSubs(); unsubAuth(); };
}

function renderCloudClass(body){
  const unsubs = [];
  let cloudClass = null, roster = [];

  function stopSubs(){ unsubs.forEach(u=>{ try{ u(); }catch(e){} }); unsubs.length = 0; }

  function draw(){
    if(!TDCloud.isConfigured()){
      body.innerHTML = notConfiguredHtml();
      return;
    }
    const session = TDCloud.getSession();
    if(!session){
      body.innerHTML = `
        <div class="cc-panel">
          <button class="wbtn primary" id="cc-signin">${t('cc_signin')}</button>
        </div>`;
      body.querySelector('#cc-signin').addEventListener('click', async ()=>{
        try{ await TDCloud.signIn(); draw(); }catch(e){ toastMsg(e.message||String(e)); }
      });
      return;
    }
    if(!state.cloudClassId){
      body.innerHTML = `
        <div class="cc-panel">
          <p>${t('cc_signed_in_as', { name: session.displayName || session.email })}</p>
          <div class="btn-row">
            <input type="text" id="cc-new-name" placeholder="${t('cc_class_name_ph')}" value="${escHtml(activeClass().name||'')}">
            <button class="wbtn primary" id="cc-create">${t('cc_create_class')}</button>
          </div>
          <p class="small-hint" id="cc-pick-label">${t('cc_or_pick')}</p>
          <div class="scroll-list" id="cc-pick-list"></div>
          <div class="btn-row"><button class="wbtn" id="cc-signout">${t('cc_sign_out')}</button></div>
        </div>`;
      body.querySelector('#cc-create').addEventListener('click', async ()=>{
        const name = body.querySelector('#cc-new-name').value.trim() || 'My Class';
        try{
          const res = await TDCloud.createClass(name);
          state.cloudClassId = res.classId;
          TDCloud.resetCalendarSyncCache();
          saveState();
          draw();
        }catch(e){ toastMsg(e.message||String(e)); }
      });
      body.querySelector('#cc-signout').addEventListener('click', ()=>{ TDCloud.signOut(); draw(); });
      TDCloud.myClasses().then(list=>{
        const listEl = body.querySelector('#cc-pick-list');
        if(!listEl) return;
        if(!list.length){ listEl.innerHTML = `<p class="small-hint">—</p>`; return; }
        listEl.innerHTML = list.map(c=>`<button class="wbtn cc-pick" data-id="${c.id}">${escHtml(c.className)}</button>`).join('');
        listEl.querySelectorAll('.cc-pick').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            state.cloudClassId = btn.dataset.id;
            TDCloud.resetCalendarSyncCache();
            saveState();
            draw();
          });
        });
      });
      return;
    }

    // A class is linked: class header + shortcuts, join codes, the roster (where points are awarded), and a collapsed settings section.
    // (The rewards catalog moved to the Reward Points widget in v0.21.0.)
    body.innerHTML = `
      <div class="cc-panel cc-linked">
        <div class="cc-head"><b id="cc-class-name"></b></div>
        <div class="cc-links">${['rewardpoints', 'classactivity', 'noteshome', 'classbuilder'].map(id=> `<button type="button" class="wbtn" data-open="${id}">${escHtml(widgetLabel(id))}</button>`).join('')}</div>
        <div class="cc-codes" id="cc-codes"></div>
        <details class="cc-adminnotes" id="cc-adminnotes" hidden><summary>📬 <span id="cc-an-label">${t('an_title')}</span></summary><div id="cc-an-list"></div></details>
        <div class="cc-rost-head">
          <p class="field-label" id="cc-roster-label">${t('cc_roster', {n:0})}</p>
          <button class="wbtn" id="cc-sync-names">${t('cc_sync_names')}</button>
        </div>
        <div class="scroll-list" id="cc-roster"></div>
        <details class="cc-settings">
          <summary>⚙️ ${t('cc_settings')}</summary>
          <div class="field-block">
            <span class="field-label">${t('cc_ranking_visibility')}</span>
            <select id="cc-visibility">
              <option value="anonymized">anonymized</option>
              <option value="full">full names</option>
              <option value="opt_out">hidden</option>
            </select>
          </div>
          <div class="field-block">
            <span class="field-label">🏫 ${t('cc_school')}</span>
            <p class="small-hint" id="cc-school-now">${t('cc_school_none')}</p>
            <div class="btn-row"><input type="text" id="cc-school-code" placeholder="XXXX-XXXX" autocomplete="off" spellcheck="false" style="max-width:130px"><button class="wbtn" id="cc-school-join">${t('cc_school_join')}</button></div>
          </div>
          <label class="switch-row"><span>${t('cc_pulse_label')}</span><input type="checkbox" id="cc-pulse"></label>
          <p class="small-hint">${t('cc_pulse_hint')}</p>
          <div class="field-block">
            <span class="field-label">👪 ${t('cc_family_codes')}</span>
            <p class="small-hint">${t('cc_family_hint')}</p>
            <div class="btn-row"><button class="wbtn" id="cc-fam-show">${t('cc_family_show')}</button></div>
            <div id="cc-fam-list"></div>
          </div>
          <div class="btn-row"><button class="wbtn" id="cc-signout">${t('cc_sign_out')}</button></div>
        </details>
      </div>`;
    body.querySelectorAll('[data-open]').forEach(b=> b.addEventListener('click', ()=> openWidgetSmart(b.dataset.open)));

    body.querySelector('#cc-signout').addEventListener('click', ()=>{ stopSubs(); TDCloud.signOut(); draw(); });

    body.querySelector('#cc-visibility').addEventListener('change', async e=>{
      try{ await TDCloud.setRankingVisibility(state.cloudClassId, e.target.value); }
      catch(err){ toastMsg(err.message||String(err)); }
    });

    // v0.21.2: Class Pulse on/off (ParentDeck's typical-range view) and the class's family codes (backend v2.0.0).
    body.querySelector('#cc-pulse').addEventListener('change', async e=>{
      try{ await TDCloud.setClassPulse(state.cloudClassId, e.target.checked); toast(t(e.target.checked ? 'cc_pulse_on' : 'cc_pulse_off')); }
      catch(err){ e.target.checked = !e.target.checked; toastMsg(err.message||String(err)); }
    });
    async function showFamilyCodes(){
      const box = body.querySelector('#cc-fam-list');
      if(!box) return;
      box.innerHTML = `<p class="small-hint">${t('cc_family_loading')}</p>`;
      let codes;
      try{ codes = await TDCloud.getFamilyCodes(state.cloudClassId); }
      catch(err){ box.innerHTML = `<p class="small-hint">${escHtml(t('cc_family_unavailable'))}</p>`; return; }
      if(!codes.length){ box.innerHTML = `<p class="small-hint">${t('cc_family_none')}</p>`; return; }
      box.innerHTML = `<div class="cc-fam-rows">${codes.map(c=> `<div class="cc-fam-row"><span>${escHtml(c.displayName || '—')}</span><code>${escHtml(c.familyCode)}</code><button class="wbtn cc-fam-new" data-id="${escHtml(c.studentId)}" title="${escHtml(t('cc_family_new_title'))}">↻</button></div>`).join('')}</div>
        <div class="btn-row"><button class="wbtn" id="cc-fam-copy">${t('cc_family_copy')}</button></div>`;
      box.querySelector('#cc-fam-copy').addEventListener('click', ()=>{
        const text = codes.map(c=> `${c.displayName}\t${c.familyCode}`).join('\n');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(()=> toast(t('cc_family_copied')), ()=> toast(t('cc_family_copy_failed')));
      });
      box.querySelectorAll('.cc-fam-new').forEach(b=> b.addEventListener('click', async ()=>{
        if(!confirm(t('cc_family_new_confirm'))) return;
        try{ await TDCloud.regenerateFamilyCode(state.cloudClassId, b.dataset.id); showFamilyCodes(); }
        catch(err){ toastMsg(err.message||String(err)); }
      }));
    }
    body.querySelector('#cc-fam-show').addEventListener('click', showFamilyCodes);

    // v0.21.3 (backend v2.1.0): join a school with the code from your school admin; notes from the school admin.
    body.querySelector('#cc-school-join').addEventListener('click', async ()=>{
      const code = body.querySelector('#cc-school-code').value.trim();
      if(!code){ toast(t('cc_school_need_code')); return; }
      try{ const r = await TDCloud.joinSchool(code); body.querySelector('#cc-school-code').value = ''; toast(t('cc_school_joined', { name: r.schoolName })); }
      catch(err){ toastMsg(err.message||String(err)); }
    });

    // Bridge to the local, per-class-pill roster (state.roster) that Name
    // Picker, Attendance, Group Maker and Hall Pass draw from. One-way
    // (cloud -> local) since local names are plain strings with no cloud
    // account behind them; additive and de-duped, never removes a local
    // name a teacher typed in that hasn't joined the cloud class.
    body.querySelector('#cc-sync-names').addEventListener('click', ()=>{
      if(!roster.length){ toast(t('cc_sync_names_empty')); return; }
      const extra = cbMatch(state.students, roster).extra.filter(s=> (s.displayName||'').trim());
      if(!extra.length){ toast(t('cc_sync_names_none')); return; }
      mutateStudents(()=>{ extra.forEach(s=> state.students.push({ id:cid(), ...splitVietnameseName(s.displayName), en:'' })); });
      const added = extra;
      document.querySelectorAll('[data-i18n-count]').forEach(el=>{ el.textContent = t('roster_count', { n: state.roster.length }); });
      toast(t('cc_sync_names_done', { n: added.length }));
    });

    stopSubs();
    if(TDCloud.subscribeMySchool) unsubs.push(TDCloud.subscribeMySchool(s=>{
      const el = body.querySelector('#cc-school-now'); if(el) el.textContent = s && s.schoolName ? t('cc_school_in', { name: s.schoolName }) : t('cc_school_none');
    }));
    if(TDCloud.subscribeAdminNotes){ let seen = null; unsubs.push(TDCloud.subscribeAdminNotes(list=>{
      const box = body.querySelector('#cc-adminnotes'); if(!box) return;
      if(!list){ box.hidden = true; return; }
      box.hidden = list.length === 0;
      const unread = list.filter(n=> !n.read);
      body.querySelector('#cc-an-label').textContent = unread.length ? t('an_title_new', { n: unread.length }) : t('an_title');
      if(seen && unread.some(n=> !seen.has(n.id))) toast(t('an_toast'));
      seen = new Set(list.map(n=> n.id));
      body.querySelector('#cc-an-list').innerHTML = list.map(n=> `<div class="an-item ${n.read ? '' : 'unread'}" data-id="${escHtml(n.id)}">
        <div class="an-top">${n.subject ? `<b>${escHtml(n.subject)}</b>` : ''}<span class="small-hint">${escHtml(n.from || '')}${n.createdAtMs ? ' · ' + new Date(n.createdAtMs).toLocaleDateString() : ''}</span></div>
        <div class="an-text">${escHtml(n.text || '')}</div>${n.read ? '' : `<button class="wbtn an-ok">${t('an_gotit')}</button>`}</div>`).join('');
      body.querySelectorAll('.an-ok').forEach(b=> b.addEventListener('click', ()=> TDCloud.markAdminNoteRead(b.closest('.an-item').dataset.id).catch(err=> toastMsg(err.message||String(err)))));
    })); }
    unsubs.push(TDCloud.subscribeClass(state.cloudClassId, cls=>{
      cloudClass = cls;
      const codesEl = body.querySelector('#cc-codes');
      const visEl = body.querySelector('#cc-visibility');
      if(!cls){
        // Either this class was deleted, or — far more likely — the
        // signed-in Google account changed (Cloud Class doesn't clear
        // state.cloudClassId on sign-out/sign-in, since it's meant to
        // survive a re-login as the SAME teacher) and the new account
        // doesn't own this class, so Firestore's rules reject the read.
        // Either way, staying on this screen just shows blank codes
        // forever, so fall back to create/pick rather than leave it silent.
        stopSubs();
        state.cloudClassId = null;
        saveState();
        toastMsg(t('cc_wrong_account'));
        draw();
        return;
      }
      const nmEl = body.querySelector('#cc-class-name'); if(nmEl) nmEl.textContent = cls.className || '';
      const pulseEl = body.querySelector('#cc-pulse');   // same default as the backend: on, unless never set and rankings are hidden
      if(pulseEl) pulseEl.checked = cls.classPulse === true || (cls.classPulse === undefined && cls.rankingVisibility !== 'opt_out');
      if(!codesEl) return;
      codesEl.innerHTML = `
        <div class="cc-code-row"><span>${t('cc_student_code')}: <b>${escHtml(cls.studentJoinCode)}</b></span>
          <span class="cc-code-btns"><button class="wbtn" data-copy="${escHtml(cls.studentJoinCode)}">${t('cc_copy')}</button>
          <button class="wbtn" data-which="student">${t('cc_regenerate')}</button></span></div>
        <div class="cc-code-row"><span>${t('cc_parent_code')}: <b>${escHtml(cls.parentJoinCode)}</b></span>
          <span class="cc-code-btns"><button class="wbtn" data-copy="${escHtml(cls.parentJoinCode)}">${t('cc_copy')}</button>
          <button class="wbtn" data-which="parent">${t('cc_regenerate')}</button></span></div>`;
      codesEl.querySelectorAll('[data-copy]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const code = btn.dataset.copy;
          if(await ccCopyText(code)) toastMsg(t('cc_copied', { code }));
          else toastMsg(t('cc_copy_fail'));
        });
      });
      codesEl.querySelectorAll('[data-which]').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          try{ await TDCloud.regenerateJoinCode(state.cloudClassId, btn.dataset.which); }
          catch(e){ toastMsg(e.message||String(e)); }
        });
      });
      if(visEl) visEl.value = cls.rankingVisibility || 'anonymized';
    }));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list=>{
      roster = list.slice().sort((a,b)=> (b.xp||0)-(a.xp||0));
      ActivityHub.setRoster(roster.map(s=> s.id));
      const label = body.querySelector('#cc-roster-label');
      const rosterEl = body.querySelector('#cc-roster');
      if(label) label.textContent = t('cc_roster', { n: roster.length });
      if(!rosterEl) return;
      const reasonOptions = `
        <option value="">${t('cc_pick_reason')}</option>
        <optgroup label="${t('cc_merit_group')}">
          ${MERIT_REASONS.map(r=>`<option value="${r.key}">\ud83d\ude42 ${t('cc_reason_'+r.key)} (+${r.points})</option>`).join('')}
        </optgroup>
        <optgroup label="${t('cc_demerit_group')}">
          ${DEMERIT_REASONS.map(r=>`<option value="${r.key}">\ud83d\ude41 ${t('cc_reason_'+r.key)} (${r.points})</option>`).join('')}
        </optgroup>
        <option value="__custom">${t('cc_custom_reason')}</option>`;
      // Flag names that appear more than once in this class (trimmed,
      // case-insensitive) — the most common real-world cause is a student
      // joining twice with the class code instead of resuming with their
      // PIN. This is just a visual nudge for the teacher; it doesn't
      // prevent or auto-merge anything.
      const nameCounts = {};
      roster.forEach(s=>{ const k=(s.displayName||'').trim().toLowerCase(); if(k) nameCounts[k]=(nameCounts[k]||0)+1; });
      rosterEl.innerHTML = roster.length ? roster.map(s=>{
        const isDup = nameCounts[(s.displayName||'').trim().toLowerCase()] > 1;
        return `
        <div class="cc-roster-row cc-student-row" data-id="${s.id}">
          <div class="cc-roster-top">
            <span class="cc-roster-name"></span>${isDup ? `<span class="cc-dup-badge" title="${t('cc_dup_name_hint')}">⚠️ ${t('cc_dup_name_badge')}</span>` : ''}<b class="cc-roster-xp">${s.xp||0} ${t('cc_pts')}</b>
            <button class="sb-btn cc-roster-note" data-note="${s.id}" title="${t('cc_note_btn')}" aria-label="${t('cc_note_btn')}">✉️</button>
            <button class="sb-btn minus cc-roster-remove" data-remove="${s.id}" title="${t('cc_remove_student')}" aria-label="${t('cc_remove_student')}">🗑️</button>
          </div>
          <div class="cc-act" data-act="${s.id}" title="${t('cc_act_tip')}"></div>
          <div class="cc-roster-award">
            <select class="cc-reason-select">${reasonOptions}</select>
            <input type="text" class="cc-reason" placeholder="${t('cc_award_reason_ph')}" style="display:none">
            <button class="sb-btn minus" data-delta="-5">➖5</button>
            <button class="sb-btn plus" data-delta="5">➕5</button>
          </div>
        </div>`;
      }).join('') : `<p class="small-hint">${t('cc_no_students')}</p>`;
      const allReasons = MERIT_REASONS.concat(DEMERIT_REASONS);
      rosterEl.querySelectorAll('.cc-roster-row').forEach(row=>{
        const s = roster.find(x=>x.id===row.dataset.id);
        row.querySelector('.cc-roster-name').textContent = s ? s.displayName : '';
        const select = row.querySelector('.cc-reason-select');
        const reasonInput = row.querySelector('.cc-reason');
        const doAward = async (amount, reason)=>{
          try{ await TDCloud.awardPoints(state.cloudClassId, row.dataset.id, amount, reason); track('cloudpoints', (amount > 0 ? '+' : '') + amount + (reason ? ' · ' + reason : '')); }
          catch(e){ toastMsg(e.message||String(e)); }
        };
        select.addEventListener('change', ()=>{
          const val = select.value;
          if(val === '__custom'){
            reasonInput.style.display = '';
            reasonInput.focus();
            select.value = '';
            return;
          }
          const preset = allReasons.find(r=>r.key===val);
          if(!preset) return;
          doAward(preset.points, t('cc_reason_'+preset.key));
          select.value = '';
        });
        row.querySelectorAll('[data-delta]').forEach(btn=>{
          btn.addEventListener('click', ()=>{
            const amount = parseInt(btn.dataset.delta, 10);
            const reason = reasonInput.value.trim();
            doAward(amount, reason);
          });
        });
        const noteBtn = row.querySelector('[data-note]');
        if(noteBtn) noteBtn.addEventListener('click', ()=> requestNotesHome(row.dataset.id));
        const removeBtn = row.querySelector('[data-remove]');
        if(removeBtn) removeBtn.addEventListener('click', async ()=>{
          if(!confirm(t('cc_remove_student_confirm', { name: s ? s.displayName : '' }))) return;
          try{ await TDCloud.removeStudent(row.dataset.id, state.cloudClassId); }
          catch(e){ toastMsg(e.message||String(e)); }
        });
      });
      paintAct();
    }));
    // v0.15.0 — activity badges on the roster. (The ✉️ button on each row opens the Notes Home widget — see requestNotesHome.)
    unsubs.push(ActivityHub.attach(paintAct));
  }

  // 🔥 streak · ✅ homework done/assigned · last active — a small strip under each roster name.
  function paintAct(){
    body.querySelectorAll('.cc-act[data-act]').forEach(el=>{
      const s = roster.find(x=> x.id === el.dataset.act); if(!s) return;
      const a = studentActivity(s);
      el.textContent = `🔥${a.streak}  ·  ✅${a.hwDone}/${a.hwTotal}  ·  ${agoText(a.lastActive)}`;
      el.classList.toggle('quiet', isQuiet(a.lastActive));
    });
  }

  function toastMsg(msg){
    body.querySelector('.cc-error')?.remove();
    const p = document.createElement('p');
    p.className = 'small-hint cc-error';
    p.style.color = '#e77';
    p.textContent = msg;
    body.prepend(p);
  }

  const unsubAuth = TDCloud.onAuthChanged(draw);
  draw();
  return ()=>{ stopSubs(); unsubAuth(); };
}

/* ---------------- Notes Home (teacher → parent notes) ---------------- */
// A teacher picks one or more students, a smiley or frowny face, writes a short note and sends
// it; the parent reads it in ParentDeck, and the status here flips from Sent to Read.
// Needs a linked cloud class (Cloud Class widget) and the backend's sendNotesHome function.
// Each student gets their own private copy of the note, so read status is per child.
//
// "Sign notes as" belongs to the TEACHER, not to a class, so it has its own key rather than
// living in per-class state (same reasoning as the Pro license above).
// The ✉️ button on a Cloud Class roster row calls requestNotesHome(): it opens (or un-minimises) this
// widget with that student already ticked — one composer and one history, not two.
let nhPendingStudent = null;
function requestNotesHome(studentId){
  nhPendingStudent = studentId;
  if(!state.active.noteshome){ toggleWidget('noteshome'); return; }
  const lay = state.layout.noteshome;
  if(lay && lay.minimized) toggleMinimize('noteshome');
  document.dispatchEvent(new CustomEvent('td:noteshome-pending'));
}
const NH_SIGNAS_KEY = 'td_notes_signas_v1';
function nhLoadSignAs(){ try{ return localStorage.getItem(NH_SIGNAS_KEY) || ''; }catch(e){ return ''; } }
function nhSaveSignAs(v){ try{ localStorage.setItem(NH_SIGNAS_KEY, v); }catch(e){ /* not persisted */ } }

function renderNotesHome(body){
  /* v0.21.0: a two-pane "mail" layout. Left: the students (tick = recipient, click = open their conversation). Right: the conversation as message bubbles
     (✓ Sent / ✓✓ Read, like an instant-message app) with an email-style composer underneath (To / From / message). Narrow windows stack the panes. */
  const NH_MAX = 500;                 // mirrored by the server, which is the real limit
  const unsubs = [];
  let roster = [], notes = [], notesFailed = false;
  const selected = new Set();
  let mood = null, filterId = '', sending = false, shownClassId = null, search = '', firstThread = true;

  const stopSubs = ()=>{ unsubs.forEach(u=>{ try{ u(); }catch(e){} }); unsubs.length = 0; };
  const q = sel => body.querySelector(sel);
  const loc = ()=> LOCALE_MAP[state.lang]||'en-US';
  const fmtTime = ms => new Date(ms).toLocaleString(loc(), { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const fmtClock = ms => new Date(ms).toLocaleTimeString(loc(), { hour:'2-digit', minute:'2-digit' });
  const fmtDayLabel = ms => { const d0 = new Date(); d0.setHours(0,0,0,0); const d1 = new Date(ms); d1.setHours(0,0,0,0); const n = Math.round((d0 - d1) / 864e5);
    return n <= 0 ? t('ca_today') : n === 1 ? t('ca_yesterday') : new Date(ms).toLocaleDateString(loc(), { weekday:'short', month:'short', day:'numeric' }); };
  const nameOf = id => { const s = roster.find(x=> x.id === id); return s ? (s.displayName || '—') : '—'; };
  const noEmoji = s => String(s).replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, '').trim();     // the ✓ / ✓✓ ticks replace the emoji in the old status text

  function showHint(msg, isError){
    const el = q('#nh-hint'); if(!el) return;
    el.textContent = msg || '';
    el.classList.toggle('cc-error', !!isError);
  }
  function friendlyError(e){
    const msg = (e && e.message) ? String(e.message) : String(e);
    return msg === 'NOT_FOUND' ? t('nh_backend_old') : msg;        // a function that isn't deployed yet comes back as the bare word NOT_FOUND
  }

  function draw(){
    stopSubs();
    shownClassId = state.cloudClassId || null;
    if(!TDCloud.isConfigured()){ body.innerHTML = notConfiguredHtml(); return; }
    if(!TDCloud.getSession()){
      body.innerHTML = `<div class="cc-panel"><button class="wbtn primary" id="nh-signin">${t('cc_signin')}</button><p class="small-hint" id="nh-hint"></p></div>`;
      q('#nh-signin').addEventListener('click', async ()=>{
        try{ await TDCloud.signIn(); draw(); }catch(e){ showHint(friendlyError(e), true); }
      });
      return;
    }
    if(!state.cloudClassId){
      body.innerHTML = `<div class="cc-panel"><p class="small-hint">${t('nh_need_cloud')}</p><div class="btn-row"><button class="wbtn primary" id="nh-open-cc">${t('nh_open_cloudclass')}</button></div></div>`;
      q('#nh-open-cc').addEventListener('click', ()=> openWidgetSmart('cloudclass'));
      return;
    }
    drawLinked();
  }

  function drawLinked(){
    firstThread = true;
    body.innerHTML = `
      <div class="nh-wrap"><div class="nh-mail">
        <aside class="nh-side">
          <input type="search" class="nh-search" id="nh-search" placeholder="${escHtml(t('nh_search_ph'))}" aria-label="${escHtml(t('nh_search_ph'))}">
          <div class="nh-side-tools"><button class="wbtn" id="nh-all">${t('nh_all')}</button><button class="wbtn" id="nh-none">${t('nh_none')}</button><span class="small-hint" id="nh-count"></span></div>
          <div class="nh-people" id="nh-students"></div>
        </aside>
        <section class="nh-main">
          <header class="nh-thead"><b id="nh-title"></b><span class="small-hint" id="nh-unread"></span></header>
          <div class="nh-thread" id="nh-history" aria-live="polite"></div>
          <div class="nh-compose">
            <div class="nh-line"><span class="nh-lbl">${t('nh_to')}</span><div class="nh-chips" id="nh-chips"></div></div>
            <div class="nh-line"><span class="nh-lbl">${t('nh_from')}</span><input type="text" id="nh-signas" maxlength="40" placeholder="${escHtml(t('nh_sign_as_ph'))}" title="${escHtml(t('nh_sign_as_hint'))}"></div>
            <textarea id="nh-text" rows="3" maxlength="${NH_MAX}" placeholder="${escHtml(t('nh_text_ph'))}"></textarea>
            <div class="nh-foot">
              <div class="nh-moods" role="group" aria-label="${escHtml(t('nh_mood'))}">
                <button type="button" class="nh-mood" data-mood="smiley" aria-pressed="false">${t('nh_smiley')}</button>
                <button type="button" class="nh-mood" data-mood="frowny" aria-pressed="false">${t('nh_frowny')}</button>
              </div>
              <span class="small-hint" id="nh-counter">0/${NH_MAX}</span>
              <button class="wbtn primary" id="nh-send">${t('nh_send')}</button>
            </div>
            <p class="small-hint">${t('nh_privacy')}</p>
            <p class="small-hint" id="nh-hint"></p>
          </div>
        </section>
      </div></div>`;

    const signEl = q('#nh-signas');
    signEl.value = nhLoadSignAs();
    signEl.addEventListener('input', ()=> nhSaveSignAs(signEl.value.trim()));
    q('#nh-search').addEventListener('input', e=>{ search = e.target.value.trim().toLowerCase(); renderStudents(); });
    q('#nh-all').addEventListener('click', ()=>{ roster.forEach(s=> selected.add(s.id)); renderStudents(); renderChips(); });
    q('#nh-none').addEventListener('click', ()=>{ selected.clear(); renderStudents(); renderChips(); });
    body.querySelectorAll('.nh-mood').forEach(btn=> btn.addEventListener('click', ()=>{
      mood = (mood === btn.dataset.mood) ? null : btn.dataset.mood;
      paintMood(); showHint('');
    }));
    const ta = q('#nh-text');
    ta.addEventListener('input', ()=>{ q('#nh-counter').textContent = `${ta.value.length}/${NH_MAX}`; showHint(''); });
    ta.addEventListener('keydown', e=>{ if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); send(); } });
    q('#nh-send').addEventListener('click', send);
    q('#nh-students').addEventListener('click', e=>{
      if(e.target.closest('input[type=checkbox]')) return;          // the tick is handled by its own change event
      const row = e.target.closest('[data-thread]'); if(!row) return;
      const id = row.dataset.thread;
      filterId = id === filterId ? '' : id; firstThread = true;
      selected.clear(); if(filterId) selected.add(filterId);        // opening a conversation defaults the composer to reply to them, like a real messenger
      renderStudents(); renderChips(); renderHistory();
    });
    q('#nh-chips').addEventListener('click', e=>{
      const x = e.target.closest('[data-unpick]'); if(!x) return;
      selected.delete(x.dataset.unpick); renderStudents(); renderChips();
    });

    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list=>{
      roster = list;
      const ids = new Set(roster.map(s=>s.id));
      [...selected].forEach(id=>{ if(!ids.has(id)) selected.delete(id); });   // a removed student can't stay ticked
      if(filterId && !ids.has(filterId)) filterId = '';
      renderStudents(); renderChips(); renderHistory(); applyPending();
    }));
    unsubs.push(TDCloud.subscribeNotes(state.cloudClassId, (list, err)=>{
      notes = list; notesFailed = !!err; renderStudents(); renderHistory();
    }));
  }

  // A ✉️ click on the roster ticks just that student, opens their conversation and puts the cursor in the message box.
  function applyPending(){
    if(!nhPendingStudent || !q('#nh-students')) return;
    if(!roster.some(s=> s.id === nhPendingStudent)) return;      // roster not loaded yet — tried again when it arrives
    selected.clear(); selected.add(nhPendingStudent); filterId = nhPendingStudent; nhPendingStudent = null; firstThread = true;
    renderStudents(); renderChips(); renderHistory();
    const ta = q('#nh-text'); if(ta){ ta.focus(); }
  }
  const onPending = ()=> applyPending();
  document.addEventListener('td:noteshome-pending', onPending);

  function paintMood(){
    body.querySelectorAll('.nh-mood').forEach(b=>{
      const on = b.dataset.mood === mood;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderStudents(){
    const box = q('#nh-students'); if(!box) return;
    const sorted = roster.slice().sort((a,b)=> (a.displayName||'').localeCompare(b.displayName||'', state.lang || 'en'));
    // Two students with the same name look identical — the same ⚠️ marker the roster uses, because sending a note to the wrong family is the one mistake that matters here.
    const nameCounts = {};
    sorted.forEach(s=>{ const k=(s.displayName||'').trim().toLowerCase(); if(k) nameCounts[k]=(nameCounts[k]||0)+1; });
    const last = {}, unreadBy = {};
    notes.forEach(n=>{ if(!last[n.studentId]) last[n.studentId] = n; if(!n.read) unreadBy[n.studentId] = (unreadBy[n.studentId] || 0) + 1; });   // notes arrive newest first
    const unreadAll = notes.filter(n=>!n.read).length;
    const shown = sorted.filter(s=> !search || (s.displayName||'').toLowerCase().includes(search));
    box.innerHTML = `<div class="nh-prow nh-prow-all${filterId === '' ? ' on' : ''}" data-thread=""><span class="nh-av">✉️</span><div class="nh-pmain"><b>${t('nh_all_notes')}</b><small>${t('nh_n_sent', { n:notes.length })}</small></div>${unreadAll ? `<span class="nh-dot" title="${escHtml(t('nh_unread_count', { n:unreadAll }))}">${unreadAll}</span>` : ''}</div>`;
    if(!sorted.length) box.insertAdjacentHTML('beforeend', `<p class="small-hint">${t('nh_no_students')}</p>`);
    shown.forEach(s=>{
      const ln = last[s.id], when = ln ? tsMs(ln.createdAt) : 0, dup = nameCounts[(s.displayName||'').trim().toLowerCase()] > 1;
      const row = document.createElement('div'); row.className = 'nh-prow' + (filterId === s.id ? ' on' : ''); row.dataset.thread = s.id; row.setAttribute('role', 'button'); row.tabIndex = 0;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = s.id; cb.checked = selected.has(s.id); cb.title = t('nh_send_to'); cb.setAttribute('aria-label', `${t('nh_send_to')}: ${s.displayName || ''}`);
      cb.addEventListener('change', ()=>{ if(cb.checked) selected.add(s.id); else selected.delete(s.id); updateCount(); renderChips(); });
      const main = document.createElement('div'); main.className = 'nh-pmain';
      const nm = document.createElement('b'); nm.textContent = s.displayName || '—';
      if(dup){ const d = document.createElement('span'); d.className = 'cc-dup-badge'; d.title = t('cc_dup_name_hint'); d.textContent = '⚠️'; nm.append(' ', d); }
      const sm = document.createElement('small'); sm.textContent = ln ? `${ln.mood === 'frowny' ? '🙁' : '🙂'} ${ln.text || (ln.mood === 'frowny' ? t('nh_frowny') : t('nh_smiley'))}` : t('nh_no_notes_yet');
      main.append(nm, sm);
      row.append(cb, main);
      if(when){ const w = document.createElement('span'); w.className = 'nh-pwhen'; w.textContent = fmtDayLabel(when) === t('ca_today') ? fmtClock(when) : fmtDayLabel(when); row.append(w); }
      if(unreadBy[s.id]){ const dt = document.createElement('span'); dt.className = 'nh-dot'; dt.textContent = unreadBy[s.id]; dt.title = t('nh_unread_count', { n:unreadBy[s.id] }); row.append(dt); }
      box.appendChild(row);
    });
    updateCount();
  }
  function updateCount(){ const el = q('#nh-count'); if(el) el.textContent = t('nh_selected', { n: selected.size }); }

  function renderChips(){
    const box = q('#nh-chips'); if(!box) return;
    const ids = roster.filter(s=> selected.has(s.id)).sort((a,b)=> (a.displayName||'').localeCompare(b.displayName||'', state.lang || 'en'));
    if(!ids.length){ box.innerHTML = `<span class="small-hint">${t('nh_pick_left')}</span>`; return; }
    const MAXC = 4;
    box.innerHTML = ids.slice(0, MAXC).map(s=> `<span class="nh-chip">${escHtml(s.displayName || '—')}<button type="button" data-unpick="${escHtml(s.id)}" aria-label="${escHtml(t('nh_remove_recipient'))}">×</button></span>`).join('')
      + (ids.length > MAXC ? `<span class="nh-chip nh-more" title="${escHtml(ids.slice(MAXC).map(s=> s.displayName).join(', '))}">${t('nh_more_n', { n:ids.length - MAXC })}</span>` : '');
  }

  function groupNotes(list){          // a class-wide note is one copy per child; in the all-notes view they read as ONE message (same text, mood and minute)
    const out = [], idx = new Map();
    list.forEach(n=>{
      const key = `${n.mood}|${n.text || ''}|${Math.floor((tsMs(n.createdAt) || 0) / 60000)}`;
      let g = idx.get(key); if(!g){ g = { notes:[], when:tsMs(n.createdAt) || 0, mood:n.mood, text:n.text || '' }; idx.set(key, g); out.push(g); }
      g.notes.push(n);
    });
    return out;
  }

  function renderHistory(){
    const box = q('#nh-history'); if(!box) return;
    const title = q('#nh-title'); if(title) title.textContent = filterId ? nameOf(filterId) : t('nh_all_notes');
    const unreadEl = q('#nh-unread');
    if(unreadEl){ const u = (filterId ? notes.filter(n=> n.studentId === filterId) : notes).filter(n=>!n.read).length; unreadEl.textContent = u ? t('nh_unread_count', { n:u }) : ''; }
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = '';
    const note = (key, err)=>{ const p = document.createElement('p'); p.className = 'small-hint nh-empty' + (err ? ' cc-error' : ''); p.textContent = t(key); box.appendChild(p); };
    if(notesFailed){ note('nh_load_failed', true); return; }
    const list = (filterId ? notes.filter(n=> n.studentId === filterId) : notes).slice().sort((a,b)=> (tsMs(a.createdAt) || 0) - (tsMs(b.createdAt) || 0));   // oldest first, newest at the bottom
    if(!list.length){ note('nh_none_yet'); return; }
    const items = filterId ? list.map(n=> ({ notes:[n], when:tsMs(n.createdAt) || 0, mood:n.mood, text:n.text || '' })) : groupNotes(list);
    let lastDay = '';
    items.forEach(g=>{
      const dayKey = g.when ? new Date(g.when).toDateString() : '';
      if(dayKey && dayKey !== lastDay){ lastDay = dayKey; const sep = document.createElement('div'); sep.className = 'nh-day'; sep.textContent = fmtDayLabel(g.when); box.appendChild(sep); }
      const total = g.notes.length, read = g.notes.filter(n=> n.read).length, unread = g.notes.filter(n=> !n.read);
      const msg = document.createElement('div'); msg.className = 'nh-msg' + (g.mood === 'frowny' ? ' frowny' : '');
      const head = document.createElement('div'); head.className = 'nh-msg-head';
      const face = document.createElement('span'); face.className = 'nh-face'; face.textContent = g.mood === 'frowny' ? '🙁' : '🙂';
      head.append(face);
      if(!filterId){      // "To: X" only adds information in the combined All-notes view — redundant inside a single student's own thread
        const who = document.createElement('b'); who.className = 'nh-note-name';
        who.textContent = total === 1 ? `${t('nh_to')}: ${nameOf(g.notes[0].studentId)}` : `${t('nh_to')}: ${t('nh_n_students', { n:total })}`;
        if(total > 1) who.title = g.notes.map(n=> nameOf(n.studentId)).join(', ');
        head.append(who);
      }
      msg.append(head);
      if(g.text){ const tx = document.createElement('div'); tx.className = 'nh-note-text'; tx.textContent = g.text; msg.append(tx); }
      const foot = document.createElement('div'); foot.className = 'nh-msg-foot';
      const when = document.createElement('span'); when.className = 'nh-when'; when.textContent = g.when ? fmtClock(g.when) : '';
      const status = document.createElement('span');
      if(read === total){
        const at = total === 1 ? tsMs(g.notes[0].readAt) : null;
        status.className = 'nh-status read'; status.textContent = `✓✓ ${total === 1 ? noEmoji(t('nh_status_read', { time: at ? fmtTime(at) : '' })) : t('nh_all_read')}`;
      }else{
        status.className = 'nh-status sent'; status.textContent = total === 1 ? `✓ ${noEmoji(t('nh_status_sent'))}` : `${read ? '✓✓' : '✓'} ${t('nh_read_n', { r:read, n:total })}`;
      }
      foot.append(when, status);
      if(unread.length){
        // Only an unread note can be taken back — once a parent has opened it, it stays.
        const del = document.createElement('button'); del.type = 'button'; del.className = 'nh-del'; del.textContent = '🗑️';
        del.title = t('nh_delete_tip'); del.setAttribute('aria-label', t('nh_delete_tip'));
        del.addEventListener('click', async ()=>{
          if(!confirm(t('nh_delete_confirm'))) return;
          const res = await Promise.allSettled(unread.map(n=> TDCloud.deleteNote(state.cloudClassId, n.id)));
          if(res.some(r=> r.status === 'rejected')) showHint(t('nh_delete_failed'), true);   // opened a moment ago, so no longer deletable
        });
        foot.append(del);
      }
      msg.append(foot);
      box.appendChild(msg);
    });
    if(firstThread || near){ box.scrollTop = box.scrollHeight; firstThread = false; }
  }

  async function send(){
    if(sending) return;
    const ta = q('#nh-text');
    const ids = roster.filter(s=> selected.has(s.id)).map(s=> s.id);
    const text = ta.value.trim();
    // The same rules the server enforces, checked first so the teacher gets a reason, not a failure.
    if(!ids.length){ showHint(t('nh_err_students'), true); return; }
    if(!mood){ showHint(t('nh_err_mood'), true); return; }
    if(mood === 'frowny' && !text){ showHint(t('nh_err_frowny_text'), true); return; }
    sending = true;
    const btn = q('#nh-send'); btn.disabled = true; btn.textContent = t('nh_sending'); showHint('');
    try{
      const res = await TDCloud.sendNotesHome(state.cloudClassId, ids, mood, text, nhLoadSignAs());
      track('notehome', (res.sent || 1) + ' sent', res.sent || 1);
      toast(res.sent === 1 ? t('nh_sent_one') : t('nh_sent_many', { n: res.sent }));
      selected.clear(); if(filterId) selected.add(filterId); mood = null; ta.value = '';   // re-sync with whatever thread is still open, so a second note doesn't need re-selecting
      q('#nh-counter').textContent = `0/${NH_MAX}`;
      firstThread = true; paintMood(); renderStudents(); renderChips(); renderHistory();
    }catch(e){ showHint(friendlyError(e), true); }
    finally{ sending = false; const b = q('#nh-send'); if(b){ b.disabled = false; b.textContent = t('nh_send'); } }
  }

  let drew = false;
  const unsubAuth = TDCloud.onAuthChanged(()=>{ drew = true; draw(); });
  if(!drew) draw();
  // Linking a class happens in the Cloud Class widget, which doesn't announce it — so notice it here.
  const poll = setInterval(()=>{ if((state.cloudClassId || null) !== shownClassId) draw(); }, 1500);
  return ()=>{ clearInterval(poll); stopSubs(); unsubAuth(); document.removeEventListener('td:noteshome-pending', onPending); nhPendingStudent = null; };
}

/* v0.19.0 strings: Class Builder. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  classbuilder:        { en:'🏗️ Class Builder', vi:'🏗️ Class Builder' },
  wc_classbuilder:     { en:'Create classes, add students, pick and group them, go cloud.', vi:'Tạo lớp, thêm học sinh, chọn tên, chia nhóm, chuyển lên cloud.' },
  cb_tab_classes:      { en:'Classes', vi:'Lớp' },
  cb_tab_students:     { en:'Students', vi:'Học sinh' },
  cb_tab_pick:         { en:'Pick & Groups', vi:'Chọn & Chia nhóm' },
  cb_tab_cloud:        { en:'☁️ Cloud', vi:'☁️ Cloud' },
  cb_new_class:        { en:'＋ New class with students', vi:'＋ Lớp mới kèm học sinh' },
  cb_class_name:       { en:'Class name', vi:'Tên lớp' },
  cb_students_hint:    { en:'Vietnamese format: family name (Họ), middle name (Tên đệm), given name (Tên). The English name is optional. Blank rows are ignored.', vi:'Theo định dạng Việt Nam: Họ, Tên đệm, Tên. Tên tiếng Anh không bắt buộc. Dòng trống sẽ bị bỏ qua.' },
  cb_col_fam:          { en:'Family name (Họ)', vi:'Họ' },
  cb_col_mid:          { en:'Middle (Tên đệm)', vi:'Tên đệm' },
  cb_col_giv:          { en:'Given name (Tên)', vi:'Tên' },
  cb_col_en:           { en:'English name (optional)', vi:'Tên tiếng Anh (tùy chọn)' },
  cb_ph_fam:           { en:'Nguyễn', vi:'Nguyễn' },
  cb_ph_mid:           { en:'Văn', vi:'Văn' },
  cb_ph_giv:           { en:'An', vi:'An' },
  cb_ph_en:            { en:'Andy', vi:'Andy' },
  cb_remove:           { en:'Remove student', vi:'Xóa học sinh' },
  cb_add_student:      { en:'＋ Add student', vi:'＋ Thêm học sinh' },
  cb_paste_label:      { en:'Or paste a list — one per line, e.g. “Nguyễn Văn An, Andy”', vi:'Hoặc dán danh sách — mỗi dòng một em, ví dụ “Nguyễn Văn An, Andy”' },
  cb_paste_ph:         { en:'Nguyễn Văn An, Andy\nTrần Thị Bình\nLê Minh Châu (Chloe)', vi:'Nguyễn Văn An, Andy\nTrần Thị Bình\nLê Minh Châu (Chloe)' },
  cb_paste_add:        { en:'Add list', vi:'Thêm danh sách' },
  cb_n_students:       { en:'{n} students', vi:'{n} học sinh' },
  cb_added_n:          { en:'Added {n} students.', vi:'Đã thêm {n} học sinh.' },
  cb_sort:             { en:'Sort by given name', vi:'Sắp theo Tên' },
  cb_show_as:          { en:'Show names in Name Picker, Group Maker and Attendance as', vi:'Hiển thị tên trong Chọn tên, Chia nhóm và Điểm danh theo dạng' },
  cb_mode_both:        { en:'Vietnamese name (English name)', vi:'Tên Việt (tên tiếng Anh)' },
  cb_mode_en:          { en:'English name when there is one', vi:'Tên tiếng Anh nếu có' },
  cb_mode_vi:          { en:'Vietnamese name only', vi:'Chỉ tên Việt' },
  cb_preview:          { en:'Shown as', vi:'Hiển thị như' },
  cb_no_students:      { en:'No students yet — add some above.', vi:'Chưa có học sinh — hãy thêm ở trên.' },
  cb_cloud_intro:      { en:'Convert this class to a cloud class so students can join in StudentDeck and parents in ParentDeck. Sign in with Google to start.', vi:'Chuyển lớp này lên cloud để học sinh vào StudentDeck và phụ huynh vào ParentDeck. Đăng nhập Google để bắt đầu.' },
  cb_cloud_convert:    { en:'Convert to cloud class', vi:'Chuyển thành lớp cloud' },
  cb_cloud_convert_hint:{ en:'Creates a cloud class with a student code and a parent code. Students appear in the tables below once they join with the student code — type their names as shown on the join slips so they match your list.', vi:'Tạo lớp cloud với mã học sinh và mã phụ huynh. Học sinh sẽ xuất hiện trong các bảng bên dưới khi nhập mã học sinh — hãy nhập tên đúng như trên phiếu tham gia để khớp với danh sách của bạn.' },
  cb_cloud_name:       { en:'Cloud class name', vi:'Tên lớp cloud' },
  cb_converted:        { en:'This class is now a cloud class.', vi:'Lớp này đã trở thành lớp cloud.' },
  cb_linked:           { en:'cloud class', vi:'lớp cloud' },
  cb_cloud_missing:    { en:'This cloud class can’t be read — you may be signed in with a different Google account.', vi:'Không đọc được lớp cloud này — có thể bạn đang đăng nhập bằng tài khoản Google khác.' },
  cb_seg_student:      { en:'StudentDeck', vi:'StudentDeck' },
  cb_seg_parent:       { en:'ParentDeck', vi:'ParentDeck' },
  cb_seg_admin:        { en:'AdminDeck', vi:'AdminDeck' },
  cb_h_student:        { en:'Student', vi:'Học sinh' },
  cb_h_status:         { en:'Status', vi:'Trạng thái' },
  cb_h_points:         { en:'Points', vi:'Điểm' },
  cb_h_level:          { en:'Level', vi:'Cấp' },
  cb_h_streak:         { en:'Streak', vi:'Chuỗi ngày' },
  cb_h_last:           { en:'Last active', vi:'Hoạt động gần nhất' },
  cb_h_sent:           { en:'Notes sent', vi:'Ghi chú đã gửi' },
  cb_h_unread:         { en:'Unread', vi:'Chưa đọc' },
  cb_h_latest:         { en:'Latest note', vi:'Ghi chú mới nhất' },
  cb_h_item:           { en:'Item', vi:'Mục' },
  cb_h_value:          { en:'Value', vi:'Giá trị' },
  cb_joined:           { en:'Joined', vi:'Đã tham gia' },
  cb_notyet:           { en:'Not yet', vi:'Chưa' },
  cb_joined_sum:       { en:'{j} of {n} joined', vi:'{j}/{n} đã tham gia' },
  cb_student_note:     { en:'Matched by name (accents and capitals ignored).', vi:'Khớp theo tên (bỏ qua dấu và chữ hoa).' },
  cb_unmatched_title:  { en:'Joined, but not on your list', vi:'Đã tham gia nhưng chưa có trong danh sách' },
  cb_add_to_list:      { en:'Add to class list', vi:'Thêm vào danh sách lớp' },
  cb_parent_note:      { en:'Parents join with the parent code {code}. Which parents have linked isn’t visible here — this shows the notes you sent them.', vi:'Phụ huynh tham gia bằng mã phụ huynh {code}. Ở đây không thấy phụ huynh nào đã liên kết — chỉ thấy các ghi chú bạn đã gửi.' },
  cb_admin_note:       { en:'The class record, as far as TeachersDeck can see it. Your school’s AdminDeck holds its own view.', vi:'Hồ sơ lớp theo những gì TeachersDeck thấy được. AdminDeck của trường có góc nhìn riêng.' },
  cb_a_class:          { en:'Class', vi:'Lớp' },
  cb_a_teacher:        { en:'Teacher', vi:'Giáo viên' },
  cb_a_id:             { en:'Cloud class ID', vi:'Mã lớp cloud' },
  cb_a_students:       { en:'Students on list', vi:'Học sinh trong danh sách' },
  cb_a_codes:          { en:'Student / parent code', vi:'Mã học sinh / phụ huynh' },
  cb_a_ranking:        { en:'Ranking visibility', vi:'Hiển thị bảng xếp hạng' },
  cb_a_homework:       { en:'Assignments shared', vi:'Bài tập đã chia sẻ' },
  cb_a_calendar:       { en:'Calendar events shared', vi:'Sự kiện lịch đã chia sẻ' },
  cb_a_theme:          { en:'School theme from AdminDeck', vi:'Giao diện trường từ AdminDeck' },
  cb_a_theme_yes:      { en:'Received', vi:'Đã nhận' },
  cb_a_theme_no:       { en:'None received', vi:'Chưa nhận' },
  cb_copy_table:       { en:'Copy table', vi:'Sao chép bảng' },
  cb_table_copied:     { en:'Table copied — paste it into a spreadsheet.', vi:'Đã sao chép bảng — dán vào bảng tính.' },
  cb_slips:            { en:'Print join slips', vi:'In phiếu tham gia' },
  cb_popup_blocked:    { en:'Your browser blocked the print window — allow pop-ups for this page.', vi:'Trình duyệt đã chặn cửa sổ in — hãy cho phép cửa sổ bật lên.' },
  cb_slip_student:     { en:'StudentDeck → Join with class code {code}. Type your name as: {name}', vi:'StudentDeck → Tham gia bằng mã lớp {code}. Nhập tên của em: {name}' },
  cb_slip_parent:      { en:'Parents: ParentDeck → parent code {code}', vi:'Phụ huynh: ParentDeck → mã phụ huynh {code}' },
  cb_unlink:           { en:'Unlink from cloud class', vi:'Hủy liên kết lớp cloud' },
  cb_unlink_confirm:   { en:'Unlink this class from its cloud class? The cloud class and its students are not deleted.', vi:'Hủy liên kết lớp này với lớp cloud? Lớp cloud và học sinh không bị xóa.' },
  cb_settings_sum:     { en:'{name} · {n} students', vi:'{name} · {n} học sinh' },
  cb_open:             { en:'Open Class Builder…', vi:'Mở Class Builder…' },
  cb_new_menu:         { en:'＋ New class…', vi:'＋ Lớp mới…' }
});
// These pointed at a Settings → Class list that no longer exists; English and Vietnamese now point at Class Builder (other languages fall back to English).
STRINGS.att_no_roster      = { en:'Add students in Class Builder first.', vi:'Hãy thêm học sinh trong Class Builder trước.' };
STRINGS.gm_no_roster       = { en:'Add students in Class Builder first.', vi:'Hãy thêm học sinh trong Class Builder trước.' };
STRINGS.hp_no_roster       = { en:'Add students in Class Builder first.', vi:'Hãy thêm học sinh trong Class Builder trước.' };
STRINGS.add_students_prompt= { en:'Add students in Class Builder', vi:'Thêm học sinh trong Class Builder' };
STRINGS.roster_count       = { en:'{n} students in class list — edit in Class Builder', vi:'{n} học sinh trong danh sách lớp — chỉnh sửa trong Class Builder' };

/* ---------------- Class Builder (v0.19.0) ----------------
   One widget for everything about a class: Classes (switch, rename, copy, delete, create a new class WITH its students), Students (Vietnamese-format
   names + optional English name), Pick & Groups (the Name Picker and Group Maker, drawn from this class), and Cloud (convert the class to a cloud class,
   then see it the way StudentDeck, ParentDeck and AdminDeck see it). The class-management controls that used to sit in Settings live here; the top-right
   class switcher opens it ("Manage classes…", "New class…").
   Cloud limits, stated plainly: a student record only exists once the student joins with the class code, and TeachersDeck cannot read who has linked as a
   parent or what AdminDeck holds — so those tables show what TeachersDeck CAN see (joined students and their points; notes sent to parents; the class record). */
let cbTab = 'classes', cbRedraw = null, cbDraft = null;
const CB_TABS = ['classes', 'students', 'pick', 'cloud'];
const cbBlankRow = () => ({ fam:'', mid:'', giv:'', en:'' });
function cbDraftGet(){ if(!cbDraft) cbDraft = { name:'', rows:Array.from({ length:5 }, cbBlankRow), open:false }; return cbDraft; }
function openClassBuilder(tab, opts){
  if(tab && CB_TABS.includes(tab)) cbTab = tab;
  if(opts && opts.newClass) cbDraftGet().open = true;
  const sd = document.getElementById('settings-drawer'); if(sd) sd.hidden = true;
  if(isOff('classbuilder')) setWidgetOff('classbuilder', false);
  if(!state.active.classbuilder) toggleWidget('classbuilder');
  else{ if(cbRedraw) cbRedraw(); const o = widgetEls.classbuilder; if(o) bringToFront(o.el); }
}
function classMeta(id){
  let st = null;
  if(id === activeClassId()) st = state;
  else{ try{ st = JSON.parse(localStorage.getItem(classStateKey(id))); }catch(e){} }
  if(!st){                                  // a class that hasn't been opened yet may still be holding its students
    try{ const seed = JSON.parse(localStorage.getItem(CB_SEED_PREFIX + id)); if(Array.isArray(seed)) return { n:seed.length, cloud:false }; }catch(e){}
    return { n:0, cloud:false };
  }
  return { n:Array.isArray(st.students) ? st.students.length : (Array.isArray(st.roster) ? st.roster.length : 0), cloud:!!st.cloudClassId };
}
function cbRowHtml(r, attrs){
  const f = (k, ph, label) => `<input type="text" data-f="${k}" value="${escHtml(r[k] || '')}" placeholder="${escHtml(t(ph))}" aria-label="${escHtml(t(label))}" autocomplete="off">`;
  return `<div class="cb-row-s" ${attrs}>${f('fam', 'cb_ph_fam', 'cb_col_fam')}${f('mid', 'cb_ph_mid', 'cb_col_mid')}${f('giv', 'cb_ph_giv', 'cb_col_giv')}${f('en', 'cb_ph_en', 'cb_col_en')}<button type="button" class="cb-x" data-del aria-label="${escHtml(t('cb_remove'))}" title="${escHtml(t('cb_remove'))}">×</button></div>`;
}
const cbHeadHtml = () => `<div class="cb-row-s cb-row-h"><span>${t('cb_col_fam')}</span><span>${t('cb_col_mid')}</span><span>${t('cb_col_giv')}</span><span>${t('cb_col_en')}</span><span></span></div>`;

function renderClassBuilder(body){
  body.innerHTML = '<div class="cb"><div class="cb-tabs" role="tablist"></div><div class="cb-pane" role="tabpanel"></div></div>';
  const tabsEl = body.querySelector('.cb-tabs'), pane = body.querySelector('.cb-pane');
  let paneCleanup = null;
  function stopPane(){ if(paneCleanup){ try{ paneCleanup(); }catch(e){} paneCleanup = null; } }
  function draw(){
    stopPane();
    tabsEl.innerHTML = CB_TABS.map(k => `<button type="button" role="tab" class="cb-tab${k === cbTab ? ' active' : ''}" data-tab="${k}" aria-selected="${k === cbTab}">${t('cb_tab_' + k)}</button>`).join('');
    pane.innerHTML = '';
    const fn = { classes:cbPaneClasses, students:cbPaneStudents, pick:cbPanePick, cloud:cbPaneCloud }[cbTab];
    paneCleanup = fn(pane, draw) || null;
  }
  tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b && b.dataset.tab !== cbTab){ cbTab = b.dataset.tab; draw(); } });
  cbRedraw = draw; draw();
  return () => { stopPane(); if(cbRedraw === draw) cbRedraw = null; };
}

/* ----- Classes ----- */
function cbPaneClasses(pane){
  const D = cbDraftGet();
  pane.innerHTML = `
    <p class="cb-hint">${t('classes_hint')}</p>
    <div class="cb-classes" id="cb-class-list"></div>
    <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-copy">${t('class_copy')}</button></div>
    <p class="cb-hint">${t('class_copy_hint')}</p>
    <details class="cb-new" id="cb-new"${D.open ? ' open' : ''}>
      <summary>${t('cb_new_class')}</summary>
      <label class="cb-field"><span>${t('cb_class_name')}</span><input type="text" id="cb-new-name" placeholder="${escHtml(t('class_name_ph'))}"></label>
      <p class="cb-hint">${t('cb_students_hint')}</p>
      ${cbHeadHtml()}
      <div class="cb-rows" id="cb-new-rows"></div>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-new-addrow">${t('cb_add_student')}</button></div>
      <label class="cb-field"><span>${t('cb_paste_label')}</span><textarea id="cb-new-paste" rows="3" placeholder="${escHtml(t('cb_paste_ph'))}"></textarea></label>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-new-paste-add">${t('cb_paste_add')}</button><button type="button" class="wbtn primary" id="cb-new-create">${t('class_add_btn')}</button></div>
    </details>`;
  const list = pane.querySelector('#cb-class-list');
  classes.list.forEach(c => {
    const m = classMeta(c.id), cur = c.id === activeClassId();
    const row = document.createElement('div');
    row.className = 'class-row cb-class-row' + (cur ? ' current' : '');
    row.innerHTML = '<input type="text" class="class-row-name"><span class="cb-meta"></span><button class="class-row-btn open" type="button"></button><button class="class-row-btn del" type="button">×</button>';
    const input = row.querySelector('.class-row-name');
    input.value = c.name || ''; input.placeholder = t('class_default_name');
    input.addEventListener('change', () => renameClass(c.id, input.value));
    row.querySelector('.cb-meta').textContent = t('cb_n_students', { n:m.n }) + (m.cloud ? ' ☁️' : '');
    const openBtn = row.querySelector('.open');
    openBtn.textContent = cur ? t('class_current') : t('class_switch_to'); openBtn.disabled = cur;
    openBtn.addEventListener('click', () => { renameClass(c.id, input.value); switchClass(c.id); });
    const del = row.querySelector('.del'); del.title = t('class_delete'); del.setAttribute('aria-label', t('class_delete'));
    del.addEventListener('click', () => deleteClass(c.id));
    list.appendChild(row);
  });
  pane.querySelector('#cb-copy').addEventListener('click', () => addClass(`${classDisplayName(activeClass())} (${t('class_copy_suffix')})`, true));
  // --- the new-class form (kept in cbDraft so switching tabs doesn't lose it) ---
  const det = pane.querySelector('#cb-new'), nameIn = pane.querySelector('#cb-new-name'), rowsEl = pane.querySelector('#cb-new-rows');
  det.addEventListener('toggle', () => { D.open = det.open; });
  nameIn.value = D.name; nameIn.addEventListener('input', () => { D.name = nameIn.value; });
  function drawRows(){ rowsEl.innerHTML = D.rows.map((r, i) => cbRowHtml(r, `data-i="${i}"`)).join(''); }
  rowsEl.addEventListener('input', e => { const inp = e.target.closest('input[data-f]'); if(inp) D.rows[+inp.closest('[data-i]').dataset.i][inp.dataset.f] = inp.value; });
  rowsEl.addEventListener('click', e => { const x = e.target.closest('[data-del]'); if(!x) return; D.rows.splice(+x.closest('[data-i]').dataset.i, 1); if(!D.rows.length) D.rows.push(cbBlankRow()); drawRows(); });
  pane.querySelector('#cb-new-addrow').addEventListener('click', () => { D.rows.push(cbBlankRow()); drawRows(); const last = rowsEl.querySelector('.cb-row-s:last-child input'); if(last) last.focus(); });
  pane.querySelector('#cb-new-paste-add').addEventListener('click', () => {
    const ta = pane.querySelector('#cb-new-paste'), added = ta.value.split(/\r?\n/).map(parseStudentLine).filter(Boolean);
    if(!added.length) return;
    D.rows = D.rows.filter(r => r.fam || r.mid || r.giv || r.en).concat(added.map(s => ({ fam:s.fam, mid:s.mid, giv:s.giv, en:s.en })));
    ta.value = ''; drawRows();
  });
  pane.querySelector('#cb-new-create').addEventListener('click', () => {
    const students = D.rows.filter(r => r.fam.trim() || r.mid.trim() || r.giv.trim() || r.en.trim()).map(r => ({ id:cid(), fam:r.fam.trim(), mid:r.mid.trim(), giv:r.giv.trim(), en:r.en.trim() }));
    const name = D.name; cbDraft = null;
    addClass(name, false, students);
  });
  drawRows();
}

/* ----- Students (the open class) ----- */
function cbPaneStudents(pane){
  pane.innerHTML = `
    <div class="cb-head"><b>${escHtml(classDisplayName(activeClass()))}</b><span class="cb-meta" id="cb-count"></span></div>
    ${cbHeadHtml()}
    <div class="cb-rows" id="cb-rows"></div>
    <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-addrow">${t('cb_add_student')}</button><button type="button" class="wbtn" id="cb-sort">${t('cb_sort')}</button></div>
    <label class="cb-field"><span>${t('cb_paste_label')}</span><textarea id="cb-paste" rows="3" placeholder="${escHtml(t('cb_paste_ph'))}"></textarea></label>
    <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-paste-add">${t('cb_paste_add')}</button></div>
    <label class="cb-field"><span>${t('cb_show_as')}</span><select id="cb-mode"><option value="both">${t('cb_mode_both')}</option><option value="english">${t('cb_mode_en')}</option><option value="vietnamese">${t('cb_mode_vi')}</option></select></label>
    <p class="cb-hint" id="cb-preview"></p>`;
  const rowsEl = pane.querySelector('#cb-rows'), sel = pane.querySelector('#cb-mode');
  function meta(){
    pane.querySelector('#cb-count').textContent = t('cb_n_students', { n:state.roster.length });
    pane.querySelector('#cb-preview').textContent = state.roster.length ? `${t('cb_preview')}: ${state.roster.slice(0, 3).join(' · ')}` : t('cb_no_students');
  }
  function drawRows(){ rowsEl.innerHTML = state.students.map(s => cbRowHtml(s, `data-id="${s.id}"`)).join(''); meta(); }
  sel.value = state.rosterNames;
  sel.addEventListener('change', () => { mutateStudents(() => { state.rosterNames = sel.value; }); meta(); });
  rowsEl.addEventListener('change', e => {
    const inp = e.target.closest('input[data-f]'); if(!inp) return;
    const s = state.students.find(x => x.id === inp.closest('[data-id]').dataset.id); if(!s) return;
    mutateStudents(() => { s[inp.dataset.f] = inp.value.trim().replace(/ {2,}/g, ' '); });
    inp.value = s[inp.dataset.f]; meta();
  });
  rowsEl.addEventListener('click', e => {
    const x = e.target.closest('[data-del]'); if(!x) return;
    const id = x.closest('[data-id]').dataset.id;
    mutateStudents(() => { state.students = state.students.filter(s => s.id !== id); });
    drawRows();
  });
  pane.querySelector('#cb-addrow').addEventListener('click', () => {
    state.students.push({ id:cid(), ...cbBlankRow() }); drawRows();
    const last = rowsEl.querySelector('.cb-row-s:last-child input'); if(last) last.focus();
  });
  pane.querySelector('#cb-sort').addEventListener('click', () => {      // Vietnamese convention: alphabetical by given name (Tên), then family name
    mutateStudents(() => { state.students.sort((a, b) => String(a.giv || a.fam).localeCompare(String(b.giv || b.fam), 'vi') || String(a.fam).localeCompare(String(b.fam), 'vi') || String(a.mid).localeCompare(String(b.mid), 'vi')); });
    drawRows();
  });
  pane.querySelector('#cb-paste-add').addEventListener('click', () => {
    const ta = pane.querySelector('#cb-paste'), added = ta.value.split(/\r?\n/).map(parseStudentLine).filter(Boolean);
    if(!added.length) return;
    mutateStudents(() => { state.students.push(...added); });
    ta.value = ''; drawRows(); toast(t('cb_added_n', { n:added.length }));
  });
  drawRows();
  return () => { const keep = state.students.filter(s => studentDisplay(s)); if(keep.length !== state.students.length){ state.students = keep; syncRoster(true); } };   // drop rows left blank
}

/* ----- Pick & Groups: the Name Picker and Group Maker, drawn from this class ----- */
function cbPanePick(pane){
  pane.innerHTML = `<section class="cb-sub"><h4>${escHtml(widgetLabel('namepicker'))}</h4><div id="cb-np"></div></section><section class="cb-sub"><h4>${escHtml(widgetLabel('groupmaker'))}</h4><div id="cb-gm"></div></section>`;
  const c1 = renderNamePicker(pane.querySelector('#cb-np')), c2 = renderGroupMaker(pane.querySelector('#cb-gm'));
  return () => { [c1, c2].forEach(c => { if(typeof c === 'function'){ try{ c(); }catch(e){} } }); };
}

/* ----- Cloud: convert, then the StudentDeck / ParentDeck / AdminDeck tables ----- */
const nameKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '');
function studentKeys(s){
  const vi = viFullName(s), en = String(s.en || '').trim();
  return [...new Set([vi, en, studentDisplay(s, 'both'), en + ' ' + vi, vi + ' ' + en, [s.giv, s.fam].filter(Boolean).join(' ')].map(nameKey).filter(Boolean))];
}
function cbMatch(locals, clouds){            // match what students typed when they joined to the names on your list (ignores accents, case and spaces)
  const map = new Map(), used = new Set();
  locals.forEach(s => { const keys = studentKeys(s), hit = clouds.find(c => !used.has(c.id) && keys.includes(nameKey(c.displayName))); if(hit){ map.set(s.id, hit); used.add(hit.id); } });
  locals.forEach(s => {                      // second pass: one unambiguous "starts with" match (e.g. they typed only "Minh Tran")
    if(map.has(s.id)) return;
    const keys = studentKeys(s).filter(k => k.length >= 3);
    const cand = clouds.filter(c => { if(used.has(c.id)) return false; const ck = nameKey(c.displayName); return ck.length >= 3 && keys.some(k => k.startsWith(ck) || ck.startsWith(k)); });
    if(cand.length === 1){ map.set(s.id, cand[0]); used.add(cand[0].id); }
  });
  return { map, extra:clouds.filter(c => !used.has(c.id)) };
}
const cbTsMs = v => !v ? 0 : (typeof v.toMillis === 'function' ? v.toMillis() : (v.seconds ? v.seconds * 1000 : (typeof v === 'number' ? v : 0)));
const cbDate = ms => ms ? new Date(ms).toLocaleDateString(state.lang === 'vi' ? 'vi-VN' : undefined, { month:'short', day:'numeric' }) : '—';
const CB_MOOD = { smiley:'😊', frowny:'☹️', neutral:'😐' };

function cbPaneCloud(pane){
  if(!TDCloud.isConfigured()){ pane.innerHTML = notConfiguredHtml(); return null; }
  const unsubs = []; let sub = 'student';
  const stop = () => { unsubs.forEach(u => { try{ u(); }catch(e){} }); unsubs.length = 0; };
  const unAuth = TDCloud.onAuthChanged(() => paint());
  function refreshCloudWidgets(){ if(widgetEls.cloudclass){ closeWidget('cloudclass'); openWidget('cloudclass'); syncDock(); } }
  function paint(){
    stop();
    const session = TDCloud.getSession();
    if(!session){
      pane.innerHTML = `<p class="cb-hint">${t('cb_cloud_intro')}</p><div class="btn-row cb-row"><button type="button" class="wbtn primary" id="cb-signin">${t('cc_signin')}</button></div>`;
      pane.querySelector('#cb-signin').addEventListener('click', async () => { try{ await TDCloud.signIn(); }catch(e){ toast(e.message || String(e)); } });
      return;
    }
    if(!state.cloudClassId) return paintConvert(session);
    paintLinked(session);
  }
  function paintConvert(session){
    pane.innerHTML = `
      <p class="cb-hint">${t('cc_signed_in_as', { name:escHtml(session.displayName || session.email || '') })}</p>
      <p class="cb-hint cb-left">${t('cb_cloud_convert_hint')}</p>
      <label class="cb-field"><span>${t('cb_cloud_name')}</span><input type="text" id="cb-cname-in" value="${escHtml(activeClass().name || '')}" placeholder="${escHtml(t('cc_class_name_ph'))}"></label>
      <div class="btn-row cb-row"><button type="button" class="wbtn primary" id="cb-convert">☁️ ${t('cb_cloud_convert')}</button></div>
      <p class="cb-hint" id="cb-pick-label">${t('cc_or_pick')}</p>
      <div class="scroll-list" id="cb-pick-list"></div>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-signout">${t('cc_sign_out')}</button></div>`;
    const link = id => { state.cloudClassId = id; TDCloud.resetCalendarSyncCache(); TDCloud.resetHomeworkSyncCache(); saveState(); refreshCloudWidgets(); buildClassList(); paint(); };
    pane.querySelector('#cb-convert').addEventListener('click', async e => {
      const btn = e.currentTarget, name = pane.querySelector('#cb-cname-in').value.trim() || classDisplayName(activeClass());
      btn.disabled = true;
      try{ const res = await TDCloud.createClass(name); if(!(activeClass().name || '').trim()) renameClass(activeClassId(), name); link(res.classId); toast(t('cb_converted')); }
      catch(err){ btn.disabled = false; toast(err.message || String(err)); }
    });
    pane.querySelector('#cb-signout').addEventListener('click', () => TDCloud.signOut());
    TDCloud.myClasses().then(list => {
      const el = pane.querySelector('#cb-pick-list'); if(!el) return;
      if(!list.length){ el.innerHTML = '<p class="small-hint">—</p>'; return; }
      el.innerHTML = list.map(c => `<button type="button" class="wbtn cc-pick" data-id="${escHtml(c.id)}">${escHtml(c.className)}</button>`).join('');
      el.querySelectorAll('.cc-pick').forEach(b => b.addEventListener('click', () => link(b.dataset.id)));
    }).catch(() => {});
  }
  function paintLinked(session){
    pane.innerHTML = `
      <div class="cb-head"><b id="cb-cname"></b><span class="cb-meta">☁️ ${t('cb_linked')}</span></div>
      <div id="cb-codes"></div>
      <div class="cb-seg" role="tablist">${['student', 'parent', 'admin'].map(k => `<button type="button" role="tab" class="cb-segb${k === sub ? ' active' : ''}" data-sub="${k}">${t('cb_seg_' + k)}</button>`).join('')}</div>
      <div class="cb-tablewrap" id="cb-table"></div>
      <div id="cb-extra"></div>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-copy-table">${t('cb_copy_table')}</button><button type="button" class="wbtn" id="cb-slips">🖨️ ${t('cb_slips')}</button></div>
      <p class="cb-hint" id="cb-note"></p>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-unlink">${t('cb_unlink')}</button></div>`;
    let cls = null, roster = [], notes = [], theme = null, tsv = [];
    const $ = s => pane.querySelector(s);
    const table = (head, rows) => `<table class="cb-table"><thead><tr>${head.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    function drawAll(){
      $('#cb-cname').textContent = (cls && cls.className) || classDisplayName(activeClass());
      $('#cb-codes').innerHTML = cls ? ['student', 'parent'].map(w => { const code = cls[w + 'JoinCode'] || ''; return `<div class="cc-code-row"><span>${t('cc_' + w + '_code')}: <b>${escHtml(code)}</b></span><span class="cc-code-btns"><button type="button" class="wbtn" data-copy="${escHtml(code)}">${t('cc_copy')}</button><button type="button" class="wbtn" data-which="${w}">${t('cc_regenerate')}</button></span></div>`; }).join('') : `<p class="cb-hint">${t('cb_cloud_missing')}</p>`;
      pane.querySelectorAll('.cb-seg [data-sub]').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
      const { map, extra } = cbMatch(state.students, roster), tableEl = $('#cb-table'), extraEl = $('#cb-extra'); extraEl.innerHTML = '';
      let head, rows;
      if(sub === 'student'){
        head = [t('cb_h_student'), t('cb_h_status'), t('cb_h_points'), t('cb_h_level'), t('cb_h_streak'), t('cb_h_last')];
        rows = state.students.filter(s => studentDisplay(s)).map(s => { const c = map.get(s.id); return [studentDisplay(s), c ? '✅ ' + t('cb_joined') : '⏳ ' + t('cb_notyet'), c ? String(c.xp || 0) : '—', c ? String(c.level || 1) : '—', c && c.practice ? String(c.practice.streak || 0) : '—', c ? cbDate(cbTsMs(c.lastActiveAt) || cbTsMs(c.practice && c.practice.updatedAt)) : '—']; });
        $('#cb-note').textContent = `${t('cb_joined_sum', { j:map.size, n:rows.length })} · ${t('cb_student_note')}`;
        if(extra.length){
          extraEl.innerHTML = `<p class="cb-sub-h">${t('cb_unmatched_title')}</p>` + extra.map(c => `<div class="cb-unm"><span>${escHtml(c.displayName || '?')}</span><button type="button" class="wbtn" data-add="${escHtml(c.id)}">${t('cb_add_to_list')}</button></div>`).join('');
        }
      }else if(sub === 'parent'){
        head = [t('cb_h_student'), t('cb_h_sent'), t('cb_h_unread'), t('cb_h_latest')];
        rows = state.students.filter(s => studentDisplay(s)).map(s => {
          const c = map.get(s.id), mine = c ? notes.filter(n => n.studentId === c.id) : [], last = mine.slice().sort((a, b) => cbTsMs(b.createdAt) - cbTsMs(a.createdAt))[0];
          return [studentDisplay(s), c ? String(mine.length) : '—', c ? String(mine.filter(n => !n.read).length) : '—', last ? `${cbDate(cbTsMs(last.createdAt))} ${CB_MOOD[last.mood] || ''}`.trim() : '—'];
        });
        $('#cb-note').textContent = t('cb_parent_note', { code:cls ? (cls.parentJoinCode || '') : '' });
      }else{
        const n = state.students.filter(s => studentDisplay(s)).length;
        head = [t('cb_h_item'), t('cb_h_value')];
        rows = [
          [t('cb_a_class'), (cls && cls.className) || classDisplayName(activeClass())],
          [t('cb_a_teacher'), session.displayName || session.email || '—'],
          [t('cb_a_id'), state.cloudClassId],
          [t('cb_a_students'), `${n} · ${t('cb_joined_sum', { j:map.size, n })}`],
          [t('cb_a_codes'), cls ? `${cls.studentJoinCode || '—'} / ${cls.parentJoinCode || '—'}` : '—'],
          [t('cb_a_ranking'), (cls && cls.rankingVisibility) || 'anonymized'],
          [t('cb_a_homework'), String((state.assignments || []).length)],
          [t('cb_a_calendar'), String((state.calendarEvents || []).length)],
          [t('cb_a_theme'), theme ? t('cb_a_theme_yes') : t('cb_a_theme_no')]
        ];
        $('#cb-note').textContent = t('cb_admin_note');
      }
      tsv = [head].concat(rows);
      tableEl.innerHTML = table(head, rows);
    }
    pane.addEventListener('click', async e => {
      const seg = e.target.closest('[data-sub]'); if(seg){ sub = seg.dataset.sub; drawAll(); return; }
      const cp = e.target.closest('[data-copy]'); if(cp){ toast(await ccCopyText(cp.dataset.copy) ? t('cc_copied', { code:cp.dataset.copy }) : t('cc_copy_fail')); return; }
      const rg = e.target.closest('[data-which]'); if(rg){ try{ await TDCloud.regenerateJoinCode(state.cloudClassId, rg.dataset.which); }catch(err){ toast(err.message || String(err)); } return; }
      const ad = e.target.closest('[data-add]'); if(ad){ const c = roster.find(x => x.id === ad.dataset.add); if(c){ mutateStudents(() => { state.students.push({ id:cid(), ...splitVietnameseName(c.displayName), en:'' }); }); drawAll(); } return; }
    });
    $('#cb-copy-table').addEventListener('click', async () => toast(await ccCopyText(tsv.map(r => r.join('\t')).join('\n')) ? t('cb_table_copied') : t('cc_copy_fail')));
    $('#cb-slips').addEventListener('click', () => cbPrintSlips(cls));
    $('#cb-unlink').addEventListener('click', () => { if(!confirm(t('cb_unlink_confirm'))) return; state.cloudClassId = null; TDCloud.resetCalendarSyncCache(); TDCloud.resetHomeworkSyncCache(); saveState(); refreshCloudWidgets(); buildClassList(); paint(); });
    unsubs.push(TDCloud.subscribeClass(state.cloudClassId, c => { cls = c; drawAll(); }));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, l => { roster = l; drawAll(); }));
    unsubs.push(TDCloud.subscribeNotes(state.cloudClassId, l => { notes = l || []; drawAll(); }));
    unsubs.push(TDCloud.subscribeAdminTheme(state.cloudClassId, th => { theme = th; drawAll(); }));
    drawAll();
  }
  paint();
  return () => { stop(); unAuth(); };
}
function cbPrintSlips(cls){
  if(!cls){ toast(t('cb_cloud_missing')); return; }
  const w = window.open('', '_blank'); if(!w){ toast(t('cb_popup_blocked')); return; }
  const slips = state.students.filter(s => studentDisplay(s)).map(s => `<div class="slip"><h3>${escHtml(studentDisplay(s))}</h3><p>${escHtml(t('cb_slip_student', { code:cls.studentJoinCode || '', name:studentDisplay(s) }))}</p><p><small>${escHtml(t('cb_slip_parent', { code:cls.parentJoinCode || '' }))}</small></p></div>`).join('');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${escHtml(cls.className || '')}</title><style>body{font:14px system-ui,sans-serif;margin:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.slip{border:1.5px dashed #888;border-radius:10px;padding:10px 12px;break-inside:avoid}h3{margin:0 0 6px;font-size:15px}p{margin:4px 0}small{color:#555}button{margin-bottom:12px;padding:6px 12px}@media print{button{display:none}}</style><button onclick="print()">🖨️ ${escHtml(t('cb_slips'))}</button><h2>${escHtml(cls.className || '')}</h2><div class="grid">${slips}</div>`);
  w.document.close();
}

/* ---- Settings + top-right class switcher hand over to Class Builder ---- */

/* v0.21.2 strings: attendance shared with families, Class Pulse switch, family codes. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  att_share_label:     { en:'Share with families (ParentDeck)', vi:'Chia sẻ với phụ huynh (ParentDeck)' },
  att_share_off:       { en:'Off: attendance stays on this device.', vi:'Tắt: điểm danh chỉ lưu trên máy này.' },
  att_share_on:        { en:'On: present / late / absent is shared with each child\u2019s own parents. {n} of {total} names are matched to the cloud class.', vi:'Bật: có mặt / muộn / vắng được chia sẻ với phụ huynh của từng em. {n}/{total} tên đã khớp với lớp trên mạng.' },
  att_share_confirm:   { en:'Share attendance with families? Each parent sees only their own child\u2019s present / late / absent days (no notes). Your records from the last year will be shared now.', vi:'Chia sẻ điểm danh với phụ huynh? Mỗi phụ huynh chỉ thấy ngày có mặt / muộn / vắng của con mình (không có ghi chú). Dữ liệu của năm qua sẽ được chia sẻ ngay.' },
  att_unshare_confirm: { en:'Stop sharing. Also remove the days already shared from ParentDeck? (OK = remove, Cancel = keep them visible)', vi:'Dừng chia sẻ. Xóa luôn các ngày đã chia sẻ khỏi ParentDeck? (OK = xóa, Hủy = giữ lại)' },
  att_share_failed:    { en:'Attendance couldn\u2019t be shared right now (offline, or the backend is older than v2.0.0). It is still saved here.', vi:'Chưa chia sẻ được điểm danh (mất mạng hoặc máy chủ cũ hơn v2.0.0). Dữ liệu vẫn được lưu tại đây.' },
  cc_pulse_label:      { en:'Class Pulse for families', vi:'Class Pulse cho phụ huynh' },
  cc_pulse_hint:       { en:'Parents who turn it on see their child\u2019s week beside the typical range for the class: ranges only, never names, ranks or another child\u2019s numbers. Classes under 5 students never show it.', vi:'Phụ huynh bật tính năng này sẽ thấy tuần của con bên cạnh khoảng phổ biến của lớp: chỉ là khoảng số, không có tên, thứ hạng hay số liệu của em khác. Lớp dưới 5 học sinh không hiển thị.' },
  cc_pulse_on:         { en:'Class Pulse is on for this class.', vi:'Đã bật Class Pulse cho lớp này.' },
  cc_pulse_off:        { en:'Class Pulse is off for this class.', vi:'Đã tắt Class Pulse cho lớp này.' },
  cc_school:           { en:'School', vi:'Trường' },
  cc_school_none:      { en:'Not in a school yet. Enter the school code from your school admin to join; your classes move with you.', vi:'Chưa thuộc trường nào. Nhập mã trường do quản trị viên cung cấp để tham gia; các lớp của bạn sẽ chuyển theo.' },
  cc_school_in:        { en:'You are in {name}. Your school admin sees your classes in AdminDeck. Another code moves you and your classes.', vi:'Bạn thuộc {name}. Quản trị viên trường xem được các lớp của bạn trong AdminDeck. Nhập mã khác để chuyển trường.' },
  cc_school_join:      { en:'Join', vi:'Tham gia' },
  cc_school_need_code: { en:'Enter the school code first.', vi:'Hãy nhập mã trường trước.' },
  cc_school_joined:    { en:'You joined {name}.', vi:'Bạn đã tham gia {name}.' },
  an_title:            { en:'From your school', vi:'Từ nhà trường' },
  an_title_new:        { en:'From your school ({n} new)', vi:'Từ nhà trường ({n} mới)' },
  an_gotit:            { en:'✓ Got it', vi:'✓ Đã xem' },
  an_toast:            { en:'📬 New note from your school (Cloud Class)', vi:'📬 Có ghi chú mới từ nhà trường (Cloud Class)' },
  cc_family_codes:     { en:'Family codes', vi:'Mã gia đình' },
  cc_family_hint:      { en:'Each student has their own code; their parents type it into ParentDeck to link. Students see theirs in StudentDeck \u2192 Class. Give each code only to that child\u2019s family.', vi:'Mỗi học sinh có mã riêng; phụ huynh nhập mã vào ParentDeck để liên kết. Học sinh xem mã trong StudentDeck \u2192 Lớp. Chỉ đưa mỗi mã cho đúng gia đình của em đó.' },
  cc_family_show:      { en:'Show family codes', vi:'Hiện mã gia đình' },
  cc_family_loading:   { en:'Loading\u2026', vi:'Đang tải\u2026' },
  cc_family_none:      { en:'No students have joined this class yet.', vi:'Chưa có học sinh nào tham gia lớp này.' },
  cc_family_unavailable:{ en:'Family codes need backend v2.0.0 or later.', vi:'Mã gia đình cần máy chủ phiên bản v2.0.0 trở lên.' },
  cc_family_copy:      { en:'Copy all', vi:'Sao chép tất cả' },
  cc_family_copied:    { en:'Family codes copied.', vi:'Đã sao chép mã gia đình.' },
  cc_family_copy_failed:{ en:'Couldn\u2019t copy. Select the codes and copy them by hand.', vi:'Không sao chép được. Hãy chọn và sao chép thủ công.' },
  cc_family_new_title: { en:'Make a new code (if this one reached the wrong family)', vi:'Tạo mã mới (nếu mã này đến nhầm gia đình)' },
  cc_family_new_confirm:{ en:'Make a new family code for this student? The old code stops working. Parents already linked stay linked.', vi:'Tạo mã gia đình mới cho học sinh này? Mã cũ sẽ ngừng hoạt động. Phụ huynh đã liên kết vẫn giữ liên kết.' },
});

/* v0.27.0 (backend v2.8.0) strings: Scrapbook Review (Scrapdeck M3). Languages not listed fall back to English. */
Object.assign(STRINGS, {
  srv_need_class:   { en:'Link this class to the cloud (Cloud Class) to review pages students share from Scrapdeck.', vi:'Liên kết lớp này với đám mây (Lớp học đám mây) để duyệt các trang học sinh chia sẻ từ Scrapdeck.' },
  srv_gallery_label:{ en:'Classmates’ gallery', vi:'Thư viện của cả lớp' },
  srv_gallery_hint: { en:'When on, pages approved and shared “to my class” also appear in a gallery classmates can browse in StudentDeck (first names only). Off by default.', vi:'Khi bật, các trang đã duyệt và chia sẻ “với lớp của tôi” sẽ xuất hiện trong thư viện mà bạn cùng lớp có thể xem trong StudentDeck (chỉ tên). Mặc định tắt.' },
  srv_f_pending:    { en:'Waiting', vi:'Đang chờ' },
  srv_f_approved:   { en:'Approved', vi:'Đã duyệt' },
  srv_f_hidden:     { en:'Hidden', vi:'Đã ẩn' },
  srv_f_all:        { en:'All', vi:'Tất cả' },
  srv_empty:        { en:'Nothing here yet.', vi:'Chưa có gì ở đây.' },
  srv_loading:      { en:'Loading…', vi:'Đang tải…' },
  srv_aud_family:   { en:'family', vi:'gia đình' },
  srv_aud_class:    { en:'class', vi:'lớp' },
  srv_status_pending: { en:'waiting for your review', vi:'đang chờ bạn duyệt' },
  srv_status_approved:{ en:'approved', vi:'đã duyệt' },
  srv_status_hidden:  { en:'hidden', vi:'đã ẩn' },
  srv_approve:      { en:'✓ Approve', vi:'✓ Duyệt' },
  srv_hide:         { en:'Hide', vi:'Ẩn' },
  srv_toast_approved:{ en:'Approved — the family/class can now see it.', vi:'Đã duyệt — gia đình/lớp có thể xem.' },
  srv_toast_hidden: { en:'Hidden.', vi:'Đã ẩn.' },
  srv_action_fail:  { en:'Couldn’t do that right now — try again.', vi:'Không thực hiện được — hãy thử lại.' },
  srv_load_fail:    { en:'Couldn’t load shared pages right now.', vi:'Không tải được các trang đã chia sẻ.' },
});

/* v0.29.0 (backend v2.9.0) strings: Board Assignments review (DrawDeck scope step D). Languages not listed fall back to English. */
Object.assign(STRINGS, {
  brv_need_class: { en:'Link this class to the cloud (Cloud Class) to review board assignments.', vi:'Liên kết lớp này với đám mây (Lớp học đám mây) để duyệt bài giao trên bảng.' },
  brv_none:       { en:'No assignments yet — push a page from DrawDeck’s More menu (“Assign this page to students”).', vi:'Chưa có bài giao nào — hãy gửi một trang từ menu Thêm của DrawDeck (“Giao trang này cho học sinh”).' },
  brv_open:       { en:'Open', vi:'Đang mở' },
  brv_closed:     { en:'Closed', vi:'Đã đóng' },
  brv_review:     { en:'Review', vi:'Duyệt' },
  brv_close:      { en:'Close', vi:'Đóng' },
  brv_reopen:     { en:'Reopen', vi:'Mở lại' },
  brv_back:       { en:'← All assignments', vi:'← Tất cả bài giao' },
  brv_empty:      { en:'No submissions yet.', vi:'Chưa có bài nộp nào.' },
  brv_submitted:  { en:'Submitted — not graded yet', vi:'Đã nộp — chưa chấm' },
  brv_graded:     { en:'Graded — +{n} XP', vi:'Đã chấm — +{n} XP' },
  brv_xp_ph:      { en:'XP', vi:'XP' },
  brv_award:      { en:'Award', vi:'Trao thưởng' },
  brv_award_reason:{ en:'Board assignment: {title}', vi:'Bài giao trên bảng: {title}' },
  brv_awarded:    { en:'Awarded {n} XP!', vi:'Đã trao {n} XP!' },
  brv_amount_zero:{ en:'Enter how much XP to award.', vi:'Nhập số XP muốn trao.' },
  brv_action_fail:{ en:'Couldn’t do that right now — try again.', vi:'Không thực hiện được — hãy thử lại.' },
  brv_load_fail:  { en:'Couldn’t load submissions right now.', vi:'Không tải được bài nộp.' },
});

/* v0.21.0 strings: Reward Points, Notes Home mail layout, Cloud Class. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  rewardpoints:     { en:'🏅 Badges & Rewards', vi:'🏅 Huy hiệu & Điểm thưởng' },
  wc_rewardpoints:  { en:'Each student’s badges (automatic, no setup), plus your rewards catalog, what students redeemed, and everyone’s class points.', vi:'Huy hiệu của từng học sinh (tự động, không cần thiết lập), cùng danh mục phần thưởng, những gì học sinh đã đổi, và điểm lớp của mọi người.' },
  rp_tab_badges:    { en:'🏅 Badges', vi:'🏅 Huy hiệu' },
  rp_tab_rewards:   { en:'🎁 Rewards', vi:'🎁 Điểm thưởng' },
  rp_badges_none_yet:{ en:'No badges yet', vi:'Chưa có huy hiệu' },
  rp_top_badge:     { en:'Top badge', vi:'Huy hiệu cao nhất' },
  rp_redeemed_by:   { en:'Rewards redeemed by {name}', vi:'Phần thưởng {name} đã đổi' },
  rp_desc_ph:       { en:'Description (optional)', vi:'Mô tả (tùy chọn)' },
  rp_afford:        { en:'{n} of {m} students can afford this', vi:'{n}/{m} học sinh đủ điểm đổi' },
  rp_off:           { en:'Hidden from students', vi:'Đang ẩn với học sinh' },
  rp_hide:          { en:'Hide', vi:'Ẩn' },
  rp_show:          { en:'Show', vi:'Hiện' },
  rp_delete:        { en:'Delete reward', vi:'Xóa phần thưởng' },
  rp_delete_confirm:{ en:'Delete the reward “{name}”?', vi:'Xóa phần thưởng “{name}”?' },
  rp_redeemed:      { en:'Recently redeemed', vi:'Mới đổi gần đây' },
  rp_redeemed_none: { en:'Nothing redeemed yet.', vi:'Chưa có phần thưởng nào được đổi.' },
  rp_balances:      { en:'Class points', vi:'Điểm lớp' },
  cc_settings:      { en:'Class settings', vi:'Cài đặt lớp' },
  nh_search_ph:     { en:'Search students', vi:'Tìm học sinh' },
  nh_all_notes:     { en:'All notes', vi:'Tất cả ghi chú' },
  nh_n_sent:        { en:'{n} sent', vi:'{n} đã gửi' },
  nh_no_notes_yet:  { en:'No notes yet', vi:'Chưa có ghi chú' },
  nh_to:            { en:'To', vi:'Gửi tới' },
  nh_from:          { en:'From', vi:'Từ' },
  nh_pick_left:     { en:'Tick students on the left', vi:'Tích chọn học sinh ở bên trái' },
  nh_more_n:        { en:'+{n} more', vi:'+{n} nữa' },
  nh_remove_recipient:{ en:'Remove recipient', vi:'Bỏ người nhận' },
  nh_n_students:    { en:'{n} students', vi:'{n} học sinh' },
  nh_read_n:        { en:'{r} of {n} read', vi:'{r}/{n} đã đọc' },
  nh_all_read:      { en:'Read by all', vi:'Tất cả đã đọc' }
});
// Stats & XP is the teacher's OWN stats (the students' are in Student Stats), so it says so.
STRINGS.stats = { en:'📈 My Stats & XP', vi:'Thống kê & XP của tôi' };
STRINGS.xp_pill_tip = { en:'My Stats & XP — click to open', vi:'Thống kê & XP của tôi — nhấn để mở' };
STRINGS.files_time_hint = { en:'📄 Time you spend with a document open counts toward My Stats & XP.', vi:'📄 Thời gian mở tài liệu được tính vào Thống kê & XP của tôi.' };
STRINGS.bd_have_one = { en:'🏅 You already earned 1 badge! Open your Badge Display Case to see it.', vi:'🏅 Bạn đã đạt 1 huy hiệu! Mở Tủ huy hiệu để xem.' };
STRINGS.bd_have_many = { en:'🏅 You already earned {n} badges! Open your Badge Display Case to see them.', vi:'🏅 Bạn đã đạt {n} huy hiệu! Mở Tủ huy hiệu để xem.' };

/* ---------------- Reward Points (v0.21.0) ----------------
   The rewards catalog moved here from Cloud Class: add / hide / delete rewards, who can afford each one, what students recently redeemed, and every
   student's class points. Awarding and removing points still happens on each student's row in Cloud Class. Same cloud calls as before
   (saveReward / deleteReward / subscribeRewards) — nothing new is stored or sent. */
function openWidgetSmart(id){          // open it, un-minimise it or bring it to the front
  if(isOff(id)) setWidgetOff(id, false);
  if(!state.active[id]){ toggleWidget(id); return; }
  const lay = state.layout[id]; if(lay && lay.minimized) toggleMinimize(id);
  const o = widgetEls[id]; if(o) bringToFront(o.el);
}
// The "View badge case" button on a student's card (Student Stats) calls requestBadgeCase(): it opens (or un-minimises) the
// Badges & Rewards widget with that student's own display case already showing — same pattern as requestNotesHome().
let rpPendingStudent = null;
function requestBadgeCase(studentId){
  rpPendingStudent = studentId;
  openWidgetSmart('rewardpoints');
  document.dispatchEvent(new CustomEvent('td:rewardpoints-pending'));
}
function renderRewardPoints(body){
  const unsubs = []; let rewards = [], roster = [], ledger = [], shownClassId = null;
  let activeTab = 'badges', badgesSel = null;   // v0.22.0: Badges tab is read-only/automatic, so it's the default — zero setup needed
  const stopSubs = ()=>{ unsubs.forEach(u=>{ try{ u(); }catch(e){} }); unsubs.length = 0; };
  const q = s => body.querySelector(s), esc = escHtml;
  const hint = (msg, err)=>{ const el = q('#rp-hint'); if(el){ el.textContent = msg || ''; el.classList.toggle('cc-error', !!err); } };
  const active = r => r.active !== false;
  const medalMini = list => list.map(b=> `<span title="${esc(b.name)}">${medalHtml(b, true)}</span>`).join('');

  function draw(){
    stopSubs(); shownClassId = state.cloudClassId || null;
    if(!TDCloud.isConfigured()){ body.innerHTML = notConfiguredHtml(); return; }
    if(!TDCloud.getSession()){
      body.innerHTML = `<div class="cc-panel"><button class="wbtn primary" id="rp-signin">${t('cc_signin')}</button></div>`;
      q('#rp-signin').addEventListener('click', async ()=>{ try{ await TDCloud.signIn(); draw(); }catch(e){ toast(e.message || String(e)); } });
      return;
    }
    if(!state.cloudClassId){
      body.innerHTML = `<div class="cc-panel"><p class="small-hint">${t('nh_need_cloud')}</p><div class="btn-row"><button class="wbtn primary" id="rp-open-cc">${t('nh_open_cloudclass')}</button></div></div>`;
      q('#rp-open-cc').addEventListener('click', ()=> openWidgetSmart('cloudclass'));
      return;
    }
    body.innerHTML = `<div class="rp-tabs" role="tablist">
        <button type="button" class="rp-tab${activeTab === 'badges' ? ' active' : ''}" data-tab="badges" role="tab" aria-selected="${activeTab === 'badges'}">${t('rp_tab_badges')}</button>
        <button type="button" class="rp-tab${activeTab === 'rewards' ? ' active' : ''}" data-tab="rewards" role="tab" aria-selected="${activeTab === 'rewards'}">${t('rp_tab_rewards')}</button>
      </div>
      <div class="rp-pane" id="rp-pane-badges" ${activeTab === 'badges' ? '' : 'hidden'}></div>
      <div class="rp-pane" id="rp-pane-rewards" ${activeTab === 'rewards' ? '' : 'hidden'}><div class="rp-wrap"><div class="rp">
      <section class="rp-left">
        <p class="field-label">${t('cc_rewards')}</p>
        <div class="rp-add">
          <input type="text" id="rp-name" placeholder="${esc(t('cc_reward_name_ph'))}" maxlength="60">
          <input type="number" id="rp-cost" placeholder="${esc(t('cc_reward_cost_ph'))}" min="1">
          <input type="text" id="rp-desc" placeholder="${esc(t('rp_desc_ph'))}" maxlength="120">
          <button type="button" class="wbtn primary" id="rp-add">${t('cc_add_reward')}</button>
        </div>
        <p class="small-hint" id="rp-hint"></p>
        <div class="rp-list" id="rp-list"></div>
      </section>
      <section class="rp-right">
        <p class="field-label">${t('rp_redeemed')}</p><div class="rp-feed" id="rp-feed"></div>
        <p class="field-label">${t('rp_balances')}</p><div class="rp-bal" id="rp-bal"></div>
      </section></div></div></div>`;
    body.querySelectorAll('.rp-tab').forEach(btn=> btn.addEventListener('click', ()=>{
      activeTab = btn.dataset.tab;
      body.querySelectorAll('.rp-tab').forEach(b=>{ b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
      q('#rp-pane-badges').hidden = activeTab !== 'badges';
      q('#rp-pane-rewards').hidden = activeTab !== 'rewards';
    }));
    q('#rp-add').addEventListener('click', async ()=>{
      const name = q('#rp-name').value.trim(), cost = parseInt(q('#rp-cost').value, 10), description = q('#rp-desc').value.trim();
      if(!name || !Number.isFinite(cost) || cost <= 0) return;
      try{
        await TDCloud.saveReward(state.cloudClassId, { name, cost, description });
        track('reward', name);
        q('#rp-name').value = ''; q('#rp-cost').value = ''; q('#rp-desc').value = ''; hint('');
      }catch(err){ hint(err.message || String(err), true); }
    });
    q('#rp-list').addEventListener('click', e=>{
      const card = e.target.closest('[data-id]'); if(!card) return;
      const r = rewards.find(x=> x.id === card.dataset.id); if(!r) return;
      if(e.target.closest('[data-toggle]')) TDCloud.saveReward(state.cloudClassId, { id:r.id, name:r.name, cost:r.cost, description:r.description || '', active:!active(r) }).catch(err=> hint(err.message || String(err), true));
      else if(e.target.closest('[data-del]')){ if(confirm(t('rp_delete_confirm', { name:r.name }))) TDCloud.deleteReward(state.cloudClassId, r.id).catch(err=> hint(err.message || String(err), true)); }
    });
    unsubs.push(TDCloud.subscribeRewards(state.cloudClassId, list=>{ rewards = list; paintList(); }));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list=>{ roster = list; paintList(); paintBal(); if(rpPendingStudent) applyPending(); else paintBadges(); }));
    unsubs.push(TDCloud.subscribeLedger(state.cloudClassId, rows=>{ ledger = rows; paintFeed(); }));
    unsubs.push(ActivityHub.attach(()=> paintBadges()));
  }
  // A "View badge case" click elsewhere (Student Stats) calls requestBadgeCase(), which sets rpPendingStudent and opens
  // this widget. applyPending() switches to the Badges tab with that student already selected — once per request.
  function applyPending(){
    if(!rpPendingStudent || !roster.some(s=> s.id === rpPendingStudent)) return;
    activeTab = 'badges'; badgesSel = rpPendingStudent; rpPendingStudent = null;
    body.querySelectorAll('.rp-tab').forEach(b=>{ const on = b.dataset.tab === 'badges'; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    const pb = q('#rp-pane-badges'), pr = q('#rp-pane-rewards'); if(pb) pb.hidden = false; if(pr) pr.hidden = true;
    paintBadges();
  }
  const onPending = ()=> applyPending();
  document.addEventListener('td:rewardpoints-pending', onPending);
  // ---------------- Badges (v0.22.0): fully automatic, read-only — nothing for a teacher to set up.
  // Same recomputed-from-synced-stats badge engine as Student Stats (SS_BADGES/ssBadgeCtx), scoped to the
  // whole roster instead of one student at a time. ActivityHub is a shared app-wide cache, so this doesn't
  // open any new Firestore listeners beyond what's already paid for if Student Stats is also open.
  function paintBadges(){
    const box = q('#rp-pane-badges'); if(!box) return;
    ActivityHub.setRoster(roster.map(s=> s.id));
    if(badgesSel){
      const s = roster.find(x=> x.id === badgesSel);
      if(s){ box.innerHTML = badgeDetailHtml(s); box.querySelector('[data-back]').addEventListener('click', ()=>{ badgesSel = null; paintBadges(); }); return; }
      badgesSel = null;
    }
    box.innerHTML = roster.length ? `<p class="small-hint">${t('ss_overview_hint')}</p><div class="ss-grid">${roster.slice().sort((a, b)=> String(a.displayName).localeCompare(String(b.displayName))).map(s=>{
        const daily = (ActivityHub.get(s.id) || {}).daily || {}, total = ssTotal(s, daily), medals = ssTopMedals(s, total);
        const nEarned = SS_BADGES.filter(b=> b.val(ssBadgeCtx(s, daily)) >= b.need).length;
        return `<button type="button" class="ss-stu" data-sid="${esc(s.id)}" aria-label="${esc(t('ss_open', { name:s.displayName || '' }))}">
          <span class="ss-stu-top"><span class="ss-stu-name"><b>${esc(s.displayName || '')}</b></span></span>
          <span class="ss-medals">${medals.length ? medalMini(medals) : `<span class="muted">${t('rp_badges_none_yet')}</span>`}</span>
          <span class="small-hint">${t('ss_badge_n', { n:nEarned, total:SS_BADGES.length })}</span></button>`;
      }).join('')}</div>` : `<p class="small-hint">${t('cc_no_students')}</p>`;
    box.querySelectorAll('[data-sid]').forEach(btn=> btn.addEventListener('click', ()=>{ badgesSel = btn.dataset.sid; paintBadges(); }));
  }
  function badgeDetailHtml(s){
    const daily = (ActivityHub.get(s.id) || {}).daily || {}, ctx = ssBadgeCtx(s, daily);
    const prog = b=> Math.min(1, b.val(ctx) / b.need);
    const norm = b=> ({ ...b, on:b.val(ctx) >= b.need, progress:prog(b) });   // no countLine/earnedLine: no per-badge unit label or earn date for this recomputed engine
    const earned = SS_BADGES.filter(b=> b.val(ctx) >= b.need), nEarned = earned.length;
    const next = SS_BADGES.filter(b=> b.val(ctx) < b.need).sort((a, c)=> prog(c) - prog(a)).slice(0, 3).map(norm);
    // No earn-date here (these badges are recomputed from synced stats, not stored with a timestamp like StudentDeck's own), so the hero spot is the highest-tier earned badge, not the most recent.
    const spot = earned.slice().sort((a, c)=> c.tier - a.tier)[0];
    const prizes = ledger.filter(e=> e.awardedBy === 'self-redemption' && e.studentId === s.id).slice(0, 12);
    const countLabel = t('ss_badge_n', { n:nEarned, total:SS_BADGES.length });
    const shelves = SS_GROUPS.map(g=> [t('ss_bg_' + g), SS_BADGES.filter(b=> b.group === g).map(b=> bcTileHtml(norm(b))).join('')]);
    return `<button type="button" class="sx-chip" data-back>${t('ss_back')}</button>
      <h3 class="ss-h">${esc(s.displayName || '')}</h3>
      ${bcHeroHtml(spot && norm(spot), countLabel, spot ? `<p class="muted bc-last">${t('rp_top_badge')}: <b>${esc(spot.name)}</b></p>` : '', countLabel)}
      ${next.length ? `<p class="bd-next-h">${t('bd_next')}</p><div class="bd-next">${next.map(bcNextUpHtml).join('')}</div>` : ''}
      ${bcCabinetHtml(shelves)}
      <p class="small-hint">${t('ss_badge_note')}</p>
      <section class="bc-prizes"><h3 class="ss-h ss-h2">${t('rp_redeemed_by', { name:s.displayName || '' })}</h3>
        ${prizes.length ? `<div class="bc-prow">${prizes.map(p=> `<div class="bc-prize"><span class="bc-gift" aria-hidden="true">🎁</span><b>${esc(String(p.reason || '').replace(/^Redeemed:\s*/, ''))}</b><small>${esc(shortWhen(tsMs(p.createdAt)))} · −${Math.abs(+p.delta || 0)} ${t('cc_pts')}</small></div>`).join('')}</div>`
          : `<p class="small-hint">${t('rp_redeemed_none')}</p>`}
      </section>`;
  }
  function paintList(){
    const box = q('#rp-list'); if(!box) return;
    box.innerHTML = rewards.length ? rewards.slice().sort((a, b)=> (a.cost || 0) - (b.cost || 0)).map(r=>{
      const can = roster.filter(s=> (s.xp || 0) >= (r.cost || 0)).length;
      return `<div class="rp-card${active(r) ? '' : ' off'}" data-id="${esc(r.id)}">
        <div class="rp-card-top"><b>🎁 ${esc(r.name)}</b><span class="rp-cost">${r.cost} ${t('cc_pts')}</span></div>
        ${r.description ? `<small>${esc(r.description)}</small>` : ''}
        <div class="rp-meta">${active(r) ? t('rp_afford', { n:can, m:roster.length }) : t('rp_off')}</div>
        <div class="rp-actions"><button type="button" class="wbtn" data-toggle>${active(r) ? t('rp_hide') : t('rp_show')}</button><button type="button" class="sb-btn minus" data-del title="${esc(t('cc_delete_reward_tip') || '')}" aria-label="${esc(t('rp_delete'))}">🗑️</button></div>
      </div>`;
    }).join('') : `<p class="small-hint">${t('cc_no_rewards')}</p>`;
  }
  function paintFeed(){
    const box = q('#rp-feed'); if(!box) return;
    const names = new Map(roster.map(s=> [s.id, s.displayName]));
    const rows = ledger.filter(e=> e.awardedBy === 'self-redemption').slice(0, 15);
    box.innerHTML = rows.length ? rows.map(e=>`<div class="rp-feedrow"><span>🎁</span><span class="rp-feedtxt"><b>${esc(names.get(e.studentId) || t('ca_someone'))}</b> — ${esc(String(e.reason || '').replace(/^Redeemed:\s*/, ''))}</span><b>−${Math.abs(+e.delta || 0)}</b><small>${esc(shortWhen(tsMs(e.createdAt)))}</small></div>`).join('') : `<p class="small-hint">${t('rp_redeemed_none')}</p>`;
  }
  function paintBal(){
    const box = q('#rp-bal'); if(!box) return;
    const rows = roster.slice().sort((a, b)=> (b.xp || 0) - (a.xp || 0)), mx = Math.max(1, ...rows.map(s=> s.xp || 0));
    box.innerHTML = rows.length ? rows.map((s, n)=>`<div class="sx-bar" style="--n:${n}"><span title="${esc(s.displayName || '')}">${esc(s.displayName || '—')}</span><div><i style="width:${Math.round((s.xp || 0) / mx * 100)}%"></i></div><b>${s.xp || 0}</b></div>`).join('') : `<p class="small-hint">${t('cc_no_students')}</p>`;
  }
  const unsubAuth = TDCloud.onAuthChanged(draw);
  draw();
  const poll = setInterval(()=>{ if((state.cloudClassId || null) !== shownClassId) draw(); }, 1500);     // linking happens in Cloud Class, which doesn't announce it
  return ()=>{ clearInterval(poll); stopSubs(); unsubAuth(); document.removeEventListener('td:rewardpoints-pending', onPending); rpPendingStudent = null; };
}


/* ---------------- Init ---------------- */
function init(){
  // One-time cleanup: the local database used to be named "widget-wall"
  // (from before the app was renamed to TeachersDeck). It's fully replaced
  // by the "TeachersDeck" database now, so remove the old one rather than
  // leaving orphaned data sitting in the browser. Best-effort and silent —
  // this is harmless if it's already gone.
  try{ indexedDB.deleteDatabase('widget-wall'); }catch(e){}

  const tidied = curateWidgetsOnce();
  ensureDockPlacement();
  buildLangToggle();
  rebuildAllDocks();
  wireClasses();
  wireAppTray();
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
  buildProStatus();
  recheckLicenseIfNeeded();
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
