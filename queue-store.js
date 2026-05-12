import { appSettings, firebaseConfig } from "./firebase-config.js";

const STORAGE_KEY = "pickupQueueState_v1";
const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let firebaseApp = null;
let auth = null;
let db = null;
let firebaseModules = null;
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
  };
}

export function normalizeState(data) {
  return { ...defaultState(), ...(data || {}) };
}

export async function initStore() {
  if (!firebaseReady) {
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
  return firebaseReady ? "firebase" : "local";
}

export function onStateChange(callback) {
  if (!firebaseReady) {
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
  const cleanState = normalizeState(state);
  delete cleanState.currentUserId;
  delete cleanState.users;

  if (!firebaseReady) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanState));
    notifyLocalState();
    return;
  }

  const { doc, setDoc } = firebaseModules.firestoreModule;
  await setDoc(getQueueDoc(doc), cleanState, { merge: true });
}

export function loadLocalState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch (err) {
    return defaultState();
  }
}

export function onAuthChange(callback) {
  if (!firebaseReady) {
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
  if (!firebaseReady) {
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

export async function signIn(email, password) {
  if (!firebaseReady) {
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

export async function signOutUser() {
  if (!firebaseReady) {
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
