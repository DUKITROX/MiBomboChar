from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Set

import cv2
import websockets

from mibombo_cv.detector import DetectorConfig, MovementDetector, _configure_capture


async def _broadcast(clients: Set, payload: dict) -> None:
    if not clients:
        return
    message = json.dumps(payload)
    await asyncio.gather(*(client.send(message) for client in list(clients)), return_exceptions=True)


async def run_server(host: str, port: int, detector: MovementDetector) -> None:
    clients: Set = set()

    async def handler(websocket):
        clients.add(websocket)
        try:
            await websocket.wait_closed()
        finally:
            clients.discard(websocket)

    loop = asyncio.get_running_loop()

    async with websockets.serve(handler, host, port):
        cap = cv2.VideoCapture(detector.config.camera_index, cv2.CAP_V4L2)
        if not cap.isOpened():
            cap = cv2.VideoCapture(detector.config.camera_index)
        if not cap.isOpened():
            raise RuntimeError(
                f"Could not open camera index {detector.config.camera_index}. "
                "Another app (or a previous run.py) may be using the webcam — "
                "run: fuser /dev/video0  then kill that PID, or close Cheese/Zoom/browser camera."
            )

        _configure_capture(cap, detector.config)

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    await asyncio.sleep(0.05)
                    continue

                if detector.config.show_preview:
                    cv2.imshow("mibombo-cv", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

                if not detector.should_infer():
                    await asyncio.sleep(0)
                    continue

                ts = int(time.time() * 1000)
                event = await loop.run_in_executor(
                    detector._executor,
                    detector.process_frame,
                    frame,
                    ts,
                )
                if event is not None:
                    payload = event.to_dict()
                    print(json.dumps(payload), flush=True)
                    await _broadcast(clients, payload)

                await asyncio.sleep(0)
        finally:
            cap.release()
            if detector.config.show_preview:
                cv2.destroyAllWindows()
            detector.shutdown()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MiBomboChar movement detector")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--model", default="LibreYOLONASs-pose.pt")
    parser.add_argument("--conf", type=float, default=0.35)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument(
        "--infer-every",
        type=int,
        default=2,
        help="Run pose model every N frames (default 2). Higher = faster, less responsive.",
    )
    parser.add_argument(
        "--infer-width",
        type=int,
        default=480,
        help="Max frame width for pose inference (default 480).",
    )
    parser.add_argument(
        "--cooldown-ms",
        type=int,
        default=400,
        help="Min milliseconds between events of the same movement type (default 400).",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--mode",
        choices=("websocket", "stdout"),
        default="websocket",
        help="websocket publishes JSON events; stdout prints one JSON line per movement",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    config = DetectorConfig(
        model_name=args.model,
        camera_index=args.camera,
        confidence=args.conf,
        show_preview=args.preview,
        infer_every=max(1, args.infer_every),
        infer_width=max(160, args.infer_width),
        cooldown_ms=max(0, args.cooldown_ms),
    )
    detector = MovementDetector(config)

    if args.mode == "stdout":
        detector.run_camera()
        return 0

    asyncio.run(run_server(args.host, args.port, detector))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
