/* /public/js/game.js – v2 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { doc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const roomRef = doc(db, "rooms", new URLSearchParams(location.search).get("room"));
const roleDiv = document.querySelector("#role");
const contBtn = document.querySelector("#continue");

let myUid = null;
let roomData = null;

/* ----- helper renders only when both pieces are ready ----- */
function maybeShowRole() {
  if (!myUid || !roomData || !roomData.roles) return;
  const myRole = roomData.roles[myUid];
  if (!myRole) return;                       // roles not written yet

  roleDiv.textContent = `You are a ${myRole.toUpperCase()} ${
    myRole === "spy" ? "🤫" : "💙"
  }`;
  roleDiv.className = myRole === "spy" ? "spy" : "resistance";
  contBtn.hidden = false;
}

/* ----- listeners ----- */
onAuthStateChanged(auth, user => {
  myUid = user?.uid ?? null;
  maybeShowRole();
});

onSnapshot(roomRef, snap => {
  if (!snap.exists()) { roleDiv.textContent = "Room deleted"; return; }
  roomData = snap.data();
  maybeShowRole();
});

/* ----- next-phase placeholder ----- */
contBtn.onclick = () => alert("Team-building phase coming soon!");

/* later contBtn will move to the board; for now just a placeholder */
contBtn.onclick = () => alert("Next phase coming soon!");
