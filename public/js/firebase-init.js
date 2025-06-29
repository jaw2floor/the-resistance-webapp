/* /public/js/firebase-init.js   (all pages will share this) */
import { initializeApp }   from "https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js";
import { getAuth, signInAnonymously, setPersistence, browserSessionPersistence} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyDukHPM3vGqi_NyHLqmmktmDfRmZ_D-q6g",
  authDomain: "resistance-app-4aeb2.firebaseapp.com",
  projectId: "resistance-app-4aeb2",
  storageBucket: "resistance-app-4aeb2.firebasestorage.app",
  messagingSenderId: "1020048238927",
  appId: "1:1020048238927:web:641ad407c076552e467d3a",
  measurementId: "G-TZ8L30W26S"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

// One UID per tab ‒ good for local testing
await setPersistence(auth, browserSessionPersistence);
signInAnonymously(auth).catch(console.error);