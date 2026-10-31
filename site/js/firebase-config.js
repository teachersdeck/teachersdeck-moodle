/* Firebase project config — the SAME project/config goes in all three apps
   (TeachersDeck, StudentDeck, ParentDeck), since they share one Firestore
   database. Get these values from the Firebase console:
   Project settings (gear icon) → General → "Your apps" → SDK setup and
   configuration → Config.

   Project: teachersdeck-b5720 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBXDfzmCnZezAYT_LKDYX44AGKNKNYzjvs",
  authDomain: "teachersdeck-b5720.firebaseapp.com",
  projectId: "teachersdeck-b5720",
  storageBucket: "teachersdeck-b5720.firebasestorage.app",
  messagingSenderId: "705537559894",
  appId: "1:705537559894:web:bda1c214233e8c2a041af7"
};

/* Google sign-in inside the installed Chrome extension (js/ext-signin.js): the ID of the project's OAuth web client
   ("Web client (auto created by Google Service)"), a public identifier. Its redirect URIs are listed in js/ext-signin.js. */
window.GOOGLE_SIGNIN = {
  googleClientId: "705537559894-ghnn9fc328k17iii6eibrk5e6vk6fm17.apps.googleusercontent.com"
};
