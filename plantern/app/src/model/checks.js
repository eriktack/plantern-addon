// Control measurements (PLANTERN.md §8): `model.checks = [{ id, a, b, measured, note?, solve? }]`, two snap
// refs and the real tape or laser value. Shown sorted by how far the model is off; a check between two
// corners of one room can join that room's solve (`solve: true`) as one more diagonal. Pure.

/**
 * The checks as rows for a panel, worst first: broken references, then by how far the model is off.
 * at(ref) → { pos, level } | undefined. Returns [{ check, index, broken, model, delta, cls }].
 */
export function checkRows(checks, at, tol = { ok: 5, warn: 15 }) {
  return (checks || []).map((check, index) => {
    const a = at(check.a), b = at(check.b);
    if (!a || !b) return { check, index, broken: true, missing: !a ? check.a : check.b, cls: 'bad' };
    const model = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]), delta = check.measured - model, d = Math.abs(delta);
    return { check, index, broken: false, model, delta, cls: d <= tol.ok ? 'ok' : d <= tol.warn ? 'warn' : 'bad', levels: [a.level, b.level] };
  }).sort((x, y) => (y.broken - x.broken) || (x.broken ? x.index - y.index : Math.abs(y.delta) - Math.abs(x.delta) || x.index - y.index));
}

const CORNER = /^(r_[^#]+)#p(\d+)$/;

/** The room a check could join the solve of: { room, a, b } when both ends are corners of one room, not neighbours; else null. */
export function checkCorners(check, n) {
  const ma = CORNER.exec(check?.a || ''), mb = CORNER.exec(check?.b || '');
  if (!ma || !mb || ma[1] !== mb[1]) return null;
  const a = +ma[2], b = +mb[2];
  if (a === b || (n !== undefined && (a >= n || b >= n || (a + 1) % n === b || (b + 1) % n === a))) return null;
  return { room: ma[1], a, b };
}

/** The checks that join room `roomId`'s solve (n corners) as diagonals: [{ a, b, length, check }]. */
export function checkDiagonals(checks, roomId, n) {
  return (checks || []).filter(c => c.solve === true && c.measured > 0).map(c => ({ c, k: checkCorners(c, n) }))
    .filter(x => x.k?.room === roomId).map(({ c, k }) => ({ a: k.a, b: k.b, length: c.measured, check: c.id }));
}

/** What solveCapture() needs for a room besides its capture: the checks that join its solve. */
export const solveExtra = (model, room) => ({ diagonals: room?.capture?.raw?.lengths ? checkDiagonals(model?.checks, room.id, room.capture.raw.lengths.length) : [] });

/** Problems with a check (refs are checked against the snap points by the panel): { errors, warnings }. */
export function checkCheck(c, rooms = []) {
  const errors = [], warnings = [];
  if (typeof c?.a !== 'string' || typeof c?.b !== 'string') errors.push('a check needs two points (a and b, snap refs)');
  if (!(c?.measured > 0)) errors.push('measured must be more than 0 mm');
  if (c?.solve !== undefined && typeof c.solve !== 'boolean') errors.push('solve must be true or false');
  if (c?.solve) {
    const room = rooms.find(r => r.id === checkCorners(c)?.room), k = room && checkCorners(c, room.polygon?.length);
    if (!k) warnings.push('only a check between two corners of one room (not neighbours) can join its solve');
    else if (room.capture?.mode !== 'lengths') warnings.push(`joins the solve only of a room measured by lengths and diagonals; ${room.id} is shown with it as a check`);
  }
  return { errors, warnings };
}
