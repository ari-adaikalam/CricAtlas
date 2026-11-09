"""The tables the less common record lists read, built over the scope's tables (records_files.py). Everything is counted from the ball-by-ball data, which starts in 2001."""

NOT_WK = "('retired hurt', 'retired not out')"


def extra_tables(con, p, team_id=None):
    BB = p('balls_by_match')
    TB = f" and b.batting_team_id = '{team_id}'" if team_id else ''
    WB = f" and b.bowling_team_id = '{team_id}'" if team_id else ''
    # Combined career: batting, bowling and fielding of a player in one row.
    con.execute("""create or replace table pcar as
      select pm.player_id, pm.span, pm.n as mat, coalesce(b.runs, 0) as runs, b.hs, b.hs_no, b.ave, b.h100, w.wkts, w.bb_w, w.bb_r, w.ave as wave, w.h5, coalesce(f.ct, 0) as ct, coalesce(f.st, 0) as st, coalesce(f.n, 0) as dis, coalesce(b.inns, 0) as inns_b
      from pm left join bc b using (player_id) left join wc w using (player_id) left join (select * from fc where k = 'all') f using (player_id)""")
    # A player's match: both batting innings, the best bat score, both bowling innings and the best figures.
    con.execute("""create or replace table fob as
      select distinct b.match_id, b.bowler_id as player_id from """ + BB + """ b where b.match_id in (select match_id from m) and b."over" = 0 and not coalesce(b.is_super_over, false)""" + WB)
    con.execute("""create or replace table arm as
      with bf as (select player_id, match_id, max(case when pm_rn = 1 then fig end) as f1, max(case when pm_rn = 2 then fig end) as f2, max(wickets) as mxw, arg_max(fig, wickets * 100000 - runs) as best_bowl from bw group by 1, 2),
           bt as (select player_id, match_id, max(runs) as mxr, arg_max(runs_s, runs) as best_bat from bi group by 1, 2),
           op as (select distinct f.player_id, f.match_id from fob f join bi x on x.player_id = f.player_id and x.match_id = f.match_id where x.pos <= 2)
      select b.player_id, b.runs, w.wickets as wkts, b.team, b.team_id, b.opponent, b.opp_id, b.venue, b.start_date, b.match_id, b.i1, b.i2, f.f1, f.f2, f.mxw as max_wkts, t.mxr as max_runs, t.best_bat, f.best_bowl,
             (op.player_id is not null) as opened_both
      from bm b join wm w on w.player_id = b.player_id and w.match_id = b.match_id join bf f on f.player_id = b.player_id and f.match_id = b.match_id join bt t on t.player_id = b.player_id and t.match_id = b.match_id
        left join op on op.player_id = b.player_id and op.match_id = b.match_id""")
    # Team innings: hundred partnerships, openers with hundreds, bowlers who took a wicket, bowlers with a five-for or four-for.
    con.execute("""create or replace table ti as
      select i.*, coalesce(pp.p100, 0) as p100, coalesce(oo.open100, false) as open100, coalesce(bk.bwk, 0) as bwk, coalesce(bk.twk, 0) as twk, coalesce(bk.b5, 0) as b5, coalesce(bk.b4, 0) as b4
      from ti i left join (select match_id, innings, team_id, count(*) filter (where runs >= 100) as p100 from pt group by 1, 2, 3) pp on pp.match_id = i.match_id and pp.innings = i.innings and pp.team_id = i.team_id
        left join (select match_id, innings, team_id, true as open100 from bi where pos <= 2 and runs >= 100 group by 1, 2, 3 having count(*) = 2) oo on oo.match_id = i.match_id and oo.innings = i.innings and oo.team_id = i.team_id
        left join (select match_id, innings, opp_id as team_id, count(*) filter (where wickets > 0) as bwk, sum(wickets) as twk, count(*) filter (where wickets >= 5) as b5, count(*) filter (where wickets >= 4) as b4 from bw group by 1, 2, 3) bk
          on bk.match_id = i.match_id and bk.innings = i.innings and bk.team_id = i.team_id""")
    # Match totals of those, pairs, and a victory after following on.
    con.execute("""create or replace table tm as
      select m.*, a.p100, a.bwk, a.twk, coalesce(pr.pairs, 0) as pairs, (fo.match_id is not null) as fo_win
      from tm m left join (select match_id, sum(p100) as p100, sum(bwk) as bwk, sum(twk) as twk from ti group by 1) a on a.match_id = m.match_id
        left join (select match_id, count(*) as pairs from bm where i1 = '0' and i2 = '0' and o1 and o2 group by 1) pr on pr.match_id = m.match_id
        left join (select a.match_id from tin a join tin b on b.match_id = a.match_id and b.innings = 3 and b.team_id = a.team_id join m x on x.match_id = a.match_id and x.winner_id = a.team_id where a.innings = 2) fo on fo.match_id = m.match_id""")
    # Series of a bilateral tour: one row for each side, with its results in order and the players it used.
    con.execute("""create or replace table ser as
      with r as (select x.team_id, x.team, x.opponent, x.opp_id, m.series, m.season, m.match_id, m.start_date, coalesce(hh.h100, 0) as h100,
                        case when m.winner_id = x.team_id then 'won' when m.winner_id is not null then 'lost' else 'drawn' end as res
                 from mt_s x join m using (match_id) left join (select match_id, team_id, sum(h100) as h100 from ti group by 1, 2) hh on hh.match_id = x.match_id and hh.team_id = x.team_id
                 where m.tk is null and m.series is not null),
           pl as (select t.team_id, m.series, count(distinct mp.person_id) as players from """ + p('match_people') + """ mp join m using (match_id) join mt_s t on t.match_id = mp.match_id and t.team = mp.team
                  where mp.role = 'player' and m.tk is null group by 1, 2)
      select r.team_id, any_value(r.team) as team, any_value(r.opponent) as opponent, any_value(r.opp_id) as opp_id, r.series, any_value(r.season) as season, count(*)::int as n,
             sum(case when r.res = 'won' then 1 else 0 end)::int as won, sum(case when r.res = 'lost' then 1 else 0 end)::int as lost, sum(case when r.res = 'drawn' then 1 else 0 end)::int as drawn, min(r.start_date) as d1,
             string_agg(r.res, ',' order by r.start_date, r.match_id) as results, any_value(pl.players)::int as players, sum(r.h100)::int as h100
      from r left join pl on pl.team_id = r.team_id and pl.series = r.series group by r.team_id, r.series""")
    con.execute("""create or replace table ser as
      select s.*, case when won > lost then 'W' when lost > won then 'L' else 'D' end as sres,
             (case when won > lost then exists (select 1 from (select unnest(string_split(results, ',')) as r, generate_subscripts(string_split(results, ','), 1) as i) q
                                               where (select count(*) filter (where r2 = 'lost') - count(*) filter (where r2 = 'won') from (select unnest(string_split(results, ',')[1:q.i]) as r2)) > 0) else false end) as from_behind
      from ser s""")
    con.execute("""create or replace table sr as
      select series, any_value(season) as season, any_value(d1) as d1,
             case when max(won) > max(lost) and sum(won) > 0 then (select team from ser x where x.series = s.series order by won desc limit 1) else 'drawn' end as winner,
             max(won)::varchar || '-' || min(won)::varchar || ' (' || any_value(n)::varchar || ')' as margin, any_value(n) as n
      from ser s group by series having count(*) = 2""")
    con.execute("""create or replace table sst as
      with o as (select *, row_number() over (partition by team_id order by d1, series) as rn from ser),
           k as (select team_id, team, 'win' as kind, rn, (sres = 'W') as flag from o union all select team_id, team, 'loss', rn, (sres = 'L') from o
                 union all select team_id, team, 'unbeaten', rn, (sres <> 'L') from o union all select team_id, team, 'winless', rn, (sres <> 'W') from o),
           g as (select *, rn - row_number() over (partition by team_id, kind, flag order by rn) as isl from k where true),
           a as (select team_id, any_value(team) as team, kind, isl, count(*)::int as n, min(rn) as r1, max(rn) as r2 from g where flag group by team_id, kind, isl)
      select a.team_id, a.team, a.kind, a.n, sum(o.n)::int as mat, sum(o.won)::int as won, sum(o.lost)::int as lost, any_value(f.series) as first_series, any_value(l.series) as last_series, any_value(f.series) || ' to ' || any_value(l.series) as period
      from a join o on o.team_id = a.team_id and o.rn between a.r1 and a.r2 join o f on f.team_id = a.team_id and f.rn = a.r1 join o l on l.team_id = a.team_id and l.rn = a.r2 group by a.team_id, a.team, a.kind, a.isl, a.n""")
    # Overs: the runs charged to the bowler, the batter who faced most of it, and each ball.
    con.execute(f"""create or replace table ovr as
      select b.match_id, b.innings, b."over" as ov, b.bowler_id, any_value(b.bowler) as bowler, mode(b.striker_id) as striker_id, any_value(b.batting_team) as team, any_value(b.bowling_team) as opponent, any_value(b.start_date) as start_date,
             sum(b.runs_off_bat + coalesce(b.wides, 0) + coalesce(b.noballs, 0))::int as runs,
             string_agg(case when b.wicket = 1 then 'W' else (b.runs_off_bat + coalesce(b.wides, 0) + coalesce(b.noballs, 0))::varchar end, ' ' order by b.delivery_number) as balls
      from {BB} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false){TB} group by 1, 2, 3, 4""")
    con.execute("""create or replace table ovr as
      select o.*, m.season, m.city, m.venue, o.team || ' v ' || o.opponent as mtext from ovr o join m using (match_id) where o.runs >= 14""")
    # Sixes and fours in a row, one delivery after another in an innings.
    for t, cond in (('sx6', 'b.runs_off_bat = 6'), ('sx4', 'b.runs_off_bat = 4 and not coalesce(b.non_boundary, false)')):
        con.execute(f"""create or replace table {t} as
          with d as (select b.match_id, b.innings, b.delivery_number, b.striker_id, b.bowler_id, ({cond}) as f, row_number() over (partition by b.match_id, b.innings order by b.delivery_number) as rn
                     from {BB} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false){TB}),
               g as (select *, rn - row_number() over (partition by match_id, innings, f order by rn) as isl from d),
               a as (select match_id, innings, isl, count(*)::int as n, arg_min(striker_id, rn) as striker_id, arg_min(bowler_id, rn) as bowler_id from g where f group by 1, 2, 3 having count(*) >= 3)
          select a.*, m.season, m.city, m.venue, m.start_date, m.team_1 || ' v ' || m.team_2 as mtext from a join m using (match_id)""")
    # A hundred in fewest balls from 200 and 300: the ball on which the batter passed it.
    for t, mark in (('fst2', 200), ('fst3', 300)):
        con.execute(f"""create or replace table {t} as
          with c as (select match_id, innings, player_id from bi where runs >= {mark}),
               d as (select b.match_id, b.innings, b.striker_id as player_id, b.start_date,
                            sum(b.runs_off_bat) over (partition by b.match_id, b.innings, b.striker_id order by b.delivery_number) as cum,
                            sum(case when coalesce(b.wides, 0) = 0 then 1 else 0 end) over (partition by b.match_id, b.innings, b.striker_id order by b.delivery_number) as ball
                     from {BB} b join c on c.match_id = b.match_id and c.innings = b.innings and c.player_id = b.striker_id where not coalesce(b.is_super_over, false)),
               e as (select match_id, innings, player_id, min(ball) as balls from d where cum >= {mark} and ball is not null group by 1, 2, 3)
          select e.*, x.team, x.opponent, x.venue, x.city, x.season, x.yr, x.start_date, x.mtext, x.runs from e join bi x on x.match_id = e.match_id and x.innings = e.innings and x.player_id = e.player_id""")
    # Unusual dismissals.
    con.execute(f"""create or replace table ud as
      select w.player_dismissed_id as player_id, w.wicket_type as way, x.runs, x.runs_s, x.team, x.team_id, x.opponent, x.opp_id, x.venue, x.start_date, x.match_id
      from {p('wickets')} w join bi x on x.match_id = w.match_id and x.innings = w.innings and x.player_id = w.player_dismissed_id
      where w.wicket_type in ('handled the ball', 'obstructing the field', 'hit the ball twice', 'timed out')""")
    # King pair: out first ball in both innings.
    con.execute("""create or replace table kp as
      select player_id, match_id, any_value(venue) as venue, any_value(yr) as yr, any_value(mtext) as mtext, any_value(season) as season, any_value(city) as city, min(start_date) as start_date
      from bi where balls = 1 and runs = 0 and is_out group by 1, 2 having count(*) >= 2""")
    # Streaks of matches with a hundred or a fifty, and of innings with a five-for or a four-for.
    con.execute("""create or replace table ms as
      with s as (select player_id, match_id, start_date, mxr, i1, i2, team, team_id, opponent, opp_id, venue, row_number() over (partition by player_id order by start_date, match_id) as rn from bm),
           k as (select *, 'h100' as kind, (mxr >= 100) as flag from s union all select *, 'h50', (mxr >= 50) from s),
           g as (select *, rn - row_number() over (partition by player_id, kind, flag order by rn) as isl from k)
      select player_id, kind, count(*)::int as n, min(rn) as r0, arg_max(i1, rn) as i1, arg_max(i2, rn) as i2, arg_max(team, rn) as team, arg_max(team_id, rn) as team_id, arg_max(opponent, rn) as opponent, arg_max(opp_id, rn) as opp_id,
             arg_max(venue, rn) as venue, max(start_date) as d_last, arg_max(match_id, rn) as match_id
      from g where flag group by player_id, kind, isl""")
    con.execute("""create or replace table wst as
      with s as (select player_id, match_id, innings, wickets, fig, start_date, team, team_id, opponent, opp_id, venue, row_number() over (partition by player_id order by start_date, match_id, innings) as rn from bw),
           k as (select *, 'h5' as kind, (wickets >= 5) as flag from s union all select *, 'h4', (wickets >= 4) from s),
           g as (select *, rn - row_number() over (partition by player_id, kind, flag order by rn) as isl from k)
      select player_id, kind, count(*)::int as n, arg_max(fig, rn) as fig, arg_max(innings, rn) as innings, arg_max(team, rn) as team, arg_max(team_id, rn) as team_id, arg_max(opponent, rn) as opponent, arg_max(opp_id, rn) as opp_id,
             arg_max(venue, rn) as venue, max(start_date) as d_last, arg_max(match_id, rn) as match_id
      from g where flag group by player_id, kind, isl""")
    # Bowler against batter: dismissals, the runs the batter made off the bowler, and the ducks.
    con.execute(f"""create or replace table bbc as
      with d as (select b.bowler_id, b.striker_id, count(*) filter (where b.wicket = 1 and b.player_dismissed = b.striker and b.wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket')) as wkts,
                        sum(b.runs_off_bat) as runs, count(*) filter (where b.wicket = 1 and b.player_dismissed = b.striker and b."player out runs" = 0 and b.wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket')) as ducks, count(distinct b.match_id) as mat, min(extract(year from b.start_date))::varchar || '-' || max(extract(year from b.start_date))::varchar as span
                 from {BB} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false){WB} group by 1, 2 having count(*) filter (where b.wicket = 1) >= 3)
      select d.*, d.runs * 1.0 / nullif(d.wkts, 0) as ave from d where d.wkts >= 3""")
    # The players of the playing XI who have played for more than one team, with their stats for each.
    con.execute("""create or replace table pt2 as
      select mp.person_id as player_id, mp.team, count(distinct mp.match_id)::int as mat, min(extract(year from m.start_date))::varchar || '-' || max(extract(year from m.start_date))::varchar as span
      from """ + p('match_people') + """ mp join m using (match_id) where mp.role = 'player' and mp.person_id is not null group by 1, 2""")
    # Team innings of 400 or more, one after another, and the gap between a side's two innings of a match.
    con.execute("""create or replace table t4 as
      with o as (select team_id, team, start_date, match_id, innings, runs, wickets, declared, opponent, opp_id, venue, row_number() over (partition by team_id order by start_date, match_id, innings) as rn, (runs >= 400) as f from ti),
           g as (select *, rn - row_number() over (partition by team_id, f order by rn) as isl from o)
      select team_id, any_value(team) as team, count(*)::int as n, arg_max(runs || '/' || wickets || case when declared then 'd' else '' end, rn) as score, arg_max(innings, rn) as innings, arg_max(opponent, rn) as opponent,
             arg_max(opp_id, rn) as opp_id, arg_max(venue, rn) as venue, max(start_date) as d_last, arg_max(match_id, rn) as match_id
      from g where f group by team_id, isl having count(*) >= 3""")
    con.execute("""create or replace table t12 as
      select team_id, any_value(team) as team, match_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id, any_value(venue) as venue, any_value(start_date) as start_date,
             max(case when team_innings = 1 then runs || '/' || wickets || case when declared then 'd' else '' end end) as s1, max(case when team_innings = 2 then runs || '/' || wickets || case when declared then 'd' else '' end end) as s2,
             abs(max(case when team_innings = 2 then runs end) - max(case when team_innings = 1 then runs end)) as diff
      from ti group by team_id, match_id having count(*) filter (where team_innings = 1) = 1 and count(*) filter (where team_innings = 2) = 1""")
    # A player's series as an all-rounder: batting, bowling and catches in one row.
    con.execute("""create or replace table arsx as
      select b.player_id, b.span, b.mat, b.runs, b.hsx, b.inns, b.nout, b.h100, w.wickets as wkts, w.bb, w.runs as wruns, w.h5, coalesce(f.ct, 0) as ct, coalesce(f.st, 0) as st, b.grp, b.teams
      from bs b join ws w on w.player_id = b.player_id and w.k = b.k left join fcs f on f.player_id = b.player_id and f.k = b.k""")
    # A pair's partnerships in one match: both innings added.
    con.execute("""create or replace table ptm as
      select any_value(n1) as n1, id1, any_value(n2) as n2, id2, match_id, any_value(team) as team, any_value(team_id) as team_id, any_value(opponent) as opponent, any_value(opp_id) as opp_id, any_value(venue) as venue,
             any_value(start_date) as start_date, sum(runs)::int as runs, max(case when innings <= 2 then runs end) as r1, max(case when innings > 2 then runs end) as r2
      from (select *, row_number() over (partition by id1, id2, match_id order by innings) as rn from pt) group by id1, id2, match_id having count(*) >= 2""")
    stage3_tables(con, p, team_id)


def stage3_tables(con, p, team_id=None):
    BB = p('balls_by_match')
    TB = f" and b.batting_team_id = '{team_id}'" if team_id else ''
    WB = f" and b.bowling_team_id = '{team_id}'" if team_id else ''
    # k wickets within n of a bowler's own deliveries.
    con.execute(f"""create or replace table wd as
      select b.match_id, b.innings, b.bowler_id, b.delivery_number, b.start_date,
             row_number() over (partition by b.match_id, b.innings, b.bowler_id order by b.delivery_number) as bn,
             (b.wicket = 1 and b.wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket')) as w
      from {BB} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false){WB}""")
    con.execute("create or replace table ww as select * from wd where w")
    for t, k, n in (('ww45', 4, 5), ('ww34', 3, 4), ('ww44', 4, 4)):
        con.execute(f"""create or replace table {t} as
          with x as (select *, lead(bn, {k - 1}) over (partition by match_id, innings, bowler_id order by bn) as bn_k from ww)
          select x.match_id, x.innings, x.bowler_id, m.season, m.city, m.venue, m.start_date, extract(year from m.start_date)::int as yr, m.team_1 || ' v ' || m.team_2 as mtext
          from x join m using (match_id) where x.bn_k is not null and x.bn_k - x.bn <= {n - 1}
          qualify row_number() over (partition by x.match_id, x.innings, x.bowler_id order by x.bn) = 1""")
    # The score at which each wicket fell.
    con.execute(f"""create or replace table fw as
      with d as (select b.match_id, b.innings, b.batting_team_id as team_id, b.bowling_team_id as opp_id, b.delivery_number, b.start_date,
                        sum(b.runs_off_bat + b.extras) over (partition by b.match_id, b.innings order by b.delivery_number) as score,
                        b.wicket, b.wicket_type from {BB} b where b.match_id in (select match_id from m) and not coalesce(b.is_super_over, false){TB}),
           w as (select *, row_number() over (partition by match_id, innings order by delivery_number) as wk from d where wicket = 1 and wicket_type not in {NOT_WK})
      select w.match_id, w.innings, w.team_id, w.opp_id, w.wk, w.score, i.runs || '/' || i.wickets || case when i.declared then 'd' else '' end as total, i.team, i.opponent, i.venue, i.start_date
      from w join ti i on i.match_id = w.match_id and i.innings = w.innings""")
    con.execute("create or replace table fwh as select * from (select *, row_number() over (partition by wk order by score desc, start_date) as r from fw) where r <= 10")
    con.execute("create or replace table fwl as select * from (select *, row_number() over (partition by wk order by score asc, start_date) as r from fw where score > 0) where r <= 10")
    # Ages (whole years) at each match, from the ball rows.
    con.execute(f"""create or replace table pag as
      select player_id, match_id, max(age) as age from
        (select striker_id as player_id, match_id, striker_age as age from {BB} where striker_age is not null and match_id in (select match_id from m)
         union all select bowler_id, match_id, bowler_age from {BB} where bowler_age is not null and match_id in (select match_id from m)) group by 1, 2""")
    con.execute("create or replace table bi as select b.*, a.age from bi b left join pag a on a.player_id = b.player_id and a.match_id = b.match_id")
    con.execute("create or replace table bw as select b.*, a.age from bw b left join pag a on a.player_id = b.player_id and a.match_id = b.match_id")
    # Players whose first match in the data is certainly their debut: first international year (any format) after 2001.
    con.execute(f"""create or replace table pfirst as
      select mp.person_id as player_id, arg_min(mp.match_id, struct_pack(d := m.start_date, i := mp.match_id)) as match_id, min(m.start_date) as d1, max(m.start_date) as d2, count(distinct mp.match_id)::int as mat
      from {p('match_people')} mp join m using (match_id) where mp.role = 'player' and mp.person_id is not null group by 1""")
    con.execute(f"""create or replace table dbm as
      select f.player_id, f.match_id, f.d1 from pfirst f join {p('players')} pl on pl.player_id = f.player_id
      where pl."first international year" is not null and pl."first international year" >= 2002 and f.d1 >= date '2002-01-01'""")
    # Consecutive appearances for a team, and the matches missed between them.
    con.execute(f"""create or replace table pap as
      with tm_ as (select team_id, match_id, row_number() over (partition by team_id order by start_date, match_id) as trn from (select distinct team_id, match_id, start_date from pmt)),
           a as (select p.player_id, p.team_id, any_value(p.team) as team, p.match_id, p.start_date, t.trn from pmt p join tm_ t on t.team_id = p.team_id and t.match_id = p.match_id group by all)
      select *, trn - row_number() over (partition by player_id, team_id order by trn) as isl, lag(trn) over (partition by player_id, team_id order by trn) as prev_trn,
             lag(start_date) over (partition by player_id, team_id order by trn) as prev_date from a""")
    con.execute("""create or replace table pstr as
      select player_id, team_id, any_value(team) as team, count(*)::int as n, min(start_date) as d1, max(start_date) as d2 from pap group by player_id, team_id, isl""")
    con.execute("""create or replace table pgap as
      select player_id, team_id, team, start_date as d2, prev_date as d1, trn - prev_trn - 1 as missed, date_diff('day', prev_date, start_date) as days
      from pap where prev_trn is not null and trn - prev_trn > 1""")
    con.execute("""create or replace table pgap as
      select g.*, c.span, c.mat from pgap g join (select player_id, min(extract(year from start_date))::varchar || '-' || max(extract(year from start_date))::varchar as span, count(distinct match_id)::int as mat from pmt group by 1) c using (player_id)""")
    # A player's record for each team, for those who played for more than one.
    con.execute("""create or replace table pteam as
      with t as (select player_id, team, any_value(team_id) as team_id, count(distinct match_id)::int as mat, min(yr)::varchar || case when min(yr) = max(yr) then '' else '-' || max(yr)::varchar end as span from pmt group by 1, 2),
           b as (select player_id, team, sum(runs)::int as runs, count(*) as inns, sum(case when is_out then 0 else 1 end) as nout, max(runs::int * 2 + case when is_out then 0 else 1 end) as hsx, sum(case when runs >= 100 then 1 else 0 end)::int as h100 from bi group by 1, 2),
           w as (select player_id, team, sum(wickets)::int as wkts, sum(runs) as wruns, max(struct_pack(w := wickets, r := -runs)) as bb, sum(case when wickets >= 5 then 1 else 0 end)::int as h5 from bw group by 1, 2),
           f as (select player_id, team, count(*) filter (where kind in ('catch', 'caught_and_bowled'))::int as ct, count(*) filter (where kind = 'stumping')::int as st from fl group by 1, 2)
      select t.*, b.runs, b.inns, b.nout, b.hsx, b.h100, w.wkts, w.wruns, w.bb, w.h5, coalesce(f.ct, 0) as ct, coalesce(f.st, 0) as st
      from t left join b using (player_id, team) left join w using (player_id, team) left join f using (player_id, team)
      where t.player_id in (select player_id from t group by 1 having count(*) >= 2)""")
    # The first ball of a debutant's career, when it took a wicket.
    con.execute(f"""create or replace table fbd as
      with f as (select w.bowler_id, w.match_id, w.innings, w.delivery_number, w.w, row_number() over (partition by w.bowler_id order by w.innings, w.delivery_number) as r
                 from wd w join dbm d on d.player_id = w.bowler_id and d.match_id = w.match_id)
      select f.bowler_id, f.match_id, f.innings, b.striker_id, m.season, m.city, m.venue, m.start_date, m.team_1 || ' v ' || m.team_2 as mtext
      from f join {BB} b on b.match_id = f.match_id and b.innings = f.innings and b.delivery_number = f.delivery_number join m on m.match_id = f.match_id where f.r = 1 and f.w""")
    con.execute("""create or replace table bw as select *, (wickets >= 5 and row_number() over (partition by player_id, (wickets >= 5) order by start_date, match_id, innings) = 1) as first_w5 from bw""")
    con.execute("""create or replace table ppa as
      select a.player_id, a.match_id, a.age, p.team, p.team_id, p.opponent, p.opp_id, p.venue, p.start_date
      from pag a join pmt p on p.player_id = a.player_id and p.match_id = a.match_id""")
    con.execute("create or replace table poldest as select * from (select *, row_number() over (partition by player_id order by age desc, start_date) as r from ppa) where r = 1")
    con.execute("""create or replace table pgap2 as
      with a as (select player_id, match_id, start_date, lag(start_date) over (partition by player_id order by start_date, match_id) as prev from pmt)
      select a.player_id, a.prev as d1, a.start_date as d2, date_diff('day', a.prev, a.start_date) as days, c.span, c.mat
      from a join (select player_id, min(extract(year from start_date))::varchar || '-' || max(extract(year from start_date))::varchar as span, count(distinct match_id)::int as mat from pmt group by 1) c using (player_id)
      where a.prev is not null""")
    # Running totals of the players whose debut is in the data: runs and wickets by innings, with the matches played so far.
    con.execute("""create or replace table pmr as
      select player_id, match_id, dense_rank() over (partition by player_id order by start_date, match_id) as mat_n from pmt""")
    con.execute("""create or replace table bcum as
      with x as (select b.player_id, b.match_id, b.innings, b.start_date, b.runs, b.team, b.team_id, b.opponent, b.opp_id, b.venue,
                        sum(b.runs) over (partition by b.player_id order by b.start_date, b.match_id, b.innings) as cum,
                        row_number() over (partition by b.player_id order by b.start_date, b.match_id, b.innings) as inn_n
                 from bi b where b.player_id in (select player_id from dbm))
      select x.*, r.mat_n, d.d1 from x join dbm d using (player_id) join pmr r on r.player_id = x.player_id and r.match_id = x.match_id""")
    con.execute("""create or replace table wcum as
      with x as (select b.player_id, b.match_id, b.innings, b.start_date, b.wickets, b.team, b.team_id, b.opponent, b.opp_id, b.venue,
                        sum(b.wickets) over (partition by b.player_id order by b.start_date, b.match_id, b.innings) as cum,
                        row_number() over (partition by b.player_id order by b.start_date, b.match_id, b.innings) as inn_n
                 from bw b where b.player_id in (select player_id from dbm))
      select x.*, r.mat_n, d.d1 from x join dbm d using (player_id) join pmr r on r.player_id = x.player_id and r.match_id = x.match_id""")
    # Hat-tricks with the batters dismissed.
    con.execute(f"""create or replace table hat as
      with wv as (select w.*, b.player_dismissed as pd from ww w join {BB} b on b.match_id = w.match_id and b.innings = w.innings and b.delivery_number = w.delivery_number),
           x as (select *, lead(bn, 2) over (partition by match_id, innings, bowler_id order by bn) as bn2, lead(pd, 1) over (partition by match_id, innings, bowler_id order by bn) as pd1,
                         lead(pd, 2) over (partition by match_id, innings, bowler_id order by bn) as pd2 from wv)
      select x.match_id, x.innings, x.bowler_id, x.pd || ', ' || x.pd1 || ', ' || x.pd2 as victims, m.tk, m.season, m.venue, m.start_date, extract(year from m.start_date)::int as yr, m.team_1 || ' v ' || m.team_2 as mtext
      from x join m using (match_id) where x.bn2 is not null and x.bn2 - x.bn <= 2""")
    # A chase won on the last scheduled ball, and a chase after a declaration.
    con.execute(f"""create or replace table lastb as
      select i.match_id, i.innings from ti i join m on m.match_id = i.match_id
        join (select match_id, innings, arg_max(runs_off_bat + extras, delivery_number) as lr from {BB} where not coalesce(is_super_over, false) group by 1, 2) l on l.match_id = i.match_id and l.innings = i.innings
      where i.target is not null and i.won and i.balls = m.scheduled_overs * 6 and i.runs - l.lr < i.target and i.runs >= i.target""")
    con.execute("""create or replace table tm as
      select m.*, (lb.match_id is not null) as last_ball, ws.wscore, os.oscore, coalesce(os.odecl, false) as odecl
      from tm m left join lastb lb on lb.match_id = m.match_id
        left join (select match_id, any_value(runs || '/' || wickets) as wscore from ti where target is not null and won group by 1) ws on ws.match_id = m.match_id
        left join (select match_id, arg_max(runs || '/' || wickets || case when declared then 'd' else '' end, innings) as oscore, arg_max(declared, innings) as odecl from ti where res <> 'won' group by 1) os on os.match_id = m.match_id""")
    # Two bowlers who bowled a whole completed innings, with their figures.
    con.execute("""create or replace table buc as
      with r as (select b.match_id, b.innings, b.player_id, b.fig, b.team, b.team_id, b.opponent, b.opp_id, b.venue, b.start_date, row_number() over (partition by b.match_id, b.innings order by b.balls desc, b.player_id) as r
                 from bw b join ti i on i.match_id = b.match_id and i.innings = b.innings and i.team_id = b.opp_id where i.bowlers = 2 and i.wickets >= 10 and not i.declared)
      select a.match_id, a.innings, a.player_id as id1, a.fig as f1, b.player_id as id2, b.fig as f2, a.team, a.team_id, a.opponent, a.opp_id, a.venue, a.start_date
      from r a join r b on b.match_id = a.match_id and b.innings = a.innings and b.r = 2 where a.r = 1""")
    # Matches in a row with ten wickets for a bowler.
    con.execute("""create or replace table wms as
      with s as (select player_id, match_id, wickets, wickets || '/' || runs::int as fig, start_date, team, team_id, opponent, opp_id, venue, row_number() over (partition by player_id order by start_date, match_id) as rn from wm),
           f as (select *, (wickets >= 10) as flag from s), g as (select *, rn - row_number() over (partition by player_id, flag order by rn) as isl from f)
      select player_id, count(*)::int as n, arg_max(fig, rn) as fig, arg_max(team, rn) as team, arg_max(team_id, rn) as team_id, arg_max(opponent, rn) as opponent, arg_max(opp_id, rn) as opp_id,
             arg_max(venue, rn) as venue, max(start_date) as d_last, arg_max(match_id, rn) as match_id
      from g where flag group by player_id, isl""")
