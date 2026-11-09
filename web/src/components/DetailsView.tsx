'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { mainInnings, subMarks, type MatchBundle } from '@/domain/match';
import { prefetchBalls } from '@/data/ballData';
import { bbInningsLabel } from '@/domain/ballByBall';
import { roundName, superRounds } from '@/domain/superOver';
import { roundLabels, rounds } from '@/domain/matchDetails';
import { TileCarousel, type TileDef } from './TileCarousel';
import { usePhone } from './usePhone';
import { BattingPart, BowlingPart, ExtrasPart, FieldingPart, PhasesPart, ReviewsPart } from './details/DetailTables';
import { FallOfWicketsPart, PartnershipsPart } from './details/ScoringCharts';
import { BallByBallPart } from './details/BallByBallPart';
import { SuperOverPart } from './details/SuperOverPart';
import { MatchInfoPart } from './details/MatchInfoPart';

/** The switch of a Test between its first two innings and its last two, named by the innings of the match so it agrees with the headings under it, shared by every part that has one. */
export function RoundSwitch({ round, labels, onPick }: { round: number; labels: readonly string[]; onPick: (i: number) => void }) {
  if (labels.length < 2) return null;
  return (
    <span className="sw msw" role="group" aria-label="Innings">
      {labels.map((label, i) => <button key={label} type="button" className={round === i ? 'on' : undefined} onClick={() => onPick(i)}>{label}</button>)}
    </span>
  );
}

/**
 * The Match details view: the parts of the match record in one carousel with its own timeline. Match info, Batting, Phases, Bowling, Extras, Fielding and Reviews are built
 * from the bundle with no other request. A part that the match has nothing for (Reviews without review rows) is not drawn.
 */
export function DetailsView({ bundle, instant }: { bundle: MatchBundle; instant: boolean }) {
  const [round, setRound] = useState(0);
  const [bbn, setBbn] = useState(0);
  const [sor, setSor] = useState(0);
  const marks = useMemo(() => subMarks(bundle), [bundle]);
  const rs = useMemo(() => rounds(bundle), [bundle]);
  const at = Math.min(round, rs.length - 1);
  // On a phone every innings has a chip of its own in the parts, so they all take the whole match; the switch between rounds is for a screen with room for two panels.
  const phone = usePhone();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt on purpose each render, the memo below is keyed on it
  const innings = phone ? mainInnings(bundle) : rs[at] ?? [];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuilt on purpose each render, the memo below is keyed on it
  const control = <RoundSwitch round={at} labels={roundLabels(bundle)} onPick={setRound} />;
  // The first innings' balls are asked for when the view opens, so Ball by ball has them when the part is reached.
  useEffect(() => { const first = mainInnings(bundle)[0]; if (first) prefetchBalls(bundle.match.id, first.n); }, [bundle]);
  const tiles = useMemo((): TileDef[] => {
    const part = (id: string, label: string, group: string, title: string, tip: string, body: ReactNode, withRound = false): TileDef => (
      { id, label, group, title, tip, tag: 'Cricsheet', wide: true, part: true, ...(withRound && rs.length > 1 && !phone ? { control } : {}), body }
    );
    const list: TileDef[] = [
      part('info', 'Match info', 'Match', 'Match info', 'Where and when, toss, result, player of the match, officials, innings and replacements.', <MatchInfoPart b={bundle} marks={marks} />),
      part('batting', 'Batting', 'Scoring', 'Batting scorecards', 'Runs, balls, fours, sixes, strike rate and how each batter was out. Extras and the total close each card.', <BattingPart b={bundle} innings={innings} marks={marks} />, true),
      part('partnerships', 'Partnerships', 'Scoring', 'Partnerships', 'Each stand: runs and balls of both batters and the stand\'s total, which includes extras. A star means it was unbroken.', <PartnershipsPart b={bundle} innings={innings} marks={marks} />, true),
      part('fall', 'Fall of wickets', 'Scoring', 'Fall of wickets', 'Team score at each wicket, with the batter\'s score, the over and the shot they were out playing (blank if not recorded).', <FallOfWicketsPart b={bundle} innings={innings} />, true),
      part('phases', 'Phases', 'Scoring', 'Phases', bundle.match.kind === 'test' ? 'Runs, wickets, run rate, dot balls and boundaries in each block of 20 overs.' : 'Runs, wickets, run rate, dot balls and boundaries in each phase.', <PhasesPart b={bundle} innings={innings} />, true),
      part('bowling', 'Bowling', 'Bowling and fielding', 'Bowling', 'Overs, maidens, runs, wickets and economy for each bowler. Wides and no balls are charged to the bowler, byes and leg byes are not.', <BowlingPart b={bundle} innings={innings} marks={marks} />, true),
      part('extras', 'Extras', 'Bowling and fielding', 'Extras', 'Extras the batting side received, by phase. Wides and no balls are charged to the bowler, byes and leg byes are not.', <ExtrasPart b={bundle} innings={innings} />, true),
      part('fielding', 'Fielding', 'Bowling and fielding', 'Fielding', 'Catches, stumpings and run outs for each fielder. A bowler\'s catch counts for the bowler. Substitutes are marked.', <FieldingPart b={bundle} innings={innings} marks={marks} />, true),
    ];
    const all = mainInnings(bundle), srs = superRounds(bundle);
    const sAt = Math.min(sor, srs.length - 1);
    // A Super Over (or two) is added to the innings buttons of Ball by ball, and has a part of its own.
    const choices = [...all.map((i, k) => bbInningsLabel(bundle, i, k + 1)), ...srs.map((_, k) => roundName(srs, k))];
    const bbAt = Math.min(bbn, choices.length - 1);
    const bbControl = choices.length > 1 ? (
      <span className="sw msw" role="group" aria-label="Innings">
        {choices.map((label, k) => <button key={label} type="button" className={bbAt === k ? 'on' : undefined} onClick={() => setBbn(k)} title={k < all.length && bundle.match.kind === 'test' ? `${all[k]!.team}, ${label}` : undefined}>{label}</button>)}
      </span>
    ) : undefined;
    const soControl = srs.length > 1 ? (
      <span className="sw msw" role="group" aria-label="Super Over">
        {srs.map((_, k) => <button key={k} type="button" className={sAt === k ? 'on' : undefined} onClick={() => setSor(k)}>{roundName(srs, k)}</button>)}
      </span>
    ) : undefined;
    if (bundle.coverage.reviews > 0) list.push(part('reviews', 'Reviews', 'Bowling and fielding', 'Reviews', 'Reviews by each side. Upheld: the review succeeded and the on-field decision changed. Struck down: it failed. Umpires call: it failed because the evidence was too close.', <ReviewsPart b={bundle} innings={innings} marks={marks} />, true));
    if (srs.length > 0) list.push({ id: 'so', label: 'Super Over', group: 'Super Over', title: 'Super Over', tip: `The Super Over that decided the tied match.`, tag: 'Cricsheet', wide: true, part: true, ...(soControl ? { control: soControl } : {}), body: <SuperOverPart b={bundle} rounds={srs} at={sAt} marks={marks} /> });
    const shown = bbAt < all.length ? [all[bbAt]!] : [srs[bbAt - all.length]!.first, ...(srs[bbAt - all.length]!.second ? [srs[bbAt - all.length]!.second!] : [])];
    list.push({ id: 'ball', label: 'Ball by ball', group: 'Every ball', title: 'Ball by ball', tip: 'Every delivery in order: bowler, batter, result, wicket wording and, where recorded, shot, line and length, control and win chance.', tag: 'Cricsheet', wide: true, part: true, ...(bbControl ? { control: bbControl } : {}), body: <BallByBallPart b={bundle} innings={shown} marks={marks} superOver={bbAt >= all.length} name={bbAt >= all.length ? roundName(srs, bbAt - all.length) : ''} /> });
    return list;
  }, [bundle, innings, marks, rs.length, control, bbn, sor, phone]);
  if (mainInnings(bundle).length === 0) return <div className="pending"><h3>Match details</h3><p>No balls were bowled in this match.</p></div>;
  return <TileCarousel name="Match details" note="Click a stop to jump to it." tiles={tiles} resetKey={String(bundle.match.id)} instant={instant} />;
}
