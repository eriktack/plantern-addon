// lib/geom.js
// Turns a jscad geom3 into a triangle mesh in plan millimetres (z up).
// Pure: no DOM, no files. Mesh format: { pos: [[x,y,z],...], nrm: [[x,y,z],...], idx: [i,...], uv?: [[u,v],...] }
// Every triangle has its own three vertices, so each face keeps a flat normal (and its own UVs).

import { geometries } from './jscad.js';

/** Newell's method: the normal of a (convex or simple) polygon from its ordered vertices. */
function polygonNormal(vs) {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i], b = vs[(i + 1) % vs.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(x, y, z);
  return len > 0 ? [x / len, y / len, z / len] : null;
}

export function emptyMesh() {
  return { pos: [], nrm: [], idx: [] };
}

/** Converts a geom3 to a mesh. Fan-triangulates each polygon (jscad polygons are convex). */
export function geomToMesh(geom) {
  const mesh = emptyMesh();
  for (const poly of geometries.geom3.toPolygons(geom)) {
    const vs = poly.vertices;
    if (vs.length < 3) continue;
    const n = polygonNormal(vs);
    if (!n) continue; // degenerate sliver: no face to draw
    for (let i = 1; i < vs.length - 1; i++) {
      const base = mesh.pos.length;
      for (const v of [vs[0], vs[i], vs[i + 1]]) {
        mesh.pos.push([v[0], v[1], v[2]]);
        mesh.nrm.push(n);
      }
      mesh.idx.push(base, base + 1, base + 2);
    }
  }
  return mesh;
}

/**
 * Planar UVs for a textured material: each vertex is projected onto the plane of its face, along
 * the two plan axes that face best (top and bottom: x and y; walls facing x: y and z; the rest: x and z).
 * Coordinates are divided by uvScale (mm per repeat), so the texture keeps its real size on every part.
 * Returns the mesh with uv set (the input is not changed).
 */
export function addPlanarUvs(mesh, uvScale) {
  if (!(uvScale > 0)) throw new Error('uvScale must be above 0 mm');
  const uv = mesh.nrm.map((n, k) => {
    const [x, y, z] = mesh.pos[k];
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    if (az >= ax && az >= ay) return [x / uvScale, y / uvScale];
    if (ax >= ay) return [y / uvScale, z / uvScale];
    return [x / uvScale, z / uvScale];
  });
  return { ...mesh, uv };
}

export function triangleCount(mesh) {
  return mesh.idx.length / 3;
}

/** Axis-aligned bounds { min, max } of a mesh, or null when it has no vertices. */
export function meshBounds(mesh) {
  if (mesh.pos.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.pos) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < min[k]) min[k] = p[k];
      if (p[k] > max[k]) max[k] = p[k];
    }
  }
  return { min, max };
}

/**
 * Number of edges that are not shared by exactly two triangles (after snapping vertices to
 * `tolerance` mm, so corners that were split by booleans still match). 0 means a closed surface.
 * Booleans leave T-junctions, so the checker reports this as a warning, not an error.
 */
export function openEdgeCount(mesh, tolerance = 0.001) {
  const key = p => p.map(v => Math.round(v / tolerance)).join(',');
  const counts = new Map();
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const k = [0, 1, 2].map(j => key(mesh.pos[mesh.idx[t + j]]));
    for (let j = 0; j < 3; j++) {
      const a = k[j], b = k[(j + 1) % 3];
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(edge, (counts.get(edge) || 0) + 1);
    }
  }
  let open = 0;
  for (const c of counts.values()) if (c !== 2) open++;
  return open;
}
