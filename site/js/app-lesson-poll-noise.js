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
const NOISE_SKIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-5"/></svg>';   // TEST: the pack's noise meter
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

  const skins = premiumSkins();
  const styles = (skins && skins.meter) ? NOISE_STYLES.concat(['skin']) : NOISE_STYLES;
  function styleKey(){
    const s = state.noiseMeter && state.noiseMeter.style;
    return styles.includes(s) ? s : (skins && skins.meter ? 'skin' : 'circle');
  }

  function stageMarkup(style){
    if(style === 'skin'){
      return `<div class="noise-stage skin">
        <div class="noise-skin"></div>
        <div class="noise-readout"><span class="noise-db">--</span> <span class="noise-unit">dB</span></div>
      </div>`;
    }
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
    const pickers = styles.map(k=> k === 'skin'
      ? `<button type="button" class="noise-style-btn${k===cur?' active':''}" data-style="skin" aria-pressed="${k===cur}" title="${skins.meter.name.en}" aria-label="${skins.meter.name.en}">${NOISE_SKIN_ICON}</button>`
      : `<button type="button" class="noise-style-btn${k===cur?' active':''}" data-style="${k}" aria-pressed="${k===cur}" title="${t('noise_style_'+k)}" aria-label="${t('noise_style_'+k)}" data-i18n-title="noise_style_${k}" data-i18n-aria="noise_style_${k}">${NOISE_ICONS[k]}</button>`
    ).join('');
    return `
      <div class="noise-wrap">
        <div class="noise-styles" role="group" aria-label="${t('noise_styles_label')}" data-i18n-aria="noise_styles_label">${pickers}<button type="button" class="skin-more" data-skin-more="meter" title="${t('ix_every_noise_meter')}">${t('ix_more')}</button></div>
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
    if(!styles.includes(style)) return;
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
    const skinBox = stage.querySelector('.noise-skin');
    if(skinBox && !skinBox._ctl) skinBox._ctl = StoreCore.mountMeter(skinBox, skins.meter);
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
    if(skinBox && skinBox._ctl) skinBox._ctl.set(pct / 100);
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
    running = true; tdBusy('noise', true);
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
    const accRgb = cs.getPropertyValue('--amber-hi-rgb').trim() || '245,184,92';   // polish phase 3: the theme's accent
    g.addColorStop(0, `rgba(${accRgb},0.28)`); g.addColorStop(1, `rgba(${accRgb},0)`);
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.arc(lastX, lastY, 3, 0, Math.PI*2); ctx.fillStyle = lineCol; ctx.fill();
  }

  function stop(){
    running = false; tdBusy('noise', false);
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
  if(styleKey()==='skin') showLevel(null, false);   // TEST: draw the pack meter before the mic starts

  return ()=>{ stop(); if(ro) ro.disconnect(); body.style.display = ''; body.style.flexDirection = ''; };
}

