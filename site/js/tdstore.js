/* TD_STORE — TeachersDeck's store in the LMS editions (owner, 13 Nov 2026; Item Store step S2).
 *
 * On where the platform asks for it (TD_PLATFORM.store: ClassIn, Canvas). TeachersDeck has no accounts, so what a
 * teacher buys sits on a STORE KEY (SK-7QK4-M9XA-2BRT) that the server makes when the first order is paid; it is shown
 * in the Shop and emailed with the receipt, and entering it on another computer brings the items there.
 * Payment is the same VietQR path as Pro (createOrder product 'items', app 'teachersdeck'; the owner presses Mark paid).
 *
 * Loaded BEFORE js/app.js: the packs bought earlier (kept on this computer) are added to window.TD_PREMIUM_PACKS so
 * the app finds them like the built-in ones (app.js checks each with StoreCore.validateStorePack). New ones arrive
 * with refresh() and app.js applies them without a reload (onArrive).
 *
 *   TD_STORE.enabled            the platform sells items here
 *   TD_STORE.setCaller(fn)      app.js passes callLicenseFn(name, body) (the same HTTPS functions as Pro)
 *   TD_STORE.key() / owned()    the store key, the skus it owns
 *   TD_STORE.catalog()          getTeacherStore: prices, previews, owned
 *   TD_STORE.useKey(key)        "I have a store key"
 *   TD_STORE.order(sku, email, deviceId) / pendingOrder() / checkOrder()
 *   TD_STORE.refresh()          fetch the key's packs (new ones, and drop refunded ones)
 *   TD_STORE.onArrive(fn)       fn(newPacks) after refresh() brought something
 */
(function (root) {
  'use strict';
  var PF = root.TD_PLATFORM || null;
  var LS = 'td_store_v1';
  var q = {};
  try { q = new URLSearchParams(root.location.search); } catch (e) { q = { get: function () { return null; } }; }
  // On where the platform asks for it, or the edition does (14 Nov 2026, owner: LectureDeck and TinyTeachersDeck sell
  // premium themes, faces and docks here: DECK_EDITION.store); ?store=1 tries the Shop anywhere else (testing only).
  var ED = root.DECK_EDITION || {};
  var enabled = !!(PF && PF.store) || !!ED.store || q.get('store') === '1';
  function read() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function write(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) { /* storage off: the items stay for this visit */ } }
  var data = read();
  data.packs = data.packs && typeof data.packs === 'object' ? data.packs : {};

  // The packs bought earlier go in with the built-in ones before app.js starts.
  if (enabled) {
    var list = root.TD_PREMIUM_PACKS = root.TD_PREMIUM_PACKS || [];
    Object.keys(data.packs).forEach(function (id) { if (!list.some(function (p) { return p && p.id === id; })) list.push(data.packs[id]); });
  }

  var caller = null, arrive = [];
  function call(name, body) { if (!caller) return Promise.reject(new Error('not-configured')); return caller(name, body); }

  function key() { return data.key || null; }
  function owned() { return (data.skus || []).slice(); }
  function catalog() { return call('getTeacherStore', { storeKey: data.key || undefined }); }

  function addPacks(packs) {
    var list = root.TD_PREMIUM_PACKS = root.TD_PREMIUM_PACKS || [];
    packs.forEach(function (p) {
      data.packs[p.id] = p;
      var i = list.findIndex(function (x) { return x && x.id === p.id; });
      if (i >= 0) list[i] = p; else list.push(p);
    });
  }
  function refresh() {
    if (!data.key) return Promise.resolve([]);
    var have = {};
    Object.keys(data.packs).forEach(function (id) { have[id] = data.packs[id].version; });
    return call('getTeacherPacks', { storeKey: data.key, have: have }).then(function (r) {
      var fresh = (r.packs || []).filter(function (p) { return !data.packs[p.id] || data.packs[p.id].version !== p.version; });
      var current = r.current || [];
      Object.keys(data.packs).forEach(function (id) { if (current.indexOf(id) < 0) delete data.packs[id]; });   // refunded: gone next start
      addPacks(r.packs || []);
      data.skus = r.skus || [];
      write(data);
      if (fresh.length) arrive.forEach(function (fn) { try { fn(fresh); } catch (e) { /* one listener failing never stops another */ } });
      return fresh;
    });
  }
  function useKey(k) {
    var clean = String(k || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!/^SK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(clean)) return Promise.reject(Object.assign(new Error('bad-key'), { code: 'bad-key' }));
    var before = data.key;
    data.key = clean;
    return refresh().then(function (fresh) { return fresh; }, function (e) { data.key = before; write(data); throw e; });
  }

  function pendingOrder() { return data.order || null; }
  function order(sku, email, deviceId, name) {
    var body = { product: 'items', app: 'teachersdeck', skus: [sku], email: email, deviceId: deviceId, name: name || '' };
    if (data.key) body.storeKey = data.key;
    return call('createOrder', body).then(function (o) {
      data.order = { id: o.id, secret: o.secret, token: o.token, amount: o.amount, qrUrl: o.qrUrl, bank: o.bank, lines: o.lines, sku: sku, at: Date.now() };
      write(data);
      return data.order;
    });
  }
  /** Checks the order waiting for payment; when it is paid the key is kept and the packs come down. */
  function checkOrder() {
    var o = data.order; if (!o) return Promise.resolve(null);
    return call('getOrder', { id: o.id, secret: o.secret }).then(function (r) {
      if (r.status === 'paid' && r.storeKey) {
        data.key = r.storeKey; data.order = null; write(data);
        return refresh().then(function () { return { status: 'paid', sku: o.sku, storeKey: r.storeKey }; });
      }
      if (r.status === 'cancelled' || r.expired) { data.order = null; write(data); }
      return r;
    }, function (e) { if (e && e.status === 404) { data.order = null; write(data); } throw e; });
  }
  function cancelLocal() { data.order = null; write(data); }

  root.TD_STORE = {
    enabled: enabled,
    setCaller: function (fn) { caller = fn; },
    key: key, owned: owned, catalog: catalog, refresh: refresh, useKey: useKey,
    order: order, pendingOrder: pendingOrder, checkOrder: checkOrder, cancelLocal: cancelLocal,
    onArrive: function (fn) { arrive.push(fn); },
  };
})(typeof window !== 'undefined' ? window : this);
