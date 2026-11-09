"""The Home page's small data file, home.json.

Usage, from the dataset repo root:   .venv/bin/python cricatlas/tools/home_files.py [--out cricatlas/data/export]

It holds what the page shows besides the replayed innings: the size of the data, the top five of most runs, most wickets and most sixes over every match, and for every day of the year the five matches
that stand out, and a short list of notable balls for the line on the Built by tile. Reading it is one small request, so the page never loads the 1.3 MB match list for five rows.

On this day ranks the matches of a date by how much they matter, then by year (newest first): a final, any other knockout or play-off, a match of an ICC or other tournament between national
teams, a Test, any other international, a franchise match. The five best are kept and written newest first. The ranking is a choice made with Ari (2026-10-24), not a data rule.
"""
import argparse, json, random
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]
TOP_LEADERS = 5
PER_DAY = 5
COMPETITIONS = 15
NOTABLE_BALLS = 400
NOTABLE_SEED = 2026


def rank_of(stage_name, stage_class, kind, intl, tournament_kind):
    if stage_name == "Final":
        return 0
    if stage_class in ("knockout", "placing"):
        return 1
    if intl and tournament_kind == "tournament":
        return 2
    if intl and kind == 0:
        return 3
    if intl:
        return 4
    return 5


MAJOR_NAMES = ("World Cup", "Champions Trophy", "Asia Cup")
BIG_TEAMS = {"India", "Australia", "England", "South Africa", "New Zealand", "Pakistan", "Sri Lanka", "West Indies", "Bangladesh", "Afghanistan"}
BIG_LEAGUES = {"Indian Premier League", "Big Bash League", "Women's Big Bash League", "Pakistan Super League", "Caribbean Premier League", "SA20", "Women's Premier League"}


def major_event(rank, tournament_kind, name):
    """A final or knockout of a tournament or league, or any match of an ICC event or the Asia Cup. Qualifiers and small events are not."""
    if tournament_kind not in ("tournament", "league") or not name or "qualif" in name.lower():
        return False
    return rank <= 1 or any(k in name for k in MAJOR_NAMES)


def main(out: Path) -> dict:
    con = duckdb.connect()
    p = lambda name: "'" + str(out / f"{name}.parquet") + "'"

    matches = con.execute(f"select count(*) from {p('matches')}").fetchone()[0]
    balls = con.execute(f"select count(*) from {p('balls_by_match')}").fetchone()[0]

    leaders = {}
    for key, col in (("runs", "runs"), ("wickets", "wickets"), ("sixes", "sixes")):
        rows = con.execute(
            f"""select s.player_id, any_value(pl.name), sum(s.{col})::bigint as n
                from {p('player_summary')} s join {p('players')} pl using (player_id)
                group by 1 order by n desc, 2 limit {TOP_LEADERS}"""
        ).fetchall()
        leaders[key] = [[pid, name, int(n)] for pid, name, n in rows]

    ml = json.loads((out / "mlist.json").read_text())
    cols = {c: i for i, c in enumerate(ml["columns"])}
    meta = {
        r[0]: r[1:]
        for r in con.execute(f"select match_id, stage_name, stage_class, tournament_kind, tournament_name from {p('matches')}").fetchall()
    }
    by_day = {}
    info = {}
    for row in ml["rows"]:
        mid = row[cols["id"]]
        date = row[cols["date"]]
        stage_name, stage_class, tournament_kind, tournament_name = meta.get(mid, (None, None, None, None))
        rank = rank_of(stage_name, stage_class, row[cols["kind"]], bool(row[cols["international"]]), tournament_kind)
        t1, t2 = ml["teams"][row[cols["team1"]]], ml["teams"][row[cols["team2"]]]
        winner = row[cols["winner"]]
        potm = ml["potm"][row[cols["potm"]]] if row[cols["potm"]] >= 0 else None
        big = (t1[1] in BIG_TEAMS and t2[1] in BIG_TEAMS) if row[cols["international"]] else tournament_name in BIG_LEAGUES
        info[mid] = (rank, t1[1], t2[1], date // 10000, row[cols["kind"]], big and major_event(rank, tournament_kind, tournament_name))
        entry = [
            mid, date // 10000, [t1[0], t1[1]], [t2[0], t2[1]], winner,
            ml["margins"][row[cols["margin"]]] if row[cols["margin"]] >= 0 else "",
            ml["competitions"][row[cols["competition"]]] if row[cols["competition"]] >= 0 else "",
            potm,
        ]
        by_day.setdefault(f"{date // 100 % 100:02d}-{date % 100:02d}", []).append((rank, -(date // 10000), mid, entry))

    days = {}
    for day, items in sorted(by_day.items()):
        best = sorted(items, key=lambda x: (x[0], x[1], x[2]))[:PER_DAY]
        days[day] = [x[3] for x in sorted(best, key=lambda x: (x[1], x[2]))]

    # Notable balls: a wicket or a six in a major match (see major_event) between big teams, or of a big league. The Hundred counts balls differently and is left out, and so are Super Overs.
    wanted = [m for m, (_, _, _, _, kind, major) in info.items() if major and kind != 3]
    con.execute("create table wanted(match_id bigint)")
    con.executemany("insert into wanted values (?)", [(m,) for m in wanted])
    rows = con.execute(
        f"""select b.match_id, b.innings, b.scorecard_ball from {p('balls_by_match')} b join wanted using (match_id)
            where not b.is_super_over and b.scorecard_ball is not null and (b.wicket = 1 or b.runs_off_bat = 6)
            order by b.match_id, b.innings, b.delivery_number"""
    ).fetchall()
    picked = random.Random(NOTABLE_SEED).sample(rows, min(NOTABLE_BALLS, len(rows)))
    notable = [[m, i, f"{sb:.1f}", info[m][1], info[m][2], info[m][3]] for m, i, sb in sorted(picked)]

    payload = {"v": 1, "matches": matches, "balls": balls, "competitions": COMPETITIONS, "since": 2001, "leaders": leaders, "days": days, "notable": notable}
    (out / "home.json").write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False, allow_nan=False))
    return payload


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    a = ap.parse_args()
    r = main(Path(a.out))
    print(r["matches"], "matches,", len(r["days"]), "days,", {k: v[0] for k, v in r["leaders"].items()})
