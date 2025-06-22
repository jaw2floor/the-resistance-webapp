/* /public/js/join.js  —  redesigned home‑screen logic */

import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, getDocs, deleteDoc, updateDoc, doc,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

/* ────────────────────────────────────────────────────────────── */
/*                               DOM                              */
/* ────────────────────────────────────────────────────────────── */
const root       = document.getElementById("root");
const roomName   = document.getElementById("roomName");
const nickname   = document.getElementById("nickname");
const createBtn  = document.getElementById("createBtn");
const roomsList  = document.getElementById("roomsList");
const noRoomsMsg = document.getElementById("noRoomsMsg");
/* ────────────────────────────────────────────────────────────── */
/*                     UI helpers / state guards                  */
/* ────────────────────────────────────────────────────────────── */

const savedNick = localStorage.getItem("resistanceNick");
if (savedNick) {
  nickname.value = savedNick;
  checkFields()
}
function checkFields() {
  createBtn.disabled = !(roomName.value.trim() && nickname.value.trim());
}
roomName.addEventListener("input", checkFields);
nickname.addEventListener("input", checkFields);

function waitForUid() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        unsub();
        resolve(u.uid);
      }
    });
  });
}

/* ────────────────────────────────────────────────────────────── */
/*                        Room maintenance                        */
/* ────────────────────────────────────────────────────────────── */
async function cleanupStaleRooms(uid) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000); // 15‑min inactivity
  const staleQ = query(
    collection(db, "rooms"),
    where("createdBy", "==", uid),
    where("started", "==", false),
    where("expiresAt", "<=", cutoff)
  );
  const snap = await getDocs(staleQ);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

async function maybeDeleteExpired(docSnap, uid) {
  const d = docSnap.data();
  if (!d.expiresAt) return false;
  const expired = d.expiresAt.toDate() <= new Date();
  const canDelete = d.createdBy === uid;
  if (expired && canDelete) {
    try {
      await deleteDoc(docSnap.ref);
    } catch (err) {
      console.error("delete failed:", err);
    }
    return true;
  }
  return false;
}

/* ────────────────────────────────────────────────────────────── */
/*                     Real‑time room directory                   */
/* ────────────────────────────────────────────────────────────── */
const roomsQ = query(
  collection(db, "rooms"),
  where("started", "==", false),
  where("expiresAt", ">", Timestamp.now()),
  orderBy("expiresAt", "desc"),
  limit(30)
);
let unsubRooms = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) return; // anonymous sign‑in happens in firebase‑init
  const uid = user.uid;

  /* UI gate */
  root.classList.remove("loading");
  root.classList.add("loaded");

  /* Clean up my abandoned rooms so the list stays tidy */
  cleanupStaleRooms(uid).catch(console.error);

  if (unsubRooms) unsubRooms();
  unsubRooms = onSnapshot(
    roomsQ,
    (snap) => renderRoomList(snap, uid),
    (err) => console.error("rooms listener:", err)
  );
});

function renderRoomList(snap, uid) {
  roomsList.innerHTML = "";
  if (snap.empty) {
    noRoomsMsg.style.display = "block";
    return;
  }
  noRoomsMsg.style.display = "none";

  snap.forEach(async (docSnap) => {
    if (await maybeDeleteExpired(docSnap, uid)) return; // skip if deleted

    const d = docSnap.data();
    const li = document.createElement("li");
    li.className = "room-card";
    li.innerHTML = `<span class="room-name">${d.name || "Untitled"}</span>` +
                   `<span class="room-meta">${Object.keys(d.players).length} players</span>`;
    li.onclick = (e) => {
    // Prevent clicks on input/button from re-triggering this
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

    // Remove any other open join forms
    document.querySelectorAll('.join-form').forEach(form => form.remove());

    // Create a small form inside the list item
    const joinForm = document.createElement('div');
    joinForm.className = 'join-form';
    joinForm.innerHTML = `
        <input type="text" class="field" placeholder="Your nickname" maxlength="18" />
        <button>Join</button>
    `;
    li.appendChild(joinForm);
    
    const nickInput = joinForm.querySelector('input');
    nickInput.focus();

    joinForm.querySelector('button').onclick = () => {
        const nick = nickInput.value.trim();
        if (nick) {
            joinRoom(docSnap.id, nick);
        }
    };
};
    roomsList.appendChild(li);
  });
}

/* ────────────────────────────────────────────────────────────── */
/*                       Create / Join logic                      */
/* ────────────────────────────────────────────────────────────── */
createBtn.onclick = async () => {
  if (createBtn.disabled) return;
  
  // --- UI FEEDBACK ---
  createBtn.disabled = true;
  createBtn.textContent = "Creating...";
  // -------------------

  const nickToSave = nickname.value.trim();
  localStorage.setItem("resistanceNick", nickToSave);
  
  try {
    const uid = await waitForUid();
    const ref = await addDoc(collection(db, "rooms"), {
      name: roomName.value.trim(),
      createdBy: uid,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      lastActivity: serverTimestamp(),
      started: false,
      players: { [uid]: nickToSave }
    });
    location.href = `/lobby.html?room=${ref.id}`;
  } catch (error) {
    console.error("Failed to create room:", error);
    alert("Could not create the room. Please try again.");
    // --- RESTORE BUTTON ON FAILURE ---
    createBtn.disabled = false;
    createBtn.textContent = "Create Room";
    // ---------------------------------
  }
};

async function joinRoom(roomId, nick) {
  if (!nick) return; // This is still a good safety check
  localStorage.setItem("resistanceNick", nick);

  const uid = await waitForUid();
  await updateDoc(doc(db, "rooms", roomId), {
    [`players.${uid}`]: nick, // <-- `nick` now comes from the function argument
  });
  location.href = `/lobby.html?room=${roomId}`;
}