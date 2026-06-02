const GAME_SECONDS = 15;
const GRAVITY = 0.00155;
const JUMP_VELOCITY = -0.62;
const BIRD_X = 20;
const PIPE_WIDTH = 3.5;
const PIPE_GAP = 90;
const PIPE_SPEED = 0.012;
const BACKGROUND_SPEED = 0.018;

const characters = [
  character("AbaLux"),
  character("AbaSkull", { down: "Charuld_DOWN.png", normal: "Charuld_NORMAL.jpeg" }),
  character("DokiDoki"),
  character("FAHH"),
  character("KKKow")
];

const tracks = {
  select: "/assets/audio/AllOfTheLights.mp3",
  gameplay: "/assets/audio/SayWalahi%20.mp3",
  winner: "/assets/audio/WazzupBeijing.mp3"
};

const peers = new Map();
const streams = new Map();
const pendingIceCandidates = new Map();

let roomCode = "";
let hostId = "";
let players = [];
let events;
let statusMessage = "Create a room to start.";
let screen = "select";
let activeSlot = 0;
let selections = [null, null];
let gameState = [];
let gameStartedAt = 0;
let animationFrame = 0;
let winner = null;
let soundtrack;
let movePopups = [];

const app = document.querySelector("#app");
document.addEventListener("pointerdown", startSelectionMusicFromGesture, { capture: true });
render();

function character(folder, overrides = {}) {
  return {
    id: folder,
    name: folder,
    up: `/assets/characters/${folder}/${overrides.up || `${folder}_UP.png`}`,
    down: `/assets/characters/${folder}/${overrides.down || `${folder}_DOWN.png`}`,
    normal: `/assets/characters/${folder}/${overrides.normal || `${folder}_NORMAL.jpeg`}`
  };
}

async function createRoom() {
  const response = await fetch("/api/rooms", { method: "POST" });
  const room = await response.json();

  roomCode = room.code;
  hostId = room.hostId;
  statusMessage = "Room created. Waiting for phones.";
  connectEvents();
  playTrack(tracks.select);
  render();
}

function connectEvents() {
  events?.close();
  events = new EventSource(`/api/events?role=host&code=${roomCode}&clientId=${hostId}`);

  events.addEventListener("room:state", (event) => {
    const state = JSON.parse(event.data);
    players = state.players;
    statusMessage = `${players.length}/2 phones connected.`;
    cleanupMissingPlayers();
    render();
  });

  events.addEventListener("player:input", (event) => {
    const input = JSON.parse(event.data);
    const slot = players.findIndex((player) => player.id === input.playerId);
    if (slot >= 0) applyMove(slot, input.action, input.intensity || 1);
  });

  events.addEventListener("signal", async (event) => {
    const signal = JSON.parse(event.data);

    if (signal.type === "offer") {
      await handleOffer(signal.playerId, signal.data);
    }

    if (signal.type === "ice-candidate") {
      const peer = getPeer(signal.playerId);
      await addIceCandidate(signal.playerId, peer, signal.data);
    }
  });
}

async function handleOffer(playerId, offer) {
  const peer = getPeer(playerId);
  await peer.setRemoteDescription(offer);
  await flushIceCandidates(playerId, peer);

  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  await sendSignal({
    type: "answer",
    to: "player",
    targetId: playerId,
    playerId,
    data: answer
  });
}

function getPeer(playerId) {
  const existing = peers.get(playerId);
  if (existing) return existing;

  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });

  peer.onicecandidate = (event) => {
    if (!event.candidate) return;
    sendSignal({
      type: "ice-candidate",
      to: "player",
      targetId: playerId,
      playerId,
      data: event.candidate.toJSON()
    });
  };

  peer.ontrack = (event) => {
    const [streamFromEvent] = event.streams;
    const stream = streamFromEvent || streams.get(playerId) || new MediaStream();

    if (!streamFromEvent) {
      stream.addTrack(event.track);
    }

    streams.set(playerId, stream);
    statusMessage = "Phone video stream received.";
    attachStreams();
    render();
  };

  peer.onconnectionstatechange = () => {
    statusMessage = `Connection changed: ${peer.connectionState}.`;
    if (screen !== "game") {
      render();
    }
  };

  peer.oniceconnectionstatechange = () => {
    statusMessage = `ICE state: ${peer.iceConnectionState}.`;
    if (screen !== "game") {
      render();
    }
  };

  peers.set(playerId, peer);
  return peer;
}

async function addIceCandidate(playerId, peer, candidate) {
  if (!peer.remoteDescription) {
    const pending = pendingIceCandidates.get(playerId) || [];
    pending.push(candidate);
    pendingIceCandidates.set(playerId, pending);
    return;
  }

  await peer.addIceCandidate(candidate);
}

async function flushIceCandidates(playerId, peer) {
  const pending = pendingIceCandidates.get(playerId) || [];
  pendingIceCandidates.delete(playerId);

  for (const candidate of pending) {
    await peer.addIceCandidate(candidate);
  }
}

async function sendSignal(payload) {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: roomCode, from: hostId, ...payload })
  });
}

function cleanupMissingPlayers() {
  const activeIds = new Set(players.map((player) => player.id));

  for (const [playerId, peer] of peers) {
    if (!activeIds.has(playerId)) {
      peer.close();
      peers.delete(playerId);
      streams.delete(playerId);
    }
  }
}

function selectCharacter(characterId) {
  const selected = characters.find((item) => item.id === characterId);
  if (!selected) return;

  selections[activeSlot] = selected;
  activeSlot = activeSlot === 0 ? 1 : 0;
  playTrack(tracks.select);

  if (selections.every(Boolean)) {
    startGame();
    return;
  }

  render();
}

function startGame() {
  cancelAnimationFrame(animationFrame);
  screen = "game";
  winner = null;
  gameStartedAt = performance.now();
  gameState = [0, 1].map((slot) => createPlayerState(slot));
  playTrack(tracks.gameplay);
  render();
  animationFrame = requestAnimationFrame(tick);
}

function createPlayerState(slot) {
  return {
    slot,
    y: 48,
    velocity: 0,
    score: 0,
    hits: 0,
    movePoints: 0,
    boostUntil: 0,
    backgroundX: 0,
    lastFrameAt: performance.now(),
    pipes: createPipes(),
    invulnerableUntil: 0
  };
}

function createPipes() {
  return [74, 116, 158].map((x, index) => ({
    x,
    gapY: 4 + ((index * 3 + Math.random() * 3) % 6),
    scored: false
  }));
}

function tick(now) {
  const elapsed = (now - gameStartedAt) / 1000;

  gameState.forEach((state) => updatePlayerState(state, now));
  renderGameFrame(Math.max(0, GAME_SECONDS - elapsed));

  if (elapsed >= GAME_SECONDS) {
    finishGame();
    return;
  }

  animationFrame = requestAnimationFrame(tick);
}

function updatePlayerState(state, now) {
  const delta = Math.min(34, now - state.lastFrameAt);
  state.lastFrameAt = now;
  state.velocity += GRAVITY * delta;
  state.y += state.velocity * delta;
  state.backgroundX = (state.backgroundX - BACKGROUND_SPEED * delta) % 100;

  if (state.y < 6) {
    state.y = 6;
    state.velocity = 0.04;
  }

  if (state.y > 86) {
    crash(state, now);
  }

  state.pipes.forEach((pipe) => {
    const speed = now < state.boostUntil ? PIPE_SPEED * 4.5 : PIPE_SPEED;
    pipe.x -= speed * delta;

    if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
      pipe.scored = true;
      state.score += 1;
    }

    if (pipe.x < -PIPE_WIDTH) {
      pipe.x = 112;
      pipe.gapY = 4 + Math.random() * 6;
      pipe.scored = false;
    }

    if (isCollision(state, pipe) && now > state.invulnerableUntil) {
      crash(state, now);
    }
  });
}

function isCollision(state, pipe) {
  const birdWidth = 22;
  const birdHeight = 40;
  const overlapsX = BIRD_X + birdWidth > pipe.x && BIRD_X < pipe.x + PIPE_WIDTH;
  const outsideGap = state.y < pipe.gapY || state.y + birdHeight > pipe.gapY + PIPE_GAP;
  return overlapsX && outsideGap;
}

function crash(state, now) {
  state.hits += 1;
  state.score = Math.max(0, state.score - 1);
  state.y = 48;
  state.velocity = JUMP_VELOCITY * 0.3;
  state.invulnerableUntil = now + 700;
}

function jump(slot) {
  if (screen !== "game") return;
  const state = gameState[slot];
  if (!state) return;
  state.velocity = JUMP_VELOCITY;
  renderGameFrame(Math.max(0, GAME_SECONDS - (performance.now() - gameStartedAt) / 1000));
}

function applyMove(slot, action, intensity) {
  if (screen !== "game") return;
  const state = gameState[slot];
  if (!state) return;
  if (action !== "dab") return;

  state.boostUntil = performance.now() + 2600 + intensity * 1200;
  state.score += 3;
  state.movePoints += 3;
  addMovePopup(slot, "DAB BOOST +3");

  renderGameFrame(Math.max(0, GAME_SECONDS - (performance.now() - gameStartedAt) / 1000));
}

function addMovePopup(slot, label) {
  movePopups.push({ slot, label, until: performance.now() + 900 });
}

function finishGame() {
  cancelAnimationFrame(animationFrame);
  winner = gameState
    .map((state) => ({ ...state, character: selections[state.slot], player: players[state.slot] }))
    .sort((a, b) => b.score - a.score || a.hits - b.hits)[0];
  screen = "winner";
  playTrack(tracks.winner);
  render();
}

function resetMatch() {
  screen = "select";
  activeSlot = 0;
  selections = [null, null];
  winner = null;
  cancelAnimationFrame(animationFrame);
  playTrack(tracks.select);
  render();
}

function playTrack(src) {
  if (!soundtrack) {
    soundtrack = new Audio();
    soundtrack.loop = true;
    soundtrack.volume = 0.78;
  }

  if (!soundtrack.src.endsWith(src)) {
    soundtrack.pause();
    soundtrack.src = src;
    soundtrack.currentTime = 0;
  }

  soundtrack.play().catch(() => {
    statusMessage = "Tap a button to enable music.";
  });
}

function startSelectionMusicFromGesture(event) {
  if (screen !== "select") return;
  if (!event.target.closest("button")) return;
  playTrack(tracks.select);
}

function render() {
  app.innerHTML = `
    <main class="shell screen-${screen}">
      ${screen === "select" ? renderSelectionScreen() : ""}
      ${screen === "game" ? renderGameScreen() : ""}
      ${screen === "winner" ? renderWinnerScreen() : ""}
    </main>
  `;

  bindEvents();
  attachStreams();
  if (screen === "game") {
    renderGameFrame(Math.max(0, GAME_SECONDS - (performance.now() - gameStartedAt) / 1000));
  }
}

function renderSelectionScreen() {
  return `
    <section class="select-layout">
      <header class="select-header">
        <div>
          <p class="eyebrow">Character selection</p>
          <h1>Choose your fighter</h1>
        </div>
        <div class="room-panel">
          <button id="create-room" class="primary" ${roomCode ? "disabled" : ""}>
            ${roomCode ? "Room active" : "Create room"}
          </button>
          <div>
            <span class="label">Join code</span>
            <strong class="code">${roomCode || "------"}</strong>
          </div>
          <p>${statusMessage}</p>
        </div>
      </header>

      <section class="selection-status">
        ${[0, 1].map(renderSelectedSlot).join("")}
      </section>

      <section class="camera-grid">
        ${[0, 1].map(renderCameraPreview).join("")}
      </section>

      <section class="fighter-grid">
        ${characters.map(renderCharacterCard).join("")}
      </section>
    </section>
  `;
}

function renderSelectedSlot(slot) {
  const selected = selections[slot];
  const player = players[slot];
  return `
    <button class="selection-slot ${activeSlot === slot ? "active" : ""}" data-slot="${slot}">
      <span>Player ${slot + 1}</span>
      <strong>${selected?.name || player?.name || "Pick character"}</strong>
    </button>
  `;
}

function renderCameraPreview(slot) {
  const player = players[slot];
  const hasStream = Boolean(player && streams.has(player.id));

  return `
    <div class="camera-preview">
      <video id="video-${slot}" ${player ? `data-player-id="${player.id}"` : ""} autoplay muted playsinline></video>
      <div class="empty ${hasStream ? "hidden" : ""}">
        ${player ? "Connecting camera..." : `Waiting for phone ${slot + 1}`}
      </div>
    </div>
  `;
}

function renderCharacterCard(item) {
  const pickedBy = selections.findIndex((selection) => selection?.id === item.id);
  return `
    <button class="fighter-card ${pickedBy >= 0 ? "picked" : ""}" data-character="${item.id}">
      <img src="${item.up}" alt="${item.name}" />
      <strong>${item.name}</strong>
      ${pickedBy >= 0 ? `<span>P${pickedBy + 1}</span>` : ""}
    </button>
  `;
}

function renderGameScreen() {
  return `
    <section class="match-layout">
      <header class="match-header">
        <div>
          <p class="eyebrow">Flappy birst duel</p>
          <h1 id="timer">${GAME_SECONDS.toFixed(1)}</h1>
        </div>
        <div class="score-strip">
          ${[0, 1].map((slot) => `<strong id="score-${slot}">P${slot + 1}: 0</strong>`).join("")}
        </div>
      </header>
      ${[0, 1].map(renderPlayerLane).join("")}
    </section>
  `;
}

function renderPlayerLane(slot) {
  const selected = selections[slot];
  const player = players[slot];
  const hasStream = Boolean(player && streams.has(player.id));
  return `
    <section class="player-lane">
      <div class="camera-panel">
        <video id="video-${slot}" ${player ? `data-player-id="${player.id}"` : ""} autoplay muted playsinline></video>
        <div class="empty ${hasStream ? "hidden" : ""}">
          ${player ? "Connecting camera..." : `Waiting for phone ${slot + 1}`}
        </div>
      </div>
      <button class="stage" id="stage-${slot}" data-jump="${slot}" aria-label="Player ${slot + 1} jump">
        <div class="pipes" id="pipes-${slot}"></div>
        <div class="move-popup" id="move-popup-${slot}"></div>
        <img class="bird" id="bird-${slot}" src="${selected.down}" alt="${selected.name}" />
        <div class="stage-name">${player?.name || `Player ${slot + 1}`} / ${selected.name}</div>
      </button>
    </section>
  `;
}

function renderWinnerScreen() {
  const character = winner?.character || selections[0];
  const playerName = winner?.player?.name || `Player ${(winner?.slot || 0) + 1}`;
  return `
    <section class="winner-layout">
      <p class="eyebrow">Winner</p>
      <h1>${playerName}</h1>
      <img class="winner-character" src="${character.normal}" alt="${character.name}" />
      <strong>${character.name}</strong>
      <p class="winner-score">Score ${winner?.score || 0} · Hits ${winner?.hits || 0}</p>
      <button id="reset-match" class="primary">Run it back</button>
    </section>
  `;
}

function bindEvents() {
  document.querySelector("#create-room")?.addEventListener("click", createRoom);
  document.querySelector("#reset-match")?.addEventListener("click", resetMatch);

  document.querySelectorAll("[data-slot]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSlot = Number(button.dataset.slot);
      render();
    });
  });

  document.querySelectorAll("[data-character]").forEach((button) => {
    button.addEventListener("click", () => selectCharacter(button.dataset.character));
  });

  document.querySelectorAll("[data-jump]").forEach((button) => {
    button.addEventListener("pointerdown", () => jump(Number(button.dataset.jump)));
  });
}

function renderGameFrame(timeLeft) {
  const timer = document.querySelector("#timer");
  if (timer) timer.textContent = timeLeft.toFixed(1);

  gameState.forEach((state) => {
    const score = document.querySelector(`#score-${state.slot}`);
    const bird = document.querySelector(`#bird-${state.slot}`);
    const pipes = document.querySelector(`#pipes-${state.slot}`);
    const stage = document.querySelector(`#stage-${state.slot}`);
    const popup = document.querySelector(`#move-popup-${state.slot}`);
    const selected = selections[state.slot];
    const now = performance.now();

    if (score) score.textContent = `P${state.slot + 1}: ${state.score} / DAB ${state.movePoints}`;
    if (stage) stage.style.setProperty("--background-x", `${state.backgroundX}%`);
    if (bird) {
      bird.style.setProperty("--bird-y", `${state.y}%`);
      bird.src = state.velocity < 0 ? selected.up : selected.down;
      bird.classList.toggle("hit", now < state.invulnerableUntil);
    }
    if (pipes) pipes.innerHTML = state.pipes.map(renderPipe).join("");
    if (popup) {
      const activePopup = movePopups.find((item) => item.slot === state.slot && item.until > now);
      popup.textContent = activePopup?.label || "";
      popup.classList.toggle("visible", Boolean(activePopup));
    }
  });
  movePopups = movePopups.filter((item) => item.until > performance.now());
}

function renderPipe(pipe) {
  return `
    <div class="pipe top" style="left:${pipe.x}%; width:${PIPE_WIDTH}%; height:${pipe.gapY}%"></div>
    <div class="pipe bottom" style="left:${pipe.x}%; width:${PIPE_WIDTH}%; top:${pipe.gapY + PIPE_GAP}%"></div>
  `;
}

function attachStreams() {
  players.forEach((player, index) => {
    const video = document.querySelector(`#video-${index}`);
    const stream = streams.get(player.id);

    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {
        statusMessage = "Click the host screen to allow video playback.";
      });
    }
  });
}
