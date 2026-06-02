from __future__ import annotations

import cv2
import numpy as np

from mibombo_cv.types import MovementName

# COCO-17 pose limb pairs (same index scheme as gestures.py / LibreYOLO pose).
COCO_SKELETON: tuple[tuple[int, int], ...] = (
    (0, 1),
    (0, 2),
    (1, 3),
    (2, 4),
    (5, 6),
    (5, 7),
    (7, 9),
    (6, 8),
    (8, 10),
    (5, 11),
    (6, 12),
    (11, 12),
    (11, 13),
    (13, 15),
    (12, 14),
    (14, 16),
)

JOINT_COLOR = (0, 255, 128)
BONE_COLOR = (0, 200, 255)
JOINT_RADIUS = 4
BONE_THICKNESS = 2
BANNER_HEIGHT = 36
BANNER_BG = (24, 24, 24)
BANNER_TEXT = (255, 255, 255)


def draw_pose(
    frame: np.ndarray,
    keypoints: np.ndarray,
    visible: np.ndarray,
) -> np.ndarray:
    """Draw COCO skeleton joints and bones on frame (in-place). Returns frame."""
    for a, b in COCO_SKELETON:
        if not (visible[a] and visible[b]):
            continue
        pt_a = (int(keypoints[a][0]), int(keypoints[a][1]))
        pt_b = (int(keypoints[b][0]), int(keypoints[b][1]))
        cv2.line(frame, pt_a, pt_b, BONE_COLOR, BONE_THICKNESS, cv2.LINE_AA)

    for idx in range(len(keypoints)):
        if not visible[idx]:
            continue
        pt = (int(keypoints[idx][0]), int(keypoints[idx][1]))
        cv2.circle(frame, pt, JOINT_RADIUS, JOINT_COLOR, -1, cv2.LINE_AA)

    return frame


def draw_movement_banner(
    frame: np.ndarray,
    movement: MovementName,
    speed: float,
    confidence: float,
) -> np.ndarray:
    """Draw a single-line movement label at the top of the frame (in-place)."""
    height = frame.shape[0]
    bar_h = min(BANNER_HEIGHT, height)
    cv2.rectangle(frame, (0, 0), (frame.shape[1], bar_h), BANNER_BG, -1)

    label = f"{movement}   speed={speed:.2f}   conf={confidence:.2f}"
    cv2.putText(
        frame,
        label,
        (8, bar_h - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        BANNER_TEXT,
        1,
        cv2.LINE_AA,
    )
    return frame
