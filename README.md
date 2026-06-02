# MiBomboChar

Hackathon MVP for a 2-player game controlled by body movements.

## Repository layout

| Path | Role |
| --- | --- |
| [`computer-vision/`](computer-vision/) | Webcam + pose detection; publishes movement events over WebSocket |
| [`client/`](client/) | Phone-facing player app for joining games and sharing camera input |
| [`server/backend/`](server/backend/) | Host-side service for rooms, join codes, realtime messaging, and game state |
| [`server/frontend/`](server/frontend/) | Laptop-facing host screen for lobby, race display, and player status |

The computer-vision service is the first implemented module; other areas are scaffolded for the hackathon monorepo.

## Quick start

```bash
cd computer-vision
uv venv ../.venv
uv pip install --python ../.venv/bin/python -r requirements.txt
```

Terminal 1 — movement detector:

```bash
cd computer-vision
../.venv/bin/python run.py --preview
```

Terminal 2 — test client:

```bash
cd computer-vision
../.venv/bin/python ws_client.py
```

See [computer-vision/README.md](computer-vision/README.md) for setup details, run modes, and movement descriptions.

## Integration contract (game platform)

**Endpoint:** `ws://127.0.0.1:8765` (configurable via `--host` / `--port` on the detector)

**Transport:** Server pushes JSON text messages; clients listen only (no messages required from client).

**Payload:**

```json
{
  "movement": "flight",
  "speed": 0.42,
  "confidence": 0.81,
  "timestamp_ms": 1717353600123
}
```

| Field | Meaning |
| --- | --- |
| `movement` | One of `flight`, `dab`, `whoa_raise` |
| `speed` | Normalized 0–1 intensity from body-part motion |
| `confidence` | Heuristic score for the detected pose pattern |
| `timestamp_ms` | Unix epoch milliseconds when the movement was recognized |

**Semantics:**

- One event per recognized movement burst
- 400 ms cooldown per movement type by default (`--cooldown-ms`; reduces duplicate spam)
- MVP tracks the largest person in frame

**Reference consumer:** [computer-vision/ws_client.py](computer-vision/ws_client.py)

## Links

- [computer-vision/README.md](computer-vision/README.md) — setup, run modes, movements
- [computer-vision/CONTEXT.md](computer-vision/CONTEXT.md) — domain glossary
