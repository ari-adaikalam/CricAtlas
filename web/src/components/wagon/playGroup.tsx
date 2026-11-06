'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

/** How long a map that is ready waits for its partner to be ready too. After this the maps that can play do, so a map that never comes up cannot hold the others. */
const MAX_WAIT_MS = 1500;
/** Arrivals this close together are one start: the two maps of a tile are seen by their observers a frame or two apart. */
const QUIET_MS = 80;

interface Member { started: boolean; ready: boolean; play: (() => void) | null }

/**
 * Maps drawn side by side in one tile (a pitch map for each side of a match) begin their entrance together. Each one reports when it is set up and when it wants to play; the group lets
 * all of those begin at the same moment, once every map that has balls to show is ready. A map outside any group plays on its own, as before.
 */
export class PlayGroup {
  private members = new Map<symbol, Member>();
  private timer: number | undefined;
  private since = 0;

  join(id: symbol): void { this.members.set(id, { started: false, ready: false, play: null }); }
  leave(id: symbol): void { this.members.delete(id); if (this.members.size === 0) { window.clearTimeout(this.timer); this.since = 0; } }
  state(id: symbol, started: boolean, ready: boolean): void {
    const m = this.members.get(id);
    if (m) { m.started = started; m.ready = ready; }
  }
  /** The map wants to play its entrance now. */
  arrive(id: symbol, play: () => void): void {
    const m = this.members.get(id);
    if (!m) { play(); return; }
    m.play = play;
    if (this.since === 0) this.since = Date.now();
    this.schedule();
  }
  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.fire(), QUIET_MS);
  }
  private fire(): void {
    const all = [...this.members.values()];
    const waited = Date.now() - this.since;
    if (waited < MAX_WAIT_MS && all.some((m) => m.started && !m.ready)) { this.schedule(); return; }
    this.since = 0;
    for (const m of all) { const play = m.play; m.play = null; play?.(); }
  }
}

const GroupContext = createContext<PlayGroup | null>(null);

export function PlayGroupProvider({ children }: { children: ReactNode }) {
  const group = useRef<PlayGroup | null>(null);
  if (group.current === null) group.current = new PlayGroup();
  return <GroupContext.Provider value={group.current}>{children}</GroupContext.Provider>;
}

/** The group a map belongs to, if it sits in one, and its member id. */
export function usePlayGroup(): { group: PlayGroup | null; id: symbol } {
  const group = useContext(GroupContext);
  const id = useRef<symbol>(Symbol('map'));
  useEffect(() => { group?.join(id.current); const me = id.current; return () => group?.leave(me); }, [group]);
  return { group, id: id.current };
}
