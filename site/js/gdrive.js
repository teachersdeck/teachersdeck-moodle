/* Google Drive helper: turns a Word / PowerPoint / Excel file into a Google Doc /
   Slides / Sheet so TeachersDeck can show it full screen. Pro feature; the gate is in
   js/app.js (showOffice), not here.

   - Scope is only drive.file: the app can see and touch only the files it created itself.
   - Conversion happens during upload: files.create with the Google mimeType in the
     metadata and the original Office bytes as the media (files.copy does NOT convert).
   - Two sign-in paths behind one getToken():
       Chrome extension -> chrome.identity.launchWebAuthFlow (the "identity" permission is
                           OPTIONAL and requested the first time it is needed, so existing
                           installs are not disabled by a permission-prompt on update);
       standalone page  -> Google Identity Services token client (loaded lazily).
     Tokens last about an hour with no refresh token; they are kept in memory only.
   - Client IDs live in js/google-config.js. With none set, isConfigured() is false and the
     app falls back to opening the file in a tab. */
(function(){
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const FOLDER_NAME = 'TeachersDeck Converted';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const MULTIPART_MAX = 5 * 1024 * 1024;       // Drive: multipart up to 5 MB, resumable above that

  const SRC_MIME = {
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt:  'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls:  'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
  const GTYPE = { doc:'document', docx:'document', ppt:'presentation', pptx:'presentation', xls:'spreadsheets', xlsx:'spreadsheets' };
  const GMIME = { document:'application/vnd.google-apps.document', presentation:'application/vnd.google-apps.presentation', spreadsheets:'application/vnd.google-apps.spreadsheet' };

  class DriveError extends Error {
    constructor(status, reason, message){
      super(message || reason || ('HTTP ' + status));
      this.name = 'DriveError'; this.status = status; this.reason = reason || '';
    }
  }

  const cfg = ()=> window.GOOGLE_CONFIG || {};
  const isExtension = ()=> typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id) && !!chrome.permissions;
  const clientId = ()=> (isExtension() ? cfg().extensionClientId : cfg().webClientId) || '';
  const isConfigured = ()=> !!clientId();

  let tok = null, tokExp = 0, folderId = null;
  function clearToken(){ tok = null; tokExp = 0; }
  function setToken(access, expiresIn){
    tok = access; tokExp = Date.now() + (Math.max(60, +expiresIn || 3600) * 1000);
    return tok;
  }

  async function extToken(interactive){
    const perm = { permissions: ['identity'] };
    if(!(await chrome.permissions.contains(perm))){
      // Must run inside the click that started the conversion (a user gesture).
      const ok = await chrome.permissions.request(perm);
      if(!ok) throw new DriveError(0, 'permission_denied');
    }
    const redirect = chrome.identity.getRedirectURL();
    const authUrl = prompt => 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(Object.assign({
      client_id: clientId(), response_type: 'token', redirect_uri: redirect, scope: SCOPE
    }, prompt ? { prompt } : {})).toString();
    const parse = resp => {
      const h = new URLSearchParams(new URL(resp).hash.replace(/^#/, ''));
      if(h.get('error')) throw new DriveError(0, 'auth_' + h.get('error'));
      if(!h.get('access_token')) throw new DriveError(0, 'auth_failed');
      return setToken(h.get('access_token'), h.get('expires_in'));
    };
    // Silent first (works once consent was given and a Google session exists), then the real prompt.
    try{
      return parse(await chrome.identity.launchWebAuthFlow({ url: authUrl('none'), interactive: false }));
    }catch(e){
      if(!interactive) throw (e instanceof DriveError ? e : new DriveError(0, 'auth_required'));
    }
    try{
      return parse(await chrome.identity.launchWebAuthFlow({ url: authUrl(''), interactive: true }));
    }catch(e){
      throw (e instanceof DriveError ? e : new DriveError(0, 'auth_cancelled', e && e.message));
    }
  }

  function loadGis(){
    return new Promise((resolve, reject)=>{
      if(window.google && google.accounts && google.accounts.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = ()=> resolve();
      s.onerror = ()=> reject(new DriveError(0, 'network'));
      document.head.appendChild(s);
    });
  }
  async function webToken(interactive){
    await loadGis();
    return new Promise((resolve, reject)=>{
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId(), scope: SCOPE,
        callback: r => r.error ? reject(new DriveError(0, 'auth_' + r.error)) : resolve(setToken(r.access_token, r.expires_in)),
        error_callback: e => reject(new DriveError(0, 'auth_' + ((e && e.type) || 'failed')))
      });
      client.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  }

  async function getToken(interactive){
    if(!isConfigured()) throw new DriveError(0, 'not_configured');
    if(tok && Date.now() < tokExp - 60000) return tok;
    clearToken();
    return isExtension() ? extToken(interactive !== false) : webToken(interactive !== false);
  }

  async function check(res){
    if(res.ok) return res;
    let reason = '', message = '';
    try{
      const j = await res.clone().json();
      const e = j && j.error;
      if(e){ message = e.message || ''; reason = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || ''; }
    }catch(_){ /* not JSON */ }
    throw new DriveError(res.status, reason, message);
  }

  // Run a Drive request with the current token; on a 401 drop the token and retry once.
  async function authed(makeRequest, interactive){
    let t = await getToken(interactive);
    let res = await makeRequest(t);
    if(res.status === 401){
      clearToken();
      t = await getToken(interactive);
      res = await makeRequest(t);
    }
    return check(res);
  }
  const jsonHeaders = t => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json; charset=UTF-8' });

  async function ensureFolder(signal){
    if(folderId) return folderId;
    const q = "name='" + FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const list = await (await authed(t => fetch(API + '?' + new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' }),
      { headers: { Authorization: 'Bearer ' + t }, signal }))).json();
    if(list.files && list.files.length) return (folderId = list.files[0].id);
    const made = await (await authed(t => fetch(API + '?fields=id', {
      method: 'POST', headers: jsonHeaders(t), signal,
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    }))).json();
    return (folderId = made.id);
  }

  // ext: 'docx' etc.  Returns { id, gtype, owner }.
  async function convert(blob, name, ext, opts){
    opts = opts || {};
    ext = String(ext || '').toLowerCase();
    const gtype = GTYPE[ext];
    if(!gtype) throw new DriveError(0, 'unsupported_type');
    const signal = opts.signal;
    const parent = await ensureFolder(signal);
    const meta = { name: String(name || 'Document').replace(/\.[a-z0-9]+$/i, ''), mimeType: GMIME[gtype], parents: [parent],
                   appProperties: opts.sha ? { tdSha: opts.sha } : undefined };
    const fields = 'id,owners(emailAddress)';
    const srcMime = SRC_MIME[ext];
    let res;
    if(blob.size <= MULTIPART_MAX){
      const boundary = 'tdb' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      const body = new Blob([
        '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n' +
        '--' + boundary + '\r\nContent-Type: ' + srcMime + '\r\n\r\n',
        blob,
        '\r\n--' + boundary + '--'
      ]);
      res = await authed(t => fetch(UPLOAD + '?' + new URLSearchParams({ uploadType: 'multipart', fields }), {
        method: 'POST', signal, body,
        headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + boundary }
      }));
    } else {
      const init = await authed(t => fetch(UPLOAD + '?' + new URLSearchParams({ uploadType: 'resumable', fields }), {
        method: 'POST', signal, body: JSON.stringify(meta),
        headers: Object.assign(jsonHeaders(t), { 'X-Upload-Content-Type': srcMime, 'X-Upload-Content-Length': String(blob.size) })
      }));
      const loc = init.headers.get('Location');
      if(!loc) throw new DriveError(0, 'resumable_no_location');
      res = await check(await fetch(loc, { method: 'PUT', body: blob, signal, headers: { 'Content-Type': srcMime } }));
    }
    const j = await res.json();
    return { id: j.id, gtype, owner: (j.owners && j.owners[0] && j.owners[0].emailAddress) || '' };
  }

  async function exists(fileId, signal){
    try{
      const j = await (await authed(t => fetch(API + '/' + encodeURIComponent(fileId) + '?fields=id,trashed',
        { headers: { Authorization: 'Bearer ' + t }, signal }))).json();
      return !!j && !j.trashed;
    }catch(e){
      if(e instanceof DriveError && e.status === 404) return false;
      throw e;
    }
  }

  async function trash(fileId){
    try{
      await authed(t => fetch(API + '/' + encodeURIComponent(fileId) + '?fields=id', {
        method: 'PATCH', headers: jsonHeaders(t), body: JSON.stringify({ trashed: true })
      }));
      return true;
    }catch(e){
      if(e instanceof DriveError && e.status === 404) return true;     // already gone
      throw e;
    }
  }

  window.TDDrive = {
    DriveError, SCOPE, FOLDER_NAME,
    isConfigured, isExtension, clientId, getToken, clearToken,
    isOfficeExt: ext => !!GTYPE[String(ext || '').toLowerCase()],
    gtypeFor: ext => GTYPE[String(ext || '').toLowerCase()] || null,
    convert, exists, trash,
    redirectUrl: ()=> (isExtension() && chrome.identity ? chrome.identity.getRedirectURL() : '')
  };
})();
