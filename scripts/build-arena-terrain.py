import bpy
import hashlib
import math
import os
import random
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "public", "terrain")
GLB_PATH = os.path.join(OUT_DIR, "sandstone-basin.glb")
BLEND_PATH = os.path.join(OUT_DIR, "sandstone-basin.blend")
SKIRT_BOTTOM = -1.2
SEED = 20260918


def smoothstep(a, b, value):
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def ground_height(x, z):
    ridge = 0.9 * smoothstep(5.2, 9.2, x)
    channels = sum(0.08 * math.exp(-((x - 4.0) / 0.8) ** 4 - ((z - c) / 1.25) ** 4) for c in (2.0, 6.0, 10.5, 14.5))
    outside = max(2.5 - x, x - 11.5, -1.5 - z, z - 17.5, 0.0)
    rim = 1.4 * smoothstep(0.0, 3.0, outside) * (0.85 + 0.15 * math.sin(0.7 * x + 0.9 * z))
    return 0.12 + ridge - channels + rim


def parse_args():
    argv = sys.argv
    extra = argv[argv.index("--") + 1:] if "--" in argv else []
    return {"force": "--force" in extra}


def guard_outputs(force):
    existing = [path for path in (GLB_PATH, BLEND_PATH) if os.path.exists(path)]
    if existing and not force:
        raise SystemExit(
            "Refusing to overwrite existing terrain assets: "
            + ", ".join(os.path.basename(p) for p in existing)
            + " (re-run with `-- --force` to regenerate)"
        )


def make_material(name, color, roughness=0.92):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


MATERIALS = {}


def setup_materials():
    MATERIALS["sandstone"] = make_material("Sandstone", (0.72, 0.55, 0.36))
    MATERIALS["sandstone_v"] = make_material("Sandstone Var", (0.76, 0.59, 0.39))
    MATERIALS["road"] = make_material("Packed Road", (0.83, 0.73, 0.56))
    MATERIALS["basalt"] = make_material("Basalt", (0.28, 0.27, 0.26))
    MATERIALS["basalt_v"] = make_material("Basalt Var", (0.33, 0.32, 0.30))
    MATERIALS["taupe"] = make_material("Taupe Ramp", (0.51, 0.45, 0.38))
    MATERIALS["sediment"] = make_material("Sediment", (0.42, 0.32, 0.22))
    MATERIALS["sediment_v"] = make_material("Sediment Var", (0.47, 0.36, 0.25))
    MATERIALS["rock"] = make_material("Rock", (0.48, 0.41, 0.33))
    MATERIALS["rock_v"] = make_material("Rock Var", (0.41, 0.36, 0.30))


def is_road(x, z):
    if 3.5 <= x <= 10.5:
        for c in (0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0):
            if abs(z - c) < 0.55:
                return True
    if -0.5 <= z <= 16.5 and (abs(x - 4.0) < 0.7 or abs(x - 10.0) < 0.7):
        return True
    return False


def face_material_name(x, z, face_index):
    if is_road(x, z):
        return "road"
    if x >= 9.2:
        return "basalt_v" if face_index % 7 == 0 else "basalt"
    if x >= 7.5:
        return "taupe"
    for cz in (2.0, 6.0, 10.5, 14.5):
        if (x - 4.0) ** 2 + (z - cz) ** 2 < 1.1 ** 2:
            return "sediment_v" if face_index % 7 == 0 else "sediment"
    return "sandstone_v" if face_index % 7 == 0 else "sandstone"


def build_terrain():
    xs = [x * 0.25 for x in range(-12, 69)]
    zs = [z * 0.25 for z in range(-24, 89)]
    nx, nz = len(xs), len(zs)

    verts = [(x, -z, ground_height(x, z)) for z in zs for x in xs]
    vid = lambda i, j: j * nx + i

    faces = []
    for j in range(nz - 1):
        for i in range(nx - 1):
            v00, v10 = vid(i, j), vid(i + 1, j)
            v01, v11 = vid(i, j + 1), vid(i + 1, j + 1)
            faces.append((v00, v01, v11))
            faces.append((v00, v11, v10))

    loop = [(i, 0) for i in range(nx)]
    loop += [(nx - 1, j) for j in range(1, nz)]
    loop += [(i, nz - 1) for i in range(nx - 2, -1, -1)]
    loop += [(0, j) for j in range(nz - 2, 0, -1)]
    top_ring = [vid(i, j) for i, j in loop]

    bottom_start = len(verts)
    for i, j in loop:
        x, z = xs[i], zs[j]
        verts.append((x, -z, SKIRT_BOTTOM))
    bot_ring = [bottom_start + k for k in range(len(loop))]

    ring_n = len(loop)
    for k in range(ring_n):
        a, b = top_ring[k], top_ring[(k + 1) % ring_n]
        a2, b2 = bot_ring[k], bot_ring[(k + 1) % ring_n]
        faces.append((a, b, b2))
        faces.append((a, b2, a2))
    faces.append(tuple(bot_ring))

    mesh = bpy.data.meshes.new("TerrainMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()

    for name, material in MATERIALS.items():
        mesh.materials.append(material)
    mat_index = {name: i for i, name in enumerate(MATERIALS)}

    grid_faces = (nx - 1) * (nz - 1) * 2
    for poly in mesh.polygons:
        if poly.index < grid_faces:
            cx = sum(verts[v][0] for v in poly.vertices) / 3
            cz = -sum(verts[v][1] for v in poly.vertices) / 3
            poly.material_index = mat_index[face_material_name(cx, cz, poly.index)]
            poly.use_smooth = True
        else:
            poly.material_index = mat_index["sandstone"]

    obj = bpy.data.objects.new("Terrain", mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def inside_clearance(x, z, margin=0.6):
    return (2.5 - margin) <= x <= (11.5 + margin) and (-1.5 - margin) <= z <= (17.5 + margin)


def build_rocks():
    rng = random.Random(SEED)
    spots = []
    north = [(rng.uniform(-2.5, 16.5), rng.uniform(-4.0, -2.5)) for _ in range(4)]
    south = [(rng.uniform(-2.5, 16.5), rng.uniform(19.0, 21.0)) for _ in range(4)]
    west = [(rng.uniform(0.0, 1.0), rng.uniform(-1.0, 17.0)) for _ in range(3)]
    east = [(rng.uniform(13.0, 15.0), rng.uniform(-1.0, 17.0)) for _ in range(3)]
    for x, z in north + south + west + east:
        if inside_clearance(x, z):
            continue
        spots.append((x, z))
    spots = spots[:12]

    rocks = []
    for index, (x, z) in enumerate(spots):
        base_h = ground_height(x, z)
        tall = z < -1.5 or z > 17.5
        layers = rng.randint(2, 3)
        objects = []
        for layer in range(layers):
            radius = rng.uniform(0.5, 0.95) * (1.0 - 0.28 * layer)
            height = rng.uniform(0.35, 0.9 if tall else 0.45)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0)
            piece = bpy.context.active_object
            piece.scale = (
                radius * rng.uniform(0.9, 1.25),
                radius * rng.uniform(0.75, 1.1),
                height,
            )
            piece.rotation_euler[2] = rng.uniform(0, math.pi)
            piece.location = (
                x + rng.uniform(-0.12, 0.12),
                -z + rng.uniform(-0.12, 0.12),
                base_h + height * (0.35 + layer * 0.62),
            )
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            objects.append(piece)
        for piece in objects:
            piece.name = f"Rock_{index:02d}"
            piece.data.materials.append(MATERIALS["rock_v" if index % 3 == 0 else "rock"])
            for poly in piece.data.polygons:
                poly.use_smooth = False
        bpy.ops.object.select_all(action="DESELECT")
        for piece in objects:
            piece.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        rock = bpy.context.active_object
        rock.name = f"Rock_{index:02d}"
        rocks.append(rock)
    return rocks


def export():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_skins=False,
        export_morph=False,
    )
    with open(GLB_PATH, "rb") as handle:
        digest = hashlib.sha256(handle.read()).hexdigest()
    print(f"EXPORTED {GLB_PATH} bytes={os.path.getsize(GLB_PATH)} sha256={digest}")


def main():
    args = parse_args()
    guard_outputs(args["force"])
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            datablocks.remove(block)
    setup_materials()
    build_terrain()
    build_rocks()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    export()


if __name__ == "__main__":
    main()
