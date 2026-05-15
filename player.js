import {
  createPlayerAccount,
  defaultState,
  getStoreMode,
  initStore,
  markPlayerHere,
  normalizeState,
  onAuthChange,
  onStateChange,
  removePlayerFromQueue,
  signIn,
  signOutUser,
} from "./queue-store.js";

let state = defaultState();
let currentUser = null;
let authMode = "signin";
let hasLoadedState = false;

const loginPanel = document.getElementById("player-login");
const playerPanel = document.getElementById("player-panel");
const playerStats = document.getElementById("player-stats");
const publicQueuePanel = document.getElementById("public-queue-panel");
const publicCourtsPanel = document.getElementById("public-courts-panel");
const storeStatus = document.getElementById("player-store-status");
const modeHelp = document.getElementById("player-mode-help");
const playerFirstName = document.getElementById("player-first-name");
const playerLastName = document.getElementById("player-last-name");
const playerEmail = document.getElementById("player-email");
const playerPassword = document.getElementById("player-password");
const submitBtn = document.getElementById("player-submit-btn");
const signinTab = document.getElementById("player-signin-tab");
const createTab = document.getElementById("player-create-tab");
const greeting = document.getElementById("player-greeting");
const statusText = document.getElementById("player-status");
const imHereBtn = document.getElementById("im-here-btn");
const leaveBtn = document.getElementById("leave-queue-btn");
const queueList = document.getElementById("public-queue-list");
const court1List = document.getElementById("public-court1-list");
const court2List = document.getElementById("public-court2-list");
const statQueue = document.getElementById("player-stat-queue");
const statCourts = document.getElementById("player-stat-courts");
const statSpot = document.getElementById("player-stat-spot");

signinTab.addEventListener("click", () => setAuthMode("signin"));
createTab.addEventListener("click", () => setAuthMode("create"));
submitBtn.addEventListener("click", handleSubmit);
document.getElementById("player-signout-btn").addEventListener("click", signOutUser);
imHereBtn.addEventListener("click", markHere);
leaveBtn.addEventListener("click", leaveQueue);
playerPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleSubmit();
  }
});

document.getElementById("script-warning")?.classList.add("hidden");

try {
  await initStore();
  setAuthMode(authMode);
  storeStatus.textContent =
    getStoreMode() === "firebase" ? "Live queue" : "Setup mode";
  onAuthChange((user) => {
    currentUser = mergeAuthUser(user);
    render();
  });
  onStateChange((nextState) => {
    state = normalizeState(nextState);
    hasLoadedState = true;
    render();
  });
} catch (err) {
  storeStatus.textContent = "Connection error";
  modeHelp.textContent = err.message || "Check Firebase setup and Firestore rules.";
  modeHelp.classList.add("warning");
}

function render() {
  renderAuth();
  renderQueue();
  renderCourts();
  renderStats();
}

function renderAuth() {
  loginPanel.classList.toggle("hidden", Boolean(currentUser));
  playerPanel.classList.toggle("hidden", !currentUser);
  playerStats.classList.toggle("hidden", !currentUser);
  publicQueuePanel.classList.toggle("hidden", true);
  publicCourtsPanel.classList.toggle("hidden", true);
  if (!currentUser) {
    return;
  }
  const name = getUserName();
  const spot = findPlayerIndex();
  const arrival = findArrival();
  const onCourt = isOnCourt();
  const canSeeQueueDetails = spot !== -1 || onCourt;
  publicQueuePanel.classList.toggle("hidden", !canSeeQueueDetails);
  publicCourtsPanel.classList.toggle("hidden", !canSeeQueueDetails);
  greeting.textContent = `Hi, ${name}`;
  imHereBtn.disabled = !hasLoadedState || Boolean(arrival) || spot !== -1 || onCourt;
  leaveBtn.disabled = !hasLoadedState || spot === -1;
  if (spot !== -1) {
    statusText.textContent = `You are number ${spot + 1} in the queue.`;
  } else if (arrival) {
    statusText.textContent = "You are on the I'm Here list. A manager can add you to the queue.";
  } else if (onCourt) {
    statusText.textContent = "You are listed on a court right now.";
  } else {
    statusText.textContent = "You are not currently marked here or in the queue.";
  }
}

function renderQueue() {
  queueList.innerHTML = "";
  state.queue.forEach((entry, index) => {
    const player = normalizePlayer(entry);
    const li = document.createElement("li");
    if (currentUser && playerMatchesUser(player)) {
      li.classList.add("selected");
    }
    li.innerHTML = `<span>${index + 1}. ${escapeHtml(player.name)}</span>
      <span class="badge">${state.games[player.name] || 0} games</span>`;
    queueList.appendChild(li);
  });
}

function renderCourts() {
  court1List.innerHTML = "";
  court2List.innerHTML = "";
  state.lastPlayedCourt1.forEach((entry, index) => {
    const player = normalizePlayer(entry);
    const li = document.createElement("li");
    li.innerHTML = `<span>${index + 1}. ${escapeHtml(player.name)}</span>`;
    court1List.appendChild(li);
  });
  state.lastPlayedCourt2.forEach((entry, index) => {
    const player = normalizePlayer(entry);
    const li = document.createElement("li");
    li.innerHTML = `<span>${index + 1}. ${escapeHtml(player.name)}</span>`;
    court2List.appendChild(li);
  });
}

function renderStats() {
  const spot = findPlayerIndex();
  statQueue.textContent = String(state.queue.length);
  statCourts.textContent = String(state.courts);
  statSpot.textContent = spot === -1 ? "-" : String(spot + 1);
}

async function handleSubmit() {
  const email = playerEmail.value.trim();
  const password = playerPassword.value;
  const firstName = playerFirstName.value.trim();
  const lastName = playerLastName.value.trim();
  const name = `${firstName} ${lastName}`.trim();
  if (!email || !password) {
    alert("Enter an email and password.");
    return;
  }
  try {
    if (authMode === "create") {
      if (!firstName || !lastName) {
        alert("Enter your first and last name.");
        return;
      }
      const user = await createPlayerAccount(firstName, lastName, email, password);
      currentUser = { ...user, displayName: name };
      render();
    } else {
      await signIn(email, password);
    }
    clearFields();
  } catch (err) {
    alert(err.message || "Sign-in failed.");
  }
}

async function markHere() {
  if (!currentUser || findPlayerIndex() !== -1 || findArrival() || isOnCourt()) {
    return;
  }
  const result = await markPlayerHere(currentUser, getUserName());
  state = normalizeState(result.state);
  render();
}

async function leaveQueue() {
  const index = findPlayerIndex();
  if (index === -1) {
    return;
  }
  if (!confirm("Leave the queue?")) {
    return;
  }
  const result = await removePlayerFromQueue(currentUser, getUserName());
  state = normalizeState(result.state);
  render();
}

function findPlayerIndex() {
  if (!currentUser) {
    return -1;
  }
  return state.queue.findIndex((entry) => playerMatchesUser(normalizePlayer(entry)));
}

function isOnCourt() {
  if (!currentUser) {
    return false;
  }
  return [...state.lastPlayedCourt1, ...state.lastPlayedCourt2].some((entry) =>
    playerMatchesUser(normalizePlayer(entry))
  );
}

function findArrival() {
  if (!currentUser) {
    return null;
  }
  return (state.arrivals || []).find((arrival) =>
    playerMatchesUser({ name: arrival.name, uid: arrival.uid || null })
  );
}

function playerMatchesUser(player) {
  return player.uid
    ? player.uid === currentUser.uid
    : player.name.toLowerCase() === getUserName().toLowerCase();
}

function normalizePlayer(entry) {
  if (typeof entry === "string") {
    return { name: entry, uid: null };
  }
  return { name: entry?.name || "", uid: entry?.uid || null };
}

function getUserName() {
  return currentUser.displayName || currentUser.email?.split("@")[0] || "Player";
}

function mergeAuthUser(user) {
  if (
    user &&
    currentUser?.uid === user.uid &&
    currentUser.displayName &&
    !user.displayName
  ) {
    return { ...user, displayName: currentUser.displayName };
  }
  return user;
}

function setAuthMode(mode) {
  authMode = mode;
  playerFirstName.classList.toggle("hidden", mode !== "create");
  playerLastName.classList.toggle("hidden", mode !== "create");
  submitBtn.textContent = mode === "create" ? "Create User" : "Sign In";
  modeHelp.textContent =
    mode === "create"
      ? "Enter your first name, last name, email, and password, then press Create User."
      : "Enter your email and password, then press Sign In.";
  signinTab.classList.toggle("active", mode === "signin");
  createTab.classList.toggle("active", mode === "create");
}

function clearFields() {
  playerFirstName.value = "";
  playerLastName.value = "";
  playerEmail.value = "";
  playerPassword.value = "";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
