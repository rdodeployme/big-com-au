"""BIG — new-home surplus material split and compartment sizing.
Converts a weight-% estimate into loose volume using BRANZ REBRI unit weights,
then sizes each compartment by its share of volume (so all bays fill at a similar rate).
Outputs: shares.json (Blender), ../site/data/model.json (website), printed table.
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))

# Source profiles (% by weight) mapped onto the 8 BIG streams
SOURCES = {
    "low2024": {  # Low et al. 2024, Frontiers in Sustainability — measured, 8 terraced houses, NZ
        "label": "Measured NZ build (Low et al. 2024)",
        "timber": 53.5 + 6.6, "plaster": 11.1, "card": 3.7 + 0.2, "plastic": 3.2 * 0.87, "eps": 3.2 * 0.13,
        "steel": 3.4, "rubble": 0.0,
        "general": 11.3 + 3.3 + 1.5 + 1.4 + 0.3 + 0.1,
    },
    "yourhome": {  # Your Home, Waste minimisation — NSW DECC 2007, typical building waste (C&D, not new-build only)
        "label": "Your Home typical building waste (NSW 2007)",
        "timber": 20.0, "plaster": 3.7, "card": 3.2, "plastic": 2.9, "eps": 0.0,
        "steel": 5.1 + 0.6, "rubble": 22.9 + 8.8 + 5.6, "general": 21.6 + 5.6,
    },
    "branz": {  # BRANZ Bulletin 671 — Auckland study; lists only these five categories (total 88%)
        "label": "BRANZ Bulletin 671 (Auckland study)",
        "timber": 20, "plaster": 13, "card": 5, "plastic": 0, "eps": 0,
        "steel": 5, "rubble": 0, "general": 45,
    },
}

# BIG central estimate for an Australian brick-veneer, slab-on-ground new home (derived — see notes)
CENTRAL = {"timber": 25, "plaster": 12, "rubble": 30, "card": 4, "plastic": 2.5, "eps": 0.5, "steel": 4, "general": 22}
RANGE = {  # plausible low/high weight share across the sources
    "timber": (20, 55), "plaster": (4, 13), "rubble": (0, 37), "card": (3, 5),
    "plastic": (1.7, 3), "eps": (0.2, 1), "steel": (3.4, 5.7), "general": (18, 33)}

# Loose unit weights, kg/m3 — BRANZ REBRI Waste Minimisation Plan material conversion chart
DENSITY = {"timber": 148.17, "plaster": 247.1, "rubble": 1100, "card": 43.76, "plastic": 55,
           "eps": 47.0, "steel": 250, "general": 175.07}
DENS_NOTE = {"rubble": "between concrete rubble 1,165.56 and hardfill 995.46",
             "plastic": "blend of soft plastic 36.96 and PVC 99.88",
             "steel": "between clean light gauge 194.2 and metal 379.6"}

STREAMS = [  # display order = user's order
    (1, "plastic", "Plastics", "Plastics", "plastic"),
    (2, "timber", "Timber", "Timber", "timber"),
    (3, "plaster", "Plasterboard", "Plasterboard", "plaster"),
    (4, "card", "Cardboard", "Cardboard", "card"),
    (5, "eps", "Polystyrene", "Polystyrene", "eps"),
    (6, "rubble", "Bricks & concrete", "Bricks & rubble", "rubble"),
    (7, "general", "General rubbish", "General", "general"),
    (8, "steel", "Steel & metals", "Steel & metals", "steel"),
]

KG_PER_M2 = {"low": 24.8, "central": 32.2, "high": 45}  # NZ detached 24.8–32.2 (Domingo & Batty 2021); high = Aus brick/slab allowance (assumption)

assert abs(sum(CENTRAL.values()) - 100) < 1e-6
vol_per_t = {k: CENTRAL[k] * 10 / DENSITY[k] for k in CENTRAL}       # m3 per tonne of total waste
tot_v = sum(vol_per_t.values())
vshare = {k: v / tot_v for k, v in vol_per_t.items()}

# Practical floor: every bay must be at least ~0.6 m wide to load by hand (two rows of 4 along a 6.2 m body)
MIN_SHARE = 0.05
built = {k: max(v, MIN_SHARE) for k, v in vshare.items()}
bt = sum(built.values()); built = {k: v / bt for k, v in built.items()}

# Station body (hook-lift, after the Plastercycle-style 6.3 x 2.45 body)
BODY = {"length": 6.3, "width": 2.45, "height": 2.2}
internal = (BODY["length"] - 0.08) * (BODY["width"] - 0.12) * (BODY["height"] - 0.04)

print(f"Loose volume per tonne of mixed new-home waste: {tot_v:.2f} m3/t")
print(f"Station internal volume ~{internal:.1f} m3\n")
print(f"{'stream':<16}{'wt%':>6}{'kg/m3':>8}{'vol%':>7}{'built%':>8}{'bay m3':>8}")
for n, k, name, *_ in STREAMS:
    print(f"{name:<16}{CENTRAL[k]:>6.1f}{DENSITY[k]:>8.0f}{vshare[k]*100:>7.1f}{built[k]*100:>8.1f}{built[k]*internal:>8.2f}")

ex_area = 240
for lab, r in KG_PER_M2.items():
    t = ex_area * r / 1000
    print(f"{lab:>8}: {ex_area} m2 house -> {t:.1f} t, {t*tot_v:.0f} m3 loose, ~{t*tot_v/(internal*0.85):.1f} station lifts")

cfg = {"body": BODY, "open_flaps": {"timber": 70, "card": 70, "general": 62, "rubble": 62, "steel": 62},
       "streams": [{"n": n, "id": k, "name": name, "short": short, "share": round(built[k], 4), "kind": kind}
                   for n, k, name, short, kind in STREAMS]}
json.dump(cfg, open(os.path.join(HERE, "shares.json"), "w"), indent=1)
v = dict(cfg); v["open_flaps"] = {}
json.dump(v, open(os.path.join(HERE, "shares_viewer.json"), "w"), indent=1)

os.makedirs(os.path.join(HERE, "..", "site", "data"), exist_ok=True)
json.dump({
    "streams": [{"n": n, "id": k, "name": name, "weight": CENTRAL[k], "range": RANGE[k], "density": DENSITY[k],
                 "densityNote": DENS_NOTE.get(k, ""), "volume": round(vshare[k] * 100, 1),
                 "built": round(built[k] * 100, 1), "bayM3": round(built[k] * internal, 2)} for n, k, name, *_ in STREAMS],
    "m3PerTonne": round(tot_v, 3), "kgPerM2": KG_PER_M2, "stationInternalM3": round(internal, 1),
    "sources": {k: {kk: (round(vv, 2) if isinstance(vv, float) else vv) for kk, vv in s.items()} for k, s in SOURCES.items()},
}, open(os.path.join(HERE, "..", "site", "data", "model.json"), "w"), indent=1)
