# MiBomboChar

Two-player camera-controlled racing game prototype.

The project is organized as a monorepo with separate areas for the phone client, laptop host server, and computer vision work.

## Structure

- `computer-vision/`: gesture, pose, and movement detection experiments.
- `client/`: phone-facing player app for joining games and sharing camera input.
- `server/backend/`: host-side service for rooms, join codes, realtime messaging, and game state.
- `server/frontend/`: laptop-facing host screen for lobby, race display, and player status.

