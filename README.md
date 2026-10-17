# BIG — Think BIG. Recycle better.

One recycling station per new home. Eight streams, each bay sized to what a house build actually throws out. A Recycle Group initiative.

Static site on GitHub Pages. Pages:

| Page | What's on it |
|---|---|
| `index.html` | Hub: video hero, the problem, weight vs space, links to every page, homebuyer angle |
| `station.html` | Interactive 3D station, dimensioned drawing, design details, every bay explained, change-over steps |
| `sizing.html` | Weight vs space chart, plan view, house-size slider, per-stream bars, results, sources and assumptions |
| `savings.html` | Levy calculator, truck visits, tonnes by stream, levy schedule, scenarios, what isn't counted |
| `standard.html` | Model subcontract clause (copyable), stage checks, trade sheet, trade scorecard (proposed), FAQ |
| `your-home.html` | Your Home guidance for builders and homebuyers mapped to BIG, national 80% target |
| `pilot.html` | Pilot steps, responsibilities, measures, example report (demo figures), FAQ, enquiry form |

`method.html` redirects to `sizing.html`.

## Source

- `source/model/compute.py` — material split (weight to loose volume) and bay sizing; writes `data/model.json`.
- `source/model/build_station.py` — parametric Blender model of the station (renders, side elevation, `model/big-station.glb`).
- `source/pages/` — page bodies and `build.py`, which wraps them in the shared header and footer.

Figures are estimates from published sources (see sizing.html) until pilot weighbridge data replaces them.
