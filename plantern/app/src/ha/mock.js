import { HaClientBase, targetIds } from './base.js';

/** Default mock state for an entity id, shaped exactly like a real HA state object. */
function seed(entity_id) {
  const domain = entity_id.split('.')[0], now = new Date().toISOString();
  const attributes = { friendly_name: entity_id };
  if (domain === 'light') Object.assign(attributes, {
    supported_color_modes: ['color_temp', 'rgb'], color_mode: 'color_temp',
    brightness: 200, color_temp_kelvin: 2700, rgb_color: null,
  });
  return { entity_id, state: domain === 'light' ? 'on' : domain === 'lock' ? 'locked' : 'off', attributes, last_changed: now, last_updated: now };
}

/**
 * In-memory HA for development. connection: { type: "mock", states?: { [entity_id]: partialState } }.
 * Every bound entity gets a seeded state unless the connection overrides it.
 */
export class MockHA extends HaClientBase {
  constructor({ entities = [], states = {} } = {}) {
    super();
    for (const id of entities) this.states.set(id, seed(id));
    for (const [id, s] of Object.entries(states)) {
      const base = this.states.get(id) || seed(id);
      this.states.set(id, { ...base, ...s, entity_id: id, attributes: { ...base.attributes, ...s.attributes } });
    }
  }
  async connect() { this._setStatus('mock'); }

  async callService(domain, service, data = {}, target = {}) {
    const ids = targetIds(target).concat(data.entity_id ? [].concat(data.entity_id) : []);
    const { entity_id: _ignored, ...attrs } = data;
    for (const id of ids) {
      const cur = this.states.get(id);
      if (!cur) throw new Error(`mock HA: unknown entity ${id}`);
      if (cur.state === 'unavailable') throw new Error(`mock HA: ${id} is unavailable`);
      const on = service === 'toggle' ? cur.state !== 'on' : service === 'turn_on' ? true : service === 'turn_off' ? false : null;
      if (on === null) throw new Error(`mock HA: unsupported service ${domain}.${service}`);
      const a = { ...cur.attributes };
      if (on && attrs.brightness != null) a.brightness = attrs.brightness;
      if (on && attrs.rgb_color) { a.rgb_color = attrs.rgb_color; a.color_mode = 'rgb'; }
      if (on && attrs.color_temp_kelvin) { a.color_temp_kelvin = attrs.color_temp_kelvin; a.color_mode = 'color_temp'; a.rgb_color = null; }
      const now = new Date().toISOString();
      this._set({ ...cur, state: on ? 'on' : 'off', attributes: a, last_updated: now, last_changed: on !== (cur.state === 'on') ? now : cur.last_changed });
    }
  }
}
