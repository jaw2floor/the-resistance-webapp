/* /public/js/game.js – Phase 3 with Mission Logic */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";

const roomId = new URLSearchParams(location.search).get("room");
const roomRef = doc(db, "rooms", roomId);

/* ---------- cached state ---------- */
let me, data;

/* ---------- elements ---------- */
const $ = (sel) => document.querySelector(sel);
const roleDiv = $("#role");
const contBtn = $("#continue");
const board = $("#board");
const missionNo = $("#missionNo");
const leaderNm = $("#leaderName");
const leaderPan = $("#leaderPanel");
const neededSP = $("#needed");
const checkBoxC = $("#playersChecklist");
const proposeBt = $("#proposeBtn");
const votePan = $("#votePanel");
const teamList = $("#teamList");
const approveBt = $("#approveBtn");
const rejectBt = $("#rejectBtn");
const statusP = $("#status");
const missionResultsDiv = $("#mission-results"); // NEW: Mission results display

// NEW: Mission panel elements
const missionPan = $("#missionPanel");
const missionTeamText = $("#missionTeamText");
const succeedBtn = $("#succeedBtn");
const failBtn = $("#failBtn");


/* ---------- tiny helpers ---------- */
const uidName = (uid) => data.players[uid] || uid;

/* ---------- role reveal first ---------- */
function maybeShowRole() {
  if (!me || !data?.roles) return;
  const myRole = data.roles[me];
  if (!myRole) return;

  roleDiv.textContent = `You are a ${myRole.toUpperCase()} ${myRole === "spy" ? "🤫" : "💙"}`;
  roleDiv.className = myRole;
  contBtn.hidden = false;
}

onAuthStateChanged(auth, (u) => { me = u?.uid; maybeShowRole(); });
onSnapshot(roomRef, snap => {
  if (!snap.exists()) {
    root.innerHTML =
      "<h2>This room no longer exists.</h2><a href='/join.html'>Back to rooms</a>";
    return;
  }

  /* hide the spinner, reveal the real UI */
  root.classList.remove("loading");
  root.classList.add("loaded");

  data = snap.data();
  maybeShowRole();      // ← your existing call
});

/* ---------- click continue → show board ---------- */
contBtn.onclick = () => {
  roleDiv.hidden = contBtn.hidden = true;
  board.hidden = false;
  renderBoard();
};

/* ---------- vote finaliser ---------- */
async function maybeFinalizeVote() {
  if (!data || data.phase !== "teamBuilding") return; // Only run during team building

  const totalPlayers = Object.keys(data.players).length;
  const votesSoFar = data.votes ? Object.keys(data.votes).length : 0;

  if (votesSoFar < totalPlayers) return;
  if (me !== data.leaderUid) return;

  const approvals = Object.values(data.votes).filter((v) => v).length;
  const approved = approvals > totalPlayers / 2;

  if (approved) {
    await updateDoc(roomRef, {
      phase: "mission", // Move to mission phase
      missionLeader: data.leaderUid,
      currentTeam: data.proposedTeam,
      votesResult: "approved",
      missionActions: {}, // NEW: Reset mission actions
      lastActivity: serverTimestamp(),
    });
  } else {
    const playerUids = Object.keys(data.players);
    const currentIdx = playerUids.indexOf(data.leaderUid);
    const nextLeader = playerUids[(currentIdx + 1) % playerUids.length];
    const nextRound = (data.voteRound || 1) + 1;

    if (nextRound > 5) {
      await updateDoc(roomRef, { phase: "gameOver", winner: "spies", reason: "Five rejected teams." });
      return;
    }

    await updateDoc(roomRef, {
      leaderUid: nextLeader,
      voteRound: nextRound,
      proposedTeam: [],
      votes: {},
      votesResult: "rejected",
      lastActivity: serverTimestamp(),
    });
  }
}

// NEW: Mission finalizer
async function maybeFinalizeMission() {
    if (!data || data.phase !== "mission") return;

    const teamSize = data.currentTeam.length;
    const actionsSoFar = data.missionActions ? Object.keys(data.missionActions).length : 0;

    if (actionsSoFar < teamSize) return; // Wait for all team members to act
    if (me !== data.missionLeader) return; // Only the mission leader finalizes

    const failVotes = Object.values(data.missionActions).filter(a => a === 'fail').length;

    // Determine if mission succeeded or failed
    // (In 7+ player games, mission 4 needs 2 fails. This is a simplified rule for now.)
    const missionFailed = failVotes > 0;
    const newMissionResults = { ...(data.missionResults || {}), [data.mission]: missionFailed ? 'fail' : 'success' };

    const totalFails = Object.values(newMissionResults).filter(r => r === 'fail').length;
    const totalSuccesses = Object.values(newMissionResults).filter(r => r === 'success').length;

    if (totalFails >= 3) {
        await updateDoc(roomRef, { phase: "gameOver", winner: "spies", reason: "3 missions failed.", missionResults: newMissionResults });
        return;
    }
    if (totalSuccesses >= 3) {
        await updateDoc(roomRef, { phase: "gameOver", winner: "resistance", reason: "3 missions succeeded.", missionResults: newMissionResults });
        return;
    }

    // If game is not over, set up the next round
    const playerUids = Object.keys(data.players);
    const currentIdx = playerUids.indexOf(data.leaderUid);
    const nextLeader = playerUids[(currentIdx + 1) % playerUids.length];

    await updateDoc(roomRef, {
        phase: "teamBuilding", // Go back to building a team
        mission: data.mission + 1,
        voteRound: 1,
        leaderUid: nextLeader,
        proposedTeam: [],
        votes: {},
        votesResult: null,
        missionResults: newMissionResults,
        lastActivity: serverTimestamp()
    });
}


/* ---------- main board renderer ---------- */
function renderBoard() {
  if (!data) return; // Don't render without data
  statusP.textContent = ""; // Clear status by default
  leaderPan.hidden = votePan.hidden = missionPan.hidden = true; // Hide all panels

  // Game Over display
  if (data.phase === "gameOver") {
    statusP.textContent = `GAME OVER! The ${data.winner.toUpperCase()} win! Reason: ${data.reason}`;
    return;
  }

  missionNo.textContent = data.mission;
  leaderNm.textContent = uidName(data.leaderUid);

  // Render mission results track record
  missionResultsDiv.innerHTML = "<h4>Mission History:</h4>";
  for(let i = 1; i <= 5; i++) {
      const result = data.missionResults?.[i];
      if (result) {
          missionResultsDiv.innerHTML += `Mission ${i}: <span class="${result}">${result.toUpperCase()}</span> | `;
      }
  }


  // --- MISSION PHASE ---
  if (data.phase === "mission") {
    missionPan.hidden = false;
    const amIOnTeam = data.currentTeam.includes(me);
    missionTeamText.textContent = `Mission team: ${data.currentTeam.map(uidName).join(", ")}`;

    if (amIOnTeam) {
      statusP.textContent = "You are on the mission. Choose your action.";
      const myRole = data.roles[me];
      const hasActed = data.missionActions?.[me] !== undefined;

      succeedBtn.hidden = false;
      succeedBtn.disabled = hasActed;
      failBtn.hidden = (myRole !== 'spy'); // Only spies see the fail button
      failBtn.disabled = hasActed;

      succeedBtn.onclick = () => castMissionAction('success');
      failBtn.onclick = () => castMissionAction('fail');
    } else {
      statusP.textContent = "Waiting for the mission team to act...";
    }
    return; // End render here for mission phase
  }

  // --- TEAM BUILDING & VOTING PHASE ---
  const teamExists = Array.isArray(data.proposedTeam) && data.proposedTeam.length > 0;
  if (me === data.leaderUid && !teamExists) {
    leaderPan.hidden = false;
    const teamSize = missionTeamSize(Object.keys(data.players).length, data.mission);
    neededSP.textContent = teamSize;

    checkBoxC.innerHTML = "";
    Object.entries(data.players).forEach(([uid, nick]) => {
      checkBoxC.innerHTML += `<label><input type="checkbox" value="${uid}"> ${nick}</label><br>`;
    });

    checkBoxC.onchange = () => {
      const sel = [...checkBoxC.querySelectorAll("input:checked")];
      proposeBt.disabled = sel.length !== teamSize;
    };

    proposeBt.onclick = async () => {
      const sel = [...checkBoxC.querySelectorAll("input:checked")].map((i) => i.value);
      await updateDoc(roomRef, {
        phase: "teamBuilding", // Explicitly set phase
        proposedTeam: sel,
        votes: {},
        votesResult: null,
        voteRound: data.voteRound || 1,
        lastActivity: serverTimestamp(),
      });
    };
  } else if (teamExists) {
    votePan.hidden = false;
    teamList.textContent = `Proposed team: ${data.proposedTeam.map(uidName).join(", ")}`;
    const voted = data.votes && data.votes[me] !== undefined;
    approveBt.disabled = rejectBt.disabled = voted;
    approveBt.onclick = () => castVote(true);
    rejectBt.onclick = () => castVote(false);
  } else {
    statusP.textContent = "Waiting for leader to propose a team…";
  }

  // Live vote tally
  if (data.votes && Object.keys(data.votes).length) {
    const yes = Object.values(data.votes).filter((v) => v).length;
    statusP.textContent = `Votes so far: ${yes}/${Object.keys(data.players).length} approve`;
  }
  
  if (data.votesResult) {
      statusP.textContent = `Previous vote: Team ${data.votesResult.toUpperCase()}. New leader is ${uidName(data.leaderUid)}.`;
  }
}

/* ---------- helper functions ---------- */
function missionTeamSize(playerCount, mission) {
  const tbl = { 5: [0, 2, 3, 2, 3, 3], 6: [0, 2, 3, 4, 3, 4], 7: [0, 2, 3, 3, 4, 4], 8: [0, 3, 4, 4, 5, 5], 9: [0, 3, 4, 4, 5, 5], 10: [0, 3, 4, 4, 5, 5] };
  return tbl[playerCount][mission];
}

async function castVote(approve) {
  await updateDoc(roomRef, { [`votes.${me}`]: approve, lastActivity: serverTimestamp() });
}

// NEW: Cast a mission action
async function castMissionAction(action) {
    await updateDoc(roomRef, { [`missionActions.${me}`]: action, lastActivity: serverTimestamp() });
}

/* ---------- keep board live ---------- */
onSnapshot(roomRef, (snap) => {
  if (board.hidden) return; // Don't do anything if board isn't visible
  data = snap.data();
  renderBoard();
  maybeFinalizeVote();
  maybeFinalizeMission(); // NEW: Check if mission can be finalized
});