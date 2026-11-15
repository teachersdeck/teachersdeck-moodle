/* =========================================================
   Whiteboard background (Nov 2026, scope hq/docs/WHITEBOARD-SCOPE.md, phase B): the app's glue around DrawDeck's
   surface:'wall' engine (js/drawdeck.js).

   - The ink layer is the first child of #wall (#wall-ink), so every widget, the document stage and the pinned widgets
     sit above it, and a right-click on the empty wall still reaches the Radial dock style (js/dockstyle.js).
   - The controls are a corner radial menu, drawn with the dock rings' look (css/dockstyle.css): one round button
     bottom-left opens two rings. Inner ring: off, black, blue, red, eraser. Outer ring: undo, redo, clear, all drawing
     tools, surface, ink on my background. Premium buttons carry a lock on a free device.
   - With the Circle dock style the two share one corner button: the Circle's inner ring gets a Whiteboard segment whose
     outer ring holds the marker buttons (DockStyle.addInner). The Radial rings get the same segment.
   - One board per class: 'wall:<class id>' in the boards store (the class's state decides whether the Whiteboard is on).
   - Never on phones and tablets (html.bento: the wall is a scrolling grid there).

   Used by app.js:
     Object.assign(STRINGS, TDWhiteboard.strings);
     TDWhiteboard.setup({ t, toast, idb, lang(), tier() -> 'free'|'pro', classId(), className(), get(k), set(k, v),
                          onLocked(what), watermark, download(blob, name) });
     TDWhiteboard.sync(on)      after every background change (on = the class's Whiteboard background is picked)
     TDWhiteboard.refreshTier() after the licence or the store items change
   ========================================================= */
(function (root) {
  'use strict';

  var S = {
    wb_name:       { en: 'Whiteboard', vi: 'Bảng trắng', es: 'Pizarra blanca', fr: 'Tableau blanc', zh: '白板', ja: 'ホワイトボード', ko: '화이트보드', tl: 'Whiteboard' },
    wb_board:      { en: 'Whiteboard — {cls}', vi: 'Bảng trắng — {cls}', es: 'Pizarra — {cls}', fr: 'Tableau blanc — {cls}', zh: '白板 — {cls}', ja: 'ホワイトボード — {cls}', ko: '화이트보드 — {cls}', tl: 'Whiteboard — {cls}' },
    wb_menu:       { en: 'Whiteboard markers', vi: 'Bút bảng trắng', es: 'Rotuladores de la pizarra', fr: 'Feutres du tableau', zh: '白板笔', ja: 'ホワイトボードのマーカー', ko: '화이트보드 마커', tl: 'Mga marker ng whiteboard' },
    wb_off:        { en: 'Put the marker away', vi: 'Cất bút', es: 'Guardar el rotulador', fr: 'Ranger le feutre', zh: '收起笔', ja: 'マーカーをしまう', ko: '마커 넣기', tl: 'Itabi ang marker' },
    wb_black:      { en: 'Black marker', vi: 'Bút đen', es: 'Rotulador negro', fr: 'Feutre noir', zh: '黑色笔', ja: '黒のマーカー', ko: '검은색 마커', tl: 'Itim na marker' },
    wb_blue:       { en: 'Blue marker', vi: 'Bút xanh', es: 'Rotulador azul', fr: 'Feutre bleu', zh: '蓝色笔', ja: '青のマーカー', ko: '파란색 마커', tl: 'Asul na marker' },
    wb_red:        { en: 'Red marker', vi: 'Bút đỏ', es: 'Rotulador rojo', fr: 'Feutre rouge', zh: '红色笔', ja: '赤のマーカー', ko: '빨간색 마커', tl: 'Pulang marker' },
    wb_eraser:     { en: 'Eraser', vi: 'Tẩy', es: 'Borrador', fr: 'Gomme', zh: '橡皮擦', ja: '消しゴム', ko: '지우개', tl: 'Pambura' },
    wb_undo:       { en: 'Undo', vi: 'Hoàn tác', es: 'Deshacer', fr: 'Annuler', zh: '撤销', ja: '元に戻す', ko: '실행 취소', tl: 'I-undo' },
    wb_redo:       { en: 'Redo', vi: 'Làm lại', es: 'Rehacer', fr: 'Rétablir', zh: '重做', ja: 'やり直す', ko: '다시 실행', tl: 'I-redo' },
    wb_clear:      { en: 'Clear the board', vi: 'Xóa bảng', es: 'Borrar la pizarra', fr: 'Effacer le tableau', zh: '清空白板', ja: 'ボードを消す', ko: '보드 지우기', tl: 'Burahin ang board' },
    wb_clear_q:    { en: 'Clear the whole whiteboard? (Undo brings it back.)', vi: 'Xóa toàn bộ bảng trắng? (Hoàn tác sẽ khôi phục.)', es: '¿Borrar toda la pizarra? (Deshacer la recupera.)', fr: 'Effacer tout le tableau ? (Annuler le rétablit.)', zh: '清空整个白板？（撤销可恢复。）', ja: 'ホワイトボードをすべて消しますか？（元に戻すで復元できます）', ko: '화이트보드를 모두 지울까요? (실행 취소로 되돌릴 수 있어요.)', tl: 'Burahin ang buong whiteboard? (Maibabalik ng Undo.)' },
    wb_tools:      { en: 'All drawing tools', vi: 'Mọi công cụ vẽ', es: 'Todas las herramientas', fr: 'Tous les outils', zh: '全部绘图工具', ja: 'すべての描画ツール', ko: '모든 그리기 도구', tl: 'Lahat ng gamit sa pagguhit' },
    wb_tools_hide: { en: 'Hide the drawing tools', vi: 'Ẩn công cụ vẽ', es: 'Ocultar las herramientas', fr: 'Masquer les outils', zh: '隐藏绘图工具', ja: '描画ツールを隠す', ko: '그리기 도구 숨기기', tl: 'Itago ang mga gamit' },
    wb_surface:    { en: 'Surface', vi: 'Mặt bảng', es: 'Superficie', fr: 'Surface', zh: '板面', ja: '面', ko: '보드 면', tl: 'Ibabaw' },
    wb_inkbg:      { en: 'Ink on my background', vi: 'Vẽ lên hình nền của tôi', es: 'Tinta sobre mi fondo', fr: 'Encre sur mon fond', zh: '在我的背景上书写', ja: '背景の上に書く', ko: '내 배경 위에 쓰기', tl: 'Tinta sa aking background' },
    wb_locked:     { en: 'Premium Whiteboard: every DrawDeck tool on your wall', vi: 'Bảng trắng cao cấp: mọi công cụ DrawDeck ngay trên màn hình', es: 'Pizarra Premium: todas las herramientas de DrawDeck en tu pantalla', fr: 'Tableau blanc Premium : tous les outils DrawDeck sur votre écran', zh: '高级白板：在桌面上使用所有 DrawDeck 工具', ja: 'プレミアム ホワイトボード：DrawDeck の全ツールを画面に', ko: '프리미엄 화이트보드: 화면에서 DrawDeck의 모든 도구', tl: 'Premium Whiteboard: lahat ng gamit ng DrawDeck sa iyong screen' },
    wb_premium:    { en: 'Premium Whiteboard', vi: 'Bảng trắng cao cấp', es: 'Pizarra Premium', fr: 'Tableau blanc Premium', zh: '高级白板', ja: 'プレミアム ホワイトボード', ko: '프리미엄 화이트보드', tl: 'Premium Whiteboard' },
    wb_premium_blurb: { en: 'Every DrawDeck tool on your Whiteboard background: all colours and sizes, shapes, text, pictures, maths tools, templates, mind maps, flowcharts, surfaces and pages. Comes with the Circle and Radial menus.',
      vi: 'Mọi công cụ DrawDeck trên nền Bảng trắng: mọi màu và cỡ bút, hình, chữ, ảnh, dụng cụ toán, mẫu, sơ đồ tư duy, lưu đồ, mặt bảng và nhiều trang. Kèm Menu vòng tròn và Menu toả tròn.',
      es: 'Todas las herramientas de DrawDeck en tu fondo Pizarra: todos los colores y tamaños, formas, texto, imágenes, herramientas de matemáticas, plantillas, mapas mentales, diagramas de flujo, superficies y páginas. Incluye los menús Círculo y Radial.',
      fr: 'Tous les outils DrawDeck sur votre fond Tableau blanc : toutes les couleurs et tailles, formes, texte, images, outils de maths, modèles, cartes mentales, organigrammes, surfaces et pages. Avec les menus Cercle et Radial.',
      zh: '在白板背景上使用所有 DrawDeck 工具：全部颜色和粗细、形状、文字、图片、数学工具、模板、思维导图、流程图、板面和多页。附带圆形菜单和径向菜单。',
      ja: 'ホワイトボード背景で DrawDeck の全ツール：すべての色と太さ、図形、文字、画像、算数ツール、テンプレート、マインドマップ、フローチャート、面、ページ。サークルメニューとラジアルメニュー付き。',
      ko: '화이트보드 배경에서 DrawDeck의 모든 도구: 모든 색과 굵기, 도형, 글자, 그림, 수학 도구, 템플릿, 마인드맵, 순서도, 보드 면과 페이지. 원형 메뉴와 방사형 메뉴 포함.',
      tl: 'Lahat ng gamit ng DrawDeck sa iyong Whiteboard background: lahat ng kulay at laki, hugis, teksto, larawan, gamit sa math, template, mind map, flowchart, ibabaw at pahina. Kasama ang Circle at Radial menu.' },
    wb_pro_alt:    { en: 'Included with TeachersDeck Pro.', vi: 'Có sẵn trong TeachersDeck Pro.', es: 'Incluida en TeachersDeck Pro.', fr: 'Inclus dans TeachersDeck Pro.', zh: 'TeachersDeck Pro 已包含。', ja: 'TeachersDeck Pro に含まれています。', ko: 'TeachersDeck Pro에 포함되어 있어요.', tl: 'Kasama sa TeachersDeck Pro.' },
    wb_see_pro:    { en: 'See Pro', vi: 'Xem Pro', es: 'Ver Pro', fr: 'Voir Pro', zh: '查看 Pro', ja: 'Pro を見る', ko: 'Pro 보기', tl: 'Tingnan ang Pro' },
    wb_premium_on: { en: 'Premium Whiteboard is on: every drawing tool is on your whiteboard.', vi: 'Đã bật Bảng trắng cao cấp: mọi công cụ vẽ đã có trên bảng.', es: 'Pizarra Premium activada: todas las herramientas están en tu pizarra.', fr: 'Tableau blanc Premium activé : tous les outils sont sur votre tableau.', zh: '高级白板已开启：所有绘图工具都在白板上。', ja: 'プレミアム ホワイトボードがオンに：すべての描画ツールが使えます。', ko: '프리미엄 화이트보드가 켜졌어요: 모든 그리기 도구를 쓸 수 있어요.', tl: 'Naka-on ang Premium Whiteboard: nasa whiteboard na ang lahat ng gamit.' },
    wb_pages:      { en: 'Pages', vi: 'Các trang', es: 'Páginas', fr: 'Pages', zh: '页面', ja: 'ページ', ko: '페이지', tl: 'Mga pahina' },
    wb_page_n:     { en: 'Page {n}', vi: 'Trang {n}', es: 'Página {n}', fr: 'Page {n}', zh: '第 {n} 页', ja: '{n} ページ', ko: '{n}페이지', tl: 'Pahina {n}' },
    wb_add_page:   { en: 'Add a page', vi: 'Thêm trang', es: 'Añadir una página', fr: 'Ajouter une page', zh: '添加一页', ja: 'ページを追加', ko: '페이지 추가', tl: 'Magdagdag ng pahina' },
    wb_close:      { en: 'Close', vi: 'Đóng', es: 'Cerrar', fr: 'Fermer', zh: '关闭', ja: '閉じる', ko: '닫기', tl: 'Isara' }
  };

  var MARKERS = [{ key: 'black', c: '#1a1a1a' }, { key: 'blue', c: '#1e88e5' }, { key: 'red', c: '#e53935' }];
  var SURFACES = ['white', 'chalk', 'grid', 'lined', 'writing', 'graph', 'dots', 'axes'];
  function svg(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>'; }
  var IC = {
    hand: svg('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2L4 14.5a1.5 1.5 0 0 1 2.3-1.9L8 14"/>'),
    eraser: svg('<path d="M4 15l8-9 7 7-5 5H8l-4-3Z"/><path d="M9 11l6 6"/>'),
    undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
    clear: svg('<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'),
    tools: svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
    surface: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>'),
    inkbg: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M6 17c3-4 6 1 9-3s3-1 3-1"/>'),
    pen: svg('<path d="M4 20l1.2-4.3L16 5l3 3L8.3 18.8 4 20Z"/><path d="M14 7l3 3"/>'),
    pages: svg('<rect x="7" y="3" width="13" height="16" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h10"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>')
  };
  function dot(c) { return '<span class="wb-dot" style="background:' + c + '"></span>'; }

  var host = null, dd = null, layer = null, bars = null, launcher = null, st = null, rings = null, isOn = false, chromeOn = false, idleT = 0, suspended = false;
  function t(k, v) { return host ? host.t(k, v) : ((S[k] && S[k].en) || k); }
  function free() { return host.tier() !== 'pro'; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bento() { return document.documentElement.classList.contains('bento'); }

  function setup(h) { host = h; }

  function sync(want) {
    if (!host) return;
    want = !!want && !bento() && !suspended && typeof root.DrawDeck !== 'undefined';
    if (want && !isOn) enable();
    else if (!want && isOn) disable();
    else if (isOn) { dd.setTransparent(!!host.get('wbClear') && !free()); }
  }
  function enable() {
    var wall = document.getElementById('wall'); if (!wall) return;
    isOn = true; chromeOn = false;
    layer = el('div', 'wall-ink'); layer.id = 'wall-ink'; wall.insertBefore(layer, wall.firstChild);
    bars = el('div', 'wall-ink-bars'); bars.id = 'wall-ink-bars'; document.body.appendChild(bars);   // the premium bars: above the widgets
    document.body.classList.add('wb-on');
    dd = root.DrawDeck.mount(layer, {
      t: host.t, toast: host.toast, idb: host.idb(), close: function () { }, watermark: host.watermark || null, download: host.download,
      surface: 'wall', chromeEl: bars, tier: host.tier(),
      preschool: !!host.preschool, tracing: !!host.preschool, markerSize: host.markerSize,   // TinyTeachersDeck transparent: !!host.get('wbClear') && host.tier() === 'pro', tool: 'off',
      boardId: 'wall:' + host.classId(), boardName: t('wb_board', { cls: host.className() || t('wb_name') }),
      onState: function (s) { st = s; document.body.classList.toggle('wb-light', !s.transparent && s.bg !== 'chalk'); paintLauncher(); },   // css: the top bar's bare text gets a plate on a white board
      onLocked: function (what) { locked(what); },
      openFull: host.openFull ? function (id) { host.openFull(id); } : null,
      cloudClassId: host.cloudClassId || null, share: host.share || null, stopShare: host.stopShare || null, assignBoard: host.assignBoard || null
    });
    buildLauncher();
  }
  function disable() {
    isOn = false; closeRings();
    try { if (dd) dd(); } catch (e) { }
    dd = null; st = null;
    if (layer) layer.remove(); layer = null;
    if (bars) bars.remove(); bars = null;
    if (launcher) launcher.remove(); launcher = null;
    document.body.classList.remove('wb-on', 'wb-light');
  }
  function refreshTier() {
    if (!isOn || !dd) return;
    dd.setTier(host.tier()); if (free() && chromeOn) { chromeOn = false; }
    dd.setTransparent(!!host.get('wbClear') && !free());
    paintLauncher();
  }
  function locked(what) { closeRings(); if (host.onLocked) host.onLocked(what); else host.toast(t('wb_locked')); }

  /* ---------- the corner button ---------- */
  function buildLauncher() {
    launcher = el('button', 'dk-launcher wb-launcher');
    launcher.type = 'button'; launcher.setAttribute('aria-haspopup', 'menu');
    launcher.addEventListener('click', function () { if (rings) { closeRings(); return; } var r = launcher.getBoundingClientRect(); openRings(r.left + r.width / 2, r.top + r.height / 2); });
    document.body.appendChild(launcher);
    paintLauncher();
  }
  function curMarker() { if (!st) return null; for (var i = 0; i < MARKERS.length; i++) if (MARKERS[i].c === String(st.color).toLowerCase()) return MARKERS[i]; return null; }
  function paintLauncher() {
    if (!launcher) return;
    var tool = st ? st.tool : 'off', label;
    if (tool === 'off') { launcher.innerHTML = IC.hand; label = t('wb_menu'); launcher.style.removeProperty('--wb-ink'); }
    else if (tool === 'eraser') { launcher.innerHTML = IC.eraser; label = t('wb_eraser'); launcher.style.removeProperty('--wb-ink'); }
    else { var m = curMarker(); launcher.innerHTML = IC.pen; launcher.style.setProperty('--wb-ink', st.color); label = m ? t('wb_' + m.key) : t('wb_menu'); }
    launcher.classList.toggle('wb-active', tool !== 'off');
    launcher.title = label; launcher.setAttribute('aria-label', t('wb_menu') + ': ' + label);
    if (rings && rings._repaint) rings._repaint();
  }

  /* ---------- the buttons (shared by the corner rings and the Circle / Radial segment) ---------- */
  function innerItems() {
    var tool = st ? st.tool : 'off', col = st ? String(st.color).toLowerCase() : '';
    return [{ key: 'off', label: t('wb_off'), icon: IC.hand, on: tool === 'off', act: function () { dd.setTool('off'); if (chromeOn) toggleChrome(false); }, close: true }]
      .concat(MARKERS.map(function (m) { return { key: m.key, label: t('wb_' + m.key), icon: dot(m.c), on: tool === 'pen' && col === m.c, act: function () { dd.setColor(m.c); dd.setTool('pen'); }, close: true }; }))
      .concat([{ key: 'eraser', label: t('wb_eraser'), icon: IC.eraser, on: tool === 'eraser', act: function () { dd.setTool('eraser'); }, close: true }]);
  }
  function outerItems() {
    var lockedPro = free();
    return [
      { key: 'undo', label: t('wb_undo'), icon: IC.undo, dis: !(st && st.canUndo), act: function () { dd.undo(); } },
      { key: 'redo', label: t('wb_redo'), icon: IC.redo, dis: !(st && st.canRedo), act: function () { dd.redo(); } },
      { key: 'clear', label: t('wb_clear'), icon: IC.clear, dis: !(st && !st.empty), act: function () { askClear(); }, close: true },
      { key: 'tools', label: chromeOn ? t('wb_tools_hide') : t('wb_tools'), icon: IC.tools, on: chromeOn, lock: lockedPro, act: function () { if (lockedPro) return locked('tools'); toggleChrome(!chromeOn); }, close: true },
      { key: 'surface', label: t('wb_surface'), icon: IC.surface, lock: lockedPro, panel: true, act: function (b) { if (lockedPro) return locked('surface'); surfacePanel(b); } },
      { key: 'inkbg', label: t('wb_inkbg'), icon: IC.inkbg, on: !!(st && st.transparent), lock: lockedPro, act: function () { if (lockedPro) return locked('surface'); var v = !(st && st.transparent); host.set('wbClear', v); dd.setTransparent(v); } },
      { key: 'pages', label: st && st.pages > 1 ? t('wb_pages') + ' (' + (st.page + 1) + '/' + st.pages + ')' : t('wb_pages'), icon: IC.pages, lock: lockedPro, panel: true, act: function (b) { if (lockedPro) return locked('pages'); pagesPanel(b); } }
    ];
  }
  // Clear asks first; in TinyTeachersDeck an adult says yes (host.adultGate: the PIN or a sum), so a child can't wipe it
  function askClear() {
    if (host.adultGate) { Promise.resolve(host.adultGate()).then(function (ok) { if (ok && dd) dd.clear(); }, function () { }); return; }
    if (confirm(t('wb_clear_q'))) dd.clear();
  }
  function toggleChrome(on) { chromeOn = !!on; dd.chrome(chromeOn); if (chromeOn && st && st.tool === 'off') dd.setTool('pen'); }

  /* ---------- the corner rings (the dock rings' look: .dk-veil / .dk-rings / .dk-hub / .dk-cat / .dk-wid) ---------- */
  function closeRings() {
    clearTimeout(idleT);
    if (rings) { rings.remove(); rings = null; document.removeEventListener('keydown', ringKeys, true); }
  }
  function ringKeys(e) { if (e.key !== 'Escape') return; e.stopPropagation(); var p = rings && rings.querySelector('.dk-ring-panel'); if (p) { p.remove(); return; } closeRings(); if (launcher) launcher.focus(); }
  function idle() { clearTimeout(idleT); idleT = setTimeout(closeRings, 10000); }
  function place(node, r, a) { var rad = a * Math.PI / 180; node.style.left = (r * Math.sin(rad)) + 'px'; node.style.top = (-r * Math.cos(rad)) + 'px'; }
  function openRings(cx, cy) {
    closeRings(); if (!dd || !st) return;
    var W = window.innerWidth, H = window.innerHeight, R1 = 70, R2 = 146, pad = R2 + 34;
    cx = Math.max(pad, Math.min(W - pad, cx)); cy = Math.max(pad, Math.min(H - pad, cy));
    var veil = el('div', 'dk-veil wb-veil'), rg = el('div', 'dk-rings wb-rings');
    rg.style.left = cx + 'px'; rg.style.top = cy + 'px'; rg.setAttribute('role', 'menu'); rg.setAttribute('aria-label', t('wb_menu'));
    veil.appendChild(rg);
    veil.addEventListener('click', closeRings);
    veil.addEventListener('contextmenu', function (e) { e.preventDefault(); closeRings(); });
    veil.addEventListener('pointermove', idle);
    rg.addEventListener('click', function (e) { e.stopPropagation(); });
    var hub = el('button', 'dk-hub', '<span class="dk-ic">' + IC.pen + '</span><span class="dk-hub-name"></span>');
    hub.type = 'button'; hub.setAttribute('aria-label', t('wb_close'));
    hub.addEventListener('click', function (e) { e.stopPropagation(); closeRings(); });
    var hubName = hub.querySelector('.dk-hub-name');
    function say(s) { hubName.textContent = s; }
    rg.appendChild(hub);
    function button(cls, it) {
      var b = el('button', cls + (it.on ? ' on' : '') + (it.lock ? ' wb-lock' : '') + (it.dis ? ' wb-dis' : ''), '<span class="dk-ic">' + it.icon + '</span>' + (it.lock ? '<span class="wb-lock-ic">' + IC.lock + '</span>' : ''));
      b.type = 'button'; b.dataset.wb = it.key; b.setAttribute('aria-label', it.label); b.setAttribute('role', 'menuitem');
      if (it.on) b.setAttribute('aria-pressed', 'true');
      if (it.dis) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('mouseenter', function () { say(it.label); });
      b.addEventListener('focus', function () { say(it.label); });
      b.addEventListener('click', function (e) { e.stopPropagation(); if (it.dis) return; it.act(b); if (it.close) closeRings(); else repaint(); idle(); });
      return b;
    }
    function repaint() {
      if (!rings) return;
      Array.prototype.forEach.call(rg.querySelectorAll('.dk-cat,.dk-wid'), function (b) { b.remove(); });
      var inn = innerItems(), out = outerItems();
      inn.forEach(function (it, i) { var b = button('dk-cat', it); place(b, R1, i * 360 / inn.length); rg.appendChild(b); });
      out.forEach(function (it, i) { var b = button('dk-wid', it); place(b, R2, i * 360 / out.length + 180 / out.length); rg.appendChild(b); });
    }
    document.body.appendChild(veil); rings = veil; rings._repaint = repaint;
    repaint(); say(t('wb_menu'));
    var first = rg.querySelector('.dk-cat.on') || rg.querySelector('.dk-cat'); if (first) first.focus({ preventScroll: true });
    document.addEventListener('keydown', ringKeys, true);
    idle();
  }
  function surfacePanel(anchor) {
    if (!rings) return;
    var old = rings.querySelector('.dk-ring-panel'); if (old) old.remove();
    var p = el('div', 'dk-ring-panel'); p.addEventListener('click', function (e) { e.stopPropagation(); });
    var r = anchor.getBoundingClientRect(), x = r.right + 14, W = window.innerWidth, H = window.innerHeight;
    if (x + 260 > W - 8) x = r.left - 274;
    p.style.left = Math.max(8, x) + 'px'; p.style.top = Math.max(8, Math.min(H - 380, r.top - 140)) + 'px';
    p.appendChild(el('p', 'dk-sb-ph', esc(t('wb_surface'))));
    var list = el('div', 'dk-sb-list'); p.appendChild(list);
    SURFACES.forEach(function (k) {
      var on = st && st.bg === k && !st.transparent;
      var b = el('button', 'dk-sb-item dk-pw' + (on ? ' on' : ''), '<span class="dk-ic wb-sf wb-sf-' + k + '"></span><span class="dk-lb">' + esc(t('dd_bg_' + k)) + '</span>');
      b.type = 'button';
      b.addEventListener('click', function (e) { e.stopPropagation(); if (st && st.transparent) { host.set('wbClear', false); dd.setTransparent(false); } dd.setBg(k); closeRings(); });
      list.appendChild(b);
    });
    rings.appendChild(p);
  }
  function pagesPanel(anchor) {
    if (!rings || !st) return;
    var old = rings.querySelector('.dk-ring-panel'); if (old) old.remove();
    var p = el('div', 'dk-ring-panel'); p.addEventListener('click', function (e) { e.stopPropagation(); });
    var r = anchor.getBoundingClientRect(), x = r.right + 14, W = window.innerWidth, H = window.innerHeight;
    if (x + 260 > W - 8) x = r.left - 274;
    p.style.left = Math.max(8, x) + 'px'; p.style.top = Math.max(8, Math.min(H - 380, r.top - 140)) + 'px';
    p.appendChild(el('p', 'dk-sb-ph', esc(t('wb_pages'))));
    var list = el('div', 'dk-sb-list'); p.appendChild(list);
    for (var i = 0; i < st.pages; i++) (function (i) {
      var b = el('button', 'dk-sb-item dk-pw' + (i === st.page ? ' on' : ''), '<span class="dk-ic dk-code">' + (i + 1) + '</span><span class="dk-lb">' + esc(t('wb_page_n', { n: i + 1 })) + '</span>');
      b.type = 'button'; b.dataset.page = String(i);
      b.addEventListener('click', function (e) { e.stopPropagation(); dd.gotoPage(i); closeRings(); });
      list.appendChild(b);
    })(i);
    var add = el('button', 'dk-sb-item dk-pw wb-add-page', '<span class="dk-ic dk-code">＋</span><span class="dk-lb">' + esc(t('wb_add_page')) + '</span>');
    add.type = 'button'; add.addEventListener('click', function (e) { e.stopPropagation(); dd.addPage(); closeRings(); });
    list.appendChild(add);
    rings.appendChild(p);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- one corner button with the Circle dock style; the same segment in the Radial rings ---------- */
  if (root.DockStyle && root.DockStyle.addInner) {
    root.DockStyle.addInner({
      key: 'whiteboard',
      visible: function () { return isOn && !!dd && !!st; },
      label: function () { return t('wb_name'); },
      icon: IC.pen,
      buttons: function () {
        return innerItems().concat(outerItems().filter(function (it) { return !it.panel; })).map(function (it) {
          return { key: it.key, label: it.label, icon: it.icon, on: it.on, lock: it.lock, dis: it.dis, close: !!it.close, act: function () { it.act(); } };
        });
      }
    });
  }
  // a phone turning sideways can switch the bento grid on or off: follow it
  var rz = 0;
  root.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (host && isOn && bento()) disable(); else if (host && host.wanted && host.wanted() && !isOn) sync(true); }, 250); });

  /* "Open in DrawDeck": the wall lets go of its board while the full DrawDeck has it, and reads it again afterwards. */
  function suspend() { if (!isOn) return; suspended = true; disable(); }
  function resume() { if (!suspended) return; suspended = false; if (host && host.wanted && host.wanted()) sync(true); }
  root.TDWhiteboard = { strings: S, setup: setup, sync: sync, refreshTier: refreshTier, suspend: suspend, resume: resume, isSuspended: function () { return suspended; }, isOn: function () { return isOn; }, _dd: function () { return dd; }, open: function () { if (launcher) launcher.click(); } };
})(typeof window !== 'undefined' ? window : globalThis);
