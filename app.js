import {
  createAccount,
  defaultState,
  getStoreMode,
  initStore,
  isManager,
  normalizeState,
  onAuthChange,
  onStateChange,
  saveState,
  signIn,
  signOutUser,
} from "./queue-store.js";

let state = defaultState();
let currentUser = null;
let authMode = "signin";

const managerLogin = document.getElementById("manager-login");
const managerApp = document.getElementById("manager-app");
const managerNotice = document.getElementById("manager-notice");
const managerModeHelp = document.getElementById("manager-mode-help");
const managerStatus = document.getElementById("manager-status");
const managerName = document.getElementById("manager-name");
const managerEmail = document.getElementById("manager-email");
const managerPassword = document.getElementById("manager-password");
const managerSubmitBtn = document.getElementById("manager-submit-btn");
const managerSigninBtn = document.getElementById("manager-signin-tab");
const managerCreateBtn = document.getElementById("manager-create-tab");
const queueList = document.getElementById("queue-list");
const court1List = document.getElementById("court1-list");
const court2List = document.getElementById("court2-list");
const arrivalsList = document.getElementById("arrivals-list");
const arrivalsCount = document.getElementById("arrivals-count");
const playerInput = document.getElementById("player-input");
const statQueue = document.getElementById("stat-queue");
const statCourts = document.getElementById("stat-courts");
const statLastPlay = document.getElementById("stat-last-play");
const statAttended = document.getElementById("stat-attended");

document.getElementById("manager-signout-btn").addEventListener("click", handleSignOut);
managerSubmitBtn.addEventListener("click", handleManagerSubmit);
managerSigninBtn.addEventListener("click", () => setAuthMode("signin"));
managerCreateBtn.addEventListener("click", () => setAuthMode("create"));
document.getElementById("add-btn").addEventListener("click", addPlayers);
document.getElementById("clear-btn").addEventListener("click", clearQueue);
document.getElementById("select-next-btn").addEventListener("click", selectNext);
document.getElementById("play-btn").addEventListener("click", playSelected);
document.getElementById("undo-btn").addEventListener("click", undoPlay);
document.getElementById("swap-btn").addEventListener("click", swapSelected);
document.getElementById("clear-selection-btn").addEventListener("click", clearSelection);
document.getElementById("remove-btn").addEventListener("click", removeSelected);
document.getElementById("rename-btn").addEventListener("click", renameSelected);
document.getElementById("add-all-arrivals-btn").addEventListener("click", addAllArrivals);
document.getElementById("add-arrivals-btn").addEventListener("click", addSelectedArrivals);
document.getElementById("remove-arrivals-btn").addEventListener("click", removeSelectedArrivals);
document.getElementById("lock-btn").addEventListener("click", lockControls);
document.getElementById("unlock-btn").addEventListener("click", unlockControls);
document.getElementById("display-btn").addEventListener("click", () => {
  window.open("display.html", "_blank", "noopener");
});
document.getElementById("export-btn").addEventListener("click", exportState);
document.getElementById("import-input").addEventListener("change", importState);

document.querySelectorAll('input[name="courts"]').forEach((radio) => {
  radio.addEventListener("change", (event) => {
    state.courts = Number(event.target.value);
    persistAndRender();
  });
});

document.querySelectorAll('input[name="add-mode"]').forEach((radio) => {
  radio.addEventListener("change", (event) => {
    state.addMode = event.target.value;
    persistAndRender();
  });
});

playerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addPlayers();
  }
});

managerPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    handleManagerSubmit();
  }
});

document.getElementById("script-warning")?.classList.add("hidden");

try {
  await initStore();
  setAuthMode(authMode);
  renderStoreNotice();
  onAuthChange((user) => {
    currentUser = user;
    renderAuthGate();
  });
  onStateChange((nextState) => {
    state = normalizeState(nextState);
    render();
  });
} catch (err) {
  managerStatus.textContent = "The app could not connect to Firebase.";
  managerNotice.textContent = err.message || "Check Firebase setup and Firestore rules.";
  managerNotice.classList.add("warning");
}

function renderAuthGate() {
  const hasAccess = getStoreMode() === "local" || isManager(currentUser);
  managerLogin.classList.toggle("hidden", Boolean(hasAccess));
  managerApp.classList.toggle("hidden", !hasAccess);
  document.getElementById("manager-signout-btn").classList.toggle("hidden", !currentUser);
  if (currentUser) {
    managerStatus.textContent = hasAccess
      ? `Signed in as ${currentUser.email || currentUser.displayName}`
      : "This account is not listed as a queue manager.";
  } else {
    managerStatus.textContent = "Sign in with a manager account.";
  }
}

function renderStoreNotice() {
  if (getStoreMode() === "firebase") {
    managerNotice.textContent = "Connected to the hosted queue database.";
    return;
  }
  managerNotice.textContent =
    "Setup mode: add Firebase config and manager emails before publishing.";
}

function render() {
  renderArrivals();
  renderQueue();
  renderCourts();
  updateStats();
  syncControls();
}

function renderArrivals() {
  arrivalsList.innerHTML = "";
  const arrivals = state.arrivals || [];
  arrivalsCount.textContent = `${arrivals.length} here`;
  arrivals.forEach((arrival, index) => {
    const arrivalKey = getArrivalSelectionKey(arrival, index);
    const li = document.createElement("li");
    li.dataset.id = arrivalKey;
    if ((state.selectedArrivalIds || []).includes(arrivalKey)) {
      li.classList.add("selected");
    }
    const arrivedAt = arrival.arrivedAt ? new Date(arrival.arrivedAt) : null;
    const timeLabel = arrivedAt
      ? arrivedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "Here";
    li.innerHTML = `<span>${escapeHtml(arrival.name)}</span>
      <span class="badge">${escapeHtml(timeLabel)}</span>`;
    li.addEventListener("click", () => toggleArrivalSelection(arrivalKey));
    arrivalsList.appendChild(li);
  });
}

function renderQueue() {
  queueList.innerHTML = "";
  state.queue.forEach((entry, index) => {
    const player = normalizePlayer(entry);
    const li = document.createElement("li");
    li.draggable = true;
    li.dataset.index = index;
    if (state.selectedIndices.includes(index)) {
      li.classList.add("selected");
    }
    const games = state.games[player.name] || 0;
    li.innerHTML = `<span>${index + 1}. ${escapeHtml(player.name)}</span>
      <span class="badge">${games} games</span>`;
    li.addEventListener("click", (event) => {
      event.preventDefault();
      toggleSelection(index);
    });
    li.addEventListener("dragstart", (event) => {
      if (state.locked) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.setData("text/plain", String(index));
    });
    li.addEventListener("dragover", (event) => {
      event.preventDefault();
    });
    li.addEventListener("drop", (event) => {
      event.preventDefault();
      if (state.locked) {
        alert("Unlock to reorder the queue.");
        return;
      }
      const fromIndex = Number(event.dataTransfer.getData("text/plain"));
      const toIndex = Number(li.dataset.index);
      if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) {
        return;
      }
      if (!confirm("Move the selected player to the new position?")) {
        return;
      }
      const [item] = state.queue.splice(fromIndex, 1);
      state.queue.splice(toIndex, 0, item);
      state.selectedIndices = [toIndex];
      persistAndRender();
    });
    queueList.appendChild(li);
  });
}

function renderCourts() {
  court1List.innerHTML = "";
  court2List.innerHTML = "";
  state.lastPlayedCourt1.forEach((entry, index) => {
    const player = normalizePlayer(entry);
    const li = document.createElement("li");
    li.dataset.index = index;
    if (state.courtSelections.court1 === index) {
      li.classList.add("selected");
    }
    li.innerHTML = `<span>${index + 1}. ${escapeHtml(player.name)}</span>`;
    li.addEventListener("click", () => {
      state.courtSelections.court1 =
        state.courtSelections.court1 === index ? null : index;
      persistAndRender();
    });
    court1List.appendChild(li);
  });
  state.lastPlayedCourt2.forEach((entry, index) => {
    const player = normalizePlayer(entry);
    const li = document.createElement("li");
    li.dataset.index = index;
    if (state.courtSelections.court2 === index) {
      li.classList.add("selected");
    }
    li.innerHTML = `<span>${index + 1}. ${escapeHtml(player.name)}</span>`;
    li.addEventListener("click", () => {
      state.courtSelections.court2 =
        state.courtSelections.court2 === index ? null : index;
      persistAndRender();
    });
    court2List.appendChild(li);
  });
}

function updateStats() {
  statQueue.textContent = String(state.queue.length);
  statCourts.textContent = String(state.courts);
  const lastPlayCount = state.lastPlayedCourt1.length + state.lastPlayedCourt2.length;
  statLastPlay.textContent = String(lastPlayCount);
  statAttended.textContent = String(getAttendedCount());
  document.querySelectorAll('input[name="courts"]').forEach((radio) => {
    radio.checked = Number(radio.value) === state.courts;
  });
  document.querySelectorAll('input[name="add-mode"]').forEach((radio) => {
    radio.checked = radio.value === state.addMode;
  });
}

function syncControls() {
  document.querySelectorAll("[data-lockable='true']").forEach((btn) => {
    btn.disabled = state.locked;
  });
}

function toggleSelection(index) {
  if (state.selectedIndices.includes(index)) {
    state.selectedIndices = state.selectedIndices.filter((i) => i !== index);
  } else {
    state.selectedIndices.push(index);
  }
  persistAndRender();
}

function addPlayers() {
  if (state.locked) {
    alert("Unlock to add players.");
    return;
  }
  const names = playerInput.value
    .trim()
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.length) {
    return;
  }
  const added = addNamesToQueue(names);
  if (!added.length) {
    return;
  }
  playerInput.value = "";
  state.selectedIndices = [];
  persistAndRender();
}

function addNamesToQueue(names) {
  const existing = new Set([
    ...Object.keys(state.games),
    ...state.queue.map((entry) => normalizePlayer(entry).name),
    ...state.lastPlayedCourt1.map((entry) => normalizePlayer(entry).name),
    ...state.lastPlayedCourt2.map((entry) => normalizePlayer(entry).name),
  ]);
  const uniqueNames = [];
  const skipped = [];
  names.forEach((name) => {
    if (existing.has(name) || uniqueNames.includes(name)) {
      skipped.push(name);
      return;
    }
    uniqueNames.push(name);
  });
  if (skipped.length) {
    alert(`These names already exist and were not added:\n${skipped.join(", ")}`);
  }
  if (!uniqueNames.length) {
    return [];
  }
  uniqueNames.forEach((name) => {
    if (!state.games[name]) {
      state.games[name] = 0;
    }
  });
  markPlayersAttended(uniqueNames);
  state.addedSincePlay.push(...uniqueNames);
  const insertAt = getInsertIndex();
  state.queue.splice(insertAt, 0, ...uniqueNames);
  return uniqueNames;
}

function clearQueue() {
  if (state.locked) {
    alert("Unlock to clear the queue.");
    return;
  }
  if (confirm("Clear the entire queue?")) {
    state.queue = [];
    state.games = {};
    state.selectedIndices = [];
    state.lastPlayedCourt1 = [];
    state.lastPlayedCourt2 = [];
    state.undoSnapshot = null;
    state.addedSincePlay = [];
    state.pendingAfterPlay = [];
    state.courtSelections = { court1: null, court2: null };
    state.arrivals = [];
    state.selectedArrivalIds = [];
    state.attendedPlayers = {};
    persistAndRender();
  }
}

function clearSelection() {
  if (state.locked) {
    alert("Unlock to clear the selection.");
    return;
  }
  state.selectedIndices = [];
  persistAndRender();
}

function removeSelected() {
  if (state.locked) {
    alert("Unlock to remove players.");
    return;
  }
  if (!state.selectedIndices.length) {
    return;
  }
  const names = state.selectedIndices
    .map((index) => normalizePlayer(state.queue[index]).name)
    .filter(Boolean);
  const label = names.length === 1 ? names[0] : `${names.length} players`;
  if (!confirm(`Remove ${label} from the queue?`)) {
    return;
  }
  [...state.selectedIndices].sort((a, b) => b - a).forEach((index) => {
    state.queue.splice(index, 1);
  });
  state.selectedIndices = [];
  persistAndRender();
}

function renameSelected() {
  if (state.selectedIndices.length !== 1) {
    alert("Select one player to rename.");
    return;
  }
  const idx = state.selectedIndices[0];
  const oldPlayer = normalizePlayer(state.queue[idx]);
  const oldName = oldPlayer.name;
  const newName = prompt(`Edit name for: ${oldName}`, oldName);
  if (newName === null) {
    return;
  }
  const trimmed = newName.trim();
  if (!trimmed) {
    return;
  }
  if (trimmed !== oldName && state.games[trimmed]) {
    alert("That name already exists.");
    return;
  }
  state.queue[idx] = renamePlayerEntry(state.queue[idx], trimmed);
  if (state.games[oldName] !== undefined) {
    state.games[trimmed] = state.games[oldName];
    delete state.games[oldName];
  }
  renameAttendedPlayer(oldPlayer, trimmed);
  state.lastPlayedCourt1 = state.lastPlayedCourt1.map((entry) =>
    renamePlayerEntry(entry, trimmed, oldName)
  );
  state.lastPlayedCourt2 = state.lastPlayedCourt2.map((entry) =>
    renamePlayerEntry(entry, trimmed, oldName)
  );
  state.addedSincePlay = state.addedSincePlay.map((name) =>
    name === oldName ? trimmed : name
  );
  state.pendingAfterPlay = state.pendingAfterPlay.map((name) =>
    name === oldName ? trimmed : name
  );
  state.selectedIndices = [idx];
  persistAndRender();
}

function selectNext() {
  if (!state.queue.length) {
    alert("Queue is empty.");
    return;
  }
  const count = Math.min(state.queue.length, 10 * state.courts);
  state.selectedIndices = Array.from({ length: count }, (_, i) => i);
  persistAndRender();
}

function playSelected() {
  if (!state.selectedIndices.length) {
    alert("No players selected. Use Select Next 10/20 first.");
    return;
  }
  const expectedCount = 10 * state.courts;
  const selectedCount = state.selectedIndices.length;
  if (
    selectedCount !== expectedCount &&
    !confirm(`Are you sure you want to play with ${selectedCount} people?`)
  ) {
    return;
  }
  state.undoSnapshot = {
    queue: [...state.queue],
    games: { ...state.games },
    court1: [...state.lastPlayedCourt1],
    court2: [...state.lastPlayedCourt2],
  };
  state.addedSincePlay = [];
  const selected = state.selectedIndices.map((index) => state.queue[index]);
  selected.forEach((entry) => {
    const name = normalizePlayer(entry).name;
    state.games[name] = (state.games[name] || 0) + 1;
  });
  [...state.selectedIndices].sort((a, b) => b - a).forEach((index) => {
    state.queue.splice(index, 1);
  });
  state.queue.push(...selected);
  if (state.pendingAfterPlay.length) {
    const insertAt = getInsertIndex();
    state.queue.splice(insertAt, 0, ...state.pendingAfterPlay);
    state.pendingAfterPlay = [];
  }
  if (state.courts === 2) {
    state.lastPlayedCourt1 = selected.slice(0, 10);
    state.lastPlayedCourt2 = selected.slice(10, 20);
  } else {
    state.lastPlayedCourt1 = [...selected];
    state.lastPlayedCourt2 = [];
  }
  state.selectedIndices = [];
  persistAndRender();
}

function undoPlay() {
  if (!state.undoSnapshot) {
    return;
  }
  if (state.addedSincePlay.length) {
    const addNow = confirm("Add players who joined after the last Play now?");
    if (addNow) {
      const insertAt = getInsertIndex();
      state.queue = [...state.undoSnapshot.queue];
      state.queue.splice(insertAt, 0, ...state.addedSincePlay);
    } else if (confirm("Add those players after the next Play instead?")) {
      state.pendingAfterPlay = [...state.addedSincePlay];
      state.queue = [...state.undoSnapshot.queue];
    } else {
      state.queue = [...state.undoSnapshot.queue];
    }
  } else {
    state.queue = [...state.undoSnapshot.queue];
  }
  state.games = { ...state.undoSnapshot.games };
  state.lastPlayedCourt1 = [...state.undoSnapshot.court1];
  state.lastPlayedCourt2 = [...state.undoSnapshot.court2];
  state.undoSnapshot = null;
  state.addedSincePlay = [];
  state.selectedIndices = [];
  persistAndRender();
}

function swapSelected() {
  const idx1 = state.courtSelections.court1;
  const idx2 = state.courtSelections.court2;
  if (idx1 === null || idx2 === null) {
    alert("Select one player in each court list to swap.");
    return;
  }
  if (idx1 >= state.lastPlayedCourt1.length || idx2 >= state.lastPlayedCourt2.length) {
    return;
  }
  const temp = state.lastPlayedCourt1[idx1];
  state.lastPlayedCourt1[idx1] = state.lastPlayedCourt2[idx2];
  state.lastPlayedCourt2[idx2] = temp;
  persistAndRender();
}

function lockControls() {
  state.locked = true;
  persistAndRender();
}

function unlockControls() {
  const code = prompt("Enter unlock code:");
  if (code === null) {
    return;
  }
  if (code === state.lockCode) {
    state.locked = false;
    persistAndRender();
  } else {
    alert("Incorrect code.");
  }
}

function getInsertIndex() {
  if (state.addMode === "first_in") {
    let lastZero = -1;
    state.queue.forEach((entry, index) => {
      if ((state.games[normalizePlayer(entry).name] || 0) === 0) {
        lastZero = index;
      }
    });
    return lastZero + 1;
  }
  if (state.addMode === "after_sitting") {
    const onCourtCount = state.lastPlayedCourt1.length + state.lastPlayedCourt2.length;
    if (!onCourtCount) {
      return state.queue.length;
    }
    return Math.max(0, state.queue.length - onCourtCount);
  }
  return state.queue.length;
}

function addSelectedArrivals() {
  if (state.locked) {
    alert("Unlock to add players from the I'm Here list.");
    return;
  }
  const selectedIds = state.selectedArrivalIds || [];
  if (!selectedIds.length) {
    return;
  }
  const selectedArrivals = (state.arrivals || []).filter((arrival, index) =>
    selectedIds.includes(getArrivalSelectionKey(arrival, index))
  );
  addArrivalsToQueue(selectedArrivals);
}

function addAllArrivals() {
  if (state.locked) {
    alert("Unlock to add players from the I'm Here list.");
    return;
  }
  addArrivalsToQueue(state.arrivals || []);
}

function addArrivalsToQueue(arrivals) {
  if (!arrivals.length) {
    return;
  }
  const added = addArrivalEntriesToQueue(arrivals);
  if (!added.length) {
    return;
  }
  const addedKeys = new Set(
    added.map((arrival, index) => getArrivalSelectionKey(arrival, index))
  );
  state.arrivals = state.arrivals.filter(
    (arrival, index) => !addedKeys.has(getArrivalSelectionKey(arrival, index))
  );
  state.selectedArrivalIds = [];
  persistAndRender();
}

function addArrivalEntriesToQueue(arrivals) {
  const existingKeys = new Set([
    ...state.queue.map((entry) => getPlayerKey(normalizePlayer(entry))),
    ...state.lastPlayedCourt1.map((entry) => getPlayerKey(normalizePlayer(entry))),
    ...state.lastPlayedCourt2.map((entry) => getPlayerKey(normalizePlayer(entry))),
  ]);
  const added = [];
  const playersToAdd = [];
  const skipped = [];
  arrivals.forEach((arrival) => {
    const key = getPlayerKey(arrival);
    if (existingKeys.has(key)) {
      skipped.push(arrival.name);
      return;
    }
    const player = {
      uid: arrival.uid || null,
      name: arrival.name,
      joinedAt: new Date().toISOString(),
    };
    if (!state.games[player.name]) {
      state.games[player.name] = 0;
    }
    playersToAdd.push(player);
    existingKeys.add(key);
    added.push(arrival);
  });
  if (playersToAdd.length) {
    markPlayersAttended(playersToAdd);
    const insertAt = getInsertIndex();
    state.queue.splice(insertAt, 0, ...playersToAdd);
    state.addedSincePlay.push(...playersToAdd.map((player) => player.name));
  }
  if (skipped.length) {
    alert(`Already in the queue or on court:\n${skipped.join(", ")}`);
  }
  return added;
}

function removeSelectedArrivals() {
  if (state.locked) {
    alert("Unlock to remove players from the I'm Here list.");
    return;
  }
  const selectedIds = state.selectedArrivalIds || [];
  if (!selectedIds.length) {
    return;
  }
  state.arrivals = (state.arrivals || []).filter(
    (arrival, index) => !selectedIds.includes(getArrivalSelectionKey(arrival, index))
  );
  state.selectedArrivalIds = [];
  persistAndRender();
}

function toggleArrivalSelection(id) {
  if ((state.selectedArrivalIds || []).includes(id)) {
    state.selectedArrivalIds = state.selectedArrivalIds.filter(
      (arrivalId) => arrivalId !== id
    );
  } else {
    state.selectedArrivalIds = [...(state.selectedArrivalIds || []), id];
  }
  persistAndRender();
}

async function handleManagerSubmit() {
  const email = managerEmail.value.trim();
  const password = managerPassword.value;
  const name = managerName.value.trim();
  if (!email || !password) {
    alert("Enter an email and password.");
    return;
  }
  try {
    if (authMode === "create") {
      if (!name) {
        alert("Enter the manager name.");
        return;
      }
      await createAccount(name, email, password);
    } else {
      await signIn(email, password);
    }
    clearManagerFields();
  } catch (err) {
    alert(err.message || "Sign-in failed.");
  }
}

async function handleSignOut() {
  await signOutUser();
}

function setAuthMode(mode) {
  authMode = mode;
  managerName.classList.toggle("hidden", mode !== "create");
  managerSubmitBtn.textContent = mode === "create" ? "Create Manager" : "Sign In";
  managerModeHelp.textContent =
    mode === "create"
      ? "Enter a manager name, email, and password, then press Create Manager."
      : "Enter the manager email and password, then press Sign In.";
  managerSigninBtn.classList.toggle("active", mode === "signin");
  managerCreateBtn.classList.toggle("active", mode === "create");
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "pickup-queue-state.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function importState(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      state = normalizeState(JSON.parse(reader.result));
      state.selectedIndices = [];
      await persistAndRender();
    } catch (err) {
      alert("Invalid JSON file.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

async function persistAndRender() {
  render();
  await saveState(state);
}

function normalizePlayer(entry) {
  if (typeof entry === "string") {
    return { name: entry, uid: null };
  }
  return { name: entry?.name || "", uid: entry?.uid || null };
}

function getPlayerKey(player) {
  return player.uid ? `uid:${player.uid}` : `name:${player.name.toLowerCase()}`;
}

function markPlayersAttended(players) {
  state.attendedPlayers = state.attendedPlayers || {};
  players.forEach((entry) => {
    const player = normalizePlayer(entry);
    if (!player.name) {
      return;
    }
    const key = getPlayerKey(player);
    state.attendedPlayers[key] = {
      uid: player.uid || null,
      name: player.name,
      firstSeenAt: state.attendedPlayers[key]?.firstSeenAt || new Date().toISOString(),
    };
  });
}

function renameAttendedPlayer(oldPlayer, newName) {
  state.attendedPlayers = state.attendedPlayers || {};
  const oldKey = getPlayerKey(oldPlayer);
  if (!state.attendedPlayers[oldKey]) {
    markPlayersAttended([{ ...oldPlayer, name: newName }]);
    return;
  }
  const updatedPlayer = { ...oldPlayer, name: newName };
  const newKey = getPlayerKey(updatedPlayer);
  state.attendedPlayers[newKey] = {
    ...state.attendedPlayers[oldKey],
    uid: oldPlayer.uid || null,
    name: newName,
  };
  if (newKey !== oldKey) {
    delete state.attendedPlayers[oldKey];
  }
}

function getAttendedCount() {
  return Object.keys(state.attendedPlayers || {}).length;
}

function getArrivalSelectionKey(arrival, index) {
  if (arrival.id) {
    return `id:${arrival.id}`;
  }
  if (arrival.uid) {
    return `uid:${arrival.uid}`;
  }
  return `name:${arrival.name || ""}:${arrival.arrivedAt || ""}`;
}

function renamePlayerEntry(entry, newName, oldName = null) {
  const player = normalizePlayer(entry);
  if (oldName && player.name !== oldName) {
    return entry;
  }
  if (typeof entry === "string") {
    return newName;
  }
  return { ...entry, name: newName };
}

function clearManagerFields() {
  managerName.value = "";
  managerEmail.value = "";
  managerPassword.value = "";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
