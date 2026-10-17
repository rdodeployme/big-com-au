# BIG — Think BIG. Recycle better.

One recycling station per new home. Eight streams, each bay sized to what a house build actually throws out. A Recycle Group initiative.

Static site on GitHub Pages: `index.html`, `method.html`, `standard.html`, `your-home.html`.

- `source/model/compute.py` — material split (weight to loose volume) and bay sizing; writes `data/model.json`.
- `source/model/build_station.py` — parametric Blender model of the station (renders and `model/big-station.glb`).
- `source/pages/` — inner-page partials and `build.py`, which assembles them.

Figures are estimates from published sources (see method.html) until pilot weighbridge data replaces them.
