/* Google sign-in inside the installed Chrome extension (shared, identical in every app that signs in with Google).

   Firebase's signInWithPopup / signInWithRedirect don't work on an extension page (Manifest V3): the pop-up fails with
   auth/internal-error. Instead Chrome's own sign-in window is used: chrome.identity.launchWebAuthFlow asks Google for an
   ID token for the project's OAuth web client, and Firebase signs in with that token (signInWithCredential).
   Web pages and the web apps keep using the pop-up / redirect; this file is only used on chrome-extension:// pages.

   One-time setup, in the Google Cloud console of the Firebase project (js/firebase-config.js) → Google Auth Platform → Clients →
   "Web client (auto created by Google Service)" (the client Firebase's Google sign-in uses):
     1. Add each installed app's redirect URI under "Authorized redirect URIs" (the IDs are pinned by the "key" in
        each manifest, so they are the same on every computer):
          TeachersDeck              https://dliphbbeinjlpcnpenllgaddihpkamcl.chromiumapp.org/
          ParentDeck                https://konabbakfllochlfepachaijclndabam.chromiumapp.org/
          LectureDeck (UniDeck)     https://lglogedbdfjcncfhmkbgkehljfnokbjd.chromiumapp.org/
          UniStudentDeck (UniDeck)  https://fogkpfopojnpdnckighkdbmbgfhedjhh.chromiumapp.org/
          ParentDeck (UniDeck)      https://kejenngageildampgdpkgchikecjpgpp.chromiumapp.org/
        StudentDeck signs in with a class code, not Google, so it needs none.
     2. Its ID (…apps.googleusercontent.com) goes in googleClientId in js/firebase-config.js (window.GOOGLE_SIGNIN).
   Until it is set, signing in from the installed app says so instead of failing silently. */
(function () {
  'use strict';
  const CLIENT_ID = (window.GOOGLE_SIGNIN && window.GOOGLE_SIGNIN.googleClientId) || '';

  const isExtension = () => /^chrome-extension:/.test(location.protocol) && typeof chrome !== 'undefined' && !!chrome.permissions;

  /** "identity" is an optional permission, asked for the first time someone signs in (must run inside the click). */
  function askIdentity() {
    return new Promise((resolve) => {
      try { chrome.permissions.request({ permissions: ['identity'] }, (ok) => resolve(!!ok)); } catch (e) { resolve(false); }
    });
  }

  /** Signs `auth` (a firebase.auth.Auth) in with Google through Chrome's sign-in window; resolves to a UserCredential. */
  async function signIn(auth) {
    if (!CLIENT_ID) {
      const e = new Error('Google sign-in in the installed app isn’t switched on yet. Please contact TeachersDeck support (jerry@myteachersdeck.com).');
      e.code = 'ext-signin/not-configured';
      throw e;
    }
    if (!(await askIdentity())) {
      const e = new Error('Chrome needs your permission to show the Google sign-in window. Please try again and choose Allow.');
      e.code = 'ext-signin/permission-denied';
      throw e;
    }
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: CLIENT_ID, response_type: 'id_token', redirect_uri: chrome.identity.getRedirectURL(),
      scope: 'openid email profile', nonce, prompt: 'select_account',
    });
    let back;
    try { back = await chrome.identity.launchWebAuthFlow({ url, interactive: true }); }
    catch (err) {
      const e = new Error('Google sign-in was closed or didn’t finish. Please try again.');
      e.code = 'ext-signin/cancelled';
      throw e;
    }
    const idToken = new URLSearchParams(new URL(back).hash.slice(1)).get('id_token');
    if (!idToken) { const e = new Error('Google didn’t return a sign-in. Please try again.'); e.code = 'ext-signin/no-token'; throw e; }
    return auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(idToken));
  }

  window.ExtSignIn = { isExtension, signIn, configured: () => !!CLIENT_ID };
})();
