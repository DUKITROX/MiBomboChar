# MiBomboChar Computer Vision

Real-time camera service that recognizes player body movements and publishes them with speed for the game platform to consume.

## Language

**Movement**:
A named player gesture the game reacts to (`flight`, `dab`, `whoa_raise`, `hands_up`). Not every motion — only gestures that pass detector thresholds.
_Avoid_: gesture, action, pose

**Movement event**:
One emission when a movement is recognized, including movement name, speed, confidence, and timestamp.
_Avoid_: signal, command

**Speed**:
How fast the relevant body parts moved during the movement, in normalized units (0–1) relative to frame size and frame rate. Downstream can map this to game intensity.
_Avoid_: velocity (use only in implementation docs)

**Flight**:
Player spreads arms horizontally and flaps them up and down like a bird, with elbows roughly extended.
_Avoid_: fly, bird pose

**Dab**:
Meme pose — one arm raised diagonally upward, head tucked toward the opposite elbow/shoulder. (Assumed spelling of "dub" until confirmed.)
_Avoid_: dub

**Whoa raise**:
Player throws an object (or empty hands) upward from chest level, then catches on the way down — the classic "whoa" toss-and-catch motion.
_Avoid_: lanzar, throw

**Hands up**:
Both arms raised above the shoulders (celebrate / charge / ready pose). Wrists clearly above shoulder line, not a horizontal flap like flight.
_Avoid_: hands up, surrender

**Player**:
The single human in frame the detector tracks. MVP assumes one player, largest person detection.
_Avoid_: user, subject

## Flagged ambiguities

- **"Dub" vs dab**: Treated as the **dab** meme pose for MVP heuristics. Confirm with team if a different motion was intended.

## Example dialogue

**Dev**: When flight triggers, do we send one event per flap or one sustained state?
**Lead**: One event per recognized flap burst — the game platform debounces.
**Dev**: And speed on whoa_raise is wrist velocity on the upward phase?
**Lead**: Yes — peak upward speed before the catch.
