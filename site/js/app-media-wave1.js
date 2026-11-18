/* ---------------- Streaming URL helpers (no API key needed) ---------------- */
function parseYouTube(url){
  try{
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./,'');
    if(host === 'youtu.be'){
      return { type:'video', id: u.pathname.slice(1) };
    }
    if(host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com'){
      if(u.pathname.startsWith('/playlist')){
        const list = u.searchParams.get('list');
        return list ? { type:'playlist', id:list } : null;
      }
      const v = u.searchParams.get('v');
      const list = u.searchParams.get('list');
      if(v) return { type:'video', id:v, list };
      if(list) return { type:'playlist', id:list };
      if(u.pathname.startsWith('/embed/')){
        return { type:'video', id: u.pathname.split('/')[2] };
      }
    }
  }catch(e){}
  return null;
}
function youtubeWatchUrl(parsed){
  // YouTube links are opened in a real browser tab rather than embedded in an
  // iframe — YouTube's own embed rules (a real HTTP referer, no ad-blockers
  // stripping it, no plain-file:// origin) make in-widget embedding fragile
  // (see "Error 153" in past versions), and a full new tab always just works.
  if(!parsed) return '';
  if(parsed.type === 'playlist') return `https://www.youtube.com/playlist?list=${parsed.id}`;
  let src = `https://www.youtube.com/watch?v=${parsed.id}`;
  if(parsed.list) src += `&list=${parsed.list}`;
  return src;
}
function isSoundCloudUrl(url){
  try{ return new URL(url).hostname.replace(/^www\./,'') === 'soundcloud.com'; }
  catch(e){ return false; }
}
function soundcloudEmbedUrl(url){
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23e8a33d&auto_play=false&show_comments=false&visual=false`;
}

/* ---------------- Music Player widget ---------------- */
function renderMusic(body){
  body.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="files" data-i18n="tab_my_files">${t('tab_my_files')}</button>
      <button class="tab-btn" data-tab="stream" data-i18n="tab_stream">${t('tab_stream')}</button>
      <button class="tab-btn" data-tab="spotify" data-i18n="tab_spotify">${t('tab_spotify')}</button>
    </div>

    <div class="tab-panel" data-panel="files">
      <audio id="mp-audio" controls style="width:100%; margin-bottom:8px;"></audio>
      <p class="mp-now" id="mp-now">&nbsp;</p>
      <div class="file-drop"><button type="button" class="file-drop-browse" id="mp-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
      <input type="file" id="mp-input" hidden multiple accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac">
      <ul class="file-list" id="mp-list"></ul>
    </div>

    <div class="tab-panel" data-panel="stream" hidden>
      <div class="stream-row">
        <input type="text" id="mp-stream-input" placeholder="${t('stream_placeholder')}" data-i18n-placeholder="stream_placeholder">
        <button class="wbtn primary" id="mp-stream-go">${t('play')}</button>
      </div>
      <p class="stream-msg" id="mp-stream-msg"></p>
      <div class="stream-embed" id="mp-stream-embed"></div>
    </div>

    <div class="tab-panel" data-panel="spotify" hidden>
      <div class="stream-row">
        <input type="text" id="mp-spotify-input" placeholder="${t('spotify_placeholder')}" data-i18n-placeholder="spotify_placeholder" value="${(state.spotifyUrl||'').replace(/"/g,'&quot;')}">
      </div>
      <button class="wbtn primary" id="mp-spotify-open" style="width:100%; margin-bottom:10px" data-i18n="spotify_open">${t('spotify_open')}</button>
      <p class="dock-vis-hint" data-i18n="spotify_note">${t('spotify_note')}</p>
    </div>
  `;

  wireTabs(body);

  const audio = body.querySelector('#mp-audio');
  const nowEl = body.querySelector('#mp-now');
  const list = body.querySelector('#mp-list');
  const input = body.querySelector('#mp-input');
  body.querySelector('#mp-browse').addEventListener('click', ()=> input.click());
  let tracks = [];
  let currentIdx = -1;

  async function draw(){
    tracks = (await idb.getAll('music')).sort((a,b)=>a.added-b.added);
    list.innerHTML = '';
    if(!tracks.length){
      list.innerHTML = `<li class="file-empty" data-i18n="mp_empty">${t('mp_empty')}</li>`;
      return;
    }
    tracks.forEach((tr,i)=>{
      const li = document.createElement('li');
      li.className = i===currentIdx ? 'playing' : '';
      li.innerHTML = `<span class="ftype">${i+1}</span><span class="fname"></span><button aria-label="${t('play')}">▶</button><button class="wminus" aria-label="${t('remove')}">−</button>`;
      li.querySelector('.fname').textContent = tr.name;
      const [playBtn, delBtn] = li.querySelectorAll('button');
      playBtn.addEventListener('click', ()=> playTrack(i));
      delBtn.addEventListener('click', async ()=>{
        await idb.delete('music', tr.id);
        if(i===currentIdx){ audio.pause(); audio.removeAttribute('src'); currentIdx=-1; nowEl.textContent='\u00A0'; }
        draw();
      });
      list.appendChild(li);
    });
  }

  function playTrack(i){
    if(i<0 || i>=tracks.length) return;
    currentIdx = i;
    track('music', tracks[i].name);
    audio.src = URL.createObjectURL(tracks[i].blob);
    audio.play();
    nowEl.textContent = tracks[i].name;
    draw();
  }

  audio.addEventListener('ended', ()=>{
    if(currentIdx+1 < tracks.length) playTrack(currentIdx+1);
  });

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('music', { id:cid(), name:file.name, blob:file, added:Date.now() });
    }
    input.value = '';
    draw();
  });

  // Stream tab (YouTube / SoundCloud)
  const streamInput = body.querySelector('#mp-stream-input');
  const streamEmbed = body.querySelector('#mp-stream-embed');
  const streamMsg = body.querySelector('#mp-stream-msg');
  function loadStream(url, userInitiated){
    const yt = parseYouTube(url);
    if(yt){
      state.musicStream = { type:'youtube', url };
      saveState();
      streamMsg.textContent = '';
      const watchUrl = youtubeWatchUrl(yt);
      if(userInitiated) window.open(watchUrl, '_blank', 'noopener');
      streamEmbed.innerHTML = `<div class="yt-external"><p>${t('youtube_external_msg')}</p><a class="wbtn primary" href="${watchUrl}" target="_blank" rel="noopener">${t('open_in_youtube')}</a></div>`;
      return;
    }
    if(isSoundCloudUrl(url)){
      state.musicStream = { type:'soundcloud', url };
      saveState();
      streamMsg.textContent = '';
      streamEmbed.innerHTML = `<iframe src="${soundcloudEmbedUrl(url)}" allow="autoplay"></iframe>`;
      return;
    }
    streamMsg.textContent = t('stream_invalid');
  }
  body.querySelector('#mp-stream-go').addEventListener('click', ()=>{
    const url = streamInput.value.trim();
    if(url) loadStream(url, true);
  });
  if(state.musicStream.url){
    streamInput.value = state.musicStream.url;
    loadStream(state.musicStream.url, false); // restoring saved state — show the card, don't pop a tab
  }

  // Spotify tab
  const spotifyInput = body.querySelector('#mp-spotify-input');
  body.querySelector('#mp-spotify-open').addEventListener('click', ()=>{
    const url = spotifyInput.value.trim();
    if(!url) return;
    state.spotifyUrl = url;
    saveState();
    window.open(url, '_blank');
  });

  draw();
  return null;
}

function wireTabs(body){
  const tabs = body.querySelectorAll('.tab-btn');
  tabs.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      tabs.forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');
      body.querySelectorAll('.tab-panel').forEach(p=>{
        p.hidden = p.dataset.panel !== btn.dataset.tab;
      });
    });
  });
}

/* ---------------- Video Player widget ---------------- */
function renderVideoPlayer(body){
  body.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="files" data-i18n="tab_my_files">${t('tab_my_files')}</button>
      <button class="tab-btn" data-tab="youtube" data-i18n="tab_youtube">${t('tab_youtube')}</button>
    </div>

    <div class="tab-panel" data-panel="files">
      <video id="vp-video" controls style="width:100%; border-radius:8px; background:#000; margin-bottom:8px;"></video>
      <p class="mp-now" id="vp-now">&nbsp;</p>
      <div class="file-drop"><button type="button" class="file-drop-browse" id="vp-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
      <input type="file" id="vp-input" hidden multiple accept="video/*,.mp4,.webm,.mov,.mkv">
      <ul class="file-list" id="vp-list"></ul>
    </div>

    <div class="tab-panel" data-panel="youtube" hidden>
      <div class="stream-row">
        <input type="text" id="vp-yt-input" placeholder="${t('youtube_placeholder')}" data-i18n-placeholder="youtube_placeholder">
        <button class="wbtn primary" id="vp-yt-go">${t('play')}</button>
      </div>
      <p class="stream-msg" id="vp-yt-msg"></p>
      <div class="stream-embed video-embed" id="vp-yt-embed"></div>
    </div>
  `;

  wireTabs(body);

  const video = body.querySelector('#vp-video');
  const nowEl = body.querySelector('#vp-now');
  const list = body.querySelector('#vp-list');
  const input = body.querySelector('#vp-input');
  body.querySelector('#vp-browse').addEventListener('click', ()=> input.click());
  let clips = [];
  let currentIdx = -1;

  async function draw(){
    clips = (await idb.getAll('videos')).sort((a,b)=>a.added-b.added);
    list.innerHTML = '';
    if(!clips.length){
      list.innerHTML = `<li class="file-empty" data-i18n="vp_empty">${t('vp_empty')}</li>`;
      return;
    }
    clips.forEach((c,i)=>{
      const li = document.createElement('li');
      li.className = i===currentIdx ? 'playing' : '';
      li.innerHTML = `<span class="ftype">${i+1}</span><span class="fname"></span><button aria-label="${t('play')}">▶</button><button class="wminus" aria-label="${t('remove')}">−</button>`;
      li.querySelector('.fname').textContent = c.name;
      const [playBtn, delBtn] = li.querySelectorAll('button');
      playBtn.addEventListener('click', ()=> playClip(i));
      delBtn.addEventListener('click', async ()=>{
        await idb.delete('videos', c.id);
        if(i===currentIdx){ video.pause(); video.removeAttribute('src'); currentIdx=-1; nowEl.textContent='\u00A0'; }
        draw();
      });
      list.appendChild(li);
    });
  }

  function playClip(i){
    if(i<0 || i>=clips.length) return;
    currentIdx = i;
    track('video', clips[i].name);
    video.src = URL.createObjectURL(clips[i].blob);
    video.play();
    nowEl.textContent = clips[i].name;
    draw();
  }

  video.addEventListener('ended', ()=>{
    if(currentIdx+1 < clips.length) playClip(currentIdx+1);
  });

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('videos', { id:cid(), name:file.name, blob:file, added:Date.now() });
    }
    input.value = '';
    draw();
  });

  const ytInput = body.querySelector('#vp-yt-input');
  const ytEmbed = body.querySelector('#vp-yt-embed');
  const ytMsg = body.querySelector('#vp-yt-msg');
  function loadYoutube(url, userInitiated){
    const yt = parseYouTube(url);
    if(!yt){ ytMsg.textContent = t('stream_invalid'); return; }
    state.videoStream = { type:'youtube', url };
    saveState();
    ytMsg.textContent = '';
    const watchUrl = youtubeWatchUrl(yt);
    if(userInitiated) window.open(watchUrl, '_blank', 'noopener');
    ytEmbed.innerHTML = `<div class="yt-external"><p>${t('youtube_external_msg')}</p><a class="wbtn primary" href="${watchUrl}" target="_blank" rel="noopener">${t('open_in_youtube')}</a></div>`;
  }
  body.querySelector('#vp-yt-go').addEventListener('click', ()=>{
    const url = ytInput.value.trim();
    if(url) loadYoutube(url, true);
  });
  if(state.videoStream.url){
    ytInput.value = state.videoStream.url;
    loadYoutube(state.videoStream.url, false); // restoring saved state — show the card, don't pop a tab
  }

  draw();
  return null;
}

/* ---------------- Soundboard widget (attention-getter sound effects) ---------------- */
function renderSoundboard(body){
  body.innerHTML = `
    <div class="sfx-controls">
      <button class="wbtn" id="sfx-stop" data-i18n="sfx_stop">${t('sfx_stop')}</button>
      <label class="sfx-volume-row">
        <span data-i18n="sfx_volume">${t('sfx_volume')}</span>
        <input type="range" id="sfx-volume" min="0" max="1" step="0.05" value="${state.sfxVolume}">
      </label>
    </div>
    <div class="file-drop"><button type="button" class="file-drop-browse" id="sfx-browse">${iconSvg('plus','wsvg')}<span data-i18n="browse_btn">${t('browse_btn')}</span></button></div>
    <input type="file" id="sfx-input" hidden multiple accept="audio/*,.mp3,.wav,.m4a,.ogg">
    <div class="game-grid sfx-grid"></div>
    <audio id="sfx-audio"></audio>
  `;

  const grid = body.querySelector('.sfx-grid');
  const input = body.querySelector('#sfx-input');
  body.querySelector('#sfx-browse').addEventListener('click', ()=> input.click());
  const audio = body.querySelector('#sfx-audio');
  const volumeSlider = body.querySelector('#sfx-volume');
  let sounds = [];
  let playingId = null;

  audio.volume = state.sfxVolume;
  volumeSlider.addEventListener('input', ()=>{
    state.sfxVolume = parseFloat(volumeSlider.value);
    audio.volume = state.sfxVolume;
    saveState();
  });

  function play(snd){
    track('sfx', snd.name);
    audio.pause();
    audio.src = URL.createObjectURL(snd.blob);
    audio.currentTime = 0;
    audio.play();
    playingId = snd.id;
    highlight();
  }
  audio.addEventListener('ended', ()=>{ playingId = null; highlight(); });
  body.querySelector('#sfx-stop').addEventListener('click', ()=>{
    audio.pause(); audio.currentTime = 0; playingId = null; highlight();
  });

  function highlight(){
    grid.querySelectorAll('.game-tile').forEach(tile=>{
      tile.classList.toggle('playing-sfx', tile.dataset.id === playingId);
    });
  }

  async function draw(){
    sounds = (await idb.getAll('sounds')).sort((a,b)=>a.added-b.added);
    grid.innerHTML = '';
    if(!sounds.length){
      grid.innerHTML = `<p class="file-empty" data-i18n="sfx_empty">${t('sfx_empty')}</p>`;
      return;
    }
    sounds.forEach(snd=>{
      const tile = document.createElement('button');
      tile.className = 'game-tile';
      tile.dataset.id = snd.id;
      tile.title = snd.name;
      tile.innerHTML = `
        <span class="game-tile-remove" aria-label="${t('remove')} ${snd.name}">${iconSvg('close','wsvg')}</span>
        <span class="game-tile-play">${iconSvg('speaker','wsvg')}</span>
        <span class="game-tile-name"></span>
      `;
      tile.querySelector('.game-tile-name').textContent = snd.name.replace(/\.[^.]+$/,'');
      tile.addEventListener('click', ()=> play(snd));
      tile.querySelector('.game-tile-remove').addEventListener('click', async e=>{
        e.stopPropagation();
        await idb.delete('sounds', snd.id);
        if(playingId === snd.id){ audio.pause(); playingId = null; }
        draw();
      });
      grid.appendChild(tile);
    });
    highlight();
  }

  input.addEventListener('change', async ()=>{
    for(const file of input.files){
      await idb.put('sounds', { id:cid(), name:file.name, blob:file, added:Date.now() });
    }
    input.value = '';
    draw();
  });

  draw();
  return ()=>{ audio.pause(); };
}

/* ---------------- Wave 1 widgets ---------------- */

function renderAttendance(body){
  // v0.40.2: the LOCAL date (toISOString is UTC, so in Vietnam it opened on yesterday's date before 7 am).
  function todayKey(d){ d = d||new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  let curDate = todayKey();
  /* v0.21.2: "Share with families" — when this class is linked to a cloud class and the teacher turns it on, each day's
     present / late / absent is copied to students/{id}/attendance/{date} for ParentDeck's Attendance widget (status only,
     never notes). Off by default: sharing attendance is the teacher's decision. Local names are matched to the cloud
     roster the same way Class Builder does (cbMatch); a name with no cloud student is simply not shared. */
  let cloudRoster = [], unsubRoster = null;
  const cloudOn = () => !!(state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession());
  if(cloudOn()) unsubRoster = TDCloud.subscribeRoster(state.cloudClassId, list=>{ cloudRoster = list || []; drawShare(); });
  function cloudIdsByName(){
    const { map } = cbMatch(state.students || [], cloudRoster), out = {};
    (state.students || []).forEach(s=>{ const hit = map.get(s.id); if(hit) out[studentDisplay(s)] = hit.id; });
    return out;
  }
  async function share(entries){
    if(!entries.length) return;
    try{ await TDCloud.syncAttendance(state.cloudClassId, entries); }
    catch(e){ toast(t('att_share_failed')); }
  }
  function shareDay(day, names){
    if(!state.attendanceShared || !cloudOn()) return;
    const ids = cloudIdsByName(), rec = state.attendance[day] || {};
    share(names.filter(n=> ids[n]).map(n=> ({ studentId: ids[n], day, status: rec[n] || null })));
  }
  function allEntries(clear){
    const ids = cloudIdsByName(), out = [], from = todayKey(new Date(Date.now() - 365 * 86400000));
    Object.keys(state.attendance || {}).filter(d=> d >= from).forEach(day=>{
      Object.entries(state.attendance[day] || {}).forEach(([n, s])=>{ if(ids[n]) out.push({ studentId: ids[n], day, status: clear ? null : s }); });
    });
    return out;
  }
  function drawShare(){
    const el = body.querySelector('#att-share');
    if(!el) return;
    if(!cloudOn()){ el.hidden = true; return; }
    el.hidden = false;
    const ids = cloudIdsByName(), matched = state.roster.filter(n=> ids[n]).length;
    el.innerHTML = `<label class="switch-row"><span>${t('att_share_label')}</span><input type="checkbox" id="att-share-on" ${state.attendanceShared ? 'checked' : ''}></label>
      <p class="small-hint">${state.attendanceShared ? t('att_share_on', { n: matched, total: state.roster.length }) : t('att_share_off')}</p>`;
    el.querySelector('#att-share-on').addEventListener('change', e=>{
      if(e.target.checked){
        if(!confirm(t('att_share_confirm'))){ e.target.checked = false; return; }
        state.attendanceShared = true; saveState(); share(allEntries(false));
      } else {
        const clear = confirm(t('att_unshare_confirm'));
        state.attendanceShared = false; saveState(); if(clear) share(allEntries(true));
      }
      drawShare();
    });
  }
  function dayRecord(){
    if(!state.attendance[curDate]) state.attendance[curDate] = {};
    return state.attendance[curDate];
  }
  function draw(){
    if(!state.roster.length){
      body.innerHTML = `<p class="small-hint" data-i18n="att_no_roster">${t('att_no_roster')}</p>`;
      return;
    }
    const rec = dayRecord();
    body.innerHTML = `
      <div class="att-date-row">
        <span class="field-label" data-i18n="att_date_label" style="margin:0">${t('att_date_label')}</span>
        <input type="date" id="att-date" value="${curDate}">
      </div>
      <div class="scroll-list" id="att-list"></div>
      <p class="att-summary" id="att-summary"></p>
      <div class="att-share" id="att-share" hidden></div>
      <div class="btn-row"><button class="wbtn" id="att-export" data-i18n="att_export">${t('att_export')}</button></div>
    `;
    drawShare();
    const list = body.querySelector('#att-list');
    state.roster.forEach(name=>{
      const status = rec[name] || '';
      const row = document.createElement('div');
      row.className = 'att-row';
      row.innerHTML = `
        <span class="att-name"></span>
        <div class="att-toggle">
          <button class="att-btn present ${status==='present'?'on':''}" data-status="present">P</button>
          <button class="att-btn late ${status==='late'?'on':''}" data-status="late">L</button>
          <button class="att-btn absent ${status==='absent'?'on':''}" data-status="absent">A</button>
        </div>
      `;
      row.querySelector('.att-name').textContent = name;
      row.querySelectorAll('[data-status]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const s = btn.dataset.status;
          rec[name] = rec[name] === s ? undefined : s;
          if(rec[name] === undefined) delete rec[name];
          else if(curDate === todayKey()){ const dr = dayRec(); if(!dr.attDone){ dr.attDone = true; stat('attendance'); logAct('attendance', '', 1, awardXP('attendance', 5)); } }
          shareDay(curDate, [name]);
          saveState();
          draw();
        });
      });
      list.appendChild(row);
    });
    const counts = { present:0, absent:0, late:0 };
    Object.values(rec).forEach(s=>{ if(counts[s]!==undefined) counts[s]++; });
    body.querySelector('#att-summary').textContent = t('att_summary', counts);
    body.querySelector('#att-date').addEventListener('change', e=>{
      curDate = e.target.value || todayKey();
      draw();
    });
    body.querySelector('#att-export').addEventListener('click', ()=>{
      const rows = [['Student','Status'], ...state.roster.map(n=>[n, rec[n]||''])];
      const csv = rows.map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([(window.Watermark ? Watermark.stamp(csv) : csv)], { type:'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `attendance-${curDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  draw();
  return ()=>{ if(unsubRoster) unsubRoster(); };
}

/* v0.27.0 (backend v2.8.0): Scrapbook Review — approve or hide pages students shared from StudentDeck's
   Scrapdeck ("Scrapdeck sharing", M3). Free widget (never gate the loop): listScrapPages/reviewScrapPage
   are Cloud Functions, not a live subscription, so this refetches after the teacher's own actions rather
   than updating in real time — acceptable for a one-teacher review queue. */
function renderScrapReview(body){
  const cloudOn = () => !!(state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession());
  let rows = [], filter = 'pending', loading = false, galleryOn = false, galleryBusy = false, galleryKnown = false;
  async function load(){
    if(!cloudOn()){ draw(); return; }
    loading = true; draw();
    try{ rows = await TDCloud.listScrapPages(state.cloudClassId); }
    catch(e){ toast(t('srv_load_fail')); rows = []; }
    loading = false; draw();
  }
  async function act(studentId, pageId, action){
    try{ await TDCloud.reviewScrapPage(studentId, pageId, action); toast(t(action === 'approve' ? 'srv_toast_approved' : 'srv_toast_hidden')); await load(); }
    catch(e){ toast(t('srv_action_fail')); }
  }
  function rowHtml(r){
    const aud = (r.audiences || []).map(a => a === 'family' ? t('srv_aud_family') : t('srv_aud_class')).join(' + ');
    return `<div class="srv-row">
      <img class="srv-thumb" src="${xEsc(r.thumbDataUrl || '')}" alt="">
      <div class="srv-meta">
        <b>${xEsc(r.title || '')}</b>
        <span class="small-hint">${xEsc(r.studentName || '')} · ${xEsc(aud)} · ${t('srv_status_' + r.status)}</span>
        ${r.caption ? `<p class="small-hint">${xEsc(r.caption)}</p>` : ''}
      </div>
      <div class="srv-actions">
        ${r.status !== 'approved' ? `<button class="wbtn" data-approve="${xEsc(r.pageId)}" data-student="${xEsc(r.studentId)}">${t('srv_approve')}</button>` : ''}
        ${r.status !== 'hidden' ? `<button class="wbtn" data-hide="${xEsc(r.pageId)}" data-student="${xEsc(r.studentId)}">${t('srv_hide')}</button>` : ''}
      </div>
    </div>`;
  }
  function draw(){
    if(!cloudOn()){ body.innerHTML = `<p class="small-hint">${t('srv_need_class')}</p>`; return; }
    const shown = filter === 'all' ? rows : rows.filter(r => r.status === filter);
    const counts = { pending:0, approved:0, hidden:0 }; rows.forEach(r => { if(counts[r.status] != null) counts[r.status]++; });
    body.innerHTML = `
      <label class="switch-row"><span>${t('srv_gallery_label')}</span><input type="checkbox" id="srv-gallery" ${galleryOn ? 'checked' : ''} ${galleryBusy || !galleryKnown ? 'disabled' : ''}></label>
      <p class="small-hint">${t('srv_gallery_hint')}</p>
      <div class="btn-row srv-filter">
        <button class="chip ${filter === 'pending' ? 'on' : ''}" data-f="pending">${t('srv_f_pending')} (${counts.pending})</button>
        <button class="chip ${filter === 'approved' ? 'on' : ''}" data-f="approved">${t('srv_f_approved')} (${counts.approved})</button>
        <button class="chip ${filter === 'hidden' ? 'on' : ''}" data-f="hidden">${t('srv_f_hidden')} (${counts.hidden})</button>
        <button class="chip ${filter === 'all' ? 'on' : ''}" data-f="all">${t('srv_f_all')} (${rows.length})</button>
      </div>
      <div class="scroll-list srv-list">${loading ? `<p class="small-hint">${t('srv_loading')}</p>` : (shown.length ? shown.map(rowHtml).join('') : `<p class="small-hint">${t('srv_empty')}</p>`)}</div>
    `;
    const g = body.querySelector('#srv-gallery');
    if(g) g.addEventListener('change', async e => {
      const want = e.target.checked; galleryBusy = true; draw();
      try{ await TDCloud.setScrapGalleryOn(state.cloudClassId, want); galleryOn = want; }
      catch(err){ toast(t('srv_action_fail')); }
      galleryBusy = false; draw();
    });
    body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; draw(); }));
    body.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => act(b.dataset.student, b.dataset.approve, 'approve')));
    body.querySelectorAll('[data-hide]').forEach(b => b.addEventListener('click', () => act(b.dataset.student, b.dataset.hide, 'hide')));
  }
  let unsubClass = null;
  if(cloudOn()){
    unsubClass = TDCloud.subscribeClass(state.cloudClassId, c => { galleryOn = !!(c && c.scrapGalleryOn); galleryKnown = true; draw(); if(unsubClass){ unsubClass(); unsubClass = null; } });
  }
  load();
  return ()=>{ if(unsubClass) unsubClass(); };
}

/* v0.29.0 (backend v2.9.0): Board Assignments — review students' answers to a DrawDeck page assigned
   to the class and award XP (DrawDeck scope step D, "student boards"). New assignments are created from
   DrawDeck's More menu ("Assign this page to students"), not here; this widget is purely review/grading.
   Free widget (never gate the loop): grading what a student already submitted is part of the loop. */
function renderBoardReview(body){
  const cloudOn = () => !!(state.cloudClassId && typeof TDCloud !== 'undefined' && TDCloud.isConfigured() && TDCloud.getSession());
  let assignments = [], unsubA = null, openId = null, rows = [], loadingRows = false;
  function load(){
    if(!cloudOn()){ draw(); return; }
    unsubA = TDCloud.subscribeBoardAssignments(state.cloudClassId, list => { assignments = list; draw(); });
  }
  async function loadRows(id){
    loadingRows = true; draw();
    try{ rows = await TDCloud.listBoardAnswers(state.cloudClassId, id); }
    catch(e){ toast(t('brv_load_fail')); rows = []; }
    loadingRows = false; draw();
  }
  async function toggleOpen(a){
    try{ await TDCloud.closeAssignment(state.cloudClassId, a.id, a.open === false); }
    catch(e){ toast(t('brv_action_fail')); }
  }
  async function award(row, input){
    const amount = Math.max(0, Math.min(10000, Math.round(+input.value || 0)));
    if(!amount){ toast(t('brv_amount_zero')); return; }
    try{ await TDCloud.awardBoardAnswer(state.cloudClassId, row.studentId, row.assignmentId, amount, t('brv_award_reason', { title: assignments.find(a=>a.id===openId)?.title || '' })); toast(t('brv_awarded', { n:amount })); loadRows(openId); }
    catch(e){ toast(t('brv_action_fail')); }
  }
  function rowHtml(r){
    return `<div class="srv-row">
      <img class="srv-thumb" src="${xEsc(r.thumbDataUrl || '')}" alt="">
      <div class="srv-meta">
        <b>${xEsc(r.studentName || '')}</b>
        <span class="small-hint">${r.awarded ? t('brv_graded', { n:r.awardedAmount||0 }) : t('brv_submitted')}</span>
      </div>
      <div class="srv-actions">
        ${r.awarded ? '' : `<input type="number" class="brv-xp" min="0" max="10000" placeholder="${xEsc(t('brv_xp_ph'))}" style="width:70px">
        <button class="wbtn" data-award="${xEsc(r.studentId)}">${t('brv_award')}</button>`}
      </div>
    </div>`;
  }
  function draw(){
    if(!cloudOn()){ body.innerHTML = `<p class="small-hint">${t('brv_need_class')}</p>`; return; }
    if(openId){
      const a = assignments.find(x => x.id === openId);
      body.innerHTML = `
        <button class="wbtn" id="brv-back">${t('brv_back')}</button>
        <h3 style="margin:8px 0 2px">${xEsc(a ? a.title : '')}</h3>
        <div class="scroll-list srv-list">${loadingRows ? `<p class="small-hint">${t('srv_loading')}</p>` : (rows.length ? rows.map(rowHtml).join('') : `<p class="small-hint">${t('brv_empty')}</p>`)}</div>
      `;
      body.querySelector('#brv-back').addEventListener('click', () => { openId = null; draw(); });
      body.querySelectorAll('[data-award]').forEach(b => b.addEventListener('click', () => {
        const row = rows.find(r => r.studentId === b.dataset.award);
        const input = b.parentElement.querySelector('.brv-xp');
        if(row && input) award(row, input);
      }));
      return;
    }
    body.innerHTML = `
      <div class="scroll-list srv-list">${assignments.length ? assignments.map(a => `
        <div class="srv-row">
          <img class="srv-thumb" src="${xEsc(a.thumbDataUrl || '')}" alt="">
          <div class="srv-meta">
            <b>${xEsc(a.title || '')}</b>
            <span class="small-hint">${a.open === false ? t('brv_closed') : t('brv_open')}</span>
          </div>
          <div class="srv-actions">
            <button class="wbtn" data-review="${xEsc(a.id)}">${t('brv_review')}</button>
            <button class="wbtn" data-toggle="${xEsc(a.id)}">${a.open === false ? t('brv_reopen') : t('brv_close')}</button>
          </div>
        </div>
      `).join('') : `<p class="small-hint">${t('brv_none')}</p>`}</div>
    `;
    body.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => { openId = b.dataset.review; rows = []; loadRows(openId); }));
    body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => { const a = assignments.find(x=>x.id===b.dataset.toggle); if(a) toggleOpen(a); }));
  }
  load();
  return ()=>{ if(unsubA) unsubA(); };
}

function renderGroupMaker(body){
  function draw(){
    if(!state.roster.length){
      body.innerHTML = `<p class="small-hint" data-i18n="gm_no_roster">${t('gm_no_roster')}</p>`;
      return;
    }
    const gm = state.groupMaker;
    body.innerHTML = `
      <div class="gm-controls">
        <div class="field-block">
          <span class="field-label" data-i18n="gm_mode_groups">${t('gm_mode_groups')}</span>
          <input type="number" id="gm-count" min="2" max="${Math.max(2,state.roster.length)}" value="${gm.count}">
        </div>
        <button class="wbtn primary" id="gm-shuffle" data-i18n="gm_shuffle">${t('gm_shuffle')}</button>
      </div>
      <div class="gm-groups" id="gm-groups"></div>
    `;
    body.querySelector('#gm-count').addEventListener('change', e=>{
      gm.count = Math.max(2, parseInt(e.target.value)||2);
      saveState();
    });
    body.querySelector('#gm-shuffle').addEventListener('click', shuffle);
    renderGroups(gm.lastGroups);
  }
  function shuffle(){
    const gm = state.groupMaker;
    let names = state.roster.slice();
    let key;
    let attempt = 0;
    let groups;
    do{
      names = shuffleArray(state.roster.slice());
      groups = splitIntoGroups(names, gm.count);
      key = groups.map(g=>g.join(',')).join('|');
      attempt++;
    } while(key === gm.lastKey && attempt < 8 && state.roster.length > gm.count);
    gm.lastKey = key;
    gm.lastGroups = groups;
    saveState();
    renderGroups(groups);
    track('groups', groups.length + ' × ' + (state.roster.length ? Math.ceil(state.roster.length / groups.length) : 0));
  }
  function shuffleArray(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }
  function splitIntoGroups(names, count){
    count = Math.min(count, names.length);
    const groups = Array.from({length:count}, ()=>[]);
    names.forEach((n,i)=> groups[i%count].push(n));
    return groups;
  }
  function renderGroups(groups){
    const wrap = body.querySelector('#gm-groups');
    if(!wrap) return;
    wrap.innerHTML = '';
    (groups||[]).forEach((g,i)=>{
      const div = document.createElement('div');
      div.className = 'gm-group';
      div.innerHTML = `<h4></h4><p></p>`;
      div.querySelector('h4').textContent = t('gm_group_label', { n:i+1 });
      div.querySelector('p').textContent = g.join(', ');
      wrap.appendChild(div);
    });
  }
  draw();
  return null;
}

function renderExitTicket(body){
  function draw(){
    const et = state.exitTicket;
    body.innerHTML = `
      <input type="text" class="et-q-input" id="et-q" placeholder="${t('et_question_placeholder')}" data-i18n-placeholder="et_question_placeholder" value="${et.question ? et.question.replace(/"/g,'&quot;') : ''}">
      <div class="et-tally-row">
        <div class="et-tally" data-k="got_it"><span class="et-tally-count">${et.tallies.got_it}</span><span class="et-tally-label" data-i18n="et_got_it">${t('et_got_it')}</span></div>
        <div class="et-tally" data-k="almost"><span class="et-tally-count">${et.tallies.almost}</span><span class="et-tally-label" data-i18n="et_almost">${t('et_almost')}</span></div>
        <div class="et-tally" data-k="need_help"><span class="et-tally-count">${et.tallies.need_help}</span><span class="et-tally-label" data-i18n="et_need_help">${t('et_need_help')}</span></div>
      </div>
      <p class="small-hint" data-i18n="et_hint">${t('et_hint')}</p>
      <div class="btn-row"><button class="wbtn" id="et-reset" data-i18n="et_reset">${t('et_reset')}</button></div>
    `;
    body.querySelector('#et-q').addEventListener('input', e=>{ et.question = e.target.value; saveState(); });
    body.querySelectorAll('.et-tally').forEach(el=>{
      el.addEventListener('click', ()=>{
        et.tallies[el.dataset.k]++;
        track('ticket', ({ got_it:'Got it', almost:'Almost', need_help:'Need help' })[el.dataset.k] || el.dataset.k);
        saveState();
        el.querySelector('.et-tally-count').textContent = et.tallies[el.dataset.k];
      });
    });
    body.querySelector('#et-reset').addEventListener('click', ()=>{
      et.tallies = { got_it:0, almost:0, need_help:0 };
      saveState(); draw();
    });
  }
  draw();
  return null;
}

function renderAgenda(body, ctx){
  if(ctx && ctx.preset){ Object.assign(state.agenda, ctx.preset); saveState(); }   // platform (ClassIn): ?schedule=&objective=&donow=
  function draw(){
    const ag = state.agenda;
    body.innerHTML = `
      <div class="agenda-board">
        <div class="field-block">
          <span class="field-label" data-i18n="agenda_schedule_label">${t('agenda_schedule_label')}</span>
          <textarea id="ag-schedule" placeholder="${t('agenda_schedule_placeholder')}" data-i18n-placeholder="agenda_schedule_placeholder">${ag.schedule}</textarea>
        </div>
        <div class="field-block">
          <span class="field-label" data-i18n="agenda_objective_label">${t('agenda_objective_label')}</span>
          <textarea id="ag-objective" placeholder="${t('agenda_objective_placeholder')}" data-i18n-placeholder="agenda_objective_placeholder">${ag.objective}</textarea>
        </div>
        <div class="field-block">
          <span class="field-label" data-i18n="agenda_donow_label">${t('agenda_donow_label')}</span>
          <textarea id="ag-donow" placeholder="${t('agenda_donow_placeholder')}" data-i18n-placeholder="agenda_donow_placeholder">${ag.doNow}</textarea>
        </div>
      </div>
    `;
    ['schedule','objective','doNow'].forEach((key,i)=>{
      const idMap = ['ag-schedule','ag-objective','ag-donow'];
      body.querySelector('#'+idMap[i]).addEventListener('input', e=>{
        ag[key] = e.target.value; saveState();
      });
    });
  }
  draw();
  return null;
}

