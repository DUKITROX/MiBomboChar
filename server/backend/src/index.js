import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT || 3000);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const certPath = process.env.HTTPS_CERT || path.join(root, "certs/dev-cert.pem");
const keyPath = process.env.HTTPS_KEY || path.join(root, "certs/dev-key.pem");

const rooms = new Map();
const clients = new Map();

const serverOptions =
  fs.existsSync(certPath) && fs.existsSync(keyPath)
    ? {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    : null;

const server = serverOptions
  ? https.createServer(serverOptions, safeHandleRequest)
  : http.createServer(safeHandleRequest);

server.listen(port, "0.0.0.0", () => {
  const protocol = serverOptions ? "https" : "http";
  console.log(`MiBomboChar server running at ${protocol}://localhost:${port}`);
  console.log(`Host screen: ${protocol}://localhost:${port}/host`);
  console.log(`Phone client: ${protocol}://localhost:${port}/client`);
});

async function safeHandleRequest(request, response) {
  try {
    await handleRequest(request, response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      sendJson(response, 500, { message: "Server error." });
    } else {
      response.end();
    }
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url || "/", getBaseUrl(request));

  if (isReadRequest(request) && url.pathname === "/") {
    redirect(response, "/host");
    return;
  }

  if (isReadRequest(request) && url.pathname === "/host") {
    await serveFile(response, path.join(root, "server/frontend/index.html"));
    return;
  }

  if (isReadRequest(request) && url.pathname === "/client") {
    await serveFile(response, path.join(root, "client/index.html"));
    return;
  }

  if (isReadRequest(request) && url.pathname === "/host/app.js") {
    await serveFile(response, path.join(root, "server/frontend/src/app.js"));
    return;
  }

  if (isReadRequest(request) && url.pathname === "/host/styles.css") {
    await serveFile(response, path.join(root, "server/frontend/src/styles.css"));
    return;
  }

  if (isReadRequest(request) && url.pathname === "/client/app.js") {
    await serveFile(response, path.join(root, "client/src/app.js"));
    return;
  }

  if (isReadRequest(request) && url.pathname === "/client/styles.css") {
    await serveFile(response, path.join(root, "client/src/styles.css"));
    return;
  }

  if (isReadRequest(request) && url.pathname.startsWith("/assets/")) {
    await serveAsset(response, url.pathname);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    openEvents(url, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    createRoom(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/players") {
    const body = await readJson(request);
    joinRoom(response, body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/signal") {
    const body = await readJson(request);
    relaySignal(response, body);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/input") {
    const body = await readJson(request);
    relayPlayerInput(response, body);
    return;
  }

  sendJson(response, 404, { message: "Not found." });
}

function createRoom(response) {
  const code = createRoomCode();
  const hostId = randomUUID();

  rooms.set(code, {
    code,
    hostId,
    players: new Map()
  });

  sendJson(response, 201, { code, hostId });
}

function joinRoom(response, body) {
  const code = normalizeCode(body.code);
  const room = rooms.get(code);

  if (!room) {
    sendJson(response, 404, { message: "Room not found." });
    return;
  }

  if (room.players.size >= 2) {
    sendJson(response, 409, { message: "Room is full." });
    return;
  }

  const player = {
    id: randomUUID(),
    name: String(body.playerName || "").trim(),
    connected: true
  };

  room.players.set(player.id, player);
  emitRoomState(room);
  sendJson(response, 201, { code, playerId: player.id });
}

function openEvents(url, response) {
  const code = normalizeCode(url.searchParams.get("code") || "");
  const clientId = url.searchParams.get("clientId") || "";
  const role = url.searchParams.get("role") || "";
  const room = rooms.get(code);

  if (!room || !clientId || !["host", "player"].includes(role)) {
    sendJson(response, 400, { message: "Invalid event stream." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  response.write("event: connected\n");
  response.write(`data: ${JSON.stringify({ code, clientId, role })}\n\n`);

  clients.set(clientId, { response, code, role });

  if (role === "host") {
    emitRoomState(room);
  }

  requestKeepAlive(response);

  response.on("close", () => {
    clients.delete(clientId);
    const currentRoom = rooms.get(code);
    if (!currentRoom) return;

    if (role === "host") {
      for (const player of currentRoom.players.values()) {
        sendEvent(player.id, "room:error", { message: "Host disconnected." });
      }
      rooms.delete(code);
      return;
    }

    currentRoom.players.delete(clientId);
    emitRoomState(currentRoom);
  });
}

function relaySignal(response, body) {
  const code = normalizeCode(body.code);
  const room = rooms.get(code);
  if (!room) {
    sendJson(response, 404, { message: "Room not found." });
    return;
  }

  const targetId = body.targetId || (body.to === "host" ? room.hostId : body.playerId);
  if (!targetId) {
    sendJson(response, 400, { message: "Missing signal target." });
    return;
  }

  sendEvent(targetId, "signal", {
    type: body.type,
    code,
    playerId: body.playerId,
    from: body.from,
    data: body.data
  });

  sendJson(response, 200, { ok: true });
}

function relayPlayerInput(response, body) {
  const code = normalizeCode(body.code);
  const room = rooms.get(code);
  const playerId = String(body.playerId || "");
  const action = String(body.action || "dab");
  const intensity = Number(body.intensity || 1);

  if (!room) {
    sendJson(response, 404, { message: "Room not found." });
    return;
  }

  if (!room.players.has(playerId)) {
    sendJson(response, 403, { message: "Player is not in this room." });
    return;
  }

  console.log(
    `[move] room=${code} player=${playerId.slice(0, 8)} action=${action} intensity=${intensity.toFixed(2)}`
  );

  sendEvent(room.hostId, "player:input", {
    code,
    playerId,
    action,
    intensity
  });

  sendJson(response, 200, { ok: true });
}

function emitRoomState(room) {
  sendEvent(room.hostId, "room:state", {
    code: room.code,
    players: Array.from(room.players.values())
  });
}

function sendEvent(clientId, event, payload) {
  const client = clients.get(clientId);
  if (!client) return;

  client.response.write(`event: ${event}\n`);
  client.response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function requestKeepAlive(response) {
  const interval = setInterval(() => {
    if (response.destroyed) {
      clearInterval(interval);
      return;
    }

    response.write("event: ping\n");
    response.write("data: {}\n\n");
  }, 15000);
}

function createRoomCode() {
  let code = "";
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));

  return code;
}

async function serveFile(response, filePath) {
  try {
    const content = await fs.promises.readFile(filePath);
    response.writeHead(200, { "Content-Type": getContentType(filePath) });
    response.end(content);
  } catch {
    sendJson(response, 404, { message: "File not found." });
  }
}

async function serveAsset(response, pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath.replace(/^\/assets\//, "");
  const assetRoot = path.join(root, "assets");
  const filePath = path.resolve(assetRoot, relativePath);

  if (!filePath.startsWith(`${assetRoot}${path.sep}`)) {
    sendJson(response, 403, { message: "Forbidden." });
    return;
  }

  await serveFile(response, filePath);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function getBaseUrl(request) {
  const protocol = serverOptions ? "https" : "http";
  return `${protocol}://${request.headers.host || "localhost"}`;
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}

function isReadRequest(request) {
  return request.method === "GET" || request.method === "HEAD";
}
