// Geography (pure): latitude/longitude <-> SWEREF 99 TM (EPSG:3006), the grid Swedish maps and elevation data use,
// PLANTERN.md §3 and docs/archive/place-the-house-slice-a.md: the projection (A1), the grid convergence and reading a
// position from text (A2, A3), and the transform between a house's plan and the world (A4, at the end of the file).
//
// SWEREF 99 TM is a transverse Mercator projection on the GRS80 ellipsoid: central meridian 15° E, scale factor 0.9996,
// false easting 500 000 m, false northing 0. Both directions use the Krüger n-series (the formulas Lantmäteriet publishes
// for the Gauss-Krüger projection), accurate to well under a millimetre across Sweden.
//
// Datum: SWEREF 99 and WGS84 (what GPS, maps and OpenStreetMap use) agree to within about a metre; this module treats a
// WGS84 latitude/longitude as a SWEREF 99 one, so the position it gives can be off by up to about a metre. That is far
// below the accuracy of placing a house on a map, so no datum shift is applied.
//
// Units: lengths here are metres (the unit these grids are defined in; the one place besides `site.georef` where Plantern
// is not in mm, PLANTERN.md §2). Angles are degrees.

const A = 6378137.0;                    // GRS80 semi-major axis, m
const F = 1 / 298.257222101;            // GRS80 flattening
export const SWEREF99TM = Object.freeze({ crs: 'EPSG:3006', centralMeridianDeg: 15, scale: 0.9996, falseEasting: 500000, falseNorthing: 0 });

const E2 = F * (2 - F);                 // first eccentricity squared
const N = F / (2 - F);                  // third flattening
const N2 = N * N, N3 = N2 * N, N4 = N3 * N;
const A_ROOF = A / (1 + N) * (1 + N2 / 4 + N4 / 64);   // rectifying radius

// geodetic -> grid
const AA = E2, BB = (5 * E2 ** 2 - E2 ** 3) / 6, CC = (104 * E2 ** 3 - 45 * E2 ** 4) / 120, DD = 1237 * E2 ** 4 / 1260;
const BETA = [
  N / 2 - 2 * N2 / 3 + 5 * N3 / 16 + 41 * N4 / 180,
  13 * N2 / 48 - 3 * N3 / 5 + 557 * N4 / 1440,
  61 * N3 / 240 - 103 * N4 / 140,
  49561 * N4 / 161280,
];
// grid -> geodetic
const DELTA = [
  N / 2 - 2 * N2 / 3 + 37 * N3 / 96 - N4 / 360,
  N2 / 48 + N3 / 15 - 437 * N4 / 1440,
  17 * N3 / 480 - 37 * N4 / 840,
  4397 * N4 / 161280,
];
const AS = E2 + E2 ** 2 + E2 ** 3 + E2 ** 4;
const BS = -(7 * E2 ** 2 + 17 * E2 ** 3 + 30 * E2 ** 4) / 6;
const CS = (224 * E2 ** 3 + 889 * E2 ** 4) / 120;
const DS = -(4279 * E2 ** 4) / 1260;

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const finite = (...v) => v.every(x => typeof x === 'number' && Number.isFinite(x));

/**
 * WGS84 latitude/longitude (degrees) -> SWEREF 99 TM { e, n } (metres: east, north).
 * Throws on a non-number or a latitude outside ±90°. Meaningful within a few degrees either side of 15° E, which covers
 * Sweden (the series is still accurate to a millimetre at ±10°).
 */
export function wgs84ToSweref99tm(lat, lon) {
  if (!finite(lat, lon) || Math.abs(lat) > 90) throw new RangeError(`not a latitude and longitude: ${lat}, ${lon}`);
  const phi = rad(lat), sin = Math.sin(phi), cos = Math.cos(phi);
  const phiStar = phi - sin * cos * (AA + BB * sin ** 2 + CC * sin ** 4 + DD * sin ** 6);
  const dLon = rad(lon - SWEREF99TM.centralMeridianDeg);
  const xiP = Math.atan(Math.tan(phiStar) / Math.cos(dLon));
  const etaP = Math.atanh(Math.cos(phiStar) * Math.sin(dLon));
  let xi = xiP, eta = etaP;
  BETA.forEach((b, i) => {
    const j = 2 * (i + 1);
    xi += b * Math.sin(j * xiP) * Math.cosh(j * etaP);
    eta += b * Math.cos(j * xiP) * Math.sinh(j * etaP);
  });
  return {
    e: SWEREF99TM.scale * A_ROOF * eta + SWEREF99TM.falseEasting,
    n: SWEREF99TM.scale * A_ROOF * xi + SWEREF99TM.falseNorthing,
  };
}

/** SWEREF 99 TM (e, n in metres) -> WGS84 { lat, lon } in degrees. Throws on a non-number. */
export function sweref99tmToWgs84(e, n) {
  if (!finite(e, n)) throw new RangeError(`not a SWEREF 99 TM position: ${e}, ${n}`);
  const xi = (n - SWEREF99TM.falseNorthing) / (SWEREF99TM.scale * A_ROOF);
  const eta = (e - SWEREF99TM.falseEasting) / (SWEREF99TM.scale * A_ROOF);
  let xiP = xi, etaP = eta;
  DELTA.forEach((d, i) => {
    const j = 2 * (i + 1);
    xiP -= d * Math.sin(j * xi) * Math.cosh(j * eta);
    etaP -= d * Math.cos(j * xi) * Math.sinh(j * eta);
  });
  const phiStar = Math.asin(Math.sin(xiP) / Math.cosh(etaP));
  const dLon = Math.atan(Math.sinh(etaP) / Math.cos(xiP));
  const sin = Math.sin(phiStar), cos = Math.cos(phiStar);
  const phi = phiStar + sin * cos * (AS + BS * sin ** 2 + CS * sin ** 4 + DS * sin ** 6);
  return { lat: deg(phi), lon: SWEREF99TM.centralMeridianDeg + deg(dLon) };
}

/**
 * Grid convergence γ at a position (degrees): the angle from true north to grid north (SWEREF 99 TM's "up"), positive
 * east of the central meridian, zero on it, about 1–3° in Sweden. A direction at true bearing β has grid bearing β − γ.
 * Found as the direction of a meridian in the grid by a central difference along it (accurate to well under 0.001°).
 */
export function convergence(lat, lon) {
  if (!finite(lat, lon) || Math.abs(lat) > 90) throw new RangeError(`not a latitude and longitude: ${lat}, ${lon}`);
  const h = 1e-4;                       // degrees, about 11 m
  const p = wgs84ToSweref99tm(Math.min(lat + h, 90), lon), q = wgs84ToSweref99tm(Math.max(lat - h, -90), lon);
  const g = -deg(Math.atan2(p.e - q.e, p.n - q.n));   // north in the grid leans toward the central meridian
  return g === 0 ? 0 : g;               // no negative zero
}

// ---------------------------------------------------------------- reading a position from text

const SWEDEN = { lat: [54.5, 69.5], lon: [10, 25] };      // where SWEREF 99 TM numbers are meaningful (a warning outside)
const thousands = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fix = (v, d) => v.toFixed(d);

/** "59.32930° N, 18.06860° E = SWEREF 99 TM N 6 580 743, E 674 572" (rounded for reading; the numbers returned are exact). */
export function describePosition(lat, lon, e, n) {
  const ns = lat < 0 ? 'S' : 'N', ew = lon < 0 ? 'W' : 'E';
  return `${fix(Math.abs(lat), 5)}° ${ns}, ${fix(Math.abs(lon), 5)}° ${ew} = SWEREF 99 TM N ${thousands(n)}, E ${thousands(e)}`;
}

const num = s => Number(String(s).replace(',', '.'));
const FAIL = reason => ({ ok: false, reason });

function done(lat, lon, source, how, warnings = [], given = null) {
  const g = given || wgs84ToSweref99tm(lat, lon);
  const outside = lat < SWEDEN.lat[0] || lat > SWEDEN.lat[1] || lon < SWEDEN.lon[0] || lon > SWEDEN.lon[1];
  const w = [...warnings];
  if (outside) w.push('This is outside Sweden: SWEREF 99 TM numbers are only meaningful near Sweden.');
  return { ok: true, lat, lon, e: g.e, n: g.n, source, says: `Read as ${how}: ${describePosition(lat, lon, g.e, g.n)}`, warnings: w };
}

/** Links and "geo:" texts that maps apps share: the place the link points at. Returns [lat, lon] or null. */
function fromLink(text) {
  let t = text;
  try { t = decodeURIComponent(text); } catch { /* keep the raw text */ }
  const n = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${n}!4d${n}`),                                             // Google: the place itself
    new RegExp(`@${n},${n}`),                                                  // Google: the map's centre
    new RegExp(`[?&](?:q|ll|sll|query|center|destination|daddr|saddr)=${n},\\s*${n}`, 'i'),
    new RegExp(`[?&]mlat=${n}&mlon=${n}`, 'i'),                                // OpenStreetMap marker
    new RegExp(`#map=\\d+(?:\\.\\d+)?/${n}/${n}`),                             // OpenStreetMap view
    new RegExp(`^geo:${n},${n}`, 'i'),
    new RegExp(`/${n},${n}(?:[/?#,]|$)`),                                      // .../maps/search/59.33,18.07
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) { const lat = Number(m[1]), lon = Number(m[2]); if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return [lat, lon]; }
  }
  return null;
}

/** Two numbers of 1000 or more: a SWEREF 99 TM pair. Labels (N / X for north, E / Y for east) and the size of the numbers say which is which. */
function fromSweref(text) {
  let nums = [...text.matchAll(/(?<![\d.])(\d{1,3}(?:[  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\d)/g)];
  if (nums.length === 1 && !/[.,]/.test(nums[0][1])) {
    // "6 580 743 674 572": spaced thousands with only a space between the two numbers; seven digits and six digits say where it splits
    const groups = nums[0][1].split(/\s/);
    for (let i = 1; i < groups.length - 1; i++) {
      const a = groups.slice(0, i + 1).join(' '), b = groups.slice(i + 1).join(' ');
      const da = a.replace(/\s/g, '').length, db = b.replace(/\s/g, '').length;
      if ((da === 7 && db === 6) || (da === 6 && db === 7)) {
        nums = [{ 0: a, 1: a, index: nums[0].index }, { 0: b, 1: b, index: nums[0].index + a.length + 1 }];
        break;
      }
    }
  }
  if (nums.length !== 2) return null;
  const vals = nums.map(m => num(m[1].replace(/[  ]/g, '')));
  if (!vals.every(v => v >= 1000)) return null;
  // a label is the letter(s) just before or after the number
  const NORTH = ['N', 'X', 'NORTH', 'NORTHING'], EAST = ['E', 'Y', 'EAST', 'EASTING'];
  const dir = w => (w ? (NORTH.includes(w.toUpperCase()) ? 'n' : EAST.includes(w.toUpperCase()) ? 'e' : null) : null);
  const before = i => dir(text.slice(0, nums[i].index).match(/([A-Za-z]+)\W*$/)?.[1]);                    // "N 6580743"
  const after = i => dir(text.slice(nums[i].index + nums[i][0].length).match(/^\W*([A-Za-z]+)/)?.[1]);    // "6580743 N"
  // labels are written all before the numbers or all after them: take the style in which both numbers get a label, and different ones
  const styles = [[before(0), before(1)], [after(0), after(1)]];
  const labels = styles.find(l => l[0] && l[1] && l[0] !== l[1]) || [before(0) || after(0), before(1) || after(1)];
  let e, n;
  if (labels[0] && labels[1] && labels[0] !== labels[1]) {
    [e, n] = labels[0] === 'e' ? vals : [vals[1], vals[0]];
  } else if (labels[0] && labels[1]) {
    return FAIL('Both numbers are labelled as the same direction (both north or both east).');
  } else {
    const big = vals.filter(v => v >= 3000000), small = vals.filter(v => v < 3000000);
    if (big.length !== 1 || small.length !== 1) return FAIL('Two big numbers, but I cannot tell which is north and which is east: label them (N 6580743, E 674572).');
    n = big[0]; e = small[0];
  }
  if (!(n >= 3000000 && n <= 10000000 && e >= 0 && e <= 1000000)) return FAIL('Those numbers do not look like SWEREF 99 TM (north is about 6 100 000 to 7 700 000, east about 200 000 to 900 000 in Sweden).');
  const g = sweref99tmToWgs84(e, n);
  return done(g.lat, g.lon, 'sweref', 'a SWEREF 99 TM position', [], { e, n });
}

const HEM = { N: 'lat', S: 'lat', E: 'lon', W: 'lon' };

/** Degrees, degrees and minutes, or degrees minutes seconds, with or without letters. Returns a result, a failure, or null when it is not that shape. */
function fromDegrees(text) {
  // decimal commas ("59,33 18,07") are told from separating commas ("59.33, 18.07") by there being no "." and no space after the comma
  let t = text;
  if (!/\./.test(t) && /\d,\d/.test(t)) t = t.replace(/(\d),(\d)/g, '$1.$2');
  const comp = '([NSEW])?\\s*([+-]?)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:°|º|d\\b)?\\s*(?:(\\d+(?:\\.\\d+)?)\\s*[\'’′]\\s*(?:(\\d+(?:\\.\\d+)?)\\s*(?:"|″|\'\')\\s*)?)?\\s*([NSEW])?';
  // the two parts need a separator between them, or a letter or mark that ends the first one (so "59.33" is not read as 59.3 and 3)
  const between = '(?:\\s*[,;/|]\\s*|\\s+|(?<=[NSEWnsew°º\'"′″’]))';
  const re = new RegExp(`^\\s*${comp}${between}${comp}\\s*$`, 'i');
  const m = t.replace(/,(?=\s)/g, ' ').replace(/\s+/g, ' ').match(re);
  if (!m) return null;
  const part = o => ({ lead: m[o]?.toUpperCase() ?? null, sign: m[o + 1], deg: Number(m[o + 2]), min: m[o + 3] === undefined ? null : Number(m[o + 3]), sec: m[o + 4] === undefined ? null : Number(m[o + 4]), trail: m[o + 5]?.toUpperCase() ?? null });
  const a = part(1), b = part(7);
  if (a.lead && a.trail && !b.lead) { b.lead = a.trail; a.trail = null; }   // "N 59.33 E 18.07": the E leads the second number
  const kind = [a, b].some(p => p.sec !== null) ? 'dms' : [a, b].some(p => p.min !== null) ? 'dm' : 'degrees';
  const value = p => {
    if (p.min !== null && p.min >= 60) return NaN;
    if (p.sec !== null && p.sec >= 60) return NaN;
    return p.deg + (p.min ?? 0) / 60 + (p.sec ?? 0) / 3600;
  };
  const items = [a, b].map(p => ({ p, letter: p.lead || p.trail, abs: value(p) }));
  if (items.some(x => !Number.isFinite(x.abs))) return FAIL('Minutes and seconds must be below 60.');
  if (items.some(x => x.p.lead && x.p.trail && x.p.lead !== x.p.trail)) return FAIL('A letter before and a different one after the same number.');
  const axes = items.map(x => (x.letter ? HEM[x.letter] : null));
  if (axes[0] && axes[0] === axes[1]) return FAIL(`Both parts are ${axes[0] === 'lat' ? 'latitudes (N/S)' : 'longitudes (E/W)'}: one of them has to be N/S and the other E/W.`);
  const warnings = [];
  let latItem, lonItem;
  if (axes[0] || axes[1]) {
    const first = axes[0] ?? (axes[1] === 'lat' ? 'lon' : 'lat');
    [latItem, lonItem] = first === 'lat' ? [items[0], items[1]] : [items[1], items[0]];
  } else {
    // no letters: latitude first, unless the numbers clearly say otherwise
    [latItem, lonItem] = items;
    if (Math.abs(latItem.abs) > 90 && Math.abs(lonItem.abs) <= 90) { [latItem, lonItem] = [lonItem, latItem]; warnings.push('The first number is too big for a latitude, so it was read as the longitude.'); }
    else if (latItem.abs >= 9 && latItem.abs <= 26 && lonItem.abs >= 54 && lonItem.abs <= 70 && latItem.p.sign !== '-' && lonItem.p.sign !== '-') {
      [latItem, lonItem] = [lonItem, latItem]; warnings.push('The first number looks like a Swedish longitude and the second like a latitude, so they were read as longitude, latitude.');
    }
  }
  const sign = x => (x.letter === 'S' || x.letter === 'W' || x.p.sign === '-' ? -1 : 1);
  const lat = sign(latItem) * latItem.abs, lon = sign(lonItem) * lonItem.abs;
  if (Math.abs(lat) > 90) return FAIL(`${lat}° is not a latitude (it must be between −90 and 90).`);
  if (Math.abs(lon) > 180) return FAIL(`${lon}° is not a longitude (it must be between −180 and 180).`);
  return done(lat, lon, kind, { degrees: 'decimal degrees', dm: 'degrees and minutes', dms: 'degrees, minutes and seconds' }[kind], warnings);
}

/**
 * Read a position typed or pasted in any form people have it: decimal degrees (with or without N/E letters, degree
 * signs, decimal commas), degrees and minutes, degrees minutes seconds, a SWEREF 99 TM pair (either order, with or
 * without labels), or the link or text a maps app shares (Google Maps, OpenStreetMap, Apple Maps, geo:).
 * Returns { ok: true, lat, lon, e, n, source, says, warnings } (lat/lon in degrees, e/n SWEREF 99 TM metres, `says` in
 * plain words for showing what was understood) or { ok: false, reason }.
 */
export function parseCoordinates(input) {
  const text = String(input ?? '').replace(/[   ]/g, ' ').replace(/−/g, '-').trim();
  if (!text) return FAIL('Nothing to read: type or paste a position.');
  if (/^(https?:\/\/|geo:)/i.test(text) || /\bmaps\b.*[?&@]/i.test(text)) {
    const ll = fromLink(text);
    const geo = /^geo:/i.test(text);
    return ll ? done(ll[0], ll[1], geo ? 'geo' : 'link', geo ? 'a geo: position' : 'the place in that link') : FAIL('I found no position in that link. Open the place in the maps app and copy the coordinates, or share the place instead of a route or a search.');
  }
  const sw = fromSweref(text);
  if (sw) return sw;
  const degrees = fromDegrees(text);
  if (degrees) return degrees;
  return FAIL('I could not read that as a position. Examples: 59.33, 18.07  ·  59°19.8′N 18°4.1′E  ·  N 6580743, E 674572.');
}

// ---------------------------------------------------------------- plan <-> world (PLANTERN.md §14.5)
//
// A house's plan has its own axes (x east, y north in the plan, millimetres). `site.georef.origin` says where plan point
// (0, 0) is on the earth (SWEREF 99 TM east and north, metres) and `site.northAngleDeg` how far plan north is from TRUE
// north, clockwise (§3). The grid's north is not true north: they differ by the grid convergence γ at the house, so the
// plan is turned by θ′ = northAngleDeg − γ against the grid:
//   world = origin + (x·(cos θ′, −sin θ′) + y·(sin θ′, cos θ′)) / 1000
// γ is taken at the origin (over a house the difference across it is a few millimetres, far below anything measured).

const originOf = site => {
  const o = site?.georef?.origin;
  if (!Array.isArray(o) || o.length < 2 || !finite(o[0], o[1])) throw new RangeError('The house has no position yet (site.georef.origin: SWEREF 99 TM east and north, in metres).');
  return o;
};
const northOf = site => { const v = Number(site?.northAngleDeg); return Number.isFinite(v) ? v : 0; };
const point = (p, what) => {
  if (!Array.isArray(p) || p.length < 2 || !finite(p[0], p[1])) throw new RangeError(`not a ${what}: ${JSON.stringify(p)}`);
  return p;
};

/** Does the site say where the house is? (A position is what makes the other functions here usable.) */
export function hasGeoref(site) {
  try { originOf(site); return true; } catch { return false; }
}

/** The grid bearing of plan north in degrees (clockwise from SWEREF 99 TM's north): the north angle minus the convergence at the house. */
export function planGridAngle(site) {
  const [e, n] = originOf(site);
  const g = sweref99tmToWgs84(e, n);
  return northOf(site) - convergence(g.lat, g.lon);
}

/** Plan metres (x east, y north) turned by `a` degrees clockwise into a grid offset (east, north). */
function toGrid(x, y, a) {
  const t = rad(a), c = Math.cos(t), s = Math.sin(t);
  return [x * c + y * s, -x * s + y * c];
}

/** A plan point [x, y] in mm -> SWEREF 99 TM [east, north] in metres. Throws when the site has no position. */
export function planToWorld(p, site) {
  point(p, 'plan point');
  const [e0, n0] = originOf(site);
  const [de, dn] = toGrid(p[0] / 1000, p[1] / 1000, planGridAngle(site));
  return [e0 + de, n0 + dn];
}

/** SWEREF 99 TM [east, north] in metres -> plan point [x, y] in mm (the inverse of planToWorld). */
export function worldToPlan(w, site) {
  point(w, 'world position');
  const [e0, n0] = originOf(site);
  const de = w[0] - e0, dn = w[1] - n0, t = rad(planGridAngle(site)), c = Math.cos(t), s = Math.sin(t);
  return [(de * c - dn * s) * 1000, (de * s + dn * c) * 1000];
}

/**
 * Where plan point (0, 0) is, when a known plan point `planPoint` [x, y] (mm) is at SWEREF 99 TM `world` [east, north]
 * (metres): "this corner of the house is here". Uses site.northAngleDeg (and no position of its own). The convergence
 * depends on where the house is, which is what is being worked out, so it is found by a few rounds of refining; the result
 * puts the point back exactly where `world` is when fed to planToWorld.
 */
export function originFromPoint(planPoint, world, site) {
  point(planPoint, 'plan point'); point(world, 'world position');
  let origin = [world[0], world[1]];
  for (let i = 0; i < 5; i++) {
    const g = sweref99tmToWgs84(origin[0], origin[1]);
    const [de, dn] = toGrid(planPoint[0] / 1000, planPoint[1] / 1000, northOf(site) - convergence(g.lat, g.lon));
    origin = [world[0] - de, world[1] - dn];
  }
  return origin;
}

/** A plan point [x, y] in mm -> { lat, lon } in degrees (for putting the house on a map). */
export function planToWgs84(p, site) {
  const [e, n] = planToWorld(p, site);
  return sweref99tmToWgs84(e, n);
}

/** { lat, lon } in degrees -> plan point [x, y] in mm. */
export function wgs84ToPlan(lat, lon, site) {
  const { e, n } = wgs84ToSweref99tm(lat, lon);
  return worldToPlan([e, n], site);
}
