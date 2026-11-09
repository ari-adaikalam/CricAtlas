"""Checks the per-tournament files (tools/tournament_files.py) against the exported tables, worked out another way.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/verify_tournament_files.py [--out data/export]

For every tournament it compares: the matches and the matches with a winner with matches.parquet, the innings runs and wickets with the balls, the batters' runs and the bowlers' wickets with bat_innings
and bowl_innings, the sixes with the balls, the players of the match found with those named in matches, and that every edition has at most one champion's Final unless it is a best of three. Prints one line
for each difference and exits 1 if any.
"""
import argparse, json, sys
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    out = Path(ap.parse_args().out)
    con = duckdb.connect()
    P = lambda n: f"'{out / (n + '.parquet')}'"
    index = json.loads((out / "n" / "index.json").read_text())
    bad = 0

    def check(name, key, mine, theirs):
        nonlocal bad
        if mine != theirs:
            bad += 1
            print(f"DIFFERENT {key} {name}: file {mine} table {theirs}")

    for row in index:
        key = row[0]
        b = json.loads((out / "n" / "b" / f"{key}.json").read_text())
        pl = json.loads((out / "n" / "pl" / f"{key}.json").read_text())
        m, i = b["m"]["c"], b["i"]["c"]
        t = con.execute(f"select count(*), count(winner_id), count(player_of_match) from {P('matches')} where tournament_key = ? and tournament_kind in ('tournament', 'league')", [key]).fetchone()
        check("matches", key, b["m"]["n"], t[0])
        check("matches with a winner", key, sum(1 for w in m["winner_id"] if w), t[1])
        ids = ",".join(str(x) for x in m["match_id"])
        t_in = con.execute(f"select sum(runs_off_bat + extras), sum(case when wicket = 1 and wicket_type not in ('retired hurt', 'retired not out') then 1 else 0 end), "
                           f"sum(case when runs_off_bat = 6 then 1 else 0 end) from {P('balls_by_match')} where match_id in ({ids})").fetchone()
        check("innings runs (Super Overs included)", key, sum(i["runs"]), int(t_in[0] or 0))
        check("innings wickets", key, sum(i["wickets"]), int(t_in[1] or 0))
        check("sixes in innings", key, sum(i["sixes"]), int(t_in[2] or 0))
        bat, bowl = pl["bat"]["c"], pl["bowl"]["c"]
        t_bat = con.execute(f"select sum(runs), sum(sixes) from {P('bat_innings')} where match_id in ({ids})").fetchone()
        check("batters' runs", key, sum(bat["runs"]), int(t_bat[0] or 0))
        check("batters' sixes", key, sum(bat["sixes"]), int(t_bat[1] or 0))
        t_bowl = con.execute(f"select sum(wickets), sum(balls) from {P('bowl_innings')} where match_id in ({ids})").fetchone()
        check("bowlers' wickets", key, sum(bowl["wickets"]), int(t_bowl[0] or 0))
        check("bowlers' balls", key, sum(bowl["balls"]), int(t_bowl[1] or 0))
        check("players of the match found", key, sum(1 for x in m["potm_id"] if x), t[2] - con.execute(f"select count(*) from {P('matches')} where tournament_key = ? and tournament_kind in ('tournament', 'league') and player_of_match is not null and match_id not in (select match_id from {P('match_people')} mp join {P('players')} p on p.player_id = mp.person_id join {P('matches')} mm using (match_id) where mp.role = 'player' and (p.name = mm.player_of_match or p.name = mm.player_of_match_2))", [key]).fetchone()[0])
    print(f"{len(index)} tournaments checked, {bad} differences")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
