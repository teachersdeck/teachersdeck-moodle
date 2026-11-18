'use strict';
/* =========================================================
   Moving and resizing windows, for every TeachersDeck Suite app (cleanup Phase 2, Nov 2026).
   ---------------------------------------------------------
   ONE FILE IN FOUR APPS: teachersdeck/js/winmove.js is the copy to edit; tools/check_shared.py keeps the StudentDeck,
   ParentDeck and AdminDeck copies identical. Load it before js/app.js:
     <script src="js/winmove.js"></script>

   It replaces the four apps' own drag code (TeachersDeck's and AdminDeck's start/move/endGesture, StudentDeck's and
   ParentDeck's gesture()), which did the same job with small differences; those differences are the options below,
   so each app behaves exactly as before.

   WinMove.attach({
     el,                  the window (.widget)
     handle,              what is dragged: the title bar to move, the corner to resize
     kind,                'move' or 'size'
     skip(e),             optional: true leaves this press alone (a button in the title bar, a full-screen window)
     bounds(x, y),        'move': where the window may go, returns { x, y } (WinMove.wallBounds(wall) is the usual one)
     minW, minH,          'size': the smallest it may be made
     start(kind),         optional: when the press starts (bring to front, shield a document frame, a "dragging" class)
     end(kind)            optional: when it ends (save the layout)
   })

   One press at a time, followed on the whole window (pointer capture on the handle is a nicety, not a requirement),
   so a lost capture, a pointer that leaves the browser or the window losing focus can never leave a drag stuck.
   ========================================================= */
(function (root) {
  var active = null;   // the press in progress: { id, o, sx, sy, ox, oy, ow, oh }

  function finish(e) {
    if (!active) return;
    if (e && e.pointerId !== undefined && e.pointerId !== active.id) return;
    var a = active; active = null;
    if (a.o.end) a.o.end(a.o.kind);
  }

  function move(e) {
    if (!active || e.pointerId !== active.id) return;
    var a = active, o = a.o, dx = e.clientX - a.sx, dy = e.clientY - a.sy;
    if (o.kind === 'move') {
      var p = o.bounds(a.ox + dx, a.oy + dy);
      o.el.style.left = p.x + 'px';
      o.el.style.top = p.y + 'px';
    } else {
      o.el.style.width = Math.max(o.minW, a.ow + dx) + 'px';
      o.el.style.height = Math.max(o.minH, a.oh + dy) + 'px';
    }
  }

  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('blur', function () { finish(); });

  function attach(o) {
    o.handle.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;            // the main button, a finger or a pen only
      if (o.skip && o.skip(e)) return;
      if (active && active.id !== e.pointerId) finish();         // a stuck earlier press would leave stale state
      var el = o.el;
      active = { id: e.pointerId, o: o, sx: e.clientX, sy: e.clientY, ox: el.offsetLeft, oy: el.offsetTop, ow: el.offsetWidth, oh: el.offsetHeight };
      try { o.handle.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
      e.preventDefault();
      if (o.kind === 'size') e.stopPropagation();                 // the corner sits inside the window: don't start a move too
      if (o.start) o.start(o.kind);
    });
  }

  /* The usual bounds: never past the wall's top or left edge, and always enough of the title bar on screen (about 150px
     across, 44px down) to grab it and drag it back. */
  function wallBounds(wall) {
    return function (x, y) {
      return { x: Math.min(Math.max(0, wall.clientWidth - 150), Math.max(0, x)),
               y: Math.min(Math.max(0, wall.clientHeight - 44), Math.max(0, y)) };
    };
  }

  root.WinMove = { attach: attach, wallBounds: wallBounds, busy: function () { return !!active; } };
})(window);
