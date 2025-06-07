import { db, auth } from "./firebase-init.js";
import {
  collection, query, where, orderBy, limit,
  onSnapshot, addDoc, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

// ---------- helpers ----------
function $(sel) { return document.querySelector(sel); }
function el(tag, txt) {
  const e = document.createElement(tag);
  if (txt) e.textContent = txt;
  return e;
}

// ---------- UI ----------
const root = $("#root");

// 1. render "Create room" form
const form = el("form");
form.innerHTML = `
  <input required name="roomName" placeholder="Room name" />
  <input required name="userName" placeholder="Your nickname" />
  <button>Create room</button>
`;
root.appendChild(form);

// 2. list of rooms
const list = el("div");
root.appendChild(list);

// ---------- Firestore live query ----------
const roomsQ = query(
  collection(db, "rooms"),
  where("started", "==", false),
  orderBy("createdAt", "desc"),
  limit(30)
);
onSnapshot(roomsQ, snap => {
  list.innerHTML = "";                       // clear list
  snap.forEach(doc => {
    const data = doc.data();
    const btn = el("button",
      `${data.name} (${Object.keys(data.players).length} players)`
    );
    btn.onclick = () => joinRoom(doc.id, data);
    list.appendChild(btn);
  });
  if (snap.empty) list.textContent = "No open rooms.";
});

// ---------- handlers ----------
form.onsubmit = async e => {
  e.preventDefault();
  const { roomName, userName } = Object.fromEntries(new FormData(form));
  const uid = auth.currentUser.uid;
  const docRef = await addDoc(collection(db, "rooms"), {
    name: roomName,
    createdBy: uid,
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp(),
    started: false,
    players: { [uid]: userName }
  });
  location.href = `/lobby.html?room=${docRef.id}`;
};

async function joinRoom(roomId, roomData) {
  const userName = prompt("Choose a nickname:");
  if (!userName) return;
  const uid = auth.currentUser.uid;
  await updateDoc(doc(db, "rooms", roomId), {
    [`players.${uid}`]: userName,
    lastActivity: serverTimestamp()
  });
  location.href = `/lobby.html?room=${roomId}`;
}
