import numpy as np

from mibombo_cv.gestures import (
    L_ELBOW,
    L_SHOULDER,
    L_WRIST,
    NOSE,
    R_ELBOW,
    R_HIP,
    R_SHOULDER,
    R_WRIST,
    MovementRecognizer,
    PoseFrame,
)


def _blank_pose(timestamp_ms: int = 0) -> PoseFrame:
    return PoseFrame(
        keypoints=np.zeros((17, 2), dtype=float),
        visible=np.ones(17, dtype=bool),
        frame_height=480,
        frame_width=640,
        timestamp_ms=timestamp_ms,
    )


def _fill_flight_pose(frame: PoseFrame, wrist_y: float) -> None:
    frame.keypoints[L_SHOULDER] = (400, 300)
    frame.keypoints[R_SHOULDER] = (880, 300)
    frame.keypoints[L_ELBOW] = (320, wrist_y)
    frame.keypoints[R_ELBOW] = (960, wrist_y)
    frame.keypoints[L_WRIST] = (250, wrist_y)
    frame.keypoints[R_WRIST] = (1030, wrist_y)


def _run_flight_flap(recognizer: MovementRecognizer, wrist_ys: list[float], dt_ms: int = 50) -> object:
    for idx, wrist_y in enumerate(wrist_ys):
        frame = _blank_pose(idx * dt_ms)
        _fill_flight_pose(frame, wrist_y)
        recognizer.update(frame)
    if len(wrist_ys) >= 2:
        flap_amp = abs(wrist_ys[-1] - wrist_ys[-2])
        final_y = wrist_ys[-1] - flap_amp
    else:
        final_y = wrist_ys[-1] - 20
    frame = _blank_pose(len(wrist_ys) * dt_ms)
    _fill_flight_pose(frame, final_y)
    return recognizer.update(frame)


def test_detects_flight_flap():
    recognizer = MovementRecognizer(cooldown_ms=0)
    result = _run_flight_flap(recognizer, [320, 300, 320, 300])

    assert result is not None
    assert result.movement == "flight"
    assert result.speed > 0


def test_flight_speed_reflects_flap_intensity():
    slow = MovementRecognizer(cooldown_ms=0)
    slow_result = _run_flight_flap(slow, [320, 310, 320, 310], dt_ms=66)

    fast = MovementRecognizer(cooldown_ms=0)
    fast_result = _run_flight_flap(fast, [320, 285, 320, 285], dt_ms=66)

    assert slow_result is not None and fast_result is not None
    assert slow_result.movement == "flight"
    assert fast_result.movement == "flight"
    assert slow_result.speed < 0.55
    assert fast_result.speed < 1.0
    assert fast_result.speed > slow_result.speed + 0.15


def test_detects_dab_pose():
    recognizer = MovementRecognizer(cooldown_ms=0)
    for ts in range(4):
        frame = _blank_pose(ts * 50)
        frame.keypoints[NOSE] = (640, 280)
        frame.keypoints[L_SHOULDER] = (580, 320)
        frame.keypoints[R_SHOULDER] = (700, 320)
        frame.keypoints[L_ELBOW] = (620, 300)
        frame.keypoints[R_ELBOW] = (760, 300)
        frame.keypoints[L_WRIST] = (560, 360)
        frame.keypoints[R_WRIST] = (820, 180)
        recognizer.update(frame)

    frame = _blank_pose(250)
    frame.keypoints[NOSE] = (640, 280)
    frame.keypoints[L_SHOULDER] = (580, 320)
    frame.keypoints[R_SHOULDER] = (700, 320)
    frame.keypoints[L_ELBOW] = (620, 300)
    frame.keypoints[R_ELBOW] = (760, 300)
    frame.keypoints[L_WRIST] = (560, 360)
    frame.keypoints[R_WRIST] = (820, 180)
    result = recognizer.update(frame)

    assert result is not None
    assert result.movement == "dab"
