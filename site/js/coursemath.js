'use strict';
/* =========================================================
   UniDeck course maths (backend v2.12.0) — one file in three places
   -----------------------------------------------------------------
   backend/functions/src/courseMath.js   (this copy is the one to edit)
   teachersdeck/js/coursemath.js         LectureDeck's grader and gradebook
   studentdeck/js/coursemath.js          UniStudentDeck's Grades widget
   tools/check_shared.py keeps the three byte-identical, so the late penalty and the running course total a student
   sees are computed by exactly the code the server uses for the stored final score and the gradebook export.

   Pure functions only: no Firestore, no DOM. Runs in Node (require) and in the browser (window.CourseMath).

   Times are milliseconds since the epoch. Scores and points are numbers; results are rounded to 2 decimals.
   ========================================================= */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000;
  const CATEGORIES = ['assignments', 'quizzes', 'exams', 'participation'];
  const LATE_MODES = ['accept', 'penalty', 'closed'];
  const round2 = (n) => Math.round(n * 100) / 100;

  /** The default policy: late work accepted, no penalty. */
  const DEFAULT_LATE = Object.freeze({ mode: 'accept', perDayPct: 0, maxDays: 0 });

  /** A late policy cleaned up: unknown mode -> 'accept'; perDayPct 0..100; maxDays 0..60 (0 = no limit). */
  function cleanLatePolicy(p) {
    const x = p && typeof p === 'object' ? p : {};
    const mode = LATE_MODES.includes(x.mode) ? x.mode : 'accept';
    const perDayPct = mode === 'penalty' ? Math.min(100, Math.max(0, Number(x.perDayPct) || 0)) : 0;
    const maxDays = mode === 'penalty' ? Math.min(60, Math.max(0, Math.floor(Number(x.maxDays) || 0))) : 0;
    return { mode, perDayPct, maxDays };
  }

  /**
   * Grading weights cleaned up: only known categories, whole numbers 0..100, and they must add up to 100.
   * Returns { weights } or { error }. An empty or missing object means "assignments 100".
   */
  function cleanWeights(w) {
    if (!w || typeof w !== 'object' || !Object.keys(w).length) return { weights: { assignments: 100 } };
    const out = {};
    for (const [k, v] of Object.entries(w)) {
      if (!CATEGORIES.includes(k)) return { error: `Unknown grading category "${k}".` };
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'Each weight must be a whole number from 0 to 100.' };
      if (n > 0) out[k] = n;
    }
    const sum = Object.values(out).reduce((a, b) => a + b, 0);
    if (sum !== 100) return { error: `Grading weights must add up to 100 (they add up to ${sum}).` };
    return { weights: out };
  }

  /** How late a submission is: whole days late, rounded UP (one minute late = 1 day). On time = 0. */
  function lateness(dueAtMs, submittedAtMs) {
    if (!dueAtMs || !submittedAtMs || submittedAtMs <= dueAtMs) return { late: false, lateDays: 0 };
    return { late: true, lateDays: Math.ceil((submittedAtMs - dueAtMs) / DAY) };
  }

  /** May a submission be made at this moment? 'closed' refuses anything after the due time. */
  function acceptsSubmission(policy, dueAtMs, nowMs) {
    const p = cleanLatePolicy(policy);
    if (p.mode !== 'closed' || !dueAtMs) return true;
    return nowMs <= dueAtMs;
  }

  /**
   * The late penalty, as a percentage of the score taken off (0..100).
   * 'penalty': perDayPct for each day late; past maxDays (when set) the work earns nothing.
   */
  function latePenaltyPct(policy, lateDays) {
    const p = cleanLatePolicy(policy);
    if (p.mode !== 'penalty' || !lateDays) return 0;
    if (p.maxDays && lateDays > p.maxDays) return 100;
    return Math.min(100, round2(p.perDayPct * lateDays));
  }

  /** A rubric score: each criterion clamped to 0..its points; the sum is the score. Unknown criteria are ignored. */
  function rubricScore(rubric, rubricScores) {
    const list = Array.isArray(rubric) ? rubric : [];
    const given = rubricScores && typeof rubricScores === 'object' ? rubricScores : {};
    const clean = {};
    let total = 0;
    for (const c of list) {
      const v = Number(given[c.id]);
      const s = Number.isFinite(v) ? Math.min(Number(c.points) || 0, Math.max(0, v)) : 0;
      clean[c.id] = round2(s);
      total += s;
    }
    return { score: round2(total), rubricScores: clean };
  }

  /** The score after the late penalty, never below 0. */
  function finalScore(score, penaltyPct) {
    return Math.max(0, round2((Number(score) || 0) * (1 - (Number(penaltyPct) || 0) / 100)));
  }

  /**
   * The running course total from RELEASED grades only.
   *   weights      { assignments: 40, quizzes: 20, ... }  (as stored on the course)
   *   assignments  [{ id, points, category }]
   *   grades       [{ assignmentId, finalScore, released }]
   * Each category's percentage = its released final scores / the points of those same assignments. Categories with
   * nothing released yet are left out and the remaining weights are scaled up, so the total is "so far".
   * Returns { percent (null when nothing is released), byCategory: { cat: { earned, possible, percent, weight } } }.
   */
  function courseTotal(weights, assignments, grades) {
    const w = cleanWeights(weights).weights || { assignments: 100 };
    const byId = new Map((assignments || []).map((a) => [a.id, a]));
    const byCategory = {};
    for (const g of grades || []) {
      if (!g || !g.released) continue;
      const a = byId.get(g.assignmentId);
      if (!a || !(Number(a.points) > 0)) continue;
      const cat = w[a.category] ? a.category : 'assignments';
      const c = byCategory[cat] || (byCategory[cat] = { earned: 0, possible: 0, percent: 0, weight: w[cat] || 0 });
      c.earned += Number(g.finalScore) || 0;
      c.possible += Number(a.points);
    }
    let weighted = 0, used = 0;
    for (const c of Object.values(byCategory)) {
      c.earned = round2(c.earned); c.possible = round2(c.possible);
      c.percent = c.possible ? round2((c.earned / c.possible) * 100) : 0;
      if (c.weight > 0) { weighted += c.percent * c.weight; used += c.weight; }
    }
    return { percent: used ? round2(weighted / used) : null, byCategory };
  }

  /** One CSV field, quoted when needed; a leading = + - @ is prefixed with ' so spreadsheets don't run it. */
  function csvField(v) {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /**
   * The gradebook as CSV: one row per student, one column per assignment (final score; blank = not graded),
   * then the running total. Includes unreleased grades (it is the instructor's own record); marks them with *.
   */
  function gradebookCsv(course, students, assignments, grades) {
    const as = [...(assignments || [])].sort((a, b) => (a.dueAtMs || 0) - (b.dueAtMs || 0));
    const key = (aid, uid) => `${aid}|${uid}`;
    const gm = new Map((grades || []).map((g) => [key(g.assignmentId, g.uid), g]));
    const head = ['Student', 'Email', ...as.map((a) => `${a.title} (/${a.points})`), 'Course total %'];
    const rows = [head];
    for (const s of [...(students || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      const mine = as.map((a) => gm.get(key(a.id, s.uid))).filter(Boolean);
      const total = courseTotal(course && course.weights, as, mine.map((g) => ({ ...g, released: true })));
      rows.push([s.name || '', s.email || '', ...as.map((a) => {
        const g = gm.get(key(a.id, s.uid));
        return g ? `${g.finalScore}${g.released ? '' : '*'}` : '';
      }), total.percent === null ? '' : total.percent]);
    }
    return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
  }

  return { DAY, CATEGORIES, LATE_MODES, DEFAULT_LATE, cleanLatePolicy, cleanWeights, lateness, acceptsSubmission,
    latePenaltyPct, rubricScore, finalScore, courseTotal, csvField, gradebookCsv, round2 };
});
