// The material choices of a blueprint (object-templates T9, decision 26). One rule, used by the validator (src/model/objects.js),
// the Objects page's form (src/param-form.js) and the tests. Pure.
//
//   A part's own `options` in parts[] come first; otherwise the blueprint's material parameter's `options`; a null result
//   means the blueprint does not limit the choice (any library name or #rrggbb).
//   `custom` in a list allows any #rrggbb as well as the names.

const HEX = /^#[0-9a-f]{6}$/i;

/** The material options of a whole object (partKey null) or of one part, or null when the blueprint does not limit them. */
export function materialOptions(meta, partKey = null) {
  if (partKey != null) {
    const part = (meta.parts || []).find(p => p.key === partKey);
    if (Array.isArray(part?.options)) return part.options;
  }
  const param = (meta.params || []).find(d => d.type === 'material');
  return Array.isArray(param?.options) ? param.options : null;
}

/** Whether a material value is allowed by a list of options (null: anything shaped like a name or #rrggbb). */
export function materialAllowed(value, options) {
  if (options == null) return true;
  return options.includes(value) || (HEX.test(value) && options.includes('custom'));
}
