import numpy as np

from mibombo_cv.detector import _resize_for_infer, _scale_keypoints


def test_resize_for_infer_scales_keypoints_back():
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)
    small, sx, sy = _resize_for_infer(frame, infer_width=480)
    assert small.shape[1] == 480
    kp = np.array([[100.0, 50.0]], dtype=float)
    scaled = _scale_keypoints(kp, sx, sy)
    assert scaled[0, 0] > 100.0
    assert scaled[0, 1] > 50.0


def test_resize_skips_when_already_small():
    frame = np.zeros((240, 320, 3), dtype=np.uint8)
    small, sx, sy = _resize_for_infer(frame, infer_width=480)
    assert small is frame
    assert sx == 1.0 and sy == 1.0
