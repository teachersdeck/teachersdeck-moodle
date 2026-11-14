'use strict';
/* =========================================================
   Telling Time tile (phase 1, 14 Nov 2026). Scope: hq/docs/TELLING-TIME-SCOPE.md, section 6 "Tile".
   ---------------------------------------------------------
   ONE FILE IN EVERY APP THAT HAS THE TILE: teachersdeck/js/tellingtime-tile.js is the copy to edit; tools/check_shared.py
   keeps StudentDeck's copy identical (with js/tellingtime.js and css/tellingtime.css). Needs js/tellingtime.js first.

   The tile is free. Premium clock faces are Pro; the app says whether the user has Pro and how to buy it.

     TellingTimeTile.mount(body, {
       lang:    () => 'en' | 'vi' | …     the app's language for the buttons (anything but 'vi' shows English);
                                          the time itself is always English: that is the lesson
       isPro:   () => boolean             may this user pick a premium face?
       openPro: () => void                show the app's Pro dialog (a locked face was tapped)
       maxStep: 6                         KinderDeck: 2 (o'clock and half past only)
       faces:   null                      a list of face ids to offer (KinderDeck: ['basic']); null = all
     }) → cleanup()

   Settings (face, English style, level, what is hidden) are kept per device in localStorage 'tt_tile_v1'.
   Modes: Show (drag the hands), Now (the real time), Random (a new time, 3-2-1, then the answer).
   Hide & reveal: words, digits or hands, with a Reveal button; the next time hides them again.
   VI: one Vietnamese line, shown only when tapped, gone again at the next time.
   ========================================================= */
(function (root) {
  const TT = root.TellingTime;
  const PREF_KEY = 'tt_tile_v1';

  const S = {
    en: {
      show: 'Show', now: 'Now', random: 'Random', new_time: 'New time', reveal: 'Reveal', speak: 'Say it',
      vi: 'Vietnamese hint', hide: 'Hide', h_words: 'Words', h_digits: 'Digits', h_hands: 'Hands',
      settings: 'Settings', full: 'Full screen', english: 'English', uk: 'British', us: 'American', level: 'Level',
      face: 'Clock face', pro: 'Pro', locked: 'Pro face', modes: 'Mode',
      steps: ["O'clock", 'Half past', 'Quarter past / to', 'Five minutes', 'Any minute', 'Times of day'],
      faces: { basic: 'Basic', minutes: 'Minutes ring', pastto: 'Past & to', quarters: '12 · 3 · 6 · 9', none: 'No numbers',
        roman: 'Roman', chalk: 'Chalkboard', wood: 'Wooden', space: 'Space', lcd12: 'Digital', h24: '24-hour', flip: 'Flip clock', words: 'Words' },
    },
    vi: {
      show: 'Kéo kim', now: 'Bây giờ', random: 'Ngẫu nhiên', new_time: 'Giờ mới', reveal: 'Hiện đáp án', speak: 'Đọc to',
      vi: 'Gợi ý tiếng Việt', hide: 'Ẩn', h_words: 'Chữ', h_digits: 'Số', h_hands: 'Kim',
      settings: 'Cài đặt', full: 'Toàn màn hình', english: 'Tiếng Anh', uk: 'Anh-Anh', us: 'Anh-Mỹ', level: 'Cấp độ',
      face: 'Mặt đồng hồ', pro: 'Pro', locked: 'Mặt đồng hồ Pro', modes: 'Chế độ',
      steps: ['Giờ đúng', 'Giờ rưỡi', 'Hơn / kém 15', 'Từng 5 phút', 'Từng phút', 'Sáng / chiều / tối'],
      faces: { basic: 'Cơ bản', minutes: 'Vòng phút', pastto: 'Hơn & kém', quarters: '12 · 3 · 6 · 9', none: 'Không số',
        roman: 'Số La Mã', chalk: 'Bảng phấn', wood: 'Gỗ', space: 'Vũ trụ', lcd12: 'Điện tử', h24: '24 giờ', flip: 'Lật số', words: 'Bằng chữ' },
    },
  };
  const SNAP = { 1: 60, 2: 30, 3: 15, 4: 5 };

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private window: settings just aren't kept */ }
  }

  function mount(body, o) {
    o = o || {};
    const lang = () => (typeof o.lang === 'function' && /^vi/.test(o.lang() || '') ? 'vi' : 'en');
    const L = k => S[lang()][k];
    const isPro = () => (typeof o.isPro === 'function' ? !!o.isPro() : true);
    const maxStep = Math.max(1, Math.min(6, o.maxStep || 6));
    const faceIds = Object.keys(TT.FACES).filter(id => !o.faces || o.faces.includes(id));

    const saved = loadPrefs();
    const p = {
      face: faceIds.includes(saved.face) ? saved.face : 'basic',
      style: saved.style === 'us' ? 'us' : 'uk',
      step: Math.min(maxStep, Math.max(1, saved.step | 0 || Math.min(3, maxStep))),
      hide: Object.assign({ words: false, digits: false, hands: false }, saved.hide || {}),
    };
    if (TT.FACES[p.face].pro && !isPro()) p.face = 'basic';
    const keep = () => savePrefs(p);

    const uid = Math.random().toString(36).slice(2, 8);   // a unique id for the level <label>, two tiles could be open
    let mode = 'show', revealed = false, counting = 0, countTimer = null, viOpen = false, settingsOpen = false;

    body.innerHTML = `
      <div class="tt-tile">
        <div class="tt-bar">
          <div class="tt-modes" role="group">
            <button type="button" class="tt-btn" data-mode="show"></button>
            <button type="button" class="tt-btn" data-mode="now"></button>
            <button type="button" class="tt-btn" data-mode="random"></button>
          </div>
          <span class="tt-spacer"></span>
          <button type="button" class="tt-btn tt-ico" data-a="settings" aria-expanded="false">⚙</button>
          <button type="button" class="tt-btn tt-ico" data-a="full">⛶</button>
        </div>
        <div class="tt-settings" hidden></div>
        <div class="tt-stage"><div class="tt-clockbox"></div><div class="tt-count" hidden aria-live="assertive"></div></div>
        <div class="tt-read" aria-live="polite">
          <div class="tt-num"></div>
          <div class="tt-words" lang="en"></div>
          <div class="tt-dwords" lang="en"></div>
          <div class="tt-vi" lang="vi" hidden></div>
        </div>
        <div class="tt-actions">
          <button type="button" class="tt-btn" data-a="speak">🔊 <span></span></button>
          <button type="button" class="tt-btn tt-vibtn" data-a="vi" aria-pressed="false">VI</button>
          <button type="button" class="tt-btn tt-primary" data-a="new" hidden></button>
          <button type="button" class="tt-btn tt-primary" data-a="reveal" hidden></button>
        </div>
        <div class="tt-hide" role="group">
          <span class="tt-hide-l"></span>
          <button type="button" class="tt-btn tt-chip" data-hide="words" aria-pressed="false"></button>
          <button type="button" class="tt-btn tt-chip" data-hide="digits" aria-pressed="false"></button>
          <button type="button" class="tt-btn tt-chip" data-hide="hands" aria-pressed="false"></button>
        </div>
      </div>`;
    const $ = s => body.querySelector(s);
    const tile = $('.tt-tile'), box = $('.tt-clockbox'), countEl = $('.tt-count'), settingsEl = $('.tt-settings');
    const numEl = $('.tt-num'), wordsEl = $('.tt-words'), dwordsEl = $('.tt-dwords'), viEl = $('.tt-vi');

    const clock = TT.clock(box, { face: p.face, h: 15, m: 45, style: p.style, snap: SNAP[p.step] || 1, label: 'Telling Time' });
    snapToStep();

    function snapToStep() {
      const s = SNAP[p.step] || 1, { h, m } = clock.get();
      let t = Math.round((h * 60 + m) / s) * s;
      clock.setSnap(s);
      clock.set(Math.floor(t / 60) % 24, t % 60);
    }

    function wordsOpts(extra) { return Object.assign({ style: p.style, day: p.step >= 6 ? 'words' : false }, extra); }

    function masked(k) { return (p.hide[k] && !revealed) || (counting && k !== 'hands'); }

    function paint() {
      const { h, m } = clock.get();
      const h12 = h % 12 || 12, mm = String(m).padStart(2, '0');
      numEl.textContent = masked('digits') ? '?:??' : (p.step >= 6 ? `${h12}:${mm} ${h < 12 ? 'a.m.' : 'p.m.'}` : `${h12}:${mm}`);
      wordsEl.textContent = masked('words') ? '? ? ?' : TT.words(h, m, wordsOpts());
      dwordsEl.textContent = masked('words') ? '' : TT.words(h, m, wordsOpts({ form: 'digital' }));
      [numEl, wordsEl].forEach(e => e.classList.toggle('tt-masked', e.textContent.startsWith('?')));
      clock.showHands(!masked('hands'));
      viEl.hidden = !viOpen;
      if (viOpen) viEl.textContent = TT.viHint(h, m, { style: p.style });
      $('[data-a=vi]').setAttribute('aria-pressed', String(viOpen));
      const anyHidden = !revealed && (p.hide.words || p.hide.digits || p.hide.hands);
      $('[data-a=reveal]').hidden = !(anyHidden && !counting);
      $('[data-a=new]').hidden = mode !== 'random';
    }

    function label() {
      body.querySelectorAll('[data-mode]').forEach(b => {
        b.textContent = L(b.dataset.mode);
        b.classList.toggle('on', b.dataset.mode === mode);
        b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      });
      $('.tt-modes').setAttribute('aria-label', L('modes'));
      $('[data-a=settings]').title = $('[data-a=settings]').ariaLabel = L('settings');
      $('[data-a=full]').title = $('[data-a=full]').ariaLabel = L('full');
      $('[data-a=speak] span').textContent = L('speak');
      $('[data-a=vi]').title = L('vi');
      $('[data-a=new]').textContent = '🎲 ' + L('new_time');
      $('[data-a=reveal]').textContent = '👁 ' + L('reveal');
      $('.tt-hide-l').textContent = L('hide') + ':';
      body.querySelectorAll('[data-hide]').forEach(b => {
        b.textContent = L('h_' + b.dataset.hide);
        b.classList.toggle('on', !!p.hide[b.dataset.hide]);
        b.setAttribute('aria-pressed', String(!!p.hide[b.dataset.hide]));
      });
      if (settingsOpen) drawSettings();
      paint();
    }

    function drawSettings() {
      const pro = isPro();
      settingsEl.innerHTML = `
        <div class="tt-row"><span>${L('english')}</span>
          <button type="button" class="tt-btn${p.style === 'uk' ? ' on' : ''}" data-style="uk" aria-pressed="${p.style === 'uk'}">🇬🇧 ${L('uk')}</button>
          <button type="button" class="tt-btn${p.style === 'us' ? ' on' : ''}" data-style="us" aria-pressed="${p.style === 'us'}">🇺🇸 ${L('us')}</button></div>
        <div class="tt-row"><label for="tt-step-${uid}">${L('level')}</label>
          <select id="tt-step-${uid}" class="tt-select">${L('steps').slice(0, maxStep).map((s, i) =>
            `<option value="${i + 1}"${p.step === i + 1 ? ' selected' : ''}>${i + 1}. ${s}</option>`).join('')}</select></div>
        ${faceIds.length > 1 ? `<div class="tt-row tt-row-top"><span>${L('face')}</span><div class="tt-faces"></div></div>` : ''}`;
      const grid = settingsEl.querySelector('.tt-faces');
      if (grid) {
        faceIds.forEach(id => {
          const lockedFace = TT.FACES[id].pro && !pro;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tt-face' + (id === p.face ? ' on' : '') + (lockedFace ? ' locked' : '');
          b.dataset.face = id;
          b.setAttribute('aria-pressed', String(id === p.face));
          b.title = lockedFace ? `${L('faces')[id]} — ${L('locked')}` : L('faces')[id];
          grid.appendChild(b);
          const mini = TT.clock(b, { face: id, h: 10, m: 10, style: p.style, interactive: false });
          mini.svg.setAttribute('aria-hidden', 'true');
          const cap = document.createElement('span');
          cap.textContent = L('faces')[id];
          b.appendChild(cap);
          if (TT.FACES[id].pro) {
            const tag = document.createElement('em');
            tag.textContent = lockedFace ? '🔒 ' + L('pro') : L('pro');
            b.appendChild(tag);
          }
        });
      }
    }

    function setMode(m) {
      stopCount();
      const wasNow = mode === 'now';
      mode = m;
      clock.live(m === 'now');
      if (wasNow && m === 'show') snapToStep();   // the real time may be off the level's grid (12:43 at "o'clock")
      revealed = false;
      viOpen = false;
      if (m === 'random') newTime();
      label();
    }

    function stopCount() { if (countTimer) { clearInterval(countTimer); countTimer = null; } counting = 0; countEl.hidden = true; }

    function newTime() {
      stopCount();
      const r = TT.random(p.step);
      clock.set(r.h, r.m);
      revealed = false;
      viOpen = false;
      counting = 3;
      countEl.hidden = false;
      countEl.textContent = '3';
      paint();
      countTimer = setInterval(() => {
        counting--;
        if (counting > 0) { countEl.textContent = String(counting); return; }
        stopCount();   // what the teacher chose to hide stays hidden until Reveal
        paint();
        if (!p.hide.words) speak();
      }, 1000);
    }

    let voices = [];
    const loadVoices = () => { try { voices = root.speechSynthesis ? root.speechSynthesis.getVoices() : []; } catch (e) { voices = []; } };
    loadVoices();
    if (root.speechSynthesis) root.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    function speak() {
      const syn = root.speechSynthesis;
      if (!syn || typeof SpeechSynthesisUtterance === 'undefined') return;
      const { h, m } = clock.get();
      const u = new SpeechSynthesisUtterance("It's " + TT.words(h, m, wordsOpts()));
      const want = p.style === 'us' ? 'en-us' : 'en-gb';
      const norm = v => String(v.lang || '').replace('_', '-').toLowerCase();
      u.voice = voices.find(v => norm(v) === want) || voices.find(v => norm(v).startsWith('en')) || null;
      u.lang = p.style === 'us' ? 'en-US' : 'en-GB';
      u.rate = 0.9;
      syn.cancel();
      syn.speak(u);
    }

    const offChange = clock.onChange(() => {
      if (mode !== 'now') { revealed = false; viOpen = false; }
      paint();
    });

    function onClick(e) {
      const b = e.target.closest('button');
      if (!b || !body.contains(b)) return;
      if (b.dataset.mode) { if (b.dataset.mode !== mode) setMode(b.dataset.mode); return; }
      if (b.dataset.hide) { const k = b.dataset.hide; p.hide[k] = !p.hide[k]; revealed = false; keep(); label(); return; }
      if (b.dataset.style) { p.style = b.dataset.style; clock.setStyle(p.style); keep(); label(); return; }
      if (b.dataset.face) {
        const id = b.dataset.face;
        if (TT.FACES[id].pro && !isPro()) { if (typeof o.openPro === 'function') o.openPro(); return; }
        p.face = id; clock.setFace(id); keep(); label(); return;
      }
      switch (b.dataset.a) {
        case 'speak': speak(); break;
        case 'vi': viOpen = !viOpen; paint(); break;
        case 'new': newTime(); break;
        case 'reveal': revealed = true; paint(); if (p.hide.words) speak(); break;
        case 'settings':
          settingsOpen = !settingsOpen;
          settingsEl.hidden = !settingsOpen;
          b.setAttribute('aria-expanded', String(settingsOpen));
          b.classList.toggle('on', settingsOpen);
          if (settingsOpen) drawSettings(); else settingsEl.innerHTML = '';
          break;
        case 'full':
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else if (tile.requestFullscreen) tile.requestFullscreen().catch(() => {});
          break;
      }
    }
    function onChangeSel(e) {
      if (!e.target.classList.contains('tt-select')) return;
      p.step = Math.min(maxStep, Math.max(1, e.target.value | 0));
      keep();
      snapToStep();
      if (mode === 'random') newTime();
      paint();
    }
    body.addEventListener('click', onClick);
    body.addEventListener('change', onChangeSel);

    label();
    // Both apps say their language on <html lang>: follow a switch without reopening the tile.
    const langWatch = typeof MutationObserver === 'function' ? new MutationObserver(label) : null;
    if (langWatch) langWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

    return function cleanup() {
      if (langWatch) langWatch.disconnect();
      stopCount();
      offChange();
      body.removeEventListener('click', onClick);
      body.removeEventListener('change', onChangeSel);
      if (root.speechSynthesis) { root.speechSynthesis.removeEventListener('voiceschanged', loadVoices); try { root.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
      if (document.fullscreenElement === tile) document.exitFullscreen().catch(() => {});
      clock.destroy();
      body.innerHTML = '';
    };
  }

  root.TellingTimeTile = { mount, STRINGS: S };
})(window);
