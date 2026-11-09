'use client';

// Off (Ari, 2026-10-26). A table that scrolls both ways used to be held to one axis while a finger dragged it: first by switching the frame's overflow, then by putting the other axis back from a scroll handler. On an
// iPhone both made tables jump to their start or stutter. The Matchups table, which neither ever touched, scrolled well, so a table now scrolls freely in both directions and a diagonal drag moves it on both axes.
// Kept as a component so the layout that mounts it needs no change.
export function PhoneScrollLock(): null {
  return null;
}
