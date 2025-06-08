/* /public/js/join.js  —  v2 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

import {
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, getDocs , deleteDoc, updateDoc, doc, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

/* ---------------- little DOM helpers ---------------- */
const $  = sel => document.querySelector(sel);
const el = (tag, txt) => Object.assign(document.createElement(tag), { textContent: txt });

/* ---------------- page skeleton ---------------- */
const root = $("#root");

/* --  Create-room form  -- */
const form = el("form");
form.innerHTML = `
  <input name="roomName" placeholder="Room name" required />
  <input name="userName" placeholder="Your nickname" required />
  <button>Create room</button>
`;
root.appendChild(form);
/* --  purge >15m midle rooms   --*/
async function cleanupStaleRooms() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000); // 15 minutes ago
  const staleQ = query(
    collection(db, "rooms"),
    where("started", "==", false),
    where("createdAt", "<=", cutoff)
  );
  const snap = await getDocs(staleQ);
  const deletes = snap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletes);
}

// Run it once on page load
cleanupStaleRooms().catch(console.error);


/* --  Live list of open rooms  -- */
const list = el("div");
root.appendChild(list);

/* ---------------- Firestore query ---------------- */
//only rooms <15 mins old
const fifteenAgo = Timestamp.fromMillis(Date.now() - 15 * 60 * 1000);
const roomsQ = query(
  collection(db, "rooms"),
  where("started", "==", false),
  where("createdAt", ">", fifteenAgo),   // ← new filter
  orderBy("createdAt", "desc"),
  limit(30)
);

async function maybeDeleteExpired(docSnap) {
  const d = docSnap.data();
  if (d.started) return;                           // already in game → keep
  const age = Date.now() - d.createdAt.toMillis();
  if (age < 15 * 60 * 1000) return;               // younger than 15 min → keep
  if (auth.currentUser.uid !== d.createdBy) return; // only owner cleans up
  try { await deleteDoc(docSnap.ref); }
  catch (err) { console.error("GC delete failed:", err); }
}


onSnapshot(roomsQ, snap => {
  list.innerHTML = "";                    // wipe and rebuild
  if (snap.empty) { list.textContent = "No open rooms."; return; }

  snap.forEach(docSnap => {
    maybeDeleteExpired(docSnap);
    const d = docSnap.data();
    const btn = el("button",
      `${d.name} (${Object.keys(d.players).length} players)`
    );
    btn.onclick = () => joinRoom(docSnap.id);
    list.appendChild(btn);
  });
});

/* ---------------- helpers ---------------- */
function waitForUid() {
  // returns a Promise that resolves to the user’s uid once sign-in is done
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { unsub(); resolve(user.uid); }
    });
  });
}

/* ---------------- handlers ---------------- */
form.onsubmit = async e => {
  e.preventDefault();
  const { roomName, userName } = Object.fromEntries(new FormData(form));

  const uid = await waitForUid();           // <- key line
  const ref = await addDoc(collection(db, "rooms"), {
    name: roomName,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
    lastActivity: serverTimestamp(),
    started: false,
    players: { [uid]: userName }
  });
  location.href = `/lobby.html?room=${ref.id}`;
};

async function joinRoom(roomId) {
  const nick = prompt("Choose a nickname:");
  if (!nick) return;

  const uid = await waitForUid();           // <- key line
  await updateDoc(doc(db, "rooms", roomId), {
    [`players.${uid}`]: nick,
    lastActivity: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
  });
  location.href = `/lobby.html?room=${roomId}`;
}