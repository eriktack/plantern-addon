// Where the sun is over the house, and how much daylight that gives (pure). The 3D view's ambient light follows it while
// daylight is off (decision 282): the house's position is `site.georef.origin` (SWEREF 99 TM, geo.js), turned into
// latitude and longitude, and the sun's altitude at a moment is worked out from the NOAA low-precision formulas
// (about 0.01° for the years around now, far below anything a lamp or a window shows).

import { hasGeoref, sweref99tmToWgs84 } from './geo.js';

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

/** Sun altitude above the horizon, degrees, at a moment (a Date) for a latitude and longitude in degrees. */
export function sunAltitude(lat, lon, when = new Date()) {
  const jd = when.getTime() / 86400000 + 2440587.5;   // Julian date (UTC)
  const n = jd - 2451545.0;                            // days since 2000-01-01 12:00 UTC
  const L = (280.460 + 0.9856474 * n) % 360;           // mean longitude of the sun
  const g = rad((357.528 + 0.9856003 * n) % 360);      // mean anomaly
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));   // ecliptic longitude
  const eps = rad(23.439 - 0.0000004 * n);             // obliquity of the ecliptic
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;   // sidereal time at Greenwich, degrees
  const hour = rad(gmst + lon) - ra;                   // hour angle of the sun at this longitude
  const phi = rad(lat);
  return deg(Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hour)));
}

// The sky's light: none at civil dusk's end (the sun 6° below the horizon), full at 6° above. A smooth step in
// between, so the ambient light rises and falls without a kink at dawn or dusk.
const DARK_DEG = -6, BRIGHT_DEG = 6;

/** Daylight from the sun's altitude, 0 (night) to 1 (sun up). */
export function daylightLevel(altitudeDeg) {
  const t = Math.min(1, Math.max(0, (altitudeDeg - DARK_DEG) / (BRIGHT_DEG - DARK_DEG)));
  return t * t * (3 - 2 * t);
}

/**
 * The daylight at the house now, 0 to 1, or undefined when the site has no position (then there is no sun to follow:
 * the viewer keeps the night light). `site.georef.origin` is the plan's (0, 0) in SWEREF 99 TM, which is where the house is.
 */
export function houseDaylight(site, when = new Date()) {
  if (!hasGeoref(site)) return undefined;
  const [e, n] = site.georef.origin;
  const { lat, lon } = sweref99tmToWgs84(e, n);
  return daylightLevel(sunAltitude(lat, lon, when));
}
