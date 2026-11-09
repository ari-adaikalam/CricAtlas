'use client';

import { ordinal, type MilestoneSection, type PaceRow } from '@/domain/milestones';
import { CountText } from './charts/CountUp';
import { useTableMotion } from './useTableMotion';


/** The cards tile body, as in the mockup: a row of cards for each section the player has reached (Player of the match, fifties, hundreds, five-wicket hauls). */
export function MilestoneCardsBody({ sections }: { sections: readonly MilestoneSection[] }) {
  const key = sections.map((s) => `${s.title}:${s.cards.length}`).join('|');
  const { ref, motion } = useTableMotion<HTMLDivElement>(key, key);
  return (
    <div className="mil mfill" ref={ref} data-rows={motion}>
      {sections.length === 0
        ? <div className="thin">No awards, fifties, hundreds or five-wicket hauls in this scope yet.</div>
        : sections.map((s) => (
          <div className="mcs" key={s.title}>
            <span className="mcl">{s.title}</span>
            <div className="mcg">{s.cards.map((c) => <div className="mc" key={c.count}><b>{c.ordinal}</b><span>{c.where}</span><em>{c.month}</em></div>)}</div>
          </div>
        ))}
    </div>
  );
}

/**
 * The pace tile body, as in the mockup: one row for each landmark reached with the innings number, the month and where the player stands by fewest innings. In the top 5
 * the row has a gold edge and lists the five quickest. A career that began before 2001 gets a note, and a rival whose career did too carries a dagger.
 */
export function PaceBody({ rows, side, earlyCareer }: { rows: readonly PaceRow[]; side: 'bat' | 'bowl'; earlyCareer: boolean }) {
  const key = `${side}:${rows.map((r) => `${r.landmark}:${r.innings}`).join('|')}`;
  const { ref, motion, played } = useTableMotion<HTMLDivElement>(key, key);
  return (
    <div className="mil" ref={ref} data-rows={motion}>
      {rows.length === 0
        ? <div className="thin">No {side === 'bat' ? 'runs' : 'wickets'} landmarks reached yet.</div>
        : (
          <div className="mrl">
            {rows.map((r) => (
              <div className={`mr${r.top ? ' mtp' : ''}`} key={r.landmark}>
                <b className="mrn">{r.label}</b>
                <span className="mri"><b><CountText value={r.innings} format={(n) => String(Math.round(n))} play={played} /></b> innings</span>
                <span className="mrd">{r.month}</span>
                <span className="mrk">{r.rank === null ? '' : <span className={r.top ? 'rcr' : 'rcm'}>{ordinal(r.rank)} quickest</span>}</span>
                {r.top && (
                  <div className="rcw mrc">
                    {r.chips.map((c, i) => <span key={`${c.name}:${i}`} className={`rkc${c.me ? ' me' : ''}`} title={`${c.name}: ${c.innings} innings`}><i>{i + 1}</i>{c.name}{c.earlier ? ' †' : ''}<b>{c.innings}</b></span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      {earlyCareer && <div className="onote">This career began before 2001 and the data starts in 2001, so earlier innings are missing and the pace ranks may be higher in reality. A † marks a rival whose career began before 2001 too.</div>}
    </div>
  );
}
