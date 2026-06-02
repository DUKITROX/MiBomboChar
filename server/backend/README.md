# Server Backend

Host-side service layer.

This area will manage game sessions, join codes, realtime messaging, player state, signaling, race state, scoring, and move events.

## MVP Behavior

- Creates six-digit room codes.
- Allows up to two phone players per room.
- Tracks player join and disconnect state.
- Relays WebRTC offers, answers, and ICE candidates between phones and the host screen.
- Does not receive or forward raw video frames.

Run with:

```sh
npm run dev
```
