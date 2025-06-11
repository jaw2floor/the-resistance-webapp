/* /public/js/lobby.js  – Phase 2 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  doc, onSnapshot, updateDoc, deleteField, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

/* --- leave-confirm prompt --- */
window.addEventListener("beforeunload", e => { e.preventDefault(); e.returnValue = ""; });

/* --- params & refs --- */
const roomId = new URLSearchParams(location.search).get("room");
if (!roomId) location.href = "/join.html";
const roomRef = doc(db, "rooms", roomId);

let myUid = null;
onAuthStateChanged(auth, u => myUid = u?.uid ?? null);

/* --- live lobby --- */
const title = document.querySelector("#title");
const root  = document.querySelector("#root");

onSnapshot(roomRef, snap => {
  if (!snap.exists()) { root.textContent = "Room deleted"; return; }
  const d = snap.data();

  /* phase switch */
  if (d.phase === "roleReveal") {
    location.href = `/game.html?room=${roomId}`;
    return;
  }

  title.textContent = `Lobby: ${d.name}`;
  root.innerHTML = "<h3>Players:</h3>";
  const ul = document.createElement("ul");
  Object.values(d.players).forEach(nick => {
    const li = document.createElement("li"); li.textContent = nick; ul.appendChild(li);
  });
  root.appendChild(ul);

  if (myUid === d.createdBy) {
    let btn = document.querySelector("#startBtn");
    if (!btn) { btn = document.createElement("button"); btn.id = "startBtn"; root.appendChild(btn); }
    btn.disabled = Object.keys(d.players).length < 5;
    btn.textContent = btn.disabled ? "Need at least 5 players" : "Start game";
    btn.onclick = () => startGame(d.players);
  }
});

/* --- start game: assign roles & advance phase --- */
async function startGame(players) {
  // 1. A clearer way to define spy counts
  const spiesByPlayerCount = {
    5: 2,
    6: 2, // Corrected from your original (was effectively 3)
    7: 3,
    8: 3,
    9: 3,
    10: 4,
  };

  const uids = Object.keys(players);
  const n = uids.length;
  const spiesNeeded = spiesByPlayerCount[n];

  // 2. Add a safeguard for invalid player counts
  if (spiesNeeded === undefined) {
    alert(`Error: Cannot start a game with ${n} players.`);
    console.error(`Invalid number of players: ${n}`);
    return;
  }

  // 3. Shuffle UIDs and assign roles
  uids.sort(() => Math.random() - 0.5);
  const roles = {};
  uids.forEach((uid, i) => {
    roles[uid] = i < spiesNeeded ? "spy" : "resistance";
  });

  // 4. Commit to Firestore with proper error handling
  try {
    await updateDoc(roomRef, {
      roles,
      phase: "roleReveal",
      lastActivity: serverTimestamp(),
      mission: 1,
      voteRound: 1,
      leaderUid: uids[0],
      proposedTeam: [],
      votes: {},
    });
    // The onSnapshot listener will handle the redirect automatically
  } catch (error) {
    // This will catch any errors (e.g., from security rules)
    // and show them to the user instead of hanging.
    console.error("Failed to start game:", error);
    alert("Failed to start the game. Please check the developer console for errors.");
  }
}

/* --- auto-remove on close --- */
function leave() {
  if (!myUid) return;
  updateDoc(roomRef, {
    [`players.${myUid}`]: deleteField(),
    lastActivity: serverTimestamp()
  }).catch(()=>{});
}
addEventListener("pagehide", leave);