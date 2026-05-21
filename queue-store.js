import {
  appSettings as baseAppSettings,
  firebaseConfig as baseFirebaseConfig,
} from "./firebase-config.js";

const STORAGE_KEY = "pickupQueueState_v1";

let firebaseApp = null;
let auth = null;
let db = null;
let firebaseModules = null;
let firebaseConfig = baseFirebaseConfig;
let appSettings = baseAppSettings;
const localAuthListeners = new Set();
const localStateListeners = new Set();

export function defaultState() {
  return {
    queue: [],
    games: {},
    courts: 1,
    addMode: "first_in",
    selectedIndices: [],
    lastPlayedCourt1: [],
    lastPlayedCourt2: [],
    undoSnapshot: null,
    addedSincePlay: [],
    pendingAfterPlay: [],
    locked: false,
    lockCode: "6600",
    courtSelections: { court1: null, court2: null },
    users: [],
    currentUserId: null,
    arrivals: [],
    selectedArrivalIds: [],
    registeredPlayers: {},
    attendedPlayers: {},
  };
}

export function normalizeState(data) {
  const state = { ...defaultState(), ...(data || {}) };
  state.attendedPlayers = seedAttendedPlayers(state);
  return state;
}

export async function initStore() {
  await loadLocalConfig();
  if (!isFirebaseReady()) {
    return { mode: "local", configured: false };
  }

  const [appModule, authModule, firestoreModule] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
  ]);

  firebaseModules = { appModule, authModule, firestoreModule };
  firebaseApp = appModule.initializeApp(firebaseConfig);
  auth = authModule.getAuth(firebaseApp);
  db = firestoreModule.getFirestore(firebaseApp);
  return { mode: "firebase", configured: true };
}

export function getStoreMode() {
  return isFirebaseReady() ? "firebase" : "local";
}

export function onStateChange(callback) {
  if (!isFirebaseReady()) {
    callback(loadLocalState());
    localStateListeners.add(callback);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        callback(loadLocalState());
      }
    });
    return () => localStateListeners.delete(callback);
  }

  const { doc, onSnapshot } = firebaseModules.firestoreModule;
  return onSnapshot(
    getQueueDoc(doc),
    (snapshot) => {
      callback(normalizeState(snapshot.data()));
    },
    (err) => {
      console.error(err);
      callback(defaultState());
    }
  );
}

export async function saveState(state) {
  const cleanState = prepareStateForSave(state);

  if (!isFirebaseReady()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
    notifyLocalState();
    return;
  }

  const { doc, setDoc } = firebaseModules.firestoreModule;
  await setDoc(getQueueDoc(doc), cleanState, { merge: true });
}

export async function markPlayerHere(user, name) {
  if (!user) {
    return { changed: false, state: loadLocalState() };
  }

  if (!isFirebaseReady()) {
    const localState = normalizeState(loadLocalState());
    const result = addArrival(localState, user, name);
    if (result.changed) {
      await saveState(localState);
    }
    return { ...result, state: localState };
  }

  const { doc, runTransaction } = firebaseModules.firestoreModule;
  const queueDoc = getQueueDoc(doc);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(queueDoc);
    const latestState = normalizeState(snapshot.data());
    const result = addArrival(latestState, user, name);
    if (result.changed) {
      transaction.set(queueDoc, prepareStateForSave(latestState), { merge: true });
    }
    return { ...result, state: latestState };
  });
}

export async function removePlayerFromQueue(user, name) {
  if (!user) {
    return { changed: false, state: loadLocalState() };
  }

  if (!isFirebaseReady()) {
    const localState = normalizeState(loadLocalState());
    const result = removeQueuedPlayer(localState, user, name);
    if (result.changed) {
      await saveState(localState);
    }
    return { ...result, state: localState };
  }

  const { doc, runTransaction } = firebaseModules.firestoreModule;
  const queueDoc = getQueueDoc(doc);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(queueDoc);
    const latestState = normalizeState(snapshot.data());
    const result = removeQueuedPlayer(latestState, user, name);
    if (result.changed) {
      transaction.set(queueDoc, prepareStateForSave(latestState), { merge: true });
    }
    return { ...result, state: latestState };
  });
}

export function loadLocalState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (err) {
    return defaultState();
  }
}

export function onAuthChange(callback) {
  if (!isFirebaseReady()) {
    callback(getLocalUser());
    localAuthListeners.add(callback);
    window.addEventListener("storage", (event) => {
      if (event.key === "pickupQueueCurrentUser_v1") {
        callback(getLocalUser());
      }
    });
    return () => localAuthListeners.delete(callback);
  }

  const { onAuthStateChanged } = firebaseModules.authModule;
  return onAuthStateChanged(auth, callback);
}

export async function createAccount(name, email, password) {
  if (!isFirebaseReady()) {
    const user = {
      uid: createId("user"),
      displayName: name,
      email,
      providerId: "password",
    };
    localStorage.setItem("pickupQueueCurrentUser_v1", JSON.stringify(user));
    notifyLocalAuth();
    return user;
  }

  const { createUserWithEmailAndPassword, updateProfile } = firebaseModules.authModule;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  return credential.user;
}

export async function createPlayerAccount(firstName, lastName, email, password) {
  const name = formatFullName(firstName, lastName);
  if (!name) {
    throw new Error("Enter a first and last name.");
  }

  if (!isFirebaseReady()) {
    const localState = normalizeState(loadLocalState());
    reservePlayerName(localState, { uid: createId("user"), email }, name);
    await saveState(localState);
    const user = {
      uid: localState.registeredPlayers[getNameKey(name)].uid,
      displayName: name,
      email,
      providerId: "password",
    };
    localStorage.setItem("pickupQueueCurrentUser_v1", JSON.stringify(user));
    notifyLocalAuth();
    return user;
  }

  const { createUserWithEmailAndPassword, deleteUser, updateProfile } =
    firebaseModules.authModule;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await updateProfile(credential.user, { displayName: name });
    await reservePlayerNameInStore(credential.user, name);
    return { ...credential.user, displayName: name };
  } catch (err) {
    await deleteUser(credential.user).catch(() => {});
    throw err;
  }
}

export async function signIn(email, password) {
  if (!isFirebaseReady()) {
    const user = {
      uid: createId("user"),
      displayName: email.split("@")[0],
      email,
      providerId: "password",
    };
    localStorage.setItem("pickupQueueCurrentUser_v1", JSON.stringify(user));
    notifyLocalAuth();
    return user;
  }

  const { signInWithEmailAndPassword } = firebaseModules.authModule;
  return signInWithEmailAndPassword(auth, email, password);
}

async function reservePlayerNameInStore(user, name) {
  const { doc, runTransaction } = firebaseModules.firestoreModule;
  const queueDoc = getQueueDoc(doc);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(queueDoc);
    const latestState = normalizeState(snapshot.data());
    reservePlayerName(latestState, user, name);
    transaction.set(queueDoc, prepareStateForSave(latestState), { merge: true });
  });
}

export async function signOutUser() {
  if (!isFirebaseReady()) {
    localStorage.removeItem("pickupQueueCurrentUser_v1");
    notifyLocalAuth();
    return;
  }

  const { signOut } = firebaseModules.authModule;
  await signOut(auth);
}

export function isManager(user) {
  if (!user?.email) {
    return false;
  }
  const managers = appSettings.managerEmails || [];
  return managers.map((email) => email.toLowerCase()).includes(user.email.toLowerCase());
}

function getQueueDoc(doc) {
  const [collectionName, docId] = appSettings.queueDocPath;
  return doc(db, collectionName, docId);
}

async function loadLocalConfig() {
  try {
    const local = await import("./firebase-config.local.js");
    firebaseConfig = local.firebaseConfig || firebaseConfig;
    appSettings = local.appSettings || appSettings;
  } catch (err) {
    firebaseConfig = baseFirebaseConfig;
    appSettings = baseAppSettings;
  }
}

function isFirebaseReady() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

function prepareStateForSave(state) {
  const cleanState = normalizeState(state);
  delete cleanState.currentUserId;
  delete cleanState.users;
  return cleanState;
}

function addArrival(state, user, name) {
  if (
    findPlayerIndex(state.queue, user, name) !== -1 ||
    findPlayerIndex(state.lastPlayedCourt1, user, name) !== -1 ||
    findPlayerIndex(state.lastPlayedCourt2, user, name) !== -1 ||
    findArrival(state, user, name)
  ) {
    return { changed: false };
  }

  state.arrivals = state.arrivals || [];
  markPlayerAttended(state, { uid: user.uid, name });
  state.arrivals.push({
    id: createId("arrival"),
    uid: user.uid,
    name,
    arrivedAt: new Date().toISOString(),
  });
  return { changed: true };
}

function markPlayerAttended(state, player) {
  const normalized = normalizePlayer(player);
  if (!normalized.name) {
    return;
  }
  state.attendedPlayers = state.attendedPlayers || {};
  const key = getPlayerKey(normalized);
  state.attendedPlayers[key] = {
    uid: normalized.uid || null,
    name: normalized.name,
    firstSeenAt: state.attendedPlayers[key]?.firstSeenAt || new Date().toISOString(),
  };
}

function seedAttendedPlayers(state) {
  const attendedPlayers = { ...(state.attendedPlayers || {}) };
  [
    ...Object.keys(state.games || {}).map((name) => ({ name, uid: null })),
    ...(state.queue || []),
    ...(state.lastPlayedCourt1 || []),
    ...(state.lastPlayedCourt2 || []),
    ...(state.arrivals || []),
  ].forEach((entry) => {
    const player = normalizePlayer(entry);
    if (!player.name) {
      return;
    }
    const key = getPlayerKey(player);
    attendedPlayers[key] = {
      uid: player.uid || null,
      name: player.name,
      firstSeenAt: attendedPlayers[key]?.firstSeenAt || new Date().toISOString(),
    };
  });
  return attendedPlayers;
}

function removeQueuedPlayer(state, user, name) {
  const index = findPlayerIndex(state.queue, user, name);
  if (index === -1) {
    return { changed: false };
  }
  state.queue.splice(index, 1);
  return { changed: true };
}

function reservePlayerName(state, user, name) {
  const key = getNameKey(name);
  state.registeredPlayers = state.registeredPlayers || {};

  const registered = state.registeredPlayers[key];
  if (registered && registered.uid !== user.uid) {
    throw new Error("That player name is already taken.");
  }

  if (isNameActive(state, name, user.uid)) {
    throw new Error("That player name is already in use.");
  }

  state.registeredPlayers[key] = {
    uid: user.uid,
    email: user.email || "",
    name,
    createdAt: new Date().toISOString(),
  };
}

function isNameActive(state, name, uid) {
  return [
    ...state.queue,
    ...state.lastPlayedCourt1,
    ...state.lastPlayedCourt2,
    ...(state.arrivals || []),
  ].some((entry) => {
    const player = normalizePlayer(entry);
    return player.name.toLowerCase() === name.toLowerCase() && player.uid !== uid;
  });
}

function findPlayerIndex(players, user, name) {
  return players.findIndex((entry) => playerMatchesUser(normalizePlayer(entry), user, name));
}

function findArrival(state, user, name) {
  return (state.arrivals || []).find((arrival) =>
    playerMatchesUser({ name: arrival.name, uid: arrival.uid || null }, user, name)
  );
}

function playerMatchesUser(player, user, name) {
  return player.uid
    ? player.uid === user.uid
    : player.name.toLowerCase() === name.toLowerCase();
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

function formatFullName(firstName, lastName) {
  return [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
}

function getNameKey(name) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getLocalUser() {
  try {
    return JSON.parse(localStorage.getItem("pickupQueueCurrentUser_v1"));
  } catch (err) {
    return null;
  }
}

function notifyLocalAuth() {
  const user = getLocalUser();
  localAuthListeners.forEach((callback) => callback(user));
}

function notifyLocalState() {
  const state = loadLocalState();
  localStateListeners.forEach((callback) => callback(state));
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
