/* ---------------- Document stage ----------------
   A full-screen layer inside #wall, between the ordinary widgets (below) and
   the pinned widgets (above) — see the z-index bands next to bringToFront().
   It shows one document at a time in an iframe:
     - a PDF from the Files widget, in the browser's own PDF viewer (a blob URL,
       deliberately NOT sandboxed: a sandboxed frame disables Chrome's PDF viewer);
     - a pasted Google Docs / Slides / Sheets / Forms / Drive link, as its
       embeddable /preview (or published) URL, in a sandboxed frame. The /edit
       URL cannot be framed (Google sends X-Frame-Options: SAMEORIGIN), so
       "Edit in Google" opens it in a tab instead.
   Closing the stage removes the iframe and revokes the blob URL. */
const GOOGLE_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads';
const GDOC_LABEL = { document:'DOC', presentation:'SLIDES', spreadsheets:'SHEET', forms:'FORM', drive:'DRIVE' };
const GDOC_NAME  = { document:'Google Doc', presentation:'Google Slides', spreadsheets:'Google Sheet', forms:'Google Form', drive:'Drive file' };
let docLoadTimer = null;
let docSeq = 0;                 // bumped whenever the stage's document changes
let docConvAbort = null;        // AbortController for an Office conversion in flight

function parseGoogleLink(raw){
  let u;
  try{ u = new URL(String(raw || '').trim()); }catch(e){ return null; }
  if(u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase(), path = u.pathname;
  let m;
  if(host === 'docs.google.com'){
    m = /^\/(document|presentation|spreadsheets|forms)(?:\/u\/\d+)?\/d\/(e\/)?([A-Za-z0-9_-]+)/.exec(path);
    if(!m) return null;
    const gtype = m[1], published = !!m[2], id = m[3];
    const base = 'https://docs.google.com/' + gtype + '/d/' + (published ? 'e/' : '') + id;
    if(gtype === 'forms'){
      if(!published) return null;     // the form editor can't be framed; only the live form (viewform) can
      return { gtype, id, src: base + '/viewform?embedded=true', tab: base + '/viewform' };
    }
    if(published){
      const src = gtype === 'document' ? '/pub?embedded=true' : gtype === 'presentation' ? '/embed' : '/pubhtml?widget=true&headers=false';
      const tab = gtype === 'spreadsheets' ? '/pubhtml' : '/pub';
      return { gtype, id, src: base + src, tab: base + tab };
    }
    return { gtype, id, src: base + '/preview', tab: base + '/edit' };
  }
  if(host === 'drive.google.com'){
    m = /^\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/.exec(path);
    const id = m ? m[1] : (path === '/open' ? u.searchParams.get('id') : null);
    if(!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
    return { gtype:'drive', id, src:'https://drive.google.com/file/d/' + id + '/preview', tab:'https://drive.google.com/file/d/' + id + '/view' };
  }
  return null;
}

function docStageOpen(){ return !!(docStage && !docStage.el.hidden); }




function openDocMenu(){
  closeDocMenu();
  const menu = docStage.menu;
  const open = WIDGETS.filter(d => state.active[d.id] && widgetEls[d.id]);
  menu.innerHTML = '';
  const hint = document.createElement('p');
  hint.className = 'doc-menu-hint';
  hint.textContent = t('doc_widgets_hint');
  menu.appendChild(hint);
  if(!open.length){
    const none = document.createElement('p');
    none.className = 'doc-menu-empty';
    none.textContent = t('doc_no_widgets');
    menu.appendChild(none);
  } else {
    const bar = document.createElement('div');
    bar.className = 'doc-menu-bar';
    [['doc_pin_all', true], ['doc_unpin_all', false]].forEach(([key, on])=>{
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'doc-menu-link'; b.textContent = t(key);
      b.addEventListener('click', ()=>{ open.forEach(d => setPinned(d.id, on)); openDocMenu(); });
      bar.appendChild(b);
    });
    menu.appendChild(bar);
    open.forEach(d=>{
      const row = document.createElement('label');
      row.className = 'doc-menu-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = widgetEls[d.id].el.dataset.onTop === '1';
      cb.addEventListener('change', ()=> setPinned(d.id, cb.checked));
      const span = document.createElement('span');
      span.textContent = widgetLabel(d.labelKey);
      row.appendChild(cb); row.appendChild(span);
      menu.appendChild(row);
    });
  }
  menu.hidden = false;
  docStage.menuBtn.setAttribute('aria-expanded', 'true');
}


// doc: { kind:'pdf', name, blob }  or  { kind:'google', name, src, tabUrl, editUrl }

function docXpLine(){ return docCur ? docXpGranted(docCur) : 0; }
function drawDocTime(){
  if(!docStage || !docStage.time) return;
  const r = dayRec(), here = docCur ? ((r.docSecs || {})[docKeyOf(docCur)] || 0) : 0;
  docStage.time.textContent = t('doc_time', { here:fmtDur(here), today:fmtDur(r.timeBy[DOC_KEY] || 0), xp:docXpLine(), max:DOC_XP_PER_DOC });
  docStage.time.title = t('doc_time_tip', { max:DOC_XP_PER_DOC });
}
function docAskStillReading(){ if(docStage && docStage.idle.hidden) docStage.idle.hidden = false; }

// While a document is open the app header and the document toolbar share ONE slim row: keep the toolbar clear of the brand and
// the top widget launchers (left) and of the pills / top drawer (right).
function updateDocTop(){
  const br = document.querySelector('.brand'), ta = document.querySelector('.top-actions'), tw = document.getElementById('dock-top-widgets'), xp = document.getElementById('xp-pill'), bc = document.getElementById('badge-chip'), dt = document.getElementById('dock-top');
  if(!br) return;
  let l = Math.ceil(br.getBoundingClientRect().right) + 12;
  [xp, bc, tw].forEach(n => { if(n && n.getClientRects().length) l = Math.max(l, Math.ceil(n.getBoundingClientRect().right) + 12); });
  let r = 12;
  [ta, dt].forEach(n => { if(n && !n.hidden && n.getClientRects().length && n.children.length) r = Math.max(r, Math.ceil(window.innerWidth - n.getBoundingClientRect().left) + 12); });
  if(l > 40 && r < window.innerWidth * 0.6){ const st = document.documentElement.style; st.setProperty('--hdr-l', l + 'px'); st.setProperty('--hdr-r', r + 'px'); }
  // One shared row only if the toolbar's buttons (plus a little room for the title) fit between the two header groups;
  // otherwise the toolbar drops to its own row under the header (still kept clear of the top drawer on the right).
  const tools = docStage && docStage.el.querySelector('.doc-tools');
  if(tools){ document.body.classList.toggle('doc-two-row', window.innerWidth < 900 || window.innerWidth - l - r < tools.offsetWidth + 150); }
}

function buildDocStage(){
  if(docStage) return docStage;
  const el = document.createElement('div');
  el.className = 'doc-stage';
  el.id = 'doc-stage';
  el.hidden = true;
  el.innerHTML = `
    <div class="doc-toolbar" role="toolbar" aria-label="${t('doc_toolbar')}" data-i18n-aria="doc_toolbar">
      <span class="doc-title"></span>
      <span class="doc-time" title=""></span>
      <button type="button" class="doc-hint" hidden data-i18n="doc_not_loading">${t('doc_not_loading')}</button>
      <div class="doc-tools">
        <div class="doc-menu-wrap">
          <button type="button" class="doc-btn doc-track-btn" aria-haspopup="true" aria-expanded="false" data-i18n="doc_track" data-i18n-title="doc_track_tip" title="${t('doc_track_tip')}">${t('doc_track')}</button>
          <div class="doc-menu doc-track-menu" hidden></div>
        </div>
        <div class="doc-menu-wrap">
          <button type="button" class="doc-btn doc-widgets-btn" aria-haspopup="true" aria-expanded="false">${iconSvg('pin','wsvg')}<span data-i18n="doc_widgets_menu">${t('doc_widgets_menu')}</span></button>
          <div class="doc-menu doc-widgets-menu" hidden></div>
        </div>
        <button type="button" class="doc-btn doc-reconvert" hidden data-i18n="doc_reconvert">${t('doc_reconvert')}</button>
        <button type="button" class="doc-btn doc-edit" hidden data-i18n="doc_edit_google">${t('doc_edit_google')}</button>
        <button type="button" class="doc-btn doc-tab" data-i18n="doc_open_tab">${t('doc_open_tab')}</button>
        <button type="button" class="doc-btn doc-app" hidden></button>
        <button type="button" class="doc-btn doc-pdftools" hidden aria-pressed="false" data-i18n="doc_pdf_tools" data-i18n-title="doc_pdf_tools_tip" title="${t('doc_pdf_tools_tip')}">${t('doc_pdf_tools')}</button>
        <button type="button" class="doc-btn doc-full" aria-label="${t('doc_fullscreen')}" title="${t('doc_fullscreen')}" data-i18n-aria="doc_fullscreen" data-i18n-title="doc_fullscreen">⛶</button>
        <button type="button" class="doc-btn doc-collapse" data-i18n-aria="doc_collapse" data-i18n-title="doc_collapse" aria-label="${t('doc_collapse')}" title="${t('doc_collapse')}">▴</button>
        <button type="button" class="doc-btn primary doc-close" data-i18n="doc_close">${t('doc_close')}</button>
      </div>
    </div>
    <button type="button" class="doc-handle" hidden data-i18n-aria="doc_expand" data-i18n-title="doc_expand" aria-label="${t('doc_expand')}" title="${t('doc_expand')}">▾</button>
    <div class="doc-frame-wrap"></div>
    <div class="doc-status" hidden>
      <div class="doc-spinner" aria-hidden="true"></div>
      <p class="doc-status-msg" role="status"></p>
      <div class="doc-status-actions"></div>
    </div>
    <div class="doc-idle" role="alertdialog" aria-label="${t('doc_still_reading_aria')}" data-i18n-aria="doc_still_reading_aria" hidden>
      <p data-i18n="doc_still_reading">${t('doc_still_reading')}</p>
      <button type="button" class="wbtn primary doc-idle-yes" data-i18n="doc_still_yes">${t('doc_still_yes')}</button>
    </div>
    <div class="doc-fallback" hidden>
      <p data-i18n="doc_fallback_msg">${t('doc_fallback_msg')}</p>
      <button type="button" class="wbtn primary doc-fallback-tab" data-i18n="doc_open_tab">${t('doc_open_tab')}</button>
    </div>`;
  wall.appendChild(el);
  const q = sel => el.querySelector(sel);
  docStage = {
    el,
    title: q('.doc-title'), time: q('.doc-time'), hint: q('.doc-hint'), wrap: q('.doc-frame-wrap'),
    menu: q('.doc-widgets-menu'), menuBtn: q('.doc-widgets-btn'),
    tmenu: q('.doc-track-menu'), tmenuBtn: q('.doc-track-btn'), pdfBtn: q('.doc-pdftools'),
    editBtn: q('.doc-edit'), tabBtn: q('.doc-tab'), appBtn: q('.doc-app'), fallback: q('.doc-fallback'), idle: q('.doc-idle'),
    reconvertBtn: q('.doc-reconvert'), status: q('.doc-status'), statusMsg: q('.doc-status-msg'),
    statusActions: q('.doc-status-actions'), spinner: q('.doc-spinner'),
    handle: q('.doc-handle')
  };
  const openTab = ()=> docOpenInTab();
  docStage.tabBtn.addEventListener('click', openTab);
  q('.doc-fallback-tab').addEventListener('click', openTab);
  docStage.hint.addEventListener('click', openTab);
  docStage.editBtn.addEventListener('click', ()=>{
    if(docCur && docCur.editUrl) window.open(docCur.editUrl, '_blank', 'noopener');
  });
  docStage.appBtn.addEventListener('click', ()=>{ if(docCur && docCur.office && docCur.office.rec) launchInApp(docCur.office.rec); });
  q('.doc-close').addEventListener('click', closeDocViewer);
  q('.doc-idle-yes').addEventListener('click', ()=>{ lastDocPoke = Date.now(); docStage.idle.hidden = true; });
  docStage.reconvertBtn.addEventListener('click', ()=> reconvertOffice());
  const setCollapsed = on=>{
    el.classList.toggle('collapsed', on);
    document.body.classList.toggle('doc-collapsed', on);
    docStage.handle.hidden = !on;
    q('.doc-toolbar').hidden = on;
    if(!on) requestAnimationFrame(updateDocTop);
  };
  q('.doc-collapse').addEventListener('click', ()=> setCollapsed(true));
  docStage.handle.addEventListener('click', ()=> setCollapsed(false));
  docStage.setCollapsed = setCollapsed;
  docStage.menuBtn.addEventListener('click', e=>{
    e.stopPropagation();
    if(docStage.menu.hidden) openDocMenu(); else closeDocMenu();
  });
  docStage.menu.addEventListener('click', e=> e.stopPropagation());
  docStage.tmenuBtn.addEventListener('click', e=>{
    e.stopPropagation();
    if(docStage.tmenu.hidden) openTrackMenu(); else closeDocMenu();
  });
  docStage.tmenu.addEventListener('click', e=> e.stopPropagation());
  q('.doc-full').addEventListener('click', toggleDocFullscreen);
  docStage.pdfBtn.addEventListener('click', ()=>{ tdx.pdfTools = !tdx.pdfTools; xSave(); reloadPdfFrame(); });
  document.addEventListener('click', closeDocMenu);
  document.addEventListener('keydown', e=>{ if(e.key === 'Escape') closeDocMenu(); });
  window.addEventListener('resize', updateDocTop);
  if(typeof ResizeObserver !== 'undefined'){
    const ro = new ResizeObserver(updateDocTop);
    ['.brand', '.top-actions', '#dock-top-widgets', '#xp-pill', '#badge-chip', '#dock-top'].forEach(s => { const n = document.querySelector(s); if(n) ro.observe(n); });
  }
  // Focus moving into the iframe means the teacher just clicked into the document: that's activity we can see.
  window.addEventListener('blur', ()=> setTimeout(()=>{
    if(docStageOpen() && document.activeElement && document.activeElement.tagName === 'IFRAME' && el.contains(document.activeElement)){ lastDocPoke = Date.now(); docStage.idle.hidden = true; }
  }, 0));
  return docStage;
}

function toggleDocFullscreen(){
  try{
    if(document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(()=> toast(t('doc_fullscreen_fail')));
  }catch(e){ /* unsupported */ }
}

function closeDocMenu(){
  if(!docStage) return;
  if(!docStage.menu.hidden){ docStage.menu.hidden = true; docStage.menuBtn.setAttribute('aria-expanded', 'false'); }
  if(!docStage.tmenu.hidden){ docStage.tmenu.hidden = true; docStage.tmenuBtn.setAttribute('aria-expanded', 'false'); }
}

function openTrackMenu(){
  if(!docStage || !docCur) return;
  closeDocMenu();
  const menu = docStage.tmenu;
  menu.innerHTML = '';
  const hint = document.createElement('p');
  hint.className = 'doc-menu-hint';
  hint.textContent = t('doc_track_hint');
  menu.appendChild(hint);
  const row = document.createElement('label');
  row.className = 'doc-menu-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.checked = !!tdx.docToReading;
  cb.addEventListener('change', ()=>{ tdx.docToReading = cb.checked; xSave(); });
  const sp = document.createElement('span');
  sp.textContent = t('doc_track_reading');
  row.appendChild(cb); row.appendChild(sp);
  menu.appendChild(row);
  menu.hidden = false;
  docStage.tmenuBtn.setAttribute('aria-expanded', 'true');
}

// Chrome's PDF viewer reads display options from the URL fragment: toolbar=0 hides its top bar, navpanes=0 the thumbnail
// sidebar. Both are hidden by default (more room to read); the toolbar's "PDF tools" button brings them back for zoom,
// page jump, download and print. Chrome decides whether to honour these options.
const pdfFrag = () => '#' + (tdx.pdfTools ? '' : 'toolbar=0&navpanes=0&') + 'view=FitH';
function reloadPdfFrame(){      // a fragment change alone doesn't re-apply these options, so swap in a fresh iframe (reading position is lost)
  if(!docStage || !docCur || docCur.kind !== 'pdf') return;
  const old = docStage.wrap.querySelector('iframe');
  if(!old) return;
  const f = document.createElement('iframe');
  f.title = old.title; f.setAttribute('allow', 'fullscreen'); f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.src = docCur.objUrl + pdfFrag();
  old.replaceWith(f);
  docStage.pdfBtn.setAttribute('aria-pressed', String(!!tdx.pdfTools));
  lastDocPoke = Date.now();
}

function clearDocFrame(){
  if(docLoadTimer){ clearTimeout(docLoadTimer); docLoadTimer = null; }
  if(docStage){
    docStage.wrap.innerHTML = '';        // removing the iframe stops whatever it was loading/playing
    docStage.fallback.hidden = true;
    docStage.status.hidden = true;
    docStage.idle.hidden = true;
  }
  if(docCur && docCur.objUrl){ try{ URL.revokeObjectURL(docCur.objUrl); }catch(e){} }
}

// doc: { id?, kind:'pdf', name, blob }  or  { id?, kind:'google', name, src, tabUrl, editUrl }
function openDocViewer(doc){
  docSeq++;                      // supersedes any conversion still in flight
  const st = buildDocStage();
  closeDocLog();
  clearDocFrame();
  closeDocMenu();
  docCur = doc;
  noteDocOpen(doc);
  let src;
  if(doc.kind === 'pdf'){
    // Files picked from disk can arrive without a MIME type; Chrome only
    // hands a blob to its PDF viewer when it is labelled application/pdf.
    const blob = doc.blob.type === 'application/pdf' ? doc.blob : new Blob([doc.blob], { type:'application/pdf' });
    doc.objUrl = URL.createObjectURL(blob);
    src = doc.objUrl + pdfFrag();
  } else {
    src = doc.src;
  }
  const frame = document.createElement('iframe');
  frame.title = doc.name || '';
  frame.setAttribute('allow', 'fullscreen');
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  if(doc.kind === 'google') frame.setAttribute('sandbox', GOOGLE_SANDBOX);
  st.title.textContent = doc.name || '';
  st.hint.hidden = doc.kind !== 'google';
  st.editBtn.hidden = !(doc.kind === 'google' && doc.editUrl);
  st.reconvertBtn.hidden = !doc.office;
  st.appBtn.hidden = !(doc.office && doc.office.rec);
  if(!st.appBtn.hidden) st.appBtn.textContent = '🖥 ' + t('office_open_app', { app:appNameFor(doc.name) });
  st.pdfBtn.hidden = doc.kind !== 'pdf';
  st.pdfBtn.setAttribute('aria-pressed', String(!!tdx.pdfTools));
  // A page Google refuses to frame fires no error, only (at best) a load of
  // its error page. If nothing has loaded after 6 s, say what to do.
  if(doc.kind === 'google'){
    docLoadTimer = setTimeout(()=>{ docLoadTimer = null; st.fallback.hidden = false; }, 6000);
    frame.addEventListener('load', ()=>{ if(docLoadTimer){ clearTimeout(docLoadTimer); docLoadTimer = null; } });
  }
  frame.src = src;
  st.wrap.appendChild(frame);
  st.setCollapsed(false);
  st.el.hidden = false;
  document.body.classList.add('doc-open');
  updateDocTop();
  lastDocPoke = Date.now();
  drawDocTime();
  // Widgets that were already open stay where they are: behind the document
  // unless pinned. The Widgets menu in the toolbar is the way to bring one forward.
}

function closeDocViewer(){
  if(!docStage) return;
  docSeq++;
  if(docConvAbort){ docConvAbort.abort(); docConvAbort = null; }
  closeDocMenu();
  closeDocLog();
  const o = docCur && docCur.office;
  if(o && state.docViewer && state.docViewer.removeCopyOnClose && typeof TDDrive !== 'undefined'){
    TDDrive.trash(o.fileId).then(()=> idb.delete('gdocs', o.sha)).catch(e=> console.warn('TeachersDeck: could not remove the Google copy', e));
  }
  clearDocFrame();
  docStage.el.hidden = true;
  docCur = null;
  document.body.classList.remove('doc-open', 'doc-collapsed');
  xSave(); refreshStats();
  if(filesRedraw) filesRedraw();
}


function docOpenInTab(){
  if(!docCur) return;
  if(docCur.kind === 'office'){ window.open(URL.createObjectURL(docCur.blob), '_blank'); return; }
  if(docCur.kind === 'pdf'){
    // A fresh blob URL: the stage's own one is revoked when the stage closes.
    const blob = docCur.blob.type === 'application/pdf' ? docCur.blob : new Blob([docCur.blob], { type:'application/pdf' });
    window.open(URL.createObjectURL(blob), '_blank');
  } else {
    window.open(docCur.tabUrl, '_blank', 'noopener');
  }
}

function renderFiles(body){
  body.innerHTML = `
    <div class="file-drop"><button type="button" class="file-drop-browse" id="file-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button>${typeof DrivePick !== 'undefined' && DrivePick.available() ? `<button type="button" class="file-drop-browse" id="file-drive">${iconSvg('cloud','wsvg')}<span data-i18n="drive_btn">${t('drive_btn')}</span></button>` : ''}</div>
    <input type="file" id="file-input" hidden multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx">
    <form class="file-glink" id="file-glink" autocomplete="off">
      <input type="text" id="glink-url" placeholder="${t('doc_link_ph')}" data-i18n-placeholder="doc_link_ph" aria-label="${t('doc_add_link')}" data-i18n-aria="doc_add_link">
      <input type="text" id="glink-name" placeholder="${t('doc_name_ph')}" data-i18n-placeholder="doc_name_ph">
      <button type="submit" class="wbtn" data-i18n="doc_add_link">${t('doc_add_link')}</button>
    </form>
    <div class="file-sortrow"><span class="small-hint" data-i18n="files_sort">${t('files_sort')}</span>
      <select id="file-sort" aria-label="${t('files_sort')}" data-i18n-aria="files_sort">
        <option value="recent" data-i18n="files_sort_recent">${t('files_sort_recent')}</option>
        <option value="time" data-i18n="files_sort_time">${t('files_sort_time')}</option>
        <option value="added" data-i18n="files_sort_added">${t('files_sort_added')}</option>
      </select></div>
    <div class="file-sortrow"><span class="small-hint" data-i18n="files_office_pref">${t('files_office_pref')}</span>
      <select id="file-office-pref" aria-label="${t('files_office_pref')}" data-i18n-aria="files_office_pref">
        <option value="google" data-i18n="files_office_google">${t('files_office_google')}</option>
        <option value="app" data-i18n="files_office_app">${t('files_office_app')}</option>
      </select></div>
    <ul class="file-list"></ul>
    <p class="small-hint" data-i18n="files_time_hint">${t('files_time_hint')}</p>
  `;
  const list = body.querySelector('.file-list');
  const input = body.querySelector('#file-input');
  body.querySelector('#file-browse').addEventListener('click', ()=> input.click());
  // Google Drive (js/drivepick.js): picked files are saved as Google links, so they show like a pasted link
  const driveBtn = body.querySelector('#file-drive');
  if(driveBtn) driveBtn.addEventListener('click', async ()=>{
    let picked;
    try{ picked = await DrivePick.pick(state.lang); }catch(e){ toast(t('drive_blocked'), 5000); return; }
    if(!picked.length) return;
    for(const p of picked) await idb.put('files', { id:cid(), kind:'glink', name:p.name, url:p.url, gtype:p.gtype, added:Date.now() });
    draw();
    toast(t('drive_added', { n:picked.length }));
  });

  function showFile(f){
    if(f.kind === 'glink'){
      const g = parseGoogleLink(f.url);
      if(!g){ toast(t('doc_link_invalid')); return; }
      openDocViewer({ id:f.id, kind:'google', name:f.name, src:g.src, tabUrl:g.tab, editUrl: g.gtype === 'forms' ? null : g.tab });
      return;
    }
    if(extOf(f.name) === 'pdf' || (f.blob && f.blob.type === 'application/pdf')){
      openDocViewer({ id:f.id, kind:'pdf', name:f.name, blob:f.blob });
      return;
    }
    // Word / PowerPoint / Excel can't be rendered by the browser itself: Pro converts them
    // through Google (showOffice); anything else just opens in a tab.
    if(isOfficeFile(f)){ openOfficeFile(f); return; }
    toast(t('doc_office_tab'));
    window.open(URL.createObjectURL(f.blob), '_blank');
  }

  async function draw(){
    const files = await idb.getAll('files');
    const DT = tdx.docTime, by = tdx.filesSort;
    files.sort((a, c) => by === 'time' ? ((DT[c.id] || {}).secs || 0) - ((DT[a.id] || {}).secs || 0) || (c.added || 0) - (a.added || 0)
      : by === 'added' ? (c.added || 0) - (a.added || 0)
      : by === 'recent' ? ((DT[c.id] || {}).last || c.added || 0) - ((DT[a.id] || {}).last || a.added || 0)
      : 0);
    list.innerHTML = '';
    if(!files.length){
      list.innerHTML = `<li class="file-empty" data-i18n="files_empty">${t('files_empty')}</li>`;
      return;
    }
    files.forEach(f=>{
      const isLink = f.kind === 'glink';
      const li = document.createElement('li');
      const label = isLink ? (GDOC_LABEL[f.gtype] || 'LINK') : (EXT_LABEL[extOf(f.name)] || extOf(f.name).toUpperCase() || 'FILE');
      li.innerHTML = `<span class="ftype">${label}</span><span class="fname fname-link" role="button" tabindex="0"></span><span class="ftime"></span><button type="button" class="file-show" aria-label="${t('doc_show')}" title="${t('doc_show')}">${iconSvg('expand','wsvg')}</button><button type="button" class="file-open" aria-label="${t('open_action')}">↗</button><button type="button" class="file-del" aria-label="${t('remove')}" title="${t('remove')}">${iconSvg('close','wsvg')}</button>`;
      const nameEl = li.querySelector('.fname');
      nameEl.textContent = f.name;
      nameEl.title = f.name;
      const dt = DT[f.id];
      if(dt && dt.secs){ const tm = li.querySelector('.ftime'); tm.textContent = '⏱ ' + fmtDur(dt.secs); tm.title = t('files_time_tip', { n:dt.opens }); }
      const show = ()=> showFile(f);
      const office = isOfficeFile(f);
      const showHere = ()=> office ? (officeCanConvert() ? showOffice(f) : launchInApp(f)) : showFile(f);
      const openBtn = li.querySelector('.file-open');
      if(office){ openBtn.textContent = '🖥'; openBtn.title = openBtn.ariaLabel = t('office_open_app', { app:appNameFor(f.name) }); openBtn.classList.add('file-app'); }
      nameEl.addEventListener('click', show);
      nameEl.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); show(); } });
      li.querySelector('.file-show').addEventListener('click', showHere);
      li.querySelector('.file-open').addEventListener('click', ()=>{
        if(office){ launchInApp(f); return; }
        if(isLink){
          const g = parseGoogleLink(f.url);
          if(g) window.open(g.tab, '_blank', 'noopener');
          return;
        }
        const url = URL.createObjectURL(f.blob);
        window.open(url, '_blank');
      });
      li.querySelector('.file-del').addEventListener('click', async ()=>{
        await idb.delete('files', f.id);
        draw();
      });
      list.appendChild(li);
    });
  }

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('files', { id:cid(), name:file.name, blob:file, added:Date.now() });
      track('file', file.name);
    }
    input.value = '';
    draw();
    toast(t('file_added'));
  });

  body.querySelector('#file-glink').addEventListener('submit', async e=>{
    e.preventDefault();
    const urlEl = body.querySelector('#glink-url'), nameEl = body.querySelector('#glink-name');
    const g = parseGoogleLink(urlEl.value);
    if(!g){ toast(t('doc_link_invalid')); return; }
    const name = nameEl.value.trim() || (GDOC_NAME[g.gtype] + ' ' + g.id.slice(0, 6));
    await idb.put('files', { id:cid(), kind:'glink', name, url:urlEl.value.trim(), gtype:g.gtype, added:Date.now() });
    urlEl.value = ''; nameEl.value = '';
    draw();
    toast(t('doc_link_added'));
  });

  const sortEl = body.querySelector('#file-sort');
  sortEl.value = tdx.filesSort;
  sortEl.addEventListener('change', ()=>{ tdx.filesSort = sortEl.value; xSave(); draw(); });
  const prefEl = body.querySelector('#file-office-pref');
  prefEl.value = officePref();
  prefEl.addEventListener('change', ()=>{ tdx.officePref = prefEl.value; xSave(); });

  filesRedraw = draw;
  draw();
  return ()=>{ if(filesRedraw === draw) filesRedraw = null; };
}


function renderGames(body){
  body.innerHTML = `
    <div class="file-drop"><button type="button" class="file-drop-browse" id="game-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
    <input type="file" id="game-input" hidden multiple accept=".html,.htm">
    <p class="drawer-label" data-i18n="games_mine">${t('games_mine')}</p>
    <div class="game-grid"></div>
    <p class="file-empty" style="margin-top:6px" data-i18n="games_note">${t('games_note')}</p>
    <div class="games-builtin-section" hidden>
      <p class="drawer-label" data-i18n="games_builtin">${t('games_builtin')}</p>
      <div class="game-grid builtin-game-grid"></div>
    </div>
  `;
  const grid = body.querySelector('.game-grid:not(.builtin-game-grid)');
  const input = body.querySelector('#game-input');
  body.querySelector('#game-browse').addEventListener('click', ()=> input.click());
  const builtinSection = body.querySelector('.games-builtin-section');
  const builtinGrid = body.querySelector('.builtin-game-grid');

  function launch(g){
    track('game', String(g.name || '').replace(/\.(html?)$/i, ''));
    const url = URL.createObjectURL(g.blob);
    window.open(url, '_blank');
  }

  // Built-in games: static files in the games/ folder. The list comes from two
  // places so the games are there
  // however the app is opened:
  //   1. games/games.js — a script generated from games.json. A <script src>
  //      loads on every route (the extension,
  //      a web server, or index.html double-clicked from a folder), so this is
  //      what makes the games preloaded everywhere.
  //   2. games/games.json — fetched when the browser allows it (extension / web
  //      server), so a game added to games.json shows up right away. Browsers
  //      block that fetch for a double-clicked index.html, which is exactly why
  //      (1) exists. Entries here win over (1) when both name the same folder.
  async function drawBuiltin(){
    let list = Array.isArray(window.TD_BUILTIN_GAMES) ? window.TD_BUILTIN_GAMES.slice() : [];
    try{
      const res = await fetch('games/games.json');
      if(res.ok){
        const fresh = await res.json();
        if(Array.isArray(fresh)){
          const byFolder = new Map(list.map(g=>[g && g.folder, g]));
          fresh.forEach(g=>{ if(g && g.folder) byFolder.set(g.folder, g); });
          list = [...byFolder.values()];
        }
      }
    }catch(e){ /* fetch blocked (file://) — the preloaded list above is used */ }
    if(!Array.isArray(list) || !list.length){ builtinSection.hidden = true; return; }
    builtinSection.hidden = false;
    builtinGrid.innerHTML = '';
    list.forEach(g=>{
      if(!g || !g.folder || !g.entry) return;
      const tile = document.createElement('button');
      tile.className = 'game-tile';
      tile.title = `${t('play')} ${g.name || g.folder}`;
      tile.innerHTML = `
        ${g.instructions ? `<span class="game-tile-help" aria-label="${t('how_to_play')} ${g.name || g.folder}">?</span>` : ''}
        <span class="game-tile-play">${iconSvg('game')}</span>
        <span class="game-tile-name"></span>
      `;
      tile.querySelector('.game-tile-name').textContent = g.name || g.folder;
      tile.addEventListener('click', async ()=>{
        // The app's language goes along: games that speak it (Maths and Science: English and Vietnamese) follow it.
        const url = `games/${g.folder}/${g.entry}?lang=${encodeURIComponent(state.lang || 'en')}`;
        track('game', g.name || g.folder);
        // Opened straight from a folder (file://), the browser won't let a
        // page fetch() sibling files, so the reachability check below would
        // always fail; the game opens fine as a file, so just open it.
        if(location.protocol === 'file:'){ window.open(url, '_blank'); return; }
        // Verify the file is actually reachable before opening a new tab —
        // window.open() itself can't report a 404, so without this check a
        // bad hosting context (single-file artifact, wrong server root) just
        // opens a blank/broken tab with no explanation. See
        // games_unreachable_toast below.
        try{
          const res = await fetch(url, { method:'HEAD' });
          if(!res.ok) throw new Error('not ok');
          window.open(url, '_blank');
        }catch(e){
          toast(t('games_unreachable_toast'));
        }
      });
      const helpBtn = tile.querySelector('.game-tile-help');
      if(helpBtn){
        helpBtn.addEventListener('click', async e=>{
          e.stopPropagation();
          const url = `games/${g.folder}/${state.lang === 'vi' && g.instructions_vi ? g.instructions_vi : g.instructions}`;
          if(location.protocol === 'file:'){ window.open(url, '_blank'); return; }
          try{
            const res = await fetch(url, { method:'HEAD' });
            if(!res.ok) throw new Error('not ok');
            window.open(url, '_blank');
          }catch(err){
            toast(t('games_unreachable_toast'));
          }
        });
      }
      builtinGrid.appendChild(tile);
    });
  }

  async function draw(){
    const games = await idb.getAll('games');
    grid.innerHTML = '';
    if(!games.length){
      grid.innerHTML = `<p class="file-empty" data-i18n="games_empty">${t('games_empty')}</p>`;
      return;
    }
    games.forEach(g=>{
      const tile = document.createElement('button');
      tile.className = 'game-tile';
      tile.title = `${t('play')} ${g.name}`;
      tile.innerHTML = `
        <span class="game-tile-remove" aria-label="${t('remove')} ${g.name}">${iconSvg('close','wsvg')}</span>
        <span class="game-tile-play">${iconSvg('game')}</span>
        <span class="game-tile-name"></span>
      `;
      tile.querySelector('.game-tile-name').textContent = g.name.replace(/\.(html?|HTML?)$/,'');
      tile.addEventListener('click', ()=> launch(g));
      tile.querySelector('.game-tile-remove').addEventListener('click', async e=>{
        e.stopPropagation();
        await idb.delete('games', g.id);
        draw();
      });
      grid.appendChild(tile);
    });
  }

  input.addEventListener('change', async ()=>{
    let firstAdded = null;
    for(const file of input.files){
      const rec = { id:cid(), name:file.name, blob:file, added:Date.now() };
      await idb.put('games', rec);
      if(!firstAdded) firstAdded = rec;
    }
    input.value = '';
    draw();
    if(firstAdded){
      toast(t('game_saved'));
      launch(firstAdded);
    }
  });

  draw();
  drawBuiltin();
  return null;
}

const SB_COLORS = ['#E4572E','#3B82C4','#D9A82E','#5C9A63'];

// ---------------- Scoreboard transfer (from games like Classroom Word Wheel) ----------------
// A game living in games/<folder>/ is same-origin with the app, so it can hand off
// scores via localStorage — the 'storage' event fires in this tab the instant another
// same-origin tab writes it, and checkScoreboardTransfer() catches anything sent while
// this tab wasn't open yet, the next time it loads.
const SB_TRANSFER_KEY = 'td_scoreboard_transfer';

function refreshScoreboardWidget(){
  const rec = widgetEls['scoreboard'];
  if(!rec) return;
  if(typeof rec.cleanup === 'function') rec.cleanup();
  const body = rec.el.querySelector('.widget-body');
  rec.cleanup = renderScoreboard(body);
}

function applyScoreboardTransfer(payload){
  if(!payload || !Array.isArray(payload.teams) || !payload.teams.length) return;
  state.scoreboard = payload.teams.map(team=>({
    name: String((team && team.name) || '').trim().slice(0,18) || 'Team',
    score: Number(team && team.score) || 0
  }));
  saveState();
  if(!state.active.scoreboard){
    openWidget('scoreboard');
  } else {
    refreshScoreboardWidget();
  }
  toast(t('sb_transfer_received') + (payload.from ? ` — ${payload.from}` : ''));
}

function checkScoreboardTransfer(){
  let raw;
  try{ raw = localStorage.getItem(SB_TRANSFER_KEY); }catch(e){ return; }
  if(!raw) return;
  try{ localStorage.removeItem(SB_TRANSFER_KEY); }catch(e){}
  try{ applyScoreboardTransfer(JSON.parse(raw)); }catch(e){ /* malformed payload — ignore */ }
}

window.addEventListener('storage', e=>{
  if(e.key === SB_TRANSFER_KEY && e.newValue) checkScoreboardTransfer();
});

function renderScoreboard(body, ctx){
  if(ctx && ctx.preset){ const pre = ctx.preset; state.scoreboard = pre.teams.map((name, i) => ({ name, score: (pre.keep && state.scoreboard[i]) ? state.scoreboard[i].score : 0 })); saveState(); }   // platform (ClassIn): ?teams=
  body.innerHTML = `
    <div class="sb">
      <p class="sb-sub" data-i18n="sb_sub">${t('sb_sub')}</p>
      <div class="sb-board"></div>
      <button class="sb-reset" data-i18n="sb_reset">${t('sb_reset')}</button>
    </div>
  `;
  const boardEl = body.querySelector('.sb-board');

  function draw(){
    const maxScore = Math.max(...state.scoreboard.map(team=>team.score));
    boardEl.innerHTML = '';
    state.scoreboard.forEach((team, i)=>{
      const card = document.createElement('div');
      const leading = maxScore > 0 && team.score === maxScore;
      card.className = 'sb-card' + (leading ? ' leading' : '');
      card.style.setProperty('--accent', SB_COLORS[i % SB_COLORS.length]);
      card.innerHTML = `
        <div class="sb-bar"></div>
        <div class="sb-row">
          <input class="sb-name" maxlength="18">
          <div class="sb-score"></div>
        </div>
        <div class="sb-btns">
          <button class="sb-btn minus" data-delta="-1">−1</button>
          <button class="sb-btn plus" data-delta="1">+1</button>
        </div>
      `;
      const nameInput = card.querySelector('.sb-name');
      const scoreEl = card.querySelector('.sb-score');
      nameInput.value = team.name;
      scoreEl.textContent = team.score;

      nameInput.addEventListener('change', ()=>{
        team.name = nameInput.value.trim() || team.name;
        saveState();
      });
      card.querySelectorAll('.sb-btn').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const delta = parseInt(btn.dataset.delta, 10);
          team.score = Math.max(0, team.score + delta);
          track('score', team.name);
          saveState();
          draw();
          const bumpEl = boardEl.children[i].querySelector('.sb-score');
          bumpEl.classList.remove('bump');
          void bumpEl.offsetWidth;
          bumpEl.classList.add('bump');
        });
      });
      boardEl.appendChild(card);
    });
  }

  body.querySelector('.sb-reset').addEventListener('click', ()=>{
    state.scoreboard.forEach(t=> t.score = 0);
    saveState();
    draw();
  });

  draw();
  return null;
}

