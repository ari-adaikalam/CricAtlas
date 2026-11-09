"""Independent check of the ball filters.

Works the expected numbers out from the dataset's raw CSVs (not the exported Parquet files and not the app's SQL), so a
wrong export column or a wrong query shows up as a mismatch. Prints JSON: for each case, the filters and the expected
balls, runs, innings and dismissals. Compare with the app.

Usage, from the CricAtlas repo root:
    ../.venv/bin/python tools/verify_filters.py <player_id> <bat|bowl> <TEST|ODI|T20S> [phase=death inn=2 ...] [-- more filters ...]
Filter keys: phase (powerplay, middle, death, rest, band0 to band4), so (excluded, included, only), inn (1 to 4), wk (low, mid, high), res (won, lost, draw),
vs (the opponent's player id), bh (right or left, the batter hand on a bowler's page), bt (pace, spin or one first style, the bowler type on a batter's page).
"""
import json, sys
from pathlib import Path
import duckdb

SRC = Path(__file__).resolve().parents[2] / "data" / "output"


def load(player_id, view, fmt):
    con = duckdb.connect()
    p = lambda n: f"'{SRC / (n + '.csv')}'"
    col = "striker_id" if view == "bat" else "bowler_id"
    team = "batting_team" if view == "bat" else "bowling_team"
    legal = "coalesce(b.wides, 0) = 0" if view == "bat" else "b.is_legal_delivery"
    fmt_where = {"TEST": "b.format = 'TEST'", "ODI": "b.format = 'ODI'", "T20S": "b.format = 'T20'"}[fmt]
    con.execute(f"""create table pp as select match_id, innings, min(start_over) s, max(end_over) e from read_csv({p('powerplays')}, sample_size=-1)
                    where type = 'mandatory' group by 1, 2""")
    q = f"""
      select b.match_id, b.innings, b."over", b.runs_off_bat, b.wicket_type, b.player_dismissed, b.striker, b.team_wickets, b.wides,
             m.winner, m.outcome, m.balls_per_over, m.scheduled_overs, b.{team} as team, pp.s, pp.e, coalesce(i.is_super_over, false) so, b.bowler_id bid, b.striker_id sid, b."batting style_striker" hand, b."bowling style_bowler" bstyle
      from (select *, coalesce(sum(wicket) over (partition by match_id, innings order by delivery_number rows between unbounded preceding and 1 preceding), 0) team_wickets
            from read_csv({p('ball_by_ball_data')}, sample_size=-1)) b
      join read_csv({p('matches')}, sample_size=-1) m using (match_id)
      left join pp on pp.match_id = b.match_id and pp.innings = b.innings
      left join read_csv({p('innings')}, sample_size=-1) i on i.match_id = b.match_id and i.innings = b.innings
      where b.{col} = '{player_id}' and {fmt_where} and {legal}"""
    rows = [("ball",) + r for r in con.execute(q).fetchall()]
    if view == "bat":
        # Dismissals of the batter, including a run out at the non-striker's end (a ball with another striker). They count only in
        # an innings where the batter faced a ball, as the player summary counts them.
        dq = q.replace(f"where b.{col} = '{player_id}'", f"join read_csv({p('wickets')}, sample_size=-1) w on w.match_id = b.match_id and w.innings = b.innings and w.delivery_number = b.delivery_number where w.player_dismissed_id = '{player_id}' and w.wicket_type not in ('retired hurt', 'retired not out')")
        dq = dq.replace(f" and {legal}", "")
        dq = dq.replace("b.runs_off_bat, b.wicket_type, b.player_dismissed, b.striker,", "b.runs_off_bat, w.wicket_type, w.player_dismissed, w.player_dismissed,")
        faced = {(r[1], r[2]) for r in rows}  # (match_id, innings) where the batter faced a ball
        rows += [("dismissal",) + r for r in con.execute(dq).fetchall() if (r[0], r[1]) in faced]
    return rows


def expected(rows, fmt, f):
    keys = ["kind", "match_id", "innings", "over", "runs", "wtype", "dismissed", "striker", "wk", "wides", "winner", "outcome", "bpo", "sched", "team", "s", "e", "so", "bid", "sid", "hand", "bstyle"]
    out = {"balls": 0, "runs": 0, "dismissals": 0, "innings": set()}
    for r in rows:
        d = dict(zip(keys, r)); over = d["over"]
        # phase, worked out again here
        if fmt == "TEST": phase = None
        elif d["so"]: phase = None
        elif d["s"] is not None and d["s"] <= over <= d["e"]: phase = "powerplay"
        elif d["s"] is None and over < (10 if d["bpo"] != 5 and d["match_id"] and fmt == "ODI" else 5 if d["bpo"] == 5 else 6): phase = "powerplay"
        elif d["bpo"] == 5: phase = "rest"
        else:
            sched = d["sched"] if d["sched"] is not None else (50 if fmt == "ODI" else 20)
            phase = "death" if over >= sched - (10 if fmt == "ODI" else 5) else "middle"
        ok = True
        ph = f.get("phase")
        if ph:
            ok &= (ph == f"band{min(over // 20, 4)}") if fmt == "TEST" else (ph == phase)
        so = f.get("so", "excluded")
        if fmt != "TEST":
            ok &= not (so == "excluded" and d["so"]) and not (so == "only" and not d["so"])
        if f.get("vs"): ok &= (d["bid"] if view == "bat" else d["sid"]) == f["vs"]
        if f.get("bh") and view == "bowl": ok &= d["hand"] == {"right": "right-hand bat", "left": "left-hand bat"}[f["bh"]]
        if f.get("bt") and view == "bat":
            first = (d["bstyle"] or "").split(",")[0].strip()
            pace = ["right-arm fast", "right-arm fast-medium", "right-arm medium-fast", "right-arm medium", "right-arm slow-medium", "left-arm fast", "left-arm fast-medium", "left-arm medium-fast", "left-arm medium", "left-arm slow-medium"]
            spin = ["right-arm offbreak", "legbreak", "legbreak googly", "right-arm slow", "slow left-arm orthodox", "left-arm wrist-spin", "left-arm slow"]
            ok &= first in pace if f["bt"] == "pace" else first in spin if f["bt"] == "spin" else first == f["bt"]
        if f.get("inn"): ok &= str(d["innings"]) == f["inn"]
        if f.get("wk"):
            w = d["wk"]; ok &= {"low": w <= 2, "mid": 3 <= w <= 5, "high": w >= 6}[f["wk"]]
        if f.get("res"):
            r2 = "draw" if d["outcome"] == "draw" else None if d["winner"] is None else ("won" if d["winner"] == d["team"] else "lost")
            ok &= f["res"] == r2
        if not ok: continue
        if d["kind"] == "dismissal":
            out["dismissals"] += 1
            continue
        out["balls"] += 1; out["runs"] += d["runs"] or 0
        out["innings"].add((d["match_id"], d["innings"]))
    out["innings"] = len(out["innings"])
    return out


if __name__ == "__main__":
    # Several filter sets in one run, separated by "--" (the CSVs are read once).
    pid, view, fmt, *rest = sys.argv[1:]
    sets, cur = [], []
    for x in rest + ["--"]:
        if x == "--": sets.append(dict(v.split("=") for v in cur)); cur = []
        else: cur.append(x)
    rows = load(pid, view, fmt)
    for f in sets:
        print(json.dumps({"filters": f, **expected(rows, fmt, f)}))
