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
