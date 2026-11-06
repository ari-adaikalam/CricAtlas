'use client';

import { TeamSwatch } from '../TeamSwatch';
import { TeamLink } from '../TeamLinks';
import type { MatchBundle, SubMark } from '@/domain/match';
import { resultText } from '@/domain/match';
import { awardText, inningsCardLines, inningsNote, matchFacts, officialRows, potmLines, replacementLines } from '@/domain/matchDetails';
import { followOn, mainInnings } from '@/domain/match';
import { CountedText } from '../charts/CountedText';
import { usePlayOnView } from '../charts/usePlayOnView';
import { PlayerName } from '../PlayerName';

const TAG: Record<string, string> = { 'Impact player': 'IP', 'Concussion substitute': 'CS', Supersub: 'SS', 'Covid replacement': 'CV' };

const Facts = ({ rows }: { rows: Array<[string, string]> }) => (
  <dl className="kvl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
);

/** The record of the match: where, when, the toss and result, the player of the match with their figures and award count, the officials, each innings, and who was replaced. */
export function MatchInfoPart({ b, marks }: { b: MatchBundle; marks: Map<string, SubMark> }) {
  const facts: Array<[string, string]> = [...matchFacts(b), ['Result', resultText(b)]];
  const potm = b.match.potm[0];
  const lines = potmLines(b), award = awardText(b);
  const officials = officialRows(b);
  const innings = inningsCardLines(b), note = inningsNote(b);
  const repl = replacementLines(b);
  const test = b.match.kind === 'test';
  const fo = followOn(b);
  // The panels and their rows rise in one after another and the figures count up once the part is on screen, as the key numbers do.
  const { ref, played } = usePlayOnView<HTMLDivElement>(String(b.match.id));
  return (
    <div className={`minfo${test ? ' tmi' : ''}`} ref={ref} data-rows={played ? 'play' : 'wait'}>
      <div className="mip"><h5>Match</h5><Facts rows={facts} /></div>
      <div className={`mip pom${repl.length > 0 ? '' : ' pfull'}`}>
        <h5>Player of the match</h5>
        {potm ? (
          <>
            <div className="pn"><PlayerName id={potm.id} name={b.match.potm.map((p) => p.name).join(' and ')} marks={marks} /></div>
            {potm.team && <div className="g pteam"><TeamSwatch team={potm.team} size={18} /><TeamLink name={potm.team} /></div>}
            {lines.map((l) => <div key={l} className="pf"><CountedText text={l} play={played} /></div>)}
            {award && <div className="g">{award}</div>}
          </>
        ) : <div className="g">No player of the match was named.</div>}
      </div>
      <div className={`mip moff${repl.length > 0 ? '' : ' ofull'}`}><h5>Officials</h5>{officials.length ? <Facts rows={officials} /> : <div className="g">The officials are not in the data.</div>}</div>
      <div className="mip minn half1">
        <h5>Innings</h5>
        <div className={`inl${test ? ' tinl' : ''}`}>
          {innings.map((l, k) => (
            <div key={k}>
              <b><TeamSwatch team={l.team} size={20} />{test ? <>{`${mainInnings(b)[k] ? ['1st', '2nd', '3rd', '4th'][k] : ''} innings, `}<TeamLink name={l.team} /></> : <TeamLink name={l.team} />}</b><span><CountedText text={l.text} play={played} /></span>
              {l.extra.includes('declared') && <em className="evt chance" title="The captain closed the innings">Declared</em>}
              {fo && k === 2 && l.team === fo && <em className="evt drop" title="Trailing by 200 or more, the side was asked to bat again">Follow-on</em>}
            </div>
          ))}
          {note && <div className="g">{note}</div>}
        </div>
      </div>
      {repl.length > 0 && (
        <div className="mip half2">
          <h5>Replacements</h5>
          <div className="rpl">
            {repl.map((r, k) => (
              <div key={k}>
                <span className="tag" title={r.tag}>{TAG[r.tag] ?? 'R'}</span>
                {r.team && <b>{r.team}</b>}
                <span className="rpt"><PlayerName id={r.inId} name={r.inName} marks={marks} /> in for <PlayerName id={r.outId} name={r.outName} marks={marks} />{r.detail}{r.when ? `, ${r.when}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
