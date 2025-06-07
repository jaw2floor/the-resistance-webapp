/* /public/js/game.js */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { doc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const roomRef = doc(db, "rooms", params.get("room"));

const roleDiv = document.querySelector("#role");
const contBtn = document.querySelector("#continue");

let myUid = null;
onAuthStateChanged(auth, u => { myUid = u?.uid ?? null; });

onSnapshot(roomRef, snap => {
  if (!snap.exists()) { roleDiv.textContent = "Room deleted"; return; }
  const { roles } = snap.data();
  if (!roles || !myUid || !roles[myUid]) return;           // still loading

  const myRole = roles[myUid];                            // 'spy' | 'resistance'
  roleDiv.textContent = `You are a ${myRole.toUpperCase()} ${
    myRole === "spy" ? "🤫" : "💙"
  }`;
  roleDiv.className = myRole === "spy" ? "spy" : "resistance";
  contBtn.hidden = false;
});

/* later contBtn will move to the board; for now just a placeholder */
contBtn.onclick = () => alert("Next phase coming soon!");
