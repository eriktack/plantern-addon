// Moving a whole level in the plan (PLANTERN.md §5, anchors): every level shares the plan's x/y, so when the
// anchors show that a level was measured a little off, the level is shifted rather than its rooms measured again.
// Pure: model in, model out. Everything on the level moves by the same [dx, dy]; what hangs on a point of
// another level keeps hanging there (its offset changes by the shift, so it lands where it was moved to),
// what hangs on a point of the same level moves with it.

import { levelOfRef } from './levels.js';

const r1 = v => Math.round(v * 10) / 10;
const mv = (p, d) => [r1(p[0] + d[0]), r1(p[1] + d[1])];

export function shiftLevelGeometry(model, levelId, d) {
  const lv = model.levels.find(l => l.id === levelId);
  const other = ref => ref && levelOfRef(model, ref) !== levelId;               // a point on another level (or one that does not exist)
  const origin = raw => {
    if (!raw) return raw;
    const o = { ...raw, start: mv(raw.start ?? [0, 0], d) };
    if (raw.origin?.ref && other(raw.origin.ref)) o.origin = { ...raw.origin, offset: mv(raw.origin.offset || [0, 0], d) };
    return o;
  };
  const thing = x => ({
    ...x,
    ...(x.polygon ? { polygon: x.polygon.map(p => mv(p, d)) } : {}),
    ...(x.holes ? { holes: x.holes.map(h => h.map(p => mv(p, d))) } : {}),
    ...(x.capture ? { capture: { ...x.capture, raw: origin(x.capture.raw) } } : {}),
  });
  const wall = w => ({
    ...w, a: mv(w.a, d), b: mv(w.b, d),
    ...(w.anchor ? { anchor: Object.fromEntries(Object.entries(w.anchor).map(([end, an]) => [end, other(an.ref) ? { ...an, offset: mv(an.offset || [0, 0], d) } : an])) } : {}),
  });
  const stairs = s => ({
    ...s,
    start: s.start?.ref ? (other(s.start.ref) ? { ...s.start, offset: mv(s.start.offset || [0, 0], d) } : s.start) : { ...s.start, pos: mv(s.start?.pos ?? s.pos, d) },
    ...(s.opening ? { opening: s.opening.map(p => mv(p, d)) } : {}),
  });
  const next = {
    ...lv,
    ...(lv.rooms ? { rooms: lv.rooms.map(thing) } : {}),
    ...(lv.solids ? { solids: lv.solids.map(thing) } : {}),
    ...(lv.walls ? { walls: lv.walls.map(wall) } : {}),
    ...(lv.objects ? { objects: lv.objects.map(o => o.pos ? { ...o, pos: mv(o.pos, d) } : o) } : {}),
    ...(lv.fixtures ? { fixtures: lv.fixtures.map(f => f.pos ? { ...f, pos: mv(f.pos, d) } : f) } : {}),
    ...(lv.stairs ? { stairs: lv.stairs.map(stairs) } : {}),
  };
  const anchors = (model.anchors || []).map(an => an.points?.[levelId] && Array.isArray(an.points[levelId]) ? { ...an, points: { ...an.points, [levelId]: mv(an.points[levelId], d) } } : an.level === levelId && an.pos ? { ...an, pos: mv(an.pos, d) } : an);
  return { ...model, levels: model.levels.map(l => l.id === levelId ? next : l), ...(model.anchors ? { anchors } : {}) };
}
