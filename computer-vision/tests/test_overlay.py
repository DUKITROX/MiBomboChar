import numpy as np

from mibombo_cv.detector import DetectorConfig, MovementDetector
from mibombo_cv.gestures import PoseFrame
from mibombo_cv.overlay import draw_movement_banner, draw_pose
from mibombo_cv.types import MovementEvent


def _synthetic_pose() -> PoseFrame:
    keypoints = np.array(
        [
            [320, 100],
            [300, 90],
            [340, 90],
            [280, 95],
            [360, 95],
            [260, 180],
            [380, 180],
            [240, 260],
            [400, 260],
            [230, 340],
            [410, 340],
            [280, 340],
            [360, 340],
            [270, 420],
            [370, 420],
            [265, 500],
            [375, 500],
        ],
        dtype=float,
    )
    return PoseFrame(
        keypoints=keypoints,
        visible=np.ones(17, dtype=bool),
        frame_height=480,
        frame_width=640,
        timestamp_ms=0,
    )


def test_draw_pose_keeps_frame_shape():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    pose = _synthetic_pose()
    out = draw_pose(frame, pose.keypoints, pose.visible)
    assert out.shape == frame.shape


def test_draw_movement_banner_keeps_frame_shape():
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    out = draw_movement_banner(frame, "flight", 0.5, 0.8)
    assert out.shape == frame.shape


def test_annotate_frame_uses_last_pose_without_new_inference():
    detector = MovementDetector.__new__(MovementDetector)
    detector.config = DetectorConfig(show_skeleton=True)
    detector._last_pose = _synthetic_pose()
    detector._last_event = None
    detector._banner_until_ms = 0

    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    before = frame.copy()
    out = detector.annotate_frame(frame, timestamp_ms=1000)

    assert out is frame
    assert out.shape == frame.shape
    assert not np.array_equal(before, frame)


def test_show_window_when_skeleton_or_preview():
    detector = MovementDetector.__new__(MovementDetector)
    detector.config = DetectorConfig(show_skeleton=True)
    assert detector.show_window()
    detector.config = DetectorConfig(show_preview=True)
    assert detector.show_window()
    detector.config = DetectorConfig()
    assert not detector.show_window()
