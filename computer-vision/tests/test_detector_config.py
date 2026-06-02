from mibombo_cv.detector import DetectorConfig, MovementDetector


def test_detector_passes_cooldown_to_recognizer():
    detector = MovementDetector(DetectorConfig(cooldown_ms=250))
    assert detector.recognizer._cooldown_ms == 250


def test_movement_recognizer_default_cooldown():
    detector = MovementDetector()
    assert detector.recognizer._cooldown_ms == 400
