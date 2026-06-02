# MiBomboChar Computer Vision

Real-time camera service that recognizes player body movements and publishes them with speed for the game platform to consume.

## Language

**Movement**:
A named player gesture the game reacts to (`flight`, `dab`). Not every motion — only gestures that pass detector thresholds. (`whoa_raise`, `six_seven` disabled for now.)
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

**Whoa raise** (disabled for now):
Player throws upward from chest level then catches — detector commented out in `gestures.py`.
_Avoid_: lanzar, throw

**Six seven** (`six_seven`, disabled for now):
Both hands in front of the chest, pumping up and down together — detector commented out in `gestures.py`.
_Avoid_: six-seven (use `six_seven` in JSON), hands_up

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
