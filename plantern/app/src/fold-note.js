// A long note folded to one line with More… on a phone, as the Editor folds its long help (PLANTERN.md §7, *Panels*): used for the
// viewer's Home Assistant note (docs/archive/2026-10-20-mobile-ux.md, S5). Browser only; foldState() is pure and tested.

/** What the note and its button look like: folded (only on a phone), whether More…/Less shows, and its label. */
export function foldState({ phone, open, overflows }) {
  const folded = !!phone;
  const isOpen = folded && !!open;
  return { folded, open: isOpen, showButton: folded && (isOpen || !!overflows), label: isOpen ? 'Less' : 'More…' };
}

/** Folds `note` on phones (max-width 760 px, where the pages take their phone layout); call update() after its text changes. */
export function foldOnPhone(note) {
  const mq = matchMedia('(max-width: 760px)');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'morehelp';
  note.after(button);
  let open = false;
  const update = () => {
    note.classList.toggle('fold', mq.matches);
    note.classList.toggle('open', mq.matches && open);
    const s = foldState({ phone: mq.matches, open, overflows: note.scrollHeight > note.clientHeight + 1 });
    button.hidden = !s.showButton;
    button.textContent = s.label;
  };
  button.onclick = () => { open = !open; update(); };
  mq.addEventListener('change', update);
  return { update };
}
