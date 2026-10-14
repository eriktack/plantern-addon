// Stair dimensions as a person measures them (proposal 2026-10-13, answers: steps and outer length as the inputs).
// The model keeps `risers` and each flight's `length` (the run without the landing). The panel shows and takes:
//   steps      = risers − 1: the step surfaces a person walks on (the riser at the top is the landing's or the floor's)
//   outer      = the length of a flight along its walk: from the front of its first step (or the edge of the landing
//                before it) to the outer edge of the landing after it (or to the top step for the last flight).
// So outer = run + the landing after the flight, and that landing is as deep as the next flight is wide.

/** Steps of a flight from its risers (risers = steps + 1). */
export const stepsOf = risers => risers - 1;
/** Risers of a flight from its steps. */
export const risersOf = steps => steps + 1;

/** The run stored in the model from the outer length: the landing after the flight is taken off (`landing` mm, 0 for the last flight). */
export const runOf = (outer, landing = 0) => outer - landing;
/** The outer length shown from the stored run. */
export const outerOf = (run, landing = 0) => run + landing;

/** The landing after flight k is as deep (along the walk) as the next flight is wide; the last flight has none. */
export function landingAfter(flights, k, stairWidth) {
  const next = flights[k + 1];
  if (!next) return 0;
  const w = Number(next.width) > 0 ? Number(next.width) : Number(stairWidth);
  return Number.isFinite(w) ? w : 0;
}
