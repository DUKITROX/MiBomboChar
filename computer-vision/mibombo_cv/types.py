from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

MovementName = Literal["flight", "dab"]
# whoa_raise, six_seven disabled for now; add back to MovementName when re-enabled


@dataclass(frozen=True)
class MovementEvent:
    movement: MovementName
    speed: float
    confidence: float
    timestamp_ms: int

    def to_dict(self) -> dict:
        payload = asdict(self)
        # Pose math uses numpy scalars; json.dumps needs built-in float.
        payload["speed"] = round(float(self.speed), 4)
        payload["confidence"] = round(float(self.confidence), 4)
        return payload
