"""BIG station — parametric Blender model.
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
L, W, H = cfg["body"]["length"], cfg["body"]["width"], cfg["body"]["height"]
RAIL = 0.22                         # chassis rail height
WALL = 0.04
FLAP_BOTTOM = 1.0                   # top-hinged loading flap spans FLAP_BOTTOM..H (from body floor)
random.seed(7)

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

# ---------- partition streams into two sides (4 + 4) with balanced volume ----------
best = None
idx = list(range(len(streams)))
for combo in itertools.combinations(idx, 4):
    if 0 not in combo: continue                      # fix symmetry
    a = sum(streams[i]["share"] for i in combo)
    d = abs(a - 0.5)
    if best is None or d < best[0]: best = (d, combo)
sideA = [i for i in idx if i in best[1]]
sideB = [i for i in idx if i not in best[1]]
# order along length: heaviest kind (rubble) toward the middle for balance
def order(side):
    s = sorted(side, key=lambda i: -streams[i]["share"])
    return s[0::2] + s[1::2][::-1]
sides = [("A", order(sideA), +1), ("B", order(sideB), -1)]

# ---------- chassis ----------
z0 = RAIL
for y in (-0.55, 0.55):
    box(f"Rail{y}", (L - 0.2, 0.14, RAIL), (0, y, RAIL / 2), M["chassis"])
for x in (-L/2 + 0.35,):
    pass
for y in (-0.75, 0.75):
    cyl(f"Roller{y}", 0.12, 0.22, (-L/2 + 0.25, y, 0.12), M["chassis"], rot=(math.pi/2, 0, 0), verts=20)
# hook A-frame at front (+x)
fx = L/2
box("HookPost", (0.12, 0.12, H + 0.15), (fx + 0.12, 0, z0 + (H + 0.15)/2), M["chassis"])
for y in (-0.55, 0.55):
    o = box(f"HookBrace{y}", (0.1, 0.1, H * 1.02), (fx + 0.07, y * 0.55, z0 + H/2), M["chassis"], rot=(-y * 0.42, 0, 0))
bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.035, location=(fx + 0.12, 0, z0 + H + 0.22), rotation=(math.pi/2, 0, 0))
link(bpy.context.active_object).data.materials.append(M["chassis"])

# ---------- body shell ----------
iz = z0 + WALL
box("Floor", (L, W, WALL), (0, 0, z0 + WALL/2), M["body"])
box("EndFront", (WALL, W, H), (L/2 - WALL/2, 0, z0 + H/2), M["body"])
box("EndRear", (WALL, W, H), (-L/2 + WALL/2, 0, z0 + H/2), M["body"])
box("Spine", (L - 2*WALL, WALL, H - WALL), (0, 0, z0 + WALL + (H - WALL)/2), M["body_in"])
# weatherproof roof (removed for plan cutaway)
box("Roof", (L + 0.04, W + 0.04, 0.05), (0, 0, z0 + H + 0.025), M["body"])
box("RoofRidge", (L + 0.04, 0.3, 0.03), (0, 0, z0 + H + 0.065), M["copper"])
# copper top band
for y in (-W/2, W/2):
    box(f"Band{y}", (L + 0.02, 0.025, 0.09), (0, y, z0 + H - 0.045), M["copper"])
for x in (-L/2, L/2):
    box(f"BandEnd{x}", (0.025, W + 0.02, 0.09), (x, 0, z0 + H - 0.045), M["copper"])

# rear end branding
text("RearBIG", "BIG", (-L/2 - 0.006, 0.0, z0 + 0.75), (math.pi/2, 0, -math.pi/2), 0.62, M["white"], align='CENTER', extrude=0.006)
text("RearTag", "THINK BIG. RECYCLE BETTER.", (-L/2 - 0.006, 0.0, z0 + 0.48), (math.pi/2, 0, -math.pi/2), 0.11, M["copper"], align='CENTER')

inner_L = L - 2 * WALL
half_W = (W - 3 * WALL) / 2
inner_H = H - WALL

bays = []  # for json export
for side_name, order_idx, sgn in sides:
    tot = sum(streams[i]["share"] for i in order_idx)
    x = -L/2 + WALL
    for k, i in enumerate(order_idx):
        s = streams[i]
        bl = inner_L * s["share"] / tot
        cx = x + bl / 2
        y_out = sgn * (W/2 - WALL/2)
        y_mid = sgn * (WALL/2 + half_W/2 + WALL/2)
        # outer lower wall
        box(f"Wall_{s['id']}", (bl, WALL, FLAP_BOTTOM), (cx, y_out, z0 + FLAP_BOTTOM/2), M["body"])
        # divider at end of bay
        if k < len(order_idx) - 1:
            box(f"Div_{s['id']}", (WALL * 0.8, half_W + WALL, inner_H), (x + bl, y_mid, iz + inner_H/2), M["body_in"])
        # top-hinged flap (open on some bays)
        fh = H - FLAP_BOTTOM - 0.09
        open_a = cfg.get("open_flaps", {}).get(s["id"], 0) * math.pi / 180
        hinge = Vector((cx, y_out, z0 + H - 0.09))
        bpy.ops.mesh.primitive_cube_add(size=1)
        f = bpy.context.active_object; f.name = f"Flap_{s['id']}"
        f.scale = (bl - 0.03, WALL, fh); bpy.ops.object.transform_apply(scale=True)
        # move origin to hinge (top edge)
        for v in f.data.vertices: v.co.z -= fh / 2
        f.location = hinge
        f.rotation_euler = Euler((sgn * open_a, 0, 0))
        f.data.materials.append(M["flap"]); link(f)
        # number + name on lower wall
        face_y = sgn * (W/2 + 0.003)
        rz = 0 if sgn < 0 else math.pi
        tx_dir = 1 if sgn < 0 else -1
        left_x = cx - tx_dir * (bl/2 - 0.12)
        text(f"Num_{s['id']}", f"{s['n']:02d}", (left_x, face_y, z0 + 0.42), (math.pi/2, 0, rz), 0.42 if bl > 0.55 else 0.3, M["copper"], align='LEFT')
        lbl_size = min(0.13, max(0.07, bl / (len(s["short"]) * 0.75)))
        text(f"Lbl_{s['id']}", s["short"].upper(), (left_x, face_y, z0 + 0.22), (math.pi/2, 0, rz), lbl_size, M["white"], align='LEFT')
        bays.append({"id": s["id"], "side": side_name, "x0": round(x, 3), "len": round(bl, 3),
                     "vol_m3": round(bl * half_W * inner_H, 2)})
        # ---------- contents ----------
        fill = 0.45 + 0.25 * random.random()
        kind = s["kind"]
        pieces = []
        rng = random.Random(i * 31)
        n = max(6, int(bl * (60 if kind == "rubble" else 22)))
        for p in range(n):
            px = cx + rng.uniform(-bl/2 + 0.08, bl/2 - 0.08)
            py = y_mid + rng.uniform(-half_W/2 + 0.1, half_W/2 - 0.1)
            pz = iz + rng.uniform(0.03, inner_H * fill)
            rot = (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), rng.uniform(0, math.pi))
            if kind == "timber":
                o = box("c", (rng.uniform(0.5, min(1.2, bl)), 0.09, 0.045), (px, py, pz), M["timber"], rot)
            elif kind == "plaster":
                o = box("c", (rng.uniform(0.35, min(0.9, bl)), rng.uniform(0.3, 0.6), 0.013), (px, py, pz), M["plaster"], rot)
            elif kind == "card":
                o = box("c", (rng.uniform(0.3, min(0.8, bl)), rng.uniform(0.3, 0.6), 0.02), (px, py, pz), M["card"], rot)
            elif kind == "eps":
                o = box("c", (rng.uniform(0.2, 0.5), rng.uniform(0.15, 0.4), rng.uniform(0.06, 0.2)), (px, py, pz), M["eps"], rot)
            elif kind == "rubble":
                pz = iz + rng.uniform(0.02, inner_H * fill * 0.45)
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rng.uniform(0.05, 0.11), location=(px, py, pz))
                o = link(bpy.context.active_object); o.scale = (rng.uniform(.8, 1.6), rng.uniform(.8, 1.3), rng.uniform(.5, .9))
                o.data.materials.append(M["brick"] if rng.random() < 0.6 else M["concrete"])
            elif kind == "steel":
                if rng.random() < 0.5:
                    o = cyl("c", rng.uniform(0.014, 0.024), rng.uniform(0.5, 1.2), (px, py, pz), M["steel"], (math.pi/2 + rot[0] * 0.3, 0, rot[2]), verts=8)
                else:
                    o = box("c", (rng.uniform(0.3, 0.8), rng.uniform(0.05, 0.25), 0.012), (px, py, pz), M["steel"], rot)
            elif kind == "plastic":
                bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=rng.uniform(0.12, 0.22), location=(px, py, pz))
                o = link(bpy.context.active_object); o.scale = (1.3, 1, 0.6); o.rotation_euler = rot
                o.data.materials.append(M["plastic"])
            else:  # general bags
                bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=rng.uniform(0.18, 0.26), location=(px, py, pz))
                o = link(bpy.context.active_object); o.scale = (1, 0.9, 0.75); o.rotation_euler = rot
                o.data.materials.append(M["bag"])
            # keep every piece inside its bay
            bpy.context.view_layer.update()
            pad = 0.03
            bx0, bx1 = x + pad, x + bl - pad
            by0, by1 = y_mid - half_W/2 + pad, y_mid + half_W/2 - pad
            for _ in range(2):
                bpy.context.view_layer.update()
                pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
                mnx, mxx = min(p.x for p in pts), max(p.x for p in pts)
                mny, mxy = min(p.y for p in pts), max(p.y for p in pts)
                sx = (bx1 - bx0) / max(1e-6, mxx - mnx); sy = (by1 - by0) / max(1e-6, mxy - mny)
                sc = min(1.0, sx, sy)
                if sc < 1.0: o.scale = tuple(v * sc * 0.98 for v in o.scale)
                bpy.context.view_layer.update()
                pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
                mnx, mxx = min(p.x for p in pts), max(p.x for p in pts)
                mny, mxy = min(p.y for p in pts), max(p.y for p in pts)
                dx = max(0, bx0 - mnx) - max(0, mxx - bx1)
                dy = max(0, by0 - mny) - max(0, mxy - by1)
                o.location.x += dx; o.location.y += dy
                mnz = min(p.z for p in pts)
                if mnz < iz: o.location.z += iz - mnz + 0.005
            pieces.append(o)
        bpy.ops.object.select_all(action='DESELECT')
        for o in pieces: o.select_set(True)
        bpy.context.view_layer.objects.active = pieces[0]
        bpy.ops.object.join(); pieces[0].name = f"Contents_{s['id']}"
        x += bl

json.dump({"bays": bays, "internal_m3_each_bay_total": round(sum(b['vol_m3'] for b in bays), 2)},
          open(os.path.join(OUT, "bays.json"), "w"), indent=1)
print("BAYS", json.dumps(bays))

if GLB:
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "big-station.glb"), export_format='GLB',
                              use_selection=False, export_apply=True)
    print("GLB written")

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

if RENDER in ("hero", "all"):
    bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
    g = bpy.context.active_object; g.data.materials.append(mat("Floor", "#1A1E22", 0.0, 0.85))
    lights()
    setup_render("hero.png", (8.6, -7.4, 3.3), (math.radians(78), 0, math.radians(49)), lens=38)

if RENDER == "side":
    lights(strength=0.9)
    scene.render.resolution_x = RES
    setup_render("side.png", (0, -14, 1.35), (math.radians(90), 0, 0), ortho=7.6, transparent=True)

if RENDER in ("plan", "all"):
    # remove flaps for a clear plan view
    for o in list(bpy.data.objects):
        if o.name.startswith(("Flap_", "Roof")): bpy.data.objects.remove(o)
    lights(strength=0.9)
    setup_render("plan.png", (0, 0, 14), (0, 0, 0), ortho=7.4, transparent=True)
