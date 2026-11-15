/* A premium theme's own artwork (15 Nov 2026). The theme pack carries the drawings (`art`, checked by
 * StoreCore.validateStorePack); this file puts them on the screen. Each drawing is used only as a CSS image
 * (url("data:image/svg+xml,…")), so nothing inside it can run or catch a click. css/themeart.css places the slots:
 *   scene   a landscape filling the screen  drift   clouds sliding slowly across the sky
 *   sail    boats sliding along the scene's water line (drawn 2400 x 160 in the scene's units, bottom at y 790)
 *   tile    repeated over the screen       band    a strip along the top      hang    two ornaments swaying from the top
 *   bottom  a scene along the bottom       corner  each window's top-left     badge   the Clock window's top-right
 *   fall    small pieces drifting down
 * The same file in TeachersDeck, StudentDeck and ParentDeck (tools/check_shared.py). Each app calls
 * TDThemeArt.apply(item, mount) when its theme changes; `mount(el)` puts the layer where that app wants it. */
(function (root) {
  'use strict';
  var SLOTS = ['scene', 'drift', 'sail', 'tile', 'band', 'hang', 'bottom', 'corner', 'badge', 'fall'];
  var FALLING = 14;
  function uri(svg) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'; }
  function build(mount) {
    var d = document.getElementById('td-deco');
    if (d) return d;
    d = document.createElement('div'); d.id = 'td-deco'; d.setAttribute('aria-hidden', 'true');
    var fall = '';
    for (var i = 0; i < FALLING; i++) {
      fall += '<i style="left:' + ((i * 7.3 + 3) % 100).toFixed(1) + '%;animation-delay:' + (-(i * 1.9)).toFixed(1) + 's;animation-duration:' + (12 + (i % 5) * 2) + 's"></i>';
    }
    d.innerHTML = '<div class="dc-scene"></div><div class="dc-drift"></div><div class="dc-sail"></div><div class="dc-tile"></div><div class="dc-band"></div><div class="dc-hang h1"></div><div class="dc-hang h2"></div>' +
      '<div class="dc-bottom"></div><div class="dc-fall">' + fall + '</div>';
    if (typeof mount === 'function') mount(d); else document.body.prepend(d);
    return d;
  }
  /** Shows `item`'s artwork (a validated theme item, or null for none). Also sets data-td-deco, which the apps'
   *  premium.css uses for a theme's finishing touches (Tết's gold window frame, gold headline type). */
  function apply(item, mount) {
    var html = document.documentElement, art = (item && item.art) || null, have = [];
    build(mount);
    SLOTS.forEach(function (k) {
      if (art && typeof art[k] === 'string') { html.style.setProperty('--td-art-' + k, uri(art[k])); have.push(k); }
      else html.style.removeProperty('--td-art-' + k);
    });
    if (have.length) html.dataset.tdArt = have.join(' '); else delete html.dataset.tdArt;
    html.dataset.tdDeco = (item && item.deco) || 'none';
  }
  var api = { SLOTS: SLOTS, apply: apply, uri: uri };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TDThemeArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
