/* Google OAuth client IDs for "show Word / PowerPoint / Excel files full screen"
   (a Pro feature). The file is converted to a Google Doc / Slides / Sheet in the
   teacher's own Google Drive and shown from there; see js/gdrive.js.

   Until the matching ID is filled in below, that feature is simply switched off:
   Office files keep opening in a new browser tab, and nothing else is affected.

   One-time setup, in the Google Cloud project behind Firebase (teachersdeck-b5720):
     1. APIs & Services -> Library -> enable "Google Drive API".
     2. OAuth consent screen: add the scope  .../auth/drive.file  (non-sensitive:
        the app only ever sees files it created itself), then set the publishing
        status to "In production". (In "Testing" only listed test users can sign in
        and authorisations expire after 7 days.)
     3. Credentials -> Create credentials -> OAuth client ID, type "Web application":
        - For the Chrome extension: add this Authorized redirect URI, then paste the
          client ID into extensionClientId:
              https://dliphbbeinjlpcnpenllgaddihpkamcl.chromiumapp.org/
          (that is the extension's pinned ID; it does not change between releases).
        - For the standalone web page: add the page's address (for example
          https://your-site.example) under Authorized JavaScript origins, then paste
          the client ID into webClientId. This can be the same client as above.

   Client IDs are public identifiers, not secrets. Anything already set on
   window.GOOGLE_CONFIG before this file loads is kept. */
window.GOOGLE_CONFIG = Object.assign({
  extensionClientId: '',
  webClientId: ''
}, window.GOOGLE_CONFIG || {});
