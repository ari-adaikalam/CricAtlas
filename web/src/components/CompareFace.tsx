'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { photoBackdrop } from '@/domain/colours';
import type { Player } from '@/data/player';

const initialsOf = (name: string): string => name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(-2).join('');
const FADE_OUT = 'opacity 0.37s ease-in 0.13s';
const PHOTO_WAIT_MS = 160;

/**
 * A player's face on the Compare pages: the player photo, hotlinked, over the country's colour (the photos are cut out), with the initials under it when the photo is missing or
 * does not load. `ring` is the colour of the player's side (gold for the first player, sky for the second).
 * With `morph` a change of player works as on the profile page: two photo slots take turns, the old photo stays until the new one is decoded and then they
 * cross-dissolve, and if the new photo is later than 160 ms the old one fades to the new player's initials, which sit under the photos.
 */
export function CompareFace({ player, size, ring, morph = false }: { player: Pick<Player, 'name' | 'country' | 'image url'>; size: number; ring?: string; morph?: boolean }) {
  const url = player['image url'];
  const [slots, setSlots] = useState<[string | null, string | null]>([url, null]);
  const [active, setActive] = useState<0 | 1>(0);
  const [on, setOn] = useState(true);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const wait = useRef(0);
  useLayoutEffect(() => {
    const free = (active === 0 ? 1 : 0) as 0 | 1;
    if (slots[active] === url || slots[free] === url) return;
    if (!morph || !slots[active] || !url) { setSlots(active === 0 ? [url, null] : [null, url]); setOn(true); return; }
    setSlots(free === 0 ? [url, slots[1]] : [slots[0], url]);
    window.clearTimeout(wait.current);
    wait.current = window.setTimeout(() => setOn(false), PHOTO_WAIT_MS);
  }, [url, morph, slots, active]);
  useEffect(() => () => window.clearTimeout(wait.current), []);
  const show = (slot: 0 | 1, element: HTMLImageElement): void => {
    const done = (): void => {
      if (slots[slot] !== url || slot === active) return;
      window.clearTimeout(wait.current);
      setActive(slot);
      setOn(true);
    };
    if (typeof element.decode === 'function') element.decode().then(done, done); else done();
  };
  const base = photoBackdrop(player.country);
  const current = slots[active];
  return (
    <div className="cface" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.32), boxShadow: ring ? `0 0 0 3px ${ring}` : undefined, ...base }}>
      {initialsOf(player.name)}
      {current && !failed.has(current) && ([0, 1] as const).map((slot) => slots[slot] && (
        <img key={slot} src={slots[slot]!} alt="" referrerPolicy="no-referrer"
          ref={(el) => { if (el && slot !== active && el.complete && el.naturalWidth > 0) show(slot, el); }}
          onLoad={(e) => { if (slot !== active) show(slot, e.currentTarget); }} onError={() => setFailed((was) => new Set(was).add(slots[slot]!))}
          style={{ opacity: slot === active && on ? 1 : 0, zIndex: slot === active ? 2 : 1, transition: !morph ? 'none' : slot === active ? (on ? 'opacity 0.5s ease' : 'opacity 0.25s ease') : FADE_OUT }} />
      ))}
    </div>
  );
}
