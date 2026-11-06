"""Record lists for the Records page, derived from the exported tables.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/records_files.py [--out data/export] [--only <scope> ...]

A scope is a format and a gender (`test:male`, `odi:female`, `t20i:male`, `league:male`: every franchise T20 competition together) or one tournament or league (`t:<tournament key>`, whose
gender is its own). For each scope the file `r/<scope>/<category>.json` holds that category's lists, each `{id, title, cols, rows, note}` with `cols` a list of `[kind, label]` and each row a
list of cells (`player` and `team` cells are `[name, id]`, a `match` cell `[match id, label]`, a `date` cell an ISO date, the rest numbers or text). `r/index.json` lists the scopes and, for
each category, the lists in the order the page shows them. Lists are fetched whole in one request and read from memory, never through a query engine.

Everything is counted from the ball-by-ball data, which starts in 2001: a career is a career since then, and a record from before then is not in the data. Definitions follow the match bundles:
runs are bat runs plus extras for a team and bat runs for a batter, a legal ball is a delivery that was not a wide or a no-ball, wickets exclude retired hurt and retired not out, and a Super Over
is never an innings of the match. Qualifications for averages and rates are in each list's note.
"""
import argparse, json, math, re, shutil, sys, time
from pathlib import Path
import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from records_catalogue import LISTS, SRC, CI, columns
from records_extra import extra_tables

HERE = Path(__file__).resolve().parents[1]
TOP = 50
NOT_WK = "('retired hurt', 'retired not out')"
CATEGORIES = [('team', 'Team records'), ('batting', 'Batting records'), ('bowling', 'Bowling records'), ('fielding', 'Fielding records'), ('allround', 'All-round records'), ('partnership', 'Partnership records'), ('individual', 'Individual records')]


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def qualifications(kind):
    """The thresholds of a format for the qualified lists (innings, wickets, balls and so on), chosen so a list has the players who played a career in it."""
    return {
        'test': dict(Q=20, QB=2000, QD=30, QR=50, ALLOUT=10, QW=75, QWB=3000, QEB=60, QSW=5, QT=20, QT2=100, QRR=60, QS=3, QP=10,
                     AR1R=1000, AR1W=100, AR2R=1000, AR2W=50, AR2C=50, AR3R=3000, AR3W=100, ARQW=50, ARQI=40, ARSR=250, ARSW=20, ARMR=100, ARMW=10, ARFR=3000, ARFD=50),
        'odi': dict(Q=20, QB=2000, QD=40, QR=60, ALLOUT=10, QW=75, QWB=2000, QEB=30, QSW=4, QT=30, QT2=150, QRR=120, QS=4, QP=10,
                    AR1R=1000, AR1W=100, AR2R=1000, AR2W=50, AR2C=50, AR3R=3000, AR3W=100, ARQW=50, ARQI=40, ARSR=150, ARSW=10, ARMR=50, ARMW=5, ARFR=3000, ARFD=50),
        't20i': dict(Q=20, QB=500, QD=30, QR=30, ALLOUT=10, QW=30, QWB=600, QEB=12, QSW=3, QT=30, QT2=100, QRR=60, QS=4, QP=8,
                     AR1R=500, AR1W=30, AR2R=500, AR2W=20, AR2C=20, AR3R=1000, AR3W=50, ARQW=30, ARQI=30, ARSR=100, ARSW=8, ARMR=40, ARMW=3, ARFR=1000, ARFD=20),
        'league': dict(Q=20, QB=500, QD=30, QR=30, ALLOUT=10, QW=30, QWB=600, QEB=12, QSW=3, QT=30, QT2=100, QRR=60, QS=4, QP=8,
                       AR1R=500, AR1W=30, AR2R=500, AR2W=20, AR2C=20, AR3R=1000, AR3W=50, ARQW=30, ARQI=30, ARSR=100, ARSW=8, ARMR=40, ARMW=3, ARFR=1000, ARFD=20),
    }[kind]


# ---- The tables the lists read ------------------------------------------------------------------------------------------------------------------------------------
SK = "case when m.format = 'TEST' then 'test' when m.format = 'ODI' then 'odi' when m.type = 'Intl' then 't20i' else 'league' end"


def base_tables(con, out: Path):
    """Tables over every match, built once: matches with a scope kind, a team id for each side, and the player names."""
    p = lambda n: q(out / f'{n}.parquet')
    con.execute(f"""create table m0 as
      select m.match_id, {SK} as sk, m.gender as g, m.tournament_key as tk, (m.type = 'Fran(Hundred)') as hundred,
             coalesce(m.edition, m.event || ' ' || m.season) as series, m.start_date, m.end_date, m.venue, m.outcome, m.winner_id, m.team_1, m.team_2, m.team_1_id, m.team_2_id,
             m.winner_runs, m.winner_wickets, coalesce(m.won_by_innings, false) as won_inns, m.scheduled_overs, m.player_of_match, m.format, m.type, m.season, m.city, m.venue_country, m.event
      from {p('matches')} m where m.start_date is not null""")
    con.execute("""create table mt as
      select match_id, team_1 as team, team_1_id as team_id, team_2 as opponent, team_2_id as opp_id from m0
      union all select match_id, team_2, team_2_id, team_1, team_1_id from m0""")
    con.execute(f"create table pn as select player_id, name from {p('players')} where name is not null")


def scope_tables(con, out: Path, cond: str, bpo: int, team_id=None):
    """The scope's tables: the matches that fit `cond` and, for them, innings, spells, partnerships and the rest, with the columns the lists order and filter by."""
    p0 = lambda n: q(out / f'{n}.parquet')
    p = lambda n: 'mpv' if n == 'match_people' else p0(n)
    PINN = p('innings')
    for t in ('m', 'mt_s'):
        con.execute(f'drop table if exists {t}')
    con.execute(f'create or replace table m as select * from m0 where {cond}')
    con.execute('create or replace table mtm as select * from mt where match_id in (select match_id from m)')
    # A team's page of records looks at that team's side only: its batters, bowlers, innings and players.
    con.execute('create or replace table mt_s as select * from mtm' + (f' where team_id = {q(team_id)}' if team_id else ''))
    con.execute(f"create or replace table mpv as select * from {p0('match_people')} where match_id in (select match_id from m)" + (" and (role <> 'player' or team in (select team from mt_s))" if team_id else ''))
    # Team innings from the balls.
    con.execute(f"""create or replace table tin as
      select b.match_id, b.innings, b.batting_team_id as team_id, b.bowling_team_id as opp_id,
             sum(b.runs_off_bat + b.extras)::int as runs,
             sum(case when b.wicket = 1 and b.wicket_type not in {NOT_WK} then 1 else 0 end)::int as wickets,
             sum(case when b.is_legal_delivery then 1 else 0 end)::int as balls,
             sum(case when b.runs_off_bat = 4 and not coalesce(b.non_boundary, false) then 1 else 0 end)::int as fours,
             sum(case when b.runs_off_bat = 6 then 1 else 0 end)::int as sixes,
             sum(b.extras)::int as extras, sum(coalesce(b.byes, 0))::int as byes, sum(coalesce(b.legbyes, 0))::int as legbyes, sum(coalesce(b.wides, 0))::int as wides, sum(coalesce(b.noballs, 0))::int as noballs,
             count(distinct case when b.is_legal_delivery then b.bowler_id end)::int as bowlers,
             sum(case when b.wicket_type in ('caught', 'caught and bowled') then 1 else 0 end)::int as w_caught, sum(case when b.wicket_type = 'bowled' then 1 else 0 end)::int as w_bowled,
             sum(case when b.wicket_type = 'lbw' then 1 else 0 end)::int as w_lbw, sum(case when b.wicket_type = 'run out' then 1 else 0 end)::int as w_run_out,
             sum(case when b.wicket_type = 'stumped' then 1 else 0 end)::int as w_stumped
      from {p('balls_by_match')} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false) group by 1, 2, 3, 4""")
    # Batter innings, with what the lists need beyond the exported columns.
    con.execute(f"""create or replace table bi as
      select b.player_id, b.match_id, b.innings, b.start_date, b.team, b.opponent, b.venue, b.runs, b.balls, b.fours, b.sixes, b.is_out, b.balls_to_50, b.balls_to_100, b.chasing, b.result, b.position as pos,
             m.sk, m.g, m.tk, m.series, mt.team_id, mt.opp_id, extract(year from b.start_date)::int as yr, m.season, m.city, m.venue_country, b.team || ' v ' || b.opponent as mtext
      from {p('bat_innings')} b join m using (match_id) join mt_s mt on mt.match_id = b.match_id and mt.team = b.team where b.runs is not null""")
    con.execute("""create or replace table bi as
      select b.*, t.wickets as team_wkts, t.runs as team_runs, case when t.runs > 0 then 100.0 * b.runs / t.runs end as share, b.runs::int || case when b.is_out then '' else '*' end as runs_s,
             row_number() over (partition by b.player_id, b.match_id order by b.innings) as pm_rn,
             (b.runs = max(b.runs) over (partition by b.match_id, b.innings) and b.runs > 0) as top_in_team,
             (b.pos <= 2 and not b.is_out and t.wickets >= 10) as carried,
             (b.runs >= 100 and max(case when b.runs = 0 and b.is_out then 1 else 0 end) over (partition by b.match_id, b.player_id) = 1) as h_and_d,
             (b.runs >= 100 and row_number() over (partition by b.player_id, (b.runs >= 100) order by b.start_date, b.match_id, b.innings) = 1) as first_h100,
             (b.runs > coalesce(max(b.runs) over (order by b.start_date, b.match_id, b.innings, b.player_id rows between unbounded preceding and 1 preceding), -1)) as is_record,
             row_number() over (partition by b.pos order by b.runs desc, b.balls asc) as rn_pos
      from bi b left join tin t on t.match_id = b.match_id and t.innings = b.innings and t.team_id = b.team_id""")
    con.execute(f"""create or replace table fbo as
      select distinct b.match_id, b.striker_id as player_id from {p('balls_by_match')} b
      where b.match_id in (select match_id from m) and b.innings = 1 and b."over" = 0 and b.ball_in_over = 1 and b.wicket = 1 and b.player_dismissed = b.striker and b.wicket_type not in {NOT_WK}""")
    con.execute("create or replace table bi as select b.*, (f.player_id is not null) as first_ball_out from bi b left join fbo f on f.match_id = b.match_id and f.player_id = b.player_id and b.innings = 1")
    # Bowler spells.
    con.execute(f"""create or replace table bw as
      select w.player_id, w.match_id, w.innings, w.start_date, w.team, w.opponent, w.venue, w.balls, w.runs, w.wickets, w.maidens, w.hat_tricks, w.result, w.economy_counts,
             m.sk, m.g, m.tk, m.series, mt.team_id, mt.opp_id, extract(year from w.start_date)::int as yr, m.season, m.city, w.team || ' v ' || w.opponent as mtext
      from {p('bowl_innings')} w join m using (match_id) join mt_s mt on mt.match_id = w.match_id and mt.team = w.team where w.runs is not null""")
    con.execute(f"""create or replace table fbw as
      select distinct b.match_id, b.innings, b.bowler_id as player_id from {p('balls_by_match')} b
      where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false) and b.is_legal_delivery and b."over" = 0 and b.ball_in_over = 1 and b.wicket = 1
        and b.wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket')""")
    con.execute("""create or replace table bw as
      select w.*, (f.player_id is not null) as first_ball, row_number() over (partition by w.wickets order by w.runs asc, w.balls desc) as rn_w,
             row_number() over (partition by w.player_id, w.match_id order by w.innings) as pm_rn, w.wickets || '/' || w.runs::int as fig
      from bw w left join fbw f on f.match_id = w.match_id and f.innings = w.innings and f.player_id = w.player_id""")
    con.execute("""create or replace table fbat as select distinct match_id, innings, player_id from fbw""")
    # Team innings with the batters' counts, the match result and the run chase.
    con.execute("""create or replace table bcount as
      select match_id, innings, team_id, sum(case when runs >= 100 then 1 else 0 end)::int as h100, sum(case when runs >= 50 then 1 else 0 end)::int as h50p,
             sum(case when runs = 0 and is_out then 1 else 0 end)::int as ducks, sum(case when runs >= 10 then 1 else 0 end)::int as dbl, sum(case when runs < 10 then 1 else 0 end)::int as single,
             max(runs) as top, max(case when chasing then 1 else 0 end) = 1 as chasing, max(team_innings_n) as team_innings
      from (select match_id, innings, team_id, runs, is_out, chasing, row_number() over (partition by match_id, team_id order by innings) as team_innings_n from bi) group by 1, 2, 3""")
    con.execute(f"""create or replace table ti as
      select i.match_id, i.innings, i.team_id, i.opp_id, i.runs, i.wickets, i.balls, i.fours, i.sixes, i.extras, i.byes, i.legbyes, i.wides, i.noballs, i.bowlers, i.w_caught, i.w_bowled, i.w_lbw, i.w_run_out, i.w_stumped,
             coalesce(x.declared, false) as declared, m.start_date, m.venue, m.sk, m.g, m.tk, (select team from mt_s t where t.match_id = i.match_id and t.team_id = i.team_id limit 1) as team,
             (select opponent from mt_s t where t.match_id = i.match_id and t.team_id = i.team_id limit 1) as opponent,
             coalesce(c.h100, 0) as h100, coalesce(c.h50p, 0) as h50p, coalesce(c.ducks, 0) as ducks, coalesce(c.dbl, 0) as dbl, coalesce(c.single, 0) as single, coalesce(c.chasing, false) as chasing,
             row_number() over (partition by i.match_id, i.team_id order by i.innings) as team_innings, (i.extras > coalesce(c.top, 0)) as extras_top,
             (m.winner_id = i.team_id) as won, (m.winner_id = i.team_id) as won_by_it, (min(i.innings) over (partition by i.match_id, i.team_id) = 1) as bat_first, m.season,
             case when m.winner_id = i.team_id then 'won' when m.winner_id is not null then 'lost' else coalesce(m.outcome, 'no result') end as res
      from tin i join m on m.match_id = i.match_id left join {p('innings')} x on x.match_id = i.match_id and x.innings = i.innings left join bcount c on c.match_id = i.match_id and c.innings = i.innings and c.team_id = i.team_id""")
    if team_id:
        con.execute(f'delete from ti where team_id <> {q(team_id)}')
    con.execute("""create or replace table ti as
      select i.*, case when i.innings = mx.last and i.innings >= 2 then coalesce(x.target_runs, o.runs - coalesce(e.runs, 0) + 1) end as target
      from ti i join (select match_id, max(innings) as last from tin group by 1) mx on mx.match_id = i.match_id
        left join (select match_id, team_id, sum(runs) as runs from tin group by 1, 2) o on o.match_id = i.match_id and o.team_id = i.opp_id
        left join (select a.match_id, a.innings, a.team_id, coalesce(sum(b.runs), 0) as runs from tin a left join tin b on b.match_id = a.match_id and b.team_id = a.team_id and b.innings < a.innings group by 1, 2, 3) e
          on e.match_id = i.match_id and e.innings = i.innings and e.team_id = i.team_id
        left join INNINGS x on x.match_id = i.match_id and x.innings = i.innings""".replace('INNINGS', PINN))
    con.execute("create or replace table ti as select *, target - runs as rem from ti")
    # Batters and bowlers by match, series, year, ground and opponent.
    con.execute("""create or replace table bm as
      select player_id, match_id, any_value(team) as team, any_value(team_id) as team_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id, any_value(venue) as venue, min(start_date) as start_date, any_value(result) as result,
             sum(runs) as runs, sum(balls) as balls, sum(fours) as fours, sum(sixes) as sixes, count(*) as inns,
             max(case when pm_rn = 1 then runs_s end) as i1, max(case when pm_rn = 2 then runs_s end) as i2, max(case when pm_rn = 1 then runs end) as r1, max(case when pm_rn = 2 then runs end) as r2,
             bool_or(pm_rn = 1 and is_out) as o1, bool_or(pm_rn = 2 and is_out) as o2, max(runs) as mxr, any_value(mtext) as mtext, any_value(season) as season, any_value(city) as city,
             any_value(series) as series, sum(case when is_out then 0 else 1 end) as nout from bi group by 1, 2""")
    for t, key, label in (('bs', 'series', 'any_value(series)'), ('byr', 'yr', 'any_value(yr)::varchar'), ('bg', 'venue', 'any_value(venue)'), ('bo_', 'opponent', 'any_value(opponent)')):
        con.execute(f"""create or replace table {t} as
          select player_id, {key} as k, sum(runs) as runs, count(*) as inns, sum(balls) as balls, sum(case when runs >= 100 then 1 else 0 end) as h100, sum(case when runs >= 50 and runs < 100 then 1 else 0 end) as h50,
                 sum(case when runs >= 200 then 1 else 0 end) as h200, sum(case when runs = 0 and is_out then 1 else 0 end) as ducks, sum(sixes) as sixes, sum(fours) as fours, sum(case when is_out then 0 else 1 end) as nout,
                 count(distinct match_id) as mat, max(runs::int * 2 + case when is_out then 0 else 1 end) as hsx, string_agg(distinct team, ', ') as teams, {label} as grp,
                 min(yr)::varchar || case when min(yr) = max(yr) then '' else '-' || max(yr)::varchar end as span
          from bi group by 1, 2""")
    con.execute("""create or replace table wm as
      select player_id, match_id, any_value(team) as team, any_value(team_id) as team_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id, any_value(venue) as venue, min(start_date) as start_date, any_value(result) as result,
             sum(wickets) as wickets, sum(runs) as runs, sum(balls) as balls, max(wickets) as max_wkts, sum(maidens) as maidens,
             any_value(mtext) as mtext, any_value(season) as season, any_value(city) as city, any_value(series) as series from bw group by 1, 2""")
    for t, key, label in (('ws', 'series', 'any_value(series)'), ('wy', 'yr', 'any_value(yr)::varchar'), ('wg', 'venue', 'any_value(venue)'), ('wo', 'opponent', 'any_value(opponent)')):
        con.execute(f"""create or replace table {t} as
          with pm as (select player_id, {key} as k, match_id, sum(wickets) as w from bw group by 1, 2, 3),
               h as (select player_id, k, sum(case when w >= 10 then 1 else 0 end) as h10 from pm group by 1, 2)
          select b.player_id, b.{key} as k, sum(b.wickets) as wickets, count(*) as inns, sum(b.balls) as balls, sum(b.runs) as runs, sum(b.maidens) as maidens, sum(case when b.wickets = 4 then 1 else 0 end) as h4,
                 sum(case when b.wickets >= 5 then 1 else 0 end) as h5, any_value(h.h10) as h10, count(distinct b.match_id) as mat, string_agg(distinct b.team, ', ') as teams, {label.replace('any_value(', 'any_value(b.')} as grp,
                 max(struct_pack(w := b.wickets, r := -b.runs)) as bb, min(b.yr)::varchar || case when min(b.yr) = max(b.yr) then '' else '-' || max(b.yr)::varchar end as span
          from bw b join h on h.player_id = b.player_id and h.k = b.{key} group by b.player_id, b.{key}""")
    # Wickets by the way they fell, credited to the bowler.
    con.execute(f"""create or replace table wt as
      select b.bowler_id as player_id, b.wicket_type as way, count(*) as wickets, count(distinct b.match_id || '-' || b.innings) as inns,
             (select sum(balls) from bw x where x.player_id = b.bowler_id) as balls, (select sum(runs) from bw x where x.player_id = b.bowler_id) as runs,
             (select sum(case when wickets >= 5 then 1 else 0 end) from bw x where x.player_id = b.bowler_id) as h5, 'career' as grp
      from {p('balls_by_match')} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false) and b.wicket = 1
        and b.wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket') group by 1, 2""")
    # Streaks of innings, with the last innings of each streak.
    con.execute("""create or replace table streaks as
      with s as (select player_id, runs, balls, is_out, start_date, match_id, innings, row_number() over (partition by player_id order by start_date, match_id, innings) as rn from bi),
      f as (select *, (runs >= 100) as f_h100, (runs >= 50) as f_h50, (runs = 0 and is_out) as f_duck, not (runs = 0 and is_out) as f_noduck from s),
      k as (select player_id, 'h100' as kind, rn, runs, balls, start_date, match_id, innings, f_h100 as flag from f union all select player_id, 'h50', rn, runs, balls, start_date, match_id, innings, f_h50 from f
            union all select player_id, 'duck', rn, runs, balls, start_date, match_id, innings, f_duck from f union all select player_id, 'noduck', rn, runs, balls, start_date, match_id, innings, f_noduck from f),
      g as (select *, rn - row_number() over (partition by player_id, kind, flag order by rn) as isl from k),
      a as (select player_id, kind, isl, count(*) as n, sum(runs) as runs, sum(balls) as balls, min(start_date) as d1, max(start_date) as d2, sum(case when runs >= 100 then 1 else 0 end) as h100,
                   sum(case when runs >= 50 and runs < 100 then 1 else 0 end) as h50, arg_max(match_id, rn) as lm, arg_max(innings, rn) as li from g where flag group by 1, 2, 3)
      select a.player_id, a.kind, a.n, a.runs, a.n as inns, a.balls, a.h100, a.h50, a.d1, a.d2, a.lm as match_id, x.team, x.team_id, x.opponent, x.opp_id, x.venue, x.start_date as d_last
      from a left join bi x on x.player_id = a.player_id and x.match_id = a.lm and x.innings = a.li
      union all
      select f.player_id, 'preduck', f.rn - 1, 0, f.rn - 1, 0, 0, 0, (select min(start_date) from f f2 where f2.player_id = f.player_id), f.start_date, f.match_id, x.team, x.team_id, x.opponent, x.opp_id, x.venue, f.start_date
      from (select player_id, rn, start_date, match_id, innings, row_number() over (partition by player_id order by rn) as r from f where f_duck) f left join bi x on x.player_id = f.player_id and x.match_id = f.match_id and x.innings = f.innings
      where f.r = 1 and f.rn > 1""")
    # Careers.
    con.execute("""create or replace table bc as
      select player_id, min(yr)::varchar || case when min(yr) = max(yr) then '' else '-' || max(yr)::varchar end as span, count(distinct match_id)::int as mat, count(*)::int as inns, sum(case when is_out then 0 else 1 end)::int as nout, sum(runs)::int as runs,
             max(runs) as hs, coalesce(bool_or(not is_out) filter (where runs = (select 0)), false) as hs_x, sum(balls)::int as bf, sum(fours)::int as fours, sum(sixes)::int as sixes,
             sum(case when runs >= 100 then 1 else 0 end)::int as h100, sum(case when runs >= 50 and runs < 100 then 1 else 0 end)::int as h50, sum(case when runs >= 200 then 1 else 0 end)::int as h200,
             sum(case when runs >= 300 then 1 else 0 end)::int as h300, sum(case when runs >= 90 and runs < 100 then 1 else 0 end)::int as h90, sum(case when runs = 0 and is_out then 1 else 0 end)::int as ducks
      from bi group by 1""")
    con.execute("""create or replace table bc as
      select c.*, (select bool_or(not x.is_out) from bi x where x.player_id = c.player_id and x.runs = c.hs) as hs_no,
             case when c.inns - c.nout > 0 then c.runs * 1.0 / (c.inns - c.nout) end as ave, case when c.bf > 0 then 100.0 * c.runs / c.bf end as sr,
             (select count(*) from (select match_id from bi x where x.player_id = c.player_id and x.runs = 0 and x.is_out group by match_id having count(*) >= 2)) as pairs
      from bc c""")
    con.execute("""create or replace table wc as
      select player_id, min(yr)::varchar || case when min(yr) = max(yr) then '' else '-' || max(yr)::varchar end as span, count(distinct match_id)::int as mat, count(*)::int as inns, sum(balls)::int as balls, sum(maidens)::int as maidens,
             sum(runs)::int as runs, sum(wickets)::int as wkts, sum(case when wickets = 4 then 1 else 0 end)::int as h4, sum(case when wickets >= 5 then 1 else 0 end)::int as h5, sum(hat_tricks)::int as hat
      from bw group by 1""")
    con.execute(f"""create or replace table wc as
      select c.*, (select wickets from bw x where x.player_id = c.player_id order by wickets desc, runs asc limit 1) as bb_w, (select runs::int from bw x where x.player_id = c.player_id order by wickets desc, runs asc limit 1) as bb_r,
             case when c.wkts > 0 then c.runs * 1.0 / c.wkts end as ave, case when c.balls > 0 then {bpo}.0 * c.runs / c.balls end as econ, case when c.wkts > 0 then c.balls * 1.0 / c.wkts end as sr,
             (select count(*) from (select match_id from bw x where x.player_id = c.player_id group by match_id having sum(wickets) >= 10)) as h10
      from wc c""")
    # Fielding: every dismissal a fielder had a part in, with the match it happened in.
    con.execute(f"""create or replace table pmt as
      select mp.person_id as player_id, mp.match_id, any_value(mp.team) as team, any_value(t.team_id) as team_id, any_value(t.opponent) as opponent, any_value(t.opp_id) as opp_id, any_value(m.venue) as venue,
             any_value(m.start_date) as start_date, any_value(m.series) as series, extract(year from any_value(m.start_date))::int as yr
      from {p('match_people')} mp join m using (match_id) join mt_s t on t.match_id = mp.match_id and t.team = mp.team where mp.role = 'player' and mp.person_id is not null group by 1, 2""")
    con.execute(f"""create or replace table fl as
      select f.player_id, f.match_id, f.innings, f.kind, f.start_date, p.team, p.team_id, p.opponent, p.opp_id, p.venue, p.series, p.yr, p.team || ' v ' || p.opponent as mtext
      from {p('fielding_by_player')} f join pmt p on p.player_id = f.player_id and p.match_id = f.match_id where f.player_id is not null""")
    CT = "kind in ('catch', 'caught_and_bowled')"
    con.execute(f"""create or replace table fgi as
      select player_id, match_id, innings, count(*) filter (where {CT}) as ct, count(*) as dis, any_value(team) as team, any_value(team_id) as team_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id,
             any_value(venue) as venue, min(start_date) as d, any_value(mtext) as mtext from fl group by 1, 2, 3""")
    con.execute("""create or replace table fgm as
      select player_id, match_id, sum(ct) as ct, sum(dis) as dis, max(ct) as mx, any_value(team) as team, any_value(team_id) as team_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id,
             any_value(venue) as venue, min(d) as d, any_value(mtext) as mtext from fgi group by 1, 2""")
    # innings a player's side fielded in, by key (career, series, year)
    con.execute("""create or replace table pin as
      select p.player_id, p.match_id, t.innings, p.series, p.yr, p.team_id from pmt p join tin t on t.match_id = p.match_id and t.opp_id = p.team_id""")
    for t, key in (('fc', "'all'"), ('fcs', 'series'), ('fcy', 'yr')):
        con.execute(f"""create or replace table {t} as
          with kk as (select player_id, {key} as k, count(distinct match_id) as mat, count(*) as inns, min(yr)::varchar || case when min(yr) = max(yr) then '' else '-' || max(yr)::varchar end as span, any_value(series) as ser, any_value(yr)::varchar as yr
                     from pin group by 1, 2),
               f as (select player_id, {key.replace('series', 'series').replace('yr', 'yr')} as k, count(*) as n, count(*) filter (where {CT}) as ct, count(*) filter (where kind = 'stumping') as st,
                            count(*) filter (where kind like 'run_out%') as ro from fl group by 1, 2),
               mx as (select player_id, {key} as k, max(c) as mx from (select player_id, series, yr, match_id, innings, count(*) as c from fl where {CT} group by all) group by 1, 2)
          select kk.player_id, kk.k, kk.span, kk.mat, kk.inns, kk.ser, kk.yr, coalesce(f.n, 0)::int as n, coalesce(f.ct, 0)::int as ct, coalesce(f.st, 0)::int as st, coalesce(f.ro, 0)::int as ro, coalesce(mx.mx, 0)::int as mx,
                 coalesce(f.ct, 0) * 1.0 / nullif(kk.inns, 0) as per
          from kk left join f on f.player_id = kk.player_id and f.k = kk.k left join mx on mx.player_id = kk.player_id and mx.k = kk.k""")
    con.execute(f"""create or replace table subc as
      select wf.fielder_id as player_id, wf.match_id, w.innings, count(*) as ct, any_value(m.venue) as venue, min(m.start_date) as d,
             any_value(case when x.batting_team = m.team_1 then m.team_2 else m.team_1 end) as team,
             any_value(case when x.batting_team = m.team_1 then m.team_2_id else m.team_1_id end) as team_id, any_value(x.batting_team) as opponent,
             any_value(case when x.batting_team = m.team_1 then m.team_1_id else m.team_2_id end) as opp_id, any_value(m.team_1 || ' v ' || m.team_2) as mtext
      from {p('wicket_fielders')} wf join {p('wickets')} w on w.match_id = wf.match_id and w.innings = wf.innings and w.delivery_number = wf.delivery_number and w.wicket_number = wf.wicket_number
        join m on m.match_id = wf.match_id join {p('innings')} x on x.match_id = w.match_id and x.innings = w.innings
      where wf.substitute and wf.fielder_id is not null and w.wicket_type in ('caught', 'caught and bowled') group by wf.fielder_id, wf.match_id, w.innings""")
    con.execute("""create or replace table subm as
      select player_id, match_id, sum(ct) as ct, any_value(venue) as venue, min(d) as d, any_value(team) as team, any_value(team_id) as team_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id, any_value(mtext) as mtext
      from subc group by 1, 2""")
    # All-round.
    con.execute("""create or replace table ar as
      select coalesce(b.player_id, w.player_id) as player_id, coalesce(b.span, w.span) as span, greatest(coalesce(b.mat, 0), coalesce(w.mat, 0)) as mat, coalesce(b.runs, 0) as runs, coalesce(w.wkts, 0) as wkts, coalesce(f.ct, 0) as ct,
             coalesce(f.n, 0) as fd, b.ave as bave, w.ave as wave, coalesce(b.inns, 0) as inns_b
      from bc b full join wc w on w.player_id = b.player_id left join fc f on f.player_id = coalesce(b.player_id, w.player_id)""")
    con.execute("""create or replace table ars as
      select b.player_id, b.runs::int as runs, coalesce(w.wickets, 0)::int as wkts, b.k as series, (select min(start_date) from bi x where x.player_id = b.player_id and x.series = b.k) as d1
      from bs b join ws w on w.player_id = b.player_id and w.k = b.k""")
    con.execute("""create or replace table arm as
      select b.player_id, b.runs, w.wickets as wkts, b.team, b.team_id, b.opponent, b.opp_id, b.venue, b.start_date, b.match_id,
             (select max(runs) from bi x where x.player_id = b.player_id and x.match_id = b.match_id) as max_runs, w.max_wkts as max_wkts,
             exists (select 1 from bi x join fbo2 o on o.match_id = x.match_id and o.player_id = x.player_id where x.player_id = b.player_id and x.match_id = b.match_id and x.pos <= 2) as opened_both
      from bm b join wm w on w.player_id = b.player_id and w.match_id = b.match_id""".replace("exists (select 1 from bi x join fbo2 o on o.match_id = x.match_id and o.player_id = x.player_id where x.player_id = b.player_id and x.match_id = b.match_id and x.pos <= 2)", "false"))
    # Partnerships, one row for each partnership.
    con.execute(f"""create or replace table pt as
      select a.match_id, a.innings, a.wicket_number::int as wkt, a.runs, a.balls, a.ended, a.team, a.opponent, a.venue, a.start_date, n1.name as n1, a.player_id as id1, n2.name as n2, a.partner_id as id2,
             mt.team_id, mt.opp_id, coalesce(c.chasing, false) as chasing
      from {p('partnerships_by_player')} a join m using (match_id) join mt_s mt on mt.match_id = a.match_id and mt.team = a.team
        left join pn n1 on n1.player_id = a.player_id left join pn n2 on n2.player_id = a.partner_id left join bcount c on c.match_id = a.match_id and c.innings = a.innings and c.team_id = mt.team_id
      where a.player_id < a.partner_id and not coalesce(a.is_super_over, false)""".replace("and not coalesce(a.is_super_over, false)", ""))
    con.execute("create or replace table pt as select p.*, row_number() over (partition by p.wkt order by p.runs desc, p.balls asc) as rn_w from pt p")
    pair = """create or replace table {t} as
      select any_value(n1) as n1, id1, any_value(n2) as n2, id2, sum(runs) as runs, count(*)::int as inns, sum(case when runs >= 100 then 1 else 0 end)::int as h100, sum(case when runs >= 50 and runs < 100 then 1 else 0 end)::int as h50,
             sum(runs) * 1.0 / count(*) as ave, sum(case when ended then 0 else 1 end)::int as nobr, max(runs) as hi, min(extract(year from start_date))::varchar || '-' || max(extract(year from start_date))::varchar as span
      from pt {w} group by id1, id2"""
    con.execute(pair.format(t='pa', w=''))
    con.execute(pair.format(t='pao', w='where wkt = 1'))
    # Team results, matches and streaks.
    con.execute("""create or replace table tm as
      select m.match_id, coalesce(wt.team, m.team_1) as t1, coalesce(wt.team_id, m.team_1_id) as t1_id, case when wt.team is null then m.team_2 else wt.opponent end as t2, case when wt.team is null then m.team_2_id else wt.opp_id end as t2_id,
             case when m.winner_id is not null then (select team from mtm x where x.match_id = m.match_id and x.team_id = m.winner_id limit 1) || ' won' || case when m.winner_runs is not null and m.won_inns then ' by an innings and ' || m.winner_runs::int || ' runs'
                  when m.winner_runs is not null then ' by ' || m.winner_runs::int || ' runs' when m.winner_wickets is not null then ' by ' || m.winner_wickets::int || ' wickets' else '' end
                  else coalesce(m.outcome, 'result unknown') end as res,
             m.venue, m.start_date, m.end_date, m.winner_id, m.scheduled_overs as sched, m.outcome, m.winner_runs as win_runs, m.winner_wickets as win_wkts, m.won_inns, m.winner_id is not null or m.outcome = 'tie' as complete,
             (select sum(runs) from ti x where x.match_id = m.match_id) as agg,
             (select min(wk) from (select sum(wickets) as wk from ti x where x.match_id = m.match_id and x.team_id = m.winner_id group by x.team_id)) as winner_wkts_lost
      from m left join mtm wt on wt.match_id = m.match_id and wt.team_id = m.winner_id""")
    con.execute(f"""create or replace table tm as
      select m.*, (select team from mtm x where x.match_id = m.match_id and x.team_id = m.winner_id limit 1) as wname, a.wk, a.ob, a.ex, a.by, a.lb, a.wd, a.nb, a.f4, a.s6, a.h100, a.dk, a.bw, a.dbl, a.single, a.cc, a.cb, a.cl, a.cr, a.cs,
             g.tgt, g.tgt_balls, case when g.tgt_balls is not null and m.sched is not null then m.sched * {bpo} - g.tgt_balls end as balls_rem, m.sched * {bpo} as sched_balls, date_diff('day', m.start_date, coalesce(m.end_date, m.start_date)) + 1 as days,
             case when m.win_runs is not null and m.won_inns then 'an innings and ' || m.win_runs::int || ' runs' when m.win_runs is not null then m.win_runs::int || ' runs'
                  when m.win_wkts is not null then m.win_wkts::int || ' wickets' end as mg
      from tm m left join (select match_id, sum(wickets) as wk, sum(balls) as ob, sum(extras) as ex, sum(byes) as by, sum(legbyes) as lb, sum(wides) as wd, sum(noballs) as nb, sum(fours) as f4, sum(sixes) as s6,
                                  sum(h100) as h100, sum(ducks) as dk, sum(bowlers) as bw, sum(dbl) as dbl, sum(single) as single, sum(w_caught) as cc, sum(w_bowled) as cb, sum(w_lbw) as cl, sum(w_run_out) as cr, sum(w_stumped) as cs
                           from ti group by 1) a on a.match_id = m.match_id
        left join (select match_id, any_value(target) as tgt, any_value(balls) as tgt_balls from ti where target is not null and won group by 1) g on g.match_id = m.match_id""")
    for t, extra, grp in (('tr', '', 'x.team_id'), ('tro', ', x.opponent, x.opp_id', 'x.team_id, x.opp_id')):
        con.execute(f"""create or replace table {t} as
          select x.team_id, any_value(x.team) as team{', any_value(x.opponent) as opponent, x.opp_id' if t == 'tro' else ''}, count(*)::int as mat,
                 sum(case when m.winner_id = x.team_id and coalesce(m.outcome, '') <> 'tie' then 1 else 0 end)::int as won, sum(case when m.winner_id is not null and m.winner_id <> x.team_id and coalesce(m.outcome, '') <> 'tie' then 1 else 0 end)::int as lost,
                 sum(case when m.outcome = 'tie' then 1 else 0 end)::int as tied, sum(case when m.outcome = 'draw' then 1 else 0 end)::int as draw, sum(case when m.outcome = 'no result' then 1 else 0 end)::int as nr,
                 sum(case when m.outcome = 'tie' and m.winner_id = x.team_id then 1 else 0 end)::int as tie_w, sum(case when m.outcome = 'tie' and m.winner_id is not null and m.winner_id <> x.team_id then 1 else 0 end)::int as tie_l,
                 min(extract(year from m.start_date))::varchar || case when min(extract(year from m.start_date)) = max(extract(year from m.start_date)) then '' else '-' || max(extract(year from m.start_date))::varchar end as span
          from mt_s x join m using (match_id) group by {grp}""")
    con.execute("create or replace table tr as select *, 100.0 * won / nullif(mat - nr, 0) as winpct from tr")
    con.execute("""create or replace table ts as
      with r as (select x.team_id, any_value(x.team) as team, x.match_id, m.start_date,
                        case when m.winner_id = x.team_id then 'W' when m.winner_id is not null then 'L' when m.outcome in ('tie', 'draw') then 'D' else 'N' end as res
                 from mt_s x join m using (match_id) group by 1, 3, 4, 5),
      r2 as (select *, row_number() over (partition by team_id order by start_date, match_id) as rn from r where res <> 'N'),
      k as (select team_id, team, 'win' as kind, rn, start_date, match_id, (res = 'W') as flag from r2 union all select team_id, team, 'loss', rn, start_date, match_id, (res = 'L') from r2
            union all select team_id, team, 'unbeaten', rn, start_date, match_id, (res <> 'L') from r2 union all select team_id, team, 'winless', rn, start_date, match_id, (res <> 'W') from r2
            union all select team_id, team, 'draw', rn, start_date, match_id, (res = 'D') from r2 union all select team_id, team, 'nodraw', rn, start_date, match_id, (res <> 'D') from r2),
      g as (select *, rn - row_number() over (partition by team_id, kind, flag order by rn) as isl from k)
      select team_id, any_value(team) as team, kind, count(*)::int as n, min(start_date) as d1, max(start_date) as d2, arg_max(match_id, rn) as lm from g where flag group by team_id, kind, isl""")
    con.execute("create or replace table tg as select venue, count(*)::int as n, min(start_date) as d1, max(start_date) as d2, min(extract(year from start_date))::varchar || case when min(extract(year from start_date)) = max(extract(year from start_date)) then '' else '-' || max(extract(year from start_date))::varchar end as span from m where venue is not null group by 1")
    con.execute("""create or replace table tsr as
      with r as (select x.team_id, any_value(x.team) as team, m.series, count(*)::int as n, sum(case when m.winner_id = x.team_id then 1 else 0 end)::int as wins, min(m.start_date) as d1
                 from mt_s x join m using (match_id) where m.series is not null group by 1, 3)
      select team_id, team, series, n, d1, 'sweep' as kind from r where wins = n and n >= 3
      union all select team_id, team, series, n, d1, 'nowin' from r where wins = 0 and n >= 4""")
    # People.
    con.execute("""create or replace table pm as
      select mp.person_id as player_id, min(extract(year from m.start_date))::varchar || '-' || max(extract(year from m.start_date))::varchar as span, count(distinct mp.match_id)::int as n,
             sum(case when t.team_id = m.winner_id then 1 else 0 end)::int as won, sum(case when m.winner_id is not null and t.team_id <> m.winner_id then 1 else 0 end)::int as lost
      from match_people_ mp join m using (match_id) left join mt_s t on t.match_id = mp.match_id and t.team = mp.team where mp.role = 'player' group by 1""".replace("match_people_", p('match_people')))
    con.execute("""create or replace table po as
      select mp.person_id as player_id, count(*)::int as n, (select n from pm x where x.player_id = mp.person_id) as mat, (select span from pm x where x.player_id = mp.person_id) as span
      from match_people_ mp join m using (match_id) where mp.role = 'player' and mp.person = m.player_of_match group by 1""".replace("match_people_", p('match_people')))
    con.execute("""create or replace table p2 as
      select mp.person_id as player_id, string_agg(distinct mp.team, ', ') as teams, count(distinct mp.team)::int as nteams, count(distinct mp.match_id)::int as n,
             min(extract(year from m.start_date))::varchar || '-' || max(extract(year from m.start_date))::varchar as span
      from match_people_ mp join m using (match_id) where mp.role = 'player' group by 1 having count(distinct mp.team) >= 2""".replace("match_people_", p('match_people')))
    con.execute("""create or replace table um as
      select mp.role, mp.person as name, count(distinct mp.match_id)::int as n, min(extract(year from m.start_date))::varchar || '-' || max(extract(year from m.start_date))::varchar as span
      from match_people_ mp join m using (match_id) where mp.role in ('umpire', 'tv_umpire', 'match_referee') group by 1, 2""".replace("match_people_", p('match_people')))
    extra_tables(con, p, team_id)


def cell(kind, vals):
    """One output cell from the SQL values of a column (`player` and `team` take two, `match` and `matchname` two, `players` four)."""
    if kind in ('player', 'team', 'match', 'matchname'):
        return [vals[0], vals[1]] if vals[0] is not None else None
    if kind == 'players':
        return [vals[0], vals[1], vals[2], vals[3]]
    v = vals[0]
    if hasattr(v, 'isoformat'):
        return v.isoformat()[:10]
    if isinstance(v, float):
        return round(v, 3)
    return v


def width(kind):
    return {'player': 2, 'team': 2, 'match': 2, 'matchname': 2, 'players': 4}.get(kind, 1)


def run_list(con, item, cols, params, bpo):
    src = SRC[item['src']]
    sel = ', '.join(expr for _, _, expr in cols)
    where = item['where'].format(**params)
    order = item['order'].format(**params)
    frm = src['frm']
    extra = ''
    if ' where ' in frm:
        frm, extra = frm.split(' where ', 1)
        where = f'({extra}) and ({where})'
    sql = f"select {sel} from {frm} where {where} order by {order} limit {item['limit']}"
    if bpo != 6:
        sql = sql.replace('6.0 *', f'{bpo}.0 *')
    rows = []
    for r in con.execute(sql).fetchall():
        i, row = 0, []
        for kind, _, _ in cols:
            w = width(kind)
            row.append(cell(kind, r[i:i + w]))
            i += w
        rows.append(row)
    return rows


def scope_list(con, out: Path):
    sc = []
    for gender in ('male', 'female'):
        for kind, label in (('test', 'Tests'), ('odi', 'ODIs'), ('t20i', 'T20Is'), ('league', 'T20 leagues (all)')):
            n = con.execute("select count(*) from m0 where sk = ? and g = ? and not hundred", [kind, gender]).fetchone()[0] if kind == 'league' else con.execute('select count(*) from m0 where sk = ? and g = ?', [kind, gender]).fetchone()[0]
            if n >= 10:
                cond = f"sk = '{kind}' and g = '{gender}'" + (' and not hundred' if kind == 'league' else '')
                sc.append(dict(key=f'{kind}-{gender}', label=label, kind=kind, gender=gender, bpo=6, cond=cond, matches=n))
    rows = con.execute("""select m.tournament_key, any_value(m.tournament_name), any_value(m.gender), any_value(m.type), count(*) from matches_ m where m.tournament_kind in ('tournament', 'league') and m.tournament_key is not null group by 1 order by 5 desc""".replace('matches_', q(out / 'matches.parquet'))).fetchall()
    for key, name, gender, typ, n in rows:
        if n >= 10:
            sc.append(dict(key='t-' + key, label=name, kind='tournament', gender=gender, bpo=5 if typ == 'Fran(Hundred)' else 6, cond=f"tk = {q(key)}", matches=n, tournament=key,
                           sk=con.execute('select any_value(sk) from m0 where tk = ?', [key]).fetchone()[0]))
    return sc


QUAL_KEYS = ('Q', 'QB', 'QD', 'QR', 'QW', 'QWB', 'QEB', 'QSW', 'QT', 'QT2', 'QRR', 'QS', 'QP', 'AR1R', 'AR1W', 'AR2R', 'AR2W', 'AR2C', 'AR3R', 'AR3W', 'ARQW', 'ARQI', 'ARFR', 'ARFD')
# Lists that only make sense over the whole scope: a debut, a maiden hundred and a first duck are the first in the data, not the first in a slice of it.
WHOLE_SCOPE_ONLY = {'maiden-hundred-highest', 'innings-before-first-duck'}
SLICE_MIN = dict(team=12, ground=10, trophy=6, year=3)
TROPHY = "regexp_matches(event, '(Trophy|Ashes|Cup|Shield|Bowl)') and event not like '% tour of %' and event not like '%Series%'"


def slug(text) -> str:
    return re.sub(r'[^a-z0-9]+', '-', str(text).lower()).strip('-')[:70]


def params_for(kind: str, n: int) -> dict:
    """The qualification thresholds of a format, lowered in proportion for a scope or slice of fewer than 400 matches."""
    params = qualifications(kind if kind in ('test', 'odi', 't20i', 'league') else 'league')
    scale = min(1.0, n / 400)
    if scale < 1.0:
        params = {k: (max(1, round(v * scale)) if k in QUAL_KEYS else v) for k, v in params.items()}
    params['ALLOUT'] = 10
    return params


def scope_slices(con, s) -> list:
    """The slices of a scope: each year, each decade, each team, each ground and each named trophy that has enough matches."""
    base = s['cond']
    out = []
    kinds = ('year', 'decade', 'team', 'ground', 'trophy') if s['kind'] != 'tournament' else ('year', 'team')
    if s['matches'] < 60 and s['kind'] == 'tournament':
        return out
    if 'year' in kinds:
        for y, n in con.execute(f"select extract(year from start_date)::int, count(*) from m0 where {base} group by 1 having count(*) >= {SLICE_MIN['year']} order by 1").fetchall():
            out.append(dict(kind='year', key=f'y{y}', label=str(y), cond=f"({base}) and extract(year from start_date) = {y}", n=n))
    if 'decade' in kinds:
        for d in (2000, 2010, 2020):
            n = con.execute(f"select count(*) from m0 where ({base}) and extract(year from start_date) between {d} and {d + 9}").fetchone()[0]
            if n >= 10:
                out.append(dict(kind='decade', key=f'd{d}', label=f'{d}s', cond=f"({base}) and extract(year from start_date) between {d} and {d + 9}", n=n))
    if 'team' in kinds:
        for tid, name, n in con.execute(f"select team_id, any_value(team), count(*) from mt where match_id in (select match_id from m0 where {base}) group by 1 having count(*) >= {SLICE_MIN['team']} order by 3 desc, 2").fetchall():
            out.append(dict(kind='team', key='t-' + slug(tid), label=name, cond=f"({base}) and match_id in (select match_id from mt where team_id = {q(tid)})", n=n, team_id=tid))
    if 'ground' in kinds:
        for v, n in con.execute(f"select venue, count(*) from m0 where ({base}) and venue is not null group by 1 having count(*) >= {SLICE_MIN['ground']} order by 2 desc, 1").fetchall():
            out.append(dict(kind='ground', key='g-' + slug(v), label=v, cond=f"({base}) and venue = {q(v)}", n=n))
    if 'trophy' in kinds and s['kind'] in ('test', 'odi', 't20i'):
        for ev, n in con.execute(f"select event, count(*) from m0 where ({base}) and tk is null and event is not null and {TROPHY} group by 1 having count(*) >= {SLICE_MIN['trophy']} order by 2 desc, 1").fetchall():
            out.append(dict(kind='trophy', key='r-' + slug(ev), label=ev, cond=f"({base}) and tk is null and event = {q(ev)}", n=n))
    seen = set()
    for x in out:
        assert x['key'] not in seen, x['key']
        seen.add(x['key'])
    return out


def write_lists(con, sdir: Path, s: dict, kind: str, params: dict, whole: bool) -> tuple:
    """Run every list for the tables built for a scope or a slice and write one file for each category. Returns the lists of each category and the rows written."""
    sdir.mkdir(parents=True, exist_ok=True)
    per_cat = {c: [] for c, _ in CATEGORIES}
    fmt = {'test': 'test', 'odi': 'odi', 't20i': 't20i'}.get(kind, 't20i')
    total = 0
    for item in LISTS:
        own = CI.get(f"{item['cat']}|{item['title']}")
        if own is not None and fmt not in own:
            continue
        if item['fmts'] and fmt not in item['fmts']:
            continue
        if item['intl'] and s['kind'] not in ('test', 'odi', 't20i'):
            continue
        if not whole and (item['intl'] or item['id'] in WHOLE_SCOPE_ONLY):
            continue
        cols, hl = columns(item, fmt)
        try:
            rows = run_list(con, item, cols, params, s['bpo'])
        except Exception as e:
            raise RuntimeError(f"{s['key']} / {item['id']}: {e}")
        if not rows:
            continue
        per_cat[item['cat']].append(dict(id=item['id'], title=item['title'], note=(item['note'] or '').format(**params) or None, cols=[[k, l] for k, l, _ in cols], hl=hl, rows=rows))
        total += len(rows)
    counts = []
    for c, _ in CATEGORIES:
        counts.append(len(per_cat[c]))
        (sdir / f'{c}.json').write_text(json.dumps({'bpo': s['bpo'], 'lists': _finite(per_cat[c])}, separators=(',', ':'), ensure_ascii=False, allow_nan=False))
    return counts, total


def _finite(x):
    """A ratio with a zero divisor (a strike rate with no wicket) comes out of SQL as infinity, which is not JSON. It is an empty cell, shown as a dash."""
    if isinstance(x, float) and not math.isfinite(x):
        return None
    if isinstance(x, list):
        return [_finite(v) for v in x]
    if isinstance(x, dict):
        return {k: _finite(v) for k, v in x.items()}
    return x


def build(out: Path, only=None, slices=True) -> dict:
    t0 = time.time()
    con = duckdb.connect()
    con.execute('PRAGMA threads=8')
    base_tables(con, out)
    scopes = scope_list(con, out)
    if only:
        scopes = [s for s in scopes if s['key'] in only]
    root = out / 'r'
    if not only and root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    index_scopes, total, nslices = [], 0, 0
    for s in scopes:
        kind = s.get('sk') or s['kind']
        sdir = root / s['key']
        if sdir.exists():
            shutil.rmtree(sdir)
        scope_tables(con, out, s['cond'], s['bpo'])
        counts, rows = write_lists(con, sdir, s, kind, params_for(kind, s['matches']), True)
        total += rows
        by_kind = {}
        if slices:
            for sl in scope_slices(con, s):
                scope_tables(con, out, sl['cond'], s['bpo'], sl.get('team_id'))
                c, r = write_lists(con, sdir / sl['key'], s, kind, params_for(kind, sl['n']), False)
                total += r
                nslices += 1
                by_kind.setdefault(sl['kind'], []).append(dict(key=sl['key'], label=sl['label'], matches=sl['n'], lists=c))
        (sdir / 'slices.json').write_text(json.dumps(by_kind, separators=(',', ':'), ensure_ascii=False))
        index_scopes.append(dict(key=s['key'], label=s['label'], kind=s['kind'], gender=s['gender'], bpo=s['bpo'], matches=s['matches'], lists=dict(zip([c for c, _ in CATEGORIES], counts)), slices=sorted(by_kind)))
        print(f"{s['key']}: {sum(counts)} lists, {sum(len(v) for v in by_kind.values())} slices, {time.time() - t0:.0f}s", flush=True)
    (root / 'index.json').write_text(json.dumps({'categories': [[c, l] for c, l in CATEGORIES], 'scopes': index_scopes, 'since': 2001}, separators=(',', ':'), ensure_ascii=False))
    return {'scopes': len(index_scopes), 'slices': nslices, 'rows': total, 'seconds': round(time.time() - t0)}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='data/export')
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--no-slices', action='store_true')
    a = ap.parse_args()
    print(build(HERE / a.out, set(a.only) if a.only else None, not a.no_slices))
