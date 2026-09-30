// ============================================================
// firebase.js — connects the site to Firebase and handles sign-in.
// Every page loads this file. It:
//   1. connects to your Firebase project (using firebase-config.js)
//   2. shows a "Sign in with Google" button in the menu
//   3. after you sign in, checks that the database lets you in
//
// This file is a "module" (loaded with type="module" in the HTML).
// Modules can use "import", which works like Python's import.
// ============================================================

// ---------- 1. IMPORT FIREBASE ----------
// These lines download the Firebase tools straight from Google (version 12.19.0).
// Python equivalent:  from firebase_auth import get_auth, sign_out, ...
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Our own settings file (the ./ means "in this same folder")
import { firebaseConfig } from "./firebase-config.js";


// ---------- 2. CONNECT ----------
const authArea = document.getElementById("auth-area");

// Has the config been filled in yet? (the placeholders say "PASTE-HERE")
const isSetUp = firebaseConfig.apiKey !== "PASTE-HERE";

// "export" lets other files use these later, e.g. the deck builder in step 6:
//   import { auth, db } from "./firebase.js";
export const app  = isSetUp ? initializeApp(firebaseConfig) : null;
export const auth = isSetUp ? getAuth(app) : null;
export const db   = isSetUp ? getFirestore(app) : null;


// ---------- 3. THE SIGN-IN AREA IN THE MENU ----------

function showSignedOut() {
  authArea.innerHTML = `<button class="auth-btn" id="sign-in-btn">Sign in with Google</button>`;
  document.getElementById("sign-in-btn").addEventListener("click", signIn);
}

function showSignedIn(user) {
  // user.displayName is the name on your Google account. We only show the first name.
  const firstName = (user.displayName || user.email).split(" ")[0];
  authArea.innerHTML = `
    <span class="auth-status" id="db-status" title="Checking the database...">●</span>
    <span class="auth-name">${firstName}</span>
    <button class="auth-btn" id="sign-out-btn">Sign out</button>
  `;
  document.getElementById("sign-out-btn").addEventListener("click", function () {
    signOut(auth);
  });
  checkDatabase(user);
}

// Opens the Google sign-in pop-up window
async function signIn() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    // No need to do anything else here: onAuthStateChanged (below) notices the sign-in.
  } catch (error) {
    // Closing the pop-up yourself isn't a real error, so ignore it
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") {
      return;
    }
    if (error.code === "auth/unauthorized-domain") {
      alert(`Firebase doesn't allow sign-in from "${location.hostname}" yet.\n\n` +
            `Add it in Firebase: Authentication > Settings > Authorized domains.`);
      return;
    }
    alert("Sign-in failed: " + error.message);
    console.error(error);
  }
}


// ---------- 4. DATABASE CHECK ----------
// Writes one tiny test record. If the security rules let us, the dot turns green.
// If not, it turns red, and hovering over it explains why.
async function checkDatabase(user) {
  const status = document.getElementById("db-status");
  try {
    await setDoc(doc(db, "settings", "connection-test"), {
      lastSignIn: serverTimestamp(),
      email: user.email
    });
    status.classList.add("ok");
    status.title = "Database connected";
  } catch (error) {
    status.classList.add("error");
    status.title = error.code === "permission-denied"
      ? "Database blocked this account. Check the email in your Firestore rules."
      : "Database error: " + error.message;
    console.error(error);
  }
}


// ---------- 5. START ----------
if (!isSetUp) {
  authArea.innerHTML = `<span class="auth-warning">Firebase not set up yet</span>`;
} else {
  // Firebase remembers you between visits. This runs once when the page opens
  // (with the saved user, or null), and again every time you sign in or out.
  onAuthStateChanged(auth, function (user) {
    if (user) {
      showSignedIn(user);
    } else {
      showSignedOut();
    }
  });
}
