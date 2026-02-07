# Teams

Teams are a composition layer: a curated set of plugins intended to be loaded together (for demo or production use).

This repo includes an example team map in `teams.json`. It is used by `scripts/validate_bundle.py` to verify:
- every referenced plugin exists in this repo
- the bundle remains collision-free (command names are unique)

