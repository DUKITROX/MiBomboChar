let roomCode = "";
let playerId = "";
let events;
let stream;
let peer;
let statusMessage = "Enter the host code.";
let isStreaming = false;
let lastJumpAt = 0;

const app = document.querySelector("#app");
render();

async function handleJoin(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const code = String(form.get("code") || "").trim();
  const playerName = String(form.get("name") || "").trim();

  if (!code) {
    statusMessage = "Enter a room code.";
    render();
    return;
  }

  statusMessage = "Joining room...";
  render();

  const response = await fetch("/api/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, playerName })
  });
  const result = await response.json();

  if (!response.ok) {
    statusMessage = result.message || "Could not join room.";
    render();
    return;
  }

  roomCode = result.code;
  playerId = result.playerId;
  connectEvents();
  await startCameraAndOffer();
}

function connectEvents() {
  events?.close();
  events = new EventSource(`/api/events?role=player&code=${roomCode}&clientId=${playerId}`);

  events.addEventListener("room:error", (event) => {
    const payload = JSON.parse(event.data);
    statusMessage = payload.message;
    render();
  });

  events.addEventListener("signal", async (event) => {
    const signal = JSON.parse(event.data);

    if (signal.type === "answer") {
      await peer?.setRemoteDescription(signal.data);
      statusMessage = "Camera is streaming to the host.";
      isStreaming = true;
      render();
    }

    if (signal.type === "ice-candidate") {
      await peer?.addIceCandidate(signal.data);
    }
  });
}

async function startCameraAndOffer() {
  try {
    statusMessage = "Requesting camera permission...";
    render();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 720 },
        height: { ideal: 1280 }
      }
    });

    attachPreview();

    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendSignal({
        type: "ice-candidate",
        to: "host",
        playerId,
        data: event.candidate.toJSON()
      });
    };

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    await sendSignal({
      type: "offer",
      to: "host",
      playerId,
      data: offer
    });

    statusMessage = "Connecting video to host...";
    render();
  } catch (error) {
    statusMessage = error instanceof Error ? error.message : "Camera setup failed.";
    render();
  }
}

async function sendSignal(payload) {
  await fetch("/api/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: roomCode, from: playerId, ...payload })
  });
}

async function sendJump() {
  if (!isStreaming || !roomCode || !playerId) return;

  const now = performance.now();
  if (now - lastJumpAt < 120) return;
  lastJumpAt = now;

  await fetch("/api/input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: roomCode, playerId, action: "jump" })
  });
}

function render() {
  app.innerHTML = `
    <main class="phone-shell" id="phone-shell">
      <video id="preview" autoplay muted playsinline></video>

      <section class="join-panel ${isStreaming ? "compact" : ""}">
        <p class="eyebrow">Player camera</p>
        <h1>${isStreaming ? "Live" : "Join race"}</h1>
        <form id="join-form" class="${isStreaming ? "hidden" : ""}">
          <input
            autocomplete="one-time-code"
            inputmode="numeric"
            maxlength="6"
            name="code"
            placeholder="Room code"
            required
          />
          <input maxlength="18" name="name" placeholder="Name" />
          <button type="submit">Start camera</button>
        </form>
        <p class="status">${statusMessage}</p>
      </section>

      <section class="icon-layer" aria-label="move prompts">
        <span class="move move-jump">J</span>
      </section>
    </main>
  `;

  document.querySelector("#join-form")?.addEventListener("submit", handleJoin);
  document.querySelector("#phone-shell")?.addEventListener("pointerdown", (event) => {
    if (event.target.closest("form")) return;
    sendJump();
  });
  attachPreview();
}

function attachPreview() {
  const video = document.querySelector("#preview");
  if (video && stream && video.srcObject !== stream) {
    video.srcObject = stream;
  }
}
