# MiBomboChar

Two-player camera-controlled racing game prototype.

The project is organized as a monorepo with separate areas for the phone client, laptop host server, and computer vision work.

## Structure

- `computer-vision/`: gesture, pose, and movement detection experiments.
- `client/`: phone-facing player app for joining games and sharing camera input.
- `server/backend/`: host-side service for rooms, join codes, realtime messaging, and game state.
- `server/frontend/`: laptop-facing host screen for lobby, race display, and player status.

## Mobile Streaming MVP

The current app lets a laptop host create a room code and up to two phones join that room from a browser. Phone camera streams are sent to the host screen with WebRTC. The backend only handles room state and WebRTC signaling.

## Local Development

No external npm packages are required for the current MVP. Run the server:

```sh
npm run dev
```

Default URLs:

- Host screen: `http://localhost:3000/host`
- Phone client: `http://localhost:3000/client`
- Signaling backend: same server, under `/api`

For real phones on the same Wi-Fi, open the client with the laptop LAN IP, for example `https://192.168.1.20:3000/client`. Browser camera access requires a secure context, so phones need HTTPS. The server will use `certs/dev-cert.pem` and `certs/dev-key.pem` when those files exist, or the paths in `HTTPS_CERT` and `HTTPS_KEY`. Without cert files, the app runs over HTTP and camera access is only reliable on `localhost`.
