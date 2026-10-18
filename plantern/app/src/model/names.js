// Friendly names (PLANTERN.md §6): any entity may carry an optional `name` ("Badrum window",
// "Ceiling lamp hall"), shown wherever a person reads it; the id stays the stable reference and is
// shown beside it, smaller, or on hover. Pure.

/** The name when there is one, else the fallback (the id). */
export const displayName = (e, fallback = e?.id) => (typeof e?.name === 'string' && e.name.trim() ? e.name.trim() : fallback);

/** A name field's text → what to store: undefined (unchanged), null (removed) or the trimmed name. */
export function nameChange(before, typed) {
  const t = String(typed ?? '').trim(), was = typeof before === 'string' ? before.trim() : '';
  return t === was ? undefined : t === '' ? null : t;
}

/** The entity with `name` right after `id`, so the JSON reads well (formatJson keeps key order). */
export function nameFirst(e) {
  if (!e || e.name === undefined) return e;
  const { id, name, ...rest } = e;
  return { id, name, ...rest };
}

/** A `name` must be a non-empty string; issues like validateModel()'s. */
export function checkName(e) {
  if (e?.name === undefined) return [];
  return typeof e.name === 'string' && e.name.trim() ? [] : [{ severity: 'warn', id: e.id, msg: 'name must be a non-empty text (or left out)' }];
}

/** A level in a menu: its name and how high its floor is, "Upper · +2750", "Ground · ±0", "Basement · −2450". */
export function levelLabel(level) {
  const e = Math.round(level?.elevation ?? 0);
  return `${level?.name || level?.id} · ${e === 0 ? '±0' : e > 0 ? `+${e}` : `−${-e}`}`;
}

// ---- names for things that have none (ui-consistency plan UX29, R13) ----
// What a person reads when a thing has no name of its own: what it is, from its kind, its model or its room. Never stored.

/** "dining-table" / "kitchen_cabinet" → "Dining table" / "Kitchen cabinet". */
export const prettyId = s => { const t = String(s ?? '').replace(/[-_]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };

/**
 * A name for an unnamed thing of `kind` ('object' | 'fixture' | 'opening' | 'stairs'). ctx: roomName (the room it is in, when
 * known), blueprintName(id) (a blueprint's own name, when the library is loaded). Its own name always wins.
 */
export function fallbackName(e, kind, { roomName = '', blueprintName = () => '' } = {}) {
  if (typeof e?.name === 'string' && e.name.trim()) return e.name.trim();
  const inRoom = word => (roomName ? `${roomName} ${word[0].toLowerCase()}${word.slice(1)}` : word);
  if (kind === 'object') return blueprintName(e.blueprint) || prettyId(e.blueprint || e.asset) || (e.attach?.wall ? 'Box on a wall' : 'Box');
  if (kind === 'fixture') {
    if (e.kind === 'switch') return inRoom('Switch');
    if (e.kind === 'strip') return inRoom('LED strip');
    if (e.attach?.opening) return inRoom('Lamp in a window');
    return inRoom(e.attach ? 'Wall lamp' : 'Ceiling lamp');
  }
  if (kind === 'opening') return `${prettyId(e.type)} ${e.width} mm`;
  if (kind === 'stairs') return `Stairs up to ${e.to}`;
  return e?.id ?? '';
}

/** Repeated names numbered in order, the first kept plain: [{ id, name }] → Map(id → "Chair", "Chair 2", …). */
export function numberRepeats(items) {
  const seen = new Map(), out = new Map();
  for (const { id, name } of items) { const k = (seen.get(name) || 0) + 1; seen.set(name, k); out.set(id, k === 1 ? name : `${name} ${k}`); }
  return out;
}
