'use strict';
/* =========================================================
   Telling Time — the clock engine (phase 0, 14 Nov 2026). Scope: hq/docs/TELLING-TIME-SCOPE.md.
   ---------------------------------------------------------
   ONE ENGINE for the Telling Time tile (free, every app) and the Telling Time game (Pro, Games tile).
   teachersdeck/js/tellingtime.js is the copy to edit. Tests: node tools/test_tellingtime.js (CI runs them).

   Two halves:
   1. Words (no DOM, also runs in Node): a time as English words, British or American, both ways (clock words
      "quarter to four", digital words "three forty-five"); a strict parser that knows the common mistakes are wrong;
      wrong-answer "traps" built from those mistakes; the Vietnamese hint shown only when a student taps VI.
   2. The clock (browser only): an SVG clock drawn from a face definition, with draggable, geared hands.

   Times are always (h, m) with h 0–23, m 0–59. Style is 'uk' (default) or 'us'.

   window.TellingTime  (module.exports in Node)
     .words(h, m, opts)        opts: { style:'uk'|'us', form:'clock'|'digital', day:false|'words'|'ampm' }
                               'clock'  → "quarter to four", "seven minutes past three", "three o'clock"
                               'digital'→ "three forty-five", "three oh seven", "three"
                               day 'words' → "… in the morning" / "midnight"; 'ampm' → "… p.m."
     .parse(text)              → { h: 1–12, m, period: 'am'|'pm'|null, part: 'morning'|…|null } or null.
                               Strict: "three o'clock fifteen", "seven past three", "fifteen o'clock" are null.
                               Accepts both styles ("a quarter after", "ten of four") and "3:45".
     .matches(text, h, m)      true when text is a correct way to say h:m (a.m./p.m. or a day part, if given, must fit)
     .traps(h, m, opts)        → [{ text, kind }] wrong answers from typical mistakes, never mixing styles.
                               opts: { style, day } (day 'ampm' adds the a.m./p.m. swap). kind is a key of VI_TIPS.
     .viHint(h, m, opts)       → one Vietnamese line ("4 giờ kém 15 → quarter to four …"); opts.style
     .VI_TIPS                  Vietnamese line per trap kind, for the hint after a wrong answer
     .stepOf(m)                1 o'clock · 2 half past · 3 quarters · 4 five-minute steps · 5 any minute
     .random(step, rng)        → { h, m } at that step or below (rng defaults to Math.random)
     .FACES                    face definitions (data): basic (free) and the premium ones (pro: true)
     .clock(el, opts)          draws a clock into el. opts: { face:'basic', h, m, interactive:true, snap:1,
                               style:'uk', live:false, label }. Returns a controller:
                               { get() → {h,m}, set(h,m), setFace(id), setSnap(n), setStyle(s), live(on),
                                 showHands(on), onChange(fn) → unsubscribe, svg, destroy() }
     The tile around the clock (buttons, words, settings) is js/tellingtime-tile.js.

   Colours come from CSS variables with fallbacks, so each app's theme (and Light/Dark) can restyle the clock:
     --tt-face --tt-rim --tt-tick --tt-num --tt-min-ring --tt-hour --tt-minute --tt-second --tt-past --tt-to --tt-text
   ========================================================= */
(function (root) {

  /* ---------------- 1. Words ---------------- */

  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];

  function num(n) {
    if (n < 20) return ONES[n];
    return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  }
  const h12 = h => ((h % 12) + 12) % 12 || 12;
  const hourWord = h => num(h12(h));
  const norm = (h, m) => [((h % 24) + 24) % 24, ((m % 60) + 60) % 60];

  function clockWords(h, m, style) {
    const us = style === 'us', past = us ? 'after' : 'past', q = us ? 'a quarter' : 'quarter';
    const H = hourWord(h), N = hourWord(h + 1);
    if (m === 0) return `${H} o'clock`;
    if (m === 15) return `${q} ${past} ${H}`;
    if (m === 30) return `half past ${H}`;
    if (m === 45) return `${q} to ${N}`;
    const n = m < 30 ? m : 60 - m, rel = m < 30 ? `${past} ${H}` : `to ${N}`;
    return m % 5 ? `${num(n)} minute${n === 1 ? '' : 's'} ${rel}` : `${num(n)} ${rel}`;
  }

  function digitalWords(h, m) {
    const H = hourWord(h);
    if (m === 0) return H;
    return m < 10 ? `${H} oh ${ONES[m]}` : `${H} ${num(m)}`;
  }

  /* The generator's day parts; parse/matches accept a little more (see PART_FITS). */
  function dayPart(h) {
    if (h === 0 || h >= 21) return 'at night';
    if (h < 12) return 'in the morning';
    if (h < 17) return 'in the afternoon';
    return 'in the evening';
  }

  function words(h, m, opts) {
    opts = opts || {};
    [h, m] = norm(h, m);
    const style = opts.style === 'us' ? 'us' : 'uk', day = opts.day || false;
    if (day && m === 0 && h === 0) return 'midnight';
    if (day && m === 0 && h === 12) return style === 'us' ? 'noon' : 'midday';
    const w = opts.form === 'digital' ? digitalWords(h, m) : clockWords(h, m, style);
    if (day === 'ampm') return `${w} ${h < 12 ? 'a.m.' : 'p.m.'}`;
    if (day === 'words') return `${w} ${dayPart(h)}`;
    return w;
  }

  /* ---- parser ---- */
  const NUMS = {};
  ONES.forEach((w, i) => { NUMS[w] = i; });
  const TENS_N = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
  const PAST = new Set(['past', 'after']), TO = new Set(['to', 'of', 'till', 'before']);
  const PARTS = { 'in the morning': 'morning', 'in the afternoon': 'afternoon', 'in the evening': 'evening', 'at night': 'night' };

  /* Reads one number at tokens[i]: "7", "seven", "twenty-five" (already split on '-'), "twenty five". */
  function readNum(t, i) {
    const w = t[i];
    if (w === undefined) return null;
    if (/^\d{1,2}$/.test(w)) return [Number(w), i + 1];
    if (w in TENS_N) {
      const o = NUMS[t[i + 1]];
      if (o !== undefined && o >= 1 && o <= 9) return [TENS_N[w] + o, i + 2];
      return [TENS_N[w], i + 1];
    }
    if (w in NUMS) return [NUMS[w], i + 1];
    return null;
  }

  function parse(text) {
    if (typeof text !== 'string') return null;
    let s = ' ' + text.toLowerCase().replace(/[‘’`]/g, "'") + ' ';
    s = s.replace(/\ba\.\s?m\b\.?/g, ' am ').replace(/\bp\.\s?m\b\.?/g, ' pm ');
    s = s.replace(/[.,!?;]/g, ' ').replace(/-/g, ' ')
      .replace(/\bo\s?'?\s?clock\b/g, "o'clock").replace(/\s+/g, ' ').trim();
    s = s.replace(/^(it's|it is|its|the time is)\s+/, '');
    let period = null, part = null;
    const am = s.match(/\s(am|pm)$/);
    if (am) { period = am[1]; s = s.slice(0, -3).trim(); }
    for (const p in PARTS) {
      if (!period && s.endsWith(' ' + p)) { part = PARTS[p]; s = s.slice(0, -p.length - 1).trim(); break; }
    }
    if (!period && !part) {
      if (s === 'midnight') return { h: 12, m: 0, period: 'am', part: null, special: 'midnight' };
      if (s === 'noon' || s === 'midday') return { h: 12, m: 0, period: 'pm', part: null, special: 'noon' };
    }
    const out = (h, m) => (h >= 1 && h <= 12 && m >= 0 && m <= 59 ? { h, m, period, part } : null);

    const colon = s.match(/^(\d{1,2}):(\d{2})$/);
    if (colon) return out(Number(colon[1]), Number(colon[2]));

    const t = s.split(' ');
    // a quarter past / quarter to / half past
    let i = 0;
    if (t[i] === 'a' && t[i + 1] === 'quarter') i++;
    if (t[i] === 'quarter' || t[i] === 'half') {
      const what = t[i], rel = t[i + 1], H = readNum(t, i + 2);
      if (!H || H[1] !== t.length) return null;
      if (what === 'half') return PAST.has(rel) && rel === 'past' ? out(H[0], 30) : null;
      if (PAST.has(rel)) return out(H[0], 15);
      if (TO.has(rel)) return H[0] >= 1 && H[0] <= 12 ? out(H[0] === 1 ? 12 : H[0] - 1, 45) : null;
      return null;
    }
    if (i) return null; // "a" not followed by quarter

    const A = readNum(t, 0);
    if (!A) return null;
    let j = A[1];
    // H o'clock
    if (t[j] === "o'clock") return j + 1 === t.length && A[0] >= 1 ? out(A[0], 0) : null;
    // H alone
    if (j === t.length) return out(A[0], 0);
    // H oh M
    if (t[j] === 'oh' || t[j] === 'o' || t[j] === 'zero') {
      const M = readNum(t, j + 1);
      return M && M[1] === t.length && M[0] >= 1 && M[0] <= 9 ? out(A[0], M[0]) : null;
    }
    // N [minute(s)] past/to H
    let minutes = null;
    if (t[j] === 'minute' || t[j] === 'minutes') { minutes = t[j]; j++; }
    if (PAST.has(t[j]) || TO.has(t[j])) {
      const n = A[0], rel = t[j], H = readNum(t, j + 1);
      if (!H || H[1] !== t.length || n < 1 || n > 29) return null;
      if (minutes === 'minute' && n !== 1) return null;
      if (minutes === 'minutes' && n === 1) return null;
      if (!minutes && (n % 5 !== 0 || n === 15)) return null;   // "seven past three", "fifteen past three"
      if (PAST.has(rel)) return out(H[0], n);
      return H[0] >= 1 && H[0] <= 12 ? out(H[0] === 1 ? 12 : H[0] - 1, 60 - n) : null;
    }
    if (minutes) return null;
    // H M (digital, M 10–59)
    const M = readNum(t, j);
    if (M && M[1] === t.length && M[0] >= 10 && M[0] <= 59) return out(A[0], M[0]);
    return null;
  }

  const PART_FITS = {
    morning: h => h >= 1 && h < 12,
    afternoon: h => h >= 12 && h < 18,
    evening: h => h >= 17 && h < 22,
    night: h => h >= 20 || h < 4,
  };

  function matches(text, h, m) {
    [h, m] = norm(h, m);
    const p = parse(text);
    if (!p || p.h !== h12(h) || p.m !== m) return false;
    if (p.special === 'midnight') return h === 0;
    if (p.special === 'noon') return h === 12;
    if (p.period === 'am' && h >= 12) return false;
    if (p.period === 'pm' && h < 12) return false;
    if (p.part && !PART_FITS[p.part](h)) return false;
    return true;
  }

  /* ---- traps: wrong answers built from the mistakes in the scope (section 1) ---- */
  const SWAP = { 13: 30, 14: 40, 15: 50, 30: 13, 40: 14, 50: 15 };

  function traps(h, m, opts) {
    opts = opts || {};
    [h, m] = norm(h, m);
    const style = opts.style === 'us' ? 'us' : 'uk', past = style === 'us' ? 'after' : 'past';
    const H = hourWord(h), N = hourWord(h + 1), list = [];
    const add = (text, kind) => list.push({ text, kind });
    if (m > 0) add(`${H} o'clock ${num(m)}`, 'oclock');
    if (h >= 13) add(m === 0 ? `${num(h)} o'clock` : `${num(h)} ${m < 10 ? 'oh ' + ONES[m] : num(m)}`, '24h');
    if (m > 0 && m < 30 && m !== 15) add(`${num(m)}${m % 5 ? (m === 1 ? ' minute' : ' minutes') : ''} to ${H}`, 'pastto');
    if (m === 15) add(`${style === 'us' ? 'a quarter' : 'quarter'} to ${H}`, 'pastto');
    if (m > 30 && m !== 45) add(`${num(60 - m)}${m % 5 ? (m === 59 ? ' minute' : ' minutes') : ''} ${past} ${N}`, 'pastto');
    if (m === 45) add(`${style === 'us' ? 'a quarter' : 'quarter'} ${past} ${N}`, 'pastto');
    if (m > 30) add(clockWords(h - 1, m, style), 'hour');          // "quarter to three" for 3:45
    else if (m === 0) { add(clockWords(h + 1, 0, style), 'hour'); add(clockWords(h - 1, 0, style), 'hour'); }
    else add(clockWords(h + 1, m, style), 'hour');                 // "quarter past four" for 3:15
    if (m % 5) {
      const n = m < 30 ? m : 60 - m;
      add(`${num(n)} ${m < 30 ? past + ' ' + H : 'to ' + N}`, 'minutes');
    }
    if (SWAP[m]) add(`${H} ${num(SWAP[m])}`, 'fifty');
    if (opts.day === 'ampm') add(`${words(h, m, { style, form: 'digital' })} ${h < 12 ? 'p.m.' : 'a.m.'}`, 'ampm');
    const correct = words(h, m, { style, day: opts.day });
    const seen = new Set();
    return list.filter(x => {
      if (seen.has(x.text) || x.text === correct || matches(x.text, h, m)) return false;
      seen.add(x.text); return true;
    });
  }

  /* ---- Vietnamese: only ever shown after the student taps VI ---- */
  const VI_TIPS = {
    oclock: '"o\'clock" chỉ dùng khi đúng giờ: không nói "three o\'clock fifteen".',
    '24h': 'Tiếng Anh nói giờ theo 12 giờ: 15 giờ = three p.m., không nói "fifteen o\'clock".',
    pastto: 'past / after = hơn (phút 1–30); to = kém (phút 31–59).',
    hour: 'Với "to", dùng giờ sắp tới: 3:45 = quarter to four (4 giờ kém 15).',
    minutes: 'Phút lẻ (không chia hết cho 5) phải có "minutes": seven minutes past three.',
    fifty: 'Nghe trọng âm: fif-TEEN (15) và FIF-ty (50); thir-TEEN (13) và THIR-ty (30).',
    ampm: 'a.m. = từ nửa đêm đến trưa (0:00–11:59); p.m. = từ trưa đến nửa đêm (12:00–23:59).',
  };

  function viHint(h, m, opts) {
    opts = opts || {};
    [h, m] = norm(h, m);
    const hh = h12(h), next = h12(h + 1), en = clockWords(h, m, opts.style === 'us' ? 'us' : 'uk');
    const past = opts.style === 'us' ? 'after' : 'past';
    if (m === 0) return `${hh} giờ đúng → ${en}`;
    if (m === 30) return `${hh} giờ rưỡi → ${en}`;
    if (m < 30) return `${hh} giờ ${m} phút → ${en} ("${past}" = hơn)`;
    return `${next} giờ kém ${60 - m} → ${en} ("to" = kém)`;
  }

  function stepOf(m) {
    if (m === 0) return 1;
    if (m === 30) return 2;
    if (m === 15 || m === 45) return 3;
    if (m % 5 === 0) return 4;
    return 5;
  }

  function random(step, rng) {
    rng = rng || Math.random;
    const pick = a => a[Math.floor(rng() * a.length)];
    const s = Math.max(1, Math.min(6, step | 0 || 1));
    const mins = s === 1 ? [0] : s === 2 ? [0, 30] : s === 3 ? [0, 15, 30, 45]
      : s === 4 ? Array.from({ length: 12 }, (_, i) => i * 5) : Array.from({ length: 60 }, (_, i) => i);
    return { h: Math.floor(rng() * 24), m: pick(mins) };
  }

  /* ---------------- 2. Faces (data) ---------------- */
  /* kind 'analog': numbers 'all' | 'quarters' | 'none'; roman; minuteRing (5…55 outside); pastTo (tinted halves);
     grain / stars (theme decoration). kind 'digital': format '12' | '24' | 'words'; flip (cards that flip when a digit
     changes; still under prefers-reduced-motion). colors: --tt-* values for this face (they win over the app's).
     Only basic is free. A new face is a new entry here (and its name in js/tellingtime-tile.js). */
  const FACES = {
    basic:    { kind: 'analog', numbers: 'all', pro: false },
    minutes:  { kind: 'analog', numbers: 'all', minuteRing: true, pro: true },
    pastto:   { kind: 'analog', numbers: 'all', pastTo: true, pro: true },
    quarters: { kind: 'analog', numbers: 'quarters', pro: true },
    none:     { kind: 'analog', numbers: 'none', pro: true },
    roman:    { kind: 'analog', numbers: 'all', roman: true, pro: true },
    // Classroom themes (phase 2, 14 Nov 2026): the basic face's numbering in other colours. colors = the --tt-* variables.
    chalk:    { kind: 'analog', numbers: 'all', pro: true,
      colors: { face: '#2f4a3a', rim: '#8a5a2b', tick: '#e9efe6', num: '#f4f1e8', hour: '#f4f1e8', minute: '#f6c445', second: '#f39c9c' } },
    wood:     { kind: 'analog', numbers: 'all', grain: true, pro: true,
      colors: { face: '#e2b07a', rim: '#6b3f1d', tick: '#4a2c14', num: '#3b2412', hour: '#3b2412', minute: '#b03a2e', second: '#1f5f8b' } },
    space:    { kind: 'analog', numbers: 'all', stars: true, pro: true,
      colors: { face: '#141a3c', rim: '#6c63ff', tick: '#aab0ff', num: '#ffffff', hour: '#ffffff', minute: '#ff6b9a', second: '#ffd166' } },
    lcd12:    { kind: 'digital', format: '12', pro: true, colors: { face: '#0f1d24', rim: '#2b3f4a', text: '#7cffb2' } },
    h24:      { kind: 'digital', format: '24', pro: true },
    flip:     { kind: 'digital', format: '12', flip: true, pro: true },
    words:    { kind: 'digital', format: 'words', pro: true },
  };
  const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  /* ---------------- 3. The clock (browser) ---------------- */
  const NS = 'http://www.w3.org/2000/svg';
  const v = (name, fallback) => `var(--tt-${name},${fallback})`;
  const pad = n => String(n).padStart(2, '0');
  const COLOR_KEYS = ['face', 'rim', 'tick', 'num', 'min-ring', 'hour', 'minute', 'second', 'past', 'to', 'text'];

  /* The few rules the clock needs wherever it is drawn (the tile, the game): added to the page once. */
  function engineCss() {
    if (document.getElementById('tt-engine-css')) return;
    const s = document.createElement('style');
    s.id = 'tt-engine-css';
    s.textContent = '.tt-clock.tt-nohands .tt-hand{visibility:hidden}' +
      '.tt-clock .tt-flip{transform-box:fill-box;transform-origin:center;animation:tt-flip .38s ease-out}' +
      '@keyframes tt-flip{0%{transform:scaleY(1)}45%{transform:scaleY(.04)}100%{transform:scaleY(1)}}' +
      '@media (prefers-reduced-motion: reduce){.tt-clock .tt-flip{animation:none}}';
    document.head.appendChild(s);
  }

  /* Same stars every time (a seeded walk), kept off the numbers ring and away from the very centre. */
  function starPoints() {
    const pts = [];
    let s = 11;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    while (pts.length < 16) {
      const a = rnd() * Math.PI * 2, r = 18 + rnd() * 38;
      pts.push([Math.sin(a) * r, -Math.cos(a) * r, 0.6 + rnd() * 1.1]);
    }
    return pts;
  }

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function wrapWords(text, max) {
    const lines = [];
    let cur = '';
    for (const w of text.split(' ')) {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function clock(host, opts) {
    opts = opts || {};
    let t = (((opts.h || 0) * 60 + (opts.m || 0)) % 1440 + 1440) % 1440;
    let faceId = FACES[opts.face] ? opts.face : 'basic';
    let snap = Math.max(1, opts.snap | 0 || 1);
    let style = opts.style === 'us' ? 'us' : 'uk';
    let liveTimer = null, sec = null;
    const interactive = opts.interactive !== false;
    const listeners = new Set();

    engineCss();
    const svg = el('svg', { viewBox: '-100 -100 200 200', class: 'tt-clock', focusable: 'false' });
    svg.style.touchAction = 'none';
    svg.style.userSelect = 'none';
    host.appendChild(svg);
    let hourHand = null, minuteHand = null, secondHand = null, digital = null;

    function drawAnalog(f) {
      el('circle', { r: 96, style: `fill:${v('face', '#fffdf7')};stroke:${v('rim', '#1f3a5f')};stroke-width:${f.grain ? 7 : 4}` }, svg);
      if (f.grain) {
        for (const [rx, ry, cy] of [[70, 18, -40], [84, 26, -8], [76, 20, 28], [60, 12, 58]]) {
          el('ellipse', { cx: 0, cy, rx, ry, style: `fill:none;stroke:${v('rim', '#6b3f1d')};stroke-width:1.2;opacity:.18` }, svg);
        }
      }
      if (f.stars) {
        for (const [x, y, r] of starPoints()) el('circle', { cx: x, cy: y, r, style: `fill:${v('tick', '#aab0ff')};opacity:.55` }, svg);
      }
      if (f.pastTo) {
        el('path', { d: 'M0,-92 A92,92 0 0 1 0,92 Z', style: `fill:${v('past', 'rgba(56,161,105,.18)')}` }, svg);
        el('path', { d: 'M0,-92 A92,92 0 0 0 0,92 Z', style: `fill:${v('to', 'rgba(221,107,32,.18)')}` }, svg);
        for (const [x, label, cls, col] of [[30, style === 'us' ? 'after' : 'past', 'tt-past', '#2f855a'], [-30, 'to', 'tt-to', '#c05621']]) {
          const tx = el('text', { x, y: 40, 'text-anchor': 'middle', class: cls,
            style: `font:700 13px Inter,system-ui,sans-serif;fill:${col}` }, svg);
          tx.textContent = label;
        }
        // arrows round the rim: past runs down the right side from 12, to runs up the left side towards 12
        const arrow = 'fill:none;stroke-width:2;opacity:.6;stroke-linecap:round;stroke-linejoin:round;stroke:';
        el('path', { d: 'M8,-50 A50,50 0 0 1 50,-8 M50,-8 l-4.5,-5 M50,-8 l4.5,-5', style: arrow + '#2f855a' }, svg);
        el('path', { d: 'M-50,-8 A50,50 0 0 1 -8,-50 M-8,-50 l-5,-4.5 M-8,-50 l-5,4.5', style: arrow + '#c05621' }, svg);
      }
      const ring = !!f.minuteRing;
      const tickOut = ring ? 79 : 90, numR = ring ? 58 : 71;
      if (ring) el('circle', { r: 81, style: `fill:none;stroke:${v('min-ring', '#2b6cb0')};stroke-width:.8;opacity:.5` }, svg);
      for (let i = 0; i < 60; i++) {
        const major = i % 5 === 0, a = i * Math.PI / 30;
        const r2 = tickOut - (major ? 9 : 4);
        el('line', { x1: Math.sin(a) * tickOut, y1: -Math.cos(a) * tickOut, x2: Math.sin(a) * r2, y2: -Math.cos(a) * r2,
          style: `stroke:${v('tick', '#1f3a5f')};stroke-width:${major ? 2.6 : 1};stroke-linecap:round` }, svg);
      }
      if (ring) {
        for (let i = 1; i <= 12; i++) {
          const a = i * Math.PI / 6;
          const tx = el('text', { x: Math.sin(a) * 88, y: -Math.cos(a) * 88 + 3.6, 'text-anchor': 'middle',
            style: `font:800 10.5px Inter,system-ui,sans-serif;fill:${v('min-ring', '#2b6cb0')}` }, svg);
          tx.textContent = i === 12 ? '0' : String(i * 5);
        }
      }
      const show = f.numbers === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : f.numbers === 'quarters' ? [12, 3, 6, 9] : [];
      for (const n of show) {
        const a = n * Math.PI / 6;
        const tx = el('text', { x: Math.sin(a) * numR, y: -Math.cos(a) * numR + 6, 'text-anchor': 'middle',
          style: `font:700 ${f.roman ? 13 : ring ? 15 : 17}px 'Baloo 2',Inter,system-ui,sans-serif;fill:${v('num', '#1f3a5f')}` }, svg);
        tx.textContent = f.roman ? ROMAN[n % 12] : String(n);
      }
      hourHand = el('g', { class: 'tt-hand' }, svg);
      el('line', { x1: 0, y1: 10, x2: 0, y2: -46, style: `stroke:${v('hour', '#1f3a5f')};stroke-width:7;stroke-linecap:round` }, hourHand);
      minuteHand = el('g', { class: 'tt-hand' }, svg);
      el('line', { x1: 0, y1: 12, x2: 0, y2: -74, style: `stroke:${v('minute', '#e53e3e')};stroke-width:4;stroke-linecap:round` }, minuteHand);
      secondHand = el('g', { class: 'tt-hand', style: 'display:none' }, svg);
      el('line', { x1: 0, y1: 14, x2: 0, y2: -80, style: `stroke:${v('second', '#d69e2e')};stroke-width:1.5;stroke-linecap:round` }, secondHand);
      el('circle', { r: 5, class: 'tt-hand', style: `fill:${v('hour', '#1f3a5f')}` }, svg);
    }

    function drawDigital(f) {
      el('rect', { x: -96, y: -70, width: 192, height: 140, rx: 18,
        style: `fill:${v('face', '#fffdf7')};stroke:${v('rim', '#1f3a5f')};stroke-width:4` }, svg);
      digital = el('g', { class: 'tt-hand' }, svg);
      lastDigital = null;
    }

    let lastDigital = null;
    function updateDigital() {
      const f = FACES[faceId], h = Math.floor(t / 60), m = t % 60;
      const key = `${h}:${m}:${style}`;
      if (key === lastDigital) return;                 // Now mode updates every second; redraw only when the minute changes
      const prev = lastDigital ? lastDigital.split(':').map(Number) : null;
      lastDigital = key;
      digital.textContent = '';
      const txt = (x, y, s, size, weight, parent) => {
        const e = el('text', { x, y, 'text-anchor': 'middle',
          style: `font:${weight || 700} ${size}px Inter,system-ui,sans-serif;fill:${v('text', '#1f3a5f')};font-variant-numeric:tabular-nums` }, parent || digital);
        e.textContent = s;
        return e;
      };
      if (f.flip) {
        // two cards, hours and minutes; the one whose number changed flips (not on the first draw)
        [[-45, String(h12(h)), prev && prev[0] % 12 !== h % 12], [45, pad(m), prev && prev[1] !== m]].forEach(([x, s, changed]) => {
          const card = el('g', { class: changed ? 'tt-flip' : '' }, digital);
          el('rect', { x: x - 39, y: -40, width: 78, height: 66, rx: 9, style: `fill:${v('rim', '#1f3a5f')}` }, card);
          el('line', { x1: x - 39, y1: -7, x2: x + 39, y2: -7, style: `stroke:${v('face', '#fffdf7')};stroke-width:1.5;opacity:.5` }, card);
          const e = txt(x, 9, s, 46, 800, card);
          e.style.fill = v('face', '#fffdf7');
        });
        txt(0, 52, h < 12 ? 'AM' : 'PM', 14, 700);
        return;
      }
      if (f.format === 'words') {
        const lines = wrapWords(words(h, m, { style }), 14);
        lines.forEach((ln, i) => txt(0, (i - (lines.length - 1) / 2) * 26 + 8, ln, 22, 700));
      } else if (f.format === '24') {
        txt(0, 12, `${pad(h)}:${pad(m)}`, 50);
        txt(0, 46, words(h, m, { style, day: 'ampm' }), 11, 500);
      } else {
        txt(0, 12, `${h12(h)}:${pad(m)}`, 50);
        txt(0, 46, h < 12 ? 'AM' : 'PM', 16, 600);
      }
    }

    function draw() {
      svg.textContent = '';
      hourHand = minuteHand = secondHand = digital = null;
      const f = FACES[faceId];
      COLOR_KEYS.forEach(k => svg.style.removeProperty('--tt-' + k));
      if (f.colors) Object.keys(f.colors).forEach(k => svg.style.setProperty('--tt-' + k, f.colors[k]));
      if (f.kind === 'analog') drawAnalog(f); else drawDigital(f);
      svg.dataset.face = faceId;
      update(false);
    }

    function update(fire) {
      const h = Math.floor(t / 60), m = t % 60;
      if (hourHand) {
        hourHand.setAttribute('transform', `rotate(${((h % 12) * 60 + m) / 2})`);
        minuteHand.setAttribute('transform', `rotate(${m * 6})`);
        secondHand.style.display = sec === null ? 'none' : '';
        if (sec !== null) secondHand.setAttribute('transform', `rotate(${sec * 6})`);
      }
      if (digital) updateDigital();
      const said = words(h, m, { style });
      svg.setAttribute('aria-label', opts.label ? `${opts.label}: ${said}` : said);
      if (interactive) {
        svg.setAttribute('role', 'slider');
        svg.setAttribute('tabindex', '0');
        svg.setAttribute('aria-valuemin', '0');
        svg.setAttribute('aria-valuemax', '1439');
        svg.setAttribute('aria-valuenow', String(t));
        svg.setAttribute('aria-valuetext', said);
      } else svg.setAttribute('role', 'img');
      if (fire) listeners.forEach(fn => { try { fn({ h, m }); } catch (e) { console.error(e); } });
    }

    function setT(nt, fire) {
      nt = ((Math.round(nt) % 1440) + 1440) % 1440;
      const changed = nt !== t;
      t = nt;
      update(fire && changed);
    }

    /* ---- dragging (analogue faces only): the hands are geared, so the hour follows the minute hand round ---- */
    let drag = null;
    function point(ev) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
      const ang = (Math.atan2(p.x, -p.y) * 180 / Math.PI + 360) % 360;
      return { ang, dist: Math.hypot(p.x, p.y) };
    }
    const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

    function onDown(ev) {
      if (!hourHand || liveTimer) return;
      const p = point(ev);
      if (!p || p.dist > 98) return;
      const m = t % 60, hourAng = (((t / 60) % 12) * 30) % 360;
      const which = p.dist < 56 && angDiff(p.ang, hourAng) < angDiff(p.ang, m * 6) + 20 ? 'hour' : 'minute';
      drag = { which, id: ev.pointerId };
      try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      ev.preventDefault();
      onMove(ev);
    }
    function onMove(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      const p = point(ev);
      if (!p) return;
      if (drag.which === 'minute') {
        const cur = t % 60;
        let target = Math.round(p.ang / 6 / snap) * snap % 60;
        let d = target - cur;
        if (d > 30) d -= 60; else if (d < -30) d += 60;
        if (d) setT(t + d, true);
      } else {
        const cur = t % 720;
        const target = Math.round((p.ang * 2) / snap) * snap % 720;
        let d = target - cur;
        if (d > 360) d -= 720; else if (d < -360) d += 720;
        if (d) setT(t + d, true);
      }
    }
    function onUp(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null;
      try { svg.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }
    function onKey(ev) {
      if (liveTimer) return;
      const step = { ArrowUp: snap, ArrowRight: snap, ArrowDown: -snap, ArrowLeft: -snap, PageUp: 60, PageDown: -60 }[ev.key];
      if (!step) return;
      ev.preventDefault();
      if (Math.abs(step) === 60 || t % snap === 0) setT(t + step, true);
      else setT(step > 0 ? Math.ceil(t / snap) * snap : Math.floor(t / snap) * snap, true);   // first land on the snap grid
    }
    if (interactive) {
      svg.addEventListener('pointerdown', onDown);
      svg.addEventListener('pointermove', onMove);
      svg.addEventListener('pointerup', onUp);
      svg.addEventListener('pointercancel', onUp);
      svg.addEventListener('keydown', onKey);
    }

    function live(on) {
      if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
      sec = null;
      if (on) {
        const tick = () => {
          const d = new Date();
          sec = d.getSeconds();
          setT(d.getHours() * 60 + d.getMinutes(), true);
        };
        tick();
        liveTimer = setInterval(tick, 1000);
      } else update(false);
    }

    draw();
    if (opts.live) live(true);

    return {
      svg,
      get: () => ({ h: Math.floor(t / 60), m: t % 60 }),
      set(h, m) { setT(h * 60 + m, false); },
      setFace(id) { if (FACES[id] && id !== faceId) { faceId = id; draw(); } },
      setSnap(n) { snap = Math.max(1, n | 0 || 1); },
      setStyle(s) { style = s === 'us' ? 'us' : 'uk'; draw(); },
      showHands(on) { svg.classList.toggle('tt-nohands', !on); },   // Hide & reveal: hands (analogue) or the read-out (digital)
      live,
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      destroy() {
        live(false);
        listeners.clear();
        svg.remove();
      },
    };
  }

  const API = { words, parse, matches, traps, viHint, VI_TIPS, stepOf, random, FACES, clock, _num: num };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.TellingTime = API;
})(typeof window !== 'undefined' ? window : this);
