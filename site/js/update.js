/* TeachersDeck platform builds (ClassIn, Canvas) — the in-app update warning. tools/build_platform.py loads it after
   js/app.js in both platform builds; the suite's own TeachersDeck never loads it. See PLATFORMS.md.

   Each platform release goes straight to the live site, so a page left open in a lesson must pick it up by itself:
     1. Every 60 s (and whenever the tab comes back into view) it reads build-info.json, which the build writes next to
        index.html. Its "version" is the build's full version, e.g. 0.31.2-classin.1.
     2. When that differs from this page's own TD_PLATFORM.version, a strip says "TeachersDeck will update in 60 seconds;
        your settings are kept", counts down, saves the deck and reloads. "Update now" skips the wait.
     3. While a timer or stopwatch is running, the strip offers "Later", and the reload never happens mid-run: it waits
        until nothing is running, then counts down again. An update never cuts a lesson short.
   Settings live in this browser's storage, so a reload keeps them; the deck is saved once more just before it.
   Test hooks: window.TD_UPDATE.check() runs a check now; TD_UPDATE.countdownS can be shortened before it. */
(function(){
  'use strict';
  var P = window.TD_PLATFORM; if(!P || !P.version) return;
  var MINE = P.version, INFO = 'build-info.json';
  var T = {
    soon:  { en:'TeachersDeck will update in {s} seconds; your settings are kept.', vi:'TeachersDeck sẽ cập nhật sau {s} giây; cài đặt của bạn được giữ nguyên.' },
    wait:  { en:'A TeachersDeck update is ready. It will install when the timer stops.', vi:'Đã có bản cập nhật TeachersDeck. Bản cập nhật sẽ cài khi đồng hồ dừng.' },
    now:   { en:'Update now', vi:'Cập nhật ngay' },
    later: { en:'Later', vi:'Để sau' }
  };
  function lang(){ try{ return (typeof state !== 'undefined' && state && state.lang === 'vi') ? 'vi' : 'en'; }catch(e){ return 'en'; } }   // state: app.js's top-level settings
  function tx(k, s){ return (T[k][lang()] || T[k].en).replace('{s}', s); }

  /* a running timer or stopwatch, read from the widgets' own Start buttons (their data-key says what the button would do next) */
  function busy(){ return !!document.querySelector('#t-start[data-key="pause"], #s-start[data-key="stop"]'); }

  var U = window.TD_UPDATE = { intervalMs: 60000, countdownS: 60, latest: null, check: check };
  var bar = null, iv = null, left = 0, postponed = false, waiting = false, poll = null;

  function save(){ try{ if(typeof saveState === 'function') saveState(); }catch(e){} }
  function reload(){ save(); var u = new URL(location.href); u.searchParams.set('v', U.latest || ''); location.replace(u.toString()); }

  function ensureBar(){
    if(bar) return bar;
    bar = document.createElement('div'); bar.id = 'td-update'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite');
    bar.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:100000;display:flex;align-items:center;gap:10px;flex-wrap:wrap;'
      + 'max-width:calc(100vw - 24px);padding:8px 12px;border-radius:12px;background:rgba(14,18,26,.96);border:1px solid #e8a33d;color:#fff;'
      + 'font:500 14px/1.35 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    var msg = document.createElement('span'); msg.className = 'td-update-msg';
    var now = document.createElement('button'); now.type = 'button'; now.className = 'td-update-now';
    var later = document.createElement('button'); later.type = 'button'; later.className = 'td-update-later';
    [now, later].forEach(function(b){ b.style.cssText = 'height:30px;padding:0 12px;border:0;border-radius:8px;font:600 13px system-ui,sans-serif;cursor:pointer;'; });
    now.style.background = '#e8a33d'; now.style.color = '#231604'; later.style.background = 'rgba(255,255,255,.14)'; later.style.color = '#fff';
    now.addEventListener('click', reload);
    later.addEventListener('click', function(){ postponed = true; stopCountdown(); hide(); watchUntilFree(); });
    bar.appendChild(msg); bar.appendChild(now); bar.appendChild(later); document.body.appendChild(bar);
    return bar;
  }
  function paint(){
    var b = ensureBar(), isBusy = busy();
    b.querySelector('.td-update-msg').textContent = waiting ? tx('wait') : tx('soon', left);
    b.querySelector('.td-update-now').textContent = tx('now');
    var later = b.querySelector('.td-update-later'); later.textContent = tx('later'); later.hidden = !isBusy;
    b.hidden = false;
  }
  function hide(){ if(bar) bar.hidden = true; }
  function stopCountdown(){ if(iv){ clearInterval(iv); iv = null; } }

  function startCountdown(){
    if(iv) return;
    waiting = false; left = U.countdownS; paint();
    iv = setInterval(function(){
      left = Math.max(0, left - 1);
      if(left === 0){
        if(busy()){ stopCountdown(); waiting = true; paint(); watchUntilFree(); return; }   // never reload while a timer runs
        stopCountdown(); reload(); return;
      }
      paint();
    }, 1000);
  }
  /* postponed, or the countdown ran out mid-timer: look every few seconds; once nothing is running, count down again */
  function watchUntilFree(){
    if(poll) return;
    poll = setInterval(function(){
      if(busy()) return;
      clearInterval(poll); poll = null; postponed = false; startCountdown();
    }, 3000);
  }

  function check(){
    return fetch(INFO + '?t=' + Date.now(), { cache:'no-store' }).then(function(r){ return r.ok ? r.json() : null; }).then(function(info){
      var v = info && info.version; if(!v || v === MINE) return false;
      U.latest = v;
      if(!iv && !poll && !postponed && !waiting) startCountdown();
      return true;
    }).catch(function(){ return false; });   // offline or the file is missing: try again next time
  }

  setInterval(check, U.intervalMs);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden) check(); });
  setTimeout(check, 5000);   // once soon after opening, for a page that was cached
})();
