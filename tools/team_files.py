"""Per-team files for the browser, derived from the exported tables.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/team_files.py [--out data/export] [--only <team id> ...]

A team is one id of matches.team_1_id (for example 'india|intl|male'), so the men's and women's sides of a country are two teams. The file name is the id with '|' written as '~'.
Each team gets one small file for each kind, fetched whole in a single request and queried from memory in the browser:

    t/b/<slug>.json    the first paint, one request: {"ma": ..., "in": ...}, the two files below (ma and in) joined (their own files are not kept)
    (ma)               one row per match: date, season, format, competition and stage, ground, opponent, toss, result, margin, who batted first, player of the match, tracking coverage
    (in)               one row per innings, for the team and against it: runs, wickets, legal balls, extras by kind, fours, sixes, declared, Super Over
    t/ph/<slug>.json   one row per innings and phase and side: runs, legal balls, wickets, boundaries, dots
    t/wk/<slug>.json   wickets by type, per match and innings: taken by the team (side 'for') and lost by it (side 'against')
    t/pl/<slug>.json   one row per player per match: whether named, batting, bowling and fielding totals (substitute fielders have named = false)
    t/bs/<slug>.json   the team's bowling by kind of bowler (pace, spin, other) for each match: legal balls, runs conceded, bowler's wickets
    t/phase_avg.json   every side's totals by kind of match, league or not, gender and phase, for the 'against the format' marks: [kind, league, gender, phase, runs, balls, wickets, boundaries, dots]
    t/rv/<slug>.json   one row per review: which side asked, whether the team was batting or fielding, the decision
    t/index.json          every team: [id, name, gender, kind (national or franchise), matches, first year, last year, has reviews, earlier names, won, lost, no results, titles, competition keys, formats] (the name is the latest one; for the search and the Teams list). Titles are editions won (the Final's winner, a best of three Final goes to the side with more wins).

Definitions follow the match bundles (tools/match_files.py): runs are bat runs plus extras, a legal ball is a delivery that was not a wide or no-ball, wickets exclude retired hurt and
retired not out, a Super Over is kept apart (is_super_over), a dot is a legal delivery with nothing off the bat. Phases are the dataset's own for limited overs (powerplay, middle, death,
rest in The Hundred, 'other' where a shortened match has none). A Test has no such phase, so the new ball is the first 20 overs ('n') and the rest is in 30-over blocks ('b1' to 'b4').
"""
import argparse, json, shutil, sys, time
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]
KINDS = ("ma", "in", "ph", "wk", "pl", "rv", "bs")
LATER = ("ph", "wk", "pl", "rv", "bs")
ORDER = {"ma": "start_date, match_id", "in": "start_date, match_id, innings, side", "ph": "match_id, innings, side, phase",
         "wk": "match_id, innings, side, wicket_type", "bs": "match_id, grp", "pl": "start_date, match_id, player_id", "rv": "match_id, innings, delivery_number"}
NOT_WICKETS = "('retired hurt', 'retired not out')"
BOWLER_WICKETS = "('bowled', 'caught', 'caught and bowled', 'lbw', 'stumped', 'hit wicket')"
# The first style listed is the main one (web/src/domain/bowlerType.ts, decided with Ari on 2026-10-18).
PACE = ("right-arm fast", "right-arm fast-medium", "right-arm medium-fast", "right-arm medium", "right-arm slow-medium",
        "left-arm fast", "left-arm fast-medium", "left-arm medium-fast", "left-arm medium", "left-arm slow-medium")
SPIN = ("right-arm offbreak", "legbreak", "legbreak googly", "right-arm slow", "slow left-arm orthodox", "left-arm wrist-spin", "left-arm slow")


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def slug(team_id: str) -> str:
    return team_id.replace("|", "~")


def split(con, out: Path, kind: str, only) -> set:
    """Writes t/<kind>/<slug>.json for each team, as columns (one array per field, one entry per row). Returns the ids written."""
    final = out / "t" / kind
    if only is None:
        shutil.rmtree(final, ignore_errors=True)
    final.mkdir(parents=True, exist_ok=True)
    where = "" if only is None else f"where team_id in ({','.join(q(t) for t in only)})"
    ids = [r[0] for r in con.execute(f"select distinct team_id from t_{kind} {where} order by 1").fetchall()]
    for tid in ids:
        cur = con.execute(f"select * exclude (team_id) from t_{kind} where team_id = {q(tid)} order by {ORDER[kind]}")
        names = [d[0] for d in cur.description]
        rows = cur.fetchall()
        cols = {n: [str(r[i]) if hasattr(r[i], "isoformat") else r[i] for r in rows] for i, n in enumerate(names)}
        (final / (slug(tid) + ".json")).write_text(json.dumps({"n": len(rows), "c": cols}, separators=(",", ":"), ensure_ascii=False))
    return set(ids)


def build(out: Path, only=None) -> dict:
    t0 = time.time()
    con = duckdb.connect()
    con.execute("PRAGMA threads=8")
    p = lambda name: q(out / f"{name}.parquet")

    # One row for each side of each match. The opponent and the result are from this side's view.
    con.execute(f"""create table sides as
      select m.match_id, m.team_1_id as team_id, m.team_1 as team, m.team_2_id as opp_id, m.team_2 as opp, 1 as side_no from {p('matches')} m
      union all
      select m.match_id, m.team_2_id, m.team_2, m.team_1_id, m.team_1, 2 from {p('matches')} m""")

    # Player of the match is recorded by name. It is matched on a player who was in the match, as player_files.py does.
    con.execute(f"""create table potm as
      select distinct m.match_id, pl.player_id, pl.name from {p('matches')} m
      join {p('match_people')} mp on mp.match_id = m.match_id and mp.role = 'player'
      join {p('players')} pl on pl.player_id = mp.person_id
      where pl.name = m.player_of_match or pl.name = m.player_of_match_2""")
    con.execute("create table potm1 as select match_id, min(player_id) as potm_id, min(name) as potm from potm group by 1")

    # Balls per innings, for scores, tracking coverage and dropped catches.
    con.execute(f"""create table inn as
      select match_id, innings, batting_team_id, bowling_team_id, bool_or(is_super_over) as is_super_over,
             sum(runs_off_bat + extras)::int as runs,
             sum(case when wicket = 1 and wicket_type not in {NOT_WICKETS} then 1 else 0 end)::int as wickets,
             sum(case when is_legal_delivery then 1 else 0 end)::int as balls,
             coalesce(sum(wides), 0)::int as wides, coalesce(sum(noballs), 0)::int as noballs, coalesce(sum(byes), 0)::int as byes, coalesce(sum(legbyes), 0)::int as legbyes, coalesce(sum(coalesce(penalty, 0)), 0)::int as penalty,
             sum(case when runs_off_bat = 4 and not coalesce(non_boundary, false) then 1 else 0 end)::int as fours,
             sum(case when runs_off_bat = 6 then 1 else 0 end)::int as sixes,
             sum(case when shot_played is not null or wagon_x is not null then 1 else 0 end)::int as tracked,
             sum(case when ball_events like '%dropped catch%' then 1 else 0 end)::int as dropped
      from {p('balls_by_match')} group by 1, 2, 3, 4""")
    con.execute(f"create table decl as select match_id, innings, bool_or(coalesce(declared, false)) as declared from {p('innings')} group by 1, 2")

    # Per match tracking coverage and dropped catches, both sides together.
    con.execute("""create table cov as select match_id, sum(balls)::int as balls, sum(tracked)::int as tracked, sum(dropped)::int as dropped from inn group by 1""")

    con.execute(f"""create table t_ma as
      select s.team_id, m.match_id, m.start_date, m.end_date, m.season, m.gender, m.format, m."type" as "type", m.tournament_key, m.tournament_name, m.tournament_kind,
             m.filter_section, m.event, m.edition, m.stage_class, m.stage_name, m.match_number, m.venue, m.city, m.venue_country,
             s.team, s.opp, s.opp_id,
             case when m.toss_winner is null then null when m.toss_winner = s.team then true else false end as toss_won,
             m.toss_decision,
             case when m.outcome = 'draw' then 'draw' when m.outcome = 'no result' then 'nr'
                  when m.winner_id = s.team_id then 'won' when m.winner_id is not null then 'lost' when m.outcome = 'tie' then 'tie' else 'nr' end as result,
             (m.outcome = 'tie') as tied,
             m.winner_runs, m.winner_wickets, m.won_by_innings, m.result_method, m.scheduled_overs, m.balls_per_over,
             (select i.batting_team_id = s.team_id from inn i where i.match_id = m.match_id and i.innings = 1 and not i.is_super_over limit 1) as bat_first,
             pm.potm_id, pm.potm,
             cv.balls as tracked_of, cv.tracked as tracked_balls, cv.dropped as dropped_catches
      from sides s join {p('matches')} m on m.match_id = s.match_id
      left join potm1 pm on pm.match_id = m.match_id
      left join cov cv on cv.match_id = m.match_id""")

    con.execute("""create table t_in as
      select s.team_id, s.match_id, m.start_date, i.innings, 'for' as side, i.is_super_over, i.runs, i.wickets, i.balls, i.wides, i.noballs, i.byes, i.legbyes, i.penalty, i.fours, i.sixes, coalesce(d.declared, false) as declared
      from inn i left join decl d on d.match_id = i.match_id and d.innings = i.innings join sides s on s.match_id = i.match_id and s.team_id = i.batting_team_id join matches_s m on m.match_id = i.match_id
      union all
      select s.team_id, s.match_id, m.start_date, i.innings, 'against', i.is_super_over, i.runs, i.wickets, i.balls, i.wides, i.noballs, i.byes, i.legbyes, i.penalty, i.fours, i.sixes, coalesce(d.declared, false) as declared
      from inn i left join decl d on d.match_id = i.match_id and d.innings = i.innings join sides s on s.match_id = i.match_id and s.team_id = i.bowling_team_id join matches_s m on m.match_id = i.match_id""".replace(
        "matches_s", f"(select match_id, start_date from {p('matches')})"))

    # Test overs are 0-based. The first 20 are the new ball, then blocks of 30.
    phase_sql = """case when format = 'TEST' then case when "over" < 20 then 'n' when "over" < 50 then 'b1' when "over" < 80 then 'b2' when "over" < 110 then 'b3' else 'b4' end
                         else coalesce(phase, 'other') end"""
    con.execute(f"""create table ph as
      select match_id, innings, batting_team_id, bowling_team_id, {phase_sql} as phase,
             sum(runs_off_bat + extras)::int as runs, sum(case when is_legal_delivery then 1 else 0 end)::int as balls,
             sum(case when wicket = 1 and wicket_type not in {NOT_WICKETS} then 1 else 0 end)::int as wickets,
             sum(case when runs_off_bat in (4, 6) and not coalesce(non_boundary, false) then 1 else 0 end)::int as boundaries,
             sum(case when is_legal_delivery and runs_off_bat = 0 then 1 else 0 end)::int as dots
      from {p('balls_by_match')} where not is_super_over group by 1, 2, 3, 4, 5""")
    con.execute("""create table t_ph as
      select batting_team_id as team_id, match_id, innings, 'for' as side, phase, runs, balls, wickets, boundaries, dots from ph
      union all
      select bowling_team_id, match_id, innings, 'against', phase, runs, balls, wickets, boundaries, dots from ph""")

    con.execute(f"""create table wk as
      select match_id, innings, batting_team_id, bowling_team_id, wicket_type, count(*)::int as n
      from {p('balls_by_match')} where wicket = 1 and wicket_type not in {NOT_WICKETS} group by 1, 2, 3, 4, 5""")
    con.execute("""create table t_wk as
      select bowling_team_id as team_id, match_id, innings, 'for' as side, wicket_type, n from wk
      union all
      select batting_team_id, match_id, innings, 'against', wicket_type, n from wk""")

    # Players. A player is in a match for a team when match_people names them, or when they only fielded as a substitute (named = false).
    con.execute(f"""create table named as
      select distinct s.team_id, mp.match_id, mp.person_id as player_id
      from {p('match_people')} mp join {p('matches')} m on m.match_id = mp.match_id
      join sides s on s.match_id = mp.match_id and s.team = mp.team
      where mp.role = 'player'""")
    con.execute(f"""create table bat as
      select s.team_id, b.match_id, b.player_id, count(*)::int as bat_inns, sum(b.runs)::int as bat_runs, sum(b.balls)::int as bat_balls, sum(b.fours)::int as fours, sum(b.sixes)::int as sixes,
             sum(case when b.is_out then 1 else 0 end)::int as outs, max(b.runs)::int as high,
             sum(case when b.runs >= 50 and b.runs < 100 then 1 else 0 end)::int as fifties, sum(case when b.runs >= 100 then 1 else 0 end)::int as hundreds,
             sum(case when b.runs = 0 and b.is_out then 1 else 0 end)::int as ducks
      from {p('bat_innings')} b join sides s on s.match_id = b.match_id and s.team = b.team group by 1, 2, 3""")
    con.execute(f"""create table bowl as
      select s.team_id, b.match_id, b.player_id, count(*)::int as bowl_inns, sum(b.balls)::int as bowl_balls, sum(b.runs)::int as bowl_runs, sum(b.wickets)::int as wkts,
             sum(b.maidens)::int as maidens, sum(case when b.wickets >= 5 then 1 else 0 end)::int as fivefers, max(b.wickets)::int as best_wkts,
             arg_min(b.runs, struct_pack(w := -b.wickets, r := b.runs))::int as best_runs
      from {p('bowl_innings')} b join sides s on s.match_id = b.match_id and s.team = b.team group by 1, 2, 3""")
    # The fielding team of an innings is the side that did not bat.
    con.execute(f"""create table fld as
      select i.bowling_team_id as team_id, f.match_id, f.player_id,
             sum(case when f.kind in ('catch', 'caught_and_bowled') then 1 else 0 end)::int as catches,
             sum(case when f.kind = 'stumping' then 1 else 0 end)::int as stumpings,
             sum(case when f.kind like 'run_out%' then 1 else 0 end)::int as runouts
      from {p('fielding_by_player')} f
      join (select distinct match_id, innings, bowling_team_id from inn) i on i.match_id = f.match_id and i.innings = f.innings
      group by 1, 2, 3""")
    con.execute(f"""create table t_pl as
      with k as (select team_id, match_id, player_id from named union select team_id, match_id, player_id from bat union select team_id, match_id, player_id from bowl
                 union select team_id, match_id, player_id from fld)
      select k.team_id, k.match_id, m.start_date, k.player_id, pl.name,
             (n.player_id is not null) as named,
             coalesce(b.bat_inns, 0) as bat_inns, coalesce(b.bat_runs, 0) as bat_runs, coalesce(b.bat_balls, 0) as bat_balls, coalesce(b.fours, 0) as fours, coalesce(b.sixes, 0) as sixes,
             coalesce(b.outs, 0) as outs, coalesce(b.high, 0) as high, coalesce(b.fifties, 0) as fifties, coalesce(b.hundreds, 0) as hundreds, coalesce(b.ducks, 0) as ducks,
             coalesce(w.bowl_inns, 0) as bowl_inns, coalesce(w.bowl_balls, 0) as bowl_balls, coalesce(w.bowl_runs, 0) as bowl_runs, coalesce(w.wkts, 0) as wkts,
             coalesce(w.maidens, 0) as maidens, coalesce(w.fivefers, 0) as fivefers, coalesce(w.best_wkts, 0) as best_wkts, coalesce(w.best_runs, 0) as best_runs,
             coalesce(f.catches, 0) as catches, coalesce(f.stumpings, 0) as stumpings, coalesce(f.runouts, 0) as runouts,
             coalesce(pm.potm_id = k.player_id, false) as potm
      from k join {p('matches')} m on m.match_id = k.match_id
      left join {p('players')} pl on pl.player_id = k.player_id
      left join named n on n.team_id = k.team_id and n.match_id = k.match_id and n.player_id = k.player_id
      left join bat b on b.team_id = k.team_id and b.match_id = k.match_id and b.player_id = k.player_id
      left join bowl w on w.team_id = k.team_id and w.match_id = k.match_id and w.player_id = k.player_id
      left join fld f on f.team_id = k.team_id and f.match_id = k.match_id and f.player_id = k.player_id
      left join potm1 pm on pm.match_id = k.match_id""")

    # The team's own bowling by kind of bowler, for the pace and spin split on the Bowling card. Balls from a bowler with no listed style are 'other'.
    style = "trim(split_part(\"bowling style_bowler\", ',', 1))"
    group = f"case when {style} in ({','.join(q(x) for x in PACE)}) then 'pace' when {style} in ({','.join(q(x) for x in SPIN)}) then 'spin' else 'other' end"
    con.execute(f"""create table t_bs as
      select bowling_team_id as team_id, match_id, {group} as grp,
             sum(case when is_legal_delivery then 1 else 0 end)::int as balls, sum(runs_off_bat + coalesce(wides, 0) + coalesce(noballs, 0))::int as runs,
             sum(case when wicket = 1 and wicket_type in {BOWLER_WICKETS} then 1 else 0 end)::int as wkts
      from {p('balls_by_match')} where not is_super_over group by 1, 2, 3""")

    # What the average side does in each phase, for the 'against the format' marks on the phase cards. One row for each kind of match, league or not, gender and phase.
    con.execute(f"""create table pavg as
      select case when m."type" = 'Fran(Hundred)' then 'hundred' when m.format = 'TEST' then 'test' when m.format = 'ODI' then 'odi' else 't20' end as kind,
             coalesce(m.filter_section = 'Leagues', false) as league, m.gender, {phase_sql.replace('format', 'm.format').replace('"over"', 'b."over"').replace('phase,', 'b.phase,')} as phase,
             sum(b.runs_off_bat + b.extras)::bigint as runs, sum(case when b.is_legal_delivery then 1 else 0 end)::bigint as balls,
             sum(case when b.wicket = 1 and b.wicket_type not in {NOT_WICKETS} then 1 else 0 end)::bigint as wkts,
             sum(case when b.runs_off_bat in (4, 6) and not coalesce(b.non_boundary, false) then 1 else 0 end)::bigint as boundaries,
             sum(case when b.is_legal_delivery and b.runs_off_bat = 0 then 1 else 0 end)::bigint as dots
      from {p('balls_by_match')} b join {p('matches')} m on m.match_id = b.match_id where not b.is_super_over group by 1, 2, 3, 4""")
    (out / "t").mkdir(exist_ok=True)
    (out / "t" / "phase_avg.json").write_text(json.dumps(con.execute("select * from pavg order by 1, 2, 3, 4").fetchall(), separators=(",", ":")))

    # Reviews. review_by is a team name. A side is batting when its team batted in that innings.
    con.execute(f"""create table t_rv as
      select s.team_id, r.match_id, r.innings, r.delivery_number, (r.review_by = s.team) as by_team,
             (i.batting_team_id = s.team_id) as team_batting, r.decision, r.review_type, r.umpires_call
      from {p('reviews')} r join sides s on s.match_id = r.match_id
      left join (select distinct match_id, innings, batting_team_id from inn) i on i.match_id = r.match_id and i.innings = r.innings""")

    written = {k: split(con, out, k, only) for k in KINDS}
    counts = {k: len(v) for k, v in written.items()}
    # The first paint needs the matches and the innings together, so they travel as one bundle with the team's facts.
    (out / "t" / "b").mkdir(exist_ok=True)
    if only is None:
        for f in (out / "t" / "b").glob("*.json"):
            f.unlink()
    for tid in written["ma"]:
        name = slug(tid) + ".json"
        ma = json.loads((out / "t" / "ma" / name).read_text())
        inn = json.loads((out / "t" / "in" / name).read_text()) if tid in written["in"] else {"n": 0, "c": {}}
        (out / "t" / "b" / name).write_text(json.dumps({"ma": ma, "in": inn}, separators=(",", ":"), ensure_ascii=False))
    for k in ("ma", "in"):
        shutil.rmtree(out / "t" / k, ignore_errors=True)
    # Titles are the editions of the tournaments and leagues that have a page which the team won: the winner of the match tagged Final, and for a best of three Final the side with more wins (as the Team page counts them).
    con.execute(f"""create table finals as
      select m.edition, m.winner_id, count(*)::int as wins from {p('matches')} m
      where m.stage_name = 'Final' and m.winner_id is not null and m.tournament_kind in ('tournament', 'league') and m.tournament_key is not null group by 1, 2""")
    con.execute("""create table champions as
      select edition, winner_id as team_id from (
        select edition, winner_id, wins, row_number() over (partition by edition order by wins desc) as rk, lead(wins) over (partition by edition order by wins desc) as next_wins from finals)
      where rk = 1 and (next_wins is null or next_wins < wins)""")
    index = con.execute(f"""
      select s.team_id, arg_max(s.team, m.start_date) as name, any_value(m.gender) as gender,
             case when any_value(m."type") = 'Intl' then 'national' else 'franchise' end as kind,
             count(*)::int as matches, min(year(m.start_date))::int as first_year, max(year(m.start_date))::int as last_year,
             list_sort(list_distinct(list(s.team))) as names,
             sum(case when m.winner_id = s.team_id then 1 else 0 end)::int as won,
             sum(case when m.winner_id is not null and m.winner_id <> s.team_id then 1 else 0 end)::int as lost,
             sum(case when m.outcome = 'no result' then 1 else 0 end)::int as nr,
             coalesce((select count(*) from champions c where c.team_id = s.team_id), 0)::int as titles,
             list_sort(list_distinct(list(m.tournament_key) filter (where m.tournament_kind in ('tournament', 'league') and m.tournament_key is not null))) as comps,
             list_sort(list_distinct(list(case when m."type" = 'Fran(Hundred)' then 'HUNDRED' when m."type" = 'Intl' then (case m.format when 'TEST' then 'TEST' when 'ODI' then 'ODI' else 'T20I' end) else 'T20' end))) as fmts
      from sides s join {p('matches')} m on m.match_id = s.match_id group by 1 order by matches desc, name""").fetchall()
    index = [list(r[:7]) + [r[0] in written["rv"], [n for n in r[7] if n != r[1]]] + list(r[8:]) for r in index]
    if only is None:
        (out / "t").mkdir(exist_ok=True)
        (out / "t" / "index.json").write_text(json.dumps(index, separators=(",", ":"), ensure_ascii=False))
    kinds = ("b",) + LATER
    size = {k: sum(f.stat().st_size for f in (out / "t" / k).glob("*.json")) for k in kinds}
    big = max(((f.stat().st_size, f.name) for k in kinds for f in (out / "t" / k).glob("*.json")))
    return {"teams_with_files": counts, "bytes": size, "teams": len(index), "largest_file": big, "seconds": round(time.time() - t0, 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--only", nargs="*", help="build only these team ids")
    a = ap.parse_args()
    print(json.dumps(build(Path(a.out), a.only), indent=1))
