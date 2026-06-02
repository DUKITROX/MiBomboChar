# Client

Phone-facing player app.

Players will use this app to enter a game code, connect to the host, grant camera access, and send camera or camera-derived input for controlling the race.

## MVP Behavior

- Enter the host room code.
- Grant camera permission.
- Preview the local phone camera full-screen.
- Stream the camera to the laptop host screen with WebRTC.
- Reserve a small overlay for future move icons and prompts.

Run with:

```sh
npm run dev
```

Then open `/client`.
