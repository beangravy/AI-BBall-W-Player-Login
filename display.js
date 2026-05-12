import { initStore, normalizeState, onStateChange } from "./queue-store.js";

const court1List = document.getElementById("display-court1");
const court2List = document.getElementById("display-court2");
const queueLeft = document.getElementById("display-queue-left");
const queueRight = document.getElementById("display-queue-right");

await initStore();
onStateChange((nextState) => {
  render(normalizeState(nextState));
});

function render(state) {
  court1List.innerHTML = "";
  court2List.innerHTML = "";
  queueLeft.innerHTML = "";
  queueRight.innerHTML = "";

  state.lastPlayedCourt1.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = normalizePlayer(entry).name;
    court1List.appendChild(li);
  });
  state.lastPlayedCourt2.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = normalizePlayer(entry).name;
    court2List.appendChild(li);
  });
  const visibleQueue = state.queue.slice(0, 20);
  const splitIndex = Math.ceil(visibleQueue.length / 2);
  queueLeft.start = 1;
  queueRight.start = splitIndex + 1;
  visibleQueue.forEach((entry, index) => {
    const li = document.createElement("li");
    li.textContent = normalizePlayer(entry).name;
    if (index < splitIndex) {
      queueLeft.appendChild(li);
    } else {
      queueRight.appendChild(li);
    }
  });
}

function normalizePlayer(entry) {
  if (typeof entry === "string") {
    return { name: entry, uid: null };
  }
  return { name: entry?.name || "", uid: entry?.uid || null };
}
