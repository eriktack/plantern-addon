// Loading locations, models and local config. Browser-only (uses fetch).

async function getJson(url, { optional = false } = {}) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    if (optional && res.status === 404) return null;
    throw new Error(`${url}: HTTP ${res.status}`);
  }
  try { return await res.json(); }
  catch (e) { throw new Error(`${url}: malformed JSON (${e.message})`); }
}

/** locations/index.json → { default, locations: [{ id, name, path }] } */
export const loadLocationIndex = (base = 'locations/') => getJson(base + 'index.json');

/** Loads location.json + its model file. Returns { location, model, baseUrl }. */
export async function loadLocation(entry, base = 'locations/') {
  const baseUrl = base + (entry.path || entry.id + '/');
  const location = await getJson(baseUrl + 'location.json');
  if (location.id !== entry.id) throw new Error(`${baseUrl}location.json: id "${location.id}" does not match index id "${entry.id}"`);
  const model = await getJson(baseUrl + (location.model || 'model.json'));
  model.levels ??= [];
  model.checks ??= [];
  model.anchors ??= [];
  return { location, model, baseUrl };
}

/** Git-ignored config.local.json (connections + secrets). Missing file → empty config. */
export async function loadLocalConfig(url = 'config.local.json') {
  return (await getJson(url, { optional: true })) || { connections: {} };
}
