// GeoJSON into the yard (decision 308): read a GeoJSON file (a lawn mower's map, a drawing from a map site) and turn its shapes
// into the plan's coordinates with the house's `site` (georef origin, north angle). Pure.
//
// Coordinates are WGS 84 longitude/latitude as the GeoJSON standard says, unless the file names EPSG:3006 in an old-style
// `crs` member or its numbers are too large for degrees: then they are SWEREF 99 TM metres (east, north). WGS 84 is turned
// into SWEREF 99 TM with Lantmäteriet's Gauss–Krüger formulas (GRS 80, central meridian 15° E, scale 0.9996, false easting
// 500 000 m), and SWEREF 99 TM into the plan with the site.

const A_AXIS = 6378137, FLAT = 1 / 298.257222101, K0 = 0.9996, LON0 = 15, FE = 500000;
const E2 = FLAT * (2 - FLAT), N_ = FLAT / (2 - FLAT), A_HAT = A_AXIS / (1 + N_) * (1 + N_ ** 2 / 4 + N_ ** 4 / 64);
const RAD = Math.PI / 180;

/** WGS 84 (SWEREF 99 is the same within centimetres) latitude, longitude in degrees → SWEREF 99 TM [east, north] in metres. */
export function toSweref(lat, lon) {
  const n = N_, e2 = E2, phi = lat * RAD, dl = (lon - LON0) * RAD;
  const A = e2, B = (5 * e2 ** 2 - e2 ** 3) / 6, C = (104 * e2 ** 3 - 45 * e2 ** 4) / 120, D = (1237 * e2 ** 4) / 1260;
  const s = Math.sin(phi), c = Math.cos(phi);
  const phiS = phi - s * c * (A + B * s ** 2 + C * s ** 4 + D * s ** 6);
  const xi = Math.atan(Math.tan(phiS) / Math.cos(dl)), eta = Math.atanh(Math.cos(phiS) * Math.sin(dl));
  const b = [n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16 + (41 * n ** 4) / 180, (13 * n ** 2) / 48 - (3 * n ** 3) / 5 + (557 * n ** 4) / 1440, (61 * n ** 3) / 240 - (103 * n ** 4) / 140, (49561 * n ** 4) / 161280];
  let x = xi, y = eta;
  b.forEach((bi, i) => { const k = 2 * (i + 1); x += bi * Math.sin(k * xi) * Math.cosh(k * eta); y += bi * Math.cos(k * xi) * Math.sinh(k * eta); });
  return [FE + K0 * A_HAT * y, K0 * A_HAT * x];
}

/** SWEREF 99 TM [east, north] in metres → [latitude, longitude] in degrees (the inverse of toSweref). */
export function fromSweref(E, N) {
  const n = N_, e2 = E2, xi = N / (K0 * A_HAT), eta = (E - FE) / (K0 * A_HAT);
  const d = [n / 2 - (2 * n ** 2) / 3 + (37 * n ** 3) / 96 - n ** 4 / 360, n ** 2 / 48 + n ** 3 / 15 - (437 * n ** 4) / 1440, (17 * n ** 3) / 480 - (37 * n ** 4) / 840, (4397 * n ** 4) / 161280];
  let x = xi, y = eta;
  d.forEach((di, i) => { const k = 2 * (i + 1); x -= di * Math.sin(k * xi) * Math.cosh(k * eta); y -= di * Math.cos(k * xi) * Math.sinh(k * eta); });
  const phiS = Math.asin(Math.sin(x) / Math.cosh(y)), dl = Math.atan(Math.sinh(y) / Math.cos(x));
  const As = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4, Bs = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6, Cs = (224 * e2 ** 3 + 889 * e2 ** 4) / 120, Ds = -(4279 * e2 ** 4) / 1260;
  const s = Math.sin(phiS), c = Math.cos(phiS);
  const phi = phiS + s * c * (As + Bs * s ** 2 + Cs * s ** 4 + Ds * s ** 6);
  return [phi / RAD, LON0 + dl / RAD];
}

/** SWEREF 99 TM [east, north] (m) → a plan point [x, y] (mm), with the site's georef origin and north angle; null without a georef. */
export function mapToPlan([E, N], site) {
  const o = site?.georef?.origin;
  if (!Array.isArray(o)) return null;
  const a = ((site.northAngleDeg ?? 0) * Math.PI) / 180, dE = E - o[0], dN = N - o[1];
  return [Math.round((dE * Math.cos(a) - dN * Math.sin(a)) * 1000), Math.round((dE * Math.sin(a) + dN * Math.cos(a)) * 1000)];
}

// what a shape probably is, from its properties' words (a mower's no-go zone, a path, a mowing area)
const OBSTACLE = /obstacle|no.?go|forbidden|exclu|hinder|block|safety/i, PATH = /path|channel|passage|corridor|road|route/i, PLANNED = /planned path|mow(ing)? path|route plan/i;
function guess(geom, props) {
  const words = Object.values(props || {}).filter(v => typeof v === 'string').join(' ');
  if (geom === 'area') return OBSTACLE.test(words) ? { surface: 'other', note: /safety/i.test(words) ? 'a zone the mower avoids' : 'no-go zone' } : PATH.test(words) ? { surface: 'gravel', note: 'path' } : { surface: 'grass' };
  if (geom === 'line') return PLANNED.test(words) ? { kind: 'edging', note: 'the mower\'s planned path', skip: true } : { kind: 'edging' };
  return {};
}
const nameOf = (props, i) => {
  for (const k of ['name', 'Name', 'NAME', 'title', 'label', 'area_name', 'zone_name', 'type', 'kind']) if (typeof props?.[k] === 'string' && props[k].trim()) return props[k].trim().slice(0, 80);
  return `Shape ${i + 1}`;
};

/**
 * The shapes of a GeoJSON document (text or parsed) in plan coordinates:
 * { shapes: [{ n, name, geom: 'area' | 'line' | 'point', points: [[x, y] mm…], z?: mm (a point's height, when the file has one
 * and the site a ground-floor height), surface? | kind?, note?, holes? }], crs: 'WGS84' | 'EPSG:3006', warnings: [text] }.
 */
export function readGeoJson(doc, site) {
  const warnings = [];
  let g = doc;
  if (typeof doc === 'string') { try { g = JSON.parse(doc); } catch { return { shapes: [], crs: null, warnings: ['The file is not JSON.'] }; } }
  if (!site?.georef?.origin) return { shapes: [], crs: null, warnings: ['The house has no position on the map (site.georef), so the shapes cannot be placed.'] };
  const feats = [];
  const take = (geometry, props) => { if (geometry) feats.push({ geometry, props: props || {} }); };
  if (g?.type === 'FeatureCollection') for (const f of g.features || []) take(f?.geometry, f?.properties);
  else if (g?.type === 'Feature') take(g.geometry, g.properties);
  else if (g?.type) take(g, {});
  if (!feats.length) return { shapes: [], crs: null, warnings: ['No shapes found (expected a GeoJSON FeatureCollection, Feature or geometry).'] };
  // which coordinates: EPSG:3006 when the file says so or the numbers are metres, else WGS 84
  const named = JSON.stringify(g?.crs || '');
  const sample = [];
  const walk = c => { if (typeof c?.[0] === 'number') sample.push(c); else if (Array.isArray(c)) c.forEach(walk); };
  for (const f of feats) walk(f.geometry.coordinates ?? f.geometry.geometries?.map(x => x.coordinates));
  const metres = /3006/.test(named) || sample.some(c => Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90);
  const crs = metres ? 'EPSG:3006' : 'WGS84';
  const toPlan = c => mapToPlan(metres ? [c[0], c[1]] : toSweref(c[1], c[0]), site);
  const floor = site.georef.groundFloorHeight;
  const shapes = [];
  const add = (geom, coords, props, extra = {}) => {
    let points = coords.map(toPlan);
    if (geom === 'area') {                                                 // drop the ring's closing point
      const [a, b] = [points[0], points[points.length - 1]];
      if (points.length > 3 && a[0] === b[0] && a[1] === b[1]) points = points.slice(0, -1);
      if (points.length < 3) return;
    }
    if (geom === 'line' && points.length < 2) return;
    const z = geom === 'point' && Number.isFinite(coords[0]?.[2]) && Number.isFinite(floor) ? Math.round((coords[0][2] - floor) * 1000) : undefined;
    const i = shapes.length;
    shapes.push({ n: i, name: nameOf(props, i), geom, points, ...(z !== undefined ? { z } : {}), ...guess(geom, props), ...extra });
  };
  const one = (geo, props) => {
    const c = geo.coordinates;
    switch (geo.type) {
      case 'Polygon': add('area', c[0], props, c.length > 1 ? { holes: c.length - 1 } : {}); break;
      case 'MultiPolygon': for (const p of c) add('area', p[0], props, p.length > 1 ? { holes: p.length - 1 } : {}); break;
      case 'LineString': add('line', c, props); break;
      case 'MultiLineString': for (const l of c) add('line', l, props); break;
      case 'Point': add('point', [c], props); break;
      case 'MultiPoint': for (const p of c) add('point', [p], props); break;
      case 'GeometryCollection': for (const x of geo.geometries || []) one(x, props); break;
      default: warnings.push(`A ${geo.type || 'shape'} of an unknown kind was skipped.`);
    }
  };
  for (const f of feats) one(f.geometry, f.props);
  if (shapes.some(s => s.holes)) warnings.push('Some areas have holes in the file; only their outer outline is taken (draw the holes as areas on top).');
  // far from the house: probably the wrong coordinates (or the wrong house)
  const far = shapes.filter(s => s.points.some(p => Math.hypot(p[0], p[1]) > 2000000)).length;
  if (far) warnings.push(`${far} shape${far > 1 ? 's are' : ' is'} more than 2 km from the house: check that the file is for this place and in WGS 84 or SWEREF 99 TM.`);
  return { shapes, crs, warnings };
}
