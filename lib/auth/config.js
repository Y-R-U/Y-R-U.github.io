// Firebase project config for the br8t games hub.
//
// This is NOT a secret. The apiKey is a public project identifier that ships to
// every browser that loads the page; the real security boundary is the Firestore
// rules (see /firestore.rules) plus the authorized-domains allowlist in the
// Firebase console. Committing it is the correct call for a no-build-step site.
export const firebaseConfig = {
  apiKey:            "AIzaSyAd7-vQb0NHuDoZG-kOzuXuo-WuWo7oFQA",
  authDomain:        "br8t-games.firebaseapp.com",
  projectId:         "br8t-games",
  storageBucket:     "br8t-games.firebasestorage.app",
  messagingSenderId: "961928979313",
  appId:             "1:961928979313:web:0458ec8d94de4b4edd8cd0",
};

// Pinned SDK version — bump deliberately, never float.
export const SDK = "https://www.gstatic.com/firebasejs/12.9.0";
