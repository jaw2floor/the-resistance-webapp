/* /public/js/join.js  —  v2 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";

import {
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, updateDoc, doc, serverTimestamp
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

/* --  Live list of open rooms  -- */
const list = el("div");
root.appendChild(list);

/* ---------------- Firestore query ---------------- */
const roomsQ = query(
  collection(db, "rooms"),
  where("started", "==", false),
  orderBy("createdAt", "desc"),
  limit(30)
);

onSnapshot(roomsQ, snap => {
  list.innerHTML = "";                    // wipe and rebuild
  if (snap.empty) { list.textContent = "No open rooms."; return; }

  snap.forEach(docSnap => {
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
    lastActivity: serverTimestamp()
  });
  location.href = `/lobby.html?room=${roomId}`;
}