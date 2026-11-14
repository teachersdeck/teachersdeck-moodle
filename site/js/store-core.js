/* Store core (Item Store S0): the formats of store packs that are not Scrapdeck packs — premium THEMES, watch and
 * clock FACES, noise METERS and traffic LIGHTS — plus the small engine that brings a face, meter or light to life.
 *
 * Docks are a style name from a fixed list plus optional colours; js/dockstyle.js draws them.
 * Rule 4 of the store scope: a pack is DATA, never code. A theme is a set of CSS colour tokens (hex / rgba, and
 * gradients made only of those). A face, meter or light is one SVG drawing checked tag by tag against an allowlist
 * (no script, no style, no links, no images, no foreignObject, no event attributes, url() only to its own #ids) with
 * named hooks the engine moves: data-h (hands, needle) rotated about data-c="cx cy", data-f (digital text slots)
 * and data-lamp (lamps, each with a data-on and a data-off group). The engine is app code, shipped in releases.
 *
 * Runs in the browser (window.StoreCore) and under Node (module.exports) with no DOM for the validators, so the
 * backend validates a pack before serving it with the very same file. Canonical copy: studentdeck/js/store-core.js;
 * tools/check_shared.py keeps parentdeck/js/ and backend/functions/src/ identical.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StoreCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 1;
  var ID_RE = /^[a-z0-9_-]{1,40}$/;
  var SKU_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
  var TIERS = ['free', 'paid', 'pro', 'teacher'];
  var SKIN_KINDS = ['face', 'meter', 'light'];
  // What a face is drawn as (owner, 10 Nov 2026): the Shop and the Clock group faces by it.
  var FACE_FORMS = ['watch', 'pocket', 'wall', 'alarm', 'desk'];
  // Docks (owner, 10 Nov 2026): a launcher style the app already knows how to draw, plus optional colours. The style is
  // only a name from this list; the dock's behaviour is app code (js/dockstyle.js).
  var DOCK_STYLES = ['float', 'magnify', 'sidebar', 'circle', 'radial'];
  var DOCK_TOKENS = ['bg', 'line', 'ink', 'acc', 'hov'];
  var MAX_SVG = 40000;          // one face drawing; the owner's dials are 25-28 KB
  var MAX_ITEMS = 12;

  function bilingual(n) {
    if (!n || typeof n.en !== 'string' || !n.en.trim()) return null;
    var en = n.en.trim().slice(0, 60);
    return { en: en, vi: typeof n.vi === 'string' && n.vi.trim() ? n.vi.trim().slice(0, 60) : en };
  }

  /* ---------- colours and gradients ---------- */
  var HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  var RGBA_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+))?\s*\)$/;
  function isColor(v) { return typeof v === 'string' && (HEX_RE.test(v.trim()) || RGBA_RE.test(v.trim())); }
  var GRADIENT_WORDS = ['linear', 'radial', 'repeating', 'gradient', 'deg', 'turn', 'at', 'to', 'top', 'bottom', 'left', 'right',
    'center', 'circle', 'ellipse', 'closest', 'farthest', 'side', 'corner', 'rgb', 'rgba', 'px', 'transparent'];
  /** A CSS background made only of gradients and plain colours: no url(), no var(), no image-set, nothing else. */
  function isGradient(v) {
    if (typeof v !== 'string') return false;
    var s = v.trim().toLowerCase();
    if (!s || s.length > 600) return false;
    if (isColor(s)) return true;
    if (!/^(repeating-)?(linear|radial)-gradient\(/.test(s)) return false;
    if (!/^[a-z0-9#%.,()\s-]+$/.test(s)) return false;
    var words = s.replace(/#[0-9a-f]{3,8}\b/g, ' ').match(/[a-z]+/g) || [];
    for (var i = 0; i < words.length; i++) if (GRADIENT_WORDS.indexOf(words[i]) < 0) return false;
    var depth = 0;
    for (var j = 0; j < s.length; j++) { if (s[j] === '(') depth++; else if (s[j] === ')') { depth--; if (depth < 0) return false; } }
    return depth === 0;
  }

  /* ---------- themes ---------- */
  // Fonts a theme may ask for, mapped to stacks the apps already have (extensions load no web fonts at run time).
  var THEME_FONTS = {
    system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    display: '"Playfair Display", Georgia, "Times New Roman", serif',
    rounded: 'Nunito, "Segoe UI Rounded", system-ui, sans-serif',
    hand: '"Mystery Quest", "Segoe Print", "Comic Sans MS", cursive',   // Noel; bundled where an app ships fonts/ (TeachersDeck)
    // 13 Nov 2026: a face of its own for every premium theme (SIL OFL, with Vietnamese; bundled in TeachersDeck's fonts/)
    modern: 'Lexend, "Segoe UI", system-ui, sans-serif',
    soft: 'Comfortaa, "Segoe UI Rounded", system-ui, sans-serif',
    classic: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
    deco: '"Josefin Sans", "Segoe UI", system-ui, sans-serif',
    script: '"Dancing Script", "Segoe Script", cursive',
  };
  var THEME_TOKENS = ['bg', 'bgs', 'card', 'line', 'ink', 'muted', 'acc', 'bb', 'bt', 'dock', 'hov'];
  var THEME_DECOS = ['none', 'snow', 'lanterns'];
  // Animated wallpapers (13 Nov 2026): a theme may name one of the shaders the apps ship (TeachersDeck's js/wallpaper.js)
  // and give it colours. Data only, like everything in a pack: the shader code is never in the pack.
  var WALLPAPER_SHADERS = { 'glass-fold': 3, 'fluted-glass': 8 };   // shader -> most colours it takes
  var HEX6_RE = /^#[0-9a-fA-F]{6}$/;   // wallpaper colours go to WebGL as #rrggbb
  function validateWallpaper(w) {
    if (!w || typeof w !== 'object' || !WALLPAPER_SHADERS[w.shader]) return null;
    var cs = Array.isArray(w.colors) ? w.colors : [];
    if (cs.length < 2 || cs.length > WALLPAPER_SHADERS[w.shader] || !cs.every(function (c) { return typeof c === 'string' && HEX6_RE.test(c); })) return null;
    var num = function (v, lo, hi, d) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    return { shader: w.shader, colors: cs.map(function (c) { return c.toLowerCase(); }), speed: num(w.speed, 0, 2, 0.5), scale: num(w.scale, 0.25, 4, 1) };
  }
  function validateThemeItem(r, where, errors) {
    var nm = bilingual(r.name); if (!nm) { errors.push(where + '.name'); return null; }
    var t = r.tokens || {}, tokens = {};
    for (var i = 0; i < THEME_TOKENS.length; i++) {
      var k = THEME_TOKENS[i], v = t[k];
      var ok = k === 'bg' ? isGradient(v) : isColor(v);
      if (!ok) { errors.push(where + '.tokens.' + k); return null; }
      tokens[k] = v.trim();
    }
    var light = r.light !== undefined ? r.light : null;
    if (light !== null && !isGradient(light)) { errors.push(where + '.light'); return null; }
    var greeting = r.greeting !== undefined ? bilingual(r.greeting) : null;   // a short line the app shows in its top bar (Tết: Chúc Mừng Năm Mới)
    if (r.greeting !== undefined && !greeting) { errors.push(where + '.greeting'); return null; }
    var wallpaper = null;
    if (r.wallpaper !== undefined) { wallpaper = validateWallpaper(r.wallpaper); if (!wallpaper) { errors.push(where + '.wallpaper'); return null; } }
    var swatch = r.swatch !== undefined ? r.swatch : tokens.bg;
    if (!isGradient(swatch)) { errors.push(where + '.swatch'); return null; }
    var item = {
      id: r.id, name: nm, tokens: tokens, light: light, swatch: swatch,
      scheme: r.scheme === 'light' ? 'light' : 'dark',
      radius: Math.max(0, Math.min(40, Math.round(Number(r.radius) || 18))),
      font: THEME_FONTS[r.font] ? r.font : 'system',
      fontBody: THEME_FONTS[r.fontBody] ? r.fontBody : 'system',
      deco: THEME_DECOS.indexOf(r.deco) >= 0 ? r.deco : 'none',
    };
    if (wallpaper) item.wallpaper = wallpaper;
    if (greeting) item.greeting = greeting;   // only when the theme has one, so older packs stay byte-for-byte the same
    return item;
  }
  /** The CSS custom properties an app sets on its root for a theme item (`--st-*`), plus the body background. */
  function themeVars(item) {
    var out = {};
    THEME_TOKENS.forEach(function (k) { out['--st-' + k] = item.tokens[k]; });
    out['--st-radius'] = item.radius + 'px';
    out['--st-font'] = THEME_FONTS[item.font];
    out['--st-font-body'] = THEME_FONTS[item.fontBody];
    return out;
  }
  function themeBackground(item, light) {
    if (light && item.light) return item.light;
    return isColor(item.tokens.bg) ? item.tokens.bg : item.tokens.bg + ', ' + item.tokens.bgs;   // a colour can only be the last layer
  }

  /* ---------- SVG drawings (faces, meters, lights) ---------- */
  var SVG_ELEMENTS = ['svg', 'g', 'defs', 'title', 'desc', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask',
    'pattern', 'filter', 'fegaussianblur', 'feoffset', 'feflood', 'fecomposite', 'femerge', 'femergenode', 'fecolormatrix',
    'fedropshadow', 'feblend', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan'];
  var ATTR_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_:.-]*$/;
  var BAD_ATTRS = /^(on|href$|xlink:href$|src$|style$|xmlns:(?!xlink$))/i;   // no style attribute: a drawing can't position itself over the app
  var BAD_VALUE = /javascript:|data:|expression|@import|<|\\/i;
  var URL_RE = /url\(\s*([^)]*)\)/gi;
  var TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  var ATTR_RE = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  var ENTITY_RE = /&(?!(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/;

  /** Checks one SVG drawing. Returns null when it is clean data, else a short reason. */
  function checkSkinSvg(svg) {
    if (typeof svg !== 'string') return 'not-svg';
    var s = svg.trim();
    if (s.length > MAX_SVG) return 'too-big';
    if (!/^<svg[\s>]/.test(s) || !/<\/svg>$/.test(s)) return 'not-svg';
    var last = 0, m, stack = [];
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(s))) {
      var text = s.slice(last, m.index);
      if (/[<>]/.test(text) || ENTITY_RE.test(text)) return 'bad-text';
      last = TAG_RE.lastIndex;
      var close = m[1] === '/', name = m[2].toLowerCase(), selfClose = m[4] === '/';
      if (SVG_ELEMENTS.indexOf(name) < 0) return 'element:' + name;
      if (close) { if (stack.pop() !== name) return 'nesting'; continue; }
      var a, attrs = m[3] || '';
      ATTR_RE.lastIndex = 0;
      while ((a = ATTR_RE.exec(attrs))) {
        if (!a[0].trim()) continue;
        var an = a[1], av = a[2] !== undefined ? a[2] : (a[3] !== undefined ? a[3] : '');
        if (!ATTR_NAME_RE.test(an) || BAD_ATTRS.test(an)) return 'attr:' + an;
        if (BAD_VALUE.test(av)) return 'value:' + an;
        if (ENTITY_RE.test(av)) return 'value:' + an;
        var u; URL_RE.lastIndex = 0;
        while ((u = URL_RE.exec(av))) if (!/^#[A-Za-z0-9_-]+$/.test(u[1].trim())) return 'url:' + an;
        if (/url\s*\(/i.test(av.replace(URL_RE, ''))) return 'url:' + an;
      }
      if (!selfClose) stack.push(name);
    }
    if (s.slice(last).trim()) return 'bad-text';
    if (stack.length) return 'nesting';
    return null;
  }
  function hasHook(svg, attr, value) { return new RegExp('\\s' + attr + '="' + value + '"').test(svg); }

  function validateSkinItem(kind, r, where, errors) {
    var nm = bilingual(r.name); if (!nm) { errors.push(where + '.name'); return null; }
    var e = checkSkinSvg(r.svg); if (e) { errors.push(where + ':' + e); return null; }
    var svg = r.svg.trim();
    var it = { id: r.id, name: nm, svg: svg };
    if (r.swatch !== undefined) { if (!isGradient(r.swatch)) { errors.push(where + '.swatch'); return null; } it.swatch = r.swatch; }
    if (kind === 'face') {
      it.style = r.style === 'digital' ? 'digital' : 'analogue';
      it.form = FACE_FORMS.indexOf(r.form) >= 0 ? r.form : 'watch';
      if (it.style === 'analogue' && !(hasHook(svg, 'data-h', 'hh') && hasHook(svg, 'data-h', 'mh'))) { errors.push(where + ':no-hands'); return null; }
      if (it.style === 'digital' && !/\sdata-f="(time|time12|time24)"/.test(svg) && !/\sdata-seg="[Hh]1"/.test(svg)) { errors.push(where + ':no-time'); return null; }
    } else if (kind === 'meter') {
      if (!hasHook(svg, 'data-h', 'needle')) { errors.push(where + ':no-needle'); return null; }
      var sw = Number(r.sweep);
      if (!(sw >= 15 && sw <= 80)) { errors.push(where + '.sweep'); return null; }
      it.sweep = sw;
    } else if (kind === 'light') {
      for (var i = 0; i < 3; i++) if (!hasHook(svg, 'data-lamp', String(i))) { errors.push(where + ':no-lamp' + i); return null; }
      if ((svg.match(/\sdata-on(?=[\s=>])/g) || []).length < 3 || (svg.match(/\sdata-off(?=[\s=>])/g) || []).length < 3) { errors.push(where + ':lamp-states'); return null; }
    }
    return it;
  }

  /* ---------- docks ---------- */
  function validateDockItem(r, where, errors) {
    var nm = bilingual(r.name); if (!nm) { errors.push(where + '.name'); return null; }
    if (DOCK_STYLES.indexOf(r.style) < 0) { errors.push(where + '.style'); return null; }
    var tokens = null;
    if (r.tokens !== undefined && r.tokens !== null) {
      tokens = {};
      for (var k in r.tokens) {
        if (DOCK_TOKENS.indexOf(k) < 0 || !isColor(r.tokens[k])) { errors.push(where + '.tokens.' + k); return null; }
        tokens[k] = r.tokens[k].trim();
      }
    }
    var swatch = r.swatch !== undefined ? r.swatch : '#2a3142';
    if (!isGradient(swatch)) { errors.push(where + '.swatch'); return null; }
    return { id: r.id, name: nm, style: r.style, tokens: tokens, swatch: swatch };
  }

  /* ---------- any store pack ---------- */
  /**
   * Validates a theme / face / meter / light pack. Scrapdeck kinds (sticker, stamp, mask, layout) are checked by
   * ScrapCore.validatePack: pass it as opts.scrap (the backend does once the first sticker pack ships).
   * Returns { ok:true, pack } or { ok:false, error, errors }.
   */
  function validateStorePack(raw, opts) {
    opts = opts || {};
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'not-an-object', errors: ['not-an-object'] };
    if (['sticker', 'stamp', 'mask', 'layout'].indexOf(raw.kind) >= 0) {
      if (!opts.scrap) return { ok: false, error: 'needs-scrapcore', errors: ['needs-scrapcore'] };
      var sv = opts.scrap.validatePack(raw);
      return sv.ok ? sv : { ok: false, error: sv.errors.join(','), errors: sv.errors };
    }
    var errors = [];
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) errors.push('id');
    if (!(Number.isInteger(raw.version) && raw.version >= 1)) errors.push('version');
    var isTheme = raw.kind === 'theme', isDock = raw.kind === 'dock';
    if (!isTheme && !isDock && SKIN_KINDS.indexOf(raw.kind) < 0) errors.push('kind');
    var name = bilingual(raw.name); if (!name) errors.push('name');
    if (raw.sku !== undefined && !(typeof raw.sku === 'string' && SKU_RE.test(raw.sku))) errors.push('sku');
    if (raw.tier !== undefined && TIERS.indexOf(raw.tier) < 0) errors.push('tier');
    if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > MAX_ITEMS) errors.push('items');
    var items = [], seen = {};
    (Array.isArray(raw.items) ? raw.items : []).forEach(function (r, i) {
      var where = 'items[' + i + ']';
      if (!r || typeof r.id !== 'string' || !ID_RE.test(r.id) || seen[r.id]) { errors.push(where + '.id'); return; }
      seen[r.id] = true;
      var it = isTheme ? validateThemeItem(r, where, errors) : isDock ? validateDockItem(r, where, errors) : validateSkinItem(raw.kind, r, where, errors);
      if (it) items.push(it);
    });
    if (raw.preview !== undefined && !(Array.isArray(raw.preview) && raw.preview.length <= 6 && raw.preview.every(function (x) { return seen[x] === true; }))) errors.push('preview');
    if (errors.length) return { ok: false, error: errors.join(','), errors: errors };
    var pack = {
      format: FORMAT, id: raw.id, version: raw.version, kind: raw.kind, name: name,
      license: typeof raw.license === 'string' ? raw.license.slice(0, 200) : '', items: items,
      tier: raw.tier || (raw.sku ? 'paid' : 'free'),
      preview: Array.isArray(raw.preview) && raw.preview.length ? raw.preview.slice() : items.slice(0, 6).map(function (x) { return x.id; }),
    };
    if (raw.sku) pack.sku = raw.sku;
    return { ok: true, pack: pack };
  }

  /* ---------- engine (browser) ---------- */
  var seq = 0;
  /** Gives a drawing's ids a unique prefix so two drawings on one page never share a gradient or clip path. */
  function scopeSvg(svg, prefix) {
    var ids = {};
    svg.replace(/\sid="([A-Za-z0-9_-]+)"/g, function (_, id) { ids[id] = true; return _; });
    return svg
      .replace(/\sid="([A-Za-z0-9_-]+)"/g, function (_, id) { return ' id="' + prefix + id + '"'; })
      .replace(/url\(\s*#([A-Za-z0-9_-]+)\s*\)/g, function (_, id) { return ids[id] ? 'url(#' + prefix + id + ')' : _; });
  }
  function drawInto(container, item) {
    container.innerHTML = scopeSvg(item.svg, 'sk' + (++seq) + '-');   // validated data, ids scoped
    var svg = container.querySelector('svg');
    if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.setAttribute('preserveAspectRatio', 'xMidYMid meet'); }
    return svg;
  }
  function pivotOf(el) { var c = (el.getAttribute('data-c') || '200 200').split(/[\s,]+/).map(Number); return (c[0] || 0) + ' ' + (c[1] || 0); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var DAYS = { en: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] };
  /** Text for a digital slot at time d. */
  function slotText(kind, d, lang) {
    var h = d.getHours(), m = d.getMinutes();
    switch (kind) {
      case 'time': case 'time24': return pad(h) + ':' + pad(m);
      case 'time12': return ((h % 12) || 12) + ':' + pad(m);
      case 'sec': return pad(d.getSeconds());
      case 'ampm': return h < 12 ? 'AM' : 'PM';
      case 'day': return (DAYS[lang] || DAYS.en)[d.getDay()];
      case 'date': return pad(d.getDate());
      case 'dmy': return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + String(d.getFullYear()).slice(2);
      default: return '';
    }
  }
  // Seven-segment digits: a group data-seg="H1|H2|M1|M2" (12-hour; H1 blank before 10) or "h1|h2|m1|m2" (24-hour),
  // holding seven shapes data-s="a".."g". Lit segments are opaque, the rest stay as a faint ghost, like a real LCD.
  var SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  function segDigit(kind, d) {
    var h = d.getHours(), m = d.getMinutes(), h12 = (h % 12) || 12;
    switch (kind) {
      case 'H1': return h12 >= 10 ? 1 : -1;
      case 'H2': return h12 % 10;
      case 'h1': return Math.floor(h / 10);
      case 'h2': return h % 10;
      case 'M1': case 'm1': return Math.floor(m / 10);
      case 'M2': case 'm2': return m % 10;
      default: return -1;
    }
  }
  function litSegments(digit) { return digit < 0 ? '' : SEGMENTS[digit]; }
  /** Angles (degrees) of each analogue hook at time d. sweep: smooth seconds. */
  function handAngles(d, sweep) {
    var sec = d.getSeconds() + (sweep ? d.getMilliseconds() / 1000 : 0), min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
    return { hh: hr * 30, mh: min * 6, sh: sec * 6, h24: (d.getHours() + min / 60) * 15, c1: sec * 6, c2: (min % 30) * 12, c3: hr * 30 };
  }
  /**
   * Shows a face in `container` and keeps it running. Returns { stop() }.
   * opts: { lang, reduceMotion, now() } (now is for tests and previews).
   */
  function mountFace(container, item, opts) {
    opts = opts || {};
    var svg = drawInto(container, item); if (!svg) return { stop: function () {} };
    var hands = [].slice.call(svg.querySelectorAll('[data-h]')).map(function (e) { return { e: e, id: e.getAttribute('data-h'), c: pivotOf(e) }; });
    var slots = [].slice.call(svg.querySelectorAll('[data-f]')).map(function (e) { return { e: e, f: e.getAttribute('data-f') }; });
    var digits = [].slice.call(svg.querySelectorAll('[data-seg]')).map(function (e) {
      return { k: e.getAttribute('data-seg'), segs: [].slice.call(e.querySelectorAll('[data-s]')).map(function (x) { return { e: x, s: x.getAttribute('data-s') }; }), last: null };
    });
    var reduce = !!opts.reduceMotion, stopped = false, timer = 0;
    function tick() {
      var d = opts.now ? opts.now() : new Date(), A = handAngles(d, !reduce);
      hands.forEach(function (h) { if (A[h.id] !== undefined) h.e.setAttribute('transform', 'rotate(' + A[h.id].toFixed(2) + ' ' + h.c + ')'); });
      slots.forEach(function (s) { var t = slotText(s.f, d, opts.lang); if (s.e.textContent !== t) s.e.textContent = t; });
      digits.forEach(function (g) {
        var lit = litSegments(segDigit(g.k, d)); if (lit === g.last) return; g.last = lit;
        g.segs.forEach(function (x) { x.e.setAttribute('opacity', lit.indexOf(x.s) >= 0 ? '1' : '0.1'); });
      });
    }
    function loop() { if (stopped) return; tick(); timer = reduce || typeof requestAnimationFrame !== 'function' ? setTimeout(loop, 1000) : requestAnimationFrame(loop); }
    loop();
    return { stop: function () { stopped = true; if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(timer); clearTimeout(timer); } };
  }
  /** Shows a noise meter. Returns { set(level 0..1), stop() }. */
  function mountMeter(container, item) {
    var svg = drawInto(container, item); var nd = svg && svg.querySelector('[data-h="needle"]');
    var c = nd ? pivotOf(nd) : '200 200';
    function set(level) {
      if (!nd) return;
      var f = Math.max(0, Math.min(1, Number(level) || 0)), a = -item.sweep + 2 * item.sweep * f;
      nd.setAttribute('transform', 'rotate(' + a.toFixed(2) + ' ' + c + ')');
    }
    set(0);
    return { set: set, stop: function () {} };
  }
  /** Shows a traffic light. Returns { set(lamp 0 red, 1 amber, 2 green, -1 all off), stop() }. */
  function mountLight(container, item) {
    var svg = drawInto(container, item);
    var lamps = svg ? [0, 1, 2].map(function (i) { return svg.querySelector('[data-lamp="' + i + '"]'); }) : [];
    function set(on) {
      lamps.forEach(function (g, i) {
        if (!g) return;
        [].forEach.call(g.querySelectorAll('[data-on]'), function (e) { e.style.display = i === on ? '' : 'none'; });
        [].forEach.call(g.querySelectorAll('[data-off]'), function (e) { e.style.display = i === on ? 'none' : ''; });
      });
    }
    set(-1);
    return { set: set, stop: function () {} };
  }

  return {
    FORMAT: FORMAT, TIERS: TIERS, SKIN_KINDS: SKIN_KINDS, DOCK_STYLES: DOCK_STYLES, FACE_FORMS: FACE_FORMS, THEME_TOKENS: THEME_TOKENS, THEME_FONTS: THEME_FONTS, WALLPAPER_SHADERS: WALLPAPER_SHADERS, MAX_SVG: MAX_SVG,
    isColor: isColor, isGradient: isGradient, checkSkinSvg: checkSkinSvg, validateStorePack: validateStorePack,
    themeVars: themeVars, themeBackground: themeBackground, scopeSvg: scopeSvg, slotText: slotText, handAngles: handAngles, segDigit: segDigit, litSegments: litSegments,
    mountFace: mountFace, mountMeter: mountMeter, mountLight: mountLight,
  };
});
