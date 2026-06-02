from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import cv2
import numpy as np

from libreyolo import LibreYOLO

from mibombo_cv.gestures import MovementRecognizer, PoseFrame, to_movement_event
from mibombo_cv.types import MovementEvent


@dataclass
class DetectorConfig:
    model_name: str = "LibreYOLONASs-pose.pt"
    camera_index: int = 0
    confidence: float = 0.35
    show_preview: bool = False
    # Run pose model every N captured frames (1 = every frame).
    infer_every: int = 2
    # Max width sent to the model; keypoints are scaled back to full frame size.
    infer_width: int = 480
    capture_width: int = 640
    capture_height: int = 480
    # Min ms between events of the same movement type.
    cooldown_ms: int = 400


def _configure_capture(cap: cv2.VideoCapture, config: DetectorConfig) -> None:
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if config.capture_width > 0:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.capture_width)
    if config.capture_height > 0:
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.capture_height)


def _resize_for_infer(frame_bgr: np.ndarray, infer_width: int) -> tuple[np.ndarray, float, float]:
    height, width = frame_bgr.shape[:2]
    if width <= infer_width:
        return frame_bgr, 1.0, 1.0
    scale = infer_width / width
    new_w = infer_width
    new_h = max(1, int(height * scale))
    small = cv2.resize(frame_bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    inv = 1.0 / scale
    return small, inv, inv


def _scale_keypoints(keypoints: np.ndarray, scale_x: float, scale_y: float) -> np.ndarray:
    if scale_x == 1.0 and scale_y == 1.0:
        return keypoints
    scaled = keypoints.copy()
    scaled[:, 0] *= scale_x
    scaled[:, 1] *= scale_y
    return scaled


class MovementDetector:
    def __init__(self, config: DetectorConfig | None = None):
        self.config = config or DetectorConfig()
        self.model = LibreYOLO(self.config.model_name)
        self.recognizer = MovementRecognizer(cooldown_ms=self.config.cooldown_ms)
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mibombo-infer")
        self._frame_index = 0

    def _select_person(self, result) -> tuple[np.ndarray, np.ndarray] | None:
        if result.keypoints is None or len(result) == 0:
            return None

        xy = result.keypoints.xy
        if hasattr(xy, "cpu"):
            xy = xy.cpu().numpy()
        else:
            xy = np.asarray(xy)

        conf = result.keypoints.conf
        if conf is None:
            visible = np.ones((xy.shape[0], xy.shape[1]), dtype=bool)
        else:
            visible = (conf.cpu().numpy() if hasattr(conf, "cpu") else np.asarray(conf)) > 0.3

        areas = []
        for idx in range(xy.shape[0]):
            xs = xy[idx, visible[idx], 0]
            ys = xy[idx, visible[idx], 1]
            if len(xs) == 0:
                areas.append(0.0)
            else:
                areas.append(float((xs.max() - xs.min()) * (ys.max() - ys.min())))

        person_idx = int(np.argmax(areas))
        return xy[person_idx], visible[person_idx]

    def should_infer(self) -> bool:
        self._frame_index += 1
        every = max(1, self.config.infer_every)
        return self._frame_index % every == 0

    def process_frame(self, frame_bgr: np.ndarray, timestamp_ms: int | None = None) -> MovementEvent | None:
        ts = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)
        height, width = frame_bgr.shape[:2]
        infer_frame, scale_x, scale_y = _resize_for_infer(frame_bgr, self.config.infer_width)
        result = self.model(infer_frame, color_format="bgr", conf=self.config.confidence)
        selected = self._select_person(result)
        if selected is None:
            return None

        keypoints, visible = selected
        keypoints = _scale_keypoints(keypoints, scale_x, scale_y)
        pose_frame = PoseFrame(
            keypoints=keypoints,
            visible=visible,
            frame_height=height,
            frame_width=width,
            timestamp_ms=ts,
        )
        candidate = self.recognizer.update(pose_frame)
        if candidate is None:
            return None
        return to_movement_event(candidate, ts)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def run_camera(self):
        cap = cv2.VideoCapture(self.config.camera_index, cv2.CAP_V4L2)
        if not cap.isOpened():
            cap = cv2.VideoCapture(self.config.camera_index)
        if not cap.isOpened():
            raise RuntimeError(
                f"Could not open camera index {self.config.camera_index}. "
                "Another app (or a previous run.py) may be using the webcam — "
                "run: fuser /dev/video0  then kill that PID."
            )
        _configure_capture(cap, self.config)

        try:
            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                if self.config.show_preview:
                    cv2.imshow("mibombo-cv", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

                if not self.should_infer():
                    continue

                event = self.process_frame(frame)
                if event is not None:
                    print(json.dumps(event.to_dict()), flush=True)
        finally:
            cap.release()
            if self.config.show_preview:
                cv2.destroyAllWindows()
            self.shutdown()
