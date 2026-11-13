// The Editor's device fields (docs/plans/devices.md DV8, DV9): a camera's, access point's or device's own values as the form shows
// them, and the changes the form asks for. Pure: the page reads and fills the inputs (panel-fixture.js).

const num = t => { const s = String(t ?? '').trim().replace(',', '.').replace(/−/g, '-'); return s === '' ? null : Number(s); };
const deg = v => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '');

/** What each field shows for fixture fx. */
export function deviceFormValues(fx) {
  return {
    role: fx.role ?? '', bearing: deg(fx.bearing), tilt: deg(fx.tilt), fov: deg(fx.fov), range: fx.range ?? '',
    panFrom: deg(fx.pan?.[0]), panTo: deg(fx.pan?.[1]), mount: fx.mount ?? 'ceiling',
    bands: { '2.4': !!fx.bands?.includes('2.4'), 5: !!fx.bands?.includes('5'), 6: !!fx.bands?.includes('6') }, outdoor: !!fx.outdoor,
  };
}

/** Which device fields a kind (and role) has. */
export function deviceFields(fx) {
  if (fx.kind === 'camera') return ['bearing', 'tilt', 'fov', 'range', 'pan'];
  if (fx.kind === 'ap') return ['mount', 'bands', 'outdoor', 'bearing'];
  if (fx.kind === 'device') return ['role', ...(fx.role === 'bt-proxy' ? ['range'] : [])];
  return [];
}

/**
 * The changes the form asks for: { props } for setFixture (null removes an optional value), or { error }. `v` is what the
 * fields hold now (strings, booleans), in the shape of deviceFormValues().
 */
export function deviceFormChanges(fx, v) {
  const props = {}, fields = deviceFields(fx);
  const angle = (k, field, { optional = false, bearing = false, lo = -Infinity, hi = Infinity } = {}) => {
    if (!fields.includes(field)) return null;
    const n = num(v[k]);
    if (n === null) { if (!optional) return `${field} is needed`; if (fx[k] !== undefined) props[k] = null; return null; }
    if (!Number.isFinite(n)) return `${field} must be a number`;
    const val = bearing ? ((n % 360) + 360) % 360 : n;
    if (val < lo || val > hi) return `${field} must be between ${lo} and ${hi}`;
    if (val !== fx[k]) props[k] = Math.round(val * 100) / 100;
    return null;
  };
  const err = angle('bearing', 'bearing', { bearing: true, optional: fx.kind !== 'camera' })
    || angle('tilt', 'tilt', { optional: true, lo: -90, hi: 90 })
    || angle('fov', 'fov', { optional: true, lo: 1, hi: 180 });
  if (err) return { error: err };
  if (fields.includes('range')) {
    const n = num(v.range);
    if (n === null) { if (fx.range !== undefined) props.range = null; }
    else if (!(n > 0)) return { error: 'range must be more than 0 mm' };
    else if (n !== fx.range) props.range = Math.round(n);
  }
  if (fields.includes('pan')) {
    const a = num(v.panFrom), b = num(v.panTo);
    if (a === null && b === null) { if (fx.pan) props.pan = null; }
    else if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return { error: 'give both bearings it turns between, or neither' };
    else { const pan = [((a % 360) + 360) % 360, ((b % 360) + 360) % 360]; if (!fx.pan || pan[0] !== fx.pan[0] || pan[1] !== fx.pan[1]) props.pan = pan; }
  }
  if (fields.includes('mount') && v.mount !== (fx.mount ?? 'ceiling')) props.mount = v.mount;
  if (fields.includes('bands')) {
    const bands = ['2.4', '5', '6'].filter(b => v.bands?.[b]);
    if (!bands.length) return { error: 'tick at least one band' };
    if (bands.join() !== (fx.bands || []).join()) props.bands = bands;
  }
  if (fields.includes('outdoor') && !!v.outdoor !== !!fx.outdoor) props.outdoor = !!v.outdoor;
  if (fields.includes('role') && v.role && v.role !== fx.role) props.role = v.role;
  return { props };
}
