"""Checks the per-team files (tools/team_files.py) against the exported tables, worked out another way.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/verify_team_files.py [--out data/export] [--teams 40]

For a sample of teams (the busiest, a few small ones and a spread in between) it compares, team by team: the matches and the results with matches.parquet, the runs and wickets of the innings with
bat_innings and wickets.parquet, the runs of the players with bat_innings, the wickets of the bowlers with bowl_innings, the catches, stumpings and run outs with fielding_by_player, the reviews with
reviews.parquet, the extras with balls_by_match and the phase runs with the innings runs. Prints one line for each check and exits 1 if any differs.
"""
import argparse, json, random, sys
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--teams", type=int, default=40)
    a = ap.parse_args()
    out = Path(a.out)
    con = duckdb.connect()
    P = lambda n: f"'{out / (n + '.parquet')}'"
    index = json.loads((out / "t" / "index.json").read_text())
    ids = [r[0] for r in index]
    random.seed(7)
    sample = ids[:12] + random.sample(ids[12:], min(a.teams - 12, len(ids) - 12))
    bad = 0

    def load(kind: str, tid: str):
        slug = tid.replace("|", "~")
        d = json.loads((out / "t" / kind / f"{slug}.json").read_text())
        return d["n"], d["c"]

    def check(name: str, tid: str, mine, theirs) -> None:
        nonlocal bad
        if mine != theirs:
            bad += 1
            print(f"DIFFERENT {tid} {name}: file {mine} table {theirs}")

    for tid in sample:
        slug = tid.replace("|", "~")
        b = json.loads((out / "t" / "b" / f"{slug}.json").read_text())
        ma, inn = b["ma"]["c"], b["in"]["c"]
        n = b["ma"]["n"]
        t_matches = con.execute(f"select count(*), sum((winner_id = ?)::int) from {P('matches')} where team_1_id = ? or team_2_id = ?", [tid, tid, tid]).fetchone()
        check("matches", tid, n, t_matches[0])
        check("wins", tid, sum(1 for r, t in zip(ma["result"], ma["tied"]) if r == "won"), t_matches[1] or 0)
        # Runs and wickets of the team's own innings, from the balls.
        t_in = con.execute(f"select sum(runs_off_bat + extras), sum(case when wicket = 1 and wicket_type not in ('retired hurt', 'retired not out') then 1 else 0 end) "
                           f"from {P('balls_by_match')} where batting_team_id = ?", [tid]).fetchone()
        mine_runs = sum(r for r, s, side in zip(inn["runs"], inn["is_super_over"], inn["side"]) if side == "for")
        mine_wkts = sum(w for w, side in zip(inn["wickets"], inn["side"]) if side == "for")
        check("innings runs for", tid, mine_runs, t_in[0] or 0)
        check("innings wickets for", tid, mine_wkts, t_in[1] or 0)
        # Players: batting runs and bowling wickets against the player innings tables.
        if (out / "t" / "pl" / f"{slug}.json").exists():
            pn, pl = load("pl", tid)
            t_bat = con.execute(f"select sum(b.runs) from {P('bat_innings')} b join {P('matches')} m on m.match_id = b.match_id "
                                f"where (m.team_1_id = ? and b.team = m.team_1) or (m.team_2_id = ? and b.team = m.team_2)", [tid, tid]).fetchone()[0] or 0
            check("player runs", tid, sum(pl["bat_runs"]), int(t_bat))
            t_bowl = con.execute(f"select sum(b.wickets) from {P('bowl_innings')} b join {P('matches')} m on m.match_id = b.match_id "
                                 f"where (m.team_1_id = ? and b.team = m.team_1) or (m.team_2_id = ? and b.team = m.team_2)", [tid, tid]).fetchone()[0] or 0
            check("player wickets", tid, sum(pl["wkts"]), int(t_bowl))
            t_ct = con.execute(f"select count(*) from {P('fielding_by_player')} f join (select distinct match_id, innings, bowling_team_id from {P('balls_by_match')}) i "
                               f"on i.match_id = f.match_id and i.innings = f.innings where i.bowling_team_id = ?", [tid]).fetchone()[0]
            check("fielding dismissals", tid, sum(pl["catches"]) + sum(pl["stumpings"]) + sum(pl["runouts"]), t_ct)
        # Phase runs add up to the innings runs (Super Overs left out).
        phn, ph = load("ph", tid)
        t_ph = con.execute(f"select sum(runs_off_bat + extras) from {P('balls_by_match')} where batting_team_id = ? and not is_super_over", [tid]).fetchone()[0] or 0
        check("phase runs for", tid, sum(r for r, s in zip(ph["runs"], ph["side"]) if s == "for"), int(t_ph))
        # Extras conceded.
        t_ex = con.execute(f"select sum(coalesce(wides, 0) + coalesce(noballs, 0) + coalesce(byes, 0) + coalesce(legbyes, 0) + coalesce(penalty, 0)) from {P('balls_by_match')} where bowling_team_id = ? and not is_super_over", [tid]).fetchone()[0] or 0
        mine_ex = sum((w or 0) + (nb or 0) + (by or 0) + (lb or 0) + (pe or 0) for w, nb, by, lb, pe, s, so in zip(inn["wides"], inn["noballs"], inn["byes"], inn["legbyes"], inn["penalty"], inn["side"], inn["is_super_over"]) if s == "against" and not so)
        check("extras conceded", tid, mine_ex, int(t_ex))
        # Wickets taken by type add up to the wickets of the other side's innings.
        wn, wk = load("wk", tid)
        check("wickets taken", tid, sum(nn for nn, s in zip(wk["n"], wk["side"]) if s == "for"), sum(w for w, s in zip(inn["wickets"], inn["side"]) if s == "against"))
        # Reviews.
        if (out / "t" / "rv" / f"{slug}.json").exists():
            rn, rv = load("rv", tid)
            t_rv = con.execute(f"select count(*) from {P('reviews')} r join {P('matches')} m on m.match_id = r.match_id where m.team_1_id = ? or m.team_2_id = ?", [tid, tid]).fetchone()[0]
            check("reviews", tid, rn, t_rv)
    print(f"{len(sample)} teams checked, {bad} differences")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
