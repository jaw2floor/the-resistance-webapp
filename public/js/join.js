/* /public/js/join.js  —  v2 */

import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, getDocs, deleteDoc, updateDoc, doc,
  serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

/* ----- tiny DOM helpers ----- */
const $  = sel => document.querySelector(sel);
const el = (tag, txt) => Object.assign(document.createElement(tag), { textContent: txt });

/* ----- page skeleton ----- */
const root = $("#root");
const form = el("form");
form.innerHTML = `
  <input name="roomName"  placeholder="Room name"      required />
  <input name="userName"  placeholder="Your nickname"  required />
  <button>Create room</button>
`;
root.appendChild(form);

/* ---------- housekeeping helpers ---------- */
async function cleanupStaleRooms(uid) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);     // 15 min ago
  const staleQ = query(
    collection(db, "rooms"),
    where("createdBy", "==", uid),                          // only my rooms
    where("started",   "==", false),
    where("expiresAt", "<=", cutoff)
  );
  const snap = await getDocs(staleQ);
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

async function maybeDeleteExpired(docSnap, uid) {
  const d = docSnap.data();
  if (!d.expiresAt) return false;

  const expired   = d.expiresAt.toDate() <= new Date();
  const canDelete = d.createdBy === uid;

  if (expired && canDelete) {
    try { await deleteDoc(docSnap.ref); }
    catch (err) { console.error("delete failed:", err); }
    return true;                              // caller should skip rendering
  }
  return false;
}

/* ---------- live list of open rooms ---------- */
const list = el("div");
root.appendChild(list);

const roomsQ = query(
  collection(db, "rooms"),
  where("started",   "==", false),
  where("expiresAt", ">", Timestamp.now()),    // hide expired rooms
  orderBy("expiresAt", "desc"),
  limit(30)
);

let unsubRooms = null;

onAuthStateChanged(auth, async user => {
  if (!user) return;                           // sign-in first
  const uid = user.uid;

  /* belt-and-braces cleanup of *your* old rooms */
  cleanupStaleRooms(uid).catch(console.error);

  if (unsubRooms) unsubRooms();                // detach if we re-auth
  unsubRooms = onSnapshot(
    roomsQ,
    snap => renderRoomList(snap, uid),
    err  => console.error("rooms listener:", err)
  );
});

function renderRoomList(snap, uid) {
  list.innerHTML = "";
  if (snap.empty) { list.textContent = "No open rooms."; return; }

  snap.forEach(async docSnap => {
    if (await maybeDeleteExpired(docSnap, uid)) return;    // removed? skip
    const d = docSnap.data();
    const btn = el(
      "button",
      `${d.name} (${Object.keys(d.players).length} players)`
    );
    btn.onclick = () => joinRoom(docSnap.id);
    list.appendChild(btn);
  });
}

/* ---------- helpers ---------- */
function waitForUid() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, u => {
      if (u) { unsub(); resolve(u.uid); }
    });
  });
}

/* ---------- handlers ---------- */
form.onsubmit = async e => {
  e.preventDefault();
  const { roomName, userName } = Object.fromEntries(new FormData(form));

  const uid = await waitForUid();
  const ref = await addDoc(collection(db, "rooms"), {
    name:         roomName,
    createdBy:    uid,
    createdAt:    serverTimestamp(),
    expiresAt:    Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
    lastActivity: serverTimestamp(),
    started:      false,
    players:      { [uid]: userName }
  });
  location.href = `/lobby.html?room=${ref.id}`;
};

async function joinRoom(roomId) {
  const nick = prompt("Choose a nickname:");
  if (!nick) return;

  const uid = await waitForUid();
  await updateDoc(doc(db, "rooms", roomId), {
    [`players.${uid}`]: nick,
    lastActivity:      serverTimestamp(),
    expiresAt:         Timestamp.fromMillis(Date.now() + 15 * 60 * 1000)
  });
  location.href = `/lobby.html?room=${roomId}`;
}
