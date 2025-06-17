/* /public/js/lobby.js – REVISED */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

/* --- leave-confirm prompt --- */
window.addEventListener("beforeunload", e => { e.preventDefault(); e.returnValue = ""; });

/* --- params & refs --- */
const roomId = new URLSearchParams(location.search).get("room");
if (!roomId) location.href = "/join.html";
const roomRef = doc(db, "rooms", roomId);

let myUid = null;
let unsubscribeFromRoom = null; // To hold the listener so we can detach it

/* --- elements --- */
const title = document.querySelector("#title");
const playerList = document.querySelector("#player-list");
const startContainer = document.querySelector("#start-game-container");
const root = document.querySelector("#root");


/* --- main auth listener --- */
onAuthStateChanged(auth, user => {
  if (user) {
    // User is signed in
    myUid = user.uid;

    // Detach any existing listener before creating a new one
    if (unsubscribeFromRoom) {
      unsubscribeFromRoom();
    }

    // Attach the live listener for the room
    unsubscribeFromRoom = onSnapshot(roomRef, snap => {
      if (!snap.exists()) {
        root.innerHTML = "<h2>This room has been deleted.</h2><a href='/join.html'>Find another room</a>";
        return;
      }
      const roomData = snap.data();

      // Check if the game has started and redirect if needed
      if (roomData.phase === "roleReveal") {
        location.href = `/game.html?room=${roomId}`;
        return;
      }

      // Update the UI with the latest data
      renderLobby(roomData);
    });
  } else {
    // User is signed out
    myUid = null;
    if (unsubscribeFromRoom) {
      unsubscribeFromRoom();
    }
    root.innerHTML = "<h2>You must be signed in to join a room.</h2>";
  }
});


function renderLobby(data) {
  // Update lobby title
  title.textContent = `Lobby: ${data.name}`;

  // Update player list
  playerList.innerHTML = ""; // Clear only the list
  Object.values(data.players).forEach(nick => {
    const li = document.createElement("li");
    li.textContent = nick;
    playerList.appendChild(li);
  });

  // Manage the "Start Game" button for the room creator
  startContainer.innerHTML = ""; // Clear just the button container
  if (myUid === data.createdBy) {
    const btn = document.createElement("button");
    btn.id = "startBtn";
    const playerCount = Object.keys(data.players).length;
    btn.disabled = playerCount < 5;
    btn.textContent = btn.disabled ? `Need at least 5 players (${playerCount}/5)` : "Start Game";
    btn.onclick = () => startGame(data.players);
    startContainer.appendChild(btn);
  }
}

/* --- start game function (remains the same) --- */
async function startGame(players) {
  // ... your existing startGame function logic is fine
  const spiesByPlayerCount = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
  const uids = Object.keys(players);
  const n = uids.length;
  const spiesNeeded = spiesByPlayerCount[n];

  if (spiesNeeded === undefined) {
    alert(`Error: Cannot start a game with ${n} players.`);
    return;
  }

  uids.sort(() => Math.random() - 0.5);
  const roles = {};
  uids.forEach((uid, i) => {
    roles[uid] = i < spiesNeeded ? "spy" : "resistance";
  });

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
  } catch (error) {
    console.error("Failed to start game:", error);
    alert("Failed to start the game. Please check the developer console for errors.");
  }
}


/* --- auto-remove on close --- */
function leave() {
  if (!myUid) return;
  // This update is sent without waiting, as the page is closing.
  updateDoc(roomRef, {
    [`players.${myUid}`]: deleteField(),
    lastActivity: serverTimestamp()
  }).catch(() => {});
}
addEventListener("pagehide", leave);