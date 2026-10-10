// "Place the house" form logic (pure; the DOM is wired in ui.js): the position, the north angle and the ground-floor
// height of PLANTERN.md §14.4 as the person types them, turned into setSite() properties and plain words.

import { parseCoordinates, sweref99tmToWgs84, convergence, describePosition } from '../geometry/geo.js';
import { normalizeDeg, roundDeg } from '../model/orientation.js';

const same = (a, b) => Math.abs(a - b) < 0.0005;                 // metres: below the millimetre rounding setSite() applies
const round3 = v => Math.round(v * 1000) / 1000;
const number = text => Number(String(text).trim().replace(/\s/g, '').replace(',', '.'));
const sign = v => (v >= 0 ? '+' : '−');

/** The texts the fields start with, from `model.site`. */
export function placeFields(site) {
  const o = site?.georef?.origin;
  const hasPosition = Array.isArray(o) && o.length === 2 && o.every(Number.isFinite);
  const na = Number(site?.northAngleDeg), h = site?.georef?.groundFloorHeight;
  return {
    position: hasPosition ? `N ${round3(o[1])}, E ${round3(o[0])}` : '',
    north: Number.isFinite(na) && na !== 0 ? String(na) : '',
    height: Number.isFinite(h) ? String(h) : '',
  };
}

/**
 * What the form says. fields: { position, north, height } (texts); site: the current `model.site`.
 * Returns { ok, props, errors, notes, says }: `props` is for setSite() (and only says what the form means: a position
 * text that reads as the position already there changes nothing, so its accuracy and source stay), `errors` are reasons
 * to refuse, `notes` are warnings about what was understood, `says` is how the position text was read.
 */
export function readPlaceForm(fields, site = {}) {
  const errors = [], notes = [], props = {}, georef = {};
  let says = '';

  const nt = String(fields.north ?? '').trim();
  if (nt === '') props.northAngleDeg = null;
  else {
    const v = number(nt);
    if (!Number.isFinite(v)) errors.push('The north angle must be a number of degrees (clockwise from true north to plan north).'); else props.northAngleDeg = v;
  }

  const ht = String(fields.height ?? '').trim();
  if (ht === '') georef.groundFloorHeight = null;
  else {
    const v = number(ht);
    if (!Number.isFinite(v)) errors.push('The ground-floor height must be a number of metres above sea level.'); else georef.groundFloorHeight = v;
  }

  const pt = String(fields.position ?? '').trim(), current = site?.georef?.origin;
  if (pt === '') { if (current) georef.origin = null; }
  else {
    const r = parseCoordinates(pt);
    if (!r.ok) errors.push(r.reason);
    else {
      says = r.says; notes.push(...r.warnings);
      const unchanged = Array.isArray(current) && same(current[0], r.e) && same(current[1], r.n);
      if (!unchanged) { georef.origin = [r.e, r.n]; georef.source = 'typed'; georef.accuracy = null; }
    }
  }
  if (Object.keys(georef).length) props.georef = georef;
  return { ok: errors.length === 0, props, errors, notes, says };
}

/** The wall's direction in the plan, degrees anticlockwise from plan east (the heading of PLANTERN.md §3). */
export const wallHeading = wall => Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]) * 180 / Math.PI;

/**
 * The north angle that makes a wall point at a known compass bearing: the wall runs from `a` to `b` and that direction
 * is at true bearing `bearing` (degrees clockwise from true north). Result in (−180, 180], to 0.01°.
 */
export function northAngleFromWall(wall, bearing) {
  const a = normalizeDeg(bearing - 90 + wallHeading(wall));        // inverse of bearingFromHeading() in orientation.js
  return roundDeg(a > 180 ? a - 360 : a);
}

/** A few plain sentences about the house's place for the section's summary line. */
export function placeSummary(site) {
  const parts = [], g = site?.georef, o = g?.origin;
  const na = Number(site?.northAngleDeg) || 0;
  if (Array.isArray(o) && o.length === 2 && o.every(Number.isFinite)) {
    const w = sweref99tmToWgs84(o[0], o[1]), conv = convergence(w.lat, w.lon);
    parts.push(`Plan point (0, 0) is at ${describePosition(w.lat, w.lon, o[0], o[1])}.`);
    parts.push(`Plan north is ${roundDeg(na)}° clockwise from true north; here true north is ${sign(conv)}${Math.abs(roundDeg(conv))}° from the grid's north, so against the grid it is ${roundDeg(na - conv)}°.`);
    if (Number.isFinite(g.accuracy)) parts.push(`The position is good to about ${g.accuracy} m.`);
  } else parts.push('No position set yet: the house is not on the earth.');
  if (Number.isFinite(g?.groundFloorHeight)) parts.push(`The ground-floor finished floor is ${g.groundFloorHeight} m above sea level (RH 2000).`);
  else parts.push('No ground-floor height set yet.');
  return parts.join(' ');
}
