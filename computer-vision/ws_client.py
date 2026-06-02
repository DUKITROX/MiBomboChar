#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import sys

import websockets

VALID_MOVEMENTS = frozenset({"flight", "dab", "whoa_raise"})
REQUIRED_KEYS = frozenset({"movement", "speed", "confidence", "timestamp_ms"})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MiBomboChar WebSocket movement event listener")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--json", action="store_true", help="Print raw JSON lines")
    return parser


def _validate_event(payload: dict) -> None:
    missing = REQUIRED_KEYS - payload.keys()
    if missing:
        raise ValueError(f"missing keys: {', '.join(sorted(missing))}")

    movement = payload["movement"]
    if movement not in VALID_MOVEMENTS:
        print(f"warning: unknown movement '{movement}'", file=sys.stderr)


def _format_event(payload: dict) -> str:
    return (
        f"{payload['movement']}  "
        f"speed={payload['speed']}  "
        f"conf={payload['confidence']}  "
        f"ts={payload['timestamp_ms']}"
    )


async def listen(host: str, port: int, json_output: bool) -> None:
    uri = f"ws://{host}:{port}/"
    async with websockets.connect(uri) as websocket:
        print(f"connected to {uri}", file=sys.stderr)
        async for message in websocket:
            payload = json.loads(message)
            _validate_event(payload)
            if json_output:
                print(json.dumps(payload), flush=True)
            else:
                print(_format_event(payload), flush=True)


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        asyncio.run(listen(args.host, args.port, args.json))
    except KeyboardInterrupt:
        return 0
    except ConnectionRefusedError:
        print(
            f"error: could not connect to ws://{args.host}:{args.port}/ "
            "(is the detector running?)",
            file=sys.stderr,
        )
        return 1
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
