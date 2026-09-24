#!/usr/bin/env python3
"""Export a print-ready binary STL from a plain (non-Draco) GLB.

Usage:
    python3 scripts/export-print-stl.py public/assets/mint/champion-rover.glb public/prints/champion-rover.stl

Walks the scene graph accumulating node transforms, triangulates all mesh
primitives (indexed or not), and writes a single binary STL in +Y-up GLB
space. Prints bounding-box dimensions in model units plus triangle count so
the printer profile in docs/PRINT_KIT.md stays honest.

Stdlib only. Refuses Draco-compressed inputs rather than guessing.
"""

import json
import struct
import sys
from pathlib import Path

COMPONENT_TYPES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
COMPONENT_FORMATS = {
    5120: ("b", 1),  # BYTE
    5121: ("B", 1),  # UNSIGNED_BYTE
    5122: ("h", 2),  # SHORT
    5123: ("H", 2),  # UNSIGNED_SHORT
    5125: ("I", 4),  # UNSIGNED_INT
    5126: ("f", 4),  # FLOAT
}


def read_accessor(doc, binary, index):
    accessor = doc["accessors"][index]
    view = doc["bufferViews"][accessor["bufferView"]]
    fmt, size = COMPONENT_FORMATS[accessor["componentType"]]
    count = accessor["count"]
    num_components = COMPONENT_TYPES[accessor["type"]]
    stride = view.get("byteStride", size * num_components)
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    values = []
    for i in range(count):
        offset = base + i * stride
        values.append(struct.unpack_from(f"<{num_components}{fmt}", binary, offset))
    return values


def node_matrix(node):
    if "matrix" in node:
        m = node["matrix"]  # column-major
        return [list(m[0:16][r::4]) for r in range(4)]  # to row-major 4x4
    t = node.get("translation", [0, 0, 0])
    r = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    x, y, z, w = r
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    rot = [
        [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
        [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
        [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
    ]
    return [
        [rot[0][0] * s[0], rot[0][1] * s[1], rot[0][2] * s[2], t[0]],
        [rot[1][0] * s[0], rot[1][1] * s[1], rot[1][2] * s[2], t[1]],
        [rot[2][0] * s[0], rot[2][1] * s[1], rot[2][2] * s[2], t[2]],
        [0, 0, 0, 1],
    ]


def mat_mul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def mat_vec(m, v):
    x = m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2] + m[0][3]
    y = m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2] + m[1][3]
    z = m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2] + m[2][3]
    return (x, y, z)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    data = src.read_bytes()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        sys.exit("Not a GLB file")
    chunk_len, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A:
        sys.exit("First chunk is not JSON")
    doc = json.loads(data[20 : 20 + chunk_len].decode("utf-8"))
    offset = 20 + chunk_len
    binary = b""
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        if chunk_type == 0x004E4942:
            binary = data[offset + 8 : offset + 8 + chunk_len]
        offset += 8 + chunk_len

    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            if "KHR_draco_mesh_compression" in prim.get("extensions", {}):
                sys.exit("Draco-compressed GLB: decode with three.js/Draco first; refusing to guess")

    identity = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
    triangles = []

    def visit(node_index, parent):
        node = doc["nodes"][node_index]
        world = mat_mul(parent, node_matrix(node))
        if "mesh" in node:
            for prim in doc["meshes"][node["mesh"]]["primitives"]:
                if prim.get("mode", 4) != 4:
                    continue  # triangles only
                positions = read_accessor(doc, binary, prim["attributes"]["POSITION"])
                if "indices" in prim:
                    indices = [v[0] for v in read_accessor(doc, binary, prim["indices"])]
                    faces = [indices[i : i + 3] for i in range(0, len(indices), 3)]
                else:
                    faces = [
                        [i, i + 1, i + 2] for i in range(0, len(positions), 3)
                    ]
                for a, b, c in faces:
                    triangles.append(
                        (mat_vec(world, positions[a]), mat_vec(world, positions[b]), mat_vec(world, positions[c]))
                    )
        for child in node.get("children", []):
            visit(child, world)

    scenes = doc.get("scenes", [])
    default_scene = doc.get("scene", 0)
    roots = scenes[default_scene]["nodes"] if scenes else list(range(len(doc.get("nodes", []))))
    for root in roots:
        visit(root, identity)

    if not triangles:
        sys.exit("No triangles found")

    dst.parent.mkdir(parents=True, exist_ok=True)
    with dst.open("wb") as out:
        out.write(b"\0" * 80)
        out.write(struct.pack("<I", len(triangles)))
        for (ax, ay, az), (bx, by, bz), (cx, cy, cz) in triangles:
            ux, uy, uz = bx - ax, by - ay, bz - az
            vx, vy, vz = cx - ax, cy - ay, cz - az
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            length = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
            out.write(struct.pack("<12fH", nx / length, ny / length, nz / length,
                                  ax, ay, az, bx, by, bz, cx, cy, cz, 0))

    xs = [p[0] for tri in triangles for p in tri]
    ys = [p[1] for tri in triangles for p in tri]
    zs = [p[2] for tri in triangles for p in tri]
    print(f"triangles: {len(triangles)}")
    print(f"bbox x: {min(xs):.4f}..{max(xs):.4f}  (dx={max(xs)-min(xs):.4f})")
    print(f"bbox y: {min(ys):.4f}..{max(ys):.4f}  (dy={max(ys)-min(ys):.4f})")
    print(f"bbox z: {min(zs):.4f}..{max(zs):.4f}  (dz={max(zs)-min(zs):.4f})")
    print(f"wrote: {dst}")


if __name__ == "__main__":
    main()
