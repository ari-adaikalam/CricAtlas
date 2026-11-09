import type { TileDef } from '../TileCarousel';
import { HeroReplay } from './HeroReplay';

/**
 * What the Home page shows from the first paint, before any script has run: the first tile's frame with grey shapes where its content will be, and the timeline under it. It is the same markup and
 * the same classes as the tile row (TileCarousel) draws, so every box sits exactly where the real one will; the row replaces it once the page is in the browser. Nothing on it is interactive.
 */
export function HomeFirstPaint({ name, note, tiles }: { name: string; note: string; tiles: readonly TileDef[] }) {
  const first = tiles[0]!;
  const groups: Array<{ name: string; items: TileDef[] }> = [];
  tiles.forEach((tile) => {
    const g = groups[groups.length - 1];
    if (g && g.name === tile.group) g.items.push(tile); else groups.push({ name: tile.group, items: [tile] });
  });
  return (
    <div className="hm-fp" aria-hidden="true">
      <div className="stagewrap">
        <div className="car" data-enter="instant">
          <article className={`tile${first.wide ? ' wide' : ''}`}>
            <h4>
              <span className="ttl">{first.title}<em className="inf" aria-hidden="true">i</em></span>
              {first.tag && <i>{first.tag}</i>}
            </h4>
            <HeroReplay frozen />
          </article>
        </div>
        <div className="edge l" /><div className="edge r" />
        <button type="button" className="arr r in" tabIndex={-1}><svg viewBox="0 0 24 24" width="22" height="22"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
      {/* The server cannot tell a phone from a laptop, so both timelines are sent and the style sheet shows the one that fits (home.css). The row replaces them once the page is in the browser. */}
      {[false, true].map((phone) => (
        <div key={String(phone)} className={`rail ${phone ? 'rail-p' : 'rail-d'}`}>
          <div className="rh"><b>{name}</b>{phone ? <><span>{first.label}</span><em>1 of {tiles.length}</em></> : <span>{note}</span>}</div>
          <div className="rtr" data-fit={phone ? 'tight' : 'one'} style={{ ['--n' as string]: tiles.length }}>
            <div className="line" />
            <div className="prog" style={{ width: 0 }} />
            <div className="gwrap">
              {groups.map((g) => (
                <div key={g.name} className={`grp${g.name === first.group ? ' on' : ''}`} style={{ flex: g.items.length }}>
                  <span className="gl">{g.name}</span>
                  <div className="nodes">
                    {g.items.map((tile) => (
                      <button key={tile.id} type="button" tabIndex={-1} data-r={tiles.indexOf(tile) % 2} className={`nd${tile === first ? ' on' : ''}`}><i /><span className="lb">{tile.label}</span></button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
