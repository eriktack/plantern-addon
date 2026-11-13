// Devices (docs/plans/devices.md, decision 292): cameras, Wi-Fi access points and other devices with a place, a direction and a
// reach, as fixtures. Pure.
//   camera  { kind: "camera", pos | attach (a wall face), z, bearing, tilt?, fov?, range?, pan?: [from, to] }
//   ap      { kind: "ap", pos | attach, z, mount: "ceiling" | "wall", bands?: ["2.4", "5", "6"], outdoor?, bearing?, beam? }
//   device  { kind: "device", role, pos | attach, z, range? }  roles: DEVICE_ROLES
// Directions are compass bearings: degrees clockwise from true north (`site.northAngleDeg` turns them into plan headings,
// orientation.js). A device may stand at a free `pos` outside every room (the yard, a carport): it is then outdoors, with no
// ceiling over it (decision 292).

import { bearingFromHeading, normalizeDeg, roundDeg } from './orientation.js';

export const DEVICE_KINDS = ['camera', 'ap', 'device'];
export const isDevice = fx => DEVICE_KINDS.includes(fx?.kind);
export const DEVICE_ROLES = ['zigbee-coordinator', 'zigbee-router', 'bt-proxy', 'smoke', 'climate', 'speaker'];
export const AP_BANDS = ['2.4', '5', '6'];
export const AP_MOUNTS = ['ceiling', 'wall'];
/** How high a device outdoors may be (a mast, the eaves of a high roof), in mm above the level's floor. */
export const OUTDOOR_TOP = 15000;

/** Defaults for a new device (listed in `assumed` where they are guesses). */
export const DEVICE_DEFAULTS = {
  camera: { z: 2200, fov: 100, range: 10000, tilt: 20 },
  ap: { wallZ: 2000, bands: ['2.4', '5'] },
  device: { z: 1000, range: 10000 },
};

/** What a person calls the fixture: for lists, titles and messages. */
export function fixtureNoun(fx) {
  if (fx?.kind === 'camera') return 'camera';
  if (fx?.kind === 'ap') return 'access point';
  if (fx?.kind === 'device') return ({ 'zigbee-coordinator': 'Zigbee coordinator', 'zigbee-router': 'Zigbee router', 'bt-proxy': 'Bluetooth proxy', smoke: 'smoke detector', climate: 'room sensor', speaker: 'speaker' })[fx.role] || 'device';
  if (fx?.kind === 'switch') return 'switch';
  if (fx?.kind === 'strip') return 'LED strip';
  return fx?.attach && fx.attach.object === undefined ? 'wall lamp' : 'lamp';
}

const isBearing = v => Number.isFinite(v) && v >= 0 && v < 360;

/** The device fields' problems: { errors, warnings } (the shared fixture rules, position and height, are checkFixture's). */
export function checkDevice(fx) {
  const errors = [], warnings = [];
  if (fx.attach && (fx.attach.object !== undefined || fx.attach.opening !== undefined)) errors.push('a camera, access point or device stands free (pos) or on a wall face (attach.wall)');
  if (fx.bearing !== undefined && !isBearing(fx.bearing)) errors.push('bearing is a compass bearing: 0 (north) up to 360 degrees, clockwise');
  if (fx.kind === 'camera') {
    if (fx.bearing === undefined) errors.push('a camera needs a bearing: the compass direction it looks in');
    if (fx.tilt !== undefined && !(Number.isFinite(fx.tilt) && fx.tilt >= -90 && fx.tilt <= 90)) errors.push('tilt is degrees down from level, −90 to 90');
    if (fx.fov !== undefined && !(Number.isFinite(fx.fov) && fx.fov > 0 && fx.fov <= 180)) errors.push('fov is the angle the camera sees across, 1 to 180 degrees');
    if (fx.pan !== undefined && !(Array.isArray(fx.pan) && fx.pan.length === 2 && fx.pan.every(isBearing))) errors.push('pan is the two bearings a pan-tilt camera turns between, clockwise from the first');
  }
  if (fx.range !== undefined && !(Number.isFinite(fx.range) && fx.range > 0)) errors.push('range is in mm, more than 0');
  if (fx.kind === 'ap') {
    if (fx.mount !== undefined && !AP_MOUNTS.includes(fx.mount)) errors.push(`mount is ${AP_MOUNTS.join(' or ')}`);
    if (fx.bands !== undefined && !(Array.isArray(fx.bands) && fx.bands.length && fx.bands.every(b => AP_BANDS.includes(b)))) errors.push(`bands are some of ${AP_BANDS.join(', ')} (GHz)`);
    if (fx.outdoor !== undefined && typeof fx.outdoor !== 'boolean') errors.push('outdoor is true or false');
    if (fx.beam !== undefined && !(Number.isFinite(fx.beam) && fx.beam > 0 && fx.beam <= 360)) errors.push('beam is the width of a directional antenna, 1 to 360 degrees');
    if (fx.beam !== undefined && fx.bearing === undefined) warnings.push('a beam without a bearing points nowhere: give the antenna\'s bearing');
  }
  if (fx.kind === 'device') {
    if (typeof fx.role !== 'string' || !fx.role) errors.push(`a device needs a role: ${DEVICE_ROLES.join(', ')}`);
    else if (!DEVICE_ROLES.includes(fx.role)) warnings.push(`unknown role "${fx.role}" (drawn as a plain dot)`);
  }
  return { errors, warnings };
}

/** The compass bearing straight out from a wall's face: `side` "left" or "right" of the wall's a → b. */
export function faceBearing(wall, side, northAngleDeg = 0) {
  const heading = Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]) * 180 / Math.PI + (side === 'left' ? 90 : -90);
  return roundDeg(normalizeDeg(bearingFromHeading(heading, northAngleDeg)));
}
