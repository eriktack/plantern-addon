// Rules for `model.site` (pure): the plan's north angle and where the house is on the earth (PLANTERN.md §3, §14.4).
// Shared by the validator (validateModel) and the edit operation setSite() (src/edit/ops.js), so what one refuses the
// other reports.
//
//   site.northAngleDeg          degrees clockwise from true north to plan north
//   site.georef.crs             "EPSG:3006" (SWEREF 99 TM), the only grid supported
//   site.georef.origin          [east, north] in metres: where plan point (0, 0) is
//   site.georef.groundFloorHeight  metres above sea level (RH 2000) of the ground-floor finished floor (the plan datum)
//   site.georef.accuracy        metres, how well the position is known (optional)
//   site.georef.source          "typed" | "map" | "gps": how the position was set (optional, only shown)
//
// A georef may hold only the ground-floor height (a person can know it before the position): that is not an error.

export const GEOREF_CRS = 'EPSG:3006';
export const GEOREF_KEYS = ['crs', 'origin', 'groundFloorHeight', 'accuracy', 'source'];
export const GEOREF_SOURCES = ['typed', 'map', 'gps'];
/** Where a SWEREF 99 TM position or a height is believable for a Swedish house; outside is a warning, not an error. */
export const SITE_RANGE = Object.freeze({ east: [200000, 1000000], north: [6100000, 7700000], groundFloorHeight: [-50, 2500], northAngleDeg: [-360, 360] });

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const err = msg => ({ severity: 'error', id: 'site', msg });
const warn = msg => ({ severity: 'warn', id: 'site', msg });
const outside = (v, [lo, hi]) => v < lo || v > hi;

/** Issues with a site object: [{ severity: 'error' | 'warn', id: 'site', msg }]. A missing site, or one with nothing set, has none. */
export function checkSite(site) {
  const out = [];
  if (site === undefined || site === null) return out;
  if (typeof site !== 'object' || Array.isArray(site)) return [err('site must be an object')];
  if ('northAngleDeg' in site) {
    const a = site.northAngleDeg;
    if (!isNum(a)) out.push(err('site.northAngleDeg must be a number of degrees'));
    else if (outside(a, SITE_RANGE.northAngleDeg)) out.push(warn(`site.northAngleDeg is ${a}°, outside −360° to 360°: is that what was meant?`));
  }
  if (!('georef' in site)) return out;
  const g = site.georef;
  if (g === null || typeof g !== 'object' || Array.isArray(g)) return [...out, err('site.georef must be an object')];
  if ('crs' in g && g.crs !== GEOREF_CRS) out.push(err(`site.georef.crs is "${g.crs}": only "${GEOREF_CRS}" (SWEREF 99 TM) is supported`));
  if ('origin' in g) {
    const o = g.origin;
    if (!Array.isArray(o) || o.length !== 2 || !o.every(isNum)) out.push(err('site.georef.origin must be [east, north], two numbers in metres (SWEREF 99 TM)'));
    else {
      if (outside(o[0], SITE_RANGE.east)) out.push(warn(`site.georef.origin east is ${o[0]} m, outside ${SITE_RANGE.east[0]} to ${SITE_RANGE.east[1]}, the range of Sweden in SWEREF 99 TM: check the number (east and north swapped?)`));
      if (outside(o[1], SITE_RANGE.north)) out.push(warn(`site.georef.origin north is ${o[1]} m, outside ${SITE_RANGE.north[0]} to ${SITE_RANGE.north[1]}, the range of Sweden in SWEREF 99 TM: check the number (east and north swapped?)`));
    }
  }
  if ('groundFloorHeight' in g) {
    const h = g.groundFloorHeight;
    if (!isNum(h)) out.push(err('site.georef.groundFloorHeight must be a number of metres above sea level (RH 2000)'));
    else if (outside(h, SITE_RANGE.groundFloorHeight)) out.push(warn(`site.georef.groundFloorHeight is ${h} m, outside ${SITE_RANGE.groundFloorHeight[0]} to ${SITE_RANGE.groundFloorHeight[1]}: metres above sea level, not millimetres?`));
  }
  if ('accuracy' in g && !(isNum(g.accuracy) && g.accuracy >= 0)) out.push(err('site.georef.accuracy must be a number of metres, 0 or more'));
  if ('source' in g && !GEOREF_SOURCES.includes(g.source)) out.push(warn(`site.georef.source "${g.source}" is not one of ${GEOREF_SOURCES.join(', ')}`));
  return out;
}
