import { db, auth } from "./firebase-init.js";
import {
  doc, onSnapshot, updateDoc, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";


// ---- warn if the user tries to close / reload ----
window.addEventListener("beforeunload", e => {
  e.preventDefault();            // required for Chrome ≤ 117
  e.returnValue = "";            // show default browser message
});


const params = new URLSearchParams(location.search);
const roomId = params.get("room");
if (!roomId) location.href = "/join.html";

const title = document.querySelector("#title");
const root  = document.querySelector("#root");

const roomRef = doc(db, "rooms", roomId);

onSnapshot(roomRef, snap => {
  if (!snap.exists()) {
    root.textContent = "Room no longer exists.";
    return;
  }
  const data = snap.data();
  title.textContent = `Lobby: ${data.name}`;

  // ------- player list -------
  root.innerHTML = "<h3>Players:</h3>";
  const ul = document.createElement("ul");
  for (const nick of Object.values(data.players)) {
    const li = document.createElement("li");
    li.textContent = nick;
    ul.appendChild(li);
  }
  root.appendChild(ul);

  // ------- start button for owner -------
  if (auth.currentUser.uid === data.createdBy) {
    let btn = document.querySelector("#startBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "startBtn";
      root.appendChild(btn);
    }
    btn.disabled = Object.keys(data.players).length < 5;
    btn.textContent = btn.disabled
      ? "Need at least 5 players"
      : "Start game";
    btn.onclick = startGame;
  }
});

/* ----- auto-cleanup if the tab is closed ----- */
function removeSelfFromRoom() {
  if (!auth.currentUser) return;               // just in case
  updateDoc(roomRef, {
    [`players.${auth.currentUser.uid}`]: deleteField(),
    lastActivity: serverTimestamp()
  }).catch(console.error);
}

async function startGame() {
  await updateDoc(roomRef, {
    started: true,
    lastActivity: serverTimestamp()
  });
  // (later we'll redirect to /game.html)
  alert("Game start stub – next step!");
}
