// The ONE place plan coordinates (mm, x east, y north, z up) become three.js coordinates
// (metres, y up): plan (x, y, z) → three (x, z, -y) · MM.

export const MM = 0.001;

export const toThree = ([x, y], z = 0) => [x * MM, z * MM, -y * MM];

/** Plan direction (e.g. a wall's left normal) → three.js direction (unscaled). */
export const dirToThree = ([x, y]) => [x, 0, -y];

/**
 * Vertical prism: plan polygon extruded from z0 to z1 (mm). The shape is built in plan x/y and
 * extruded along +z, then rotated -90° about X, which maps (x, y, z) → (x, z, -y) as above.
 * holes (floors with a stairwell): polygons cut out of the polygon, clockwise or not.
 * slope (a sloped wall, levelPrisms): { top?, bottom? } as { origin, u, L, a, b }: the top / bottom
 * vertices are moved to the height that runs straight from a (at origin) to b (L mm along u).
 */
export function prismGeometry(THREE, poly, z0, z1, slope = null, holes = null) {
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x * MM, y * MM)));
  // openings through it (a stairwell in a floor): outlines inside the polygon
  for (const h of holes || []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x * MM, y * MM))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(z1 - z0, 0.1) * MM, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, z0 * MM, 0);
  if (slope?.top || slope?.bottom) {
    const pos = g.attributes.position, at = (e, x, y) => e.a + (e.b - e.a) * ((x - e.origin[0]) * e.u[0] + (y - e.origin[1]) * e.u[1]) / (e.L || 1);
    const yTop = (z0 + Math.max(z1 - z0, 0.1)) * MM, yBot = z0 * MM;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / MM, y = -pos.getZ(i) / MM, h = pos.getY(i);        // back to plan mm
      if (slope.top && Math.abs(h - yTop) < 1e-6) pos.setY(i, at(slope.top, x, y) * MM);
      else if (slope.bottom && Math.abs(h - yBot) < 1e-6) pos.setY(i, at(slope.bottom, x, y) * MM);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
  }
  return g;
}

/** A round bar: a smooth cylinder between two points [x, y, z] (plan mm, z up) of the given diameter (a round handrail member, a bracket). */
export function barGeometry(THREE, a, b, diameter) {
  const pa = new THREE.Vector3(...toThree([a[0], a[1]], a[2])), pb = new THREE.Vector3(...toThree([b[0], b[1]], b[2]));
  const dir = pb.clone().sub(pa), length = Math.max(dir.length(), 1e-6);
  const g = new THREE.CylinderGeometry(diameter / 2 * MM, diameter / 2 * MM, length, 24);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2);
  return g;
}

/** A ball (a joint of a round handrail): centre [x, y, z] in plan mm, diameter mm. */
export function ballGeometry(THREE, center, diameter) {
  const g = new THREE.SphereGeometry(diameter / 2 * MM, 24, 16);
  g.translate(...toThree([center[0], center[1]], center[2]));
  return g;
}

/** A round solid: a smooth upright cylinder (centre in plan mm, radius mm) from z0 to z1 mm. */
export function cylinderGeometry(THREE, center, radius, z0, z1) {
  const h = Math.max(z1 - z0, 0.1);
  const g = new THREE.CylinderGeometry(radius * MM, radius * MM, h * MM, 48);
  g.translate(center[0] * MM, (z0 + h / 2) * MM, -center[1] * MM);
  return g;
}
