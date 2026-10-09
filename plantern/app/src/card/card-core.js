// The pure parts of the Lovelace card (docs/plans/ha-11-12.md S14): its config, where the files of a house
// are, and which level it opens on. No DOM, so Node tests cover them; the element is plantern-card.js.

/** Where the add-on mirrors the houses (S15); the editor looks here for the list of houses. */
export const DEFAULT_INDEX = '/local/plantern/locations/index.json';

/** Check a card config { location, level?, title?, height? }; returns the cleaned config or throws a message for the dashboard editor. */
export function cardConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('The card needs a configuration with a location.');
  const location = String(config.location ?? '').trim();
  if (!location) throw new Error('Choose a house: set location to the URL of its location.json (for example /local/plantern/locations/<house>/location.json).');
  if (!/\.json(\?.*)?$/i.test(location)) throw new Error(`location should be the URL of a location.json, not "${location}".`);
  const height = config.height === undefined || config.height === '' ? undefined : Number(config.height);
  if (height !== undefined && !(height >= 120 && height <= 2000)) throw new Error('height is in pixels, between 120 and 2000.');
  return {
    location,
    ...(config.level ? { level: String(config.level) } : {}),
    ...(config.title ? { title: String(config.title) } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

/** The folder of a URL, with its trailing slash ("/a/b/location.json" gives "/a/b/"). */
export const dirOf = url => url.replace(/[?#].*$/, '').replace(/[^/]*$/, '');

/** { baseUrl, modelUrl } of a house from its location.json URL and the parsed file (its `model` names the model file). */
export function houseUrls(locationUrl, location) {
  const baseUrl = dirOf(locationUrl);
  return { baseUrl, modelUrl: baseUrl + (location?.model || 'model.json') };
}

/** The houses in a mirrored locations/index.json as [{ id, name, url }]: url is what a card's `location` holds. */
export function housesFromIndex(indexUrl, index) {
  const dir = dirOf(indexUrl);
  return (index?.locations || []).map(h => ({ id: h.id, name: h.name || h.id, url: `${dir}${h.path || `${h.id}/`}location.json` }));
}

/** The level a card opens on: the configured one, else the ground floor (elevation 0), else the first. */
export function chooseCardLevel(model, wanted) {
  const levels = model?.levels || [];
  return levels.find(l => l.id === wanted) || levels.find(l => l.elevation === 0) || levels[0] || null;
}
