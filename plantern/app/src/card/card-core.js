// The pure parts of the Lovelace card (docs/archive/ha-11-12.md S14): its config, where the files of a house
// are, and which level it opens on. No DOM, so Node tests cover them; the element is plantern-card.js.

/** Where the add-on mirrors the houses (S15); the editor looks here for the list of houses. */
export const DEFAULT_INDEX = '/local/plantern/locations/index.json';

export const CARD_VIEWS = ['2d', '3d'];
/** dark: the plan's own dark background; card: the theme's card colour; transparent: no card chrome either, the dashboard shows through. */
export const CARD_BACKGROUNDS = ['dark', 'card', 'transparent'];

/** Check a card config { location, level?, levels?, cycle?, title?, height?, view?, background? }; returns the cleaned config or throws a message for the dashboard editor. */
export function cardConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('The card needs a configuration with a location.');
  const location = String(config.location ?? '').trim();
  if (!location) throw new Error('Choose a house: set location to the URL of its location.json (for example /local/plantern/locations/<house>/location.json).');
  if (!/\.json(\?.*)?$/i.test(location)) throw new Error(`location should be the URL of a location.json, not "${location}".`);
  const height = config.height === undefined || config.height === '' ? undefined : Number(config.height);
  if (height !== undefined && !(height >= 120 && height <= 2000)) throw new Error('height is in pixels, between 120 and 2000.');
  const view = config.view === undefined || config.view === '' ? undefined : String(config.view).toLowerCase();
  if (view !== undefined && !CARD_VIEWS.includes(view)) throw new Error(`view is "2d" or "3d", not "${config.view}".`);
  const background = config.background === undefined || config.background === '' ? undefined : String(config.background).toLowerCase();
  if (background !== undefined && !CARD_BACKGROUNDS.includes(background)) throw new Error(`background is one of ${CARD_BACKGROUNDS.join(', ')}, not "${config.background}".`);
  const levels = (Array.isArray(config.levels) ? config.levels : String(config.levels ?? '').split(','))
    .map(x => String(x).trim()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const cycle = config.cycle === undefined || config.cycle === '' || config.cycle === null ? undefined : Number(config.cycle);
  if (cycle !== undefined && !(cycle >= 2 && cycle <= 3600)) throw new Error('cycle is the seconds each floor stays on show, between 2 and 3600.');
  return {
    location,
    ...(levels.length ? { levels } : {}),
    ...(cycle !== undefined ? { cycle } : {}),
    ...(view && view !== '2d' ? { view } : {}),
    ...(background && background !== 'dark' ? { background } : {}),
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

/**
 * Which floors a card shows and how: { levels, mode }.
 *   select   no floors chosen: every floor, with a picker
 *   single   one floor chosen: just that one, no picker
 *   together several floors chosen: all on show at once, no picker
 *   cycle    `cycle` seconds set (with more than one floor to show): one at a time, a slideshow
 * Floors come in elevation order, bottom first; an unknown id in the config is ignored.
 */
export function cardLevels(model, cfg) {
  const all = (model?.levels || []).slice().sort((a, b) => (a.elevation || 0) - (b.elevation || 0));
  const wanted = new Set(cfg?.levels || []);
  const picked = all.filter(l => wanted.has(l.id));
  const levels = picked.length ? picked : all;
  const mode = cfg?.cycle > 0 && levels.length > 1 ? 'cycle' : picked.length > 1 ? 'together' : picked.length === 1 ? 'single' : 'select';
  return { levels, mode };
}

/** The floor after `current` in a slideshow (the first again after the last). */
export function nextLevel(levels, current) {
  if (!levels?.length) return null;
  const i = levels.indexOf(current);
  return levels[(i + 1) % levels.length];
}
