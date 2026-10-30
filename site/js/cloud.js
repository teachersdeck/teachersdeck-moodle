'use strict';
/* =========================================================
   TeachersDeck ⇄ Firebase — "Cloud Class" sync layer
   ---------------------------------------------------------
   Everything in this file is additive: with no Firebase project
   configured (js/firebase-config.js untouched), isConfigured() is false,
   the Cloud Class widget shows a setup message, and every other widget
   works exactly as it did in v0.7.2 — nothing here is required.

   What it talks to (see the trifecta-firebase-backend package):
     - Auth: Google Sign-In for the teacher.
     - Cloud Functions: createClass, regenerateJoinCode,
       setRankingVisibility, awardPoints (writes teachers must not be able
       to do directly, per firestore.rules).
     - Firestore direct reads: classes/{id}, students where classId==id
       (the live roster + their official points).
     - Firestore direct writes: classes/{id}/rewards/* and
       classes/{id}/calendarEvents/* — firestore.rules allows these
       straight from the teacher's client, since ownership is all the
       validation they need.

   One TeachersDeck "local class" (see the Classes comment near the top of
   app.js) links to at most one backend classId, stored in
   state.cloudClassId. Switching local class switches which cloud class
   you're looking at, same as everything else per-class here.
   ========================================================= */
const TDCloud = (() => {
  let auth = null, db = null, functions = null, ready = false;

  function isConfigured(){
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.apiKey !== 'YOUR_API_KEY');
  }
  function init(){
    if(ready) return true;
    if(!isConfigured() || typeof firebase === 'undefined') return false;
    firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    functions = firebase.functions();
    ready = true;
    return true;
  }

  const authListeners = new Set();
  let session = null; // { uid, displayName, email, photoURL }
  function fireAuth(){ authListeners.forEach(fn=>{ try{ fn(session); }catch(e){} }); }
  function onAuthChanged(fn){
    authListeners.add(fn);
    if(ready) fn(session);
    return ()=> authListeners.delete(fn);
  }
  function watchAuth(){
    if(!init()) return;
    auth.onAuthStateChanged(user=>{
      session = user ? { uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL } : null;
      fireAuth();
    });
    // v0.34.0 web app: coming back from a redirect sign-in (installed iPhone apps can't use pop-ups) finishes it here.
    let pending = false;
    try{ pending = sessionStorage.getItem('td_signin_redirect') === '1'; sessionStorage.removeItem('td_signin_redirect'); }catch(e){}
    if(pending) auth.getRedirectResult().then(r=>{ if(r && r.user) return finishSignIn(r.user); }).catch(()=>{});
  }

  // Pop-ups don't work in an app installed to the iPhone Home screen, and some phones block them: use a redirect there
  // (the same rule as js/unicourses.js). The extension always uses the pop-up.
  const standalone = ()=>{ try{ return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }catch(e){ return false; } };
  const POPUP_FAILS = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported', 'auth/cancelled-popup-request'];
  async function signIn(){
    if(!init()) throw new Error('not-configured');
    const provider = new firebase.auth.GoogleAuthProvider();
    const redirect = async ()=>{ try{ sessionStorage.setItem('td_signin_redirect', '1'); }catch(e){} await auth.signInWithRedirect(provider); return null; };
    if(standalone() && /iPhone|iPad|iPod/.test(navigator.userAgent || '')) return redirect();
    let cred;
    try{ cred = await auth.signInWithPopup(provider); }
    catch(e){ if(POPUP_FAILS.includes(e && e.code) && !/^chrome-extension:/.test(location.protocol)) return redirect(); throw e; }
    return finishSignIn(cred.user);
  }
  async function finishSignIn(user){
    await functions.httpsCallable('ensureUserProfile')({ role:'teacher' });
    await user.getIdToken(true); // pick up the new role custom claim before any Cloud Function call that requires it
    session = { uid:user.uid, displayName:user.displayName, email:user.email, photoURL:user.photoURL };
    fireAuth();
    return session;
  }
  function signOutCloud(){ if(auth) auth.signOut(); session = null; fireAuth(); }
  function getSession(){ return session; }

  async function myClasses(){
    if(!ready || !session) return [];
    const snap = await db.collection('classes').where('teacherUid','==',session.uid).get();
    return snap.docs.map(d=> ({ id:d.id, ...d.data() }));
  }
  async function createClass(className){
    const res = await functions.httpsCallable('createClass')({ className });
    return res.data; // { classId, studentJoinCode, parentJoinCode }
  }
  async function regenerateJoinCode(classId, which){
    return (await functions.httpsCallable('regenerateJoinCode')({ classId, which })).data;
  }
  async function setRankingVisibility(classId, visibility){
    return (await functions.httpsCallable('setRankingVisibility')({ classId, visibility })).data;
  }
  function subscribeClass(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('classes').doc(classId).onSnapshot(
      doc=> cb(doc.exists ? { id:doc.id, ...doc.data() } : null),
      ()=> cb(null)
    );
  }
  // v0.15.2: the school theme AdminDeck pushed to this class (classes/{id}/adminTheme/current — written only by AdminDeck's adminPushTheme
  // function, readable by the class's own teacher; needs the one rule in AdminDeck's functions/adminTheme.js). cb(null) when there is none
  // or the rule isn't deployed yet — both are normal and silent.
  function subscribeAdminTheme(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('classes').doc(classId).collection('adminTheme').doc('current').onSnapshot(
      doc=> cb(doc.exists ? doc.data() : null),
      ()=> cb(null)
    );
  }
  function subscribeRoster(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('students').where('classId','==',classId).onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() }))),
      ()=> cb([])
    );
  }
  function subscribeRewards(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('classes').doc(classId).collection('rewards').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() }))),
      ()=> cb([])
    );
  }
  async function awardPoints(classId, studentId, amount, reason){
    return (await functions.httpsCallable('awardPoints')({ classId, studentId, amount, reason:reason||'' })).data;
  }
  async function saveReward(classId, reward){
    const col = db.collection('classes').doc(classId).collection('rewards');
    if(reward.id){
      const { id, ...rest } = reward;
      await col.doc(id).set(rest, { merge:true });
      return id;
    }
    const ref = await col.add({ name:reward.name, cost:reward.cost, description:reward.description||'', active:true });
    return ref.id;
  }
  async function deleteReward(classId, rewardId){
    await db.collection('classes').doc(classId).collection('rewards').doc(rewardId).delete();
  }

  // Removes a stray/duplicate roster entry (e.g. a student who joined twice
  // with the same class code instead of resuming with their PIN — StudentDeck
  // treats "Join with class code" as always creating a fresh students/ doc;
  // only "I have a PIN" resumes an existing one, so two joins under the same
  // typed name legitimately produce two separate documents). This is a
  // direct Firestore delete, same pattern as deleteReward above — if your
  // firestore.rules don't yet let a class owner delete a students/{id} doc
  // scoped to their own class, this will reject with permission-denied and
  // the caller should surface that clearly rather than fail silently.
  //
  // v0.15.0: goes through the backend's removeStudentFromClass callable first (backend v1.3.0), which ALSO
  // removes the student's subcollections, their parents' guardian links (and class-wide read access) and
  // Notes Home about them — none of which a bare client delete can do. If that function isn't deployed yet
  // (functions/not-found) it falls back to the old direct delete, so the button never stops working.
  async function removeStudent(studentId, classId){
    if(classId){
      try{
        return (await functions.httpsCallable('removeStudentFromClass')({ classId, studentId })).data;
      }catch(e){
        const code = String((e && e.code) || '');
        // An undeployed function comes back as not-found/unimplemented with a bare 'NOT_FOUND' message. The function's OWN
        // not-found answers ("Class not found." / "Student not found.") mention the class or student, and every other error
        // (not your class, wrong account…) must surface rather than be papered over by a direct delete.
        if(!/not-found|unimplemented/.test(code) || /class|student/i.test(String(e && e.message))) throw e;
      }
    }
    await db.collection('students').doc(studentId).delete();
    return { ok:true, fallback:true };
  }

  // ---- Notes Home (teacher -> parent notes), classes/{id}/notesHome/* ----
  // Sending goes through a function (not a direct write like rewards) because one send can fan
  // out to many students and the server must check every recipient is really in this class.
  async function sendNotesHome(classId, studentIds, mood, text, signedAs){
    return (await functions.httpsCallable('sendNotesHome')({ classId, studentIds, mood, text, signedAs })).data;
  }
  // The latest 100 notes for the class, newest first. cb(list, err) — err is set (and list empty)
  // if the read is refused or fails, so the widget can say so instead of looking empty.
  function subscribeNotes(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('classes').doc(classId).collection('notesHome')
      .orderBy('createdAt','desc').limit(100).onSnapshot(
        snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() })), null),
        err=> cb([], err || true)
      );
  }
  // Allowed only while the note is still unread (firestore.rules enforces it); after a parent
  // has opened it, the note stays and a follow-up note is the way to correct it.
  async function deleteNote(classId, noteId){
    await db.collection('classes').doc(classId).collection('notesHome').doc(noteId).delete();
  }

  // Direct write, same ownership-only validation as saveReward/syncHomework above (no Cloud
  // Function needed — a progress report is content the teacher authored, not a score/currency
  // that needs server-side anti-cheat checks the way awardPoints does). Writes ONE student's
  // own report doc, not a whole-class collection — this is what ParentDeck's Progress Reports
  // widget reads for that one linked child. Requires a firestore.rule letting a class's teacher
  // create/update students/{id}/progressReports/* for a student in their own class, and that
  // student's guardians to read it — same shape as the existing homeworkDone guardian-read rule.
  async function sendProgressReport(studentId, report){
    await db.collection('students').doc(studentId).collection('progressReports').doc(report.id).set({
      classId: report.classId || '',
      studentName: report.studentName || '',
      skills: report.skills || '',
      improve: report.improve || '',
      strengths: report.strengths || '',
      nextFocus: report.nextFocus || '',
      score: report.score || 0,
      frequency: report.frequency || '',
      startDate: report.startDate || '',
      createdBy: 'teacher',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge:true });
  }
  async function deleteProgressReport(studentId, reportId){
    await db.collection('students').doc(studentId).collection('progressReports').doc(reportId).delete();
  }

  /* ---------- Student activity (v0.15.0) — read-only views of what StudentDeck already syncs ----------
     Per student: homeworkDone (their check-offs) and the last 14 practiceDaily days. firestore.rules lets the
     class's teacher read both (isTeacherOfStudent, backend v1.2.0). Journal TEXT is never in this data — StudentDeck
     only ever syncs the day's mood word — and nothing here asks for it. practice.* / practiceDaily are
     SELF-REPORTED by the student's device: activity information, never an authoritative score. */
  function subscribeStudentActivity(studentId, cb, days){      // days: how many practiceDaily days to read (default 14; Student Stats opens one student at 200)
    if(!ready || !studentId) return ()=>{};
    const sRef = db.collection('students').doc(studentId);
    let hw = {}, daily = {};
    const push = ()=> cb({ homeworkDone: hw, daily });
    const u1 = sRef.collection('homeworkDone').onSnapshot(
      snap=>{ hw = {}; snap.docs.forEach(d=>{ hw[d.id] = d.data(); }); push(); },
      ()=>{ hw = {}; push(); });
    const u2 = sRef.collection('practiceDaily').orderBy(firebase.firestore.FieldPath.documentId(), 'desc').limit(Math.min(Math.max(+days || 14, 1), 400)).onSnapshot(
      snap=>{ daily = {}; snap.docs.forEach(d=>{ daily[d.id] = d.data(); }); push(); },
      ()=>{ daily = {}; push(); });
    return ()=>{ try{ u1(); }catch(e){} try{ u2(); }catch(e){} };
  }
  // The class's recent points ledger (teacher awards AND students' self-redemptions). One single-field
  // orderBy, so no composite index is needed; newest first.
  function subscribeLedger(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('classes').doc(classId).collection('pointsLedger').orderBy('createdAt','desc').limit(40).onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() }))),
      ()=> cb([])
    );
  }

  // One-way push: TeachersDeck's local Calendar widget is the source of
  // truth, so this mirrors state.calendarEvents up into
  // classes/{id}/calendarEvents whenever it changes (called from
  // saveState() in app.js). Skips the round trip when nothing changed.
  let lastCalHash = '', calQueued = null;
  let syncing = false;
  async function syncCalendar(classId, events){
    if(!ready || !classId) return;
    // v0.15.0: a change that arrives while a sync is already running used to be DROPPED (it only went up on some later save);
    // now the newest call is remembered and run as soon as the current one finishes.
    if(syncing){ calQueued = [classId, events]; return; }
    const hash = classId + '::' + JSON.stringify(events);
    if(hash === lastCalHash) return;
    syncing = true;
    try{
      const col = db.collection('classes').doc(classId).collection('calendarEvents');
      const existing = await col.get();
      const staleIds = new Set(existing.docs.map(d=>d.id));
      const batch = db.batch();
      events.forEach(ev=>{
        batch.set(col.doc(ev.id), {
          title: ev.title || '',
          date: ev.date || '',
          time: ev.time || '',
          // Bug fix: this used to write `type: ev.reminder || 'none'`, which clobbered the
          // event's own category (ev.type, e.g. 'assignment' or 'progress-report') with its
          // reminder SETTING instead — so StudentDeck/ParentDeck's `e.type==='assignment'`
          // badge check against the synced doc could never actually match anything. type and
          // reminder are two different pieces of information; both are now written, separately.
          type: ev.type || 'event',
          reminder: ev.reminder || 'none',
          createdBy: 'teacher'
        });
        staleIds.delete(ev.id);
      });
      staleIds.forEach(id=> batch.delete(col.doc(id)));
      await batch.commit();
      lastCalHash = hash;
    }catch(e){ /* best-effort — local calendar is still the source of truth */ }
    finally{ syncing = false; if(calQueued){ const q = calQueued; calQueued = null; syncCalendar(q[0], q[1]); } }
  }
  function resetCalendarSyncCache(){ lastCalHash = ''; }

  // One-way push, same pattern as syncCalendar above: TeachersDeck's local
  // Assignments widget is the source of truth, so this mirrors
  // state.assignments up into classes/{id}/homework whenever it changes
  // (called from saveState() in app.js). This is what lets StudentDeck's
  // Homework To-Do widget and ParentDeck's Homework widget see a teacher's
  // assignments in real time. Requires firestore.rules to allow the
  // teacher to write classes/{id}/homework/* (same ownership check as
  // calendarEvents) and students/guardians of that class to read it.
  let lastHwHash = '';
  let syncingHw = false, hwQueued = null;
  async function syncHomework(classId, assignments){
    if(!ready || !classId) return;
    if(syncingHw){ hwQueued = [classId, assignments]; return; }   // same coalescing as syncCalendar — see the note there
    const hash = classId + '::' + JSON.stringify(assignments);
    if(hash === lastHwHash) return;
    syncingHw = true;
    try{
      const col = db.collection('classes').doc(classId).collection('homework');
      const existing = await col.get();
      const staleIds = new Set(existing.docs.map(d=>d.id));
      const batch = db.batch();
      (assignments||[]).forEach(a=>{
        batch.set(col.doc(a.id), {
          title: a.title || '',
          subject: a.subject || '',
          dueDate: a.dueDate || '',
          dueTime: a.dueTime || '',
          points: a.points || 0,
          instructions: a.instructions || '',
          createdBy: 'teacher'
        });
        staleIds.delete(a.id);
      });
      staleIds.forEach(id=> batch.delete(col.doc(id)));
      await batch.commit();
      lastHwHash = hash;
    }catch(e){ /* best-effort — local assignments list is still the source of truth */ }
    finally{ syncingHw = false; if(hwQueued){ const q = hwQueued; hwQueued = null; syncHomework(q[0], q[1]); } }
  }
  function resetHomeworkSyncCache(){ lastHwHash = ''; }

  // ---- v0.21.2 (backend v2.0.0): attendance shared with families, family codes, Class Pulse ----
  // Attendance: one doc per student per day, students/{id}/attendance/{YYYY-MM-DD} = { status, classId, updatedAt },
  // the per-student path ParentDeck reads (never a class-wide sheet). status null = remove that day.
  async function syncAttendance(classId, entries){
    const FV = firebase.firestore.FieldValue;
    for(let i = 0; i < entries.length; i += 400){
      const batch = db.batch();
      entries.slice(i, i + 400).forEach(e=>{
        const ref = db.collection('students').doc(e.studentId).collection('attendance').doc(e.day);
        if(e.status) batch.set(ref, { status: e.status, classId, updatedAt: FV.serverTimestamp() });
        else batch.delete(ref);
      });
      await batch.commit();
    }
  }
  async function getFamilyCodes(classId){
    return ((await functions.httpsCallable('getFamilyCodes')({ classId })).data || {}).codes || [];
  }
  async function regenerateFamilyCode(classId, studentId){
    return (await functions.httpsCallable('regenerateFamilyCode')({ classId, studentId })).data;
  }
  // ---- v0.21.3 (backend v2.1.0): schools and notes from the school admin ----
  async function joinSchool(code){
    return (await functions.httpsCallable('joinSchool')({ code })).data;
  }
  // platform (Canvas, backend v2.11.0): with school-level Pro on (TD_PLATFORM.schoolPro), also asks getMySchoolPro whether
  // the school is Pro, since schools/* has no client rule. Cached per schoolId, so a snapshot that doesn't change the school
  // doesn't call it again, and a passing error keeps the last answer instead of flashing the teacher back to Free.
  let proCacheSchoolId = null, proCacheValue = false;
  function subscribeMySchool(cb){
    const u = firebase.auth().currentUser; if(!u){ cb({}); return ()=>{}; }
    const wantPro = !!(window.TD_PLATFORM && window.TD_PLATFORM.schoolPro);
    if(!wantPro) return db.collection('users').doc(u.uid).onSnapshot(d=> cb(d.exists ? { schoolId: d.data().schoolId || null, schoolName: d.data().schoolName || null } : {}), ()=> cb({}));
    return db.collection('users').doc(u.uid).onSnapshot(async d=>{
      const schoolId = d.exists ? (d.data().schoolId || null) : null;
      const schoolName = d.exists ? (d.data().schoolName || null) : null;
      if(!schoolId){ proCacheSchoolId = null; cb({ schoolId:null, schoolName:null, pro:false }); return; }
      if(schoolId !== proCacheSchoolId){
        try{ proCacheValue = !!(await functions.httpsCallable('getMySchoolPro')()).data.pro; proCacheSchoolId = schoolId; }
        catch(e){ /* keep the last known value on a passing error */ }
      }
      cb({ schoolId, schoolName, pro: proCacheValue });
    }, ()=> cb({}));
  }
  function subscribeAdminNotes(cb){
    const u = firebase.auth().currentUser; if(!u){ cb([]); return ()=>{}; }
    return db.collection('adminNotes').where('teacherUid', '==', u.uid).orderBy('createdAtMs', 'desc').limit(30)
      .onSnapshot(s=> cb(s.docs.map(d=> ({ id: d.id, ...d.data() }))), ()=> cb(null));   // null: rule not deployed (backend < v2.1.0)
  }
  async function markAdminNoteRead(noteId){
    await db.collection('adminNotes').doc(noteId).update({ read: true, readAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
  async function setClassPulse(classId, enabled){
    return (await functions.httpsCallable('setClassPulse')({ classId, enabled })).data;
  }

  // ---- v0.26.0 (backend v2.7.0): DrawDeck "share this page" -> StudentDeck's Shared Board ----
  // Direct client write, same pattern as syncCalendar/syncHomework above — the only validation
  // firestore.rules needs (shape, size cap) is something a rule can enforce on its own, so this
  // skips a Cloud Function. One shared page per class at a time: writing classes/{id}/sharedBoards/current
  // replaces whatever was there; stopSharingBoard deletes it.
  async function shareBoard(classId, imageDataUrl){
    if(!ready || !classId) throw new Error('not ready');
    const u = firebase.auth().currentUser; if(!u) throw new Error('not signed in');
    await db.collection('classes').doc(classId).collection('sharedBoards').doc('current').set({
      imageDataUrl, sharedAt: Date.now(), sharedBy: u.uid
    });
  }
  async function stopSharingBoard(classId){
    if(!ready || !classId) throw new Error('not ready');
    await db.collection('classes').doc(classId).collection('sharedBoards').doc('current').delete();
  }

  // ---- v0.27.0 (backend v2.8.0): Scrapdeck review (M3) ----
  // A teacher's free review screen for pages students have shared from StudentDeck's Scrapdeck.
  // listScrapPages/reviewScrapPage are Cloud Functions (see scrapdeck.js's header comment for why
  // the list is a function, not a client collectionGroup query); setScrapGalleryOn is the
  // teacher's own per-class switch for the classmates' gallery (M3b), off by default.
  async function listScrapPages(classId){
    return (await functions.httpsCallable('listScrapPages')({ classId })).data.rows;
  }
  async function reviewScrapPage(studentId, pageId, action){
    return (await functions.httpsCallable('reviewScrapPage')({ studentId, pageId, action })).data;
  }
  async function setScrapGalleryOn(classId, enabled){
    return (await functions.httpsCallable('setScrapGalleryOn')({ classId, enabled })).data;
  }
  async function getScrapImage(studentId, pageId){
    const d = await db.collection('students').doc(studentId).collection('scrapImages').doc(pageId).get();
    return d.exists ? d.data().imageDataUrl : null;
  }

  // ---- v0.29.0 (backend v2.9.0): Board Assignments (DrawDeck scope step D) ----
  async function assignBoard(classId, title, thumbDataUrl, imageDataUrl){
    return (await functions.httpsCallable('assignBoard')({ classId, title, thumbDataUrl, imageDataUrl })).data;
  }
  async function closeAssignment(classId, assignmentId, open){
    return (await functions.httpsCallable('closeAssignment')({ classId, assignmentId, open })).data;
  }
  async function listBoardAnswers(classId, assignmentId){
    return (await functions.httpsCallable('listBoardAnswers')({ classId, assignmentId })).data.rows;
  }
  async function awardBoardAnswer(classId, studentId, assignmentId, amount, reason){
    return (await functions.httpsCallable('awardBoardAnswer')({ classId, studentId, assignmentId, amount, reason })).data;
  }
  function subscribeBoardAssignments(classId, cb){
    if(!ready || !classId) return ()=>{};
    return db.collection('classes').doc(classId).collection('boardAssignments').onSnapshot(
      snap=> cb(snap.docs.map(d=> ({ id:d.id, ...d.data() })).sort((a,b)=> (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0))),
      ()=> cb([])
    );
  }
  async function getBoardAnswerImage(studentId, assignmentId){
    const d = await db.collection('students').doc(studentId).collection('boardAnswerImages').doc(assignmentId).get();
    return d.exists ? d.data().imageDataUrl : null;
  }

  return {
    isConfigured, init, watchAuth, onAuthChanged, signIn, signOut: signOutCloud, getSession,
    myClasses, createClass, regenerateJoinCode, setRankingVisibility,
    subscribeClass, subscribeAdminTheme, subscribeRoster, subscribeRewards,
    awardPoints, saveReward, deleteReward, removeStudent,
    subscribeStudentActivity, subscribeLedger, sendNotesHome, subscribeNotes, deleteNote,
    sendProgressReport, deleteProgressReport,
    syncCalendar, resetCalendarSyncCache,
    syncHomework, resetHomeworkSyncCache,
    syncAttendance, getFamilyCodes, regenerateFamilyCode, setClassPulse,
    joinSchool, subscribeMySchool, subscribeAdminNotes, markAdminNoteRead,
    shareBoard, stopSharingBoard,
    listScrapPages, reviewScrapPage, setScrapGalleryOn, getScrapImage,
    assignBoard, closeAssignment, listBoardAnswers, awardBoardAnswer, subscribeBoardAssignments, getBoardAnswerImage
  };
})();
TDCloud.watchAuth();
