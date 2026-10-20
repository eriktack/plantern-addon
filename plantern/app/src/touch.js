// Touch or mouse wording (mobile UX plan H6). A touch screen says *tap* and *double-tap*, and has no Esc or keys, so the
// Editor's help line, status line and menu hints do not tell it to click or press a key. The test is the pointer, not the
// screen width: a laptop with a touch screen still uses a mouse, and a phone with a keyboard attached is still a touch screen.

/** True when the main pointer is a finger (`pointer: coarse`). */
export function pointerIsCoarse(win = globalThis) {
  try { return !!win.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
}

/** The verb for picking something: *tap* on a touch screen, *click* with a mouse. */
export const pickVerb = coarse => (coarse ? 'tap' : 'click');

/** The Editor's help line (the text before its *Keys and mouse…* link). */
export function editorHelpText(coarse) {
  return coarse
    ? 'Tap something in the plan or the list to select it; double-tap it, or use ✎, to edit it.'
    : 'Click something in the plan or the list to select it; double-click it, press Enter or use ✎ to edit it. Esc lets go.';
}

/** The menu hint of the *Edit* entry. */
export const editHint = coarse => (coarse ? 'Or double-tap it' : 'Or double-click it, or Enter');
