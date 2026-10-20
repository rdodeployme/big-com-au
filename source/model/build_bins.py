"""BuildersBins Rev B — hook skid with 8 stand-alone bins.
Compartment lengths are driven by model/shares.json (volume share per stream).
Run: python3 build_station.py [--render hero|plan|all] [--glb]
"""
import bpy, bmesh, json, math, random, sys, itertools, os
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
args = sys.argv[1:]
RENDER = args[args.index("--render") + 1] if "--render" in args else None
GLB = "--glb" in args
SAMPLES = int(args[args.index("--samples") + 1]) if "--samples" in args else 48
RES = int(args[args.index("--res") + 1]) if "--res" in args else 1600

CFG = args[args.index("--cfg") + 1] if "--cfg" in args else "shares.json"
cfg = json.load(open(os.path.join(HERE, CFG)))
streams = cfg["streams"]           # [{id,name,short,share,kind}]
# ---------- reset ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def hexcol(h, a=1.0):
    h = h.lstrip('#'); r, g, b = (int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
    srgb = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (srgb(r), srgb(g), srgb(b), a)

def mat(name, col, metal=0.0, rough=0.5, alpha=1.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = hexcol(col)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    if emit:
        p.inputs["Emission Color"].default_value = hexcol(emit)
        p.inputs["Emission Strength"].default_value = 1.0
    return m

M = {
    "body": mat("BIG Body", "#2A3036", 0.5, 0.4),
    "body_in": mat("BIG Interior", "#2A3036", 0.3, 0.6),
    "flap": mat("BIG Flap", "#20262B", 0.5, 0.35),
    "copper": mat("BIG Copper", "#C2804F", 0.85, 0.32),
    "white": mat("BIG Label", "#EEF1F3", 0.0, 0.5),
    "chassis": mat("BIG Chassis", "#0B0D0F", 0.6, 0.5),
    "pod": mat("Pod", "#3A4148", 0.4, 0.5),
    "lamp": mat("Sensor lamp", "#F4F1E8", 0.0, 0.2, emit="#FFF6E0"),
    "sign": mat("Sign plate", "#F4F6F7", 0.0, 0.55),
    "ink": mat("Sign ink", "#0E1114", 0.0, 0.5),
    "cupaint": mat("Copper paint", "#C2804F", 0.15, 0.45),
    "cudeep": mat("Copper deep", "#5E3A22", 0.0, 0.5),
    "ground": mat("Ground", "#8C8478", 0.0, 0.95),
    # contents (true-to-material colours)
    "timber": mat("Timber", "#C8A06A", 0, 0.8),
    "plaster": mat("Plasterboard", "#E4E1DA", 0, 0.9),
    "card": mat("Cardboard", "#A9804F", 0, 0.9),
    "eps": mat("Polystyrene", "#F4F4F0", 0, 0.7),
    "brick": mat("Brick", "#9A5B43", 0, 0.9),
    "concrete": mat("Concrete", "#9B9B96", 0, 0.9),
    "steel": mat("Steel", "#B4BBC1", 1.0, 0.3),
    "plastic": mat("Plastic film", "#D9DEE2", 0.0, 0.25, 0.85),
    "bag": mat("General bag", "#202020", 0.0, 0.45),
}

col_station = bpy.data.collections.new("BIG_Station"); scene.collection.children.link(col_station)

def link(o, coll=col_station):
    for c in o.users_collection: c.objects.unlink(o)
    coll.objects.link(o); return o

def box(name, size, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.scale = size; bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m); return link(o)

def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m); return link(o)

FONT = None
fp = os.path.join(HERE, "..", "fonts", "Archivo-800.ttf")
if os.path.exists(fp): FONT = bpy.data.fonts.load(fp)

def text(name, s, loc, rot, size, m, align='LEFT', extrude=0.004):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.data.body = s; o.data.size = size; o.data.extrude = extrude
    o.data.align_x = align; o.data.align_y = 'BOTTOM'
    if FONT: o.data.font = FONT
    o.data.materials.append(m)
    bpy.ops.object.convert(target='MESH')
    return link(bpy.context.active_object)

def fit(name, s_, loc, rot, max_w, size, m, align='LEFT', extrude=0.0006):
    o = text(name, s_, loc, rot, size, m, align=align, extrude=extrude)
    w = o.dimensions.x
    if w > max_w:
        k = max_w / w; o.scale = (k, k, 1); bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o; bpy.ops.object.transform_apply(scale=True)
        return o, size * k
    return o, size

def join_as(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); objs[0].name = name; return objs[0]

# bay sign content: what trades read at the flap
SIGN = {
    "plastic": (["PLASTICS"], ["Wrap and film", "Strapping", "Pipe offcuts"], ["Polystyrene", "Paint tins"]),
    "timber":  (["TIMBER"], ["Framing offcuts", "Pallets", "Formwork"], ["Treated timber", "Painted timber"]),
    "plaster": (["PLASTER-", "BOARD"], ["Clean offcuts", "Broken sheets"], ["Wet board", "Tape and tubs"]),
    "card":    (["CARDBOARD"], ["Boxes, flattened", "Packaging"], ["Wet or waxed card"]),
    "eps":     (["POLY-", "STYRENE"], ["White packaging", "Clean offcuts"], ["Food trays"]),
    "rubble":  (["BRICKS &", "CONCRETE"], ["Bricks, concrete", "Tiles, pavers"], ["Soil", "Asbestos"]),
    "general": (["GENERAL", "RUBBISH"], ["Mixed offcuts", "Sweepings"], ["Asbestos", "Chemicals"]),
    "steel":   (["STEEL &", "METALS"], ["Offcuts, mesh", "Flashing"], ["Gas bottles", "Aerosols"]),
}
FLAPNAME = {"plastic": "Plastics", "timber": "Timber", "plaster": "Plaster", "card": "Cardboard", "eps": "Poly", "rubble": "Bricks", "general": "General", "steel": "Steel"}
ONE_LINE = {"plaster": "PLASTERBOARD", "eps": "POLYSTYRENE", "rubble": "BRICKS & CONCRETE", "general": "GENERAL RUBBISH", "steel": "STEEL & METALS"}

# ---------- render scene ----------
def setup_render(name, cam_loc, cam_rot, lens=50, ortho=None, transparent=False):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'; scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
    scene.render.resolution_x = RES; scene.render.resolution_y = int(RES * (0.62 if not ortho else 0.62))
    scene.render.film_transparent = transparent
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'
    cam_d = bpy.data.cameras.new("cam"); cam = bpy.data.objects.new("cam", cam_d); scene.collection.objects.link(cam)
    cam.location = cam_loc; cam.rotation_euler = cam_rot; cam_d.lens = lens
    if ortho: cam_d.type = 'ORTHO'; cam_d.ortho_scale = ortho
    scene.camera = cam
    scene.render.filepath = os.path.join(OUT, name)
    bpy.ops.render.render(write_still=True)

def lights(world_hex="#3A4148", strength=0.8):
    w = bpy.data.worlds.new("W"); scene.world = w; w.use_nodes = True
    bg = w.node_tree.nodes["Background"]; bg.inputs[0].default_value = hexcol(world_hex); bg.inputs[1].default_value = strength
    def area(n, loc, rot, e, size, col=(1, 1, 1)):
        ld = bpy.data.lights.new(n, 'AREA'); ld.energy = e; ld.size = size; ld.color = col
        lo = bpy.data.objects.new(n, ld); lo.location = loc; lo.rotation_euler = rot; scene.collection.objects.link(lo)
    area("Key", (6, 7, 8), (math.radians(-45), math.radians(35), math.radians(140)), 9000, 6, (1, .96, .9))
    area("Rim", (-8, -5, 5), (math.radians(60), 0, math.radians(-60)), 2400, 5, (.85, .9, 1))
    area("Fill", (-3, 8, 3), (math.radians(-70), 0, math.radians(180)), 900, 8)
    area("Top", (0, 0, 9), (0, 0, 0), 1400, 9)


# ================= Rev B: hook skid carrying 8 stand-alone 4 mm bins =================
G = cfg["geo"]
L, W = G["L"], G["W"]; T = G["plate"]
DECK, RAIL_H, RAIL_W, CW = G["deck"], G["rail_h"], G["rail_w"], G["centre_w"]
MODL, DEPTH, GAP = G["module"], G["depth"], G["gap"]
FT, BT, FB = G["front_top"], G["back_top"], G["flap_bot"]
PB, PH, FLOOR = G["pocket_bot"], G["pocket_h"], G["floor"]
X0 = -L/2 + G["rear_zone"]                         # first module line (rear)
XH = L/2 - G["hook_zone"]                          # last module line (hook end)
random.seed(7)

M.update({
    "skid": mat("Skid", "#0B0D0F", 0.6, 0.5),
    "bin": mat("Bin steel", "#2A3036", 0.45, 0.42),
    "lid": mat("Bin lid", "#232A30", 0.45, 0.38),
    "door": mat("Trap door", "#262C32", 0.45, 0.4),
    "hinge": mat("Hinge", "#8A939B", 0.9, 0.3),
})

def prism_x(name, pts_yz, x_c, thick, m):
    """Plate in the YZ plane (outline pts_yz), extruded along x."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs0 = [bm.verts.new((x_c - thick/2, y, z)) for y, z in pts_yz]
    vs1 = [bm.verts.new((x_c + thick/2, y, z)) for y, z in pts_yz]
    bm.faces.new(vs0[::-1]); bm.faces.new(vs1)
    n = len(pts_yz)
    for i in range(n):
        bm.faces.new((vs0[i], vs0[(i+1) % n], vs1[(i+1) % n], vs1[i]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); o.data.materials.append(m); col_station.objects.link(o); return o

def set_origin(o, p):
    """Move object origin to world point p without moving geometry."""
    d = Vector(p) - o.location
    for v in o.data.vertices: v.co -= d
    o.location = Vector(p)

# ---------------- skid ----------------
for y in (-0.55, 0.55):
    box(f"Runner{y:+.2f}", (L - 0.04, 0.12, DECK - 0.008), (0, y, (DECK - 0.008)/2), M["skid"])
for x in [X0 + k * 0.9 for k in range(7)]:
    box(f"Cross{x:+.2f}", (0.08, W - 0.1, DECK - 0.008), (x, 0, (DECK - 0.008)/2), M["skid"])
box("Deck", (L, W, 0.008), (0, 0, DECK - 0.004), M["skid"])
zone = XH - X0
for y in (W/2 - RAIL_W/2, -W/2 + RAIL_W/2):
    box(f"Rail{y:+.2f}", (zone, RAIL_W, RAIL_H), ((X0 + XH)/2, y, DECK + RAIL_H/2), M["copper"])
box("RailCentre", (zone, CW, RAIL_H), ((X0 + XH)/2, 0, DECK + RAIL_H/2), M["skid"])
box("RailRear", (0.05, W, RAIL_H), (X0 - 0.025, 0, DECK + RAIL_H/2), M["skid"])
for y in (-0.75, 0.75):
    cyl(f"Roller{y:+.2f}", 0.07, 0.22, (-L/2 + 0.075, y, 0.07), M["skid"], rot=(math.pi/2, 0, 0), verts=24)
# hook A-frame inside the hook zone (hook height to suit the fleet)
HOOK_Z = 1.45
fx = L/2 - 0.12
box("HookPost", (0.14, 0.16, HOOK_Z), (fx, 0, DECK + HOOK_Z/2), M["skid"])
for y in (-0.55, 0.55):
    box(f"HookBrace{y:+.2f}", (0.10, 0.10, 1.5), (fx - 0.02, y * 0.5, DECK + 0.65), M["skid"], rot=(-y * 0.42, 0, 0))
box("HookEndPlate", (0.01, W - 0.2, 0.55), (XH + 0.02, 0, DECK + 0.3), M["skid"])
bpy.ops.mesh.primitive_torus_add(major_radius=0.11, minor_radius=0.032, location=(fx, 0, DECK + HOOK_Z + 0.1), rotation=(math.pi/2, 0, 0))
link(bpy.context.active_object).name = "HookRing"; bpy.context.active_object.data.materials.append(M["skid"])
# light arms on the A-frame: one light raking along each side; controller and siren on the post
box("LightArm", (0.06, W - 0.1, 0.06), (fx, 0, DECK + HOOK_Z - 0.02), M["skid"])
for i, y in enumerate((W/2 - 0.12, -W/2 + 0.12)):
    box(f"SensorLight{i}", (0.09, 0.24, 0.10), (fx - 0.06, y, DECK + HOOK_Z + 0.06), M["chassis"])
    box(f"SensorLens{i}", (0.006, 0.18, 0.06), (fx - 0.108, y, DECK + HOOK_Z + 0.06), M["lamp"])
box("CtrlBox", (0.14, 0.40, 0.34), (fx + 0.12, -0.42, DECK + 0.95), M["chassis"])
box("CtrlBand", (0.006, 0.40, 0.05), (fx + 0.193, -0.42, DECK + 1.095), M["cupaint"])
cyl("CtrlKey", 0.022, 0.03, (fx + 0.2, -0.30, DECK + 0.86), M["copper"], rot=(0, math.pi/2, 0), verts=16)
fit("CtrlLbl", "LOCK · ALARM", (fx + 0.196, -0.42, DECK + 0.97), (math.pi/2, 0, math.pi/2), 0.36, 0.045, M["white"], align='CENTER')
box("Siren", (0.12, 0.24, 0.16), (fx + 0.11, 0.42, DECK + 1.15), M["sign"])
cyl("SirenHorn", 0.065, 0.04, (fx + 0.19, 0.42, DECK + 1.15), M["ink"], rot=(0, math.pi/2, 0), verts=24)
# hook-end brand plate
box("HookBrand", (0.006, 0.9, 0.2), (fx + 0.075, 0, DECK + 0.45), M["cupaint"])
fit("HookBrandT", "BUILDERSBINS", (fx + 0.08, 0, DECK + 0.40), (math.pi/2, 0, math.pi/2), 0.8, 0.12, M["ink"], align='CENTER')
# rear post: third sensor light and the security / no-hazardous sign
box("RearPost", (0.06, 0.06, 1.85 - DECK), (-L/2 + 0.05, 0, DECK + (1.85 - DECK)/2), M["skid"])
box("SensorLight2", (0.10, 0.24, 0.10), (-L/2 + 0.04, 0, 1.86), M["chassis"])
box("SensorLens2", (0.006, 0.18, 0.06), (-L/2 - 0.012, 0, 1.86), M["lamp"])
RR = (math.pi/2, 0, -math.pi/2)
box("RearSign", (0.006, 0.62, 0.52), (-L/2 + 0.017, 0, 1.18), M["sign"])
box("RearSignBar", (0.004, 0.62, 0.13), (-L/2 + 0.012, 0, 1.375), M["cupaint"])
fit("RearSignT0", "BUILDERSBINS", (-L/2 + 0.009, 0, 1.335), RR, 0.56, 0.085, M["ink"], align='CENTER')
fit("RearSignT1", "Alarmed after hours", (-L/2 + 0.012, 0, 1.22), RR, 0.56, 0.05, M["ink"], align='CENTER')
fit("RearSignT2", "Sensor lights · Bays logged", (-L/2 + 0.012, 0, 1.14), RR, 0.56, 0.042, M["ink"], align='CENTER')
fit("RearSignT3", "NO ASBESTOS", (-L/2 + 0.012, 0, 1.03), RR, 0.56, 0.055, M["cudeep"], align='CENTER')
fit("RearSignT4", "No chemicals · No gas bottles", (-L/2 + 0.012, 0, 0.96), RR, 0.56, 0.04, M["cudeep"], align='CENTER')

# ---------------- bins ----------------
byid = {s["id"]: s for s in streams}
MODCFG = cfg["modular"]["sides"]
bays = []
NARROW = {"eps": (["Packaging", "Offcuts"], ["No food trays"]), "rubble": (["Bricks", "Concrete", "Tiles"], ["No soil"]),
          "steel": (["Offcuts", "Mesh", "Flashing"], ["No gas bottles"]), "plastic": (["Wrap, film", "Strapping"], ["No poly"]),
          "plaster": (["Offcuts"], ["No wet board"]), "card": (["Boxes, flat"], ["No wet card"]),
          "timber": (["Offcuts", "Pallets"], ["No treated"]), "general": (["Mixed"], ["No asbestos"])}

def bin_sign(s, cx, w, yface, sgn, z_bot, z_top):
    """White plate on the bin's lower front: copper header + number, name, yes/no."""
    sid = s["id"]; pw_ = w - 0.08; inner = pw_ - 0.10
    rz = 0 if sgn < 0 else math.pi; tx = 1 if sgn < 0 else -1
    rot = (math.pi/2, 0, rz); yl = lambda d: yface + sgn * d
    lx = cx - tx * (pw_/2 - 0.05); HDR = 0.21
    parts = [box(f"Sp_{sid}", (pw_, 0.006, z_top - z_bot), (cx, yl(0.003), (z_top + z_bot)/2), M["sign"]),
             box(f"Sh_{sid}", (pw_, 0.004, HDR), (cx, yl(0.008), z_top - HDR/2), M["cupaint"])]
    parts.append(text(f"Sn_{sid}", f"{s['n']:02d}", (lx, yl(0.011), z_top - HDR + 0.035), rot, 0.23, M["ink"], extrude=0.0006))
    names, yes, no = SIGN[sid]; one = ONE_LINE.get(sid, names[0])
    probe, sz = fit(f"Sx_{sid}", one, (lx, yl(0.011), 0), rot, inner, 0.14 if inner >= 0.9 else 0.12, M["ink"])
    if sz >= 0.08 or len(names) == 1:
        probe.location.z = z_top - HDR - 0.035 - sz * 0.74; parts.append(probe); zc = probe.location.z
    else:
        bpy.data.objects.remove(probe)
        sz = min([0.08] + [fit(f"Sy_{sid}_{k}", t_, (lx, yl(0.011), -5), rot, inner, 0.12, M["ink"])[1] for k, t_ in enumerate(names)])
        for o in [o for o in bpy.data.objects if o.name.startswith(f"Sy_{sid}_")]: bpy.data.objects.remove(o)
        zc = z_top - HDR - 0.035 - sz * 0.74
        for k, t_ in enumerate(names):
            parts.append(text(f"Sz_{sid}_{k}", t_, (lx, yl(0.011), zc), rot, sz, M["ink"], extrude=0.0006))
            if k < len(names) - 1: zc -= sz * 0.95
    zc -= 0.095
    if inner >= 0.9:
        colw = inner/2 - 0.03; isz = 0.075
        for label, items, colm, x0 in (("YES", yes, M["cupaint"], lx), ("NO", no, M["cudeep"], lx + tx * (inner/2 + 0.03))):
            z = zc; parts.append(fit(f"Sl_{sid}_{label}", label, (x0, yl(0.011), z), rot, colw, isz, colm)[0])
            for k, it in enumerate(items):
                z -= isz * 1.32; parts.append(fit(f"Si_{sid}_{label}_{k}", it, (x0, yl(0.011), z), rot, colw, isz, M["ink"])[0])
    else:
        ys, ns = NARROW[sid]; rows = len(ys) + len(ns)
        isz = min(0.07, (zc - z_bot - 0.035) / ((rows - 1) * 1.3 + 0.3)); z = zc
        for k, it in enumerate(ys):
            parts.append(fit(f"Sq_{sid}_{k}", it, (lx, yl(0.011), z), rot, inner, isz, M["ink"])[0]); z -= isz * 1.3
        z -= isz * 0.3
        for k, it in enumerate(ns):
            parts.append(fit(f"Sr_{sid}_{k}", it, (lx, yl(0.011), z), rot, inner, isz, M["cudeep"])[0]); z -= isz * 1.3
    return join_as(parts, f"Lbl_{sid}")

def contents(s, xa, xb, ya, yb, z0_, ztop):
    kind = s["kind"]; rng = random.Random(s["n"] * 31); pieces = []
    w = xb - xa; fill = 0.45 + 0.25 * rng.random()
    n = max(6, int(w * (60 if kind == "rubble" else 22)))
    for p in range(n):
        px = rng.uniform(xa + 0.08, xb - 0.08); py = rng.uniform(ya + 0.1, yb - 0.1)
        pz = z0_ + rng.uniform(0.03, (ztop - z0_) * fill)
        rot = (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, math.pi))
        if kind == "timber": o = box("c", (rng.uniform(0.4, min(1.0, w)), 0.09, 0.045), (px, py, pz), M["timber"], rot)
        elif kind == "plaster": o = box("c", (rng.uniform(0.3, min(0.8, w)), rng.uniform(0.3, 0.6), 0.013), (px, py, pz), M["plaster"], rot)
        elif kind == "card": o = box("c", (rng.uniform(0.3, min(0.7, w)), rng.uniform(0.3, 0.6), 0.02), (px, py, pz), M["card"], rot)
        elif kind == "eps": o = box("c", (rng.uniform(0.15, 0.4), rng.uniform(0.15, 0.35), rng.uniform(0.06, 0.2)), (px, py, pz), M["eps"], rot)
        elif kind == "rubble":
            pz = z0_ + rng.uniform(0.02, (ztop - z0_) * fill * 0.45)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rng.uniform(0.05, 0.1), location=(px, py, pz))
            o = link(bpy.context.active_object); o.scale = (rng.uniform(.8, 1.5), rng.uniform(.8, 1.3), rng.uniform(.5, .9))
            o.data.materials.append(M["brick"] if rng.random() < 0.6 else M["concrete"])
        elif kind == "steel":
            if rng.random() < 0.5: o = cyl("c", rng.uniform(0.014, 0.024), rng.uniform(0.3, 0.5), (px, py, pz), M["steel"], (math.pi/2 + rot[0] * 0.3, 0, rot[2]), verts=8)
            else: o = box("c", (rng.uniform(0.2, 0.45), rng.uniform(0.05, 0.25), 0.012), (px, py, pz), M["steel"], rot)
        elif kind == "plastic":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=rng.uniform(0.12, 0.2), location=(px, py, pz))
            o = link(bpy.context.active_object); o.scale = (1.3, 1, 0.6); o.rotation_euler = rot; o.data.materials.append(M["plastic"])
        else:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=rng.uniform(0.16, 0.24), location=(px, py, pz))
            o = link(bpy.context.active_object); o.scale = (1, 0.9, 0.75); o.rotation_euler = rot; o.data.materials.append(M["bag"])
        # keep each piece inside the bin
        for _ in range(2):
            bpy.context.view_layer.update()
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            mnx, mxx = min(p.x for p in pts), max(p.x for p in pts); mny, mxy = min(p.y for p in pts), max(p.y for p in pts)
            sc = min(1.0, (xb - xa - 0.06) / max(1e-6, mxx - mnx), (yb - ya - 0.06) / max(1e-6, mxy - mny))
            if sc < 1.0: o.scale = tuple(v * sc * 0.98 for v in o.scale)
            bpy.context.view_layer.update()
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            mnx, mxx = min(p.x for p in pts), max(p.x for p in pts); mny, mxy = min(p.y for p in pts), max(p.y for p in pts)
            o.location.x += max(0, xa + 0.03 - mnx) - max(0, mxx - xb + 0.03)
            o.location.y += max(0, ya + 0.03 - mny) - max(0, mxy - yb + 0.03)
            mnz = min(p.z for p in pts)
            if mnz < z0_: o.location.z += z0_ - mnz + 0.005
        pieces.append(o)
    return join_as(pieces, f"Contents_{s['id']}")

DROP = cfg.get("open_flaps", {})
for side, sgn in (("A", +1), ("B", -1)):
    k0 = 0
    for sid in MODCFG[side]:
        s = byid[sid]; n = s["modules"]
        x = X0 + k0 * MODL + GAP/2; w = n * MODL - GAP; cx = x + w/2; k0 += n
        yf = sgn * (W/2 - RAIL_W)                  # outer (front) face of the bin
        yb = sgn * (CW/2)                          # back face (to the centre)
        ym = (yf + yb) / 2
        ya_, yb_ = min(yf, yb), max(yf, yb)
        # base: two runners under the side walls (100 high) then two fork pockets (200-300) running front to back
        parts = []
        for xr in (x + 0.04, x + w - 0.04):
            parts.append(box("b", (0.08, DEPTH, PB - DECK), (xr, ym, DECK + (PB - DECK)/2), M["bin"]))
        pc = max(0.30, min(1.0, w * 0.55))
        for k2 in (-1, 1):
            xp = cx + k2 * pc/2
            parts.append(box("pk", (0.20, DEPTH, PH), (xp, ym, PB + PH/2), M["chassis"]))
            parts.append(box("pkt", (0.20, DEPTH + 0.002, 0.006), (xp, ym, PB + PH - 0.003), M["bin"]))
        parts.append(box("bx", (w, DEPTH, 0.04), (cx, ym, PB + 0.02), M["bin"]))      # cross frame at pocket level
        parts.append(box("fl", (w, DEPTH, T), (cx, ym, FLOOR + T/2), M["bin"]))      # floor
        # front wall below the flap, back wall, two sides (sloped tops)
        parts.append(box("fw", (w, T, FB - FLOOR), (cx, yf - sgn * T/2, FLOOR + (FB - FLOOR)/2), M["bin"]))
        parts.append(box("bw", (w, T, BT - FLOOR), (cx, yb + sgn * T/2, FLOOR + (BT - FLOOR)/2), M["bin"]))
        prof = [(yf, FLOOR), (yf, FT), (yb, BT), (yb, FLOOR)]
        parts.append(prism_x("sl", prof, x + T/2, T, M["bin"]))
        parts.append(prism_x("sr", prof, x + w - T/2, T, M["bin"]))
        # flap frame: two jambs and a lip under the lid
        for xj in (x + 0.02, x + w - 0.02):
            parts.append(box("jb", (0.04, 0.03, FT - FB), (xj, yf - sgn * 0.015, FB + (FT - FB)/2), M["bin"]))
        # smart lock on the lid lip (battery, talks to the controller by Bluetooth)
        parts.append(box("lk", (0.12, 0.05, 0.05), (cx, yf + sgn * 0.02, FT - 0.04), M["chassis"]))
        parts.append(box("lkl", (0.03, 0.004, 0.012), (cx, yf + sgn * 0.046, FT - 0.04), M["cupaint"]))
        binobj = join_as(parts, f"Bin_{sid}")
        # hard lid: ridge in the middle of the skid (2.0 m), falling 100 mm to the front edge (1.9 m)
        ang = math.atan2(FT - BT, DEPTH); ll = math.hypot(DEPTH, FT - BT) + 0.03
        lid = box(f"Lid_{sid}", (w + 0.01, ll + 0.04, T), (cx, ym + sgn * 0.02, (FT + BT)/2 + T/2), M["lid"], rot=(sgn * ang, 0, 0))   # 50 mm drip overhang at the front
        # drop-down front flap: bottom hinge at 1.2 m, closes under the lid's front edge
        fh = FT - 0.012 - FB; fw = w - 0.07
        f = box(f"Flap_{sid}", (fw, T, fh), (cx, yf + sgn * 0.006, FB + fh/2), M["flap"])
        set_origin(f, (cx, yf + sgn * 0.006, FB))
        rzf = 0 if sgn < 0 else math.pi; fy = yf + sgn * 0.0095
        t1 = text(f"Fn_{sid}", f"{s['n']:02d}", (cx, fy, FB + 0.36), (math.pi/2, 0, rzf), 0.26 if w > 0.6 else 0.22, M["white"], align='CENTER', extrude=0.0006)
        t2, _ = fit(f"Fs_{sid}", (s["name"] if w > 1.0 else FLAPNAME.get(sid, s["short"])).upper(), (cx, fy, FB + 0.17), (math.pi/2, 0, rzf), fw - 0.12, 0.11, M["cupaint"], align='CENTER')
        hinge = [cyl(f"fh{k}", 0.012, 0.12, (cx + k * fw * 0.35, yf + sgn * 0.012, FB), M["hinge"], rot=(0, math.pi/2, 0), verts=12) for k in (-1, 1)]
        f = join_as([f, t1, t2] + hinge, f"Flap_{sid}")
        a = DROP.get(sid, 0) * math.pi / 180
        f.rotation_euler = Euler((-sgn * a, 0, 0))
        # trap door on the right-hand side (as you face the flap), hinged along its top edge
        xr = x if sgn > 0 else x + w            # right side: -x for side A, +x for side B
        out = -1 if sgn > 0 else 1
        dz0, dz1 = FLOOR + 0.06, min(FT, BT) - 0.10
        dy0, dy1 = ya_ + 0.06, yb_ - 0.06
        d = box(f"Door_{sid}", (T, dy1 - dy0, dz1 - dz0), (xr + out * (T + 0.002), (dy0 + dy1)/2, (dz0 + dz1)/2), M["door"])
        hg = cyl("dh", 0.014, dy1 - dy0 - 0.1, (xr + out * 0.012, (dy0 + dy1)/2, dz1), M["hinge"], rot=(math.pi/2, 0, 0), verts=12)
        latches = [box(f"dl{k}", (0.02, 0.08, 0.04), (xr + out * 0.012, dy0 + 0.12 + k * (dy1 - dy0 - 0.24), dz0 + 0.03), M["cupaint"]) for k in (0, 1)]
        d = join_as([d, hg] + latches, f"Door_{sid}")
        set_origin(d, (xr + out * (T + 0.002), (dy0 + dy1)/2, dz1))
        # sign plate on the lower front
        bin_sign(s, cx, w, yf, sgn, FLOOR + 0.03, FB - 0.035)
        contents(s, x + T, x + w - T, ya_ + T, yb_ - T, FLOOR + T, BT - 0.05)
        bays.append({"id": sid, "side": side, "x0": round(x, 3), "len": round(w, 3), "modules": n})

json.dump({"bays": bays}, open(os.path.join(OUT, "bays.json"), "w"), indent=1)
print("BAYS", json.dumps(bays))

if GLB:
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "big-station.glb"), export_format='GLB', use_selection=False, export_apply=True)
    print("GLB written")

# ---------------- renders ----------------
def floor_plane(col="#1A1E22"):
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(mat("Floor", col, 0.0, 0.85))

if RENDER == "hero":
    floor_plane(); lights()
    setup_render("hero.png", (8.2, -7.0, 3.0), (math.radians(76), 0, math.radians(49)), lens=38)

if RENDER == "signs":
    floor_plane("#2A3036"); lights(world_hex="#4A525A", strength=1.0)
    setup_render("signs.png", (2.6, -4.8, 1.25), (math.radians(87), 0, math.radians(22)), lens=28)

if RENDER == "rear34":
    floor_plane(); lights()
    setup_render("rear34.png", (-8.3, 7.0, 3.0), (math.radians(76), 0, math.radians(-130)), lens=38)

if RENDER == "flap":
    floor_plane("#2A3036"); lights(world_hex="#4A525A", strength=1.0)
    setup_render("flap.png", (1.75, 4.9, 1.75), (math.radians(80), 0, math.radians(180)), lens=32)

if RENDER == "door":
    d = bpy.data.objects["Door_general"]; d.rotation_euler = Euler((0, math.radians(70), 0))
    floor_plane("#2A3036"); lights(world_hex="#4A525A", strength=1.0)
    setup_render("door.png", (-6.6, 3.9, 1.7), (math.radians(84), 0, math.radians(-128)), lens=34)

if RENDER in ("hookend", "rearend"):
    lights(strength=0.9)
    cam = {"hookend": ((14, 0, 1.0), (math.radians(90), 0, math.radians(90))), "rearend": ((-14, 0, 1.0), (math.radians(90), 0, math.radians(-90)))}[RENDER]
    sx = 1 if RENDER == "hookend" else -1
    ld = bpy.data.lights.new("EndFill", 'AREA'); ld.energy = 450; ld.size = 4
    lo = bpy.data.objects.new("EndFill", ld); lo.location = (sx * 6, -1.5, 2.6); scene.collection.objects.link(lo)
    lo.rotation_euler = (Vector((0, 0, 1.0)) - lo.location).to_track_quat('-Z', 'Y').to_euler()
    setup_render(RENDER + ".png", cam[0], cam[1], ortho=3.6, transparent=True)

if RENDER in ("side", "sideA", "end"):
    lights(strength=0.9)
    cam = {"side": ((0, -14, 1.05), (math.radians(90), 0, 0)), "sideA": ((0, 14, 1.05), (math.radians(90), 0, math.radians(180))),
           "end": ((-14, 0, 1.05), (math.radians(90), 0, math.radians(-90)))}[RENDER]
    setup_render(RENDER + ".png", cam[0], cam[1], ortho=7.0, transparent=True)

if RENDER == "plan":
    for o in list(bpy.data.objects):
        if o.name.startswith(("Flap_", "Lid_")): bpy.data.objects.remove(o)
    lights(strength=0.9)
    setup_render("plan.png", (0, 0, 14), (0, 0, 0), ortho=7.4, transparent=True)

if RENDER == "tip":
    # plasterboard bin lifted off the skid by a forklift with a rotator and tipped to its right: the trap door swings open
    sid = "plaster"; th = math.radians(100)
    objs = [o for o in bpy.data.objects if o.name in (f"Bin_{sid}", f"Lid_{sid}", f"Flap_{sid}", f"Door_{sid}", f"Lbl_{sid}")]
    b = next(o for o in bays if o["id"] == sid); bx = b["x0"] + b["len"] / 2
    ym = -(W/2 - RAIL_W + CW/2) / 2
    piv = bpy.data.objects.new("Pivot", None); col_station.objects.link(piv); piv.location = (bx, ym, 1.0)
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted(); o.matrix_world = mw
    # forks and rotator carriage, parented so they turn with the bin
    yf_ = -(W/2 - RAIL_W)
    fk = []
    pc = max(0.30, min(1.0, b["len"] * 0.55))
    for k2 in (-1, 1):
        fk.append(box(f"Fork{k2}", (0.12, DEPTH + 0.2, 0.05), (bx + k2 * pc/2, ym - 0.1, PB + 0.04), M["chassis"]))
    fk.append(box("Carriage", (1.2, 0.08, 0.9), (bx, yf_ - 0.25, PB + 0.4), M["chassis"]))
    fk.append(cyl("Rotator", 0.2, 0.12, (bx, yf_ - 0.32, PB + 0.4), M["copper"], rot=(math.pi/2, 0, 0), verts=24))
    bpy.context.view_layer.update()
    for o in fk:
        mw = o.matrix_world.copy(); o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted(); o.matrix_world = mw
    piv.location = (bx + 0.2, ym - 2.6, 1.0 + 0.9)
    piv.rotation_euler = Euler((0, th, 0))
    d = bpy.data.objects[f"Door_{sid}"]; d.rotation_euler = Euler((0, -th + math.radians(8), 0))
    bpy.data.objects.remove(bpy.data.objects[f"Contents_{sid}"])
    # forklift mast and body (not rotating)
    yfl = yf_ - 2.6 - 0.45
    for xm in (bx - 0.45, bx + 0.45):
        box(f"Mast{xm:+.2f}", (0.1, 0.12, 3.0), (xm + 0.2, yfl, 1.5), M["chassis"])
    box("FLBody", (1.2, 1.6, 1.1), (bx + 0.2, yfl - 0.95, 0.75), M["cupaint"])
    box("FLGuard", (1.1, 1.0, 0.06), (bx + 0.2, yfl - 0.8, 2.15), M["chassis"])
    for xw in (-0.5, 0.5):
        for yw in (-0.35, -1.5):
            cyl(f"Wh{xw}{yw}", 0.28, 0.22, (bx + 0.2 + xw * 1.05, yfl + yw, 0.28), M["ink"], rot=(0, math.pi/2, 0), verts=24)
    # plasterboard tipped onto its own pile
    rng = random.Random(5)
    for p in range(70):
        box("pile", (rng.uniform(0.3, 0.8), rng.uniform(0.3, 0.6), 0.013), (bx + 1.9 + rng.uniform(-0.5, 0.5), ym - 2.6 + rng.uniform(-0.55, 0.55), rng.uniform(0.01, 0.35) * (1 - p / 90)),
            M["plaster"], (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0, 3.1)))
    floor_plane(); lights()
    setup_render("tip.png", (8.6, -6.4, 2.7), (math.radians(78), 0, math.radians(58)), lens=33)
