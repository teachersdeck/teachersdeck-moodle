'use strict';
/* =========================================================
   UniCourses — the UniDeck course client (backend v2.12.0), one file in two apps
   ---------------------------------------------------------
   studentdeck/js/unicourses.js   (this copy is the one to edit) — UniStudentDeck's Courses, Assignments, Grades, Modules, Announcements
   teachersdeck/js/unicourses.js  — LectureDeck's Course builder, Assignments, Grader, Gradebook, Modules, Announcements
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
    return true;
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
    };
    const asg = {
      c1: [
        { id: 'a1', title: 'Diagnostic paragraph', instructions: 'Write one paragraph (150–200 words) on a topic you care about. We use it to plan the term.', dueAtMs: at(-24), points: 10, rubric: [], submitType: 'text', attempts: 1, category: 'assignments', latePolicy: null },
        { id: 'a2', title: 'Essay 1: Argument', instructions: 'A 1,000-word argumentative essay. Take a clear position and support it with at least three academic sources. Upload a PDF or Word file.', dueAtMs: at(-6), points: 20, rubric, submitType: 'file', attempts: 2, category: 'assignments', latePolicy: null },
        { id: 'a3', title: 'Annotated bibliography', instructions: 'Five sources for your research essay, each with a 100-word annotation. Share a link to your document.', dueAtMs: at(3), points: 15, rubric: [], submitType: 'link', attempts: 0, category: 'assignments', latePolicy: null },
        { id: 'a4', title: 'Midterm reflection', instructions: 'What has changed in how you write? 300 words.', dueAtMs: at(10), points: 10, rubric: [], submitType: 'any', attempts: 1, category: 'exams', latePolicy: { mode: 'closed' } },
      ],
      c2: [
        { id: 'b1', title: 'Survey design draft', instructions: 'Draft ten survey questions for your project and explain the sampling plan.', dueAtMs: at(5), points: 25, rubric: [], submitType: 'any', attempts: 0, category: 'assignments', latePolicy: null },
      ],
    };
    const subs = {}, grades = {}, membership = { c1: new Set(students.map((s) => s.uid)), c2: new Set(students.slice(1, 8).map((s) => s.uid)) };
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
    const wait = () => new Promise((r) => setTimeout(r, 160));
    const role = () => state.role;
    const myUid = () => (role() === 'teacher' ? me.teacher.uid : me.student.uid);
    const inCourse = (c) => role() === 'teacher' || membership[c].has(myUid());
    const need = (c) => { if (!courses[c] || !inCourse(c)) throw new Error('You are not in this course.'); };
    return {
      async signIn(r) { await wait(); const p = r === 'teacher' ? me.teacher : me.student; state = { ...state, user: { uid: p.uid, name: p.name, email: p.email }, role: r === 'teacher' ? 'teacher' : 'unistudent', under18: false, needsBirthDate: r !== 'teacher' }; fire(); },
      async completeProfile() { await wait(); state = { ...state, needsBirthDate: false }; fire(); },
      async signOut() { state = { ...state, user: null, role: null }; fire(); },
      async myCourses() { await wait(); return Object.values(courses).filter((c) => inCourse(c.courseId)).map((c) => ({ courseId: c.courseId, role: role() === 'teacher' ? 'instructor' : 'student', title: c.title, term: c.term, section: c.section })); },
      async course(c) { await wait(); need(c); const x = { ...courses[c], memberCount: membership[c].size, assignmentCount: asg[c].length }; if (role() !== 'teacher') delete x.code; return x; },
      async createCourse(f) { await wait(); const id = 'c' + (Object.keys(courses).length + 1); const w = M.cleanWeights(f.weights); if (w.error) throw new Error(w.error);
        courses[id] = { courseId: id, title: f.title, term: f.term || '', section: f.section || '', code: 'DEMO-' + (1000 + Object.keys(courses).length), ownerName: me.teacher.name, weights: w.weights, latePolicy: M.cleanLatePolicy(f.latePolicy), archived: false };
        asg[id] = []; membership[id] = new Set(); return { courseId: id, code: courses[id].code }; },
      async updateCourse(c, f) { await wait(); need(c); if (f.weights) { const w = M.cleanWeights(f.weights); if (w.error) throw new Error(w.error); f = { ...f, weights: w.weights }; }
        if (f.latePolicy) f = { ...f, latePolicy: M.cleanLatePolicy(f.latePolicy) }; Object.assign(courses[c], f); return { ok: true }; },
      async regenerateCode(c) { await wait(); courses[c].code = 'DEMO-' + Math.floor(1000 + Math.random() * 9000); return { code: courses[c].code }; },
      async joinCourse(code) { await wait(); const c = Object.values(courses).find((x) => x.code === String(code).trim().toUpperCase());
        if (!c) throw new Error('No course has that code. In the demo, try RSCH-3104.'); const was = membership[c.courseId].has(myUid()); membership[c.courseId].add(myUid()); return { courseId: c.courseId, title: c.title, alreadyIn: was }; },
      async leaveCourse(c) { await wait(); membership[c].delete(myUid()); return { ok: true }; },
      async setMemberRole(c, uid, r) { await wait(); const s = students.find((x) => x.uid === uid); if (s) s.role = r; return { ok: true }; },
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
        if (!M.acceptsSubmission(pol, A.dueAtMs, Date.now())) throw new Error('The due date has passed and this assignment does not accept late work.');
        const prev = subs[k(c, aId, myUid())]; const attempt = prev ? prev.attempt + 1 : 1;
        if (A.attempts && attempt > A.attempts) throw new Error(A.attempts === 1 ? 'This assignment allows one submission.' : `This assignment allows ${A.attempts} submissions.`);
        if (!w.text && !w.link && !(w.files || []).length) throw new Error('Add your work before submitting.');
        const L = M.lateness(A.dueAtMs, Date.now());
        subs[k(c, aId, myUid())] = { assignmentId: aId, uid: myUid(), name: me.student.name, text: w.text || '', link: w.link || '', files: w.files || [], submittedAtMs: Date.now(), attempt, ...L };
        if (grades[k(c, aId, myUid())]) grades[k(c, aId, myUid())].needsRegrade = true; return { attempt, ...L }; },
      async roster(c) { await wait(); return students.filter((s) => membership[c].has(s.uid)).map((s) => ({ ...s })); },
      async submissions(c, aId) { await wait(); return Object.values(subs).filter((s) => s.assignmentId === aId && subs[k(c, aId, s.uid)] === s).map((s) => ({ ...s })); },
      async grades(c) { await wait(); return Object.entries(grades).filter(([key]) => key.startsWith(c + '|')).map(([, g]) => ({ ...g })); },
      async grade(c, aId, uid, g) { await wait(); const A = asg[c].find((x) => x.id === aId); const s = subs[k(c, aId, uid)];
        const rs = A.rubric.length ? M.rubricScore(A.rubric, g.rubricScores) : { score: M.round2(Number(g.score)), rubricScores: {} };
        if (!A.rubric.length && !(rs.score >= 0 && rs.score <= A.points)) throw new Error(`The score must be from 0 to ${A.points}.`);
        const pen = M.latePenaltyPct(A.latePolicy || courses[c].latePolicy, s ? s.lateDays : 0); const prev = grades[k(c, aId, uid)];
        grades[k(c, aId, uid)] = { assignmentId: aId, uid, score: rs.score, rubricScores: rs.rubricScores, feedback: g.feedback || '', latePenaltyPct: pen, finalScore: M.finalScore(rs.score, pen), points: A.points, released: prev ? prev.released : false, gradedAtMs: Date.now(), needsRegrade: false };
        return { score: rs.score, finalScore: grades[k(c, aId, uid)].finalScore, latePenaltyPct: pen }; },
      async release(c, aId) { await wait(); let n = 0; for (const [key, g] of Object.entries(grades)) if (key.startsWith(`${c}|${aId}|`) && !g.released) { g.released = true; g.releasedAtMs = Date.now(); n++; } return { released: n }; },
      async exportGradebook(c) { await wait(); const csv = M.gradebookCsv(courses[c], students.filter((s) => membership[c].has(s.uid)), asg[c], Object.entries(grades).filter(([key]) => key.startsWith(c + '|')).map(([, g]) => g));
        return { csv, filename: `${courses[c].title.replace(/[^A-Za-z0-9]+/g, '-')}-gradebook.csv` }; },
      /* ---- v2.13.0 modules and announcements (demo) ---- */
      async modules(c) { await wait(); need(c); return (mods[c] || []).map((m) => ({ ...m, items: m.items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, refId: i.refId })) })).sort((a, b) => a.order - b.order); },
      async moduleContent(c, mid) { await wait(); need(c); const m = (mods[c] || []).find((x) => x.id === mid); if (!m) return null;
        if (role() !== 'teacher' && m.releaseAtMs && m.releaseAtMs > Date.now()) return null;
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
        const posted = (d.courseIds || []).map((c) => { const id = 'n' + Math.random().toString(36).slice(2, 7); (anns[c] || (anns[c] = [])).push({ id, title: d.title, body: d.body, pinned: !!d.pinned, authorName: me.teacher.name, createdAtMs: Date.now() }); return { courseId: c, announcementId: id }; });
        if (!posted.length) throw new Error('Choose at least one course.'); return { posted }; },
      async deleteAnnouncement(c, id) { await wait(); anns[c] = anns[c].filter((a) => a.id !== id); return { ok: true }; },
      async myReads(c) { await wait(); return { ...((reads[c] || {})[myUid()] || {}) }; },
      async markRead(c, ids) { const r = (reads[c] || (reads[c] = {}))[myUid()] || (reads[c][myUid()] = {}); ids.forEach((id) => { r[id] = r[id] || Date.now(); }); return { ok: true }; },
      async readCounts(c) { await wait(); const out = {}; Object.values(reads[c] || {}).forEach((r) => Object.keys(r).forEach((id) => { out[id] = (out[id] || 0) + 1; })); return out; },
      async fileUrl() { return null; },
    };
  })();

  /* ---------------- real backend ---------------- */
  const R = {
    async signIn(role) {
      if (!init()) throw new Error('Course sync is not set up in this build.');
      state = { ...state, busy: true }; fire();
      try {
        let u = auth.currentUser;
        if (!u || u.isAnonymous) u = (await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())).user;
        const r = role === 'teacher' ? await call('ensureUserProfile', { role: 'teacher' }) : await call('ensureUniProfile', {});
        await u.getIdToken(true);
        state = { ...state, user: { uid: u.uid, name: u.displayName || '', email: u.email || '' }, role: role === 'teacher' ? 'teacher' : 'unistudent',
          under18: !!r.under18, needsBirthDate: !!r.needsBirthDate };
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
    async fileUrl(path) { return storage ? storage.ref(path).getDownloadURL() : null; },
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
