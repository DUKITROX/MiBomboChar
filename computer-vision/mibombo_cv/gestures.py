from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Iterable

import numpy as np

from mibombo_cv.types import MovementEvent, MovementName

# COCO pose indices used by LibreYOLO pose models.
NOSE = 0
L_SHOULDER, R_SHOULDER = 5, 6
L_ELBOW, R_ELBOW = 7, 8
L_WRIST, R_WRIST = 9, 10
L_HIP, R_HIP = 11, 12


@dataclass
class PoseFrame:
    keypoints: np.ndarray  # shape (17, 2)
    visible: np.ndarray  # shape (17,) bool
    frame_height: int
    frame_width: int
    timestamp_ms: int


@dataclass
class GestureCandidate:
    movement: MovementName
    speed: float
    confidence: float


def _visible(points: Iterable[int], frame: PoseFrame) -> bool:
    return all(frame.visible[i] for i in points)


def _norm_dist(a: np.ndarray, b: np.ndarray, frame: PoseFrame) -> float:
    diagonal = (frame.frame_width**2 + frame.frame_height**2) ** 0.5
    return float(np.linalg.norm(a - b) / max(diagonal, 1.0))


def _clamp_dt_ms(dt_ms: float) -> float:
    # Pose updates can bunch up or jitter; avoid tiny dt blowing up velocity.
    return max(25.0, min(dt_ms, 120.0))


def _norm_speed(
    dy_pixels: float,
    frame: PoseFrame,
    *,
    dt_ms: float | None = None,
    ref_height_fraction: float = 1.8,
) -> float:
    """Unbounded ratio: 1.0 ≈ moving ref_height_fraction × frame height per second."""
    if dt_ms is not None and dt_ms > 0:
        dt_s = _clamp_dt_ms(dt_ms) / 1000.0
        pixels_per_sec = abs(dy_pixels) / dt_s
        ref_pps = frame.frame_height * ref_height_fraction
        return pixels_per_sec / max(ref_pps, 1.0)
    return abs(dy_pixels) / max(frame.frame_height * 0.08, 1.0)


def _flight_speed(raw: float) -> float:
    """Map raw flap velocity to 0–1 without saturating typical motion at 1.0."""
    low, high = 0.10, 0.90
    if raw <= low:
        return 0.0
    return min(1.0, (raw - low) / (high - low))


class MovementRecognizer:
    """Heuristic movement classifier over a short pose history."""

    def __init__(self, history_size: int = 12, cooldown_ms: int = 400):
        self._history: deque[PoseFrame] = deque(maxlen=history_size)
        self._cooldown_ms = cooldown_ms
        self._last_emitted: dict[MovementName, int] = {}

    def update(self, frame: PoseFrame) -> GestureCandidate | None:
        self._history.append(frame)
        if len(self._history) < 4:
            return None

        # whoa_raise, six_seven disabled for now — re-add detectors to enable
        for detector in (self._detect_dab, self._detect_flight):
            candidate = detector(frame)
            if candidate and self._should_emit(candidate.movement, frame.timestamp_ms):
                self._last_emitted[candidate.movement] = frame.timestamp_ms
                return candidate
        return None

    def _should_emit(self, movement: MovementName, timestamp_ms: int) -> bool:
        last = self._last_emitted.get(movement)
        return last is None or timestamp_ms - last >= self._cooldown_ms

    def _recent_sync_wrist_speed(self, frame: PoseFrame, *, window: int = 5) -> float:
        """Peak synchronized wrist velocity over the last few frames of the current flap."""
        peak_raw = 0.0
        recent = list(self._history)[-window:]
        for idx in range(1, len(recent)):
            curr = recent[idx]
            prev = recent[idx - 1]
            if not _visible((L_WRIST, R_WRIST), curr) or not _visible((L_WRIST, R_WRIST), prev):
                continue

            dt_ms = float(curr.timestamp_ms - prev.timestamp_ms)
            if dt_ms <= 0:
                continue

            left_dy = curr.keypoints[L_WRIST][1] - prev.keypoints[L_WRIST][1]
            right_dy = curr.keypoints[R_WRIST][1] - prev.keypoints[R_WRIST][1]
            if left_dy * right_dy <= 0:
                continue

            magnitude = (abs(left_dy) + abs(right_dy)) / 2
            peak_raw = max(peak_raw, _norm_speed(magnitude, frame, dt_ms=dt_ms))
        return _flight_speed(peak_raw)

    def _detect_dab(self, frame: PoseFrame) -> GestureCandidate | None:
        required = (NOSE, L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST)
        if not _visible(required, frame):
            return None

        kp = frame.keypoints
        left_up = kp[L_WRIST][1] < kp[L_SHOULDER][1] - 20
        right_up = kp[R_WRIST][1] < kp[R_SHOULDER][1] - 20
        if left_up == right_up:
            return None

        raised_wrist = L_WRIST if left_up else R_WRIST
        tucked_elbow = R_ELBOW if left_up else L_ELBOW
        head_to_elbow = _norm_dist(kp[NOSE], kp[tucked_elbow], frame)
        arm_extension = _norm_dist(kp[raised_wrist], kp[NOSE], frame)

        if head_to_elbow > 0.12 or arm_extension < 0.08:
            return None

        confidence = min(1.0, (0.12 - head_to_elbow) * 8 + arm_extension * 2)
        return GestureCandidate("dab", speed=0.35, confidence=confidence)

    def _detect_flight(self, frame: PoseFrame) -> GestureCandidate | None:
        required = (L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST)
        if not _visible(required, frame):
            return None

        kp = frame.keypoints
        span = _norm_dist(kp[L_WRIST], kp[R_WRIST], frame)
        if span < 0.18:
            return None

        wrists_near_shoulder_line = (
            abs(kp[L_WRIST][1] - kp[L_SHOULDER][1]) < frame.frame_height * 0.12
            and abs(kp[R_WRIST][1] - kp[R_SHOULDER][1]) < frame.frame_height * 0.12
        )
        if not wrists_near_shoulder_line:
            return None

        prev = self._history[-2]
        if not _visible((L_WRIST, R_WRIST), prev):
            return None

        left_dy = kp[L_WRIST][1] - prev.keypoints[L_WRIST][1]
        right_dy = kp[R_WRIST][1] - prev.keypoints[R_WRIST][1]
        synchronized = left_dy * right_dy > 0
        magnitude = (abs(left_dy) + abs(right_dy)) / 2
        if not synchronized or magnitude < frame.frame_height * 0.015:
            return None

        speed = self._recent_sync_wrist_speed(frame)
        confidence = min(1.0, span * 2 + speed)
        return GestureCandidate("flight", speed=speed, confidence=confidence)

    # def _detect_six_seven(self, frame: PoseFrame) -> GestureCandidate | None:
    #     """Front chest pump (6-7 balance) — disabled for now."""
    #     ...

    # def _detect_whoa_raise(self, frame: PoseFrame) -> GestureCandidate | None:
    #     """Toss upward from chest then catch — disabled for now."""
    #     required = (L_WRIST, R_WRIST, L_SHOULDER, R_SHOULDER, L_HIP, R_HIP)
    #     if not _visible(required, frame):
    #         return None
    #
    #     kp = frame.keypoints
    #     chest_y = (kp[L_SHOULDER][1] + kp[R_SHOULDER][1] + kp[L_HIP][1] + kp[R_HIP][1]) / 4
    #
    #     recent = list(self._history)[-6:]
    #     if len(recent) < 6:
    #         return None
    #
    #     wrist_ys = []
    #     for item in recent:
    #         if not _visible((L_WRIST, R_WRIST), item):
    #             return None
    #         wrist_ys.append((item.keypoints[L_WRIST][1] + item.keypoints[R_WRIST][1]) / 2)
    #
    #     toss_idx = None
    #     peak_speed = 0.0
    #     for idx in range(1, len(wrist_ys) - 2):
    #         dy = wrist_ys[idx] - wrist_ys[idx - 1]
    #         if dy < -frame.frame_height * 0.02:
    #             toss_idx = idx
    #             dt_ms = float(recent[idx].timestamp_ms - recent[idx - 1].timestamp_ms)
    #             raw = _norm_speed(dy, frame, dt_ms=dt_ms, ref_height_fraction=2.2)
    #             peak_speed = max(peak_speed, _flight_speed(raw))
    #
    #     if toss_idx is None:
    #         return None
    #
    #     started_low = wrist_ys[0] > chest_y - frame.frame_height * 0.05
    #     peaked_high = min(wrist_ys[toss_idx : toss_idx + 2]) < chest_y - frame.frame_height * 0.08
    #     catching = wrist_ys[-1] > wrist_ys[-2] > wrist_ys[-3]
    #
    #     if not (started_low and peaked_high and catching):
    #         return None
    #
    #     confidence = min(1.0, peak_speed * 1.2 + 0.25)
    #     return GestureCandidate("whoa_raise", speed=peak_speed, confidence=confidence)


def to_movement_event(candidate: GestureCandidate, timestamp_ms: int) -> MovementEvent:
    return MovementEvent(
        movement=candidate.movement,
        speed=float(candidate.speed),
        confidence=float(candidate.confidence),
        timestamp_ms=timestamp_ms,
    )
