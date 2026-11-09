'use client';

import { TeamSwatch } from '../TeamSwatch';
import { TeamLabel } from '../TeamLinks';
import { useMemo, useState } from 'react';
import { usePlayOnView } from '../charts/usePlayOnView';
import { bowlingOf, figureLine, oversText, type Bowling, type Figures } from '@/domain/analysis';
import type { BallFile } from '@/domain/ballByBall';
import { subMarks, type InningsCard, type MatchBundle } from '@/domain/match';
import { PlayerName } from '../PlayerName';
import { pickSide, useSides } from './useSides';

// The Spells tile: a row for each bowler of the side that bowled, a cell for each over with the runs in it (darker for more) and a white disc on an
// over with a wicket, the figures under the name. Clicking a row opens one card over both panels with the bowler's seven figures and a chip for each spell (the first over of each spell is marked on the
// row); the other rows fade. A Test innings keeps the cell size and scrolls sideways with the names held at the left. A spell is a bowler's overs with at most two overs by others between (Ari, 2026-10-22).

const HEAT = ['#1f2a36', '#24415a', '#2b6a96', '#3f98cf', '#8ad0f2'];
const heat = (v: number): string => HEAT[Math.min(4, Math.floor(v * 5))]!;

export interface SpellPanel { key: string; label: string; team: string; inn: InningsCard; bowling: Bowling[]; overs: number; partial: { over: number; balls: number } | null }

/** The panels of the tile for innings with ball files, the fielding side named. */
export function spellPanels(b: MatchBundle, innings: readonly InningsCard[], files: ReadonlyMap<number, BallFile>, label: (inn: InningsCard) => string, teamOf: (inn: InningsCard) => string): SpellPanel[] {
  const per = b.match.kind === 'hundred' ? 5 : b.match.ballsPerOver || 6;
  return innings.flatMap((inn) => {
    const f = files.get(inn.n);
    if (!f) return [];
    const bowling = bowlingOf(f, inn, per);
    const overs = f.ov.length ? Math.max(...f.ov) + 1 : 0;
    // The last over of an innings that ended inside it: its balls are named in the tip of the cell.
    const last = f.ov.length ? f.ov[f.ov.length - 1]! : -1;
    const lastBalls = f.ov.filter((o, i) => o === last && f.lg[i] === 1).length;
    return [{ key: `s${inn.n}`, label: label(inn), team: teamOf(inn), inn, bowling, overs, partial: last >= 0 && lastBalls > 0 && lastBalls < per ? { over: last, balls: lastBalls } : null }];
  });
}

const rate = (f: Figures, per: number): string => (f.balls > 0 ? ((f.runs / f.balls) * per).toFixed(2) : '-');

function Panel({ b, panel, scroll, pick, picked }: { b: MatchBundle; panel: SpellPanel; scroll: boolean; pick: (key: string, who: string) => void; picked: { key: string; who: string } | null }) {
  const marks = useMemo(() => subMarks(b), [b]);
  const hundred = b.match.kind === 'hundred';
  const per = hundred ? 5 : b.match.ballsPerOver || 6;
  const n = panel.overs;
  const scale = scroll ? 8 : n > 30 ? 10 : 15;
  const step = scroll || n <= 20 ? 5 : 10;
  const sel = picked && picked.key === panel.key ? picked.who : null;
  const { ref, played } = usePlayOnView<HTMLDivElement>(`${panel.key}:${panel.bowling.map((r) => r.figures.runs).join(',')}`);
  const word = (o: number): string => (hundred ? `balls ${o * 5 + 1} to ${o * 5 + 5}` : `over ${o + 1}`);
  return (
    <div className={`spg${scroll ? ' sc' : ''}${!scroll && n > 30 ? ' nonum' : ''}${played ? ' play' : ''}`} ref={ref}>
      <div className="spi" style={scroll ? { width: 96 + n * 28 } : undefined}>
        <div className="spr sph" style={{ cursor: 'default' }}>
          <div className="spl" />
          {Array.from({ length: n }, (_, o) => <div key={o} className="spc">{hundred ? ((o + 1) % 2 === 0 ? (o + 1) * 5 : '') : o === 0 || (o + 1) % step === 0 ? o + 1 : ''}</div>)}
        </div>
        {panel.bowling.map((row, r) => {
          const mine = new Map(row.overs.map((o) => [o.over, o]));
          const starts = new Set(row.spells.map((s) => s.from));
          const key = row.id ?? row.name;
          return (
            <div key={key} className={`spr${sel === key ? ' on' : ''}${sel && sel !== key ? ' dim' : ''}`} role="button" tabIndex={0} aria-pressed={sel === key} title={`Click for ${row.name}'s figures`} onClick={() => pick(panel.key, key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(panel.key, key); } }}>
              <div className="spl"><span className="spn" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><PlayerName id={row.id} name={row.name} marks={marks} /></span><em>{figureLine(row.figures, per, hundred)}</em></div>
              {Array.from({ length: n }, (_, o) => {
                const c = mine.get(o);
                if (!c) return <div key={o} className="spc" />;
                const part = panel.partial && panel.partial.over === o ? ` (${panel.partial.balls} balls)` : c.balls < per ? ` (${c.balls} balls)` : '';
                return (
                  <div key={o} data-c="" className={`spc${sel === key && starts.has(o) ? ' sps' : ''}`} style={{ background: heat(Math.min(0.95, c.runs / scale)), ['--i' as string]: Math.min(o, 30) + r * 2 }}
                    title={`${row.name}, ${word(o)}${part}: ${c.runs} ${c.runs === 1 ? 'run' : 'runs'}${c.wickets ? `, ${c.wickets} ${c.wickets === 1 ? 'wicket' : 'wickets'}` : ''}`}>
                    {c.runs}{c.wickets > 0 && <span className="spw">W</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The card over both panels for the picked bowler. */
function Card({ b, panel, who, close }: { b: MatchBundle; panel: SpellPanel; who: string; close: () => void }) {
  const marks = useMemo(() => subMarks(b), [b]);
  const hundred = b.match.kind === 'hundred';
  const per = hundred ? 5 : b.match.ballsPerOver || 6;
  const row = panel.bowling.find((r) => (r.id ?? r.name) === who);
  if (!row) return null;
  const f = row.figures;
  const cells: Array<[string, string]> = [
    [hundred ? String(f.balls) : oversText(f.balls, per), hundred ? 'balls' : 'overs'], [String(f.maidens), hundred ? 'dot sets' : 'maidens'], [String(f.runs), 'runs'], [String(f.wickets), 'wickets'],
    [rate(f, per), hundred ? 'economy per 5 balls' : 'economy'], [f.wickets ? (f.runs / f.wickets).toFixed(1) : '-', 'average'], [f.wickets ? String(Math.round(f.balls / f.wickets)) : '-', 'balls per wicket'],
  ];
  const range = (a: number, z: number): string => (hundred ? `Balls ${a * 5 + 1} to ${z * 5 + 5}` : a === z ? `Over ${a + 1}` : `Overs ${a + 1} to ${z + 1}`);
  return (
    <div className="spf">
      <div className="spfh"><PlayerName id={row.id} name={row.name} marks={marks} /><span>{panel.label}</span><button type="button" onClick={close}>Close</button></div>
      <div className="spfb">
        <div className="spfk">{cells.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>
        <div className="spfs">{row.spells.map((s) => <em key={s.from}><b>{range(s.from, s.to)}</b>{figureLine(s.figures, per, hundred)}</em>)}</div>
      </div>
    </div>
  );
}

export function SpellsTile({ b, panels, scroll }: { b: MatchBundle; panels: readonly SpellPanel[]; scroll: boolean }) {
  const [picked, setPicked] = useState<{ key: string; who: string } | null>(null);
  const pick = (key: string, who: string): void => setPicked((now) => (now && now.key === key && now.who === who ? null : { key, who }));
  const panel = useMemo(() => (picked ? panels.find((p) => p.key === picked.key) ?? null : null), [picked, panels]);
  const { bar, side } = useSides(panels.map((p) => p.team));
  return (
    <div className="spells">
      {bar}
      {panel && picked && <Card b={b} panel={panel} who={picked.who} close={() => setPicked(null)} />}
      <div className={`two2${panels.length === 1 ? ' one' : ''}`} data-side={side}>
        {pickSide(panels.map((p) => <div className="pan2" key={p.key}><h5><TeamSwatch team={p.team} /><TeamLabel team={p.team} text={p.label} /></h5><Panel b={b} panel={p} scroll={scroll} pick={pick} picked={picked} /></div>), side)}
      </div>
    </div>
  );
}
