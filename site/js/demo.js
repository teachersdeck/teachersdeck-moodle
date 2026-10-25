/* TeachersDeck demo mode (v0.15.3) — show the Cloud features without a Firebase project, a sign-in or a real class.

   What you get: you are signed in as a pretend teacher with Class 5A already linked to a pretend cloud class (12 students, a rewards
   catalogue, a points history, homework and calendar, Notes Home history, two weeks of student activity), plus Class 3B to practise
   "pick an existing class". Cloud Class, Class Activity, Notes Home, Progress Reports, Assignments and Calendar all work for real against it:
   award points, send a note to parents, change ranking visibility, regenerate a join code, add a reward, remove a student, send a progress
   report. A gold "Cloud demo" tab (bottom left) opens a panel with
     - a live LOG of every Cloud call the app makes (function name, what it did, and who would see it in StudentDeck / ParentDeck), and
     - buttons that play the OTHER side: a student joins with the class code, students do homework and practise, a student redeems a reward,
       a parent opens a note — so you can watch the teacher's widgets update live, which is the point of the Cloud features.

   How it works (so you can trust it): this file loads after js/cloud.js and before js/app.js. It replaces the public TDCloud.* functions
   with in-memory versions that return the same shapes the real ones do, so no widget knows the difference. Nothing is sent anywhere.
   And it keeps your real deck safe: the app runs on a throw-away, in-memory copy of localStorage (your real classes, settings and Pro
   license are neither read nor changed), the demo class has its own id so a background picked in the demo never overwrites your own, and
   everything resets when the page reloads. (Media you upload into the library while in the demo is the one thing stored for real; the
   library is shared across classes.)

   Turn on: "Try demo" in Settings or in any Cloud widget's "not connected" message, or add ?demo=1 to the page address.
   Turn off: "Exit demo" in the panel or Settings, or ?demo=0. Dates are generated relative to today. */
const TD_DEMO = (() => {
  const KEY = 'td_demo_flag';
  const realLS = window.localStorage;                    // captured before anything can replace it
  let q = null; try { q = new URLSearchParams(location.search).get('demo'); } catch (e) {}
  try { if (q === '1') realLS.setItem(KEY, '1'); else if (q === '0') realLS.removeItem(KEY); } catch (e) {}
  // ?demo=1 in the address always wins, even when the browser won't let the flag persist to localStorage
  // (e.g. storage blocked for this origin) — otherwise "Try demo" just reloads into the same dead end.
  let on = q === '1'; if (!on) { try { on = realLS.getItem(KEY) === '1'; } catch (e) {} }
  const api = {
    active: on,
    enter() { try { realLS.setItem(KEY, '1'); } catch (e) {} location.href = location.pathname + '?demo=1'; },
    exit() { try { realLS.removeItem(KEY); } catch (e) {} location.href = location.pathname; },
    seed() {}
  };
  if (!on) return api;

  /* ---------- 1. keep the real deck out of it: throw-away in-memory localStorage ---------- */
  class MemStorage {
    constructor() { this.m = new Map(); }
    get length() { return this.m.size; }
    key(i) { return Array.from(this.m.keys())[i] || null; }
    getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
    setItem(k, v) { this.m.set(String(k), String(v)); }
    removeItem(k) { this.m.delete(String(k)); }
    clear() { this.m.clear(); }
  }
  const mem = new MemStorage();
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => mem }); }
  catch (e) { console.warn('TeachersDeck demo: this browser would not let the demo use temporary storage, so it will not start.'); try { realLS.removeItem(KEY); } catch (e2) {} api.active = false; api.blocked = true; return api; }
  if (window.localStorage !== mem) { try { realLS.removeItem(KEY); } catch (e2) {} api.active = false; api.blocked = true; return api; }
  // The demo class has its own id (not the default one), so its background image id is 'background::demo_5a' — never the real 'background'.
  mem.setItem('td_classes_v1', JSON.stringify({ active: 'demo_5a', list: [{ id: 'demo_5a', name: 'Class 5A' }] }));
  // Mark widget curation as already done, so curateWidgetsOnce() doesn't re-deactivate the shelve-tier widgets (and
  // pop the "Tidied up" toast) on every single demo reload — a fresh in-memory localStorage otherwise looks like a
  // brand-new device every time.
  mem.setItem('td_widgets_v1', JSON.stringify({ curated: true, off: {}, parked: {} }));
  document.title = 'TeachersDeck (demo)';

  /* ---------- 2. helpers ---------- */
  const DAY = 864e5, now = Date.now();
  const dayKey = ms => new Date(ms).toLocaleDateString('en-CA');
  const ago = n => now - n * DAY;
  let seedN = 5; const rnd = () => (seedN = (seedN * 16807) % 2147483647) / 2147483647;
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = arr => arr[ri(0, arr.length - 1)];
  const ts = ms => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000) });
  const uid = p => p + Math.random().toString(36).slice(2, 8);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const lat = () => wait(220 + ri(0, 220));              // a believable round trip
  const code = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const c = n => Array.from({ length: n }, () => A[ri(0, A.length - 1)]).join(''); return c(4) + '-' + c(4); };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- 2b. the teacher's own "My Stats & XP" + badges ----------
     This is local usage history (td_xp_v1), not a Cloud feature, so it isn't part of the pretend cloud below —
     without this, a fresh demo shows it almost empty (just whatever you click while looking around). Seeding
     tdx.stats.daily/xp directly and leaving badges.init=false lets app.js's own first-run badge backfill
     (checkBadges()) silently award whatever this history qualifies for, exactly like a real device with history. */
  (() => {
    const ACTS = ['lesson', 'assignment', 'event', 'report', 'daily', 'attendance', 'pick', 'groups', 'score', 'poll', 'ticket', 'checklist', 'announce', 'instruct', 'timer', 'reading', 'file', 'game', 'music', 'video', 'tts', 'convo', 'idiom', 'qr'];
    const XP_OF = { lesson:10, assignment:5, event:2, report:3, daily:5, attendance:5, pick:1, groups:2, score:1, poll:1, ticket:1, checklist:1, announce:2, instruct:1, timer:1, reading:1, file:1, game:2, music:1, video:1, tts:1, convo:1, idiom:1, qr:1 };
    const TIME_WIDGETS = ['stats', 'classactivity', 'rewardpoints', 'noteshome', 'traffic', 'checklist', 'files', 'timer', 'docs'];   // 'docs' feeds the "Time with documents" tile
    const daily = {}, log = []; let total = 0;
    for (let d = 29; d >= 0; d--) {                        // a full month, so the 30-day/all-time ranges have real history too, not just the last week
      if (rnd() < 0.1) continue;                           // a quiet day here and there, like a real term
      const busy = rnd() > 0.45, r = { xp:0, xpBy:{}, timeBy:{}, readEntries:0, readMin:0, lessons:0, assignments:0, attendance:0, acts:{}, opens:{} };
      const add = (k, n) => { r.acts[k] = (r.acts[k] || 0) + n; const xp = (XP_OF[k] || 1) * n; r.xp += xp; r.xpBy[k] = (r.xpBy[k] || 0) + xp; };
      add('daily', 1);
      ACTS.forEach(k => { if (rnd() < (busy ? 0.55 : 0.3)) add(k, ri(1, busy ? 4 : 2)); });
      r.lessons = r.acts.lesson || 0; r.assignments = r.acts.assignment || 0; r.attendance = r.acts.attendance || 0;
      r.readMin = r.acts.reading ? ri(5, 20) : 0; r.readEntries = r.acts.reading ? ri(1, 2) : 0;
      TIME_WIDGETS.forEach(w => { if (rnd() < 0.5) r.timeBy[w] = ri(120, 1500); });
      const key = dayKey(ago(d));
      daily[key] = r; total += r.xp;
      log.push({ t: ago(d) + ri(8, 20) * 36e5, s:'daily', n:r.xp });
    }
    const seed = { xp:{ total, streak:7, last:dayKey(now), log }, stats:{ daily }, totals:{}, feed:[],
      badges:{ earned:{}, init:false, bestStreak:0 }, docTime:{}, filesSort:'recent', docToReading:false, pdfTools:false };
    mem.setItem('td_xp_v1', JSON.stringify(seed));
  })();

  /* ---------- 3. the pretend cloud ---------- */
  const NAMES_5A = ['Minh Nguyen', 'Lan Tran', 'Bao Le', 'An Pham', 'Chi Vo', 'Khoa Dang', 'Linh Do', 'Phuc Huynh', 'Mai Bui', 'Hieu Ngo', 'Thao Duong', 'Duc Ly'];
  const NAMES_3B = ['Nam Le', 'Quan Hoang', 'Anh Dinh', 'Tu Phan', 'Binh Mai', 'Hoa Trinh', 'Son Vu', 'Kim Lam'];
  const NEW_NAMES = ['Yen Ta', 'Long Ha', 'Nga Chau', 'Hung Ton', 'Thy Kieu', 'Tam Quach', 'Uyen La', 'Viet Doan'];
  const ACT = ['readMin', 'focus', 'games', 'idioms', 'wordsSaved', 'cardsReviewed'];
  const HW = [   // [id, title, subject, due (days from today), points, instructions]
    ['demo_hw1', 'Reading log: Chapter 3', 'English', -6, 10, 'Read and write three sentences about the main character.'],
    ['demo_hw2', 'Fractions worksheet', 'Math', -3, 15, ''],
    ['demo_hw3', 'Spelling list 12', 'English', -1, 10, ''],
    ['demo_hw4', 'Science: plant diary', 'Science', 1, 10, 'Draw and label your bean plant.'],
    ['demo_hw5', 'Book report draft', 'English', 4, 20, '']
  ];
  const EVENTS = [['Class picnic', 3, '10:00'], ['Parent-teacher meetings', 6, ''], ['Unit test', 9, '09:00']];
  const session0 = { uid: 'demo-teacher', displayName: 'Demo Teacher', email: 'demo.teacher@example.com', photoURL: null };
  let session = session0;
  const authL = new Set();
  const fireAuth = () => authL.forEach(fn => { try { fn(session); } catch (e) {} });

  const C = {};   // classId -> { doc, students, rewards, ledger, notes, hw, cal, reports }
  function makeClass(id, name, names, rich) {
    const students = names.map((n, i) => {
      const quiet = rich && (i === 4 || i === 9);          // two students nobody has seen for a few days
      const streak = quiet ? 0 : ri(1, 9);
      const daily = {}, hwDone = {};
      let xpSum = 0;
      for (let d = 0; d < 45; d++) {
        if (quiet && d < 5) continue; if (!quiet && rnd() < 0.18 && d > 0) continue;
        const xpBy = { reading: ri(4, 20), game: ri(0, 18), todo: ri(0, 12), focus: ri(0, 10), idiom: ri(0, 6), words: ri(0, 5), cards: ri(0, 5), daily: 5 }, xp = Object.values(xpBy).reduce((a, c) => a + c, 0); xpSum += xp;   // mirrors StudentDeck v0.9.x: per-source XP and per-widget seconds
        daily[dayKey(ago(d))] = { readMin: ri(8, 35), readEntries: ri(0, 2), focus: ri(0, 3), games: ri(0, 3), gamesStarted: ri(0, 4), idioms: ri(0, 2), wordsSaved: ri(0, 6), cardsReviewed: ri(0, 12), hw: ri(0, 2), xp, xpBy,
          timeBy: { reading: ri(200, 1500), games: ri(0, 900), todo: ri(0, 600), timer: ri(0, 1200), idiom: ri(0, 240), stats: ri(0, 120), cards: ri(0, 400) } };
      }
      if (rich) HW.forEach((h, k) => { if (h[3] < 0 && !quiet && rnd() < 0.8 - k * 0.1) hwDone[h[0]] = { done: true, doneAt: ts(ago(-h[3] - 1)) }; });
      const lastDay = Object.keys(daily).sort().pop();
      return { id: id + '_s' + i, displayName: n, classId: id, xp: ri(40, 420), level: ri(1, 5), practice: { streak, xpTotal: xpSum + (quiet ? 0 : ri(0, 700)), gameScores: { memory: { name: 'Memory Match', best: ri(40, 100), plays: ri(2, 20) }, quiz: { name: 'Word Quiz', best: ri(30, 100), plays: ri(1, 15) } }, recentXp: [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ t: ago(0) - i * 5400000, s: ['reading', 'game', 'todo', 'idiom', 'focus'][i % 5], n: ri(3, 15) })).reverse(), updatedAt: ts(lastDay ? new Date(lastDay + 'T18:00:00').getTime() : ago(30)) }, lastActiveAt: ts(lastDay ? new Date(lastDay + 'T18:00:00').getTime() : ago(30)), _daily: daily, _hwDone: hwDone };
    });
    C[id] = {
      doc: { id, className: name, teacherUid: session0.uid, studentJoinCode: code(), parentJoinCode: code(), rankingVisibility: 'anonymized' },
      students, hw: [], cal: [], reports: {},
      rewards: [{ id: id + '_r0', name: 'Sticker', cost: 30, description: 'Pick a sticker.', active: true }, { id: id + '_r1', name: 'Pick the class song', cost: 120, description: '', active: true }, { id: id + '_r2', name: 'Homework pass', cost: 300, description: 'Skip one homework.', active: true }],
      ledger: rich ? [[0, 0, 10, 'Great participation', 'teacher'], [0, 3, -30, 'Redeemed: Sticker', 'self-redemption'], [1, 1, 5, 'Helped a classmate', 'teacher'], [1, 6, 15, 'Reading challenge', 'teacher'], [2, 2, 10, 'Homework on time', 'teacher'], [3, 7, -5, 'Talking during story time', 'teacher'], [4, 0, 10, 'Kindness award', 'teacher'], [5, 8, 20, 'Science fair project', 'teacher']]
        .map(([d, si, delta, reason, by], k) => ({ id: id + '_l' + k, studentId: students[si].id, delta, reason, awardedBy: by, createdAt: ts(ago(d) - k * 6e5) })) : [],
      notes: rich ? [
        { id: id + '_n0', studentId: students[1].id, displayName: students[1].displayName, mood: 'smiley', text: 'Lan led her group today and encouraged the quieter students to share ideas. Wonderful teamwork!', read: true, readAt: ts(ago(5) + 36e5), createdAt: ts(ago(6)) },
        { id: id + '_n1', studentId: students[2].id, displayName: students[2].displayName, mood: 'frowny', text: 'Bao found today\u2019s reading task difficult and got frustrated. A little extra reading at home would help. Thank you!', read: false, readAt: null, createdAt: ts(ago(2)) },
        { id: id + '_n2', studentId: students[0].id, displayName: students[0].displayName, mood: 'smiley', text: 'Minh scored 18 out of 20 on the spelling test. Well done!', read: false, readAt: null, createdAt: ts(ago(1)) }] : []
    };
  }
  makeClass('demo_5a', 'Class 5A', NAMES_5A, true);
  makeClass('demo_3b', 'Class 3B', NAMES_3B, false);

  /* ---------- 4. subscriptions ---------- */
  const subs = {};   // key -> Set(cb)
  function sub(key, snapshotFn, cb) {
    (subs[key] || (subs[key] = new Set())).add({ cb, snapshotFn });
    setTimeout(() => { try { cb(...snapshotFn()); } catch (e) { console.warn('[demo]', e); } }, 0);   // first delivery, async like the real thing
    return () => { if (subs[key]) subs[key] = new Set([...subs[key]].filter(s => s.cb !== cb)); };
  }
  function emit(key) { (subs[key] ? [...subs[key]] : []).forEach(s => { try { s.cb(...s.snapshotFn()); } catch (e) { console.warn('[demo]', e); } }); }
  const cls = id => C[id];
  const rosterOut = id => cls(id) ? cls(id).students.map(s => ({ id: s.id, displayName: s.displayName, classId: s.classId, xp: s.xp, level: s.level, practice: { ...s.practice }, lastActiveAt: s.lastActiveAt })) : [];
  const ledgerOut = id => cls(id) ? [...cls(id).ledger].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()).slice(0, 40) : [];
  const notesOut = id => cls(id) ? [...cls(id).notes].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()) : [];
  const findStudent = sid => { for (const c of Object.values(C)) { const s = c.students.find(x => x.id === sid); if (s) return [c, s]; } return [null, null]; };

  /* ---------- 5. the call log ---------- */
  const LOG = [];
  function log(fn, what, who, side) {
    LOG.unshift({ t: Date.now(), fn, what, who: who || '', side: side || 'teacher' });
    if (LOG.length > 40) LOG.pop();
    if (typeof paintLog === 'function') paintLog();
  }
  const sname = sid => { const [, s] = findStudent(sid); return s ? s.displayName.split(' ')[0] : 'a student'; };

  /* ---------- 6. TDCloud replacement ---------- */
  let lastCal = '', lastHw = '';
  Object.assign(TDCloud, {
    isConfigured: () => true,
    init: () => true,
    watchAuth() {},
    onAuthChanged(fn) { authL.add(fn); fn(session); return () => authL.delete(fn); },
    async signIn() { await wait(350); session = session0; fireAuth(); log('signIn', 'Signed in with Google (demo teacher)', 'ensureUserProfile role=teacher'); return session; },
    signOut() { session = null; fireAuth(); log('signOut', 'Signed out', ''); },
    getSession: () => session,
    async myClasses() { await lat(); return Object.values(C).map(c => ({ ...c.doc })); },
    async createClass(className) {
      await lat(); const id = uid('demo_c'); makeClass(id, className, [], false);
      log('createClass', `"${className}" created · student code ${C[id].doc.studentJoinCode}, parent code ${C[id].doc.parentJoinCode}`, 'Students and parents can now join with these codes');
      return { classId: id, studentJoinCode: C[id].doc.studentJoinCode, parentJoinCode: C[id].doc.parentJoinCode };
    },
    async regenerateJoinCode(classId, which) {
      await lat(); const d = cls(classId).doc;
      if (which === 'parent') d.parentJoinCode = code(); else d.studentJoinCode = code();
      emit('class:' + classId); log('regenerateJoinCode', `New ${which} code: ${which === 'parent' ? d.parentJoinCode : d.studentJoinCode}`, 'The old code stops working at once');
      return { ok: true };
    },
    async setRankingVisibility(classId, visibility) {
      await lat(); cls(classId).doc.rankingVisibility = visibility; emit('class:' + classId);
      log('setRankingVisibility', `Class ranking: ${visibility}`, visibility === 'opt_out' ? 'StudentDeck hides the ranking' : visibility === 'full' ? 'Students see classmates\u2019 names' : 'Students see only their own rank');
      return { ok: true };
    },
    // v0.21.3 (backend v2.1.0): school + notes from the school admin
    async joinSchool(code) { await lat(); log('joinSchool', `Joined a school with code ${String(code).toUpperCase()}`, 'Your classes now appear in that school\u2019s AdminDeck'); return { schoolId: 'demo', schoolName: 'Demo School', classesMoved: 1 }; },
    subscribeMySchool(cb) { cb({ schoolId: 'demo', schoolName: 'Demo School' }); return () => {}; },
    subscribeAdminNotes(cb) {
      const notes = window.__tdDemoNotes = window.__tdDemoNotes || [
        { id: 'an1', subject: 'Parents\u2019 evening', text: 'Thursday from 5pm in the hall. Please have progress reports sent by Wednesday.', from: 'School office', createdAtMs: Date.now() - 864e5, read: false },
        { id: 'an2', subject: 'Reading week', text: 'Thank you for logging reading minutes!', from: 'Principal', createdAtMs: Date.now() - 4 * 864e5, read: true }];
      window.__tdDemoNotesCb = cb; cb(notes.map(n => ({ ...n }))); return () => { window.__tdDemoNotesCb = null; };
    },
    async markAdminNoteRead(id) { await lat(); const n = (window.__tdDemoNotes || []).find(x => x.id === id); if (n) n.read = true; if (window.__tdDemoNotesCb) window.__tdDemoNotesCb(window.__tdDemoNotes.map(x => ({ ...x }))); },
    // v0.21.2 (backend v2.0.0): Class Pulse switch, family codes, attendance shared with families
    async setClassPulse(classId, enabled) {
      await lat(); cls(classId).doc.classPulse = !!enabled; emit('class:' + classId);
      log('setClassPulse', `Class Pulse ${enabled ? 'on' : 'off'}`, enabled ? 'ParentDeck shows typical ranges for the class' : 'ParentDeck says the teacher has switched it off');
      return { classPulse: !!enabled };
    },
    async getFamilyCodes(classId) {
      await lat(); const c = cls(classId); if (!c) return [];
      c.familyCodes = c.familyCodes || {};
      return rosterOut(classId).map(s => ({ studentId: s.id, displayName: s.displayName, familyCode: c.familyCodes[s.id] || (c.familyCodes[s.id] = code()) }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    async regenerateFamilyCode(classId, studentId) {
      await lat(); const c = cls(classId); c.familyCodes = c.familyCodes || {}; c.familyCodes[studentId] = code();
      log('regenerateFamilyCode', `New family code for ${sname(studentId)}`, 'The old code stops working; linked parents stay linked');
      return { studentId, familyCode: c.familyCodes[studentId] };
    },
    async syncAttendance(classId, entries) {
      await lat();
      if (entries.length) log('syncAttendance', `${entries.length} attendance mark${entries.length === 1 ? '' : 's'} shared`, 'ParentDeck: each family sees only their own child\u2019s days');
      return { ok: true };
    },
    subscribeClass: (classId, cb) => sub('class:' + classId, () => [cls(classId) ? { ...cls(classId).doc } : null], cb),
    subscribeAdminTheme: (classId, cb) => sub('theme:' + classId, () => [null], cb),
    subscribeRoster: (classId, cb) => sub('roster:' + classId, () => [rosterOut(classId)], cb),
    subscribeRewards: (classId, cb) => sub('rewards:' + classId, () => [cls(classId) ? clone(cls(classId).rewards) : []], cb),
    subscribeLedger: (classId, cb) => sub('ledger:' + classId, () => [ledgerOut(classId)], cb),
    subscribeNotes: (classId, cb) => sub('notes:' + classId, () => [notesOut(classId), null], cb),
    subscribeStudentActivity: (sid, cb) => sub('act:' + sid, () => { const [, s] = findStudent(sid); return [{ homeworkDone: s ? clone(s._hwDone) : {}, daily: s ? clone(s._daily) : {} }]; }, cb),
    async awardPoints(classId, studentId, amount, reason) {
      await lat(); const [c, s] = findStudent(studentId);
      if (!c || c.doc.id !== classId) throw Object.assign(new Error('That student is not in this class.'), { code: 'functions/permission-denied' });
      amount = Math.trunc(+amount); if (!amount || Math.abs(amount) > 50) throw Object.assign(new Error('Points must be between -50 and 50.'), { code: 'functions/invalid-argument' });
      s.xp = Math.max(0, s.xp + amount); c.ledger.push({ id: uid('l'), studentId, delta: amount, reason: reason || '', awardedBy: 'teacher', createdAt: ts(Date.now()) });
      emit('roster:' + classId); emit('ledger:' + classId);
      log('awardPoints', `${sname(studentId)} ${amount > 0 ? '+' : ''}${amount}${reason ? ' \u201c' + reason + '\u201d' : ''} \u2192 ${s.xp} points`, 'StudentDeck shows the new total and a line in their history');
      return { ok: true, xp: s.xp };
    },
    async saveReward(classId, reward) {
      await lat(); const c = cls(classId);
      if (reward.id) { const r = c.rewards.find(x => x.id === reward.id); if (r) Object.assign(r, { name: reward.name, cost: reward.cost, description: reward.description || '', active: reward.active !== false }); emit('rewards:' + classId); log('saveReward', `"${reward.name}" · ${reward.cost} points · ${reward.active === false ? 'hidden' : 'on sale'}`, 'StudentDeck\u2019s Rewards list updates'); return reward.id; }
      const r = { id: uid('r'), name: reward.name, cost: reward.cost, description: reward.description || '', active: true }; c.rewards.push(r); emit('rewards:' + classId);
      log('saveReward', `New reward "${r.name}" for ${r.cost} points`, 'Students can redeem it from StudentDeck'); return r.id;
    },
    async deleteReward(classId, rewardId) { await lat(); const c = cls(classId), r = c.rewards.find(x => x.id === rewardId); c.rewards = c.rewards.filter(x => x.id !== rewardId); emit('rewards:' + classId); log('deleteReward', `"${r ? r.name : 'reward'}" removed`, ''); },
    async removeStudent(studentId, classId) {
      await lat(); const c = cls(classId), n = sname(studentId); c.students = c.students.filter(s => s.id !== studentId); c.notes = c.notes.filter(x => x.studentId !== studentId);
      emit('roster:' + classId); emit('notes:' + classId);
      log('removeStudentFromClass', `${n} removed from the class`, 'Also removes their records, their parents\u2019 access and notes about them'); return { ok: true };
    },
    async sendNotesHome(classId, studentIds, mood, text, signedAs) {
      await lat(); const c = cls(classId);
      if (!mood || (mood === 'frowny' && !text)) throw Object.assign(new Error('A note that needs attention must say what happened.'), { code: 'functions/invalid-argument' });
      studentIds.forEach((sid, k) => { const [, s] = findStudent(sid); if (!s) return; c.notes.push({ id: uid('n'), studentId: sid, displayName: s.displayName, mood, text: text || '', signedAs: signedAs || '', read: false, readAt: null, createdAt: ts(Date.now() + k) }); });
      emit('notes:' + classId);
      log('sendNotesHome', `${mood === 'smiley' ? '\ud83d\ude42' : '\ud83d\ude41'} note sent to ${studentIds.length} ${studentIds.length === 1 ? 'family' : 'families'}`, 'ParentDeck: "Notes from teacher" badge and toast (server checked every student is in this class)');
      return { sent: studentIds.length };
    },
    async deleteNote(classId, noteId) {
      await lat(); const c = cls(classId), n = c.notes.find(x => x.id === noteId);
      if (n && n.read) throw Object.assign(new Error('A parent has already opened this note, so it can\u2019t be deleted. Send a follow-up note instead.'), { code: 'permission-denied' });
      c.notes = c.notes.filter(x => x.id !== noteId); emit('notes:' + classId); log('deleteNote', 'Unread note deleted', 'Only allowed while the parent has not opened it');
    },
    async sendProgressReport(studentId, report) {
      await lat(); const [c] = findStudent(studentId); if (c) c.reports[report.id] = clone(report);
      log('sendProgressReport', `Report for ${sname(studentId)} \u00b7 ${report.frequency || 'report'} \u00b7 score ${report.score}/10`, 'ParentDeck: Progress Reports widget (written to that one student only)');
    },
    async deleteProgressReport(studentId, reportId) { await lat(); const [c] = findStudent(studentId); if (c) delete c.reports[reportId]; log('deleteProgressReport', `Report removed for ${sname(studentId)}`, ''); },
    async syncCalendar(classId, events) {
      const h = classId + '::' + JSON.stringify(events); if (h === lastCal) return; lastCal = h;
      await lat(); cls(classId).cal = clone(events || []);
      log('syncCalendar', `${events.length} calendar event${events.length === 1 ? '' : 's'} mirrored`, 'StudentDeck and ParentDeck calendars update');
    },
    resetCalendarSyncCache() { lastCal = ''; },
    async syncHomework(classId, assignments) {
      const h = classId + '::' + JSON.stringify(assignments); if (h === lastHw) return; lastHw = h;
      await lat(); cls(classId).hw = clone(assignments || []);
      log('syncHomework', `${(assignments || []).length} assignment${(assignments || []).length === 1 ? '' : 's'} mirrored`, 'StudentDeck To-Do and ParentDeck Homework update live');
    },
    resetHomeworkSyncCache() { lastHw = ''; }
  });

  /* ---------- 7. seed the deck (called by app.js once `state` exists) ---------- */
  api.seed = function (state) {
    state.cloudClassId = 'demo_5a';
    state.roster = NAMES_5A.map(n => n.split(' ')[0]);
    state.assignments = HW.map(h => ({ id: h[0], title: h[1], subject: h[2], dueDate: dayKey(ago(-h[3])), dueTime: '', points: h[4], instructions: h[5] }));
    state.calendarEvents = [
      ...state.assignments.map(a => ({ id: 'assign-' + a.id, title: a.title, date: a.dueDate, time: '', type: 'assignment', reminder: 'none' })),
      ...EVENTS.map((e, i) => ({ id: 'demo_ev' + i, title: e[0], date: dayKey(ago(-e[1])), time: e[2], type: 'event', reminder: 'none' }))
    ];
    state.dim = true;
    if (!Object.values(state.active || {}).some(Boolean)) {
      state.active = { cloudclass: true, classactivity: true, noteshome: true };
      if (window.innerWidth >= 1150) state.layout = { cloudclass: { x: 20, y: 90, w: 320, h: 500 }, classactivity: { x: 360, y: 90, w: 400, h: 580 }, noteshome: { x: 780, y: 90, w: 350, h: 640 } };
    }
    // The first sync would log two lines the moment the app starts; do it quietly so the log begins with what you do.
    lastCal = 'demo_5a::' + JSON.stringify(state.calendarEvents); lastHw = 'demo_5a::' + JSON.stringify(state.assignments);
    C.demo_5a.hw = clone(state.assignments); C.demo_5a.cal = clone(state.calendarEvents);
  };

  /* ---------- 8. play the other side ---------- */
  const A = 'demo_5a';
  const sim = {
    join() {
      const used = new Set(C[A].students.map(s => s.displayName)), name = NEW_NAMES.find(n => !used.has(n));
      if (!name) { toast('Everyone in the demo has already joined.'); return; }
      const s = { id: uid(A + '_s'), displayName: name, classId: A, xp: 0, level: 1, practice: { streak: 0, updatedAt: null }, lastActiveAt: null, _daily: {}, _hwDone: {} };
      C[A].students.push(s); emit('roster:' + A); toast(name + ' joined the class');
      log('StudentDeck \u2192 join', `${name} joined with code ${C[A].doc.studentJoinCode}`, 'Appears in Cloud Class\u2019s roster at once', 'student');
    },
    practise() {
      const hw = (typeof state !== 'undefined' && state.assignments || []).filter(a => a.id);
      const who = C[A].students.filter(() => rnd() < 0.5).slice(0, 5); if (!who.length) who.push(C[A].students[0]);
      who.forEach(s => {
        const today = dayKey(Date.now()), d = s._daily[today] || (s._daily[today] = { readMin: 0, focus: 0, games: 0, idioms: 0, wordsSaved: 0, cardsReviewed: 0, xp: 0 });
        d.readMin += ri(8, 20); d.focus += ri(0, 2); d.games += ri(0, 2); d.wordsSaved += ri(1, 4); d.xp += ri(10, 30);
        const todo = hw.find(a => !(s._hwDone[a.id] && s._hwDone[a.id].done)); if (todo && rnd() < 0.7) s._hwDone[todo.id] = { done: true, doneAt: ts(Date.now()) };
        s.practice = { streak: (s.practice.streak || 0) + (s.practice.updatedAt && dayKey(s.practice.updatedAt.toMillis()) === today ? 0 : 1), updatedAt: ts(Date.now()) }; s.lastActiveAt = ts(Date.now());
        emit('act:' + s.id);
      });
      emit('roster:' + A);
      log('StudentDeck \u2192 sync', `${who.length} students did homework and practised`, 'Class Activity: active count, reading minutes and homework bars move', 'student');
      toast(who.length + ' students just practised');
    },
    redeem() {
      const r = C[A].rewards.filter(x => x.active !== false).sort((a, b) => a.cost - b.cost)[0], s = r && C[A].students.find(x => x.xp >= r.cost);
      if (!s) { toast('No student has enough points for a reward yet. Award some first.'); return; }
      s.xp -= r.cost; C[A].ledger.push({ id: uid('l'), studentId: s.id, delta: -r.cost, reason: 'Redeemed: ' + r.name, awardedBy: 'self-redemption', createdAt: ts(Date.now()) });
      emit('roster:' + A); emit('ledger:' + A);
      log('StudentDeck \u2192 redeemReward', `${s.displayName.split(' ')[0]} spent ${r.cost} points on "${r.name}"`, 'Class Activity shows it in the feed with a toast', 'student');
    },
    parent() {
      const n = notesOut(A).reverse().find(x => !x.read);
      if (!n) { toast('Every note has already been opened. Send one from Notes Home first.'); return; }
      n.read = true; n.readAt = ts(Date.now()); emit('notes:' + A);
      log('ParentDeck \u2192 markNoteRead', `A parent of ${n.displayName.split(' ')[0]} opened a note`, 'Notes Home history shows "Read" and the time; unread notes can no longer be deleted', 'parent');
    }
  };

  /* ---------- 9. the panel ---------- */
  let paintLog = () => {};
  function build() {
    const bar = document.createElement('div'); bar.className = 'demobar'; bar.id = 'demo-bar';
    bar.innerHTML = `
      <button class="demotab" id="demo-tab" aria-expanded="false">\ud83c\udfac Cloud demo</button>
      <div class="demopanel" id="demo-panel" hidden>
        <p class="small-hint" style="text-align:left;margin:0 0 8px">Pretend cloud: Class 5A is linked, with 12 students. Everything you do in Cloud Class, Class Activity, Notes Home, Progress Reports, Assignments and Calendar goes through the log below. These buttons play the student and parent side.</p>
        <div class="demo-actions">
          <button class="wbtn" data-sim="join">\ud83d\udc4b Student joins</button>
          <button class="wbtn" data-sim="practise">\ud83d\udcda Students practise</button>
          <button class="wbtn" data-sim="redeem">\ud83c\udf81 Student redeems</button>
          <button class="wbtn" data-sim="parent">\ud83d\udc6a Parent opens a note</button>
        </div>
        <p class="demo-log-title">Cloud calls <span class="demo-key"><i class="t"></i>you <i class="s"></i>student <i class="p"></i>parent</span></p>
        <ol class="demo-log" id="demo-log"></ol>
        <div class="demo-actions"><button class="wbtn" data-sim="reset">\u21a9 Reset demo</button><button class="wbtn" data-sim="exit">Exit demo</button></div>
      </div>`;
    document.body.appendChild(bar);
    const tab = bar.querySelector('#demo-tab'), panel = bar.querySelector('#demo-panel'), ol = bar.querySelector('#demo-log');
    paintLog = () => {
      ol.innerHTML = LOG.length ? LOG.slice(0, 14).map(e => `<li class="${e.side}"><b>${e.fn}</b> <span>${esc(e.what)}</span>${e.who ? `<em>${esc(e.who)}</em>` : ''}<time>${new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></li>`).join('') : '<li class="empty">Nothing yet. Award points, send a note, or press a button above.</li>';
    };
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    tab.addEventListener('click', () => { panel.hidden = !panel.hidden; tab.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) paintLog(); });
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-sim]'); if (!b) return; const k = b.dataset.sim;
      if (k === 'exit') api.exit(); else if (k === 'reset') location.reload(); else if (sim[k]) sim[k]();
    });
    paintLog();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  return api;
})();
