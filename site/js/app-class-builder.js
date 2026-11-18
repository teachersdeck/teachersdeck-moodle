/* ---------------- Class Builder (v0.19.0) ----------------
   One widget for everything about a class: Classes (switch, rename, copy, delete, create a new class WITH its students), Students (Vietnamese-format
   names + optional English name), Pick & Groups (the Name Picker and Group Maker, drawn from this class), and Cloud (convert the class to a cloud class,
   then see it the way StudentDeck, ParentDeck and AdminDeck see it). The class-management controls that used to sit in Settings live here; the top-right
   class switcher opens it ("Manage classes…", "New class…").
   Cloud limits, stated plainly: a student record only exists once the student joins with the class code, and TeachersDeck cannot read who has linked as a
   parent or what AdminDeck holds — so those tables show what TeachersDeck CAN see (joined students and their points; notes sent to parents; the class record). */
let cbTab = 'classes', cbRedraw = null, cbDraft = null;
const CB_TABS = ['classes', 'students', 'pick', 'cloud'];
const cbBlankRow = () => ({ fam:'', mid:'', giv:'', en:'' });
function cbDraftGet(){ if(!cbDraft) cbDraft = { name:'', rows:Array.from({ length:5 }, cbBlankRow), open:false }; return cbDraft; }
function openClassBuilder(tab, opts){
  if(KINDER) return;   // Kinder: the school owns the roster (KinderDeck)
  if(tab && CB_TABS.includes(tab)) cbTab = tab;
  if(opts && opts.newClass) cbDraftGet().open = true;
  const sd = document.getElementById('settings-drawer'); if(sd) sd.hidden = true;
  if(isOff('classbuilder')) setWidgetOff('classbuilder', false);
  if(!state.active.classbuilder) toggleWidget('classbuilder');
  else{ if(cbRedraw) cbRedraw(); const o = widgetEls.classbuilder; if(o) bringToFront(o.el); }
}
function classMeta(id){
  let st = null;
  if(id === activeClassId()) st = state;
  else{ try{ st = JSON.parse(localStorage.getItem(classStateKey(id))); }catch(e){} }
  if(!st){                                  // a class that hasn't been opened yet may still be holding its students
    try{ const seed = JSON.parse(localStorage.getItem(CB_SEED_PREFIX + id)); if(Array.isArray(seed)) return { n:seed.length, cloud:false }; }catch(e){}
    return { n:0, cloud:false };
  }
  return { n:Array.isArray(st.students) ? st.students.length : (Array.isArray(st.roster) ? st.roster.length : 0), cloud:!!st.cloudClassId };
}
function cbRowHtml(r, attrs){
  const f = (k, ph, label) => `<input type="text" data-f="${k}" value="${escHtml(r[k] || '')}" placeholder="${escHtml(t(ph))}" aria-label="${escHtml(t(label))}" autocomplete="off">`;
  return `<div class="cb-row-s" ${attrs}>${f('fam', 'cb_ph_fam', 'cb_col_fam')}${f('mid', 'cb_ph_mid', 'cb_col_mid')}${f('giv', 'cb_ph_giv', 'cb_col_giv')}${f('en', 'cb_ph_en', 'cb_col_en')}<button type="button" class="cb-x" data-del aria-label="${escHtml(t('cb_remove'))}" title="${escHtml(t('cb_remove'))}">×</button></div>`;
}
const cbHeadHtml = () => `<div class="cb-row-s cb-row-h"><span>${t('cb_col_fam')}</span><span>${t('cb_col_mid')}</span><span>${t('cb_col_giv')}</span><span>${t('cb_col_en')}</span><span></span></div>`;

function renderClassBuilder(body){
  body.innerHTML = '<div class="cb"><div class="cb-tabs" role="tablist"></div><div class="cb-pane" role="tabpanel"></div></div>';
  const tabsEl = body.querySelector('.cb-tabs'), pane = body.querySelector('.cb-pane');
  let paneCleanup = null;
  function stopPane(){ if(paneCleanup){ try{ paneCleanup(); }catch(e){} paneCleanup = null; } }
  function draw(){
    stopPane();
    tabsEl.innerHTML = CB_TABS.map(k => `<button type="button" role="tab" class="cb-tab${k === cbTab ? ' active' : ''}" data-tab="${k}" aria-selected="${k === cbTab}">${t('cb_tab_' + k)}</button>`).join('');
    pane.innerHTML = '';
    const fn = { classes:cbPaneClasses, students:cbPaneStudents, pick:cbPanePick, cloud:cbPaneCloud }[cbTab];
    paneCleanup = fn(pane, draw) || null;
  }
  tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if(b && b.dataset.tab !== cbTab){ cbTab = b.dataset.tab; draw(); } });
  cbRedraw = draw; draw();
  return () => { stopPane(); if(cbRedraw === draw) cbRedraw = null; };
}

/* ----- Classes ----- */
function cbPaneClasses(pane){
  const D = cbDraftGet();
  pane.innerHTML = `
    <p class="cb-hint">${t('classes_hint')}</p>
    <div class="cb-classes" id="cb-class-list"></div>
    <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-copy">${t('class_copy')}</button></div>
    <p class="cb-hint">${t('class_copy_hint')}</p>
    <details class="cb-new" id="cb-new"${D.open ? ' open' : ''}>
      <summary>${t('cb_new_class')}</summary>
      <label class="cb-field"><span>${t('cb_class_name')}</span><input type="text" id="cb-new-name" placeholder="${escHtml(t('class_name_ph'))}"></label>
      <p class="cb-hint">${t('cb_students_hint')}</p>
      ${cbHeadHtml()}
      <div class="cb-rows" id="cb-new-rows"></div>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-new-addrow">${t('cb_add_student')}</button></div>
      <label class="cb-field"><span>${t('cb_paste_label')}</span><textarea id="cb-new-paste" rows="3" placeholder="${escHtml(t('cb_paste_ph'))}"></textarea></label>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-new-paste-add">${t('cb_paste_add')}</button><button type="button" class="wbtn primary" id="cb-new-create">${t('class_add_btn')}</button></div>
    </details>`;
  const list = pane.querySelector('#cb-class-list');
  classes.list.forEach(c => {
    const m = classMeta(c.id), cur = c.id === activeClassId();
    const row = document.createElement('div');
    row.className = 'class-row cb-class-row' + (cur ? ' current' : '');
    row.innerHTML = '<input type="text" class="class-row-name"><span class="cb-meta"></span><button class="class-row-btn open" type="button"></button><button class="class-row-btn del" type="button">×</button>';
    const input = row.querySelector('.class-row-name');
    input.value = c.name || ''; input.placeholder = t('class_default_name');
    input.addEventListener('change', () => renameClass(c.id, input.value));
    row.querySelector('.cb-meta').textContent = t('cb_n_students', { n:m.n }) + (m.cloud ? ' ☁️' : '');
    const openBtn = row.querySelector('.open');
    openBtn.textContent = cur ? t('class_current') : t('class_switch_to'); openBtn.disabled = cur;
    openBtn.addEventListener('click', () => { renameClass(c.id, input.value); switchClass(c.id); });
    const del = row.querySelector('.del'); del.title = t('class_delete'); del.setAttribute('aria-label', t('class_delete'));
    del.addEventListener('click', () => deleteClass(c.id));
    list.appendChild(row);
  });
  pane.querySelector('#cb-copy').addEventListener('click', () => addClass(`${classDisplayName(activeClass())} (${t('class_copy_suffix')})`, true));
  // --- the new-class form (kept in cbDraft so switching tabs doesn't lose it) ---
  const det = pane.querySelector('#cb-new'), nameIn = pane.querySelector('#cb-new-name'), rowsEl = pane.querySelector('#cb-new-rows');
  det.addEventListener('toggle', () => { D.open = det.open; });
  nameIn.value = D.name; nameIn.addEventListener('input', () => { D.name = nameIn.value; });
  function drawRows(){ rowsEl.innerHTML = D.rows.map((r, i) => cbRowHtml(r, `data-i="${i}"`)).join(''); }
  rowsEl.addEventListener('input', e => { const inp = e.target.closest('input[data-f]'); if(inp) D.rows[+inp.closest('[data-i]').dataset.i][inp.dataset.f] = inp.value; });
  rowsEl.addEventListener('click', e => { const x = e.target.closest('[data-del]'); if(!x) return; D.rows.splice(+x.closest('[data-i]').dataset.i, 1); if(!D.rows.length) D.rows.push(cbBlankRow()); drawRows(); });
  pane.querySelector('#cb-new-addrow').addEventListener('click', () => { D.rows.push(cbBlankRow()); drawRows(); const last = rowsEl.querySelector('.cb-row-s:last-child input'); if(last) last.focus(); });
  pane.querySelector('#cb-new-paste-add').addEventListener('click', () => {
    const ta = pane.querySelector('#cb-new-paste'), added = ta.value.split(/\r?\n/).map(parseStudentLine).filter(Boolean);
    if(!added.length) return;
    D.rows = D.rows.filter(r => r.fam || r.mid || r.giv || r.en).concat(added.map(s => ({ fam:s.fam, mid:s.mid, giv:s.giv, en:s.en })));
    ta.value = ''; drawRows();
  });
  pane.querySelector('#cb-new-create').addEventListener('click', () => {
    const students = D.rows.filter(r => r.fam.trim() || r.mid.trim() || r.giv.trim() || r.en.trim()).map(r => ({ id:cid(), fam:r.fam.trim(), mid:r.mid.trim(), giv:r.giv.trim(), en:r.en.trim() }));
    const name = D.name; cbDraft = null;
    addClass(name, false, students);
  });
  drawRows();
}

/* ----- Students (the open class) ----- */
function cbPaneStudents(pane){
  pane.innerHTML = `
    <div class="cb-head"><b>${escHtml(classDisplayName(activeClass()))}</b><span class="cb-meta" id="cb-count"></span></div>
    ${cbHeadHtml()}
    <div class="cb-rows" id="cb-rows"></div>
    <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-addrow">${t('cb_add_student')}</button><button type="button" class="wbtn" id="cb-sort">${t('cb_sort')}</button></div>
    <label class="cb-field"><span>${t('cb_paste_label')}</span><textarea id="cb-paste" rows="3" placeholder="${escHtml(t('cb_paste_ph'))}"></textarea></label>
    <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-paste-add">${t('cb_paste_add')}</button></div>
    <label class="cb-field"><span>${t('cb_show_as')}</span><select id="cb-mode"><option value="both">${t('cb_mode_both')}</option><option value="english">${t('cb_mode_en')}</option><option value="vietnamese">${t('cb_mode_vi')}</option></select></label>
    <p class="cb-hint" id="cb-preview"></p>`;
  const rowsEl = pane.querySelector('#cb-rows'), sel = pane.querySelector('#cb-mode');
  function meta(){
    pane.querySelector('#cb-count').textContent = t('cb_n_students', { n:state.roster.length });
    pane.querySelector('#cb-preview').textContent = state.roster.length ? `${t('cb_preview')}: ${state.roster.slice(0, 3).join(' · ')}` : t('cb_no_students');
  }
  function drawRows(){ rowsEl.innerHTML = state.students.map(s => cbRowHtml(s, `data-id="${s.id}"`)).join(''); meta(); }
  sel.value = state.rosterNames;
  sel.addEventListener('change', () => { mutateStudents(() => { state.rosterNames = sel.value; }); meta(); });
  rowsEl.addEventListener('change', e => {
    const inp = e.target.closest('input[data-f]'); if(!inp) return;
    const s = state.students.find(x => x.id === inp.closest('[data-id]').dataset.id); if(!s) return;
    mutateStudents(() => { s[inp.dataset.f] = inp.value.trim().replace(/ {2,}/g, ' '); });
    inp.value = s[inp.dataset.f]; meta();
  });
  rowsEl.addEventListener('click', e => {
    const x = e.target.closest('[data-del]'); if(!x) return;
    const id = x.closest('[data-id]').dataset.id;
    mutateStudents(() => { state.students = state.students.filter(s => s.id !== id); });
    drawRows();
  });
  pane.querySelector('#cb-addrow').addEventListener('click', () => {
    state.students.push({ id:cid(), ...cbBlankRow() }); drawRows();
    const last = rowsEl.querySelector('.cb-row-s:last-child input'); if(last) last.focus();
  });
  pane.querySelector('#cb-sort').addEventListener('click', () => {      // Vietnamese convention: alphabetical by given name (Tên), then family name
    mutateStudents(() => { state.students.sort((a, b) => String(a.giv || a.fam).localeCompare(String(b.giv || b.fam), 'vi') || String(a.fam).localeCompare(String(b.fam), 'vi') || String(a.mid).localeCompare(String(b.mid), 'vi')); });
    drawRows();
  });
  pane.querySelector('#cb-paste-add').addEventListener('click', () => {
    const ta = pane.querySelector('#cb-paste'), added = ta.value.split(/\r?\n/).map(parseStudentLine).filter(Boolean);
    if(!added.length) return;
    mutateStudents(() => { state.students.push(...added); });
    ta.value = ''; drawRows(); toast(t('cb_added_n', { n:added.length }));
  });
  drawRows();
  return () => { const keep = state.students.filter(s => studentDisplay(s)); if(keep.length !== state.students.length){ state.students = keep; syncRoster(true); } };   // drop rows left blank
}

/* ----- Pick & Groups: the Name Picker and Group Maker, drawn from this class ----- */
function cbPanePick(pane){
  pane.innerHTML = `<section class="cb-sub"><h4>${escHtml(widgetLabel('namepicker'))}</h4><div id="cb-np"></div></section><section class="cb-sub"><h4>${escHtml(widgetLabel('groupmaker'))}</h4><div id="cb-gm"></div></section>`;
  const c1 = renderNamePicker(pane.querySelector('#cb-np')), c2 = renderGroupMaker(pane.querySelector('#cb-gm'));
  return () => { [c1, c2].forEach(c => { if(typeof c === 'function'){ try{ c(); }catch(e){} } }); };
}

/* ----- Cloud: convert, then the StudentDeck / ParentDeck / AdminDeck tables ----- */
const nameKey = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '');
function studentKeys(s){
  const vi = viFullName(s), en = String(s.en || '').trim();
  return [...new Set([vi, en, studentDisplay(s, 'both'), en + ' ' + vi, vi + ' ' + en, [s.giv, s.fam].filter(Boolean).join(' ')].map(nameKey).filter(Boolean))];
}
function cbMatch(locals, clouds){            // match what students typed when they joined to the names on your list (ignores accents, case and spaces)
  const map = new Map(), used = new Set();
  locals.forEach(s => { const keys = studentKeys(s), hit = clouds.find(c => !used.has(c.id) && keys.includes(nameKey(c.displayName))); if(hit){ map.set(s.id, hit); used.add(hit.id); } });
  locals.forEach(s => {                      // second pass: one unambiguous "starts with" match (e.g. they typed only "Minh Tran")
    if(map.has(s.id)) return;
    const keys = studentKeys(s).filter(k => k.length >= 3);
    const cand = clouds.filter(c => { if(used.has(c.id)) return false; const ck = nameKey(c.displayName); return ck.length >= 3 && keys.some(k => k.startsWith(ck) || ck.startsWith(k)); });
    if(cand.length === 1){ map.set(s.id, cand[0]); used.add(cand[0].id); }
  });
  return { map, extra:clouds.filter(c => !used.has(c.id)) };
}
const cbTsMs = v => !v ? 0 : (typeof v.toMillis === 'function' ? v.toMillis() : (v.seconds ? v.seconds * 1000 : (typeof v === 'number' ? v : 0)));
const cbDate = ms => ms ? new Date(ms).toLocaleDateString(state.lang === 'vi' ? 'vi-VN' : undefined, { month:'short', day:'numeric' }) : '—';
const CB_MOOD = { smiley:'😊', frowny:'☹️', neutral:'😐' };

function cbPaneCloud(pane){
  if(!TDCloud.isConfigured()){ pane.innerHTML = notConfiguredHtml(); return null; }
  const unsubs = []; let sub = 'student';
  const stop = () => { unsubs.forEach(u => { try{ u(); }catch(e){} }); unsubs.length = 0; };
  const unAuth = TDCloud.onAuthChanged(() => paint());
  function refreshCloudWidgets(){ if(widgetEls.cloudclass){ closeWidget('cloudclass'); openWidget('cloudclass'); syncDock(); } }
  function paint(){
    stop();
    const session = TDCloud.getSession();
    if(!session){
      pane.innerHTML = `<p class="cb-hint">${t('cb_cloud_intro')}</p><div class="btn-row cb-row"><button type="button" class="wbtn primary" id="cb-signin">${t('cc_signin')}</button></div>`;
      pane.querySelector('#cb-signin').addEventListener('click', async () => { try{ await TDCloud.signIn(); }catch(e){ toast(e.message || String(e)); } });
      return;
    }
    if(!state.cloudClassId) return paintConvert(session);
    paintLinked(session);
  }
  function paintConvert(session){
    pane.innerHTML = `
      <p class="cb-hint">${t('cc_signed_in_as', { name:escHtml(session.displayName || session.email || '') })}</p>
      <p class="cb-hint cb-left">${t('cb_cloud_convert_hint')}</p>
      <label class="cb-field"><span>${t('cb_cloud_name')}</span><input type="text" id="cb-cname-in" value="${escHtml(activeClass().name || '')}" placeholder="${escHtml(t('cc_class_name_ph'))}"></label>
      <div class="btn-row cb-row"><button type="button" class="wbtn primary" id="cb-convert">☁️ ${t('cb_cloud_convert')}</button></div>
      <p class="cb-hint" id="cb-pick-label">${t('cc_or_pick')}</p>
      <div class="scroll-list" id="cb-pick-list"></div>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-signout">${t('cc_sign_out')}</button></div>`;
    const link = id => { state.cloudClassId = id; TDCloud.resetCalendarSyncCache(); TDCloud.resetHomeworkSyncCache(); saveState(); refreshCloudWidgets(); buildClassList(); paint(); };
    pane.querySelector('#cb-convert').addEventListener('click', async e => {
      const btn = e.currentTarget, name = pane.querySelector('#cb-cname-in').value.trim() || classDisplayName(activeClass());
      btn.disabled = true;
      try{ const res = await TDCloud.createClass(name); if(!(activeClass().name || '').trim()) renameClass(activeClassId(), name); link(res.classId); toast(t('cb_converted')); }
      catch(err){ btn.disabled = false; toast(err.message || String(err)); }
    });
    pane.querySelector('#cb-signout').addEventListener('click', () => TDCloud.signOut());
    TDCloud.myClasses().then(list => {
      const el = pane.querySelector('#cb-pick-list'); if(!el) return;
      if(!list.length){ el.innerHTML = '<p class="small-hint">—</p>'; return; }
      el.innerHTML = list.map(c => `<button type="button" class="wbtn cc-pick" data-id="${escHtml(c.id)}">${escHtml(c.className)}</button>`).join('');
      el.querySelectorAll('.cc-pick').forEach(b => b.addEventListener('click', () => link(b.dataset.id)));
    }).catch(() => {});
  }
  function paintLinked(session){
    pane.innerHTML = `
      <div class="cb-head"><b id="cb-cname"></b><span class="cb-meta">☁️ ${t('cb_linked')}</span></div>
      <div id="cb-codes"></div>
      <div class="cb-seg" role="tablist">${['student', 'parent', 'admin'].map(k => `<button type="button" role="tab" class="cb-segb${k === sub ? ' active' : ''}" data-sub="${k}">${t('cb_seg_' + k)}</button>`).join('')}</div>
      <div class="cb-tablewrap" id="cb-table"></div>
      <div id="cb-extra"></div>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-copy-table">${t('cb_copy_table')}</button><button type="button" class="wbtn" id="cb-slips">🖨️ ${t('cb_slips')}</button></div>
      <p class="cb-hint" id="cb-note"></p>
      <div class="btn-row cb-row"><button type="button" class="wbtn" id="cb-unlink">${t('cb_unlink')}</button></div>`;
    let cls = null, roster = [], notes = [], theme = null, tsv = [];
    const $ = s => pane.querySelector(s);
    const table = (head, rows) => `<table class="cb-table"><thead><tr>${head.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    function drawAll(){
      $('#cb-cname').textContent = (cls && cls.className) || classDisplayName(activeClass());
      $('#cb-codes').innerHTML = cls ? ['student', 'parent'].map(w => { const code = cls[w + 'JoinCode'] || ''; return `<div class="cc-code-row"><span>${t('cc_' + w + '_code')}: <b>${escHtml(code)}</b></span><span class="cc-code-btns"><button type="button" class="wbtn" data-copy="${escHtml(code)}">${t('cc_copy')}</button><button type="button" class="wbtn" data-which="${w}">${t('cc_regenerate')}</button></span></div>`; }).join('') : `<p class="cb-hint">${t('cb_cloud_missing')}</p>`;
      pane.querySelectorAll('.cb-seg [data-sub]').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
      const { map, extra } = cbMatch(state.students, roster), tableEl = $('#cb-table'), extraEl = $('#cb-extra'); extraEl.innerHTML = '';
      let head, rows;
      if(sub === 'student'){
        head = [t('cb_h_student'), t('cb_h_status'), t('cb_h_points'), t('cb_h_level'), t('cb_h_streak'), t('cb_h_last')];
        rows = state.students.filter(s => studentDisplay(s)).map(s => { const c = map.get(s.id); return [studentDisplay(s), c ? '✅ ' + t('cb_joined') : '⏳ ' + t('cb_notyet'), c ? String(c.xp || 0) : '—', c ? String(c.level || 1) : '—', c && c.practice ? String(c.practice.streak || 0) : '—', c ? cbDate(cbTsMs(c.lastActiveAt) || cbTsMs(c.practice && c.practice.updatedAt)) : '—']; });
        $('#cb-note').textContent = `${t('cb_joined_sum', { j:map.size, n:rows.length })} · ${t('cb_student_note')}`;
        if(extra.length){
          extraEl.innerHTML = `<p class="cb-sub-h">${t('cb_unmatched_title')}</p>` + extra.map(c => `<div class="cb-unm"><span>${escHtml(c.displayName || '?')}</span><button type="button" class="wbtn" data-add="${escHtml(c.id)}">${t('cb_add_to_list')}</button></div>`).join('');
        }
      }else if(sub === 'parent'){
        head = [t('cb_h_student'), t('cb_h_sent'), t('cb_h_unread'), t('cb_h_latest')];
        rows = state.students.filter(s => studentDisplay(s)).map(s => {
          const c = map.get(s.id), mine = c ? notes.filter(n => n.studentId === c.id) : [], last = mine.slice().sort((a, b) => cbTsMs(b.createdAt) - cbTsMs(a.createdAt))[0];
          return [studentDisplay(s), c ? String(mine.length) : '—', c ? String(mine.filter(n => !n.read).length) : '—', last ? `${cbDate(cbTsMs(last.createdAt))} ${CB_MOOD[last.mood] || ''}`.trim() : '—'];
        });
        $('#cb-note').textContent = cls && cls.parentLinking === 'class-code' ? t('cb_parent_note_cc', { code:cls.parentJoinCode || '' }) : t('cb_parent_note');   // v0.40.2: parents link with family codes unless the class chose the class code
      }else{
        const n = state.students.filter(s => studentDisplay(s)).length;
        head = [t('cb_h_item'), t('cb_h_value')];
        rows = [
          [t('cb_a_class'), (cls && cls.className) || classDisplayName(activeClass())],
          [t('cb_a_teacher'), session.displayName || session.email || '—'],
          [t('cb_a_id'), state.cloudClassId],
          [t('cb_a_students'), `${n} · ${t('cb_joined_sum', { j:map.size, n })}`],
          [t('cb_a_codes'), cls ? `${cls.studentJoinCode || '—'} / ${cls.parentJoinCode || '—'}` : '—'],
          [t('cb_a_ranking'), (cls && cls.rankingVisibility) || 'anonymized'],
          [t('cb_a_homework'), String((state.assignments || []).length)],
          [t('cb_a_calendar'), String((state.calendarEvents || []).length)],
          [t('cb_a_theme'), theme ? t('cb_a_theme_yes') : t('cb_a_theme_no')]
        ];
        $('#cb-note').textContent = t('cb_admin_note');
      }
      tsv = [head].concat(rows);
      tableEl.innerHTML = table(head, rows);
    }
    pane.addEventListener('click', async e => {
      const seg = e.target.closest('[data-sub]'); if(seg){ sub = seg.dataset.sub; drawAll(); return; }
      const cp = e.target.closest('[data-copy]'); if(cp){ toast(await ccCopyText(cp.dataset.copy) ? t('cc_copied', { code:cp.dataset.copy }) : t('cc_copy_fail')); return; }
      const rg = e.target.closest('[data-which]'); if(rg){ try{ await TDCloud.regenerateJoinCode(state.cloudClassId, rg.dataset.which); }catch(err){ toast(err.message || String(err)); } return; }
      const ad = e.target.closest('[data-add]'); if(ad){ const c = roster.find(x => x.id === ad.dataset.add); if(c){ mutateStudents(() => { state.students.push({ id:cid(), ...splitVietnameseName(c.displayName), en:'' }); }); drawAll(); } return; }
    });
    $('#cb-copy-table').addEventListener('click', async () => toast(await ccCopyText(tsv.map(r => r.join('\t')).join('\n')) ? t('cb_table_copied') : t('cc_copy_fail')));
    $('#cb-slips').addEventListener('click', () => cbPrintSlips(cls));
    $('#cb-unlink').addEventListener('click', () => { if(!confirm(t('cb_unlink_confirm'))) return; state.cloudClassId = null; TDCloud.resetCalendarSyncCache(); TDCloud.resetHomeworkSyncCache(); saveState(); refreshCloudWidgets(); buildClassList(); paint(); });
    unsubs.push(TDCloud.subscribeClass(state.cloudClassId, c => { cls = c; drawAll(); }));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, l => { roster = l; drawAll(); }));
    unsubs.push(TDCloud.subscribeNotes(state.cloudClassId, l => { notes = l || []; drawAll(); }));
    unsubs.push(TDCloud.subscribeAdminTheme(state.cloudClassId, th => { theme = th; drawAll(); }));
    drawAll();
  }
  paint();
  return () => { stop(); unAuth(); };
}
// v0.40.2: each slip tells the child's family how to link. Parents link with the child's OWN family code (backend v2.0.0),
// so a student who has joined gets theirs printed on their slip; one who hasn't is told where it will appear. Only a class
// that chose class-code linking (AdminDeck → ClassDeck) still prints the class's parent code.
async function cbPrintSlips(cls){
  if(!cls){ toast(t('cb_cloud_missing')); return; }
  const w = window.open('', '_blank'); if(!w){ toast(t('cb_popup_blocked')); return; }   // opened before any await, or the pop-up blocker steps in
  const classCode = cls.parentLinking === 'class-code';
  let famByLocal = new Map();
  if(!classCode && state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.getFamilyCodes){
    try{
      const codes = await TDCloud.getFamilyCodes(state.cloudClassId);
      const { map } = cbMatch(state.students, codes.map(c => ({ id:c.studentId, displayName:c.displayName, familyCode:c.familyCode })));
      map.forEach((hit, localId) => famByLocal.set(localId, hit.familyCode));
    }catch(e){ /* offline or an older backend: the slips say where the code will be */ }
  }
  const parentLine = s => classCode ? t('cb_slip_parent', { code:cls.parentJoinCode || '' })
    : famByLocal.get(s.id) ? t('cb_slip_family', { code:famByLocal.get(s.id) }) : t('cb_slip_family_later');
  const slips = state.students.filter(s => studentDisplay(s)).map(s => `<div class="slip"><h3>${escHtml(studentDisplay(s))}</h3><p>${escHtml(t('cb_slip_student', { code:cls.studentJoinCode || '', name:studentDisplay(s) }))}</p><p><small>${escHtml(parentLine(s))}</small></p></div>`).join('');
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${escHtml(cls.className || '')}</title><style>body{font:14px system-ui,sans-serif;margin:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.slip{border:1.5px dashed #888;border-radius:10px;padding:10px 12px;break-inside:avoid}h3{margin:0 0 6px;font-size:15px}p{margin:4px 0}small{color:#555}button{margin-bottom:12px;padding:6px 12px}@media print{button{display:none}}</style><button onclick="print()">🖨️ ${escHtml(t('cb_slips'))}</button><h2>${escHtml(cls.className || '')}</h2><div class="grid">${slips}</div>`);
  w.document.close();
}

/* ---- Settings + top-right class switcher hand over to Class Builder ---- */

/* v0.21.2 strings: attendance shared with families, Class Pulse switch, family codes. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  att_share_label:     { en:'Share with families (ParentDeck)', vi:'Chia sẻ với phụ huynh (ParentDeck)' },
  att_share_off:       { en:'Off: attendance stays on this device.', vi:'Tắt: điểm danh chỉ lưu trên máy này.' },
  att_share_on:        { en:'On: present / late / absent is shared with each child\u2019s own parents. {n} of {total} names are matched to the cloud class.', vi:'Bật: có mặt / muộn / vắng được chia sẻ với phụ huynh của từng em. {n}/{total} tên đã khớp với lớp trên mạng.' },
  att_share_confirm:   { en:'Share attendance with families? Each parent sees only their own child\u2019s present / late / absent days (no notes). Your records from the last year will be shared now.', vi:'Chia sẻ điểm danh với phụ huynh? Mỗi phụ huynh chỉ thấy ngày có mặt / muộn / vắng của con mình (không có ghi chú). Dữ liệu của năm qua sẽ được chia sẻ ngay.' },
  att_unshare_confirm: { en:'Stop sharing. Also remove the days already shared from ParentDeck? (OK = remove, Cancel = keep them visible)', vi:'Dừng chia sẻ. Xóa luôn các ngày đã chia sẻ khỏi ParentDeck? (OK = xóa, Hủy = giữ lại)' },
  att_share_failed:    { en:'Attendance couldn\u2019t be shared right now (offline, or the backend is older than v2.0.0). It is still saved here.', vi:'Chưa chia sẻ được điểm danh (mất mạng hoặc máy chủ cũ hơn v2.0.0). Dữ liệu vẫn được lưu tại đây.' },
  cc_pulse_label:      { en:'Class Pulse for families', vi:'Class Pulse cho phụ huynh' },
  cc_pulse_hint:       { en:'Parents who turn it on see their child\u2019s week beside the typical range for the class: ranges only, never names, ranks or another child\u2019s numbers. Classes under 5 students never show it.', vi:'Phụ huynh bật tính năng này sẽ thấy tuần của con bên cạnh khoảng phổ biến của lớp: chỉ là khoảng số, không có tên, thứ hạng hay số liệu của em khác. Lớp dưới 5 học sinh không hiển thị.' },
  cc_pulse_on:         { en:'Class Pulse is on for this class.', vi:'Đã bật Class Pulse cho lớp này.' },
  cc_pulse_off:        { en:'Class Pulse is off for this class.', vi:'Đã tắt Class Pulse cho lớp này.' },
  cc_school:           { en:'School', vi:'Trường' },
  cc_school_none:      { en:'Not in a school yet. Enter the school code from your school admin to join; your classes move with you.', vi:'Chưa thuộc trường nào. Nhập mã trường do quản trị viên cung cấp để tham gia; các lớp của bạn sẽ chuyển theo.' },
  cc_school_in:        { en:'You are in {name}. Your school admin sees your classes in AdminDeck. Another code moves you and your classes.', vi:'Bạn thuộc {name}. Quản trị viên trường xem được các lớp của bạn trong AdminDeck. Nhập mã khác để chuyển trường.' },
  cc_school_join:      { en:'Join', vi:'Tham gia' },
  cc_school_need_code: { en:'Enter the school code first.', vi:'Hãy nhập mã trường trước.' },
  cc_school_joined:    { en:'You joined {name}.', vi:'Bạn đã tham gia {name}.' },
  an_title:            { en:'From your school', vi:'Từ nhà trường' },
  an_title_new:        { en:'From your school ({n} new)', vi:'Từ nhà trường ({n} mới)' },
  an_gotit:            { en:'✓ Got it', vi:'✓ Đã xem' },
  an_toast:            { en:'📬 New note from your school (Cloud Class)', vi:'📬 Có ghi chú mới từ nhà trường (Cloud Class)' },
  cc_family_codes:     { en:'Family codes', vi:'Mã gia đình' },
  cc_parents_family:   { en:'Parents link with their child’s own family code: Class settings → Family codes.', vi:'Phụ huynh liên kết bằng mã gia đình riêng của con: Cài đặt lớp → Mã gia đình.' },
  cc_family_hint:      { en:'Each student has their own code; their parents type it into ParentDeck to link. Students see theirs in StudentDeck \u2192 Class. Give each code only to that child\u2019s family.', vi:'Mỗi học sinh có mã riêng; phụ huynh nhập mã vào ParentDeck để liên kết. Học sinh xem mã trong StudentDeck \u2192 Lớp. Chỉ đưa mỗi mã cho đúng gia đình của em đó.' },
  cc_family_show:      { en:'Show family codes', vi:'Hiện mã gia đình' },
  cc_family_loading:   { en:'Loading\u2026', vi:'Đang tải\u2026' },
  cc_family_none:      { en:'No students have joined this class yet.', vi:'Chưa có học sinh nào tham gia lớp này.' },
  cc_family_unavailable:{ en:'Family codes need backend v2.0.0 or later.', vi:'Mã gia đình cần máy chủ phiên bản v2.0.0 trở lên.' },
  cc_family_copy:      { en:'Copy all', vi:'Sao chép tất cả' },
  cc_family_copied:    { en:'Family codes copied.', vi:'Đã sao chép mã gia đình.' },
  cc_family_copy_failed:{ en:'Couldn\u2019t copy. Select the codes and copy them by hand.', vi:'Không sao chép được. Hãy chọn và sao chép thủ công.' },
  cc_family_new_title: { en:'Make a new code (if this one reached the wrong family)', vi:'Tạo mã mới (nếu mã này đến nhầm gia đình)' },
  cc_family_new_confirm:{ en:'Make a new family code for this student? The old code stops working. Parents already linked stay linked.', vi:'Tạo mã gia đình mới cho học sinh này? Mã cũ sẽ ngừng hoạt động. Phụ huynh đã liên kết vẫn giữ liên kết.' },
});

/* v0.27.0 (backend v2.8.0) strings: Scrapbook Review (Scrapdeck M3). Languages not listed fall back to English. */
Object.assign(STRINGS, {
  srv_need_class:   { en:'Link this class to the cloud (Cloud Class) to review pages students share from Scrapdeck.', vi:'Liên kết lớp này với đám mây (Lớp học đám mây) để duyệt các trang học sinh chia sẻ từ Scrapdeck.' },
  srv_gallery_label:{ en:'Classmates’ gallery', vi:'Thư viện của cả lớp' },
  srv_gallery_hint: { en:'When on, pages approved and shared “to my class” also appear in a gallery classmates can browse in StudentDeck (first names only). Off by default.', vi:'Khi bật, các trang đã duyệt và chia sẻ “với lớp của tôi” sẽ xuất hiện trong thư viện mà bạn cùng lớp có thể xem trong StudentDeck (chỉ tên). Mặc định tắt.' },
  srv_f_pending:    { en:'Waiting', vi:'Đang chờ' },
  srv_f_approved:   { en:'Approved', vi:'Đã duyệt' },
  srv_f_hidden:     { en:'Hidden', vi:'Đã ẩn' },
  srv_f_all:        { en:'All', vi:'Tất cả' },
  srv_empty:        { en:'Nothing here yet.', vi:'Chưa có gì ở đây.' },
  srv_loading:      { en:'Loading…', vi:'Đang tải…' },
  srv_aud_family:   { en:'family', vi:'gia đình' },
  srv_aud_class:    { en:'class', vi:'lớp' },
  srv_status_pending: { en:'waiting for your review', vi:'đang chờ bạn duyệt' },
  srv_status_approved:{ en:'approved', vi:'đã duyệt' },
  srv_status_hidden:  { en:'hidden', vi:'đã ẩn' },
  srv_approve:      { en:'✓ Approve', vi:'✓ Duyệt' },
  srv_hide:         { en:'Hide', vi:'Ẩn' },
  srv_toast_approved:{ en:'Approved — the family/class can now see it.', vi:'Đã duyệt — gia đình/lớp có thể xem.' },
  srv_toast_hidden: { en:'Hidden.', vi:'Đã ẩn.' },
  srv_action_fail:  { en:'Couldn’t do that right now — try again.', vi:'Không thực hiện được — hãy thử lại.' },
  srv_load_fail:    { en:'Couldn’t load shared pages right now.', vi:'Không tải được các trang đã chia sẻ.' },
});

/* v0.29.0 (backend v2.9.0) strings: Board Assignments review (DrawDeck scope step D). Languages not listed fall back to English. */
Object.assign(STRINGS, {
  brv_need_class: { en:'Link this class to the cloud (Cloud Class) to review board assignments.', vi:'Liên kết lớp này với đám mây (Lớp học đám mây) để duyệt bài giao trên bảng.' },
  brv_none:       { en:'No assignments yet — push a page from DrawDeck’s More menu (“Assign this page to students”).', vi:'Chưa có bài giao nào — hãy gửi một trang từ menu Thêm của DrawDeck (“Giao trang này cho học sinh”).' },
  brv_open:       { en:'Open', vi:'Đang mở' },
  brv_closed:     { en:'Closed', vi:'Đã đóng' },
  brv_review:     { en:'Review', vi:'Duyệt' },
  brv_close:      { en:'Close', vi:'Đóng' },
  brv_reopen:     { en:'Reopen', vi:'Mở lại' },
  brv_back:       { en:'← All assignments', vi:'← Tất cả bài giao' },
  brv_empty:      { en:'No submissions yet.', vi:'Chưa có bài nộp nào.' },
  brv_submitted:  { en:'Submitted — not graded yet', vi:'Đã nộp — chưa chấm' },
  brv_graded:     { en:'Graded — +{n} XP', vi:'Đã chấm — +{n} XP' },
  brv_xp_ph:      { en:'XP', vi:'XP' },
  brv_award:      { en:'Award', vi:'Trao thưởng' },
  brv_award_reason:{ en:'Board assignment: {title}', vi:'Bài giao trên bảng: {title}' },
  brv_awarded:    { en:'Awarded {n} XP!', vi:'Đã trao {n} XP!' },
  brv_amount_zero:{ en:'Enter how much XP to award.', vi:'Nhập số XP muốn trao.' },
  brv_action_fail:{ en:'Couldn’t do that right now — try again.', vi:'Không thực hiện được — hãy thử lại.' },
  brv_load_fail:  { en:'Couldn’t load submissions right now.', vi:'Không tải được bài nộp.' },
});

/* v0.21.0 strings: Reward Points, Notes Home mail layout, Cloud Class. Languages not listed fall back to English. */
Object.assign(STRINGS, {
  rewardpoints:     { en:'🏅 Badges & Rewards', vi:'🏅 Huy hiệu & Điểm thưởng' },
  wc_rewardpoints:  { en:'Each student’s badges (automatic, no setup), plus your rewards catalog, what students redeemed, and everyone’s class points.', vi:'Huy hiệu của từng học sinh (tự động, không cần thiết lập), cùng danh mục phần thưởng, những gì học sinh đã đổi, và điểm lớp của mọi người.' },
  rp_tab_badges:    { en:'🏅 Badges', vi:'🏅 Huy hiệu' },
  rp_tab_rewards:   { en:'🎁 Rewards', vi:'🎁 Điểm thưởng' },
  rp_badges_none_yet:{ en:'No badges yet', vi:'Chưa có huy hiệu' },
  rp_top_badge:     { en:'Top badge', vi:'Huy hiệu cao nhất' },
  rp_redeemed_by:   { en:'Rewards redeemed by {name}', vi:'Phần thưởng {name} đã đổi' },
  rp_desc_ph:       { en:'Description (optional)', vi:'Mô tả (tùy chọn)' },
  rp_afford:        { en:'{n} of {m} students can afford this', vi:'{n}/{m} học sinh đủ điểm đổi' },
  rp_off:           { en:'Hidden from students', vi:'Đang ẩn với học sinh' },
  rp_hide:          { en:'Hide', vi:'Ẩn' },
  rp_show:          { en:'Show', vi:'Hiện' },
  rp_delete:        { en:'Delete reward', vi:'Xóa phần thưởng' },
  rp_delete_confirm:{ en:'Delete the reward “{name}”?', vi:'Xóa phần thưởng “{name}”?' },
  rp_redeemed:      { en:'Recently redeemed', vi:'Mới đổi gần đây' },
  rp_redeemed_none: { en:'Nothing redeemed yet.', vi:'Chưa có phần thưởng nào được đổi.' },
  rp_balances:      { en:'Class points', vi:'Điểm lớp' },
  cc_settings:      { en:'Class settings', vi:'Cài đặt lớp' },
  nh_search_ph:     { en:'Search students', vi:'Tìm học sinh' },
  nh_all_notes:     { en:'All notes', vi:'Tất cả ghi chú' },
  nh_n_sent:        { en:'{n} sent', vi:'{n} đã gửi' },
  nh_no_notes_yet:  { en:'No notes yet', vi:'Chưa có ghi chú' },
  nh_to:            { en:'To', vi:'Gửi tới' },
  nh_from:          { en:'From', vi:'Từ' },
  nh_pick_left:     { en:'Tick students on the left', vi:'Tích chọn học sinh ở bên trái' },
  nh_more_n:        { en:'+{n} more', vi:'+{n} nữa' },
  nh_remove_recipient:{ en:'Remove recipient', vi:'Bỏ người nhận' },
  nh_n_students:    { en:'{n} students', vi:'{n} học sinh' },
  nh_read_n:        { en:'{r} of {n} read', vi:'{r}/{n} đã đọc' },
  nh_all_read:      { en:'Read by all', vi:'Tất cả đã đọc' }
});
// Stats & XP is the teacher's OWN stats (the students' are in Student Stats), so it says so.
STRINGS.stats = { en:'📈 My Stats & XP', vi:'Thống kê & XP của tôi' };
STRINGS.xp_pill_tip = { en:'My Stats & XP — click to open', vi:'Thống kê & XP của tôi — nhấn để mở' };
STRINGS.files_time_hint = { en:'📄 Time you spend with a document open counts toward My Stats & XP.', vi:'📄 Thời gian mở tài liệu được tính vào Thống kê & XP của tôi.' };
STRINGS.bd_have_one = { en:'🏅 You already earned 1 badge! Open your Badge Display Case to see it.', vi:'🏅 Bạn đã đạt 1 huy hiệu! Mở Tủ huy hiệu để xem.' };
STRINGS.bd_have_many = { en:'🏅 You already earned {n} badges! Open your Badge Display Case to see them.', vi:'🏅 Bạn đã đạt {n} huy hiệu! Mở Tủ huy hiệu để xem.' };

/* ---------------- Reward Points (v0.21.0) ----------------
   The rewards catalog moved here from Cloud Class: add / hide / delete rewards, who can afford each one, what students recently redeemed, and every
   student's class points. Awarding and removing points still happens on each student's row in Cloud Class. Same cloud calls as before
   (saveReward / deleteReward / subscribeRewards) — nothing new is stored or sent. */
function openWidgetSmart(id){          // open it, un-minimise it or bring it to the front
  if(isOff(id)) setWidgetOff(id, false);
  if(!state.active[id]){ toggleWidget(id); return; }
  const lay = state.layout[id]; if(lay && lay.minimized) toggleMinimize(id);
  const o = widgetEls[id]; if(o) bringToFront(o.el);
}
// The "View badge case" button on a student's card (Student Stats) calls requestBadgeCase(): it opens (or un-minimises) the
// Badges & Rewards widget with that student's own display case already showing — same pattern as requestNotesHome().
let rpPendingStudent = null;
function requestBadgeCase(studentId){
  rpPendingStudent = studentId;
  openWidgetSmart('rewardpoints');
  document.dispatchEvent(new CustomEvent('td:rewardpoints-pending'));
}
function renderRewardPoints(body){
  const unsubs = []; let rewards = [], roster = [], ledger = [], shownClassId = null;
  let activeTab = 'badges', badgesSel = null;   // v0.22.0: Badges tab is read-only/automatic, so it's the default — zero setup needed
  const stopSubs = ()=>{ unsubs.forEach(u=>{ try{ u(); }catch(e){} }); unsubs.length = 0; };
  const q = s => body.querySelector(s), esc = escHtml;
  const hint = (msg, err)=>{ const el = q('#rp-hint'); if(el){ el.textContent = msg || ''; el.classList.toggle('cc-error', !!err); } };
  const active = r => r.active !== false;
  const medalMini = list => list.map(b=> `<span title="${esc(b.name)}">${medalHtml(b, true)}</span>`).join('');

  function draw(){
    stopSubs(); shownClassId = state.cloudClassId || null;
    if(!TDCloud.isConfigured()){ body.innerHTML = notConfiguredHtml(); return; }
    if(!TDCloud.getSession()){
      body.innerHTML = `<div class="cc-panel"><button class="wbtn primary" id="rp-signin">${t('cc_signin')}</button></div>`;
      q('#rp-signin').addEventListener('click', async ()=>{ try{ await TDCloud.signIn(); draw(); }catch(e){ toast(e.message || String(e)); } });
      return;
    }
    if(!state.cloudClassId){
      body.innerHTML = `<div class="cc-panel"><p class="small-hint">${t('nh_need_cloud')}</p><div class="btn-row"><button class="wbtn primary" id="rp-open-cc">${t('nh_open_cloudclass')}</button></div></div>`;
      q('#rp-open-cc').addEventListener('click', ()=> openWidgetSmart('cloudclass'));
      return;
    }
    body.innerHTML = `<div class="rp-tabs" role="tablist">
        <button type="button" class="rp-tab${activeTab === 'badges' ? ' active' : ''}" data-tab="badges" role="tab" aria-selected="${activeTab === 'badges'}">${t('rp_tab_badges')}</button>
        <button type="button" class="rp-tab${activeTab === 'rewards' ? ' active' : ''}" data-tab="rewards" role="tab" aria-selected="${activeTab === 'rewards'}">${t('rp_tab_rewards')}</button>
      </div>
      <div class="rp-pane" id="rp-pane-badges" ${activeTab === 'badges' ? '' : 'hidden'}></div>
      <div class="rp-pane" id="rp-pane-rewards" ${activeTab === 'rewards' ? '' : 'hidden'}><div class="rp-wrap"><div class="rp">
      <section class="rp-left">
        <p class="field-label">${t('cc_rewards')}</p>
        <div class="rp-add">
          <input type="text" id="rp-name" placeholder="${esc(t('cc_reward_name_ph'))}" maxlength="60">
          <input type="number" id="rp-cost" placeholder="${esc(t('cc_reward_cost_ph'))}" min="1">
          <input type="text" id="rp-desc" placeholder="${esc(t('rp_desc_ph'))}" maxlength="120">
          <button type="button" class="wbtn primary" id="rp-add">${t('cc_add_reward')}</button>
        </div>
        <p class="small-hint" id="rp-hint"></p>
        <div class="rp-list" id="rp-list"></div>
      </section>
      <section class="rp-right">
        <p class="field-label">${t('rp_redeemed')}</p><div class="rp-feed" id="rp-feed"></div>
        <p class="field-label">${t('rp_balances')}</p><div class="rp-bal" id="rp-bal"></div>
      </section></div></div></div>`;
    body.querySelectorAll('.rp-tab').forEach(btn=> btn.addEventListener('click', ()=>{
      activeTab = btn.dataset.tab;
      body.querySelectorAll('.rp-tab').forEach(b=>{ b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
      q('#rp-pane-badges').hidden = activeTab !== 'badges';
      q('#rp-pane-rewards').hidden = activeTab !== 'rewards';
    }));
    q('#rp-add').addEventListener('click', async ()=>{
      const name = q('#rp-name').value.trim(), cost = parseInt(q('#rp-cost').value, 10), description = q('#rp-desc').value.trim();
      if(!name || !Number.isFinite(cost) || cost <= 0) return;
      try{
        await TDCloud.saveReward(state.cloudClassId, { name, cost, description });
        track('reward', name);
        q('#rp-name').value = ''; q('#rp-cost').value = ''; q('#rp-desc').value = ''; hint('');
      }catch(err){ hint(err.message || String(err), true); }
    });
    q('#rp-list').addEventListener('click', e=>{
      const card = e.target.closest('[data-id]'); if(!card) return;
      const r = rewards.find(x=> x.id === card.dataset.id); if(!r) return;
      if(e.target.closest('[data-toggle]')) TDCloud.saveReward(state.cloudClassId, { id:r.id, name:r.name, cost:r.cost, description:r.description || '', active:!active(r) }).catch(err=> hint(err.message || String(err), true));
      else if(e.target.closest('[data-del]')){ if(confirm(t('rp_delete_confirm', { name:r.name }))) TDCloud.deleteReward(state.cloudClassId, r.id).catch(err=> hint(err.message || String(err), true)); }
    });
    unsubs.push(TDCloud.subscribeRewards(state.cloudClassId, list=>{ rewards = list; paintList(); }));
    unsubs.push(TDCloud.subscribeRoster(state.cloudClassId, list=>{ roster = list; paintList(); paintBal(); if(rpPendingStudent) applyPending(); else paintBadges(); }));
    unsubs.push(TDCloud.subscribeLedger(state.cloudClassId, rows=>{ ledger = rows; paintFeed(); }));
    unsubs.push(ActivityHub.attach(()=> paintBadges()));
  }
  // A "View badge case" click elsewhere (Student Stats) calls requestBadgeCase(), which sets rpPendingStudent and opens
  // this widget. applyPending() switches to the Badges tab with that student already selected — once per request.
  function applyPending(){
    if(!rpPendingStudent || !roster.some(s=> s.id === rpPendingStudent)) return;
    activeTab = 'badges'; badgesSel = rpPendingStudent; rpPendingStudent = null;
    body.querySelectorAll('.rp-tab').forEach(b=>{ const on = b.dataset.tab === 'badges'; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
    const pb = q('#rp-pane-badges'), pr = q('#rp-pane-rewards'); if(pb) pb.hidden = false; if(pr) pr.hidden = true;
    paintBadges();
  }
  const onPending = ()=> applyPending();
  document.addEventListener('td:rewardpoints-pending', onPending);
  // ---------------- Badges (v0.22.0): fully automatic, read-only — nothing for a teacher to set up.
  // Same recomputed-from-synced-stats badge engine as Student Stats (SS_BADGES/ssBadgeCtx), scoped to the
  // whole roster instead of one student at a time. ActivityHub is a shared app-wide cache, so this doesn't
  // open any new Firestore listeners beyond what's already paid for if Student Stats is also open.
  function paintBadges(){
    const box = q('#rp-pane-badges'); if(!box) return;
    ActivityHub.setRoster(roster.map(s=> s.id));
    if(badgesSel){
      const s = roster.find(x=> x.id === badgesSel);
      if(s){ box.innerHTML = badgeDetailHtml(s); box.querySelector('[data-back]').addEventListener('click', ()=>{ badgesSel = null; paintBadges(); }); return; }
      badgesSel = null;
    }
    box.innerHTML = roster.length ? `<p class="small-hint">${t('ss_overview_hint')}</p><div class="ss-grid">${roster.slice().sort((a, b)=> String(a.displayName).localeCompare(String(b.displayName))).map(s=>{
        const daily = (ActivityHub.get(s.id) || {}).daily || {}, total = ssTotal(s, daily), medals = ssTopMedals(s, total);
        const nEarned = SS_BADGES.filter(b=> b.val(ssBadgeCtx(s, daily)) >= b.need).length;
        return `<button type="button" class="ss-stu" data-sid="${esc(s.id)}" aria-label="${esc(t('ss_open', { name:s.displayName || '' }))}">
          <span class="ss-stu-top"><span class="ss-stu-name"><b>${esc(s.displayName || '')}</b></span></span>
          <span class="ss-medals">${medals.length ? medalMini(medals) : `<span class="muted">${t('rp_badges_none_yet')}</span>`}</span>
          <span class="small-hint">${t('ss_badge_n', { n:nEarned, total:SS_BADGES.length })}</span></button>`;
      }).join('')}</div>` : `<p class="small-hint">${t('cc_no_students')}</p>`;
    box.querySelectorAll('[data-sid]').forEach(btn=> btn.addEventListener('click', ()=>{ badgesSel = btn.dataset.sid; paintBadges(); }));
  }
  function badgeDetailHtml(s){
    const daily = (ActivityHub.get(s.id) || {}).daily || {}, ctx = ssBadgeCtx(s, daily);
    const prog = b=> Math.min(1, b.val(ctx) / b.need);
    const norm = b=> ({ ...b, on:b.val(ctx) >= b.need, progress:prog(b) });   // no countLine/earnedLine: no per-badge unit label or earn date for this recomputed engine
    const earned = SS_BADGES.filter(b=> b.val(ctx) >= b.need), nEarned = earned.length;
    const next = SS_BADGES.filter(b=> b.val(ctx) < b.need).sort((a, c)=> prog(c) - prog(a)).slice(0, 3).map(norm);
    // No earn-date here (these badges are recomputed from synced stats, not stored with a timestamp like StudentDeck's own), so the hero spot is the highest-tier earned badge, not the most recent.
    const spot = earned.slice().sort((a, c)=> c.tier - a.tier)[0];
    const prizes = ledger.filter(e=> e.awardedBy === 'self-redemption' && e.studentId === s.id).slice(0, 12);
    const countLabel = t('ss_badge_n', { n:nEarned, total:SS_BADGES.length });
    const shelves = SS_GROUPS.map(g=> [t('ss_bg_' + g), SS_BADGES.filter(b=> b.group === g).map(b=> bcTileHtml(norm(b))).join('')]);
    return `<button type="button" class="sx-chip" data-back>${t('ss_back')}</button>
      <h3 class="ss-h">${esc(s.displayName || '')}</h3>
      ${bcHeroHtml(spot && norm(spot), countLabel, spot ? `<p class="muted bc-last">${t('rp_top_badge')}: <b>${esc(spot.name)}</b></p>` : '', countLabel)}
      ${next.length ? `<p class="bd-next-h">${t('bd_next')}</p><div class="bd-next">${next.map(bcNextUpHtml).join('')}</div>` : ''}
      ${bcCabinetHtml(shelves)}
      <p class="small-hint">${t('ss_badge_note')}</p>
      <section class="bc-prizes"><h3 class="ss-h ss-h2">${t('rp_redeemed_by', { name:s.displayName || '' })}</h3>
        ${prizes.length ? `<div class="bc-prow">${prizes.map(p=> `<div class="bc-prize"><span class="bc-gift" aria-hidden="true">🎁</span><b>${esc(String(p.reason || '').replace(/^Redeemed:\s*/, ''))}</b><small>${esc(shortWhen(tsMs(p.createdAt)))} · −${Math.abs(+p.delta || 0)} ${t('cc_pts')}</small></div>`).join('')}</div>`
          : `<p class="small-hint">${t('rp_redeemed_none')}</p>`}
      </section>`;
  }
  function paintList(){
    const box = q('#rp-list'); if(!box) return;
    box.innerHTML = rewards.length ? rewards.slice().sort((a, b)=> (a.cost || 0) - (b.cost || 0)).map(r=>{
      const can = roster.filter(s=> (s.xp || 0) >= (r.cost || 0)).length;
      return `<div class="rp-card${active(r) ? '' : ' off'}" data-id="${esc(r.id)}">
        <div class="rp-card-top"><b>🎁 ${esc(r.name)}</b><span class="rp-cost">${r.cost} ${t('cc_pts')}</span></div>
        ${r.description ? `<small>${esc(r.description)}</small>` : ''}
        <div class="rp-meta">${active(r) ? t('rp_afford', { n:can, m:roster.length }) : t('rp_off')}</div>
        <div class="rp-actions"><button type="button" class="wbtn" data-toggle>${active(r) ? t('rp_hide') : t('rp_show')}</button><button type="button" class="sb-btn minus" data-del title="${esc(t('cc_delete_reward_tip') || '')}" aria-label="${esc(t('rp_delete'))}">🗑️</button></div>
      </div>`;
    }).join('') : `<p class="small-hint">${t('cc_no_rewards')}</p>`;
  }
  function paintFeed(){
    const box = q('#rp-feed'); if(!box) return;
    const names = new Map(roster.map(s=> [s.id, s.displayName]));
    const rows = ledger.filter(e=> e.awardedBy === 'self-redemption').slice(0, 15);
    box.innerHTML = rows.length ? rows.map(e=>`<div class="rp-feedrow"><span>🎁</span><span class="rp-feedtxt"><b>${esc(names.get(e.studentId) || t('ca_someone'))}</b> — ${esc(String(e.reason || '').replace(/^Redeemed:\s*/, ''))}</span><b>−${Math.abs(+e.delta || 0)}</b><small>${esc(shortWhen(tsMs(e.createdAt)))}</small></div>`).join('') : `<p class="small-hint">${t('rp_redeemed_none')}</p>`;
  }
  function paintBal(){
    const box = q('#rp-bal'); if(!box) return;
    const rows = roster.slice().sort((a, b)=> (b.xp || 0) - (a.xp || 0)), mx = Math.max(1, ...rows.map(s=> s.xp || 0));
    box.innerHTML = rows.length ? rows.map((s, n)=>`<div class="sx-bar" style="--n:${n}"><span title="${esc(s.displayName || '')}">${esc(s.displayName || '—')}</span><div><i style="width:${Math.round((s.xp || 0) / mx * 100)}%"></i></div><b>${s.xp || 0}</b></div>`).join('') : `<p class="small-hint">${t('cc_no_students')}</p>`;
  }
  const unsubAuth = TDCloud.onAuthChanged(draw);
  draw();
  const poll = setInterval(()=>{ if((state.cloudClassId || null) !== shownClassId) draw(); }, 1500);     // linking happens in Cloud Class, which doesn't announce it
  return ()=>{ clearInterval(poll); stopSubs(); unsubAuth(); document.removeEventListener('td:rewardpoints-pending', onPending); rpPendingStudent = null; };
}


