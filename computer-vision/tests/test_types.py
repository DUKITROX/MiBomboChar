import json

import numpy as np

from mibombo_cv.types import MovementEvent


def test_to_dict_json_serializable_with_numpy_floats():
    event = MovementEvent(
        movement="flight",
        speed=np.float32(1.0),
        confidence=np.float32(0.8125),
        timestamp_ms=1234567890,
    )
    payload = event.to_dict()
    serialized = json.dumps(payload)
    assert '"movement": "flight"' in serialized
    assert payload["speed"] == 1.0
    assert isinstance(payload["speed"], float)
