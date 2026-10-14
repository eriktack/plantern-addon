// Linking lamps and switches to Home Assistant (roadmap 11, docs/archive/ha-11-12.md S6). Pure: which
// entities fit a fixture (by kind and by how its name and room read against the entity's id and
// friendly name), and the binding written into location.json → bindings.

const DOMAINS = { lamp: ['light', 'switch'], strip: ['light', 'switch'], switch: ['switch', 'light', 'input_boolean'] };
const words = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9åäöæø]+/).filter(w => w.length > 1);

/**
 * The entities that fit a fixture, best first: [{ id, label, score }]. kind 'lamp' | 'strip' | 'switch';
 * names: words to match (the fixture's name, its room's name, the room's HA area).
 */
export function suggestEntities(states, { kind = 'lamp', names = [] } = {}) {
  const domains = DOMAINS[kind] || DOMAINS.lamp, want = new Set(names.flatMap(words));
  return (states || [])
    .filter(s => domains.includes(String(s.entity_id).split('.')[0]))
    .map(s => {
      const label = s.attributes?.friendly_name || s.entity_id, have = new Set([...words(s.entity_id.split('.')[1]), ...words(label)]);
      let score = [...want].filter(w => have.has(w)).length * 10 - domains.indexOf(s.entity_id.split('.')[0]);
      return { id: s.entity_id, label, score };
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/** location.json with fixture `id` bound to { entity?, controls?, look? } (empty values remove them; no binding left removes it). */
export function setBinding(location, id, { entity, controls, look } = {}) {
  const b = { ...(location.bindings?.[id] || {}) };
  if (entity !== undefined) { if (entity) b.entity = entity; else delete b.entity; }
  if (controls !== undefined) { if (controls?.length) b.controls = [...controls]; else delete b.controls; }
  if (look !== undefined) { const l = Object.fromEntries(Object.entries(look || {}).filter(([, v]) => v !== undefined && v !== '' && v !== null)); if (Object.keys(l).length) b.look = l; else delete b.look; }
  const bindings = { ...(location.bindings || {}) };
  if (Object.keys(b).length) bindings[id] = b; else delete bindings[id];
  return { ...location, bindings };
}

const canon = v => (Array.isArray(v) ? `[${v.map(canon)}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`)}}` : JSON.stringify(v ?? null));
/** Do two versions of location.json hold the same binding for fixture `id`? (key order does not matter) */
export const sameBinding = (a, b, id) => canon(a.bindings?.[id]) === canon(b.bindings?.[id]);
