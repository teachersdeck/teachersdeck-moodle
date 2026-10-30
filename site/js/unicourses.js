'use strict';
/* =========================================================
   UniCourses — the UniDeck course client (backend v2.12.0), one file in two apps
   ---------------------------------------------------------
   studentdeck/js/unicourses.js   (this copy is the one to edit) — UniStudentDeck's Courses, Assignments, Grades, Modules, Announcements, Discussions, Calendar, Office hours
   teachersdeck/js/unicourses.js  — LectureDeck's Course builder, Assignments, Grader, Gradebook, Modules, Announcements, Discussions, Course calendar, Office hours
   tools/check_shared.py keeps them identical. Only the UniDeck apps load it (their own index.html); StudentDeck and
   TeachersDeck carry the file but never run it.

   Sign-in is Google for both roles: a lecturer registers as 'teacher' (ensureUserProfile, the same account type as
   TeachersDeck), a student as 'unistudent' (ensureUniProfile, which asks for a date of birth once and keeps only an
   under-18 flag). Every write goes through a Cloud Function; reads are plain Firestore gets under firestore.rules.

   Demo: with the app's demo on (SD_DEMO / TD_DEMO), or ?demo=1, everything runs on an in-memory pretend course
   (two courses, twelve students, graded and ungraded work) and nothing is sent anywhere. Late penalties and course
   totals come from CourseMath (js/coursemath.js), the same file the backend runs.
   ========================================================= */
const UniCourses = (() => {
  const M = window.CourseMath;
  // SD_DEMO / TD_DEMO are top-level consts of each app's js/demo.js (not window properties), hence typeof.
  const DEMO = !!((typeof SD_DEMO !== 'undefined' && SD_DEMO.active) || (typeof TD_DEMO !== 'undefined' && TD_DEMO.active));
  let fb = null, auth = null, db = null, fns = null, storage = null;
  let state = { user: null, role: null, under18: false, needsBirthDate: false, busy: false };
  const listeners = new Set();
  const fire = () => listeners.forEach((fn) => { try { fn({ ...state }); } catch (e) {} });

  function configured() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey !== 'YOUR_API_KEY' && typeof firebase !== 'undefined');
  }
  function init() {
    if (fb) return true;
    if (!configured()) return false;
    fb = firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth(); db = firebase.firestore(); fns = firebase.functions();
    try { storage = firebase.storage ? firebase.storage() : null; } catch (e) { storage = null; }
    auth.onAuthStateChanged(async (u) => {
      if (!u || u.isAnonymous) { state = { ...state, user: null, role: null }; fire(); return; }
      const tok = await u.getIdTokenResult();
      state = { ...state, user: { uid: u.uid, name: u.displayName || '', email: u.email || '' }, role: tok.claims.role || null, under18: tok.claims.u18 === true };
      fire();
    });
    // v2.18 web app: coming back from a redirect sign-in (installed iPhone apps can't use pop-ups) finishes it here.
    let pending = null; try { pending = sessionStorage.getItem('ud_signin_role'); sessionStorage.removeItem('ud_signin_role'); } catch (e) {}
    if (pending) auth.getRedirectResult().then((r) => { if (r && r.user) finishSignIn(pending).catch(() => {}); }).catch(() => {});
    return true;
  }
  // Pop-ups don't work in an app installed to the iPhone Home screen, and some phones block them: use a redirect there.
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const POPUP_FAILS = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/cancelled-popup-request'];
  async function googleSignIn(role) {
    const provider = new firebase.auth.GoogleAuthProvider();
    const redirect = async () => { try { sessionStorage.setItem('ud_signin_role', role); } catch (e) {} await auth.signInWithRedirect(provider); return null; };
    if (standalone() && /iPhone|iPad|iPod/.test(navigator.userAgent || '')) return redirect();
    try { return (await auth.signInWithPopup(provider)).user; }
    catch (e) { if (POPUP_FAILS.includes(e && e.code) && !/^chrome-extension:/.test(location.protocol)) return redirect(); throw e; }
  }
  async function finishSignIn(role) {
    const u = auth.currentUser;
    const r = role === 'teacher' ? await call('ensureUserProfile', { role: 'teacher' }) : await call('ensureUniProfile', {});
    await u.getIdToken(true);
    state = { ...state, user: { uid: u.uid, name: u.displayName || '', email: u.email || '' }, role: role === 'teacher' ? 'teacher' : 'unistudent',
      under18: !!r.under18, needsBirthDate: !!r.needsBirthDate };
    fire();
  }
  const call = async (name, data) => (await fns.httpsCallable(name)(data || {})).data;
  const errText = (e) => (e && e.message ? String(e.message).replace(/^.*?:\s(?=[A-Z])/, '') : 'Something went wrong. Try again.');

  /* ---------------- demo backend ---------------- */
  const D = (() => {
    if (!DEMO) return null;
    const DAY = 864e5, now = Date.now(), at = (d, h = 23, m = 59) => { const x = new Date(now + d * DAY); x.setHours(h, m, 0, 0); return x.getTime(); };
    const names = ['An Nguyen', 'Binh Tran', 'Chi Le', 'Duc Pham', 'Giang Vo', 'Hanh Do', 'Khoa Bui', 'Lan Hoang', 'Minh Dang', 'Ngoc Phan', 'Phuc Ly', 'Quynh Mai'];
    const students = names.map((n, i) => ({ uid: 'd' + (i + 1), role: 'student', name: n, email: n.toLowerCase().replace(' ', '.') + '@demo.uni.edu' }));
    const me = { student: students[0], teacher: { uid: 'dt', name: 'Dr Linh Vu', email: 'linh.vu@demo.uni.edu' } };
    const rubric = [{ id: 'arg', criterion: 'Clear argument and thesis', points: 8 }, { id: 'evi', criterion: 'Evidence and sources', points: 6 }, { id: 'org', criterion: 'Organisation and flow', points: 4 }, { id: 'lan', criterion: 'Language accuracy', points: 2 }];
    const courses = {
      c1: { courseId: 'c1', title: 'Academic Writing', term: 'Fall 2026', section: 'ENG 201-02', code: 'WRIT-2026', ownerName: me.teacher.name,
        weights: { assignments: 60, exams: 40 }, latePolicy: { mode: 'penalty', perDayPct: 10, maxDays: 5 }, archived: false },
      c2: { courseId: 'c2', title: 'Research Methods', term: 'Fall 2026', section: 'SOC 310', code: 'RSCH-3104', ownerName: me.teacher.name,
        weights: { assignments: 100 }, latePolicy: { mode: 'accept' }, archived: false },
      c3: { courseId: 'c3', title: 'Statistics I', term: 'Fall 2026', section: 'MATH 120', code: 'STAT-1201', ownerName: me.teacher.name,
        weights: { assignments: 100 }, latePolicy: { mode: 'accept' }, archived: false },   // for trying "join a course" in the demo
    };
    const asg = {
      c1: [
        { id: 'a1', title: 'Diagnostic paragraph', instructions: 'Write one paragraph (150–200 words) on a topic you care about. We use it to plan the term.', dueAtMs: at(-24), points: 10, rubric: [], submitType: 'text', attempts: 1, category: 'assignments', latePolicy: null },
        { id: 'a2', title: 'Essay 1: Argument', instructions: 'A 1,000-word argumentative essay. Take a clear position and support it with at least three academic sources. Upload a PDF or Word file.', dueAtMs: at(-6), points: 20, rubric, submitType: 'file', attempts: 2, category: 'assignments', latePolicy: null },
        { id: 'a3', title: 'Annotated bibliography', instructions: 'Five sources for your research essay, each with a 100-word annotation. Share a link to your document.', dueAtMs: at(3), points: 15, rubric: [], submitType: 'link', attempts: 0, category: 'assignments', latePolicy: null },
        { id: 'a5', title: 'Group presentation: a writing myth', instructions: 'In your group, pick one common myth about academic writing and present the evidence against it (10 minutes, slides as a PDF). One person submits for the whole group.', dueAtMs: at(12), points: 30, rubric: [], submitType: 'file', attempts: 2, category: 'assignments', latePolicy: null, group: true },
        { id: 'a4', title: 'Midterm reflection', instructions: 'What has changed in how you write? 300 words.', dueAtMs: at(10), points: 10, rubric: [], submitType: 'any', attempts: 1, category: 'exams', latePolicy: { mode: 'closed' } },
      ],
      c3: [],
      c2: [
        { id: 'b0', title: 'Research question', instructions: 'One research question you could answer with a survey, and why it matters (150 words).', dueAtMs: at(-3), points: 10, rubric: [], submitType: 'text', attempts: 1, category: 'assignments', latePolicy: null },
        { id: 'b1', title: 'Survey design draft', instructions: 'Draft ten survey questions for your project and explain the sampling plan.', dueAtMs: at(5), points: 25, rubric: [], submitType: 'any', attempts: 0, category: 'assignments', latePolicy: null },
      ],
    };
    const subs = {}, grades = {}, membership = { c1: new Set(students.map((s) => s.uid)), c2: new Set(students.slice(0, 8).map((s) => s.uid)), c3: new Set(students.slice(2, 10).map((s) => s.uid)) };
    const staffRoles = { c2: { d1: 'ta' } };   // v2.15.0: An Nguyen (the demo student) is a TA in Research Methods
    const k = (c, a, u) => `${c}|${a}|${u}`;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const put = (c, a, u, sub, g) => {
      const A = asg[c].find((x) => x.id === a); const L = M.lateness(A.dueAtMs, sub.submittedAtMs);
      subs[k(c, a, u)] = { assignmentId: a, uid: u, name: students.find((s) => s.uid === u).name, attempt: 1, files: [], text: '', link: '', ...sub, ...L };
      if (g) {
        const pol = A.latePolicy || courses[c].latePolicy;
        const pen = M.latePenaltyPct(pol, L.lateDays);
        const rs = A.rubric.length ? M.rubricScore(A.rubric, g.rubricScores) : { score: g.score, rubricScores: {} };
        grades[k(c, a, u)] = { assignmentId: a, uid: u, score: rs.score, rubricScores: rs.rubricScores, feedback: g.feedback || '', latePenaltyPct: pen, finalScore: M.finalScore(rs.score, pen), points: A.points, released: g.released, gradedAtMs: now - DAY };
      }
    };
    students.forEach((s, i) => {
      put('c1', 'a1', s.uid, { text: 'I want to study how cities plan for floods, because my neighbourhood floods every rainy season…', submittedAtMs: at(-24, 18 + (i % 4), 10) }, { score: 6 + (i % 5), feedback: i % 3 ? 'Clear topic sentence. Work on linking ideas.' : 'Good start — vary your sentence openings.', released: true });
      if (i < 10) {
        const late = i === 4 || i === 8;
        put('c1', 'a2', s.uid, { files: [{ path: 'demo', name: `${s.name.split(' ')[0]}-essay1.pdf`, size: 180000 + i * 9000, type: 'application/pdf' }], submittedAtMs: late ? at(-4, 10, 5) : at(-6, 20, 30) },
          i < 6 ? { rubricScores: { arg: 5 + (i % 4), evi: 3 + (i % 4), org: 3 + (i % 2), lan: 2 }, feedback: 'Strong thesis. Two of your sources are not academic — replace them in the next draft.', released: false } : null);
      }
      if (i < 3) put('c1', 'a3', s.uid, { link: 'https://docs.google.com/document/d/demo-bibliography-' + (i + 1), submittedAtMs: at(-1, 9 + i, 0) }, null);
    });
    /* v2.16.0: groups and their task lists (Academic Writing: An's group "Floodwatch"; Research Methods: two groups for An to see as a TA) */
    const groups = {
      c1: [
        { id: 'g1', name: 'Floodwatch', memberUids: ['d1', 'd2', 'd3'] }, { id: 'g2', name: 'Plain English', memberUids: ['d4', 'd5', 'd6'] },
        { id: 'g3', name: 'Citation Station', memberUids: ['d7', 'd8', 'd9'] }, { id: 'g4', name: 'Hedge Fund', memberUids: ['d10', 'd11', 'd12'] }],
      c2: [{ id: 'g5', name: 'Campus Life', memberUids: ['d2', 'd3', 'd4'] }, { id: 'g6', name: 'Commuters', memberUids: ['d5', 'd6', 'd7'] }],
    };
    Object.values(groups).flat().forEach((g) => { g.memberNames = Object.fromEntries(g.memberUids.map((u) => [u, students.find((x) => x.uid === u).name])); g.createdAtMs = at(-10, 9, 0); });
    const tasks = {
      g1: [
        { id: 'k1', title: 'Choose the myth', done: true, doneAtMs: at(-3, 18, 0), assigneeUid: null, assigneeName: '', dueAtMs: at(-3), createdByName: 'Binh Tran', createdAtMs: at(-6, 10, 0) },
        { id: 'k2', title: 'Find three studies against it', done: false, assigneeUid: 'd1', assigneeName: 'An Nguyen', dueAtMs: at(4), createdByName: 'Binh Tran', createdAtMs: at(-5, 11, 0) },
        { id: 'k3', title: 'Draft the slides', done: false, assigneeUid: 'd2', assigneeName: 'Binh Tran', dueAtMs: at(8), createdByName: 'Chi Le', createdAtMs: at(-4, 9, 0) },
        { id: 'k4', title: 'Rehearse together (Room L3)', done: false, assigneeUid: null, assigneeName: '', dueAtMs: at(10, 17, 0), createdByName: 'Chi Le', createdAtMs: at(-2, 20, 0) }],
      g2: [{ id: 'k5', title: 'Pick a myth', done: true, doneAtMs: at(-2), assigneeUid: null, assigneeName: '', dueAtMs: null, createdByName: 'Duc Pham', createdAtMs: at(-4) }],
      g5: [{ id: 'k6', title: 'Agree on the survey platform', done: false, assigneeUid: 'd3', assigneeName: 'Chi Le', dueAtMs: at(2), createdByName: 'Binh Tran', createdAtMs: at(-1) }],
    };
    const groupOf = (c, uid) => (groups[c] || []).find((g) => g.memberUids.includes(uid));
    /* v2.17.0: An's family view — on, sharing courses and deadlines, with her mother linked */
    const fam = { enabled: true, share: { courses: true, deadlines: true, grades: false, calendar: false }, invite: null,
      guardians: [{ uid: 'pm', name: 'Mai Nguyen', email: 'mai.nguyen@demo-mail.com', linkedAtMs: at(-20, 19, 0), lastViewedAtMs: at(-1, 20, 30) }] };
    groups.c1[1].memberUids.forEach((u) => put('c1', 'a5', u, { files: [{ path: 'demo', name: 'plain-english-myth.pdf', size: 912000, type: 'application/pdf' }], submittedAtMs: at(-1, 21, 15),
      groupId: 'g2', groupName: 'Plain English', groupUids: groups.c1[1].memberUids, submittedBy: 'd4', submittedByName: 'Duc Pham' }, null));
    const qs = ['Do first-year students who live on campus feel less lonely than those who commute?', 'How many hours a week do students in paid work study outside class?', 'Do students trust AI tools more for coding or for writing?', 'Does the library’s late opening change when students study?', 'How do international students choose their first-year courses?', 'Do group projects improve how students rate their course?', 'How far do students travel to campus, and does it affect attendance?'];
    students.slice(1, 8).forEach((s, i) => put('c2', 'b0', s.uid, { text: qs[i], submittedAtMs: i === 6 ? at(-2, 9, 0) : at(-4, 15 + (i % 5), 20) }, i < 2 ? { score: 8 + (i % 2), feedback: 'Clear and answerable. Say who you will survey.', released: false } : null));
    void rnd;
    /* v2.13.0: modules, progress, announcements and read status for the demo courses */
    const mods = {
      c1: [
        { id: 'm1', title: 'Week 1: What academic writing is', order: 1, releaseAtMs: at(-28, 8, 0), items: [
          { id: 'w1p', kind: 'page', title: 'Welcome to ENG 201', body: 'Welcome! This course is about writing clear, well-supported arguments for university.\n\nEach week has a short reading, a lecture and one task. Tick items off as you go.\nOffice hours: Wednesdays 14:00, room B204.' },
          { id: 'w1s', kind: 'link', title: 'Course syllabus (PDF)', url: 'https://example.edu/eng201/syllabus.pdf' },
          { id: 'w1r', kind: 'reading', title: 'Swales & Feak, unit 1', url: '' },
          { id: 'w1a', kind: 'assignment', refId: 'a1', title: 'Diagnostic paragraph' }] },
        { id: 'm2', title: 'Week 2: Thesis and argument', order: 2, releaseAtMs: at(-21, 8, 0), items: [
          { id: 'w2p', kind: 'page', title: 'Lecture notes: a thesis you can defend', body: 'A thesis is a claim someone could disagree with.\n\nTest: can you name the evidence that would prove you wrong?\nNarrow it: one place, one period, one group.' },
          { id: 'w2v', kind: 'link', title: 'Lecture recording (video)', url: 'https://example.edu/eng201/week2-video' },
          { id: 'w2a', kind: 'assignment', refId: 'a2', title: 'Essay 1: Argument' }] },
        { id: 'm3', title: 'Week 3: Sources and evidence', order: 3, releaseAtMs: at(-3, 8, 0), items: [
          { id: 'w3r', kind: 'reading', title: 'Booth et al., chapter 5: finding sources', url: 'https://example.edu/eng201/booth-ch5' },
          { id: 'w3l', kind: 'link', title: 'Library guide: academic databases', url: 'https://example.edu/library/databases' },
          { id: 'w3a', kind: 'assignment', refId: 'a3', title: 'Annotated bibliography' }] },
        { id: 'm4', title: 'Week 4: Midterm reflection', order: 4, releaseAtMs: at(5, 8, 0), items: [
          { id: 'w4p', kind: 'page', title: 'How to reflect on your writing', body: 'Compare your diagnostic paragraph with Essay 1. What changed, and why?' },
          { id: 'w4a', kind: 'assignment', refId: 'a4', title: 'Midterm reflection' }] },
      ],
      c2: [
        { id: 'r1', title: 'Week 1: Designing a survey', order: 1, releaseAtMs: at(-7, 8, 0), items: [
          { id: 'r1p', kind: 'page', title: 'Good survey questions', body: 'One idea per question. No leading words. Offer a "don’t know" option.' },
          { id: 'r1a', kind: 'assignment', refId: 'b1', title: 'Survey design draft' }] },
      ],
    };
    const progress = { c1: { d1: { w1p: at(-27), w1s: at(-27), w1r: at(-26), w1a: at(-24), w2p: at(-20), w2v: at(-19), w2a: at(-6) } } };
    const anns = {
      c1: [
        { id: 'n1', title: 'Essay 1 grades next week', body: 'I am reading your essays now. Grades and rubric comments will be released next Wednesday. Please read the comments before you start the annotated bibliography.', pinned: true, authorName: me.teacher.name, createdAtMs: at(-2, 9, 30) },
        { id: 'n2', title: 'Library session moved to room L3', body: 'Thursday’s library session on finding academic sources is in room L3, not the main hall.', pinned: false, authorName: me.teacher.name, createdAtMs: at(-5, 16, 10) },
        { id: 'n3', title: 'Welcome to Academic Writing', body: 'Welcome! Start with Week 1 in Modules. Join the course in UniStudentDeck with the code WRIT-2026 if a friend hasn’t yet.', pinned: false, authorName: me.teacher.name, createdAtMs: at(-28, 8, 5) },
      ],
      c2: [{ id: 'q1', title: 'Survey ethics form', body: 'Before you collect any responses, submit the one-page ethics form linked in Week 1.', pinned: false, authorName: me.teacher.name, createdAtMs: at(-1, 11, 0) }],
    };
    const reads = { c1: { d1: { n3: at(-28, 9, 0), n2: at(-5, 18, 0) }, d2: { n3: at(-27), n1: at(-1) }, d3: { n3: at(-27) }, d4: { n3: at(-26), n2: at(-4) } } };
    /* v2.14.0: discussions, calendar events and office hours for the demo courses */
    const wk = (dow, h, m, weeks = 0) => { const x = new Date(now); x.setHours(h, m, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) + ((dow + 6) % 7) + weeks * 7); return x.getTime(); };   // dow: 1 = Monday
    const HOUR = 36e5;
    const threads = {
      c1: [
        { id: 't1', title: 'Is hedging a sign of weak writing?', body: 'This week we read about hedging. Some people say "may" and "suggests" make writing sound unsure. Do you agree? Give one example from your own field.', postFirst: true, pinned: true, locked: false, authorName: me.teacher.name, createdAtMs: at(-4, 9, 0) },
        { id: 't2', title: 'Questions about Essay 1', body: 'Ask anything about Essay 1 here so everyone sees the answer.', postFirst: false, pinned: false, locked: false, authorName: me.teacher.name, createdAtMs: at(-12, 10, 0) },
      ],
      c2: [{ id: 't3', title: 'Sampling for your project', body: 'Describe your sampling plan in three sentences. Reply to one classmate.', postFirst: false, pinned: false, locked: false, authorName: me.teacher.name, createdAtMs: at(-2, 13, 0) }],
    };
    const posts = {
      t1: [
        { id: 'p1', uid: 'd2', name: 'Binh Tran', role: 'student', body: 'I disagree. In engineering reports we hedge because measurements have error. "The results suggest" is just honest.', createdAtMs: at(-3, 20, 15) },
        { id: 'p2', uid: 'd3', name: 'Chi Le', role: 'student', body: 'Too much hedging is a problem though. My first draft had "may possibly" three times in one paragraph.', createdAtMs: at(-3, 21, 40) },
        { id: 'p3', uid: 'dt', name: me.teacher.name, role: 'instructor', body: 'Both good points. The skill is matching the strength of the claim to the strength of the evidence.', createdAtMs: at(-2, 8, 30) },
        { id: 'p4', uid: 'd5', name: 'Giang Vo', role: 'student', body: 'In medicine papers we say "is associated with" instead of "causes" unless it was a trial. That is hedging too.', createdAtMs: at(-1, 19, 5) },
      ],
      t2: [
        { id: 'p5', uid: 'd4', name: 'Duc Pham', role: 'student', body: 'Can we use news articles as one of the three sources?', createdAtMs: at(-10, 17, 0) },
        { id: 'p6', uid: 'dt', name: me.teacher.name, role: 'instructor', body: 'One news source is fine for background, but your three main sources must be academic.', createdAtMs: at(-10, 18, 20) },
        { id: 'p7', uid: 'd1', name: 'An Nguyen', role: 'student', body: 'Is the 1,000 words with or without the references?', createdAtMs: at(-8, 11, 0) },
        { id: 'p8', uid: 'dt', name: me.teacher.name, role: 'instructor', body: 'Without the references.', createdAtMs: at(-8, 12, 5) },
      ],
      t3: [{ id: 'p9', uid: 'd2', name: 'Binh Tran', role: 'student', body: 'Stratified by faculty, then random within each. About 30 per faculty.', createdAtMs: at(-1, 9, 0) }],
    };
    const posted = { t1: new Set(['d2', 'd3', 'd5']), t2: new Set(['d4', 'd1']), t3: new Set(['d2']) };
    const events = {
      c1: [
        { id: 'e1', title: 'Lecture: Academic Writing', kind: 'class', startAtMs: wk(1, 9, 0, -4), endAtMs: wk(1, 9, 0, -4) + 1.5 * HOUR, location: 'Hall B', link: '', weeklyUntilMs: wk(1, 9, 0, 8) },
        { id: 'e2', title: 'Seminar: Academic Writing', kind: 'class', startAtMs: wk(3, 10, 0, -4), endAtMs: wk(3, 10, 0, -4) + HOUR, location: 'Room B204', link: '', weeklyUntilMs: wk(3, 10, 0, 8) },
        { id: 'e3', title: 'Midterm: in-class writing', kind: 'exam', startAtMs: at(9, 9, 0), endAtMs: at(9, 9, 0) + 2 * HOUR, location: 'Hall C', link: '', weeklyUntilMs: null },
      ],
      c2: [{ id: 'e4', title: 'Lecture: Research Methods', kind: 'class', startAtMs: wk(2, 14, 0, -4), endAtMs: wk(2, 14, 0, -4) + 1.5 * HOUR, location: 'Room S310', link: '', weeklyUntilMs: wk(2, 14, 0, 8) }],
    };
    const slots = { c1: [], c2: [], c3: [] }, bookings = { c1: {}, c2: {}, c3: {} };
    for (let i = 0; i < 6; i++) { const s = wk(3, 14, 0, 1) + i * 20 * 6e4; slots.c1.push({ id: 'o' + i, startAtMs: s, endAtMs: s + 20 * 6e4, location: 'Room B204', link: 'https://meet.example.com/eng201-office-hours', booked: false }); }
    [[1, 'd3', 'Chi Le', 'Essay 1 rubric'], [2, 'd1', 'An Nguyen', 'Narrowing my research question'], [4, 'd6', 'Hanh Do', '']].forEach(([i, uid, name, note]) => { slots.c1[i].booked = true; bookings.c1['o' + i] = { slotId: 'o' + i, uid, name, note, startAtMs: slots.c1[i].startAtMs, endAtMs: slots.c1[i].endAtMs, bookedAtMs: at(-1) }; });
    /* v2.19.0: quizzes and question banks for the demo courses (the answers stay with the staff screens) */
    const QZ = {
      mc: (text, opts, right, points = 1) => ({ type: 'mc', text, points, options: opts.map((t, i) => ({ id: 'o' + (i + 1), text: t })), correct: [].concat(right).map((i) => 'o' + (i + 1)) }),
      tf: (text, answer, points = 1) => ({ type: 'tf', text, answer, points }),
      short: (text, accept, points = 1) => ({ type: 'short', text, accept, points }),
    };
    const qids = (qs) => qs.map((q, i) => ({ id: 'q' + (i + 1), ...q }));
    const quizzes = {
      c1: [{ id: 'z1', title: 'Week 3 check: finding sources', instructions: 'Four questions on choosing and judging sources. You can look at your notes.', category: 'assignments', timeLimitMin: 15, attempts: 2,
        openAtMs: at(-2, 9, 0), dueAtMs: at(5, 23, 59), shuffle: true, published: true, points: 5, questionCount: 4, createdAtMs: at(-3, 10, 0),
        questions: qids([QZ.mc('Which of these is a primary source?', ['A diary written during the event', 'A textbook chapter about the event', 'An encyclopedia entry'], 0),
          QZ.tf('A thesis statement should be a question.', false),
          QZ.mc('Which make a source more reliable? (Select all that apply.)', ['Peer review', 'A named author', 'Lots of shares online', 'A clear date'], [0, 1, 3], 2),
          QZ.short('Which citation style puts (Author, year) in the text?', ['APA', 'APA style', 'Harvard'])]) },
      { id: 'z2', title: 'Midterm practice', instructions: '', category: 'assignments', timeLimitMin: 0, attempts: 0, openAtMs: null, dueAtMs: at(8, 23, 59), shuffle: false, published: false,
        points: 1, questionCount: 1, createdAtMs: at(-1, 15, 0), questions: qids([QZ.tf('Paraphrasing still needs a citation.', true)]) }],
      c2: [],
    };
    const banks = {
      c1: [{ id: 'b1', title: 'Citations and plagiarism', updatedAtMs: at(-6, 11, 0), questions: qids([QZ.tf('Common knowledge needs a citation.', false),
        QZ.mc('You copy a sentence and cite it, but leave out the quotation marks. This is…', ['Fine', 'Plagiarism', 'Paraphrasing'], 1),
        QZ.short('What is the list of sources at the end of an APA paper called?', ['References', 'Reference list'])]) }],
      c2: [],
    };
    banks.c1.forEach((b) => { b.count = b.questions.length; });
    function demoQuestions(list) {
      return (list || []).map((q, i) => {
        const where = `Question ${i + 1}`;
        if (!String(q.text || '').trim()) throw new Error(`${where} needs its question.`);
        const out = { id: q.id || 'q' + (i + 1), type: q.type, text: String(q.text).trim(), points: Number(q.points) || 1 };
        if (q.type === 'mc') {
          out.options = (q.options || []).filter((o) => String(o.text || '').trim());
          out.correct = (q.correct || []).filter((id) => out.options.some((o) => o.id === id));
          if (out.options.length < 2) throw new Error(`${where} needs at least two choices.`);
          if (!out.correct.length) throw new Error(`${where}: mark the right choice.`);
        } else if (q.type === 'tf') {
          if (typeof q.answer !== 'boolean') throw new Error(`${where}: choose whether the answer is true or false.`);
          out.answer = q.answer;
        } else out.accept = (q.accept || []).map((a) => String(a).trim()).filter(Boolean);
        return out;
      });
    }
    /* v2.20.0: attempts, scored the way the backend's quizzes.js scores them. Four classmates have taken the first quiz. */
    const attempts = [];
    const qnorm = (x) => String(x || '').trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
    function qscore(q, ans) {
      if (q.type === 'mc') { const got = [...new Set(Array.isArray(ans) ? ans : [])].sort(), want = [...q.correct].sort(); return { score: got.length === want.length && got.every((x, i) => x === want[i]) ? q.points : 0, pending: false }; }
      if (q.type === 'tf') return { score: ans === q.answer ? q.points : 0, pending: false };
      if (!(q.accept || []).length) return { score: 0, pending: true };
      return { score: qnorm(ans) && q.accept.some((x) => qnorm(x) === qnorm(ans)) ? q.points : 0, pending: false };
    }
    function qscoreAll(qs, answers, prev) {
      const results = {}; let score = 0, pending = 0;
      qs.forEach((q) => { const r = prev && prev[q.id] && prev[q.id].by ? prev[q.id] : qscore(q, (answers || {})[q.id]); results[q.id] = r; score += r.score || 0; if (r.pending) pending++; });
      return { results, score: M.round2(score), points: M.round2(qs.reduce((x, q) => x + q.points, 0)), pending };
    }
    function quizGrade(c, quiz, uid) {
      const done = attempts.filter((t) => t.c === c && t.quizId === quiz.id && t.uid === uid && t.status === 'submitted');
      if (!done.length) return;
      const best = done.reduce((b, t) => (t.score > b.score || (t.score === b.score && t.attempt > b.attempt) ? t : b));
      grades[k(c, quiz.id, uid)] = { assignmentId: quiz.id, kind: 'quiz', uid, score: best.score, rubricScores: {}, feedback: '', latePenaltyPct: 0, finalScore: best.score,
        points: best.points, released: !!quiz.resultsReleased, releasedAtMs: quiz.resultsReleased ? Date.now() : null, gradedAtMs: Date.now(), needsGrading: best.pending > 0 };
    }
    function finishDemo(c, t, timedOut) {
      const quiz = quizzes[c].find((z) => z.id === t.quizId);
      Object.assign(t, qscoreAll(quiz.questions, t.answers), { status: 'submitted', submittedAtMs: Date.now(), timedOut: !!timedOut, released: !!quiz.resultsReleased });
      quizGrade(c, quiz, t.uid);
    }
    const closeDemo = (c) => attempts.filter((t) => t.c === c && t.status === 'open' && t.endsAtMs && t.endsAtMs + 30000 < Date.now()).forEach((t) => finishDemo(c, t, true));
    [['d2', { q1: ['o1'], q2: false, q3: ['o1', 'o2', 'o4'], q4: 'APA' }], ['d3', { q1: ['o2'], q2: false, q3: ['o1', 'o2'], q4: 'apa.' }],
      ['d4', { q1: ['o1'], q2: true, q3: ['o1', 'o2', 'o4'], q4: 'MLA' }], ['d5', { q1: ['o1'], q2: false, q3: ['o1', 'o2', 'o4'], q4: 'Harvard' }]].forEach(([uid, answers], i) => {
      const quiz = quizzes.c1[0];
      const t = { id: 't' + (i + 1), c: 'c1', quizId: quiz.id, uid, name: students.find((x) => x.uid === uid).name, attempt: 1, startedAtMs: at(-1, 10 + i, 0), endsAtMs: at(-1, 10 + i, 15),
        order: quiz.questions.map((q) => q.id), optOrder: {}, answers, status: 'open' };
      attempts.push(t); finishDemo('c1', t, false); t.submittedAtMs = at(-1, 10 + i, 9 + i);
    });
    /* v2.21.0: supervisor notes. In the demo, An Nguyen shares with Dr Linh Vu (the demo lecturer). */
    const sup = { enabled: true, includeThesis: true, invite: null, publishedAtMs: at(-1, 18, 0),
      supervisors: { dt: { name: 'Dr Linh Vu', email: 'linh.vu@demo.uni.edu', linkedAtMs: at(-40, 10, 0), lastViewedAtMs: at(-1, 21, 5) } },
      snapshot: { meetings: [
        { id: 'm3', atMs: at(-1, 15, 0), title: 'Chapter 2 draft', agenda: ['Structure of the literature review', 'Which theories to keep'], notes: 'Keep the sociolinguistic and the pedagogical strands apart. Cut the section on bilingual memory.', actions: [{ id: 'a1', text: 'Reorganise chapter 2 into two strands', owner: 'me', dueAtMs: at(10), done: false }, { id: 'a2', text: 'Send two key papers on translanguaging', owner: 'supervisor', dueAtMs: at(3), done: false }] },
        { id: 'm2', atMs: at(-15, 15, 0), title: 'Ethics and data', agenda: ['Ethics form', 'Recording consent'], notes: 'Ethics approved with one change: consent forms in Vietnamese too.', actions: [{ id: 'a3', text: 'Translate the consent form', owner: 'me', dueAtMs: at(-8), done: true }] },
        { id: 'm1', atMs: at(-36, 10, 0), title: 'Research question', agenda: ['Narrowing the question'], notes: 'Focus on secondary schools in Hanoi.', actions: [{ id: 'a4', text: 'Rewrite the research question', owner: 'me', dueAtMs: at(-30), done: true }] }],
        thesis: { title: 'Code-switching in Hanoi secondary classrooms', dueAtMs: at(210), wordGoal: 60000,
          chapters: [{ id: 'c1', title: 'Introduction', status: 'revising', words: 5200, goal: 6000, dueAtMs: null }, { id: 'c2', title: 'Literature review', status: 'drafting', words: 8400, goal: 15000, dueAtMs: at(30) },
            { id: 'c3', title: 'Methodology', status: 'planned', words: 0, goal: 10000, dueAtMs: at(70) }, { id: 'c4', title: 'Findings', status: 'planned', words: 0, goal: 18000, dueAtMs: null }],
          milestones: [{ id: 'k1', title: 'Ethics approval', dueAtMs: at(-14), done: true }, { id: 'k2', title: 'Classroom recordings', dueAtMs: at(45), done: false }, { id: 'k3', title: 'Full draft to supervisor', dueAtMs: at(180), done: false }] } } };
    const supOut = () => ({ enabled: sup.enabled, includeThesis: sup.includeThesis, publishedAtMs: sup.publishedAtMs,
      supervisors: Object.entries(sup.supervisors).map(([uid, x]) => ({ uid, ...x })), invite: sup.invite && sup.invite.expiresAtMs > Date.now() ? { ...sup.invite } : null });
    const wait = () => new Promise((r) => setTimeout(r, 160));
    const role = () => state.role;
    const myUid = () => (role() === 'teacher' ? me.teacher.uid : me.student.uid);
    const inCourse = (c) => role() === 'teacher' || membership[c].has(myUid());
    const courseRole = (c, uid = myUid()) => (uid === me.teacher.uid ? 'instructor' : ((staffRoles[c] || {})[uid] || 'student'));
    const isStaff = (c) => role() === 'teacher' || courseRole(c) === 'ta';
    const need = (c) => { if (!courses[c] || !inCourse(c)) throw new Error('You are not in this course.'); };
    return {
      async signIn(r) { await wait(); const p = r === 'teacher' ? me.teacher : me.student; state = { ...state, user: { uid: p.uid, name: p.name, email: p.email }, role: r === 'teacher' ? 'teacher' : 'unistudent', under18: false, needsBirthDate: r !== 'teacher' }; fire(); },
      async completeProfile() { await wait(); state = { ...state, needsBirthDate: false }; fire(); },
      async signOut() { state = { ...state, user: null, role: null }; fire(); },
      async myCourses() { await wait(); return Object.values(courses).filter((c) => inCourse(c.courseId)).map((c) => ({ courseId: c.courseId, role: courseRole(c.courseId), title: c.title, term: c.term, section: c.section })); },
      async course(c) { await wait(); need(c); const x = { ...courses[c], memberCount: membership[c].size, assignmentCount: asg[c].length }; if (!isStaff(c)) delete x.code; return x; },
      async createCourse(f) { await wait(); const id = 'c' + (Object.keys(courses).length + 1); const w = M.cleanWeights(f.weights); if (w.error) throw new Error(w.error);
        courses[id] = { courseId: id, title: f.title, term: f.term || '', section: f.section || '', code: 'DEMO-' + (1000 + Object.keys(courses).length), ownerName: me.teacher.name, weights: w.weights, latePolicy: M.cleanLatePolicy(f.latePolicy), archived: false };
        asg[id] = []; membership[id] = new Set(); return { courseId: id, code: courses[id].code }; },
      async updateCourse(c, f) { await wait(); need(c); if (f.weights) { const w = M.cleanWeights(f.weights); if (w.error) throw new Error(w.error); f = { ...f, weights: w.weights }; }
        if (f.latePolicy) f = { ...f, latePolicy: M.cleanLatePolicy(f.latePolicy) }; Object.assign(courses[c], f); return { ok: true }; },
      async regenerateCode(c) { await wait(); courses[c].code = 'DEMO-' + Math.floor(1000 + Math.random() * 9000); return { code: courses[c].code }; },
      async joinCourse(code) { await wait(); const c = Object.values(courses).find((x) => x.code === String(code).trim().toUpperCase());
        if (!c) throw new Error('No course has that code. In the demo, try STAT-1201.'); const was = membership[c.courseId].has(myUid()); membership[c.courseId].add(myUid()); return { courseId: c.courseId, title: c.title, alreadyIn: was }; },
      async leaveCourse(c) { await wait(); membership[c].delete(myUid()); return { ok: true }; },
      async setMemberRole(c, uid, r) { await wait(); (staffRoles[c] || (staffRoles[c] = {}))[uid] = r; return { ok: true }; },
      async assignments(c) { await wait(); need(c); return asg[c].map((a) => ({ ...a })).sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15)); },
      async saveAssignment(c, a) { await wait(); need(c); const rub = (a.rubric || []).map((r, i) => ({ id: r.id || 'r' + (i + 1), criterion: r.criterion, points: Number(r.points) }));
        const pts = rub.length ? rub.reduce((s, r) => s + r.points, 0) : Number(a.points); if (!a.title) throw new Error('Give the assignment a title.'); if (!(pts > 0)) throw new Error('Points must be above 0.');
        const row = { title: a.title, instructions: a.instructions || '', dueAtMs: a.dueAtMs || null, points: pts, rubric: rub, submitType: a.submitType || 'any', attempts: Number(a.attempts) || 0, category: a.category || 'assignments', latePolicy: a.latePolicy || null };
        if (a.id) { Object.assign(asg[c].find((x) => x.id === a.id), row); return { assignmentId: a.id }; }
        const id = 'n' + Math.random().toString(36).slice(2, 7); asg[c].push({ id, ...row }); return { assignmentId: id }; },
      async deleteAssignment(c, id) { await wait(); if (Object.keys(subs).some((x) => x.startsWith(`${c}|${id}|`))) throw new Error('Students have already submitted to this assignment, so it cannot be deleted.'); asg[c] = asg[c].filter((a) => a.id !== id); return { ok: true }; },
      async mySubmissions(c) { await wait(); const out = {}; for (const [key, s] of Object.entries(subs)) if (key.startsWith(c + '|') && s.uid === myUid()) out[s.assignmentId] = { ...s }; return out; },
      async myGrades(c) { await wait(); const out = {}; for (const [key, g] of Object.entries(grades)) if (key.startsWith(c + '|') && g.uid === myUid() && g.released) out[g.assignmentId] = { ...g }; return out; },
      async uploadFile(c, a, file, onProgress) { for (let p = 0; p <= 100; p += 25) { if (onProgress) onProgress(p); await wait(); } return { path: 'demo', name: file.name, size: file.size, type: file.type }; },
      async submit(c, aId, w) { await wait(); need(c); const A = asg[c].find((x) => x.id === aId); const pol = A.latePolicy || courses[c].latePolicy;
        const G = A.group ? groupOf(c, myUid()) : null; if (A.group && !G) throw new Error('This is a group assignment and you are not in a group yet. Ask your instructor.');
        if (!M.acceptsSubmission(pol, A.dueAtMs, Date.now())) throw new Error('The due date has passed and this assignment does not accept late work.');
        const uids = G ? G.memberUids : [myUid()];
        const attempt = Math.max(0, ...uids.map((u) => (subs[k(c, aId, u)] ? subs[k(c, aId, u)].attempt : 0))) + 1;
        if (A.attempts && attempt > A.attempts) throw new Error(A.attempts === 1 ? 'This assignment allows one submission.' : `This assignment allows ${A.attempts} submissions.`);
        if (!w.text && !w.link && !(w.files || []).length) throw new Error('Add your work before submitting.');
        const L = M.lateness(A.dueAtMs, Date.now());
        uids.forEach((u) => {
          subs[k(c, aId, u)] = { assignmentId: aId, uid: u, name: students.find((x) => x.uid === u).name, text: w.text || '', link: w.link || '', files: w.files || [], submittedAtMs: Date.now(), attempt, ...L,
            ...(G ? { groupId: G.id, groupName: G.name, groupUids: uids, submittedBy: myUid(), submittedByName: me.student.name } : {}) };
          if (grades[k(c, aId, u)]) grades[k(c, aId, u)].needsRegrade = true; });
        return { attempt, ...L, members: uids.length }; },
      async roster(c) { await wait(); return students.filter((s) => membership[c].has(s.uid)).map((s) => ({ ...s, role: courseRole(c, s.uid) })); },
      async submissions(c, aId) { await wait(); return Object.values(subs).filter((s) => s.assignmentId === aId && subs[k(c, aId, s.uid)] === s).map((s) => ({ ...s })); },
      async grades(c) { await wait(); return Object.entries(grades).filter(([key]) => key.startsWith(c + '|')).map(([, g]) => ({ ...g })); },
      async grade(c, aId, uid, g) { await wait(); const A = asg[c].find((x) => x.id === aId); const s = subs[k(c, aId, uid)];
        const targets = g.wholeGroup && A.group && s && s.groupUids ? s.groupUids.filter((u) => courseRole(c, u) === 'student') : [uid]; let out = null;
        for (const t of targets) out = await this.gradeOne(c, aId, t, g); return { ...out, graded: targets.length }; },
      async gradeOne(c, aId, uid, g) { const A = asg[c].find((x) => x.id === aId); const s = subs[k(c, aId, uid)];
        const rs = A.rubric.length ? M.rubricScore(A.rubric, g.rubricScores) : { score: M.round2(Number(g.score)), rubricScores: {} };
        if (!A.rubric.length && !(rs.score >= 0 && rs.score <= A.points)) throw new Error(`The score must be from 0 to ${A.points}.`);
        const pen = M.latePenaltyPct(A.latePolicy || courses[c].latePolicy, s ? s.lateDays : 0); const prev = grades[k(c, aId, uid)];
        grades[k(c, aId, uid)] = { assignmentId: aId, uid, score: rs.score, rubricScores: rs.rubricScores, feedback: g.feedback || '', latePenaltyPct: pen, finalScore: M.finalScore(rs.score, pen), points: A.points, released: prev ? prev.released : false, gradedAtMs: Date.now(), needsRegrade: false };
        return { score: rs.score, finalScore: grades[k(c, aId, uid)].finalScore, latePenaltyPct: pen }; },
      async release(c, aId) { await wait(); let n = 0; for (const [key, g] of Object.entries(grades)) if (key.startsWith(`${c}|${aId}|`) && !g.released) { g.released = true; g.releasedAtMs = Date.now(); n++; } return { released: n }; },
      async exportGradebook(c) { await wait(); const csv = M.gradebookCsv(courses[c], students.filter((s) => membership[c].has(s.uid) && courseRole(c, s.uid) === 'student'), asg[c], Object.entries(grades).filter(([key]) => key.startsWith(c + '|')).map(([, g]) => g));
        return { csv, filename: `${courses[c].title.replace(/[^A-Za-z0-9]+/g, '-')}-gradebook.csv` }; },
      /* ---- v2.13.0 modules and announcements (demo) ---- */
      async modules(c) { await wait(); need(c); return (mods[c] || []).map((m) => ({ ...m, items: m.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, refId: i.refId })) })).sort((a, b) => a.order - b.order); },
      async moduleContent(c, mid) { await wait(); need(c); const m = (mods[c] || []).find((x) => x.id === mid); if (!m) return null;
        if (!isStaff(c) && m.releaseAtMs && m.releaseAtMs > Date.now()) return null;
        const items = {}; m.items.forEach((i) => { if (i.url || i.body) items[i.id] = { url: i.url, body: i.body }; }); return { releaseAtMs: m.releaseAtMs, items }; },
      async saveModule(c, m) { await wait(); need(c); if (!m.title) throw new Error('Give the module a title.');
        const items = (m.items || []).map((i) => ({ id: i.id || Math.random().toString(36).slice(2, 10), kind: i.kind, title: i.kind === 'assignment' ? ((asg[c].find((a) => a.id === i.refId) || {}).title || '') : i.title, refId: i.refId, url: i.url || '', body: i.body || '' }));
        const list = mods[c] || (mods[c] = []);
        if (m.id) { Object.assign(list.find((x) => x.id === m.id), { title: m.title, releaseAtMs: m.releaseAtMs || null, items }); return { moduleId: m.id }; }
        const id = 'm' + Math.random().toString(36).slice(2, 7); list.push({ id, title: m.title, order: list.length + 1, releaseAtMs: m.releaseAtMs || null, items }); return { moduleId: id }; },
      async reorderModules(c, order) { await wait(); order.forEach((id, i) => { const m = mods[c].find((x) => x.id === id); if (m) m.order = i + 1; }); return { ok: true }; },
      async deleteModule(c, mid) { await wait(); mods[c] = mods[c].filter((m) => m.id !== mid); return { ok: true }; },
      async myProgress(c) { await wait(); return { ...((progress[c] || {})[myUid()] || {}) }; },
      async markItemDone(c, mid, iid, done) { await wait(); const m = mods[c].find((x) => x.id === mid); if (m.releaseAtMs && m.releaseAtMs > Date.now()) throw new Error('This module is not open yet.');
        const p = (progress[c] || (progress[c] = {}))[myUid()] || (progress[c][myUid()] = {}); if (done) p[iid] = p[iid] || Date.now(); else delete p[iid]; return { ok: true }; },
      async progressAll(c) { await wait(); return Object.entries(progress[c] || {}).map(([uid, done]) => ({ uid, done: { ...done } })); },
      async announcements(c) { await wait(); need(c); return [...(anns[c] || [])].sort((a, b) => (b.pinned - a.pinned) || (b.createdAtMs - a.createdAtMs)).map((a) => ({ ...a })); },
      async saveAnnouncement(d) { await wait(); if (!d.title) throw new Error('Give the announcement a title.'); if (!d.body) throw new Error('Write the announcement.');
        if (d.id) { Object.assign(anns[d.courseId].find((a) => a.id === d.id), { title: d.title, body: d.body, pinned: !!d.pinned, editedAtMs: Date.now() }); return { posted: [{ courseId: d.courseId, announcementId: d.id }] }; }
        const posted = (d.courseIds || []).map((c) => { const id = 'n' + Math.random().toString(36).slice(2, 7); (anns[c] || (anns[c] = [])).push({ id, title: d.title, body: d.body, pinned: !!d.pinned, authorName: role() !== 'teacher' && courseRole(c) === 'ta' ? me.student.name : me.teacher.name, createdAtMs: Date.now() }); return { courseId: c, announcementId: id }; });
        if (!posted.length) throw new Error('Choose at least one course.'); return { posted }; },
      async deleteAnnouncement(c, id) { await wait(); anns[c] = anns[c].filter((a) => a.id !== id); return { ok: true }; },
      async myReads(c) { await wait(); return { ...((reads[c] || {})[myUid()] || {}) }; },
      async markRead(c, ids) { const r = (reads[c] || (reads[c] = {}))[myUid()] || (reads[c][myUid()] = {}); ids.forEach((id) => { r[id] = r[id] || Date.now(); }); return { ok: true }; },
      async readCounts(c) { await wait(); const out = {}; Object.values(reads[c] || {}).forEach((r) => Object.keys(r).forEach((id) => { out[id] = (out[id] || 0) + 1; })); return out; },
      /* ---- v2.14.0 discussions, calendar events, office hours (demo) ---- */
      async threads(c) { await wait(); need(c); return (threads[c] || []).map((x) => ({ ...x, postCount: (posts[x.id] || []).length, lastPostAtMs: Math.max(x.createdAtMs, ...(posts[x.id] || []).map((p) => p.createdAtMs)) })).sort((a, b) => (b.pinned - a.pinned) || (b.lastPostAtMs - a.lastPostAtMs)); },
      async posts(c, tid) { await wait(); need(c); const th = (threads[c] || []).find((x) => x.id === tid); if (!th) throw new Error('Discussion not found.');
        if (!isStaff(c) && th.postFirst && !(posted[tid] && posted[tid].has(myUid()))) return { locked: true, posts: [] };
        return { locked: false, posts: (posts[tid] || []).map((p) => ({ ...p })).sort((a, b) => a.createdAtMs - b.createdAtMs) }; },
      async saveThread(c, d) { await wait(); if (!d.title) throw new Error('Give the discussion a title.'); if (!d.body) throw new Error('Write the prompt for the discussion.');
        const list = threads[c] || (threads[c] = []); const flags = { postFirst: !!d.postFirst, pinned: !!d.pinned, locked: !!d.locked };
        if (d.id) { Object.assign(list.find((x) => x.id === d.id), { title: d.title, body: d.body, ...flags }); return { threadId: d.id }; }
        const id = 't' + Math.random().toString(36).slice(2, 7); list.push({ id, title: d.title, body: d.body, ...flags, authorName: courseRole(c) === 'ta' ? me.student.name : me.teacher.name, createdAtMs: Date.now() }); return { threadId: id }; },
      async deleteThread(c, tid) { await wait(); threads[c] = threads[c].filter((x) => x.id !== tid); delete posts[tid]; return { ok: true }; },
      async postReply(c, tid, body) { await wait(); const th = threads[c].find((x) => x.id === tid); if (th.locked) throw new Error('This discussion is closed.'); if (!String(body || '').trim()) throw new Error('Write your reply first.');
        const who = role() === 'teacher' ? { uid: me.teacher.uid, name: me.teacher.name, role: 'instructor' } : { uid: me.student.uid, name: me.student.name, role: courseRole(c) };
        const id = 'p' + Math.random().toString(36).slice(2, 7); (posts[tid] || (posts[tid] = [])).push({ id, ...who, body: String(body).trim(), createdAtMs: Date.now() }); (posted[tid] || (posted[tid] = new Set())).add(who.uid); return { postId: id }; },
      async editPost(c, tid, pid, body) { await wait(); const p = posts[tid].find((x) => x.id === pid); if (p.uid !== myUid()) throw new Error('You can only edit your own replies.'); p.body = body; p.editedAtMs = Date.now(); return { ok: true }; },
      async removePost(c, tid, pid) { await wait(); const p = posts[tid].find((x) => x.id === pid); if (p.uid !== myUid() && !isStaff(c)) throw new Error('You can only remove your own replies.'); p.body = ''; p.removed = true; return { ok: true }; },
      async events(c) { await wait(); need(c); return (events[c] || []).map((e) => ({ ...e })); },
      async saveEvent(c, e) { await wait(); if (!e.title) throw new Error('Give the event a title.'); const list = events[c] || (events[c] = []);
        const row = { title: e.title, kind: e.kind || 'other', startAtMs: e.startAtMs, endAtMs: e.endAtMs || e.startAtMs, location: e.location || '', link: e.link || '', weeklyUntilMs: e.weeklyUntilMs || null };
        if (e.id) { Object.assign(list.find((x) => x.id === e.id), row); return { eventId: e.id }; } const id = 'e' + Math.random().toString(36).slice(2, 7); list.push({ id, ...row }); return { eventId: id }; },
      async deleteEvent(c, id) { await wait(); events[c] = events[c].filter((x) => x.id !== id); return { ok: true }; },
      async slots(c) { await wait(); need(c); return (slots[c] || []).map((s) => ({ ...s })).sort((a, b) => a.startAtMs - b.startAtMs); },
      async myBookings(c) { await wait(); return Object.values(bookings[c] || {}).filter((b) => b.uid === myUid()).map((b) => ({ ...b })); },
      async bookings(c) { await wait(); return Object.values(bookings[c] || {}).map((b) => ({ ...b })); },
      async openSlots(c, d) { await wait(); const n = Math.floor((d.endAtMs - d.startAtMs) / (d.minutes * 6e4)); if (n < 1) throw new Error('That time is shorter than one slot.'); if (n > 40) throw new Error('Open up to 40 slots at once.');
        for (let i = 0; i < n; i++) { const s = d.startAtMs + i * d.minutes * 6e4; (slots[c] || (slots[c] = [])).push({ id: 'o' + Math.random().toString(36).slice(2, 7), startAtMs: s, endAtMs: s + d.minutes * 6e4, location: d.location || '', link: d.link || '', booked: false }); } return { created: n }; },
      async deleteSlot(c, id) { await wait(); slots[c] = slots[c].filter((s) => s.id !== id); delete bookings[c][id]; return { ok: true }; },
      async bookSlot(c, id, note) { await wait(); const s = slots[c].find((x) => x.id === id); if (s.booked) throw new Error('Someone just booked that slot. Pick another.'); if (s.startAtMs <= Date.now()) throw new Error('That slot has already started.');
        if (Object.values(bookings[c]).filter((b) => b.uid === myUid() && b.startAtMs > Date.now()).length >= 2) throw new Error('You can hold up to 2 upcoming bookings in a course.');
        s.booked = true; bookings[c][id] = { slotId: id, uid: myUid(), name: me.student.name, note: note || '', startAtMs: s.startAtMs, endAtMs: s.endAtMs, bookedAtMs: Date.now() }; return { ok: true, link: s.link, location: s.location }; },
      async cancelBooking(c, id) { await wait(); delete bookings[c][id]; const s = slots[c].find((x) => x.id === id); if (s) s.booked = false; return { ok: true }; },
      async fileUrl() { return null; },
      /* ---- v2.17.0 family view (demo) ---- */
      async familyStatus() { await wait(); return JSON.parse(JSON.stringify({ ...fam, invite: fam.invite && fam.invite.expiresAtMs > Date.now() ? fam.invite : null })); },
      async setFamilySharing(d) { await wait(); fam.enabled = !!d.enabled; if (d.share) fam.share = { ...fam.share, ...d.share }; return this.familyStatus(); },
      async createFamilyInvite() { await wait(); if (!fam.enabled) throw new Error('Turn on the family view first.'); if (fam.guardians.length >= 4) throw new Error('Up to 4 family members can be linked. Remove one first.');
        fam.invite = { code: 'HOME-' + Math.floor(2000 + Math.random() * 7000), expiresAtMs: Date.now() + 7 * DAY }; return { code: fam.invite.code, expiresAtMs: fam.invite.expiresAtMs }; },
      async cancelFamilyInvite() { await wait(); fam.invite = null; return { ok: true }; },
      async removeFamilyLink(guardianUid) { await wait(); fam.guardians = fam.guardians.filter((g) => g.uid !== guardianUid); return { ok: true }; },
      /* ---- v2.16.0 groups and task lists (demo) ---- */
      async myGroup(c) { await wait(); need(c); const g = groupOf(c, myUid()); return g ? { ...g } : null; },
      async allGroups(c) { await wait(); return (groups[c] || []).map((g) => ({ ...g })); },
      async saveGroups(c, list) { await wait(); const seen = new Set(), names = new Set();
        const out = list.map((g, i) => { const name = String(g.name || '').trim() || `Group ${i + 1}`; if (names.has(name.toLowerCase())) throw new Error(`Two groups are called "${name}". Give each group its own name.`); names.add(name.toLowerCase());
          (g.memberUids || []).forEach((u) => { if (seen.has(u)) throw new Error('A student is in two groups. A student is in one group per course.'); seen.add(u); });
          const id = g.id || 'g' + Math.random().toString(36).slice(2, 7); return { id, name, memberUids: [...g.memberUids], memberNames: Object.fromEntries(g.memberUids.map((u) => [u, students.find((x) => x.uid === u).name])), createdAtMs: Date.now() }; });
        const keep = new Set(out.map((g) => g.id)); (groups[c] || []).forEach((g) => { if (!keep.has(g.id)) delete tasks[g.id]; }); groups[c] = out;
        return { groups: out.map((g) => ({ id: g.id, name: g.name, size: g.memberUids.length })), ungrouped: [...membership[c]].filter((u) => courseRole(c, u) === 'student' && !seen.has(u)).length }; },
      async tasks(c, gid) { await wait(); return (tasks[gid] || []).map((t) => ({ ...t })).sort((a, b) => (a.done - b.done) || ((a.dueAtMs || 9e15) - (b.dueAtMs || 9e15))); },
      async saveTask(c, gid, t) { await wait(); if (!String(t.title || '').trim()) throw new Error('Write the task first.'); const g = (groups[c] || []).find((x) => x.id === gid);
        const row = { title: String(t.title).trim(), assigneeUid: t.assigneeUid || null, assigneeName: t.assigneeUid ? g.memberNames[t.assigneeUid] : '', dueAtMs: t.dueAtMs || null };
        const list = tasks[gid] || (tasks[gid] = []); if (t.id) { Object.assign(list.find((x) => x.id === t.id), row); return { taskId: t.id }; }
        const id = 'k' + Math.random().toString(36).slice(2, 7); list.push({ id, ...row, done: false, doneAtMs: null, createdByName: role() === 'teacher' ? me.teacher.name : me.student.name, createdAtMs: Date.now() }); return { taskId: id }; },
      async setTaskDone(c, gid, tid, done) { await wait(); const t = tasks[gid].find((x) => x.id === tid); t.done = !!done; t.doneAtMs = done ? Date.now() : null; return { ok: true }; },
      async deleteTask(c, gid, tid) { await wait(); tasks[gid] = tasks[gid].filter((x) => x.id !== tid); return { ok: true }; },
      /* ---- v2.19.0 quizzes and question banks (demo; the real checks are in the backend's quizzes.js) ---- */
      async quizzes(c) { await wait(); need(c); return (quizzes[c] || []).filter((q) => isStaff(c) || q.published).map(({ questions, ...q }) => ({ ...q })).sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15)); },
      async quizKey(c, id) { await wait(); if (!isStaff(c)) throw new Error('Only course staff can do this.'); const q = (quizzes[c] || []).find((x) => x.id === id); return q ? JSON.parse(JSON.stringify(q.questions)) : []; },
      async saveQuiz(c, d) { await wait(); need(c); if (!isStaff(c)) throw new Error('Only course staff can do this.'); if (!String(d.title || '').trim()) throw new Error('Give the quiz a title.');
        const qs = demoQuestions(d.questions); if (d.published && !qs.length) throw new Error('Add a question before publishing the quiz.');
        if (d.openAtMs && d.dueAtMs && d.openAtMs >= d.dueAtMs) throw new Error('The quiz has to open before it is due.');
        const w = courses[c].weights || {};
        const row = { title: String(d.title).trim(), instructions: d.instructions || '', category: w[d.category] ? d.category : (w.quizzes ? 'quizzes' : 'assignments'),
          timeLimitMin: Number(d.timeLimitMin) || 0, attempts: d.attempts === undefined ? 1 : Number(d.attempts) || 0, openAtMs: d.openAtMs || null, dueAtMs: d.dueAtMs || null, shuffle: !!d.shuffle, published: !!d.published,
          questions: qs, points: M.round2(qs.reduce((a, q) => a + q.points, 0)), questionCount: qs.length, updatedAtMs: Date.now() };
        const list = quizzes[c] || (quizzes[c] = []); if (d.id) { Object.assign(list.find((x) => x.id === d.id), row); return { quizId: d.id, points: row.points }; }
        const id = 'z' + Math.random().toString(36).slice(2, 7); list.push({ id, ...row, createdAtMs: Date.now() }); return { quizId: id, points: row.points }; },
      async deleteQuiz(c, id) { await wait(); if (role() !== 'teacher') throw new Error('Only the course instructor can do this.'); quizzes[c] = (quizzes[c] || []).filter((q) => q.id !== id); return { ok: true }; },
      async banks(c) { await wait(); if (!isStaff(c)) throw new Error('Only course staff can do this.'); return (banks[c] || []).map((b) => JSON.parse(JSON.stringify(b))).sort((a, b) => String(a.title).localeCompare(String(b.title))); },
      async saveBank(c, d) { await wait(); if (!isStaff(c)) throw new Error('Only course staff can do this.'); if (!String(d.title || '').trim()) throw new Error('Give the question bank a title.');
        const qs = demoQuestions(d.questions); const row = { title: String(d.title).trim(), questions: qs, count: qs.length, updatedAtMs: Date.now() };
        const list = banks[c] || (banks[c] = []); if (d.id) { Object.assign(list.find((x) => x.id === d.id), row); return { bankId: d.id, count: qs.length }; }
        const id = 'b' + Math.random().toString(36).slice(2, 7); list.push({ id, ...row }); return { bankId: id, count: qs.length }; },
      async deleteBank(c, id) { await wait(); banks[c] = (banks[c] || []).filter((b) => b.id !== id); return { ok: true }; },
      /* ---- v2.21.0 supervisor notes (demo) ---- */
      async supervisionStatus() { await wait(); return supOut(); },
      async setSupervisionSharing(d) { await wait(); sup.enabled = !!d.enabled; if (typeof d.includeThesis === 'boolean') sup.includeThesis = d.includeThesis;
        if (!sup.includeThesis) delete sup.snapshot.thesis; if (!sup.enabled) sup.invite = null; return supOut(); },
      async publishSupervision(d) { await wait(); if (!sup.enabled) throw new Error('Turn on sharing with your supervisor first.');
        sup.snapshot = { meetings: JSON.parse(JSON.stringify(d.meetings || [])).sort((a, b) => (b.atMs || 0) - (a.atMs || 0)), ...(sup.includeThesis && d.thesis ? { thesis: JSON.parse(JSON.stringify(d.thesis)) } : {}) };
        sup.publishedAtMs = Date.now(); return { publishedAtMs: sup.publishedAtMs }; },
      async createSupervisionInvite() { await wait(); if (!sup.enabled) throw new Error('Turn on sharing with your supervisor first.');
        sup.invite = { code: 'SUPV-' + (1000 + Math.floor(Math.random() * 9000)), expiresAtMs: Date.now() + 7 * DAY }; return { ...sup.invite }; },
      async cancelSupervisionInvite() { await wait(); sup.invite = null; return { ok: true }; },
      async removeSupervisor(uid) { await wait(); delete sup.supervisors[uid]; return { ok: true }; },
      async joinSupervision(code) { await wait(); if (!sup.invite || String(code).trim().toUpperCase() !== sup.invite.code) throw new Error('That code is not valid or has expired. Ask the student for a new one.');
        sup.supervisors[myUid()] = { name: me.teacher.name, email: me.teacher.email, linkedAtMs: Date.now(), lastViewedAtMs: null }; sup.invite = null; return { studentUid: me.student.uid, studentName: me.student.name }; },
      async mySupervisees() { await wait(); return { students: sup.supervisors[myUid()] ? [{ studentUid: me.student.uid, studentName: me.student.name, email: me.student.email, sharing: sup.enabled, publishedAtMs: sup.enabled ? sup.publishedAtMs : null }] : [] }; },
      async supervisionView(sid) { await wait(); if (sid !== me.student.uid || !sup.supervisors[myUid()]) throw new Error('This student has not linked your account.');
        sup.supervisors[myUid()].lastViewedAtMs = Date.now();
        return { studentName: me.student.name, email: me.student.email, sharing: sup.enabled, publishedAtMs: sup.enabled ? sup.publishedAtMs : null,
          meetings: sup.enabled ? JSON.parse(JSON.stringify(sup.snapshot.meetings)) : [], ...(sup.enabled && sup.includeThesis && sup.snapshot.thesis ? { thesis: JSON.parse(JSON.stringify(sup.snapshot.thesis)) } : {}) }; },
      async leaveSupervision() { await wait(); delete sup.supervisors[myUid()]; return { ok: true }; },
      /* ---- v2.20.0 taking quizzes (demo) ---- */
      async startQuiz(c, qid) { await wait(); need(c); if (courseRole(c) !== 'student') throw new Error('Quizzes are taken by the students in the course.'); closeDemo(c);
        const quiz = (quizzes[c] || []).find((z) => z.id === qid && z.published); if (!quiz) throw new Error('Quiz not found.');
        const mine = attempts.filter((t) => t.c === c && t.quizId === qid && t.uid === myUid()); const open = mine.find((t) => t.status === 'open'); const now = Date.now();
        const strip = (t) => t.order.map((id) => quiz.questions.find((q) => q.id === id)).filter(Boolean).map((q) => ({ id: q.id, type: q.type, text: q.text, points: q.points,
          ...(q.type === 'mc' ? { options: (t.optOrder[q.id] || q.options.map((o) => o.id)).map((id) => q.options.find((o) => o.id === id)).map((o) => ({ id: o.id, text: o.text })), multiple: q.correct.length > 1 } : {}) }));
        if (open) return { attemptId: open.id, attempt: open.attempt, startedAtMs: open.startedAtMs, endsAtMs: open.endsAtMs, nowMs: now, questions: strip(open), answers: { ...open.answers }, resumed: true };
        if (quiz.openAtMs && now < quiz.openAtMs) throw new Error('This quiz is not open yet.'); if (quiz.dueAtMs && now >= quiz.dueAtMs) throw new Error('This quiz has closed.');
        if (quiz.attempts && mine.length >= quiz.attempts) throw new Error(quiz.attempts === 1 ? 'This quiz allows one attempt.' : `This quiz allows ${quiz.attempts} attempts.`);
        const mix = (l) => { const x = [...l]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
        const order = quiz.shuffle ? mix(quiz.questions.map((q) => q.id)) : quiz.questions.map((q) => q.id), optOrder = {};
        quiz.questions.forEach((q) => { if (q.type === 'mc') optOrder[q.id] = quiz.shuffle ? mix(q.options.map((o) => o.id)) : q.options.map((o) => o.id); });
        const ends = [quiz.timeLimitMin ? now + quiz.timeLimitMin * 60000 : null, quiz.dueAtMs].filter(Boolean);
        const t = { id: 't' + Math.random().toString(36).slice(2, 7), c, quizId: qid, uid: myUid(), name: me.student.name, attempt: mine.length + 1, startedAtMs: now, endsAtMs: ends.length ? Math.min(...ends) : null, order, optOrder, answers: {}, status: 'open' };
        attempts.push(t); return { attemptId: t.id, attempt: t.attempt, startedAtMs: now, endsAtMs: t.endsAtMs, nowMs: now, questions: strip(t), answers: {}, resumed: false }; },
      async saveQuizAnswers(c, aid, answers, submit) { await wait(); const t = attempts.find((x) => x.id === aid && x.uid === myUid()); if (!t) throw new Error('Attempt not found.');
        if (t.status !== 'open') return { saved: false, submitted: true, timedOut: !!t.timedOut };
        if (t.endsAtMs && Date.now() > t.endsAtMs + 30000) { finishDemo(c, t, true); return { saved: false, submitted: true, timedOut: true }; }
        Object.assign(t.answers, answers || {}); if (submit) { finishDemo(c, t, false); return { saved: true, submitted: true, timedOut: false }; } return { saved: true, submitted: false, timedOut: false }; },
      async myQuizzes(c) { await wait(); need(c); closeDemo(c);
        return { nowMs: Date.now(), quizzes: (quizzes[c] || []).filter((z) => z.published).map((z) => {
          const mine = attempts.filter((t) => t.c === c && t.quizId === z.id && t.uid === myUid()).sort((a, b) => a.attempt - b.attempt); const rel = !!z.resultsReleased; const open = mine.find((t) => t.status === 'open');
          const done = mine.filter((t) => t.status === 'submitted').map((t) => (rel ? { attempt: t.attempt, submittedAtMs: t.submittedAtMs, timedOut: !!t.timedOut, points: t.points, score: t.score, pending: t.pending,
            questions: t.order.map((id) => z.questions.find((q) => q.id === id)).filter(Boolean).map((q) => { const r = t.results[q.id] || { score: 0 }; return { text: q.text, points: q.points, score: r.score, pending: !!r.pending, right: r.pending ? null : r.score >= q.points }; }) }
            : { attempt: t.attempt, submittedAtMs: t.submittedAtMs, timedOut: !!t.timedOut, points: t.points }));
          return { id: z.id, title: z.title, instructions: z.instructions, timeLimitMin: z.timeLimitMin, attempts: z.attempts, openAtMs: z.openAtMs, dueAtMs: z.dueAtMs, points: z.points, questionCount: z.questionCount,
            used: mine.length, open: open ? { attemptId: open.id, endsAtMs: open.endsAtMs } : null, released: rel, best: rel && done.length ? Math.max(...done.map((t) => t.score)) : null, attemptsDone: done };
        }).sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15)) }; },
      async quizResults(c, qid) { await wait(); if (!isStaff(c)) throw new Error('Only course staff can do this.'); closeDemo(c); const z = quizzes[c].find((x) => x.id === qid);
        return { released: !!(z && z.resultsReleased), attempts: attempts.filter((t) => t.c === c && t.quizId === qid).map((t) => JSON.parse(JSON.stringify(t))).sort((a, b) => String(a.name).localeCompare(String(b.name)) || a.attempt - b.attempt) }; },
      async gradeQuizAnswer(c, aid, qid, score) { await wait(); if (!isStaff(c)) throw new Error('Only course staff can do this.'); const t = attempts.find((x) => x.id === aid); const z = quizzes[c].find((x) => x.id === t.quizId);
        const q = z.questions.find((x) => x.id === qid); const v = Number(score); if (!(v >= 0 && v <= q.points)) throw new Error(`The score must be from 0 to ${q.points}.`);
        Object.assign(t, qscoreAll(z.questions, t.answers, { ...t.results, [qid]: { score: M.round2(v), pending: false, by: myUid() } })); quizGrade(c, z, t.uid); return { score: t.score, pending: t.pending }; },
      async releaseQuizResults(c, qid) { await wait(); if (!isStaff(c)) throw new Error('Only course staff can do this.'); const z = quizzes[c].find((x) => x.id === qid); z.resultsReleased = true; let n = 0;
        attempts.forEach((t) => { if (t.c === c && t.quizId === qid && t.status === 'submitted') t.released = true; });
        Object.values(grades).forEach((g) => { if (g.assignmentId === qid && !g.released) { g.released = true; g.releasedAtMs = Date.now(); n++; } });
        return { released: n, pending: attempts.filter((t) => t.c === c && t.quizId === qid && t.pending > 0).length }; },
    };
  })();

  /* ---------------- real backend ---------------- */
  const R = {
    async signIn(role) {
      if (!init()) throw new Error('Course sync is not set up in this build.');
      state = { ...state, busy: true }; fire();
      try {
        let u = auth.currentUser;
        if (!u || u.isAnonymous) u = await googleSignIn(role);
        if (!u) return;   // a redirect is under way; init() finishes when the page comes back
        await finishSignIn(role);
      } finally { state = { ...state, busy: false }; fire(); }
    },
    async completeProfile(birthDate) {
      const r = await call('ensureUniProfile', { birthDate });
      await auth.currentUser.getIdToken(true);
      state = { ...state, under18: !!r.under18, needsBirthDate: false, role: 'unistudent' }; fire();
    },
    async signOut() { if (auth) await auth.signOut(); },
    async myCourses() { const s = await db.collection('users').doc(state.user.uid).collection('courses').get(); return s.docs.map((d) => d.data()).sort((a, b) => String(a.title).localeCompare(String(b.title))); },
    async course(c) { const s = await db.collection('courses').doc(c).get(); return s.exists ? { courseId: s.id, ...s.data() } : null; },
    createCourse: (f) => call('createCourse', f),
    updateCourse: (c, f) => call('updateCourse', { courseId: c, ...f }),
    regenerateCode: (c) => call('regenerateCourseCode', { courseId: c }),
    joinCourse: (code) => call('joinCourse', { code }),
    leaveCourse: (c) => call('leaveCourse', { courseId: c }),
    setMemberRole: (c, uid, role) => call('setMemberRole', { courseId: c, uid, role }),
    async assignments(c) { const s = await db.collection('courses').doc(c).collection('assignments').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15)); },
    saveAssignment: (c, a) => call('saveAssignment', { courseId: c, assignmentId: a.id || undefined, ...a, id: undefined }),
    deleteAssignment: (c, id) => call('deleteAssignment', { courseId: c, assignmentId: id }),
    async mySubmissions(c) { const s = await db.collection('courses').doc(c).collection('submissions').where('uid', '==', state.user.uid).get(); const o = {}; s.docs.forEach((d) => { o[d.data().assignmentId] = d.data(); }); return o; },
    async myGrades(c) { const s = await db.collection('courses').doc(c).collection('grades').where('uid', '==', state.user.uid).where('released', '==', true).get(); const o = {}; s.docs.forEach((d) => { o[d.data().assignmentId] = d.data(); }); return o; },
    uploadFile(c, a, file, onProgress) {
      if (!storage) return Promise.reject(new Error('File uploads are not available in this build.'));
      const safe = String(file.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      const path = `courses/${c}/submissions/${a}/${state.user.uid}/${Date.now()}-${safe}`;
      return new Promise((resolve, reject) => {
        const task = storage.ref(path).put(file, { contentType: file.type });
        task.on('state_changed', (s) => { if (onProgress) onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)); }, reject,
          () => resolve({ path, name: file.name, size: file.size, type: file.type }));
      });
    },
    submit: (c, a, w) => call('submitAssignment', { courseId: c, assignmentId: a, text: w.text || '', link: w.link || '', files: (w.files || []).map((f) => ({ path: f.path, name: f.name })) }),
    async roster(c) { const s = await db.collection('courses').doc(c).collection('members').where('role', 'in', ['student', 'ta']).get(); return s.docs.map((d) => d.data()).sort((a, b) => String(a.name).localeCompare(String(b.name))); },
    async submissions(c, a) { const s = await db.collection('courses').doc(c).collection('submissions').where('assignmentId', '==', a).get(); return s.docs.map((d) => d.data()); },
    async grades(c) { const s = await db.collection('courses').doc(c).collection('grades').get(); return s.docs.map((d) => d.data()); },
    grade: (c, a, uid, g) => call('gradeSubmission', { courseId: c, assignmentId: a, uid, ...g }),
    release: (c, a) => call('releaseGrades', { courseId: c, assignmentId: a }),
    exportGradebook: (c) => call('exportGradebook', { courseId: c }),
    /* ---- v2.13.0 modules and announcements ---- */
    async modules(c) { const s = await db.collection('courses').doc(c).collection('modules').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order); },
    async moduleContent(c, mid) { try { const s = await db.collection('courses').doc(c).collection('moduleContent').doc(mid).get(); return s.exists ? s.data() : null; } catch (e) { return null; } },
    saveModule: (c, m) => call('saveModule', { courseId: c, moduleId: m.id || undefined, title: m.title, releaseAtMs: m.releaseAtMs || null, items: m.items || [] }),
    reorderModules: (c, order) => call('reorderModules', { courseId: c, order }),
    deleteModule: (c, mid) => call('deleteModule', { courseId: c, moduleId: mid }),
    async myProgress(c) { const s = await db.collection('courses').doc(c).collection('progress').doc(state.user.uid).get(); return (s.exists && s.data().done) || {}; },
    markItemDone: (c, mid, iid, done) => call('markItemDone', { courseId: c, moduleId: mid, itemId: iid, done }),
    async progressAll(c) { const s = await db.collection('courses').doc(c).collection('progress').get(); return s.docs.map((d) => ({ uid: d.id, done: d.data().done || {} })); },
    async announcements(c) { const s = await db.collection('courses').doc(c).collection('announcements').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.pinned === true) - (a.pinned === true)) || (b.createdAtMs - a.createdAtMs)); },
    saveAnnouncement: (d) => call('saveAnnouncement', d.id ? { courseId: d.courseId, announcementId: d.id, title: d.title, body: d.body, pinned: !!d.pinned } : { courseIds: d.courseIds, title: d.title, body: d.body, pinned: !!d.pinned }),
    deleteAnnouncement: (c, id) => call('deleteAnnouncement', { courseId: c, announcementId: id }),
    async myReads(c) { const s = await db.collection('courses').doc(c).collection('reads').doc(state.user.uid).get(); return (s.exists && s.data().announcements) || {}; },
    markRead: (c, ids) => call('markAnnouncementsRead', { courseId: c, ids }),
    async readCounts(c) { const s = await db.collection('courses').doc(c).collection('reads').get(); const out = {}; s.docs.forEach((d) => Object.keys(d.data().announcements || {}).forEach((id) => { out[id] = (out[id] || 0) + 1; })); return out; },
    /* ---- v2.14.0 discussions, calendar events, office hours ---- */
    async threads(c) { const s = await db.collection('courses').doc(c).collection('threads').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((b.pinned === true) - (a.pinned === true)) || (b.lastPostAtMs - a.lastPostAtMs)); },
    async posts(c, tid) {
      const tref = db.collection('courses').doc(c).collection('threads').doc(tid);
      const th = await tref.get(); if (!th.exists) throw new Error('Discussion not found.');
      let s;
      try { s = await tref.collection('posts').get(); }
      catch (e) { if (th.data().postFirst && e && e.code === 'permission-denied') return { locked: true, posts: [] }; throw e; }   // post-first, not posted yet (course staff, TAs included, always read) return { locked: false, posts: s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAtMs - b.createdAtMs) };
    },
    saveThread: (c, d) => call('saveThread', { courseId: c, threadId: d.id || undefined, title: d.title, body: d.body, postFirst: !!d.postFirst, pinned: !!d.pinned, locked: !!d.locked }),
    deleteThread: (c, tid) => call('deleteThread', { courseId: c, threadId: tid }),
    postReply: (c, tid, body) => call('postReply', { courseId: c, threadId: tid, body }),
    editPost: (c, tid, pid, body) => call('editPost', { courseId: c, threadId: tid, postId: pid, body }),
    removePost: (c, tid, pid) => call('removePost', { courseId: c, threadId: tid, postId: pid }),
    async events(c) { const s = await db.collection('courses').doc(c).collection('events').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })); },
    saveEvent: (c, e) => call('saveEvent', { courseId: c, eventId: e.id || undefined, title: e.title, kind: e.kind, startAtMs: e.startAtMs, endAtMs: e.endAtMs, location: e.location || '', link: e.link || '', weeklyUntilMs: e.weeklyUntilMs || null }),
    deleteEvent: (c, id) => call('deleteEvent', { courseId: c, eventId: id }),
    async slots(c) { const s = await db.collection('courses').doc(c).collection('officeHours').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.startAtMs - b.startAtMs); },
    async myBookings(c) { const s = await db.collection('courses').doc(c).collection('bookings').where('uid', '==', state.user.uid).get(); return s.docs.map((d) => ({ slotId: d.id, ...d.data() })); },
    async bookings(c) { const s = await db.collection('courses').doc(c).collection('bookings').get(); return s.docs.map((d) => ({ slotId: d.id, ...d.data() })); },
    openSlots: (c, d) => call('openSlots', { courseId: c, startAtMs: d.startAtMs, endAtMs: d.endAtMs, minutes: d.minutes, location: d.location || '', link: d.link || '' }),
    deleteSlot: (c, id) => call('deleteSlot', { courseId: c, slotId: id }),
    bookSlot: (c, id, note) => call('bookSlot', { courseId: c, slotId: id, note: note || '' }),
    cancelBooking: (c, id) => call('cancelBooking', { courseId: c, slotId: id }),
    async fileUrl(path) { return storage ? storage.ref(path).getDownloadURL() : null; },
    /* ---- v2.17.0 family view (student side; family members use UniDeck's ParentDeck) ---- */
    familyStatus: () => call('familyStatus', {}),
    setFamilySharing: (d) => call('setFamilySharing', { enabled: !!d.enabled, share: d.share }),
    createFamilyInvite: () => call('createFamilyInvite', {}),
    cancelFamilyInvite: () => call('cancelFamilyInvite', {}),
    removeFamilyLink: (guardianUid) => call('removeFamilyLink', { guardianUid }),
    /* ---- v2.16.0 groups and task lists ---- */
    async myGroup(c) { const s = await db.collection('courses').doc(c).collection('groups').where('memberUids', 'array-contains', state.user.uid).get(); return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }; },
    async allGroups(c) { const s = await db.collection('courses').doc(c).collection('groups').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })); },
    saveGroups: (c, groups) => call('saveGroups', { courseId: c, groups: groups.map((g) => ({ id: g.id || undefined, name: g.name, memberUids: g.memberUids })) }),
    async tasks(c, gid) { const s = await db.collection('courses').doc(c).collection('groups').doc(gid).collection('tasks').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ((a.done === true) - (b.done === true)) || ((a.dueAtMs || 9e15) - (b.dueAtMs || 9e15))); },
    saveTask: (c, gid, t) => call('saveTask', { courseId: c, groupId: gid, taskId: t.id || undefined, title: t.title, assigneeUid: t.assigneeUid || null, dueAtMs: t.dueAtMs || null }),
    setTaskDone: (c, gid, tid, done) => call('setTaskDone', { courseId: c, groupId: gid, taskId: tid, done: !!done }),
    deleteTask: (c, gid, tid) => call('deleteTask', { courseId: c, groupId: gid, taskId: tid }),
    /* ---- v2.19.0 quizzes and question banks (answers live in quizKeys, which only course staff read) ---- */
    async quizzes(c) {
      const col = db.collection('courses').doc(c).collection('quizzes');
      let s;
      try { s = await col.get(); } catch (e) { if (e && e.code === 'permission-denied') s = await col.where('published', '==', true).get(); else throw e; }   // a student sees published quizzes only
      return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.dueAtMs || 9e15) - (b.dueAtMs || 9e15));
    },
    async quizKey(c, id) { const s = await db.collection('courses').doc(c).collection('quizKeys').doc(id).get(); return s.exists ? s.data().questions || [] : []; },
    saveQuiz: (c, q) => call('saveQuiz', { courseId: c, quizId: q.id || undefined, title: q.title, instructions: q.instructions || '', category: q.category, timeLimitMin: q.timeLimitMin || 0,
      attempts: q.attempts, openAtMs: q.openAtMs || null, dueAtMs: q.dueAtMs || null, shuffle: !!q.shuffle, published: !!q.published, questions: q.questions || [] }),
    deleteQuiz: (c, id) => call('deleteQuiz', { courseId: c, quizId: id }),
    async banks(c) { const s = await db.collection('courses').doc(c).collection('questionBanks').get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title))); },
    saveBank: (c, b) => call('saveQuestionBank', { courseId: c, bankId: b.id || undefined, title: b.title, questions: b.questions || [] }),
    deleteBank: (c, id) => call('deleteQuestionBank', { courseId: c, bankId: id }),
    /* ---- v2.21.0 supervisor notes: a read-only copy the student chooses to share (functions only) ---- */
    supervisionStatus: () => call('supervisionStatus', {}),
    setSupervisionSharing: (d) => call('setSupervisionSharing', { enabled: !!d.enabled, ...(typeof d.includeThesis === 'boolean' ? { includeThesis: d.includeThesis } : {}) }),
    publishSupervision: (d) => call('publishSupervision', { meetings: d.meetings || [], thesis: d.thesis || null }),
    createSupervisionInvite: () => call('createSupervisionInvite', {}),
    cancelSupervisionInvite: () => call('cancelSupervisionInvite', {}),
    removeSupervisor: (uid) => call('removeSupervisionLink', { supervisorUid: uid }),
    joinSupervision: (code) => call('joinSupervision', { code }),
    mySupervisees: () => call('mySupervisees', {}),
    supervisionView: (sid) => call('supervisionView', { studentUid: sid }),
    leaveSupervision: (sid) => call('removeSupervisionLink', { studentUid: sid }),
    /* ---- v2.20.0 taking quizzes: everything through functions (students can't read attempts or answers) ---- */
    startQuiz: (c, qid) => call('startQuizAttempt', { courseId: c, quizId: qid }),
    saveQuizAnswers: (c, aid, answers, submit) => call('saveQuizAnswers', { courseId: c, attemptId: aid, answers: answers || {}, submit: !!submit }),
    myQuizzes: (c) => call('myQuizzes', { courseId: c }),
    quizResults: (c, qid) => call('quizResults', { courseId: c, quizId: qid }),
    gradeQuizAnswer: (c, aid, qid, score) => call('gradeQuizAnswer', { courseId: c, attemptId: aid, questionId: qid, score }),
    releaseQuizResults: (c, qid) => call('releaseQuizResults', { courseId: c, quizId: qid }),
  };

  const B = DEMO ? D : R;
  const api = {
    demo: DEMO,
    available: () => DEMO || configured(),
    state: () => ({ ...state }),
    onChange(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
    errText,
    /* the course picked in the top-bar pill / any course widget, shared by every course widget */
    currentCourse() { try { return localStorage.getItem('ud_course') || ''; } catch (e) { return ''; } },
    setCurrentCourse(id) { try { localStorage.setItem('ud_course', id || ''); } catch (e) {} window.dispatchEvent(new CustomEvent('ud-course', { detail: id })); },
  };
  for (const k of Object.keys(R)) api[k] = (...a) => B[k](...a);
  if (!DEMO) init();
  return api;
})();
window.UniCourses = UniCourses;
