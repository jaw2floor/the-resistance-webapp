import { db, auth } from "./firebase-init.js";
import { showToast } from "./toast.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, deleteDoc, deleteField, serverTimestamp, Timestamp, runTransaction } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// --- Leave-confirm prompt ---
// This is a good "best effort" to prevent accidental leaving.
let confirmLeave = true;
window.addEventListener("beforeunload", e => {
    if (!confirmLeave) return;
    e.preventDefault();
    e.returnValue = "";
});

// --- Params & Refs ---
const roomId = new URLSearchParams(location.search).get("room");
if (!roomId) {
    // Redirect immediately if there's no room ID
    location.href = "/join.html";
}
const roomRef = doc(db, "rooms", roomId);

// --- Cached State ---
let me = null; // To store the current user's UID
let roomCreatorId = null; // To store the creator's UID
let unsubscribeFromRoom = null; // To hold the listener so we can detach it
let heartbeatTimer = null; // interval ID for activity pings

// --- Elements ---
const root = document.getElementById("root");
const titleEl = document.getElementById("title");
const playerListEl = document.getElementById("player-list");
const startContainerEl = document.getElementById("start-game-container");
const copyInviteBtn = document.getElementById("copy-invite-btn");

const handleVisibility = () => {
    if (document.visibilityState === "hidden") leaveLobby();
};

// --- Main Auth Listener ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        me = user.uid;
        
        // If we don't have a listener yet, create one.
        if (!unsubscribeFromRoom) {
            listenToRoomUpdates();
        }
        
        // Also handle the "best effort" cleanup when the user closes the tab.
        window.addEventListener("pagehide", leaveLobby);
        document.addEventListener("visibilitychange", handleVisibility);
        // Keep the room marked as active while the player is viewing the lobby
        heartbeatTimer = setInterval(() => {
            updateDoc(roomRef, {
                lastActivity: serverTimestamp(),
                expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000)
            }).catch(() => {});
        }, 60000);

    } else {
        // User is signed out.
        me = null;
        
        // Clean up the listener if it exists.
        if (unsubscribeFromRoom) {
            unsubscribeFromRoom();
            unsubscribeFromRoom = null;
        }
        window.removeEventListener("pagehide", leaveLobby);
        document.removeEventListener("visibilitychange", handleVisibility);
        clearInterval(heartbeatTimer);

        root.innerHTML = "<h2>You must be signed in to join a room.</h2><p><a href='/join.html'>Back to safety</a></p>";
        root.classList.remove("loading");
    }
});

/**
 * Attaches a Firestore listener to the room and handles UI updates.
 */
function listenToRoomUpdates() {
    unsubscribeFromRoom = onSnapshot(roomRef, (snap) => {
        if (!snap.exists()) {
            // Room has been deleted.
            if (unsubscribeFromRoom) unsubscribeFromRoom(); // Clean up the listener
            root.innerHTML = "<h2>This room no longer exists.</h2><a href='/join.html'>Find another room</a>";
            return;
        }
        
        const data = snap.data();
        
        // Check if the game has started and redirect if so.
        // This is a crucial piece of logic.
        if (data.phase && data.phase !== 'lobby') {
            confirmLeave = false;
            location.href = `/game.html?room=${roomId}`;
            return; // Stop processing to avoid errors during redirect.
        }
        
        // Store the creator's ID for later checks.
        roomCreatorId = data.createdBy;
        
        // Initial load is done, show the UI.
        root.classList.remove("loading");
        root.classList.add("loaded");
        
        // Update the UI with the latest data.
        renderLobby(data);
    }, (error) => {
        console.error("Error listening to room:", error);
        root.innerHTML = "<h2>Error connecting to the lobby.</h2><p>Please check your connection and try again.</p>";
    });
}

/**
 * Re-draws the lobby UI based on fresh data from Firestore.
 * @param {object} data - The room document data.
 */
function renderLobby(data) {
    // Update lobby title
    titleEl.textContent = `Lobby: ${data.name}`;

    // Update player list
    playerListEl.innerHTML = ""; // Clear existing list
    Object.entries(data.players).forEach(([uid, nick]) => {
        const li = document.createElement("li");
        li.textContent = nick;
        if (uid === me) li.classList.add("me");
        playerListEl.appendChild(li);
    });

    // Only show the "Start Game" button to the room creator
    startContainerEl.innerHTML = ""; // Clear previous button
    if (me === roomCreatorId) {
        const playerCount = Object.keys(data.players).length;
        const canStart = playerCount >= 5 && playerCount <= 10;
        
        const btn = document.createElement("button");
        btn.id = "startBtn";
        btn.disabled = !canStart;
        btn.textContent = canStart ? "Start Game" : `Need 5-10 players (${playerCount} joined)`;
        
        if(canStart) {
            btn.onclick = () => startGame(data.players);
        }
        
        startContainerEl.appendChild(btn);
    }
}

/**
 * Assigns roles and updates the room document to start the game.
 * @param {object} players - The players object from the room document.
 */
async function startGame(players) {
    // --- This logic is solid, no major changes needed ---
    const spiesByPlayerCount = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
    const uids = Object.keys(players);
    const n = uids.length;
    const spiesNeeded = spiesByPlayerCount[n];

    if (spiesNeeded === undefined) {
        showToast(`Cannot start a game with ${n} players.`, "fail");
        return;
    }

    // Shuffle players to assign roles randomly
    uids.sort(() => Math.random() - 0.5);
    const roles = {};
    uids.forEach((uid, i) => {
        roles[uid] = i < spiesNeeded ? "spy" : "resistance";
    });
    
    // Set the first leader randomly from the shuffled list
    const firstLeader = uids[0];

    try {
        confirmLeave = false; // avoid unload prompt on redirect
        showToast('Starting game...', 'success');
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(roomRef);
            if (!snap.exists() || snap.data().started) {
                throw new Error('already started');
            }
            tx.update(roomRef, {
                roles,
                phase: "roleReveal", // triggers redirect
                started: true,
                lastActivity: serverTimestamp(),
                mission: 1,
                voteRound: 1,
                leaderUid: firstLeader,
                proposedTeam: [],
                votes: {},
                missionResults: {},
                expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000)
            });
        });
    } catch (error) {
        console.error("Failed to start game:", error);
        showToast("Failed to start the game.", "fail");
        confirmLeave = true;
    }
}

/**
 * Handles the "copy invite link" functionality.
 */
copyInviteBtn.onclick = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
        showToast('Invite link copied!', 'success');
    }).catch(err => {
        console.error('Could not copy text: ', err);
    });
};


/**
 * Best-effort attempt to remove a player when they leave the page.
 */
function leaveLobby() {
    clearInterval(heartbeatTimer);
    if (!me || me !== roomCreatorId) {
        // Only non-creator players are removed. If the creator leaves, the room should be deleted.
        // The most robust way to handle creator-leaving is with a Cloud Function or stale-room cleanup.
        updateDoc(roomRef, {
            [`players.${me}`]: deleteField(),
            lastActivity: serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + 60 * 1000)
        }).catch(() => {}); // Fire-and-forget, it might fail.
        navigator.sendBeacon(`https://europe-west1-resistance-app-4aeb2.cloudfunctions.net/leaveRoom?roomId=${roomId}&uid=${me}`);
    }
    // Note: If the creator leaves, a better system would be to delete the room.
    // The `pagehide` event is unreliable, so we rely on stale room cleanup (see join.js notes).
}