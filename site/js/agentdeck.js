/*!
 * AgentDeck — the TeachersDeck website assistant, floating chat widget.
 * Plain JavaScript, no dependencies, styles isolated in a shadow root.
 *
 * Embed (before </body>):
 *   <script src="/assets/agentdeck.js" defer
 *           data-endpoint="https://asia-southeast1-<project>.cloudfunctions.net/agentChat"></script>
 *
 * Optional attributes: data-lang="en|vi" (default: <html lang>), data-open="1" (start open),
 *   data-icon="chat|deck|spark" (button icon, default chat),
 *   data-deckie="0" (hide AgentDeckie, the mascot who stands beside the open chat),
 *   data-deckie-base="/path/" (where her poses live; default: the agentdeckie/ folder next to this script).
 * AgentDeckie's poses are widget/agentdeckie/*.webp: copy that folder next to agentdeck.js on the site.
 * Colours follow the page's CSS variables (--accent, --surface, --text, ...) with fallbacks,
 * so it matches light and dark themes on myteachersdeck.com automatically.
 *
 * In-app help (v0.3.0): data-mode="app" data-app="TeachersDeck" data-version="0.42.0" data-platform="extension|web|..."
 *   A smaller button the user can drag to either side (kept on the device), support wording, and with every message
 *   the app, version, platform, the widget in front and whether Pro is on, from window.AgentDeckContext() if the app
 *   defines it ({ widget, pro, lang }). Never the widget's contents. A random install id made on the device lets the
 *   server limit per install rather than per school internet address. myteachersdeck.com/backend.json
 *   "agentInApp": false hides it everywhere without a release. The app drives it with
 *   AgentDeck.setInsets({ bottom, side }) (keep clear of docks), AgentDeck.setHidden(bool) (fullscreen, board mode),
 *   AgentDeck.setEnabled(bool) (the app's Settings) and AgentDeck.setTheme({ accent, onAccent, surface, text, muted, line, bg }).
 */
(function () {
  'use strict';
  if (window.__agentDeckLoaded) return;
  window.__agentDeckLoaded = true;

  var script = document.currentScript || document.querySelector('script[data-endpoint][src*="agentdeck"]');
  var ENDPOINT = script && script.getAttribute('data-endpoint');
  if (!ENDPOINT) { console.warn('[AgentDeck] data-endpoint is missing'); return; }
  var APP = script.getAttribute('data-mode') === 'app';
  var APP_NAME = (script.getAttribute('data-app') || '').replace(/[^A-Za-z]/g, '').slice(0, 20);
  var APP_VERSION = (script.getAttribute('data-version') || '').replace(/[^0-9A-Za-z.+-]/g, '').slice(0, 40);
  var APP_PLATFORM = script.getAttribute('data-platform') || '';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // Lights-on (11 Nov 2026): while Google's Cloud Functions are off, the chat runs on the lights-on server.
  // https://myteachersdeck.com/backend.json says where; only known addresses are used.
  (function () {
    if (!/cloudfunctions\.net\/agentChat$/.test(ENDPOINT) || typeof fetch !== 'function') return;
    var OK = /^https:\/\/(asia-southeast1-[a-z0-9-]+\.cloudfunctions\.net|teachersdeck-[a-z0-9-]+\.onrender\.com|teachersdeck-[a-z0-9-]+\.netlify\.app|[a-z0-9-]+\.myteachersdeck\.com)$/;
    ENDPOINT = 'https://teachersdeck-lights-on.onrender.com/agentChat';
    if (APP) return; // in-app: one read of backend.json further down gives both the address and the off switch
    fetch('https://myteachersdeck.com/backend.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var u = j && (j.agentChat || j.functions);
      if (typeof u === 'string' && OK.test(u.replace(/\/agentChat$/, ''))) ENDPOINT = u.replace(/\/agentChat$/, '') + '/agentChat';
    }).catch(function () {});
  })();
  var LANG = ((script.getAttribute('data-lang') || document.documentElement.lang || 'en').slice(0, 2) === 'vi') ? 'vi' : 'en';
  var STORE_KEY = APP ? 'agentdeck_app_v1' : 'agentdeck_v1';

  // Button icons (24x24, drawn in the button's text colour). Pick one with data-icon.
  var ICONS = {
    // 1. Speech bubble: instantly reads as "chat".
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>',
    // 2. Deck: the TeachersDeck bento tiles, one tile turned into an AI sparkle.
    deck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="8" height="8" rx="2.2"/><rect x="3" y="13" width="8" height="8" rx="2.2"/><rect x="13" y="13" width="8" height="8" rx="2.2"/>' +
      '<path d="M17 2.6l1.25 2.9 2.9 1.25-2.9 1.25L17 10.9l-1.25-2.9-2.9-1.25 2.9-1.25z" fill="currentColor" stroke-width="1"/></svg>',
    // 3. Spark: an assistant star with a small companion star.
    spark: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<path d="M10 2.5l1.9 5.6 5.6 1.9-5.6 1.9L10 17.5l-1.9-5.6L2.5 10l5.6-1.9z"/>' +
      '<path d="M18 13.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/></svg>',
  };
  var ICON = ICONS[script.getAttribute('data-icon')] || ICONS.chat;

  // AgentDeckie: Deckie in sunglasses and a black áo dài, standing beside the open chat.
  // Poses: 0 standing, 0b standing with eyes closed (blink), 1 one hand open toward the chat,
  // 2 both hands open, 3 waving. Stacked images cross-fade; the images load on first open.
  var DECKIE = script.getAttribute('data-deckie') !== '0';
  var DECKIE_BASE = script.getAttribute('data-deckie-base') || (function () {
    try { return new URL('agentdeckie/', script.src).href; } catch (e) { return '/assets/agentdeckie/'; }
  })();
  var DECKIE_POSES = ['0', '0b', '1', '2', '3'];

  var T = {
    en: {
      open: 'Chat with AgentDeck, the TeachersDeck assistant', close: 'Close chat', title: 'AgentDeck', subtitle: 'TeachersDeck assistant · AI',
      hello: "Hi! I'm AgentDeck, the TeachersDeck assistant. Ask me about the apps, prices, getting started, or a problem you're having.",
      chips: ['What is TeachersDeck Suite?', 'How much does it cost?', 'Can I try it for free?', 'I need help with an app'],
      placeholder: 'Type your question…', send: 'Send', thinking: 'AgentDeck is typing…',
      privacy: 'AI answers can be wrong. Chats are saved to improve support — please don’t share students’ personal details.',
      error: 'Something went wrong. Please email jerry@myteachersdeck.com or message us on Zalo (0705 247 680).',
      sources: 'From:', reset: 'New chat', lead: 'Sent to the team ✓', ticket: 'Passed to a person ✓',
    },
    vi: {
      open: 'Trò chuyện với AgentDeck, trợ lý TeachersDeck', close: 'Đóng khung chat', title: 'AgentDeck', subtitle: 'Trợ lý TeachersDeck · AI',
      hello: 'Xin chào! Mình là AgentDeck, trợ lý của TeachersDeck. Bạn cứ hỏi về các ứng dụng, giá, cách bắt đầu, hoặc vấn đề bạn đang gặp nhé.',
      chips: ['TeachersDeck Suite là gì?', 'Giá bao nhiêu?', 'Có dùng thử miễn phí không?', 'Mình cần hỗ trợ một ứng dụng'],
      placeholder: 'Nhập câu hỏi của bạn…', send: 'Gửi', thinking: 'AgentDeck đang trả lời…',
      privacy: 'Câu trả lời của AI có thể sai. Cuộc trò chuyện được lưu để cải thiện hỗ trợ — xin đừng chia sẻ thông tin cá nhân của học sinh.',
      error: 'Có lỗi xảy ra. Bạn email jerry@myteachersdeck.com hoặc nhắn Zalo 0705 247 680 nhé.',
      sources: 'Nguồn:', reset: 'Chat mới', lead: 'Đã gửi cho đội ngũ ✓', ticket: 'Đã chuyển cho nhân viên ✓',
    },
  }[LANG];
  if (APP) {
    var NAME = APP_NAME || 'TeachersDeck';
    var TA = {
      en: {
        open: 'Help: ask AgentDeck', subtitle: NAME + ' help · AI',
        hello: "Hi! I'm AgentDeck. Ask me how to do something in " + NAME + ", or tell me what isn't working and I'll pass it to the team.",
        chips: ['How do I use this widget?', "Something isn't working", 'What does Pro add?', 'I want to talk to a person'],
        privacy: "AI answers can be wrong. Please don't type students' names or other personal details.",
        waking: 'Waking the helper up… (up to 30 s)', offline: "You're offline. Email jerry@myteachersdeck.com or message us on Zalo (0705 247 680).",
      },
      vi: {
        open: 'Trợ giúp: hỏi AgentDeck', subtitle: 'Trợ giúp ' + NAME + ' · AI',
        hello: 'Xin chào! Mình là AgentDeck. Bạn hỏi cách làm gì đó trong ' + NAME + ', hoặc kể điều gì chưa chạy, mình sẽ chuyển cho đội ngũ.',
        chips: ['Dùng widget này thế nào?', 'Có gì đó không hoạt động', 'Bản Pro có thêm gì?', 'Mình muốn nói chuyện với nhân viên'],
        privacy: 'Câu trả lời của AI có thể sai. Xin đừng nhập tên hay thông tin cá nhân của học sinh.',
        waking: 'Đang đánh thức trợ lý… (tối đa 30 giây)', offline: 'Bạn đang offline. Email jerry@myteachersdeck.com hoặc nhắn Zalo 0705 247 680 nhé.',
      },
    }[LANG];
    for (var tk in TA) T[tk] = TA[tk];
  }
  // A random id for this device's install (not tied to a person): the server limits per install, not per school address.
  var INSTALL_ID = '';
  if (APP) {
    INSTALL_ID = lsGet('agentdeck_install') || '';
    if (!/^i_[a-z0-9]{8,40}$/.test(INSTALL_ID)) {
      INSTALL_ID = 'i_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      lsSet('agentdeck_install', INSTALL_ID);
    }
  }
  var LANG_NOW = LANG;
  // Only these fields leave the app: never the widget's contents, names, ids of people or devices.
  function appFields() {
    var c = {};
    try { c = (typeof window.AgentDeckContext === 'function' && window.AgentDeckContext()) || {}; } catch (e) { c = {}; }
    if (c.lang === 'vi' || c.lang === 'en') LANG_NOW = c.lang;
    return {
      app: APP_NAME, appVersion: APP_VERSION, platform: APP_PLATFORM, installId: INSTALL_ID,
      widget: typeof c.widget === 'string' && /^[a-z0-9_-]{1,30}$/.test(c.widget) ? c.widget : '',
      pro: c.pro === true,
    };
  }

  // ---------- state (sessionStorage: survives page navigation, not a new tab) ----------
  var state = { open: false, conversationId: null, messages: [] };
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.messages)) state = saved;
  } catch (e) { /* storage blocked: work in memory */ }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ open: state.open, conversationId: state.conversationId, messages: state.messages.slice(-30) })); } catch (e) {}
  }

  // ---------- safe mini-Markdown: escape first, then links, bold, lists ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function safeUrl(u) { return /^(https?:\/\/|mailto:)/i.test(u) ? u : null; }
  function link(text, url) { return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>'; }
  function inline(s) {
    var out = esc(s);
    var held = [];
    // [text](url)
    out = out.replace(/\[([^\]]{1,200})\]\(([^)\s]{1,500})\)/g, function (m, t, u) {
      var url = safeUrl(u.replace(/&amp;/g, '&'));
      if (!url) return t;
      held.push(link(t, esc(url)));
      return '\u0000' + (held.length - 1) + '\u0000';
    });
    // bare URLs and emails
    out = out.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, function (u) {
      held.push(link(u, u));
      return '\u0000' + (held.length - 1) + '\u0000';
    });
    out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, function (e) { return link(e, 'mailto:' + e); });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return out.replace(/\u0000(\d+)\u0000/g, function (m, i) { return held[+i]; });
  }
  function render(md) {
    var lines = String(md).split(/\r?\n/);
    var html = '';
    var list = null;
    lines.forEach(function (line) {
      var m = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (m) {
        var tag = m[1] ? 'ol' : 'ul';
        if (list !== tag) { if (list) html += '</' + list + '>'; html += '<' + tag + '>'; list = tag; }
        html += '<li>' + inline(m[2]) + '</li>';
        return;
      }
      if (list) { html += '</' + list + '>'; list = null; }
      var h = /^#{1,4}\s+(.*)$/.exec(line);
      if (h) html += '<p><strong>' + inline(h[1]) + '</strong></p>';
      else if (line.trim()) html += '<p>' + inline(line) + '</p>';
    });
    if (list) html += '</' + list + '>';
    return html;
  }

  // ---------- DOM ----------
  var host = document.createElement('div');
  host.id = 'agentdeck';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{all:initial;--a:var(--accent,#4A55B8);--on-a:var(--on-accent,#fff);--sf:var(--surface,#fff);--tx:var(--text,#161C25);' +
    '--mu:var(--muted,#4D5565);--ln:var(--line,rgba(22,28,37,.13));--pg:var(--bg,#F3F5FC);font:15px/1.5 Inter,system-ui,sans-serif;color:var(--tx)}' +
    '*{box-sizing:border-box}' +
    '.fab{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;' +
    'background:var(--a);color:var(--on-a);box-shadow:0 12px 28px -8px rgba(0,0,0,.35);display:grid;place-items:center;transition:transform .15s ease}' +
    '.fab:hover{transform:translateY(-2px)}.fab svg{width:28px;height:28px}.dot svg{width:20px;height:20px}.fab:focus-visible,button:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid var(--a);outline-offset:2px}' +
    '.panel{position:fixed;right:max(18px,env(safe-area-inset-right));bottom:calc(max(18px,env(safe-area-inset-bottom)) + 72px);z-index:2147483000;width:380px;max-width:calc(100vw - 24px);' +
    'height:min(600px,calc(100vh - 120px));display:flex;flex-direction:column;background:var(--sf);color:var(--tx);border:1px solid var(--ln);border-radius:22px;overflow:hidden;' +
    'box-shadow:0 30px 60px -24px rgba(0,0,0,.35),0 8px 20px rgba(0,0,0,.08)}' +
    '.panel[hidden]{display:none}' +
    '.head{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px;border-bottom:1px solid var(--ln)}' +
    '.dot{width:36px;height:36px;border-radius:12px;background:var(--a);color:var(--on-a);display:grid;place-items:center;font:700 16px Quicksand,Inter,sans-serif;flex:none}' +
    '.who{flex:1;min-width:0}.who b{display:block;font:700 16px Quicksand,Inter,sans-serif}.who span{font-size:12px;color:var(--mu)}' +
    '.icon{border:0;background:transparent;color:var(--mu);cursor:pointer;border-radius:10px;padding:6px 8px;font:500 12px Inter,sans-serif}.icon:hover{background:var(--pg);color:var(--tx)}' +
    '.log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--pg);overscroll-behavior:contain}' +
    '.msg{max-width:88%;padding:10px 13px;border-radius:16px;word-wrap:break-word;overflow-wrap:anywhere}' +
    '.msg p{margin:0 0 6px}.msg p:last-child{margin:0}.msg ul,.msg ol{margin:4px 0 6px;padding-left:20px}.msg a{color:inherit;text-decoration:underline}' +
    '.bot{align-self:flex-start;background:var(--sf);border:1px solid var(--ln);border-bottom-left-radius:6px}' +
    '.me{align-self:flex-end;background:var(--a);color:var(--on-a);border-bottom-right-radius:6px;white-space:pre-wrap}' +
    '.src{font-size:12px;color:var(--mu);margin-top:6px}.src a{color:var(--mu)}' +
    '.tag{align-self:flex-start;font-size:12px;color:var(--mu);padding:0 4px}' +
    '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid var(--a);color:var(--a);background:var(--sf);border-radius:999px;padding:6px 12px;font:500 13px Inter,sans-serif;cursor:pointer}' +
    '.chip:hover{background:var(--a);color:var(--on-a)}' +
    '.typing{align-self:flex-start;color:var(--mu);font-size:13px;display:flex;align-items:center;gap:6px}' +
    '.typing i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:b 1s infinite ease-in-out}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}' +
    '@keyframes b{0%,80%,100%{opacity:.25}40%{opacity:1}}@media (prefers-reduced-motion:reduce){.typing i{animation:none}.fab{transition:none}}' +
    'form{display:flex;gap:8px;padding:10px 12px 6px;border-top:1px solid var(--ln);background:var(--sf)}' +
    'textarea{flex:1;resize:none;border:1px solid var(--ln);border-radius:14px;padding:10px 12px;font:15px/1.4 Inter,system-ui,sans-serif;color:var(--tx);background:var(--pg);max-height:120px}' +
    '.send{border:0;border-radius:14px;padding:0 16px;background:var(--a);color:var(--on-a);font:600 14px Inter,sans-serif;cursor:pointer}.send:disabled{opacity:.5;cursor:default}' +
    '.note{font-size:11px;line-height:1.4;color:var(--mu);padding:2px 14px 10px;background:var(--sf)}' +
    // AgentDeckie stands just left of the panel, feet on its bottom edge, one hand reaching over its border.
    '.deckie{position:fixed;z-index:2147483001;right:calc(max(18px,env(safe-area-inset-right)) + 372px);bottom:calc(max(18px,env(safe-area-inset-bottom)) + 70px);' +
    'height:min(300px,calc(100vh - 200px));aspect-ratio:384/616;pointer-events:none;animation:dk-in .45s ease-out both}' +
    '.panel[hidden]~.deckie{display:none}' +
    '.deckie::before{content:"";position:absolute;left:22%;right:22%;bottom:-3px;height:10px;border-radius:50%;background:rgba(0,0,0,.2);filter:blur(4px)}' +
    // A hairline rim in the text colour keeps the black áo dài visible on dark pages.
    '.fig{position:absolute;inset:0;transform-origin:50% 100%;transition:transform .35s ease;' +
    'filter:drop-shadow(0 0 1px color-mix(in srgb,var(--tx) 40%,transparent))}' +
    '.fig img{position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .22s ease;-webkit-user-select:none;user-select:none}' +
    '[data-pose=idle] .p0,[data-pose=listen] .p0,[data-pose=give] .p1,[data-pose=think] .p2,[data-pose=wave] .p3{opacity:1}' +
    '.fig .p0b{transition:none}[data-pose=idle] .p0b{animation:dk-blink 5.3s 1.2s infinite}[data-pose=listen] .p0b{animation:dk-blink 7.1s 2s infinite}' +
    '[data-pose=listen] .fig{transform:rotate(2.5deg) translateX(5px)}[data-pose=give] .fig{transform:translateY(-4px)}' +
    '[data-pose=think] .fig{animation:dk-sway 2.6s ease-in-out infinite}[data-pose=wave] .fig{animation:dk-hop .5s ease-out}' +
    '.bub{position:absolute;left:68%;top:-9%;display:flex;gap:4px;padding:7px 9px;border-radius:14px 14px 14px 4px;background:var(--sf);border:1px solid var(--ln);' +
    'box-shadow:0 6px 14px -6px rgba(0,0,0,.3);opacity:0;transform:scale(.5);transform-origin:0 100%;transition:opacity .2s,transform .2s}' +
    '[data-pose=think] .bub{opacity:1;transform:none}.bub i{width:6px;height:6px;border-radius:50%;background:var(--mu);animation:b 1s infinite ease-in-out}' +
    '.bub i:nth-child(2){animation-delay:.15s}.bub i:nth-child(3){animation-delay:.3s}' +
    '@keyframes dk-in{from{opacity:0;transform:translateY(16px)}}@keyframes dk-blink{0%,93%,97.5%,100%{opacity:0}94%,96.5%{opacity:1}}' +
    '@keyframes dk-sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}@keyframes dk-hop{40%{transform:translateY(-8px)}}' +
    '.dot{position:relative;overflow:hidden}.face{display:none;position:absolute;left:50%;top:2px;width:54px;max-width:none;transform:translateX(-50%)}' +
    // Reduced motion: one still pose, no blink, sway or cross-fades.
    '@media (prefers-reduced-motion:reduce){.deckie,.deckie *{animation:none!important;transition:none!important}.fig{transform:none!important}' +
    '.fig img{opacity:0!important}.fig .p0{opacity:1!important}}' +
    // No room beside the panel: she moves into the header as a face instead.
    '@media (max-width:719px),(max-height:539px){.deckie{display:none!important}.dot.has-face svg{display:none}.dot.has-face .face{display:block}}' +
    (APP ?
      // In-app: a 44 px button on either side, lifted clear of the app's docks (--ad-fb / --ad-sx come from setInsets and the drag).
      '.fab{width:44px;height:44px;right:var(--ad-sx,18px);bottom:var(--ad-fb,18px);touch-action:none;box-shadow:0 8px 18px -6px rgba(0,0,0,.4)}.fab svg{width:22px;height:22px}' +
      '.fab.drag{transition:none;cursor:grabbing;transform:scale(1.08)}.fab.off{filter:grayscale(1);opacity:.65}' +
      // --ad-px: the panel's distance from the side; it moves past the button when there is no room above it.
      '.panel{right:var(--ad-px,18px);bottom:var(--ad-pb,74px);height:min(600px,calc(100vh - 100px))}' +
      '.deckie{right:calc(var(--ad-px,18px) + 372px);bottom:calc(var(--ad-pb,74px) - 2px)}' +
      ':host([data-side=left]) .fab{right:auto;left:var(--ad-sx,18px)}:host([data-side=left]) .panel{right:auto;left:var(--ad-px,18px)}' +
      ':host([data-side=left]) .deckie{right:auto;left:calc(var(--ad-px,18px) + 372px)}' : '') +
    '@media (max-width:520px){.panel{right:0!important;left:0!important;bottom:0!important;top:0;width:auto;max-width:none;height:auto;border-radius:0;border:0}.panel:not([hidden])~.fab{display:none}}' +
    '</style>' +
    '<div class="panel" role="dialog" aria-modal="false" aria-labelledby="td-title" hidden>' +
    '<div class="head"><div class="dot" aria-hidden="true">' + ICON + '</div><div class="who"><b id="td-title"></b><span class="sub"></span></div>' +
    '<button class="icon reset" type="button"></button><button class="icon x" type="button">✕</button></div>' +
    '<div class="log" role="log" aria-live="polite"></div>' +
    '<form><textarea rows="1" maxlength="1000"></textarea><button class="send" type="submit"></button></form>' +
    '<div class="note"></div></div>' +
    (DECKIE ? '<div class="deckie" data-pose="idle" aria-hidden="true"><div class="fig">' +
      DECKIE_POSES.map(function (p) { return '<img class="p' + p + '" data-p="' + p + '" alt="" decoding="async" draggable="false">'; }).join('') +
      '<div class="bub"><i></i><i></i><i></i></div></div></div>' : '') +
    '<button class="fab" type="button" aria-expanded="false">' + ICON + '</button>';

  var $ = function (s) { return root.querySelector(s); };
  var panel = $('.panel'), log = $('.log'), form = $('form'), input = $('textarea'), sendBtn = $('.send'), fab = $('.fab');
  $('#td-title').textContent = T.title;
  $('.sub').textContent = T.subtitle;
  $('.reset').textContent = T.reset;
  $('.x').setAttribute('aria-label', T.close);
  $('.note').textContent = T.privacy;
  input.placeholder = T.placeholder;
  input.setAttribute('aria-label', T.placeholder);
  sendBtn.textContent = T.send;
  fab.setAttribute('aria-label', T.open);
  var busy = false;

  // ---------- AgentDeckie's poses ----------
  // idle (blinks now and then) · listen (leans toward the chat while the visitor types) · think (both hands open,
  // gentle sway and a thought bubble while a question is pending) · give (one hand open toward the chat when the
  // reply arrives) · wave (on opening and on a new chat). A failed reply just returns her to idle.
  var deckie = $('.deckie'), face = null, deckieTimer = null, deckieLoaded = false;
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var roomy = mq('(min-width: 720px) and (min-height: 540px)');
  if (DECKIE) {
    face = document.createElement('img');
    face.className = 'face'; face.alt = ''; face.decoding = 'async';
    $('.dot').appendChild(face);
    $('.dot').classList.add('has-face');
  }
  function loadDeckie() {
    if (!DECKIE) return;
    if (!face.src) face.src = DECKIE_BASE + 'agentdeckie-0.webp';
    if (deckieLoaded || !roomy.matches) return; // narrow screens only ever show the face
    deckieLoaded = true;
    Array.prototype.forEach.call(deckie.querySelectorAll('img'), function (img) {
      var p = img.getAttribute('data-p');
      if (reduceMotion.matches && p !== '0') return; // one still pose
      img.src = DECKIE_BASE + 'agentdeckie-' + p + '.webp';
    });
  }
  if (roomy.addEventListener) roomy.addEventListener('change', function () { if (state.open) loadDeckie(); });
  function restPose() { return busy ? 'think' : (input.value.trim() ? 'listen' : 'idle'); }
  function strike(pose, ms) {
    if (!DECKIE) return;
    clearTimeout(deckieTimer); deckieTimer = null;
    deckie.setAttribute('data-pose', pose || restPose());
    if (pose && ms) deckieTimer = setTimeout(function () { deckieTimer = null; deckie.setAttribute('data-pose', restPose()); }, ms);
  }

  function bubble(role, text, extra) {
    var el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'me' : 'bot');
    if (role === 'user') el.textContent = text;
    else el.innerHTML = render(text);
    if (extra && extra.sources && extra.sources.length) {
      var s = document.createElement('div');
      s.className = 'src';
      s.appendChild(document.createTextNode(T.sources + ' '));
      extra.sources.slice(0, 2).forEach(function (src, i) {
        if (!safeUrl(src.url)) return;
        if (i) s.appendChild(document.createTextNode(' · '));
        var a = document.createElement('a');
        a.href = src.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = String(src.title || src.url).split(' › ')[0].slice(0, 60);
        s.appendChild(a);
      });
      el.appendChild(s);
    }
    log.appendChild(el);
    if (extra && (extra.lead || extra.ticket)) {
      var t = document.createElement('div');
      t.className = 'tag';
      t.textContent = extra.lead ? T.lead : T.ticket;
      log.appendChild(t);
    }
  }

  function drawAll() {
    log.innerHTML = '';
    bubble('assistant', T.hello);
    state.messages.forEach(function (m) { bubble(m.role, m.content, m); });
    if (!state.messages.length) {
      var chips = document.createElement('div');
      chips.className = 'chips';
      T.chips.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'chip'; b.textContent = c;
        b.addEventListener('click', function () { ask(c); });
        chips.appendChild(b);
      });
      log.appendChild(chips);
    }
    log.scrollTop = log.scrollHeight;
  }

  function setOpen(open, focus) {
    state.open = open;
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    save();
    if (open) {
      loadDeckie();
      strike(focus !== false ? 'wave' : null, 1900); // no wave when the chat reopens itself on the next page
      drawAll();
      if (focus !== false) setTimeout(function () { input.focus(); }, 30);
    }
    else if (focus !== false) fab.focus();
  }

  // fetch, retried once after 3 s when the network itself fails (a sleeping or restarting server), never after an answer.
  function post(url, opts, tries) {
    return fetch(url, opts).catch(function (err) {
      if (tries >= 1) throw err;
      return new Promise(function (ok) { setTimeout(ok, 3000); }).then(function () { return post(url, opts, tries + 1); });
    });
  }

  function ask(text) {
    text = String(text || '').trim().slice(0, 1000);
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    strike('think');
    var chips = root.querySelector('.chips');
    if (chips) chips.remove();
    var history = state.messages.map(function (m) { return { role: m.role, content: m.content }; });
    state.messages.push({ role: 'user', content: text });
    save();
    bubble('user', text);
    var typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<i></i><i></i><i></i><span></span>';
    typing.querySelector('span').textContent = T.thinking;
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    if (APP && navigator.onLine === false) {
      typing.remove(); bubble('assistant', T.offline);
      busy = false; sendBtn.disabled = false; strike(); save(); return;
    }
    // The free server sleeps when nobody has asked for a while: say so after 8 s instead of looking stuck.
    var slow = APP ? setTimeout(function () { var sp = typing.querySelector('span'); if (sp) sp.textContent = T.waking; }, 8000) : null;
    post(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(APP ? Object.assign(appFields(), { message: text, history: history, conversationId: state.conversationId, lang: LANG_NOW })
        : { message: text, history: history, conversationId: state.conversationId, lang: LANG, page: location.pathname }),
    }, APP ? 0 : 1)
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data.conversationId) state.conversationId = data.conversationId;
        var reply = data.reply || T.error;
        var msg = { role: 'assistant', content: reply, sources: data.sources || [], lead: !!data.lead, ticket: !!data.ticket };
        state.messages.push(msg);
        typing.remove();
        bubble('assistant', reply, msg);
        if (data.reply) strike('give', 3600);
      })
      .catch(function () {
        typing.remove();
        bubble('assistant', T.error);
      })
      .then(function () {
        clearTimeout(slow);
        busy = false;
        sendBtn.disabled = false;
        save();
        log.scrollTop = log.scrollHeight;
        input.focus();
      });
  }

  var dragged = false;
  fab.addEventListener('click', function (e) {
    if (dragged) { dragged = false; e.preventDefault(); return; }
    setOpen(!state.open);
  });
  $('.x').addEventListener('click', function () { setOpen(false); });
  $('.reset').addEventListener('click', function () {
    if (busy) return;
    state.messages = []; state.conversationId = null; save(); drawAll(); input.focus();
    strike('wave', 1900);
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value;
    input.value = '';
    input.style.height = '';
    ask(v);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); }
  });
  input.addEventListener('input', function () {
    input.style.height = ''; input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    if (!busy) strike(); // starts or stops listening; typing also cuts a wave or a "here you go" short
  });
  root.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) setOpen(false); });

  // ---------- in-app: placement, drag, hide, the off switch ----------
  var place = { side: 'right', y: 0 }, insets = { bottom: 0, side: 0 }, hiddenBy = false, enabled = true, remoteOff = false;
  if (APP) {
    try {
      var sp = JSON.parse(lsGet('agentdeck_place') || 'null');
      if (sp && (sp.side === 'left' || sp.side === 'right')) place = { side: sp.side, y: Math.max(0, +sp.y || 0) };
    } catch (e) {}
  }
  function layout() {
    if (!APP) return;
    var vh = window.innerHeight || 700;
    var fb = Math.min(18 + insets.bottom + place.y, Math.max(18, vh - 60));
    var ph = Math.min(600, vh - 100), sx = 18 + insets.side;
    var above = fb + 56 <= vh - ph - 12;   // room for the panel above the button? If not, it opens beside the button
    host.setAttribute('data-side', place.side);
    host.style.setProperty('--ad-sx', sx + 'px');
    host.style.setProperty('--ad-px', (above ? sx : sx + 56) + 'px');
    host.style.setProperty('--ad-fb', fb + 'px');
    host.style.setProperty('--ad-pb', Math.max(12, above ? fb + 56 : Math.min(fb, vh - ph - 12)) + 'px');
  }
  function unavailable() { return APP && (hiddenBy || !enabled || remoteOff); }
  function showHost() { host.style.display = unavailable() ? 'none' : ''; }
  if (APP) {
    layout();
    window.addEventListener('resize', layout);
    // Drag the button anywhere; it snaps to the nearer side at the height it was dropped and remembers it on this device.
    var start = null;
    fab.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
    });
    // On the window, not the button: a quick flick leaves the button before it can capture the pointer.
    window.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id) return;
      if (!start.moving && Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) < 8) return;
      if (!start.moving) { start.moving = true; fab.classList.add('drag'); }
      start.lx = e.clientX; start.ly = e.clientY;   // the drop uses the last move: a cancelled drag reports 0, 0
      fab.style.left = (e.clientX - 22) + 'px'; fab.style.top = (e.clientY - 22) + 'px';
      fab.style.right = 'auto'; fab.style.bottom = 'auto';
    });
    var endDrag = function (e) {
      if (!start || e.pointerId !== start.id) return;
      var s = start; start = null;
      if (!s.moving) return;
      dragged = true; setTimeout(function () { dragged = false; }, 400);
      fab.classList.remove('drag');
      fab.style.left = fab.style.top = fab.style.right = fab.style.bottom = '';
      var vh = window.innerHeight || 700;
      place = { side: s.lx < (window.innerWidth || 1000) / 2 ? 'left' : 'right', y: Math.max(0, Math.round(vh - s.ly - 22 - 18 - insets.bottom)) };
      lsSet('agentdeck_place', JSON.stringify(place));
      layout();
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    var online = function () { fab.classList.toggle('off', navigator.onLine === false); };
    window.addEventListener('online', online); window.addEventListener('offline', online); online();
    // The off switch: "agentInApp": false in backend.json hides the help button in every app, no release needed.
    var OKHOST = /^https:\/\/(asia-southeast1-[a-z0-9-]+\.cloudfunctions\.net|teachersdeck-[a-z0-9-]+\.onrender\.com|teachersdeck-[a-z0-9-]+\.netlify\.app|[a-z0-9-]+\.myteachersdeck\.com)$/;
    if (typeof fetch === 'function' && !/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(ENDPOINT)) {
      fetch('https://myteachersdeck.com/backend.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j) return;
        if (j.agentInApp === false) { remoteOff = true; if (state.open) setOpen(false, false); showHost(); }
        var u = j.agentChat || j.functions;
        if (typeof u === 'string' && OKHOST.test(u.replace(/\/agentChat$/, ''))) ENDPOINT = u.replace(/\/agentChat$/, '') + '/agentChat';
      }).catch(function () {});
    }
  }

  // Public hook so any button on the site can open the assistant: window.AgentDeck.open('question')
  window.AgentDeck = {
    open: function (q) { if (unavailable()) return; setOpen(true); if (q) ask(q); },
    close: function () { setOpen(false); },
    // In-app controls (no-ops on the website)
    setInsets: function (o) { if (!APP || !o) return; insets = { bottom: Math.max(0, +o.bottom || 0), side: Math.max(0, +o.side || 0) }; layout(); },
    setHidden: function (h) { if (!APP) return; hiddenBy = !!h; if (h && state.open) setOpen(false, false); showHost(); },
    setEnabled: function (v) { if (!APP) return; enabled = v !== false; if (!enabled && state.open) setOpen(false, false); showHost(); },
    setTheme: function (t) {
      if (!t) return;
      var map = { accent: 'accent', onAccent: 'on-accent', surface: 'surface', text: 'text', muted: 'muted', line: 'line', bg: 'bg' };
      Object.keys(map).forEach(function (k) { if (typeof t[k] === 'string' && t[k]) host.style.setProperty('--' + map[k], t[k]); });
    },
    isAvailable: function () { return !(APP && (remoteOff || !enabled)); },
  };

  if (state.open || script.getAttribute('data-open') === '1') setOpen(true, false);
})();
