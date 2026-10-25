'use strict';
/* =========================================================
   UniCourses — the UniDeck course client (backend v2.12.0), one file in two apps
   ---------------------------------------------------------
   studentdeck/js/unicourses.js   (this copy is the one to edit) — UniStudentDeck's Courses, Assignments, Grades
   teachersdeck/js/unicourses.js  — LectureDeck's Course builder, Assignments, Grader, Gradebook
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
