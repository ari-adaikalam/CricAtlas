"""Per-tournament files for the browser, derived from the exported tables.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/tournament_files.py [--out data/export] [--only <tournament key> ...]

A tournament is one `tournament_key` of `matches` (the men's and the women's side of an event are two tournaments), and only the major tournaments and the leagues have a page
(`tournament_kind` tournament or league; Ari, 2026-10-23). Each gets JSON column files, `{"n": rows, "c": {field: [values]}}`, fetched whole in one request and read from memory, never
through a query engine:

    n/b/<key>.json    the first paint: {"m": ..., "i": ...}
        m   one row per match: date, season, edition, format, stage (class and name) and group, match number, ground, both teams with their ids, toss, who batted first, result and margin, the player of the match
        i   one row per innings: batting side, runs, wickets, legal balls, fours, sixes, declared, Super Over, the overs the innings had (a revised target's own)
    n/pl/<key>.json   loads behind it: {"bat": ..., "bowl": ...}, one row per player innings, for Most runs, Best performances, Rates and averages, Player of the match
    n/index.json      every tournament: [key, name, kind, gender, editions, first season, last season, matches, teams, formats (TEST, ODI, T20 or HUNDRED), latest champion [team id, name, edition] or null, most titles [[team id, name, titles], ...] (every side level on the count)]

Definitions follow the match bundles and the team files: runs are bat runs plus extras, a legal ball is a delivery that was not a wide or no-ball, wickets exclude retired hurt and retired not out, a Super Over
is kept apart (is_super_over) and never counts as an innings of the match.
"""
import argparse, json, shutil, time
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]
NOT_WICKETS = "('retired hurt', 'retired not out')"


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def write(con, query: str, path: Path) -> int:
    cur = con.execute(query)
    names = [d[0] for d in cur.description]
    rows = cur.fetchall()
    cols = {n: [str(r[i]) if hasattr(r[i], "isoformat") else r[i] for r in rows] for i, n in enumerate(names)}
    path.write_text(json.dumps({"n": len(rows), "c": cols}, separators=(",", ":"), ensure_ascii=False))
    return len(rows)


def build(out: Path, only=None) -> dict:
    t0 = time.time()
    con = duckdb.connect()
    con.execute("PRAGMA threads=8")
    p = lambda name: q(out / f"{name}.parquet")

    con.execute(f"""create table tm as select * from {p('matches')} where tournament_kind in ('tournament', 'league') and tournament_key is not null""")
    keys = [r[0] for r in con.execute("select distinct tournament_key from tm order by 1").fetchall()]
    if only:
        keys = [k for k in keys if k in only]

    # Innings from the balls, with the batting and bowling side's ids.
    con.execute(f"""create table inn as
      select match_id, innings, batting_team_id, bowling_team_id, bool_or(is_super_over) as is_super_over,
             sum(runs_off_bat + extras)::int as runs,
             sum(case when wicket = 1 and wicket_type not in {NOT_WICKETS} then 1 else 0 end)::int as wickets,
             sum(case when is_legal_delivery then 1 else 0 end)::int as balls,
             sum(case when runs_off_bat = 4 and not coalesce(non_boundary, false) then 1 else 0 end)::int as fours,
             sum(case when runs_off_bat = 6 then 1 else 0 end)::int as sixes
      from {p('balls_by_match')} where match_id in (select match_id from tm) group by 1, 2, 3, 4""")
    con.execute(f"""create table inn_x as
      select i.*, coalesce(d.declared, false) as declared, d.target_overs
      from inn i left join (select match_id, innings, bool_or(coalesce(declared, false)) as declared, max(target_overs) as target_overs from {p('innings')} group by 1, 2) d
        on d.match_id = i.match_id and d.innings = i.innings""")

    # The player of the match is recorded by name: matched to a player who was in the match (as the team and player files do).
    con.execute(f"""create table potm as
      select m.match_id, min(pl.player_id) as potm_id, min(pl.name) as potm
      from tm m join {p('match_people')} mp on mp.match_id = m.match_id and mp.role = 'player' join {p('players')} pl on pl.player_id = mp.person_id
      where pl.name = m.player_of_match or pl.name = m.player_of_match_2 group by 1""")

    con.execute(f"""create table mrow as
      select m.tournament_key, m.match_id, m.start_date, m.season, m.edition, m.gender, m.format, m."type" as "type", m.stage_class, m.stage_name, m.event_group, m.match_number,
             m.venue, m.city, m.venue_country, m.team_1, m.team_1_id, m.team_2, m.team_2_id,
             case when m.toss_winner = m.team_1 then m.team_1_id when m.toss_winner = m.team_2 then m.team_2_id end as toss_winner_id, m.toss_decision,
             (select i.batting_team_id from inn_x i where i.match_id = m.match_id and i.innings = 1 and not i.is_super_over limit 1) as bat_first_id,
             m.winner_id, m.outcome, m.winner_runs, m.winner_wickets, m.won_by_innings, m.result_method, m.scheduled_overs, m.balls_per_over,
             (select i.target_overs from inn_x i where i.match_id = m.match_id and i.innings = 2 and not i.is_super_over limit 1) as revised_overs,
             p.potm_id, p.potm
      from tm m left join potm p on p.match_id = m.match_id""")

    con.execute(f"""create table bat as
      select m.tournament_key, b.match_id, b.innings, b.player_id, pl.name, case when b.team = m.team_1 then m.team_1_id else m.team_2_id end as team_id,
             b.runs::int as runs, b.balls::int as balls, b.fours::int as fours, b.sixes::int as sixes, b.is_out
      from {p('bat_innings')} b join tm m on m.match_id = b.match_id left join {p('players')} pl on pl.player_id = b.player_id""")
    con.execute(f"""create table bowl as
      select m.tournament_key, b.match_id, b.innings, b.player_id, pl.name, case when b.team = m.team_1 then m.team_1_id else m.team_2_id end as team_id,
             b.balls::int as balls, b.runs::int as runs, b.wickets::int as wickets, b.maidens::int as maidens
      from {p('bowl_innings')} b join tm m on m.match_id = b.match_id left join {p('players')} pl on pl.player_id = b.player_id""")

    for sub in ("b", "pl"):
        d = out / "n" / sub
        d.mkdir(parents=True, exist_ok=True)
        if only is None:
            for f in d.glob("*.json"):
                f.unlink()
    sizes = {"b": 0, "pl": 0}
    for k in keys:
        mq = f"select * exclude (tournament_key) from mrow where tournament_key = {q(k)} order by start_date, match_id"
        iq = (f"select i.match_id, i.innings, i.batting_team_id, i.bowling_team_id, i.is_super_over, i.runs, i.wickets, i.balls, i.fours, i.sixes, i.declared "
              f"from inn_x i join mrow m on m.match_id = i.match_id where m.tournament_key = {q(k)} order by i.match_id, i.innings")
        mc, ic = con.execute(mq), None
        names = [dd[0] for dd in mc.description]
        mrows = mc.fetchall()
        mcols = {n: [str(r[i]) if hasattr(r[i], "isoformat") else r[i] for r in mrows] for i, n in enumerate(names)}
        ic = con.execute(iq)
        inames = [dd[0] for dd in ic.description]
        irows = ic.fetchall()
        icols = {n: [r[i] for r in irows] for i, n in enumerate(inames)}
        (out / "n" / "b" / f"{k}.json").write_text(json.dumps({"m": {"n": len(mrows), "c": mcols}, "i": {"n": len(irows), "c": icols}}, separators=(",", ":"), ensure_ascii=False))
        sizes["b"] += (out / "n" / "b" / f"{k}.json").stat().st_size
        def cols(query):
            cur = con.execute(query)
            nm = [dd[0] for dd in cur.description]
            rs = cur.fetchall()
            return {"n": len(rs), "c": {n: [r[i] for r in rs] for i, n in enumerate(nm)}}
        bat = cols(f"select * exclude (tournament_key) from bat where tournament_key = {q(k)} order by match_id, innings, player_id")
        bowl = cols(f"select * exclude (tournament_key) from bowl where tournament_key = {q(k)} order by match_id, innings, player_id")
        (out / "n" / "pl" / f"{k}.json").write_text(json.dumps({"bat": bat, "bowl": bowl}, separators=(",", ":"), ensure_ascii=False))
        sizes["pl"] += (out / "n" / "pl" / f"{k}.json").stat().st_size

    index = con.execute("""
      select tournament_key, any_value(tournament_name) as name, any_value(tournament_kind) as kind, any_value(gender) as gender,
             count(distinct edition)::int as editions, min(season) as first_season, max(season) as last_season, count(*)::int as matches,
             (select count(distinct t) from (select team_1_id as t from tm x where x.tournament_key = tm.tournament_key union select team_2_id from tm x where x.tournament_key = tm.tournament_key))::int as teams,
             list_sort(list_distinct(list(case when "type" = 'Fran(Hundred)' then 'HUNDRED' else format end))) as formats
      from tm group by tournament_key order by matches desc""").fetchall()
    # The champion of an edition is the winner of the match tagged Final (a best of three Final goes to the side with more wins). The index says who won the latest edition that has a champion, and who has
    # won most, with every side that is level on that count.
    champs = con.execute("""
      with fin as (select tournament_key, edition, winner_id, count(*) as wins from tm where stage_name = 'Final' and winner_id is not null group by 1, 2, 3),
           ranked as (select *, row_number() over (partition by edition order by wins desc) as rk, lead(wins) over (partition by edition order by wins desc) as next_wins from fin),
           champ as (select tournament_key, edition, winner_id as team_id from ranked where rk = 1 and (next_wins is null or next_wins < wins)),
           first as (select edition, min(start_date) as first_date from tm group by 1),
           names as (select team_id, arg_max(name, d) as name from (select team_1_id as team_id, team_1 as name, start_date as d from tm union all select team_2_id, team_2, start_date from tm) group by 1)
      select c.tournament_key, c.edition, f.first_date, c.team_id, n.name from champ c join first f using (edition) join names n using (team_id)""").fetchall()
    by_key: dict = {}
    for key, edition, first_date, team_id, name in champs:
        by_key.setdefault(key, []).append((str(first_date), edition, team_id, name))
    extra = {}
    for key, lst in by_key.items():
        lst.sort()
        latest = lst[-1]
        count: dict = {}
        for _, _, tid, nm in lst:
            c = count.setdefault(tid, [nm, 0])
            c[1] += 1
        top = max(c[1] for c in count.values())
        extra[key] = [[latest[2], latest[3], latest[1].split("|")[1]], [[tid, c[0], c[1]] for tid, c in count.items() if c[1] == top]]
    index = [list(r) + extra.get(r[0], [None, []]) for r in index]
    if only is None:
        (out / "n" / "index.json").write_text(json.dumps([list(r) for r in index], separators=(",", ":"), ensure_ascii=False))
    big = max(((f.stat().st_size, f.name) for sub in ("b", "pl") for f in (out / "n" / sub).glob("*.json")))
    return {"tournaments": len(keys), "bytes": sizes, "largest_file": big, "seconds": round(time.time() - t0, 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--only", nargs="*", help="build only these tournament keys")
    a = ap.parse_args()
    print(json.dumps(build(Path(a.out), a.only), indent=1))
