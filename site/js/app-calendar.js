/* ---------------- Lunar calendar conversion (Vietnamese/Chinese lunisolar, UTC+7) ---------------- */
const LUNAR_TZ = 7;
function INT(d){ return Math.floor(d); }

function jdFromDate(dd, mm, yy){
  const a = INT((14-mm)/12);
  const y = yy + 4800 - a;
  const m = mm + 12*a - 3;
  let jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - INT(y/100) + INT(y/400) - 32045;
  if(jd < 2299161){
    jd = dd + INT((153*m+2)/5) + 365*y + INT(y/4) - 32083;
  }
  return jd;
}

function NewMoon(k){
  const T = k/1236.85, T2 = T*T, T3 = T2*T, dr = Math.PI/180;
  let Jd1 = 2415020.75933 + 29.53058868*k + 0.0001178*T2 - 0.000000155*T3;
  Jd1 += 0.00033*Math.sin((166.56+132.87*T-0.009173*T2)*dr);
  const M = 359.2242 + 29.10535608*k - 0.0000333*T2 - 0.00000347*T3;
  const Mpr = 306.0253 + 385.81691806*k + 0.0107306*T2 + 0.00001236*T3;
  const F = 21.2964 + 390.67050646*k - 0.0016528*T2 - 0.00000239*T3;
  let C1 = (0.1734-0.000393*T)*Math.sin(M*dr) + 0.0021*Math.sin(2*dr*M);
  C1 -= 0.4068*Math.sin(Mpr*dr) + 0.0161*Math.sin(dr*2*Mpr);
  C1 -= 0.0004*Math.sin(dr*3*Mpr);
  C1 += 0.0104*Math.sin(dr*2*F) - 0.0051*Math.sin(dr*(M+Mpr));
  C1 -= 0.0074*Math.sin(dr*(M-Mpr)) + 0.0004*Math.sin(dr*(2*F+M));
  C1 -= 0.0004*Math.sin(dr*(2*F-M)) - 0.0006*Math.sin(dr*(2*F+Mpr));
  C1 += 0.0010*Math.sin(dr*(2*F-Mpr)) + 0.0005*Math.sin(dr*(2*Mpr+M));
  let deltaT;
  if(T < -11) deltaT = 0.001 + 0.000839*T + 0.0002261*T2 - 0.00000845*T3 - 0.000000081*T*T3;
  else deltaT = -0.000278 + 0.000265*T + 0.000262*T2;
  return Jd1 + C1 - deltaT;
}

function sunLongitude(jdn){
  const T = (jdn - 2451545.0)/36525, T2 = T*T, dr = Math.PI/180;
  const M = 357.52910 + 35999.05030*T - 0.0001559*T2 - 0.00000048*T*T2;
  const L0 = 280.46645 + 36000.76983*T + 0.0003032*T2;
  let DL = (1.914600-0.004817*T-0.000014*T2)*Math.sin(dr*M);
  DL += (0.019993-0.000101*T)*Math.sin(dr*2*M) + 0.000290*Math.sin(dr*3*M);
  let L = (L0+DL)*dr;
  L -= Math.PI*2*INT(L/(Math.PI*2));
  return L;
}

function getSunLongitude(dayNumber, tz){ return INT(sunLongitude(dayNumber - 0.5 - tz/24) / Math.PI * 6); }
function getNewMoonDay(k, tz){ return INT(NewMoon(k) + 0.5 + tz/24); }

function getLunarMonth11(yy, tz){
  const off = jdFromDate(31,12,yy) - 2415021;
  const k = INT(off/29.530588853);
  let nm = getNewMoonDay(k, tz);
  if(getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k-1, tz);
  return nm;
}

function getLeapMonthOffset(a11, tz){
  const k = INT((a11 - 2415021.076998695)/29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = getSunLongitude(getNewMoonDay(k+i, tz), tz);
  do{
    last = arc; i++;
    arc = getSunLongitude(getNewMoonDay(k+i, tz), tz);
  } while(arc !== last && i < 14);
  return i-1;
}

function convertSolar2Lunar(dd, mm, yy, tz){
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = INT((dayNumber - 2415021.076998695)/29.530588853);
  let monthStart = getNewMoonDay(k+1, tz);
  if(monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  let a11 = getLunarMonth11(yy, tz);
  let b11 = a11;
  let lunarYear;
  if(a11 >= monthStart){ lunarYear = yy; a11 = getLunarMonth11(yy-1, tz); }
  else { lunarYear = yy+1; b11 = getLunarMonth11(yy+1, tz); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = INT((monthStart - a11)/29);
  let lunarLeap = 0, lunarMonth = diff + 11;
  if(b11 - a11 > 365){
    const leapOff = getLeapMonthOffset(a11, tz);
    if(diff >= leapOff){ lunarMonth = diff + 10; if(diff === leapOff) lunarLeap = 1; }
  }
  if(lunarMonth > 12) lunarMonth -= 12;
  if(lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day:lunarDay, month:lunarMonth, year:lunarYear, leap: lunarLeap===1 };
}

function lunarOf(dateObj){
  return convertSolar2Lunar(dateObj.getDate(), dateObj.getMonth()+1, dateObj.getFullYear(), LUNAR_TZ);
}
function lunarShortLabel(dateObj){
  const l = lunarOf(dateObj);
  return `${l.day}/${l.month}${l.leap ? t('leap_suffix') : ''}`;
}
function lunarFullLabel(dateObj){
  const l = lunarOf(dateObj);
  return `${t('lunar_prefix')} ${l.day}/${l.month}${l.leap ? ' '+t('leap_suffix') : ''}`;
}

/* ---------------- Calendar helpers ---------------- */
function pad2(n){ return String(n).padStart(2,'0'); }
function isoDate(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }
function todayISO(){ const d = new Date(); return isoDate(d.getFullYear(), d.getMonth()+1, d.getDate()); }

function buildGoogleCalUrl(ev){
  let datesParam;
  if(ev.time){
    const start = new Date(`${ev.date}T${ev.time}:00`);
    const end = new Date(start.getTime() + (Math.max(1, +ev.duration || 60))*60000);   // lessons carry their own length
    const fmt = d => `${d.getUTCFullYear()}${pad2(d.getUTCMonth()+1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`;
    datesParam = `${fmt(start)}/${fmt(end)}`;
  } else {
    const start = new Date(`${ev.date}T00:00:00`);
    const end = new Date(start.getTime() + 24*3600000);
    const fmtDate = d => `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
    datesParam = `${fmtDate(start)}/${fmtDate(end)}`;
  }
  const params = new URLSearchParams({ action:'TEMPLATE', text: ev.title || '', dates: datesParam, details: ev.notes || '' });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function unescapeICS(s){ return (s||'').replace(/\\n/gi,' ').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\'); }

function parseICSDate(value, rawKey){
  const isAllDay = /VALUE=DATE/i.test(rawKey) || !/T/.test(value);
  const m = value.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if(!m) return { date: todayISO(), time:'' };
  const [, y, mo, d, hh, mi, ss, z] = m;
  if(isAllDay || !hh) return { date:`${y}-${mo}-${d}`, time:'' };
  if(z){
    const utc = new Date(Date.UTC(+y, +mo-1, +d, +hh, +mi, +(ss||0)));
    return { date: isoDate(utc.getFullYear(), utc.getMonth()+1, utc.getDate()), time:`${pad2(utc.getHours())}:${pad2(utc.getMinutes())}` };
  }
  return { date:`${y}-${mo}-${d}`, time:`${hh}:${mi}` };
}

function parseICS(text){
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  rawLines.forEach(line=>{
    if(/^[ \t]/.test(line) && lines.length) lines[lines.length-1] += line.slice(1);
    else lines.push(line);
  });
  const events = [];
  let cur = null;
  lines.forEach(line=>{
    if(/^BEGIN:VEVENT/.test(line)){ cur = {}; }
    else if(/^END:VEVENT/.test(line)){ if(cur && cur.date) events.push(cur); cur = null; }
    else if(cur){
      const idx = line.indexOf(':');
      if(idx < 0) return;
      const rawKey = line.slice(0, idx);
      const value = line.slice(idx+1);
      const key = rawKey.split(';')[0].toUpperCase();
      if(key === 'SUMMARY') cur.title = unescapeICS(value);
      else if(key === 'DESCRIPTION') cur.notes = unescapeICS(value);
      else if(key === 'DTSTART'){
        const parsed = parseICSDate(value, rawKey);
        cur.date = parsed.date; cur.time = parsed.time;
      }
    }
  });
  return events;
}

const REMINDER_OPTIONS = [
  { value:'none', key:'cal_rem_none' },
  { value:'at',   key:'cal_rem_at' },
  { value:'5',    key:'cal_rem_5' },
  { value:'15',   key:'cal_rem_15' },
  { value:'30',   key:'cal_rem_30' },
  { value:'60',   key:'cal_rem_60' }
];

function renderCalendar(body){
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = todayISO();
  let mode = 'calendar';
  let editingId = null;

  function eventsOn(dateStr){
    return state.calendarEvents.filter(e=>e.date===dateStr).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  }

  function draw(){
    body.innerHTML = mode === 'manage' ? manageMarkup() : calendarMarkup();
    if(mode === 'manage') wireManage(); else wireCalendar();
  }

  function calendarMarkup(){
    const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(LOCALE_MAP[state.lang]||'en-US', { month:'long', year:'numeric' });
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
    const weekdayFmt = new Intl.DateTimeFormat(LOCALE_MAP[state.lang]||'en-US', { weekday:'narrow' });
    let weekdayRow = '';
    for(let i=0;i<7;i++){ weekdayRow += `<span>${weekdayFmt.format(new Date(2023,0,1+i))}</span>`; }

    let cells = '';
    for(let i=0;i<firstDow;i++) cells += `<button class="cal-cell empty" disabled></button>`;
    const showLunar = state.calendarSystem === 'lunar' || state.calendarSystem === 'both';
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = isoDate(viewYear, viewMonth+1, d);
      const hasEvents = eventsOn(dateStr).length > 0;
      const isToday = dateStr === todayISO();
      const isSel = dateStr === selectedDate;
      const lunarTag = showLunar ? `<span class="cal-lunar-day">${lunarShortLabel(new Date(viewYear, viewMonth, d))}</span>` : '';
      cells += `<button class="cal-cell${isToday?' today':''}${isSel?' selected':''}" data-date="${dateStr}">${d}${lunarTag}${hasEvents?'<span class="cal-dot"></span>':''}</button>`;
    }

    const dayEvents = eventsOn(selectedDate);
    let dayLabel = new Date(selectedDate+'T00:00:00').toLocaleDateString(LOCALE_MAP[state.lang]||'en-US', { weekday:'long', month:'long', day:'numeric' });
    if(state.calendarSystem === 'lunar'){
      dayLabel = lunarFullLabel(new Date(selectedDate+'T00:00:00'));
    } else if(state.calendarSystem === 'both'){
      dayLabel += ` · ${lunarFullLabel(new Date(selectedDate+'T00:00:00'))}`;
    }
    const listHtml = dayEvents.length
      ? dayEvents.map(ev=>`
          <li class="cal-ev-row" data-id="${ev.id}">
            ${ev.time ? `<span class="cal-ev-time">${ev.time}</span>` : ''}
            <span class="cal-ev-title"></span>
            <button class="cal-ev-edit" aria-label="${t('cal_edit_event')}">${iconSvg('settings','wsvg')}</button>
            <button class="cal-ev-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
          </li>`).join('')
      : `<li class="file-empty" data-i18n="cal_no_events">${t('cal_no_events')}</li>`;

    return `
      <div class="cal-head">
        <button class="cal-nav" id="cal-prev">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month"></span>
        <button class="cal-nav" id="cal-next">${iconSvg('chevronRight','wsvg')}</button>
        <button class="cal-gear" id="cal-gear" aria-label="${t('cal_manage')}">${iconSvg('settings','wsvg')}</button>
      </div>
      <div class="cal-weekdays">${weekdayRow}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-day-head">
        <span class="cal-day-label"></span>
        <button class="cal-add-inline" id="cal-add-inline" aria-label="${t('cal_add_event')}">${iconSvg('plus','wsvg')}</button>
      </div>
      <ul class="cal-ev-list">${listHtml}</ul>
    `.replace('<span class="cal-month"></span>', `<span class="cal-month">${monthLabel}</span>`)
     .replace('<span class="cal-day-label"></span>', `<span class="cal-day-label">${dayLabel}</span>`);
  }

  function wireCalendar(){
    // fill event titles safely (avoid HTML injection from user text via innerHTML above)
    body.querySelectorAll('.cal-ev-row').forEach(row=>{
      const ev = state.calendarEvents.find(e=>e.id===row.dataset.id);
      if(ev) row.querySelector('.cal-ev-title').textContent = (ev.type==='assignment' ? '📘 ' : ev.type==='progress-report' ? '📈 ' : '') + (ev.title || t('cal_untitled'));
    });
    body.querySelector('#cal-prev').addEventListener('click', ()=>{
      viewMonth--; if(viewMonth<0){ viewMonth=11; viewYear--; } draw();
    });
    body.querySelector('#cal-next').addEventListener('click', ()=>{
      viewMonth++; if(viewMonth>11){ viewMonth=0; viewYear++; } draw();
    });
    body.querySelector('#cal-gear').addEventListener('click', ()=>{ mode='manage'; editingId=null; draw(); });
    body.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
      cell.addEventListener('click', ()=>{ selectedDate = cell.dataset.date; draw(); });
    });
    body.querySelector('#cal-add-inline').addEventListener('click', ()=>{
      mode='manage'; editingId=null; draw();
    });
    body.querySelectorAll('.cal-ev-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        editingId = btn.closest('.cal-ev-row').dataset.id;
        mode = 'manage'; draw();
      });
    });
    body.querySelectorAll('.cal-ev-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-ev-row').dataset.id;
        state.calendarEvents = state.calendarEvents.filter(e=>e.id!==id);
        saveState(); draw();
      });
    });
  }

  function manageMarkup(){
    const editing = editingId ? state.calendarEvents.find(e=>e.id===editingId) : null;
    const f = editing || { title:'', date:selectedDate, time:'', reminder:'none', notes:'' };
    const allEvents = [...state.calendarEvents].sort((a,b)=> (a.date+a.time).localeCompare(b.date+b.time));
    const allHtml = allEvents.length
      ? allEvents.map(ev=>`
          <li class="cal-all-row" data-id="${ev.id}">
            <div class="cal-all-meta">
              <span class="cal-all-date">${ev.date}${ev.time ? ' · '+ev.time : ''}</span>
              <span class="cal-all-title"></span>
            </div>
            <button class="cal-all-google" title="${t('cal_add_to_google')}">${iconSvg('calendar','wsvg')}</button>
            <button class="cal-all-edit" aria-label="${t('cal_edit_event')}">${iconSvg('settings','wsvg')}</button>
            <button class="cal-all-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
          </li>`).join('')
      : `<li class="file-empty" data-i18n="cal_none_yet">${t('cal_none_yet')}</li>`;

    return `
      <div class="cal-head">
        <button class="cal-nav" id="cal-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month" data-i18n="cal_manage">${t('cal_manage')}</span>
      </div>
      <form class="cal-form" id="cal-form">
        <label class="cal-field">
          <span data-i18n="cal_title">${t('cal_title')}</span>
          <input type="text" id="cf-title" value="${escHtml(f.title||'')}" maxlength="60">
        </label>
        <div class="cal-field-row">
          <label class="cal-field">
            <span data-i18n="cal_date">${t('cal_date')}</span>
            <input type="date" id="cf-date" value="${f.date}">
          </label>
          <label class="cal-field">
            <span data-i18n="cal_time">${t('cal_time')}</span>
            <input type="time" id="cf-time" value="${f.time||''}">
          </label>
        </div>
        <label class="cal-field" id="cf-reminder-wrap" ${f.time ? '' : 'hidden'}>
          <span data-i18n="cal_reminder">${t('cal_reminder')}</span>
          <select id="cf-reminder">
            ${REMINDER_OPTIONS.map(o=>`<option value="${o.value}" ${((f.reminder||'none')===o.value)?'selected':''}>${t(o.key)}</option>`).join('')}
          </select>
        </label>
        <label class="cal-field">
          <span data-i18n="cal_notes">${t('cal_notes')}</span>
          <textarea id="cf-notes" rows="2">${escHtml(f.notes||'')}</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="wbtn primary" data-i18n="cal_save">${t('cal_save')}</button>
          <button type="button" class="wbtn" id="cf-cancel" data-i18n="cal_cancel">${t('cal_cancel')}</button>
        </div>
      </form>

      <p class="drawer-label" style="margin-top:14px" data-i18n="cal_all_events">${t('cal_all_events')}</p>
      <ul class="cal-all-list">${allHtml}</ul>

      <p class="drawer-label" style="margin-top:14px" data-i18n="cal_import_ics">${t('cal_import_ics')}</p>
      <p class="dock-vis-hint" data-i18n="cal_import_hint">${t('cal_import_hint')}</p>
      <label class="file-drop" for="cf-ics"><span class="file-drop-btn" aria-hidden="true">+</span><span class="file-drop-text">${t('cal_import_ics')}</span></label>
      <input type="file" id="cf-ics" accept=".ics,text/calendar" hidden>

      <button class="ghost-btn" id="cf-notif" style="margin-top:14px" data-i18n="cal_enable_notifs">${t('cal_enable_notifs')}</button>
    `;
  }

  function wireManage(){
    body.querySelectorAll('.cal-all-row').forEach(row=>{
      const ev = state.calendarEvents.find(e=>e.id===row.dataset.id);
      if(ev) row.querySelector('.cal-all-title').textContent = (ev.type==='assignment' ? '📘 ' : ev.type==='progress-report' ? '📈 ' : '') + (ev.title || t('cal_untitled'));
    });
    body.querySelector('#cal-back').addEventListener('click', ()=>{ mode='calendar'; editingId=null; draw(); });

    const timeInput = body.querySelector('#cf-time');
    const remWrap = body.querySelector('#cf-reminder-wrap');
    timeInput.addEventListener('input', ()=>{ remWrap.hidden = !timeInput.value; });

    body.querySelector('#cf-cancel').addEventListener('click', ()=>{ mode='calendar'; editingId=null; draw(); });

    body.querySelector('#cal-form').addEventListener('submit', e=>{
      e.preventDefault();
      const title = body.querySelector('#cf-title').value.trim();
      const date = body.querySelector('#cf-date').value || selectedDate;
      const time = timeInput.value || '';
      const reminder = time ? body.querySelector('#cf-reminder').value : 'none';
      const notes = body.querySelector('#cf-notes').value.trim();
      if(editingId){
        const ev = state.calendarEvents.find(x=>x.id===editingId);
        if(ev){ ev.title=title; ev.date=date; ev.time=time; ev.reminder=reminder; ev.notes=notes; ev.fired=false; }
      } else {
        state.calendarEvents.push({ id:cid(), title, date, time, reminder, notes, fired:false });
        track('event', title);
      }
      saveState();
      selectedDate = date;
      mode = 'calendar'; editingId = null;
      draw();
    });

    body.querySelectorAll('.cal-all-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{ editingId = btn.closest('.cal-all-row').dataset.id; draw(); });
    });
    body.querySelectorAll('.cal-all-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        state.calendarEvents = state.calendarEvents.filter(e=>e.id!==id);
        if(editingId===id) editingId=null;
        saveState(); draw();
      });
    });
    body.querySelectorAll('.cal-all-google').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        const ev = state.calendarEvents.find(e=>e.id===id);
        if(ev) window.open(buildGoogleCalUrl(ev), '_blank');
      });
    });

    body.querySelector('#cf-ics').addEventListener('change', async e=>{
      const file = e.target.files[0];
      if(!file) return;
      const text = window.Watermark ? Watermark.strip(await file.text()) : await file.text();   // a watermarked export re-imports cleanly
      const imported = parseICS(text);
      imported.forEach(ev=>{
        state.calendarEvents.push({ id:cid(), title:ev.title||'', date:ev.date, time:ev.time||'', reminder:'none', notes:ev.notes||'', fired:false });
      });
      saveState();
      e.target.value = '';
      toast(t('cal_import_done', { n: imported.length }));
      draw();
    });

    body.querySelector('#cf-notif').addEventListener('click', ()=>{
      if(!('Notification' in window)){ return; }
      Notification.requestPermission().then(perm=>{
        if(perm === 'granted'){ state.notifsEnabled = true; saveState(); toast(t('cal_notifs_on')); }
        else { state.notifsEnabled = false; saveState(); toast(t('cal_notifs_denied')); }
      });
    });
  }

  draw();

  // Other widgets (the Lesson Planner) add events — show them straight away,
  // unless the event form is open, which a redraw would wipe.
  const onExternalChange = ()=>{ if(mode === 'calendar') draw(); };
  document.addEventListener('td:calendar-changed', onExternalChange);
  return ()=> document.removeEventListener('td:calendar-changed', onExternalChange);
}

/* =========================================================
   Assignments — create homework, push it to the class, and
   keep it mirrored into the canonical Calendar (state.calendarEvents,
   event id `assign-<assignmentId>`) so a due date only ever has to be
   set in one place. Pushing to students/parents happens the same way
   the Calendar already does: saveState() -> TDCloud.syncHomework(),
   which mirrors state.assignments up to classes/{id}/homework, read by
   StudentDeck's Homework To-Do widget and ParentDeck's Homework widget.
   ========================================================= */
function upsertAssignmentEvent(asg){
  const evId = 'assign-'+asg.id;
  state.calendarEvents = state.calendarEvents.filter(e=>e.id!==evId);
  if(asg.dueDate){
    state.calendarEvents.push({
      id: evId,
      title: (asg.subject ? `[${asg.subject}] ` : '') + (asg.title || t('cal_untitled')),
      date: asg.dueDate,
      time: asg.dueTime || '',
      reminder: asg.dueTime ? 'at' : 'none',
      notes: asg.instructions || '',
      type: 'assignment',
      assignmentId: asg.id,
      fired: false
    });
  }
}
function removeAssignmentEvent(assignmentId){
  state.calendarEvents = state.calendarEvents.filter(e=>e.id!=='assign-'+assignmentId);
}
function notifyCalendarChanged(){ document.dispatchEvent(new CustomEvent('td:calendar-changed')); }

// Adds n calendar months to an ISO date string, clamping to the last real day of the
// target month when the original day doesn't exist there (e.g. Jan 31 + 1 month -> Feb 28/29,
// not an invalid "Feb 31" or a silent rollover into March). Used by the Progress Reports
// widget's monthly cadence — the only one of its three frequencies that isn't a fixed
// number of days, so it can't just add n*86400000ms like weekly/bi-weekly do.
function addMonthsISO(dateStr, n){
  const [y,m,d] = dateStr.split('-').map(Number);
  const targetMonthFirst = new Date(y, (m-1)+n, 1);
  const lastDay = new Date(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth()+1, 0).getDate();
  return isoDate(targetMonthFirst.getFullYear(), targetMonthFirst.getMonth()+1, Math.min(d, lastDay));
}

function renderAssignments(body){
  let mode = 'list';
  let editingId = null;

  function draw(){
    body.innerHTML = mode === 'form' ? formMarkup() : listMarkup();
    if(mode === 'form') wireForm(); else wireList();
  }

  function listMarkup(){
    const rows = [...state.assignments].sort((a,b)=> (a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    const listHtml = rows.length ? rows.map(a=>`
      <li class="cal-all-row" data-id="${a.id}">
        <div class="cal-all-meta">
          <span class="cal-all-date">${a.dueDate ? (t('asg_due_label')+': '+a.dueDate+(a.dueTime?' · '+a.dueTime:'')) : t('asg_no_due')}${a.subject?' · '+escHtml(a.subject):''}${a.points?' · '+a.points+ ' '+t('asg_points'):''}</span>
          <span class="cal-all-title"></span>
        </div>
        <button class="cal-all-edit" aria-label="${t('asg_edit')}">${iconSvg('settings','wsvg')}</button>
        <button class="cal-all-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
      </li>`).join('') : `<li class="file-empty" data-i18n="asg_none_yet">${t('asg_none_yet')}</li>`;
    const syncNote = state.cloudClassId ? t('asg_synced') : t('asg_not_synced');
    return `
      <div class="cal-head">
        <span class="cal-month" data-i18n="assignments">${t('assignments')}</span>
        <button class="cal-gear" id="asg-new" aria-label="${t('asg_new')}">${iconSvg('plus','wsvg')}</button>
      </div>
      <p class="dock-vis-hint">${escHtml(syncNote)}</p>
      <p class="drawer-label" data-i18n="asg_list_title">${t('asg_list_title')}</p>
      <ul class="cal-all-list">${listHtml}</ul>
    `;
  }

  function wireList(){
    body.querySelectorAll('.cal-all-row').forEach(row=>{
      const a = state.assignments.find(x=>x.id===row.dataset.id);
      if(a) row.querySelector('.cal-all-title').textContent = a.title || t('cal_untitled');
    });
    body.querySelector('#asg-new').addEventListener('click', ()=>{ editingId=null; mode='form'; draw(); });
    body.querySelectorAll('.cal-all-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{ editingId = btn.closest('.cal-all-row').dataset.id; mode='form'; draw(); });
    });
    body.querySelectorAll('.cal-all-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        if(!confirm(t('asg_delete_confirm'))) return;
        state.assignments = state.assignments.filter(a=>a.id!==id);
        removeAssignmentEvent(id);
        saveState(); notifyCalendarChanged(); draw();
      });
    });
  }

  function formMarkup(){
    const editing = editingId ? state.assignments.find(a=>a.id===editingId) : null;
    const f = editing || { title:'', subject:'', dueDate:todayISO(), dueTime:'', points:0, instructions:'' };
    return `
      <div class="cal-head">
        <button class="cal-nav" id="asg-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month">${editing ? t('asg_edit') : t('asg_new')}</span>
      </div>
      <form class="cal-form" id="asg-form">
        <label class="cal-field">
          <span data-i18n="asg_title">${t('asg_title')}</span>
          <input type="text" id="af-title" value="${escHtml(f.title||'')}" maxlength="80" required>
        </label>
        <div class="cal-field-row">
          <label class="cal-field">
            <span data-i18n="asg_subject">${t('asg_subject')}</span>
            <input type="text" id="af-subject" value="${escHtml(f.subject||'')}" maxlength="40">
          </label>
          <label class="cal-field">
            <span data-i18n="asg_points">${t('asg_points')}</span>
            <input type="number" id="af-points" min="0" step="1" value="${f.points||0}">
          </label>
        </div>
        <div class="cal-field-row">
          <label class="cal-field">
            <span data-i18n="asg_due_date">${t('asg_due_date')}</span>
            <input type="date" id="af-date" value="${f.dueDate||''}">
          </label>
          <label class="cal-field">
            <span data-i18n="asg_due_time">${t('asg_due_time')}</span>
            <input type="time" id="af-time" value="${f.dueTime||''}">
          </label>
        </div>
        <p class="dock-vis-hint" data-i18n="asg_calendar_link">${t('asg_calendar_link')}</p>
        <label class="cal-field">
          <span data-i18n="asg_instructions">${t('asg_instructions')}</span>
          <textarea id="af-instructions" rows="3">${escHtml(f.instructions||'')}</textarea>
        </label>
        <div class="btn-row">
          <button type="submit" class="wbtn primary" data-i18n="asg_push">${t('asg_push')}</button>
          <button type="button" class="wbtn" id="af-cancel" data-i18n="asg_cancel">${t('asg_cancel')}</button>
        </div>
      </form>
    `;
  }

  function wireForm(){
    body.querySelector('#asg-back').addEventListener('click', ()=>{ mode='list'; editingId=null; draw(); });
    body.querySelector('#af-cancel').addEventListener('click', ()=>{ mode='list'; editingId=null; draw(); });
    body.querySelector('#asg-form').addEventListener('submit', e=>{
      e.preventDefault();
      const title = body.querySelector('#af-title').value.trim();
      if(!title) return;
      const subject = body.querySelector('#af-subject').value.trim();
      const points = parseInt(body.querySelector('#af-points').value, 10) || 0;
      const dueDate = body.querySelector('#af-date').value || '';
      const dueTime = body.querySelector('#af-time').value || '';
      const instructions = body.querySelector('#af-instructions').value.trim();
      let asg;
      if(editingId){
        asg = state.assignments.find(a=>a.id===editingId);
        Object.assign(asg, { title, subject, points, dueDate, dueTime, instructions });
      } else {
        asg = { id:cid(), title, subject, points, dueDate, dueTime, instructions, createdAt:Date.now() };
        state.assignments.push(asg);
        stat('assignments'); logAct('assignment', title, 1, awardXP('assignment', 5));
      }
      upsertAssignmentEvent(asg);
      saveState();
      notifyCalendarChanged();
      toast(state.cloudClassId ? t('asg_synced') : t('asg_not_synced'));
      mode = 'list'; editingId = null;
      draw();
    });
  }

  draw();
  const onExternalChange = ()=>{ if(mode==='list') draw(); };
  document.addEventListener('td:calendar-changed', onExternalChange);
  return ()=> document.removeEventListener('td:calendar-changed', onExternalChange);
}

/* =========================================================
   Progress Reports — per-student, not class-wide like Assignments/Calendar.
   The teacher picks one student off the LIVE Cloud Class roster (this widget
   subscribes to TDCloud.subscribeRoster itself, same call Cloud Class makes —
   there's no shared roster state to reach into from here), fills in the same
   fields as the Progress Report docx template, and Send writes straight to
   that one student's own students/{id}/progressReports/{reportId} doc
   (TDCloud.sendProgressReport) — ParentDeck's Progress Reports widget reads
   that same per-student subcollection. This is why it's a direct per-student
   write rather than a syncXxx(classId, list) mirror like Assignments/Calendar
   use: a progress report was never a class-wide broadcast to begin with.

   The weekly/bi-weekly/monthly + start-date picker doesn't resend future
   reports automatically — it schedules REMINDERS on the canonical Calendar
   (state.calendarEvents, ids `pr-<reportId>-<n>`, same "Calendar is the one
   canonical place dates show up" rule Assignments follows) for the teacher
   to come back and fill in each future occurrence themselves. PR_OCCURRENCES
   controls how many of those reminders get created per report.
   ========================================================= */
const PR_OCCURRENCES = 6;
const PR_STEP_DAYS = { weekly:7, biweekly:14 }; // monthly uses addMonthsISO instead, see below

function progressReportDates(startDate, frequency){
  const dates = [];
  for(let i=0;i<PR_OCCURRENCES;i++){
    if(frequency === 'monthly') dates.push(addMonthsISO(startDate, i));
    else dates.push(isoDate(...(function(){
      const d = new Date(startDate+'T00:00:00');
      d.setDate(d.getDate() + i*(PR_STEP_DAYS[frequency]||7));
      return [d.getFullYear(), d.getMonth()+1, d.getDate()];
    })()));
  }
  return dates;
}
function upsertProgressReportEvents(report){
  removeProgressReportEvents(report.id);
  progressReportDates(report.startDate, report.frequency).forEach((date, i)=>{
    state.calendarEvents.push({
      id: `pr-${report.id}-${i}`,
      title: `${t('cal_progress_report_tag')}: ${report.studentName}`,
      date, time:'', reminder:'none',
      notes: i===0 ? t('pr_sent_label') : '',
      type: 'progress-report',
      reportId: report.id,
      fired:false
    });
  });
}
function removeProgressReportEvents(reportId){
  state.calendarEvents = state.calendarEvents.filter(e=> e.reportId !== reportId);
}

function renderProgressReports(body){
  let mode = 'list';
  let roster = [];
  let unsubRoster = ()=>{};

  function draw(){
    body.innerHTML = mode === 'form' ? formMarkup() : listMarkup();
    if(mode === 'form') wireForm(); else wireList();
  }

  function listMarkup(){
    const rows = [...state.progressReports].sort((a,b)=> (b.createdAt||0)-(a.createdAt||0));
    const listHtml = rows.length ? rows.map(r=>`
      <li class="cal-all-row" data-id="${r.id}">
        <div class="cal-all-meta">
          <span class="cal-all-date">${escHtml(r.studentName)} · ${t('pr_'+r.frequency)} · ${r.score}/10</span>
          <span class="cal-all-title"></span>
        </div>
        <button class="cal-all-del" aria-label="${t('remove')}">${iconSvg('close','wsvg')}</button>
      </li>`).join('') : `<li class="file-empty" data-i18n="pr_none_yet">${t('pr_none_yet')}</li>`;
    const syncNote = state.cloudClassId ? t('pr_synced') : t('pr_not_synced');
    return `
      <div class="cal-head">
        <span class="cal-month" data-i18n="progressreports">${t('progressreports')}</span>
        <button class="cal-gear" id="pr-new" aria-label="${t('pr_new')}">${iconSvg('plus','wsvg')}</button>
      </div>
      <p class="dock-vis-hint">${escHtml(syncNote)}</p>
      <p class="drawer-label" data-i18n="pr_list_title">${t('pr_list_title')}</p>
      <ul class="cal-all-list">${listHtml}</ul>
    `;
  }

  function wireList(){
    body.querySelectorAll('.cal-all-row').forEach(row=>{
      const r = state.progressReports.find(x=>x.id===row.dataset.id);
      if(r) row.querySelector('.cal-all-title').textContent = `${t('pr_sent_label')} ${r.startDate}`;
    });
    body.querySelector('#pr-new').addEventListener('click', ()=>{ mode='form'; draw(); });
    body.querySelectorAll('.cal-all-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.closest('.cal-all-row').dataset.id;
        if(!confirm(t('pr_delete_confirm'))) return;
        const r = state.progressReports.find(x=>x.id===id);
        state.progressReports = state.progressReports.filter(x=>x.id!==id);
        removeProgressReportEvents(id);
        saveState(); notifyCalendarChanged(); draw();
        if(r && state.cloudClassId){
          TDCloud.deleteProgressReport(r.studentId, id).catch(()=>{});
        }
      });
    });
  }

  function formMarkup(){
    const noRoster = !roster.length;
    const studentOpts = roster.map(s=>`<option value="${s.id}">${escHtml(s.displayName)}</option>`).join('');
    return `
      <div class="cal-head">
        <button class="cal-nav" id="pr-back">${iconSvg('chevronLeft','wsvg')}</button>
        <span class="cal-month">${t('pr_new')}</span>
      </div>
      ${noRoster ? `<p class="dock-vis-hint">${t('pr_no_roster')}</p>` : `
      <form class="cal-form" id="pr-form">
        <label class="cal-field">
          <span data-i18n="pr_student">${t('pr_student')}</span>
          <select id="pf-student" required>
            <option value="" disabled selected>${t('pr_select_student')}</option>
            ${studentOpts}
          </select>
        </label>
        <p class="dock-vis-hint" data-i18n="pr_student_hint">${t('pr_student_hint')}</p>
        <label class="cal-field">
          <span data-i18n="pr_skills">${t('pr_skills')}</span>
          <textarea id="pf-skills" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_improve">${t('pr_improve')}</span>
          <textarea id="pf-improve" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_strengths">${t('pr_strengths')}</span>
          <textarea id="pf-strengths" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_next_focus">${t('pr_next_focus')}</span>
          <textarea id="pf-nextfocus" rows="2"></textarea>
        </label>
        <label class="cal-field">
          <span data-i18n="pr_score">${t('pr_score')}</span>
          <input type="number" id="pf-score" min="0" max="10" step="1" value="0"> <span class="dock-vis-hint">${t('pr_score_out_of')}</span>
        </label>
        <p class="drawer-label" data-i18n="pr_frequency">${t('pr_frequency')}</p>
        <div id="pf-freq-row">
          <label class="chk-row"><input type="checkbox" class="pf-freq" value="weekly"> ${t('pr_weekly')}</label>
          <label class="chk-row"><input type="checkbox" class="pf-freq" value="biweekly"> ${t('pr_biweekly')}</label>
          <label class="chk-row"><input type="checkbox" class="pf-freq" value="monthly"> ${t('pr_monthly')}</label>
        </div>
        <label class="cal-field">
          <span data-i18n="pr_start_date">${t('pr_start_date')}</span>
          <input type="date" id="pf-startdate" value="${todayISO()}">
        </label>
        <p class="dock-vis-hint" data-i18n="pr_calendar_link">${t('pr_calendar_link')}</p>
        <div class="btn-row">
          <button type="submit" class="wbtn primary" data-i18n="pr_send">${t('pr_send')}</button>
          <button type="button" class="wbtn" id="pf-cancel" data-i18n="pr_cancel">${t('pr_cancel')}</button>
        </div>
      </form>`}
    `;
  }

  function wireForm(){
    body.querySelector('#pr-back').addEventListener('click', ()=>{ mode='list'; draw(); });
    if(!roster.length) return;
    body.querySelector('#pf-cancel').addEventListener('click', ()=>{ mode='list'; draw(); });
    // Checkboxes that behave as a single-select group: checking one unchecks the others,
    // rather than a <select> or radio group — matches how the frequency choice was asked
    // for, while still only ever allowing one frequency per report.
    const freqBoxes = [...body.querySelectorAll('.pf-freq')];
    freqBoxes.forEach(box=>{
      box.addEventListener('change', ()=>{
        if(box.checked) freqBoxes.forEach(b=>{ if(b!==box) b.checked = false; });
      });
    });
    body.querySelector('#pr-form').addEventListener('submit', e=>{
      e.preventDefault();
      const studentId = body.querySelector('#pf-student').value;
      const student = roster.find(s=>s.id===studentId);
      if(!student) return;
      const frequency = (freqBoxes.find(b=>b.checked)||{}).value;
      if(!frequency){ toast(t('pr_select_frequency')); return; }
      const startDate = body.querySelector('#pf-startdate').value || todayISO();
      const report = {
        id: cid(),
        studentId,
        studentName: student.displayName,
        classId: state.cloudClassId || '',
        skills: body.querySelector('#pf-skills').value.trim(),
        improve: body.querySelector('#pf-improve').value.trim(),
        strengths: body.querySelector('#pf-strengths').value.trim(),
        nextFocus: body.querySelector('#pf-nextfocus').value.trim(),
        score: Math.max(0, Math.min(10, parseInt(body.querySelector('#pf-score').value,10) || 0)),
        frequency, startDate,
        createdAt: Date.now()
      };
      state.progressReports.push(report);
      track('report', student.displayName || '');
      upsertProgressReportEvents(report);
      saveState();
      notifyCalendarChanged();
      if(state.cloudClassId){
        TDCloud.sendProgressReport(studentId, report)
          .then(()=> toast(t('pr_synced')))
          .catch(err=> toast(err.message||String(err)));
      } else {
        toast(t('pr_not_synced'));
      }
      mode = 'list';
      draw();
    });
  }

  draw();
  if(state.cloudClassId){
    unsubRoster = TDCloud.subscribeRoster(state.cloudClassId, list=>{ roster = list; if(mode==='form') draw(); });
  }
  const onExternalChange = ()=>{ if(mode==='list') draw(); };
  document.addEventListener('td:calendar-changed', onExternalChange);
  return ()=>{ unsubRoster(); document.removeEventListener('td:calendar-changed', onExternalChange); };
}

/* ---------------- Reminder engine (runs regardless of whether the widget is open) ---------------- */
function showReminderPopup(ev){
  const overlay = document.createElement('div');
  overlay.className = 'reminder-overlay';
  const when = new Date(`${ev.date}T${ev.time||'00:00'}:00`)
    .toLocaleString(LOCALE_MAP[state.lang]||'en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  overlay.innerHTML = `
    <div class="reminder-card">
      <p class="reminder-kicker">${t('reminder_popup_title')}</p>
      <h3></h3>
      <p class="reminder-meta"></p>
      <p class="reminder-notes"></p>
      <button class="wbtn primary">${t('dismiss')}</button>
    </div>
  `;
  overlay.querySelector('h3').textContent = ev.title || t('cal_untitled');
  overlay.querySelector('.reminder-meta').textContent = when;
  overlay.querySelector('.reminder-notes').textContent = ev.notes || '';
  overlay.querySelector('button').addEventListener('click', ()=> overlay.remove());
  document.body.appendChild(overlay);

  if(state.notifsEnabled && 'Notification' in window && Notification.permission === 'granted'){
    try{ new Notification(ev.title || t('cal_untitled'), { body: ev.notes || when }); }catch(err){}
  }
}

function checkReminders(){
  const now = new Date();
  let changed = false;
  state.calendarEvents.forEach(ev=>{
    if(ev.fired || !ev.time || !ev.reminder || ev.reminder === 'none') return;
    const evDate = new Date(`${ev.date}T${ev.time}:00`);
    const remindMinutes = ev.reminder === 'at' ? 0 : parseInt(ev.reminder, 10) || 0;
    const remindAt = new Date(evDate.getTime() - remindMinutes*60000);
    const graceMs = 60*60000;
    if(now >= remindAt && (evDate.getTime() - now.getTime()) > -graceMs){
      showReminderPopup(ev);
      ev.fired = true;
      changed = true;
    }
  });
  if(changed) saveState();
}

