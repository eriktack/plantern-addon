// What the Editor shows about a level: the selected wall's details and the walls still to measure.
// Pure (no DOM), so the page only renders it.

import { nameChange } from '../model/names.js';
import { wallFrame } from '../geometry/walls.js';
import { pointInPolygon } from '../geometry/polygon.js';
import { boundEdges } from '../geometry/bound.js';
import { wallProfile } from '../geometry/walls.js';
import { openingAssumed, isSliding, DOOR_OPENS } from '../model/openings.js';

/** Why a bound wall is an orphan, from the validator's issues (null when it is not). */
const orphanMsg = (issues, id) => issues?.find(i => i.id === id && i.severity === 'error' && /orphan/.test(i.msg))?.msg ?? null;

/**
 * Details for the wall panel: { wall, bound, shared, sides: { left: [roomIds], right: [roomIds] },
 * openings, attached, assumed, orphan }. Sides are relative to travel a→b. A bound wall's sides come
 * from its edges (the rooms along its reference line are on the right, as walls run clockwise round
 * their rooms; facing rooms on the left), so a facade lists every room along it; for a hand-drawn
 * wall a side faces a room when a point just beyond that face, at the middle, lies inside it.
 */
export function wallInfo(level, wallId, issues = []) {
  const wall = (level.walls || []).find(w => w.id === wallId);
  if (!wall) return null;
  const f = wallFrame(wall), m = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  const probe = side => { const k = (side === 'left' ? f.offL : -f.offR) + (side === 'left' ? 50 : -50); return [m[0] + f.n[0] * k, m[1] + f.n[1] * k]; };
  const facing = side => (level.rooms || []).filter(r => r.polygon?.length >= 3 && pointInPolygon(probe(side), r.polygon)).map(r => r.id);
  const be = boundEdges(wall, new Map((level.rooms || []).map(r => [r.id, r])));
  const roomsOf = es => [...new Set(es.map(e => e.room.id))];
  const bound = !!wall.from?.length && !be.missing.length;
  return {
    wall,
    bound: !!wall.from?.length,
    shared: be.facing.length > 0,
    facade: roomsOf(be.along).length > 1,
    length: Math.round(f.L),
    sides: bound ? { left: roomsOf(be.facing), right: roomsOf(be.along) } : { left: facing('left'), right: facing('right') },
    openings: (level.openings || []).filter(o => o.wall === wallId),
    attached: [...(level.objects || []), ...(level.fixtures || [])].filter(x => x.attach?.wall === wallId).map(x => x.id),
    assumed: wall.assumed || [],
    orphan: orphanMsg(issues, wallId),
    start: cornerAt(level, wall.a),
  };
}

/** The room corner at a point (within 1 mm), for words like "corner 3 of Salong": { room, name, index } or null. */
export function cornerAt(level, p) {
  for (const r of level.rooms || []) {
    const i = (r.polygon || []).findIndex(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= 1);
    if (i >= 0) return { room: r.id, name: r.name || r.id, index: i };
  }
  return null;
}

/** Everything on the level whose values were assumed, not measured (the level itself first): [{ id, kind, fields }]. */
export function stillToMeasure(level) {
  const out = level.assumed?.length ? [{ id: level.id, kind: 'level', fields: level.assumed }] : [];
  for (const key of ['walls', 'rooms', 'openings', 'solids', 'objects', 'fixtures']) {
    for (const x of level[key] || []) {
      const fields = key === 'openings' ? openingAssumed(x) : x.assumed || [];
      if (fields.length) out.push({ id: x.id, kind: key.slice(0, -1), fields });
    }
  }
  return out;
}

const KINDS = ['wall', 'railing', 'virtual'], BLOCKING = ['', 'opaque', 'transparent'];
const HEX = /^#[0-9a-f]{6}$/i;

/** A wall → the strings shown in the wall panel. */
export function wallToForm(wall) {
  const s = v => (v === undefined || v === null ? '' : String(v));
  return {
    name: s(wall.name), kind: wall.kind, thickness: s(wall.thickness), measured: !wall.assumed?.includes('thickness'),
    // sloped: heights at the a and b ends (top, bottom); a flat wall shows its height at both
    sloped: !!(wall.top || wall.bottom), topA: s(wall.top?.a ?? ''), topB: s(wall.top?.b ?? ''), bottomA: s(wall.bottom?.a ?? ''), bottomB: s(wall.bottom?.b ?? ''),
    // level stretches at either end before the slope (mm along the wall)
    topFlatA: s(wall.top?.flatA ?? ''), topFlatB: s(wall.top?.flatB ?? ''), bottomFlatA: s(wall.bottom?.flatA ?? ''), bottomFlatB: s(wall.bottom?.flatB ?? ''),
    height: s(wall.height), base: s(wall.base), lightBlocking: wall.lightBlocking ?? '',
    // a hand-drawn wall's own position (a wall made from room edges follows its rooms)
    ax: s(wall.a?.[0]), ay: s(wall.a?.[1]), bx: s(wall.b?.[0]), by: s(wall.b?.[1]), justify: wall.justify ?? 'center', lock: wall.lock === 'axis',
    // each side: '' (default), 'color' or 'material'
    ...Object.fromEntries(['left', 'right'].flatMap(side => {
      const s = wall.sides?.[side] || {};
      return [[`${side}Mode`, s.material ? 'material' : s.color ? 'color' : ''], [`${side}Color`, s.color || '#e6e2da'], [`${side}Mat`, s.material || '']];
    })),
  };
}

/**
 * Wall panel form → { props, errors } for setWallProps(): only what changed (null removes a field).
 * Ticking "measured" on an assumed thickness sends the thickness even when the number is unchanged,
 * which takes it off the still-to-measure list.
 */
export function wallPropsFromForm(wall, form) {
  const props = {}, errors = [], before = wallToForm(wall);
  if (form.name !== undefined) { const n = nameChange(wall.name, form.name); if (n !== undefined) props.name = n; }
  const num = (name, text, { optional }) => {
    const t = String(text ?? '').trim();
    if (t === '') return optional ? null : (errors.push(`${name} is required`), undefined);
    const v = Number(t);
    if (!Number.isFinite(v) || v < 0) { errors.push(`${name}: "${t}" is not a number of mm (0 or more)`); return undefined; }
    return v;
  };
  if (form.kind !== before.kind) { if (KINDS.includes(form.kind)) props.kind = form.kind; else errors.push(`unknown kind "${form.kind}"`); }
  if (String(form.thickness).trim() !== before.thickness || (form.measured && !before.measured)) {
    const v = num('thickness', form.thickness, { optional: false });
    if (v !== undefined) props.thickness = v;
  }
  for (const k of ['height', 'base']) if (String(form[k] ?? '').trim() !== before[k]) {
    const v = num(k, form[k], { optional: true });
    if (v !== undefined) {
      // a height of 0 means the same as empty: up to the ceiling (a wall with no height is not a wall)
      const val = k === 'height' && v === 0 ? null : v;
      if (val !== null || wall[k] !== undefined) props[k] = val;
    }
  }
  if ((form.lightBlocking ?? '') !== before.lightBlocking) {
    if (BLOCKING.includes(form.lightBlocking)) props.lightBlocking = form.lightBlocking || null; else errors.push(`unknown light blocking "${form.lightBlocking}"`);
  }
  // sloped: top (and bottom) at both ends replace height and base; turning it off goes back to flat
  if (form.sloped) {
    const ends = ['topA', 'topB', 'bottomA', 'bottomB'], flats = ['topFlatA', 'topFlatB', 'bottomFlatA', 'bottomFlatB'];
    if (!before.sloped || [...ends, ...flats].some(k => String(form[k] ?? '').trim() !== (before[k] ?? ''))) {
      const v = {};
      for (const k of ends) {
        const t = String(form[k] ?? '').trim();
        if (t === '') { if (k.startsWith('top')) errors.push(`top at the ${k.endsWith('A') ? 'start' : 'end'}: give a height in mm`); v[k] = 0; continue; }
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) errors.push(`${k}: "${t}" is not a height in mm`); else v[k] = n;
      }
      const L = Math.hypot((wall.b?.[0] ?? 0) - (wall.a?.[0] ?? 0), (wall.b?.[1] ?? 0) - (wall.a?.[1] ?? 0));
      for (const k of flats) {
        const t = String(form[k] ?? '').trim(), n = t === '' ? 0 : Number(t);
        if (!Number.isFinite(n) || n < 0) errors.push(`${k}: "${t}" is not a length in mm`); else v[k] = n;
      }
      if (!errors.length && (v.topFlatA + v.topFlatB > L + 0.5 || v.bottomFlatA + v.bottomFlatB > L + 0.5)) errors.push(`the level stretches at both ends are longer than the wall (${Math.round(L)} mm)`);
      if (!errors.length) {
        if (!(v.topA > v.bottomA && v.topB > v.bottomB)) errors.push('the top must be above the bottom at both ends');
        const flat = (A, B) => ({ ...(A ? { flatA: A } : {}), ...(B ? { flatB: B } : {}) });
        props.top = { a: v.topA, b: v.topB, ...flat(v.topFlatA, v.topFlatB) };
        if (v.bottomA || v.bottomB) props.bottom = { a: v.bottomA, b: v.bottomB, ...flat(v.bottomFlatA, v.bottomFlatB) }; else if (wall.bottom) props.bottom = null;
        for (const k of ['height', 'base']) { if (wall[k] !== undefined) props[k] = null; else delete props[k]; }   // flat values do not apply
      }
    }
  } else if (before.sloped) { for (const k of ['top', 'bottom']) if (wall[k]) props[k] = null; }
  // a hand-drawn wall: where it stands (start, end) and which side of that line its thickness goes
  if (!wall.from?.length && 'ax' in form) {
    const pts = ['ax', 'ay', 'bx', 'by'].map(k => String(form[k] ?? '').trim());
    if (pts.some((t, i) => t !== [before.ax, before.ay, before.bx, before.by][i])) {
      const v = pts.map(Number);
      if (pts.some(t => t === '') || v.some(x => !Number.isFinite(x))) errors.push('start and end: x and y in mm');
      else if (Math.hypot(v[2] - v[0], v[3] - v[1]) < 10) errors.push('the wall is shorter than 10 mm');
      else { props.a = [v[0], v[1]]; props.b = [v[2], v[3]]; }
    }
    // what its ends hang on (room corners): written when the choice changed; offsets follow the position
    if ('anchor' in form) {
      const refsNow = JSON.stringify(['a', 'b'].map(e => form.anchor?.[e]?.ref ?? null)), refsWas = JSON.stringify(['a', 'b'].map(e => wall.anchor?.[e]?.ref ?? null));
      if (refsNow !== refsWas) props.anchor = form.anchor;
    }
    if ('lock' in form && !!form.lock !== before.lock) props.lock = form.lock ? 'axis' : null;
    if (form.lock) { const a = props.a || wall.a, b = props.b || wall.b; if (a && b && Math.abs(a[0] - b[0]) > 0.5 && Math.abs(a[1] - b[1]) > 0.5) errors.push('kept along x or y: make Length x or Length y 0'); }
    if (form.justify && form.justify !== before.justify) {
      if (['center', 'left', 'right'].includes(form.justify)) props.justify = form.justify; else errors.push(`unknown justify "${form.justify}"`);
    }
  }
  // painted per room (roomSides): written when the rows changed
  if ('roomSides' in form && JSON.stringify(form.roomSides ?? null) !== JSON.stringify(wall.roomSides ?? null)) {
    if (form.roomSides === null) { if (wall.roomSides !== undefined) props.roomSides = null; } else props.roomSides = form.roomSides;
  }
  // a side is a colour or a material (or neither: the default); only changed sides are rewritten
  const sideChanged = side => form[`${side}Mode`] !== before[`${side}Mode`]
    || (form[`${side}Mode`] === 'color' && String(form[`${side}Color`]).toLowerCase() !== before[`${side}Color`].toLowerCase())
    || (form[`${side}Mode`] === 'material' && form[`${side}Mat`] !== before[`${side}Mat`]);
  if (sideChanged('left') || sideChanged('right')) {
    const sides = JSON.parse(JSON.stringify(wall.sides || {}));
    for (const side of ['left', 'right']) {
      if (!sideChanged(side)) continue;
      const mode = form[`${side}Mode`], rest = { ...(sides[side] || {}) };
      delete rest.color; delete rest.material;
      if (mode === 'color') { const c = String(form[`${side}Color`] ?? '').trim(); if (!HEX.test(c)) { errors.push(`${side} colour must look like #rrggbb`); continue; } rest.color = c.toLowerCase(); }
      if (mode === 'material') { if (!form[`${side}Mat`]) { errors.push(`pick a material for the ${side} side`); continue; } rest.material = form[`${side}Mat`]; }
      if (Object.keys(rest).length) sides[side] = rest; else delete sides[side];
    }
    props.sides = Object.keys(sides).length ? sides : null;
  }
  return { props, errors };
}

// ---- openings ------------------------------------------------------------------------------------

/** Details for the opening panel: { opening, wall, length, top, start, sides } (sides as in wallInfo). */
export function openingInfo(level, id) {
  const opening = (level.openings || []).find(o => o.id === id);
  const wi = opening && wallInfo(level, opening.wall);
  if (!wi) return null;
  return { opening, wall: wi.wall, length: wi.length, top: wallProfile(wi.wall, level).top, start: wi.start, sides: sidesAt(level, wi, opening) };
}

/**
 * The rooms on each side of a wall at an opening's own position (a facade runs behind several
 * rooms, but a door in it opens into the one it stands in). Falls back to the whole wall's sides.
 */
function sidesAt(level, wi, o) {
  const w = wi.wall, f = wallFrame(w), s = o.offset + o.width / 2;
  const P = side => { const k = side === 'left' ? f.offL + 50 : -(f.offR + 50); return [w.a[0] + f.u[0] * s + f.n[0] * k, w.a[1] + f.u[1] * s + f.n[1] * k]; };
  const at = side => (level.rooms || []).filter(r => r.polygon?.length >= 3 && pointInPolygon(P(side), r.polygon)).map(r => r.id);
  const left = at('left'), right = at('right');
  return left.length || right.length ? { left, right } : wi.sides;
}

/**
 * The room corners along a wall that a position on it can be measured from: [{ key, s, dir, pos, label }].
 * s = where the corner is along the wall (mm from its start a, projected onto the reference line); dir = +1
 * when what is measured lies toward the wall's end from it (the corner at the start of that room's stretch),
 * −1 when it lies toward the start. Every room along either face counts (a facade runs past several rooms,
 * a shared wall has a room on each side), so you can measure from either corner of the room you stand in.
 * The wall's own ends are added when no room corner is there. Sorted along the wall.
 */
export function measureCorners(level, wallId) {
  const w = (level.walls || []).find(x => x.id === wallId);
  if (!w) return [];
  const f = wallFrame(w), out = [], reach = (w.thickness || 0) + 1;
  const along = P => (P[0] - w.a[0]) * f.u[0] + (P[1] - w.a[1]) * f.u[1], across = P => (P[0] - w.a[0]) * f.n[0] + (P[1] - w.a[1]) * f.n[1];
  for (const r of level.rooms || []) {
    const poly = r.polygon || [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (L < 1) return;
      const parallel = Math.abs(((q[0] - p[0]) * f.u[1] - (q[1] - p[1]) * f.u[0]) / L) < 0.02;     // within about 1°
      if (!parallel || Math.abs(across(p)) > reach || Math.abs(across(q)) > reach) return;
      const [sp, sq] = [along(p), along(q)];
      if (Math.max(sp, sq) < 1 || Math.min(sp, sq) > f.L - 1) return;                             // beside the wall, not along it
      const lo = sp <= sq ? [p, i] : [q, (i + 1) % poly.length], hi = sp <= sq ? [q, (i + 1) % poly.length] : [p, i];
      for (const [[P, k], dir] of [[lo, 1], [hi, -1]]) {
        const key = `${r.id}#p${k}`;
        if (!out.some(c => c.key === key)) out.push({ key, s: Math.round(along(P) * 10) / 10, dir, pos: P, label: `corner ${k} of ${r.name || r.id}` });
      }
    });
  }
  if (!out.some(c => c.dir > 0 && Math.abs(c.s) <= 1)) out.push({ key: 'a', s: 0, dir: 1, pos: w.a, label: "the wall's start" });
  if (!out.some(c => c.dir < 0 && Math.abs(c.s - f.L) <= 1)) out.push({ key: 'b', s: Math.round(f.L * 10) / 10, dir: -1, pos: w.b, label: "the wall's end" });
  return out.sort((x, y) => x.s - y.s || x.dir - y.dir);
}

/** The corner an opening (t0..t1 along the wall) is most naturally measured from: the nearest one before it. */
export function defaultCorner(corners, t0, t1 = t0) {
  const before = corners.filter(c => c.dir > 0 && c.s <= t0 + 1).sort((a, b) => b.s - a.s)[0];
  return before || corners.filter(c => c.dir < 0 && c.s >= t1 - 1).sort((a, b) => a.s - b.s)[0] || corners[0];
}

const r1 = v => Math.round(v * 10) / 10;
/**
 * Position along a wall as measured from a corner `where` = { s, dir } (default: the wall's start):
 * the distance from it to the nearer edge of something t0 = offset … offset + width along the wall.
 * offsetTo() turns such a distance back into the stored offset (from the wall's start).
 */
export const offsetFrom = (o, { s = 0, dir = 1 } = {}, width = o.width ?? 0, offset = o.offset) => r1(dir > 0 ? offset - s : s - offset - width);
export const offsetTo = (dist, { s = 0, dir = 1 } = {}, width = 0) => r1(dir > 0 ? s + dist : s - dist - width);

/**
 * An opening → the strings in its panel (height and below-ceiling are worked out from sill and head).
 * A value that is still a default (in `assumed`) shows as an empty field with the default in
 * `placeholders`, so whatever is typed there counts as measured, even the same number.
 * where = { s, dir }: the corner the position is measured from (measureCorners()); default the wall's start.
 */
export function openingToForm(o, top, where = {}) {
  const still = openingAssumed(o), guess = k => still.includes(k), val = (k, v) => (guess(k) ? '' : String(v));
  const pos = offsetFrom(o, where);
  return {
    name: o.name ?? '', type: o.type, offset: val('offset', pos), width: val('width', o.width), sill: val('sill', o.sill), head: val('head', o.head),
    height: guess('sill') || guess('head') ? '' : String(o.head - o.sill), below: guess('head') ? '' : String(top - o.head),
    hinge: o.leaves === 2 ? 'both' : (isSliding(o) ? o.slide : o.hinge) ?? 'near', swing: o.swing ?? 'right', opens: o.opens ?? (o.type === 'door' ? 'swing' : 'fixed'), measured: !still.length,
    thickness: o.thickness === undefined ? '' : String(o.thickness),
    // how the unit looks (decision 124)
    colorUse: !!o.color, color: o.color ?? '', placement: o.placement ?? '', sillDepth: o.sillDepth === undefined ? '' : String(o.sillDepth), sillColorUse: !!o.sillColor, sillColor: o.sillColor ?? '',
    // shown in empty fields: clearly a default, not a value
    placeholders: Object.fromEntries(Object.entries({ offset: pos, width: o.width, sill: o.sill, head: o.head, height: o.head - o.sill, below: top - o.head }).map(([k, v]) => [k, `${v} · default`])),
  };
}

/**
 * The wall-thickness field of an opening: the wall's known thickness, or empty with the guess as a
 * placeholder while it is only assumed. apply(text) says whether a typed value should be used: when
 * it differs from what is stored, or confirms a guess.
 */
export function revealField(level, wallId) {
  const w = (level.walls || []).find(x => x.id === wallId);
  if (!w) return { value: '', placeholder: '', apply: () => false };
  const guess = !!w.assumed?.includes('thickness');
  return {
    value: guess ? '' : String(w.thickness), placeholder: guess ? `${w.thickness} (a guess)` : String(w.thickness),
    apply: text => { const t = String(text ?? '').trim(); return t !== '' && (guess || Number(t) !== w.thickness); },
  };
}

/**
 * Opening panel → { props, errors } for setOpening(): only what changed. The top is taken from
 * "top" when that was changed, else from "height" (bottom + height), else from "below ceiling"
 * (wall top − value). Ticking "measured" confirms every assumed value as it stands.
 */
export function openingPropsFromForm(o, form, top, where = {}) {
  const before = openingToForm(o, top, where), props = {}, errors = [];
  if (form.name !== undefined) { const n = nameChange(o.name, form.name); if (n !== undefined) props.name = n; }
  const changed = k => { const t = String(form[k] ?? '').trim(); return t !== '' && t !== before[k]; };   // empty = leave as is
  const num = k => { const v = Number(String(form[k]).trim()); if (String(form[k]).trim() === '' || !Number.isFinite(v)) { errors.push(`${k}: "${form[k]}" is not a number of mm`); return undefined; } return v; };
  if (form.type !== before.type) props.type = form.type;
  for (const k of ['offset', 'width', 'sill']) if (changed(k)) { const v = num(k); if (v !== undefined) props[k] = v; }
  if (where.s !== undefined && (where.s !== 0 || where.dir < 0)) {
    // measured from another corner: the stored offset is from the wall's start. Measured from a corner
    // beyond the opening, a measured distance stays what it is when only the width changes.
    const width = props.width ?? o.width, keep = where.dir < 0 && props.width !== undefined && !openingAssumed(o).includes('offset');
    const dist = props.offset ?? (keep ? Number(before.offset) : undefined);
    if (dist !== undefined) props.offset = offsetTo(dist, where, width);
  }
  const sill = props.sill ?? o.sill;
  if (changed('head')) { const v = num('head'); if (v !== undefined) props.head = v; }
  else if (changed('height')) { const v = num('height'); if (v !== undefined) props.head = sill + v; }
  else if (changed('below')) { const v = num('below'); if (v !== undefined) props.head = top - v; }
  const type = props.type ?? o.type;
  // a door on hinges, or sliding along the wall or into it (opens "sliding" / "pocket")
  const doorOpens = type === 'door' ? (DOOR_OPENS.includes(form.opens) ? form.opens : 'swing') : null, slides = doorOpens && doorOpens !== 'swing';
  if (type === 'door') {
    const want = slides ? doorOpens : undefined;
    if (o.opens !== want) props.opens = want ?? null;
    if (slides && o.hinge !== undefined && !isSliding(o)) props.hinge = null;          // what it had on hinges does not apply
    if (!slides && o.slide !== undefined) props.slide = null;
  }
  if ((type === 'door' || (type === 'window' && ['side-hung', 'tilt-turn'].includes(form.opens))) && (form.hinge !== before.hinge || form.swing !== before.swing || props.opens !== undefined)) {
    // "both" = hinged on both sides (a double door or window), or two leaves sliding apart
    const edge = slides ? 'slide' : 'hinge';
    if (form.hinge === 'both') { props.leaves = 2; if (!slides && !o.hinge) props.hinge = 'near'; }
    else { props[edge] = form.hinge; if (o.leaves === 2) props.leaves = null; }
    props.swing = form.swing;
  }
  if (type !== 'passage' && changed('thickness')) { const v = num('thickness'); if (v !== undefined) props.thickness = v; }
  if (type === 'window' && form.opens !== before.opens) props.opens = form.opens;
  // the look: a colour (the checkbox says whether it is its own), where it sits across the wall, a window's sill board; null removes
  const keep = (k, v) => { if ((o[k] ?? null) !== (v ?? null)) props[k] = v ?? null; };
  if (type === 'passage') { for (const k of ['color', 'placement', 'sillDepth', 'sillColor']) keep(k, null); }
  else {
    keep('color', form.colorUse ? form.color : null);
    keep('placement', form.placement && form.placement !== 'middle' ? form.placement : null);
    if (type === 'window') {
      const t = String(form.sillDepth ?? '').trim();
      if (t === '') keep('sillDepth', null); else { const v = Number(t); if (Number.isFinite(v)) keep('sillDepth', v); else errors.push(`sillDepth: "${form.sillDepth}" is not a number of mm`); }
      keep('sillColor', form.sillColorUse && t !== '' ? form.sillColor : null);
    } else for (const k of ['sillDepth', 'sillColor']) keep(k, null);
  }
  if (type !== 'door' && o.slide !== undefined) props.slide = null;
  if (form.measured) for (const k of openingAssumed(o)) if (props[k] === undefined) props[k] = o[k];
  return { props, errors };
}

/**
 * What the info card shows for something on a level being looked at (peek: another level while editing
 * this one; nothing is selected or changed): { title, sub, rows: [[label, value]] } or null. `name(id)`
 * reads an id the way the pages show it (ref-names.js); rooms are named by their own name.
 */
export function peekInfo(level, kind, id, { name = x => x } = {}) {
  const roomName = rid => (level.rooms || []).find(r => r.id === rid)?.name || rid;
  const mm = v => `${Math.round(v)} mm`;
  const size = poly => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return `${Math.round(Math.max(...xs) - Math.min(...xs))} × ${Math.round(Math.max(...ys) - Math.min(...ys))} mm`; };
  const area = poly => { let a = 0; poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }); return `${(Math.abs(a) / 2e6).toFixed(1)} m²`; };
  if (kind === 'wall') {
    const info = wallInfo(level, id);
    if (!info) return null;
    const w = info.wall, prof = wallProfile(w, level), side = ids => ids.map(roomName).join(', ') || 'outside';
    const height = prof.sloped ? `${Math.round(prof.ends.top.a)} → ${Math.round(prof.ends.top.b)} mm (sloped)` : w.height === undefined && !w.base ? `up to the ceiling (${Math.round(prof.top)} mm)` : `${Math.round(prof.base)} – ${Math.round(prof.top)} mm above the floor`;
    return { title: name(w.id), sub: w.id, rows: [
      ['Kind', w.kind || 'wall'],
      ['Thickness', w.kind === 'virtual' ? 'none (a boundary)' : `${mm(w.thickness)}${w.assumed?.includes('thickness') ? ' · assumed, not measured' : info.shared ? ' · between two rooms' : ' · measured'}`],
      ['Length', mm(info.length)],
      ['Height', height],
      ['Left side', side(info.sides.left)], ['Right side', side(info.sides.right)],
      ...(info.openings.length ? [['Openings', info.openings.map(o => `${o.name || o.type} ${o.width}`).join(', ')]] : []),
    ] };
  }
  if (kind === 'room') {
    const r = (level.rooms || []).find(x => x.id === id);
    if (!r?.polygon?.length) return null;
    return { title: r.name || r.id, sub: r.id, rows: [
      ['Size', size(r.polygon)], ['Area', area(r.polygon)], ['Corners', String(r.polygon.length)],
      ['Ceiling', mm(r.ceilingHeight ?? level.ceilingHeight ?? 2400)],
      ...(r.floor === 'none' ? [['Floor', 'none: open to the level below']] : r.floorOffset ? [['Floor', `${mm(r.floorOffset)} above the level's floor`]] : []),
      ...(r.exterior ? [['Outdoors', 'yes']] : []),
    ] };
  }
  if (kind === 'solid') {
    const s = (level.solids || []).find(x => x.id === id);
    if (!s?.polygon?.length) return null;
    return { title: s.name || s.kind || s.id, sub: s.id, rows: [['Kind', s.kind || 'solid'], ['Size', size(s.polygon)], ['From', mm(s.base ?? 0)], ['Height', s.height ? mm(s.height) : 'up to the ceiling']] };
  }
  if (kind === 'opening') {
    const o = (level.openings || []).find(x => x.id === id);
    if (!o) return null;
    return { title: o.name || o.id, sub: o.id, rows: [['Type', o.type], ['Width', mm(o.width)], ['Bottom – top', `${Math.round(o.sill)} – ${Math.round(o.head)} mm`], ['In', name(o.wall)], ...(openingAssumed(o).length ? [['Still default', openingAssumed(o).join(', ')]] : [])] };
  }
  return null;
}
