/* /public/js/game.js – Phase 3 with Mission Logic + mission‑chip renderer */
import { db, auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
import { missionTeamSize } from "./utils.mjs";
import { init3DBoard, updateMission3D } from "./three-board.js";

const roomId = new URLSearchParams(location.search).get("room");
const roomRef = doc(db, "rooms", roomId);

/* ---------- cached state ---------- */
let me, data;
let heartbeatTimer = null;
let threeInitialized = false;

/* ---------- elements ---------- */
const $ = (sel) => document.querySelector(sel);
const roleDiv           = $("#role");
const contBtn           = $("#continue");
const board             = $("#board");
const missionNo         = $("#missionNo");
const leaderNm          = $("#leaderName");
const missionDesc       = $("#missionDesc");
const leaderPan         = $("#leaderPanel");
const neededSP          = $("#needed");
const checkBoxC         = $("#playersChecklist");
const proposeBt         = $("#proposeBtn");
const votePan           = $("#votePanel");
const teamList          = $("#teamList");
const approveBt         = $("#approveBtn");
const rejectBt          = $("#rejectBtn");
const statusP           = $("#status");
const missionResultsDiv = $("#mission-results"); // track container (row of chips)
const threeContainer   = $("#three-container");

// Mission panel elements
const missionPan       = $("#missionPanel");
const missionTeamText  = $("#missionTeamText");
const succeedBtn       = $("#succeedBtn");
const failBtn          = $("#failBtn");

/* --------------------------------------------------------------------------- */
/*                               tiny helpers                                  */
/* --------------------------------------------------------------------------- */
const uidName = (uid) => data.players[uid] || uid;

/* --------------------------------------------------------------------------- */
/*                          role‑reveal & auth listener                         */
/* --------------------------------------------------------------------------- */
function maybeShowRole() {
  if (!me || !data?.roles) return;
  const myRole = data.roles[me];
  if (!myRole) return;

  roleDiv.textContent = `You are a ${myRole.toUpperCase()} ${myRole === "spy" ? "🤫" : "💙"}`;
  roleDiv.className   = myRole;
  contBtn.hidden      = false;
}

onAuthStateChanged(auth, (u) => {
  me = u?.uid;
  maybeShowRole();
  if (u) {
    heartbeatTimer = setInterval(() => {
      updateDoc(roomRef, {
        lastActivity: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000)
      }).catch(() => {});
    }, 60000);
    window.addEventListener("pagehide", () => {
      clearInterval(heartbeatTimer);
      if (me) {
        navigator.sendBeacon(`https://europe-west1-resistance-app-4aeb2.cloudfunctions.net/leaveRoom?roomId=${roomId}&uid=${me}`);
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        clearInterval(heartbeatTimer);
        if (me) {
          navigator.sendBeacon(`https://europe-west1-resistance-app-4aeb2.cloudfunctions.net/leaveRoom?roomId=${roomId}&uid=${me}`);
        }
      }
    });
  } else {
    clearInterval(heartbeatTimer);
  }
});

onSnapshot(roomRef, (snap) => {
  if (!snap.exists()) {
    root.innerHTML = "<h2>This room no longer exists.</h2><a href='/join.html'>Back to rooms</a>";
    return;
  }

  /* hide the spinner, reveal the real UI */
  root.classList.remove("loading");
  root.classList.add("loaded");

  data = snap.data();
  maybeShowRole();
});

/* --------------------------------------------------------------------------- */
/*                               UI navigation                                 */
/* --------------------------------------------------------------------------- */
contBtn.onclick = () => {
  roleDiv.hidden = contBtn.hidden = true;
  board.hidden   = false;
  if (!threeInitialized) {
    init3DBoard(threeContainer);
    threeInitialized = true;
  }
  renderBoard();
};

/* --------------------------------------------------------------------------- */
/*                          vote / mission finalisers                          */
/* --------------------------------------------------------------------------- */
async function maybeFinalizeVote() {
  if (!data || data.phase !== "teamBuilding") return; // Only run during team building

  const totalPlayers = Object.keys(data.players).length;
  const votesSoFar   = data.votes ? Object.keys(data.votes).length : 0;

  if (votesSoFar < totalPlayers) return;
  if (me !== data.leaderUid) return;

  const approvals = Object.values(data.votes).filter((v) => v).length;
  const approved  = approvals > totalPlayers / 2;

  if (approved) {
    await updateDoc(roomRef, {
      phase: "mission",            // Move to mission phase
      missionLeader : data.leaderUid,
      currentTeam   : data.proposedTeam,
      votesResult   : "approved",
      missionActions: {}, // reset mission actions
      lastActivity  : serverTimestamp(),
    });
  } else {
    const playerUids  = Object.keys(data.players);
    const currentIdx  = playerUids.indexOf(data.leaderUid);
    const nextLeader  = playerUids[(currentIdx + 1) % playerUids.length];
    const nextRound   = (data.voteRound || 1) + 1;

    if (nextRound > 5) {
      await updateDoc(roomRef, { phase: "gameOver", winner: "spies", reason: "Five rejected teams." });
      return;
    }

    await updateDoc(roomRef, {
      leaderUid   : nextLeader,
      voteRound   : nextRound,
      proposedTeam: [],
      votes       : {},
      votesResult : "rejected",
      lastActivity: serverTimestamp(),
    });
  }
}

// Mission finalizer
async function maybeFinalizeMission() {
  if (!data || data.phase !== "mission") return;

  const teamSize     = data.currentTeam.length;
  const actionsSoFar = data.missionActions ? Object.keys(data.missionActions).length : 0;
  if (actionsSoFar < teamSize) return;                // Wait for all team members
  if (me !== data.missionLeader) return;              // Only mission leader finalises

  const failVotes     = Object.values(data.missionActions).filter(a => a === 'fail').length;
  const missionFailed = failVotes > 0;                // simplified rule (see README)

  const newMissionResults = { ...(data.missionResults || {}), [data.mission]: missionFailed ? 'fail' : 'success' };
  const totalFails        = Object.values(newMissionResults).filter(r => r === 'fail').length;
  const totalSuccesses    = Object.values(newMissionResults).filter(r => r === 'success').length;

  // Check win conditions first
  if (totalFails >= 3) {
    await updateDoc(roomRef, {
      phase         : "gameOver",
      winner        : "spies",
      reason        : "3 missions failed.",
      missionResults: newMissionResults,
    });
    return;
  }
  if (totalSuccesses >= 3) {
    await updateDoc(roomRef, {
      phase         : "gameOver",
      winner        : "resistance",
      reason        : "3 missions succeeded.",
      missionResults: newMissionResults,
    });
    return;
  }

  // Otherwise go to next mission
  const playerUids  = Object.keys(data.players);
  const currentIdx  = playerUids.indexOf(data.leaderUid);
  const nextLeader  = playerUids[(currentIdx + 1) % playerUids.length];

  await updateDoc(roomRef, {
    phase         : "teamBuilding",
    mission       : data.mission + 1,
    voteRound     : 1,
    leaderUid     : nextLeader,
    proposedTeam  : [],
    votes         : {},
    votesResult   : null,
    missionResults: newMissionResults,
    lastActivity  : serverTimestamp(),
  });
}

/* --------------------------------------------------------------------------- */
/*                        UI helper – render mission chips                     */
/* --------------------------------------------------------------------------- */
function renderMissionTrack() {
  // Clear existing chips
  missionResultsDiv.innerHTML = "";

  // Always render 5 chips (missions 1‑5)
  for (let i = 1; i <= 5; i++) {
    const chip    = document.createElement("div");
    chip.classList.add("mission-chip");

    const result  = data.missionResults?.[i];
    if (result === "success") {
      chip.classList.add("success");
      chip.textContent = "✔";
    } else if (result === "fail") {
      chip.classList.add("fail");
      chip.textContent = "✖";
    } else {
      chip.textContent = i;          // upcoming mission number
    }

    missionResultsDiv.appendChild(chip);
    updateMission3D(i, result);
  }
}

/* --------------------------------------------------------------------------- */
/*                              main board renderer                            */
/* --------------------------------------------------------------------------- */
function renderBoard() {
  if (!data) return;

  statusP.textContent = "";
  leaderPan.hidden = votePan.hidden = missionPan.hidden = true;

  // Game over check first
  if (data.phase === "gameOver") {
    statusP.textContent = `GAME OVER! The ${data.winner.toUpperCase()} win! Reason: ${data.reason}`;
    renderMissionTrack();
    return;
  }

  missionNo.textContent = data.mission;
  leaderNm.textContent  = uidName(data.leaderUid);
  missionDesc.textContent = (data.missions && data.missions[data.mission - 1]) || '';

  /* ------------ render mission history chips ------------- */
  renderMissionTrack();

  /* ------------ phase‑specific UI ------------- */
  // --- MISSION PHASE ---
  if (data.phase === "mission") {
    missionPan.hidden  = false;

    const amIOnTeam     = data.currentTeam.includes(me);
    missionTeamText.textContent = `Mission team: ${data.currentTeam.map(uidName).join(", ")}`;

    if (amIOnTeam) {
      statusP.textContent   = "You are on the mission. Choose your action.";

      const myRole   = data.roles[me];
      const hasActed = data.missionActions?.[me] !== undefined;

      succeedBtn.hidden   = false;
      succeedBtn.disabled = hasActed;

      failBtn.hidden      = (myRole !== 'spy');
      failBtn.disabled    = hasActed;

      succeedBtn.onclick = () => castMissionAction('success');
      failBtn.onclick    = () => castMissionAction('fail');
    } else {
      statusP.textContent = "Waiting for the mission team to act…";
    }
    return; // we can exit early; rest of UI irrelevant in mission phase
  }

  // --- TEAM BUILDING & VOTING PHASE ---
  const teamExists = Array.isArray(data.proposedTeam) && data.proposedTeam.length > 0;

  if (me === data.leaderUid && !teamExists) {
    // Leader – pick team
    leaderPan.hidden = false;
    const teamSize   = missionTeamSize(Object.keys(data.players).length, data.mission);
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
        phase       : "teamBuilding", // explicitly set phase
        proposedTeam: sel,
        votes       : {},
        votesResult : null,
        voteRound   : data.voteRound || 1,
        lastActivity: serverTimestamp(),
      });
    };
  } else if (teamExists) {
    // Everyone – vote
    votePan.hidden = false;
    teamList.textContent = `Proposed team: ${data.proposedTeam.map(uidName).join(", ")}`;

    const voted         = data.votes && data.votes[me] !== undefined;
    approveBt.disabled  = rejectBt.disabled = voted;

    approveBt.onclick = () => castVote(true);
    rejectBt.onclick  = () => castVote(false);
  } else {
    statusP.textContent = "Waiting for leader to propose a team…";
  }

  // Live vote tally (informational only)
  if (data.votes && Object.keys(data.votes).length) {
    const yes = Object.values(data.votes).filter((v) => v).length;
    statusP.textContent = `Votes so far: ${yes}/${Object.keys(data.players).length} approve`;
  }

  if (data.votesResult) {
    statusP.textContent = `Previous vote: Team ${data.votesResult.toUpperCase()}. New leader is ${uidName(data.leaderUid)}.`;
  }
}

/* --------------------------------------------------------------------------- */
/*                                 misc helpers                                */
/* --------------------------------------------------------------------------- */

async function castVote(approve) {
  await updateDoc(roomRef, { [`votes.${me}`]: approve, lastActivity: serverTimestamp() });
}

async function castMissionAction(action) {
  await updateDoc(roomRef, { [`missionActions.${me}`]: action, lastActivity: serverTimestamp() });
}

/* --------------------------------------------------------------------------- */
/*                       live updates – snapshot listener                       */
/* --------------------------------------------------------------------------- */
onSnapshot(roomRef, (snap) => {
  if (board.hidden) return; // ignore updates until the board is shown
  data = snap.data();
  renderBoard();
  maybeFinalizeVote();
  maybeFinalizeMission();
});
