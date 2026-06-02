# MiBomboChar

Hackathon MVP for a 2-player game controlled by body movements.

## computer-vision

Real-time movement detection from webcam using [LibreYOLO](https://github.com/LibreYOLO/libreyolo) pose estimation.

### Movements detected

| Movement | Description |
| --- | --- |
| `flight` | Arms spread wide, flapping like a bird |
| `dab` | Meme dab pose (assumed for "dub") |
| `whoa_raise` | Toss upward then catch (whoa motion) |
| `hands_up` | Both arms raised above shoulders (celebrate / charge) |

Each detection emits a **movement event**:

```json
{
  "movement": "flight",
  "speed": 0.42,
  "confidence": 0.81,
  "timestamp_ms": 1717353600123
}
```

- **speed**: normalized 0–1 intensity from body-part motion
- **confidence**: heuristic score for the detected pose pattern

### Setup

```bash
cd computer-vision
uv venv ../.venv
uv pip install --python ../.venv/bin/python -r requirements.txt
```

Dependencies pin **CPU-only** PyTorch (no GPU required for the hackathon demo).

### Run

WebSocket server (default, for the game platform):

```bash
../.venv/bin/python run.py --preview
# connects at ws://127.0.0.1:8765
```

**Performance (CPU laptops):** pose runs every 2 frames at 480px width by default. If preview still lags, try:

```bash
../.venv/bin/python run.py --preview --infer-every 3 --infer-width 384
```

Stdout-only mode:

```bash
../.venv/bin/python run.py --mode stdout
```

### Test the WebSocket feed

Do **not** open `http://127.0.0.1:8765` in a browser tab — that sends plain HTTP, not a WebSocket handshake (`invalid Connection header: keep-alive`). Use the test client:

```bash
# Terminal 1 — detector
../.venv/bin/python run.py --preview

# Terminal 2 — client
../.venv/bin/python ws_client.py
```

Options: `--host`, `--port`, `--json` (raw JSON lines). The client validates payload shape and prints movement events.

If you see `address already in use`, another detector is still running. Stop it or use another port:

```bash
../.venv/bin/python run.py --port 8766
../.venv/bin/python ws_client.py --port 8766
```

### Integration contract

- Transport: WebSocket JSON lines
- One event per recognized movement burst (400 ms cooldown per movement type by default; tune with `--cooldown-ms`)
- MVP tracks the largest person in frame

See [CONTEXT.md](./CONTEXT.md) for domain terms.
