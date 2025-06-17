/* /public/js/game.js – Phase 3 */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import {
  doc, onSnapshot, updateDoc, deleteField, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const roomId  = new URLSearchParams(location.search).get("room");
const roomRef = doc(db, "rooms", roomId);

/* ---------- cached state ---------- */
let me, data;

/* ---------- elements ---------- */
const roleDiv   = $("#role");
const contBtn   = $("#continue");
const board     = $("#board");
const missionNo = $("#missionNo");
const leaderNm  = $("#leaderName");
const leaderPan = $("#leaderPanel");
const neededSP  = $("#needed");
const checkBoxC = $("#playersChecklist");
const proposeBt = $("#proposeBtn");
const votePan   = $("#votePanel");
const teamList  = $("#teamList");
const approveBt = $("#approveBtn");
const rejectBt  = $("#rejectBtn");
const statusP   = $("#status");

/* ---------- tiny helpers ---------- */
function $(sel){ return document.querySelector(sel); }
const uidName = uid => data.players[uid] || uid;

/* ---------- role reveal first ---------- */
function maybeShowRole() {
  if (!me || !data?.roles) return;
  const myRole = data.roles[me];
  if (!myRole) return;

  roleDiv.textContent =
    `You are a ${myRole.toUpperCase()} ${myRole==="spy"?"🤫":"💙"}`;
  roleDiv.className = myRole;
  contBtn.hidden = false;
}

onAuthStateChanged(auth, u => { me=u?.uid; maybeShowRole(); });
onSnapshot(roomRef, snap => { data = snap.data(); maybeShowRole(); });

/* ---------- click continue → show board ---------- */
contBtn.onclick = () => {
  roleDiv.hidden = contBtn.hidden = true;
  board.hidden = false;
  renderBoard();
};

/* ---------- vote finaliser ---------- */
async function maybeFinalizeVote() {
  if (!data) return;

  const totalPlayers = Object.keys(data.players).length;
  const votesSoFar   = data.votes ? Object.keys(data.votes).length : 0;

  // Wait until every player has cast a vote
  if (votesSoFar < totalPlayers) return;

  // Who should write the result? Let the leader do it
  if (me !== data.leaderUid) return;

  // Count approvals
  const approvals = Object.values(data.votes).filter(v => v).length;
  const approved  = approvals > totalPlayers / 2;   // simple majority

  if (approved) {
    await updateDoc(roomRef, {
      phase: "mission",
      missionLeader: data.leaderUid,
      currentTeam: data.proposedTeam,
      votesResult: "approved",
      lastActivity: serverTimestamp()
    });
  } else {
    const playerUids = Object.keys(data.players);
    const currentIdx = playerUids.indexOf(data.leaderUid);
    const nextLeader = playerUids[(currentIdx + 1) % playerUids.length];
    const nextRound  = (data.voteRound || 1) + 1;

    // If five failed votes, spies win
    if (nextRound > 5) {
      await updateDoc(roomRef, {
        phase: "spiesWin",
        votesResult: "rejected",
        voteRound: nextRound,
        lastActivity: serverTimestamp()
      });
      return;
    }

    // otherwise rotate leader and start a new vote
    await updateDoc(roomRef, {
      votesResult: "rejected",
      voteRound: nextRound,
      leaderUid: nextLeader,
      proposedTeam: [],
      votes: {},
      lastActivity: serverTimestamp()
    });
  }
}

/* ---------- main board renderer ---------- */
function renderBoard(){
  missionNo.textContent = data.mission;
  leaderNm.textContent  = uidName(data.leaderUid);

  const playersArr = Object.entries(data.players); // [uid,nick]

  /* --- Leader view (only until a team is proposed) --- */
  const teamExists = Array.isArray(data.proposedTeam) && data.proposedTeam.length > 0;
  if (me === data.leaderUid && !teamExists) {
    leaderPan.hidden = false;
    votePan.hidden   = true;
    const teamSize = missionTeamSize(playersArr.length, data.mission);
    neededSP.textContent = teamSize;

    // rebuild checklist
    checkBoxC.innerHTML = "";
    playersArr.forEach(([uid,nick])=>{
      const lab=document.createElement("label");
      lab.innerHTML=`
        <input type="checkbox" value="${uid}">
        ${nick}
      `;
      checkBoxC.appendChild(lab);
    });

    checkBoxC.onchange = () => {
      const sel = [...checkBoxC.querySelectorAll("input:checked")];
      proposeBt.disabled = sel.length !== teamSize;
    };

    proposeBt.onclick = async () => {
      const sel = [...checkBoxC.querySelectorAll("input:checked")].map(i=>i.value);
      await updateDoc(roomRef,{
        proposedTeam: sel,
        votes: {},                      // reset votes
        voteRound: (data.voteRound||1),
        lastActivity: serverTimestamp()
      });
    };
  }
  /* --- Voting view --- */
  else if (teamExists){
    leaderPan.hidden = true;
    votePan.hidden   = false;
    teamList.textContent = `Proposed team: ${
      data.proposedTeam.map(uidName).join(", ")
    }`;

    // disable buttons if I've already voted
    const voted = data.votes && data.votes[me]!==undefined;
    approveBt.disabled = rejectBt.disabled = voted;

    approveBt.onclick = () => castVote(true);
    rejectBt.onclick  = () => castVote(false);
  }else{
    leaderPan.hidden = votePan.hidden = true;
    statusP.textContent = "Waiting for leader to propose a team…";
  }

  // live vote tally
  if (data.votes && Object.keys(data.votes).length){
    const yes = Object.values(data.votes).filter(v=>v).length;
    const total = Object.keys(data.players).length;
    statusP.textContent = `Votes so far: ${yes}/${total} approve`;
  }

  if (data.votesResult === "approved") {
    statusP.textContent = "Team approved! (Mission phase coming next…)";
    leaderPan.hidden = votePan.hidden = true;
    return;                   // nothing else to show for now
  }

  if (data.votesResult === "rejected") {
    statusP.textContent =
      `Team rejected – new leader is ${uidName(data.leaderUid)}`;
    leaderPan.hidden = votePan.hidden = true;
    return;
  }

  if (data.phase === "spiesWin") {
    statusP.textContent = "Five rejected votes – SPIES WIN!";
    leaderPan.hidden = votePan.hidden = true;
    return;
  }
}

/* ---------- helper functions ---------- */
function missionTeamSize(playerCount, mission){
  // table per rules
  const tbl = {
    5: [0,2,3,2,3,3],
    6: [0,2,3,4,3,4],
    7: [0,2,3,3,4,4],
    8: [0,3,4,4,5,5],
    9: [0,3,4,4,5,5],
   10: [0,3,4,4,5,5]
  };
  return tbl[playerCount][mission];
}

async function castVote(approve){
  await updateDoc(roomRef, {
    [`votes.${me}`]: approve,
    lastActivity: serverTimestamp()
  });
}

/* ---------- keep board live ---------- */
onSnapshot(roomRef, snap => {
  if (!board.hidden){ data = snap.data(); renderBoard(); maybeFinalizeVote()}
});
