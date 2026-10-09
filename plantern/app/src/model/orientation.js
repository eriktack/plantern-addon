// House orientation (pure). Plan axes are the house's own frame: x = east, y = north, where "plan
// north" is whatever direction was chosen for the house (e.g. along the front wall). `site.northAngleDeg`
// says how far plan north is from TRUE north, measured clockwise (0 = aligned, 90 = plan north points
// true east). A plan *heading* is the direction of a wall in plan coordinates: degrees counter-clockwise
// from plan east (90 = plan north). A *bearing* is a compass direction: degrees clockwise from true north.

export const normalizeDeg = d => ((d % 360) + 360) % 360;

export const bearingFromHeading = (heading, northAngleDeg = 0) => normalizeDeg(northAngleDeg + 90 - heading);
export const headingFromBearing = (bearing, northAngleDeg = 0) => normalizeDeg(90 + northAngleDeg - bearing);

/** The site's north angle, tolerating a missing or malformed value. */
export const northAngleOf = model => { const v = Number(model?.site?.northAngleDeg); return Number.isFinite(v) ? v : 0; };

/** Round for display/storage without float noise (0.01°). */
export const roundDeg = d => Math.round(d * 100) / 100;
