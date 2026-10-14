// A small modal dialog for the editor (fixes list 12, 20): a title, a message, optional text fields and buttons.
// The promise resolves with the button pressed and the field values, once the dialog is closed. A button may
// `fill` the fields (it stays open: "From name" fills the id box), or `check` the values first: a text returned
// from `check` is shown and the dialog stays open, so a bad value is fixed before it closes. Escape and Cancel
// resolve with the button id 'cancel'. Text is set as text, never as HTML.

export function openDialog({ title, message = '', fields = [], buttons = [] }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'pdialog';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.className = 'pmsg';
    p.style.whiteSpace = 'pre-line';                               // line breaks in the message are kept
    p.textContent = message;
    const body = document.createElement('div');
    body.className = 'pfields';
    const err = document.createElement('div');
    err.className = 'perr';
    err.setAttribute('role', 'alert');
    const row = document.createElement('div');
    row.className = 'pbtns';
    d.append(h, p, body, err, row);

    const inputs = {};
    for (const f of fields) {
      const lab = document.createElement('label');
      lab.textContent = f.label;
      const input = document.createElement('input');
      input.value = f.value ?? '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      lab.append(input);
      body.append(lab);
      inputs[f.name] = input;
    }
    const values = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));

    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      d.close();
      d.remove();
      resolve(result);
    };
    const primary = buttons.find(b => b.primary);
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.onclick = () => {
        if (b.fill) {                                              // fills the fields and stays open
          for (const [k, v] of Object.entries(b.fill(values()))) if (inputs[k]) inputs[k].value = v;
          err.textContent = '';
          return;
        }
        const bad = b.check?.(values());
        if (bad) { err.textContent = bad; return; }
        finish({ button: b.id, values: values() });
      };
      row.append(btn);
    }
    for (const input of Object.values(inputs)) {                   // Enter in a field presses the primary button
      input.addEventListener('keydown', e => { if (e.key === 'Enter' && primary) { e.preventDefault(); row.querySelector('button.primary').click(); } });
      input.addEventListener('input', () => { err.textContent = ''; });
    }
    d.addEventListener('cancel', e => { e.preventDefault(); finish({ button: 'cancel', values: values() }); });

    document.body.append(d);
    d.showModal();
    (Object.values(inputs)[0] ?? row.querySelector('button.primary') ?? row.querySelector('button'))?.focus();
  });
}

/**
 * A question with OK and Cancel, in the page: it replaces the browser's confirm box (ticket #6). Resolves true for OK.
 * `message` may have line breaks; Escape and Cancel resolve false.
 */
export async function askConfirm(message, { title = 'Are you sure?', ok = 'OK' } = {}) {
  const r = await openDialog({ title, message, buttons: [{ id: 'ok', label: ok, primary: true }, { id: 'cancel', label: 'Cancel' }] });
  return r.button === 'ok';
}
