# Server

Laptop-side host application.

The server area is split into:

- `backend/`: game rooms, join codes, realtime connections, signaling, game state, and race events.
- `frontend/`: host screen UI for lobby, player readiness, race display, and results.

For the first MVP, `backend` relays WebRTC signaling and `frontend` displays up to two live phone camera streams.
