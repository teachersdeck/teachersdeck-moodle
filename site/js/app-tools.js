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


