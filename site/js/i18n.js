/* =========================================================
   One way to translate, in every suite app (cleanup Phase 4). The same file in TeachersDeck, StudentDeck, ParentDeck
   and AdminDeck, kept identical by tools/check_shared.py (edit TeachersDeck's, copy to the others).

   An app keeps its words in a STRINGS table, one entry per key: { en:'Settings', vi:'Cài đặt', es:…, … }, and
   asks for them by key:
     DeckI18n.t(STRINGS, lang, 'roster_count', { n: 12 })   'Students: {n}' -> 'Students: 12'; a language the entry
                                                            lacks falls back to English, a missing key to the key
     DeckI18n.localize(root, t, extra)                      static text in the page: data-i18n (text),
                                                            data-i18n-placeholder, data-i18n-aria, data-i18n-title,
                                                            data-i18n-dyn / data-i18n-aria-dyn (key in data-key);
                                                            extra(root) handles an app's own attributes
   Each app wraps these in its own t(key, vars) and localizeNode(root), with the language it keeps (state.lang,
   ui.lang, <html lang>).
   ========================================================= */
(function (root) {
  'use strict';
  function t(strings, lang, key, vars) {
    var entry = strings[key];
    var s = (entry && (entry[lang] || entry.en)) || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function each(scope, sel, fn) { scope.querySelectorAll(sel).forEach(fn); }
  function localize(scope, tr, extra) {
    scope = scope || document;
    each(scope, '[data-i18n]', function (el) { el.textContent = tr(el.dataset.i18n); });
    each(scope, '[data-i18n-dyn]', function (el) { el.textContent = tr(el.dataset.key); });
    each(scope, '[data-i18n-placeholder]', function (el) { el.placeholder = tr(el.dataset.i18nPlaceholder); });
    each(scope, '[data-i18n-aria]', function (el) { el.setAttribute('aria-label', tr(el.dataset.i18nAria)); });
    each(scope, '[data-i18n-aria-dyn]', function (el) { el.setAttribute('aria-label', tr(el.dataset.key)); });
    each(scope, '[data-i18n-title]', function (el) { el.title = tr(el.dataset.i18nTitle); });
    if (extra) extra(scope);
  }
  root.DeckI18n = { t: t, localize: localize };
})(typeof window !== 'undefined' ? window : this);
