'use strict';
/* Anonymous usage statistics → Google Analytics 4 (property 555390375, linked to the Firebase project), shown in
   TeachersDeckHQ → Analytics → App usage. The same file in TeachersDeck and AdminDeck (tools/check_shared.py), and
   in UniDeck's LectureDeck. StudentDeck and ParentDeck never load it: they are used by children and families.

   What is sent: the app's name and version, extension or web, a random install id (not linked to any account) and a
   few event names — "app_open" once per session and "widget_open" with the widget's id. Never names, emails, class
   or student data, text the teacher typed, or keys. Not sent from the demo site or localhost.
   Settings → "Share anonymous usage statistics" turns it off (and forgets the install id).

   Chrome extensions can't use the Firebase Analytics script (no remote code), so events go to GA's Measurement
   Protocol with a plain request. To stop sending everywhere at once, empty MEASUREMENT_ID below. */
(function(){
  const MEASUREMENT_ID = 'G-M8LJNJ2D3P';   // GA property 555390375 → Admin → Data streams → "TeachersDeck apps"
  const API_SECRET = '9nhlt-gERJecOlFmkKnsxQ';   // that stream → Measurement Protocol API secrets ("apps"); public by nature: it ships in the app
  const OFF = 'td_usage_off', CID = 'td_usage_cid', SES = 'td_usage_session';
  const ed = window.DECK_EDITION || {};
  const store = {
    get(k){ try { return localStorage.getItem(k); } catch(_){ return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch(_){} },
    del(k){ try { localStorage.removeItem(k); } catch(_){} },
  };
  const host = location.hostname;
  const platform = location.protocol === 'chrome-extension:' ? 'extension' : 'web';
  const skip = /(^|\.)github\.io$/.test(host) || host === 'localhost' || host === '127.0.0.1' || location.protocol === 'file:';

  function enabled(){ return store.get(OFF) !== '1'; }
  function setEnabled(on){
    if(on){ store.del(OFF); }
    else { store.set(OFF, '1'); store.del(CID); store.del(SES); }
  }
  function clientId(){
    let c = store.get(CID);
    if(!c){ c = `${Math.floor(Math.random() * 2147483647)}.${Math.floor(Date.now() / 1000)}`; store.set(CID, c); }
    return c;
  }
  /** A session ends after 30 minutes without activity (GA's own rule). */
  function session(){
    const now = Date.now();
    let s = null;
    try { s = JSON.parse(store.get(SES) || 'null'); } catch(_){ s = null; }
    const fresh = !s || now - s.last > 30 * 60 * 1000;
    if(fresh) s = { id: Math.floor(now / 1000) };
    s.last = now;
    store.set(SES, JSON.stringify(s));
    return { id: s.id, fresh };
  }
  /** Only short ids and numbers go out: keys must look like event params, values are trimmed. */
  function clean(params){
    const out = {};
    for(const [k, v] of Object.entries(params || {})){
      if(!/^[a-z][a-z0-9_]{0,39}$/.test(k)) continue;
      if(typeof v === 'number' && isFinite(v)) out[k] = v;
      else if(typeof v === 'string' && /^[\w.\- ]{1,60}$/.test(v)) out[k] = v;
    }
    return out;
  }
  function track(name, params){
    if(!MEASUREMENT_ID || !API_SECRET || skip || !enabled()) return;
    if(!/^[a-z][a-z0-9_]{0,39}$/.test(name)) return;
    const s = session();
    const body = {
      client_id: clientId(),
      non_personalized_ads: true,
      events: [{ name, params: { ...clean(params), app: String(ed.name || 'TeachersDeck'), app_version: String(ed.version || ''),
        platform, session_id: String(s.id), engagement_time_msec: 100 } }],
    };
    try {
      fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(MEASUREMENT_ID)}&api_secret=${encodeURIComponent(API_SECRET)}`,
        { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify(body) }).catch(() => {});
    } catch(_){}
  }

  // One "app_open" per session (a new tab within 30 minutes of the last one is the same session).
  if(session().fresh) track('app_open');

  // Settings → "Share anonymous usage statistics" (the checkbox is in each app's index.html).
  function bind(){
    const box = document.getElementById('usage-stats-toggle');
    if(!box) return;
    const label = document.querySelector('[data-usage-label]');
    if(label) label.textContent = /^vi/i.test(document.documentElement.lang || '')
      ? 'Chia sẻ thống kê sử dụng ẩn danh (không có tên hay dữ liệu lớp học)'
      : 'Share anonymous usage statistics (no names or class data)';
    box.checked = enabled();
    box.addEventListener('change', () => setEnabled(box.checked));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();

  window.TDUsage = Object.freeze({ track, enabled, setEnabled });
})();
