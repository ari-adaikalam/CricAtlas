"""What Match details needs beyond the scorecards of match_files.py: the fall of wickets, the partnerships, the phases and their extras, the fielding, the reviews, and the award counts.

Called by tools/match_files.py, which puts each result into the match bundle. Every number is worked out here once, and tools/verify_match_bundles.py checks it against tables built another way.
Definitions:
  wicket         a dismissal other than retired hurt and retired not out, numbered in the order they fell. The score at the fall is every run of the innings up to and including that delivery.
  partnership    a stand between two wickets for one pair of batters: it ends when a wicket falls, a batter retires or a new batter comes in (the same rule as `partnerships_by_player`).
                 Runs are every run the side scored while the pair was in, balls are the pair's balls faced (wides are not a ball faced), and each batter's runs and balls are their own.
  phase          the `phase` column of the ball file (powerplay, middle, death, rest in The Hundred). A Test has none, so it uses blocks of 20 overs, the bands of the Phase filter.
  fielding       a fielder the data lists without a name is a "Substitute fielder". A catch is the fielder listed for a caught dismissal, and the bowler for caught and bowled; a stumping is the fielder listed; a run out is credited to every fielder listed.
  award count    how many times the player of the match has been named in the same competition and season (the edition), or in the same series when there is none, up to and including this match.
"""
NOT_WICKETS = ("retired hurt", "retired not out")


def _falls(con, retired: bool) -> dict:
    """A batter's score at the fall is their runs and balls up to that delivery, counted from the balls, not read from the `player out` columns of the ball row: a delivery with two dismissals
    (a retirement and a stumping on one ball) carries those columns for only one of the two batters. A retirement is numbered as the wicket that would fall next, as the reference site's lists do ("3-338*")."""
    kind = "in" if retired else "not in"
    rows = con.sql(f"""
      with c as (
        select match_id, innings, delivery_number, scorecard_ball, "over", ball_in_over, shot_played, striker,
               sum(runs_off_bat + extras) over (partition by match_id, innings order by delivery_number) team_runs
        from balls where not is_super_over
      ), bat as (
        select match_id, innings, coalesce(striker_id, striker) k, delivery_number,
               sum(runs_off_bat) over (partition by match_id, innings, coalesce(striker_id, striker) order by delivery_number) r,
               sum((coalesce(wides, 0) = 0)::int) over (partition by match_id, innings, coalesce(striker_id, striker) order by delivery_number) b
        from balls where not is_super_over and striker is not null
      ), w as (
        select w.match_id, w.innings, w.delivery_number, w.player_dismissed, w.player_dismissed_id, w.wicket_type,
               case when {retired} then 1 + (select count(*) from wickets x where x.match_id = w.match_id and x.innings = w.innings and x.wicket_type not in {NOT_WICKETS} and x.delivery_number <= w.delivery_number)
                    else row_number() over (partition by w.match_id, w.innings order by w.delivery_number, w.wicket_number) end n
        from wickets w where w.wicket_type {kind} {NOT_WICKETS}
      )
      select w.match_id, w.innings, w.n, c.team_runs::int, w.player_dismissed, w.player_dismissed_id, coalesce(bat.r, 0)::int, coalesce(bat.b, 0)::int, c.scorecard_ball, c."over"::int, c.ball_in_over::int,
             w.wicket_type, case when c.striker = w.player_dismissed then c.shot_played else null end shot, w.delivery_number
      from w join c using (match_id, innings, delivery_number)
      asof left join bat on bat.match_id = w.match_id and bat.innings = w.innings and bat.k = coalesce(w.player_dismissed_id, w.player_dismissed) and w.delivery_number >= bat.delivery_number
      order by 1, 2, w.delivery_number, 3
    """).fetchall()
    out: dict = {}
    for (mid, inn, n, runs, name, pid, bat_runs, bat_balls, ball_text, over, ball, wt, shot, delivery) in rows:
        out.setdefault((mid, inn), []).append(dict(n=n, runs=runs, id=pid, name=name, batRuns=bat_runs, batBalls=bat_balls, ballText=ball_text, over=over, ball=ball, type=wt, shot=shot, delivery=delivery))
    return out


def fall_of_wickets(con) -> dict:
    return _falls(con, False)


def retirements(con) -> dict:
    """The batters who retired (hurt or not out) with the score at that moment, for the Fall of wickets line, where they are marked with a star."""
    return _falls(con, True)


def partnerships(con) -> dict:
    rows = con.sql(f"""
      with rw as (
        select match_id, innings, delivery_number, count(*) c from wickets where wicket_type not in {NOT_WICKETS} group by 1, 2, 3
      ), b as (
        -- wickets fallen before the ball, not `team_wickets_fallen`, which counts a retirement and so numbers every later stand one too high
        select x.match_id, x.innings, x.delivery_number,
               (coalesce(sum(rw.c) over (partition by x.match_id, x.innings order by x.delivery_number rows between unbounded preceding and 1 preceding), 0))::int wk,
               x.striker, x.non_striker, x.striker_id, x.runs_off_bat, x.extras, x.wides,
               least(x.striker, x.non_striker) lo, greatest(x.striker, x.non_striker) hi
        from balls x left join rw using (match_id, innings, delivery_number)
        where not x.is_super_over and x.striker is not null and x.non_striker is not null
      ), f as (
        select *, case when wk is distinct from lag(wk) over w or lo is distinct from lag(lo) over w or hi is distinct from lag(hi) over w then 1 else 0 end chg
        from b window w as (partition by match_id, innings order by delivery_number)
      ), g as (
        select *, sum(chg) over (partition by match_id, innings order by delivery_number) seg from f
      )
      select match_id, innings, seg, any_value(wk)::int wk, any_value(lo) lo, any_value(hi) hi,
             sum(runs_off_bat + extras)::int runs, count(*) filter (where coalesce(wides, 0) = 0)::int balls,
             coalesce(sum(runs_off_bat) filter (where striker = lo), 0)::int lo_runs, count(*) filter (where striker = lo and coalesce(wides, 0) = 0)::int lo_balls,
             coalesce(sum(runs_off_bat) filter (where striker = hi), 0)::int hi_runs, count(*) filter (where striker = hi and coalesce(wides, 0) = 0)::int hi_balls,
             any_value(case when striker = lo then striker_id end) filter (where striker = lo) lo_id, any_value(case when striker = hi then striker_id end) filter (where striker = hi) hi_id,
             min(delivery_number) first_d
      from g group by 1, 2, 3 order by 1, 2, 3
    """).fetchall()
    out: dict = {}
    for (mid, inn, seg, wk, lo, hi, runs, balls, lo_runs, lo_balls, hi_runs, hi_balls, lo_id, hi_id, first_d) in rows:
        out.setdefault((mid, inn), []).append(dict(wkt=wk + 1, a=dict(id=lo_id, name=lo, runs=lo_runs, balls=lo_balls), b=dict(id=hi_id, name=hi, runs=hi_runs, balls=hi_balls), runs=runs, balls=balls, first=first_d))
    return out


def phases(con) -> dict:
    rows = con.sql(f"""
      with p as (
        select b.match_id, b.innings, coalesce(b.phase, 'band' || ("over" // 20)::int) as pk, b."over", b.runs_off_bat, b.extras, b.is_legal_delivery, b.wides, b.noballs, b.byes, b.legbyes, b.penalty, b.delivery_number, b.non_boundary
        from balls b where not b.is_super_over
      ), wk as (
        select match_id, innings, delivery_number from wickets where wicket_type not in {NOT_WICKETS}
      )
      select p.match_id, p.innings, p.pk, min(p."over")::int first_over, max(p."over")::int last_over,
             sum(p.runs_off_bat + p.extras)::int runs, count(*) filter (where p.is_legal_delivery)::int balls,
             (select count(*) from wk where wk.match_id = p.match_id and wk.innings = p.innings and wk.delivery_number between min(p.delivery_number) and max(p.delivery_number))::int wkts,
             count(*) filter (where p.is_legal_delivery and p.runs_off_bat = 0)::int dots,
             count(*) filter (where p.runs_off_bat = 4 and not coalesce(p.non_boundary, false))::int fours, count(*) filter (where p.runs_off_bat = 6)::int sixes,
             coalesce(sum(p.wides), 0)::int wd, coalesce(sum(p.noballs), 0)::int nb, coalesce(sum(p.byes), 0)::int bye, coalesce(sum(p.legbyes), 0)::int lb, coalesce(sum(p.penalty), 0)::int pen,
             min(p.delivery_number) first_d
      from p group by 1, 2, 3 order by 1, 2, first_d
    """).fetchall()
    out: dict = {}
    for (mid, inn, pk, fo, lo, runs, balls, wkts, dots, fours, sixes, wd, nb, bye, lb, pen, _first) in rows:
        out.setdefault((mid, inn), []).append(dict(key=pk, firstOver=fo, lastOver=lo, runs=runs, balls=balls, wkts=wkts, dots=dots, fours=fours, sixes=sixes, extras=dict(wd=wd, nb=nb, b=bye, lb=lb, pen=pen)))
    return out


def fielding(con) -> dict:
    """Who took the catches, stumpings and run outs of each innings, for the side that was fielding."""
    rows = con.sql(f"""
      with e as (
        select w.match_id, w.innings, 'c' as kind, coalesce(f.fielder, 'Substitute fielder') as name, f.fielder_id as id, f.substitute as sub from wickets w join wicket_fielders f using (match_id, innings, delivery_number, wicket_number) where w.wicket_type = 'caught'
        union all
        select w.match_id, w.innings, 'c', b.bowler, b.bowler_id, false from wickets w join balls b using (match_id, innings, delivery_number) where w.wicket_type = 'caught and bowled'
        union all
        select w.match_id, w.innings, 'st', coalesce(f.fielder, 'Substitute fielder'), f.fielder_id, f.substitute from wickets w join wicket_fielders f using (match_id, innings, delivery_number, wicket_number) where w.wicket_type = 'stumped'
        union all
        select w.match_id, w.innings, 'ro', coalesce(f.fielder, 'Substitute fielder'), f.fielder_id, f.substitute from wickets w join wicket_fielders f using (match_id, innings, delivery_number, wicket_number) where w.wicket_type = 'run out'
      )
      select match_id, innings, coalesce(id, 'n:' || name) as k, any_value(id) as id, any_value(name) as name, bool_or(sub) as sub,
             count(*) filter (where kind = 'c')::int c, count(*) filter (where kind = 'st')::int st, count(*) filter (where kind = 'ro')::int ro
      from e where name is not null group by 1, 2, 3 order by 1, 2, c + st + ro desc, name
    """).fetchall()
    out: dict = {}
    for (mid, inn, _k, pid, name, sub, c, st, ro) in rows:
        out.setdefault((mid, inn), []).append(dict(id=pid, name=name, sub=bool(sub), c=c, st=st, ro=ro))
    return out


def reviews(con, exp) -> dict:
    rows = con.sql(f"""
      select r.match_id, r.innings, b.scorecard_ball, b."over"::int, r.review_by, r.batter, r.batter_id, r.decision, r.umpires_call, r.review_type
      from read_parquet('{exp / 'reviews.parquet'}') r join balls b on b.match_id = r.match_id and b.innings = r.innings and b.delivery_number = r.delivery_number
      order by r.match_id, r.innings, r.delivery_number
    """).fetchall()
    out: dict = {}
    for (mid, inn, ball_text, over, team, batter, batter_id, decision, umpires_call, kind) in rows:
        out.setdefault((mid, inn), []).append(dict(ballText=ball_text, over=over, team=team, batter=batter, batterId=batter_id, decision=decision, umpiresCall=bool(umpires_call), type=kind))
    return out


def awards(con) -> dict:
    """For each match, the player of the match and how many awards that player has in the same edition (or series) up to and including it. Keyed by (match id, name)."""
    rows = con.sql("""
      with m as (
        select match_id, start_date, coalesce(edition, 'series|' || coalesce(event, '') || '|' || season) as scope, unnest([player_of_match, player_of_match_2]) as name from matches_all
      ), n as (select distinct * from m where name is not null)
      select a.match_id, a.name, count(*)::int as n, any_value(a.scope) as scope
      from n a join n b on b.name = a.name and b.scope = a.scope and (b.start_date < a.start_date or (b.start_date = a.start_date and b.match_id <= a.match_id))
      group by 1, 2
    """).fetchall()
    return {(mid, name): dict(n=n, series=scope.startswith("series|")) for (mid, name, n, scope) in rows}
