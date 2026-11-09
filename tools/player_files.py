"""Per-player files for the browser, derived from the exported tables.

Usage, from the CricAtlas repo root (export.py calls build() at its end, so this is for running alone):
    ../.venv/bin/python tools/player_files.py [--out data/export]

A page needs one player's rows. Reading them out of the big shared tables over HTTP costs a long chain of small requests, so each player gets
a small file per kind, fetched whole in a single request and queried from memory in the browser:

    p/bat/<id>.parquet    that batter's rows of balls_by_batter
    p/bowl/<id>.parquet   that bowler's rows of balls_by_bowler
    p/dis/<id>.parquet    that batter's dismissals (dismissals_by_batter)
    p/bi/<id>.parquet     bat_innings          p/wi/<id>.parquet   bowl_innings
    p/pt/<id>.parquet     partnerships_by_player     p/tm/<id>.parquet   tandems_by_player (bowling partnerships)
    p/pm/<id>.parquet     player_matches: every match the player was in, with the team, the result for it and whether the award went to them
    p/tr/<id>.parquet     trophies_by_player: each edition of a major tournament or league the player was in, with the team and the result
    p/lo/<id>.parquet     letoff_by_bowler: the balls a bowler bowled that a batter was dropped off, with the runs the batter scored after
    p/bp/<id>.parquet     positions_by_bowler: the batting order of every innings the bowler bowled in
    p/<kind>/_empty.parquet   the same columns with no rows, which the browser uses for a player who has no file of that kind (a batter with no balls bowled)

Also search.json, one compact list of every player for the search box, so typing a name needs no query engine, and plist.json, the Players page's list with totals, styles and formats.
Every file name carries the player id and nothing else, so a file never changes unless that player's data does.
"""
import argparse, json, os, shutil, sys, time
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]

# kind -> (source table file, key column, order of rows inside the file)
KINDS = {
    "bat": ("balls_by_batter", "striker_id", "match_id, innings, delivery_number"),
    "bowl": ("balls_by_bowler", "bowler_id", "match_id, innings, delivery_number"),
    "dis": ("dismissals_by_batter", "batter_id", "match_id, innings, delivery_number"),
    "bi": ("bat_innings", "player_id", "start_date, match_id, innings"),
    "wi": ("bowl_innings", "player_id", "start_date, match_id, innings"),
    "pt": ("partnerships_by_player", "player_id", "start_date, match_id, innings, wicket_number"),
    "tm": ("tandems_by_player", "player_id", "start_date, match_id, innings, a"),
    "tr": ("trophies_by_player", "player_id", "first_date, edition"),
    "lo": ("letoff_by_bowler", "player_id", "match_id, innings, delivery_number"),
    "bp": ("positions_by_bowler", "player_id", "match_id, innings, position"),
    "fd": ("fielding_by_player", "player_id", "start_date, match_id, innings, delivery_number"),
}


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def split(con, out: Path, kind: str, source: str, key: str, order: str) -> int:
    """Writes one file for each value of `key`, and an empty one with the same columns. Returns the number of players."""
    final = out / "p" / kind
    shutil.rmtree(final, ignore_errors=True)
    final.mkdir(parents=True)
    tmp = out / "_tmp" / kind
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.parent.mkdir(parents=True, exist_ok=True)
    # The partition column is not written into the files, so the key is copied under another name and the original column stays in the data.
    con.execute(f"copy (select *, {key} as pid from {source} where {key} is not null order by {key}, {order}) to {q(tmp)} "
                f"(format parquet, compression zstd, partition_by (pid), overwrite_or_ignore)")
    n = 0
    for d in sorted(tmp.iterdir()):
        if not d.is_dir() or not d.name.startswith("pid="):
            continue
        pid = d.name[4:]
        parts = sorted(d.glob("*.parquet"))
        target = final / f"{pid}.parquet"
        if len(parts) == 1:
            os.replace(parts[0], target)
        else:
            # More than one writer made a file for this player: put them back together in order.
            con.execute(f"copy (select * from read_parquet({q(d / '*.parquet')}) order by {order}) to {q(target)} (format parquet, compression zstd)")
        n += 1
    shutil.rmtree(tmp.parent, ignore_errors=True)
    con.execute(f"copy (select * from {source} limit 0) to {q(final / '_empty.parquet')} (format parquet, compression zstd)")
    return n


def write_search(out: Path) -> list:
    """The search list: one array for each player, in this order: id, name, full name, country, role, first and last international year, matches, gender (M, F or empty). See web/src/data/search.ts."""
    con = duckdb.connect()
    p = lambda name: q(out / f"{name}.parquet")
    rows = con.execute(f"""
      select p.player_id, p.name, p."full name", p.country, p."playing role", p."first international year", p."last international year", coalesce(s.m, 0)::int,
             case p.gender when 'male' then 'M' when 'female' then 'F' else '' end
      from {p('players')} p left join (select person_id as player_id, count(distinct match_id) m from {p('match_people')} where role = 'player' group by 1) s using (player_id)
      order by coalesce(s.m, 0) desc, p.name""").fetchall()
    (out / "search.json").write_text(json.dumps(rows, separators=(",", ":"), ensure_ascii=False))
    return rows


def write_list(out: Path) -> int:
    """The Players page's list, plist.json: one array for each player, in this order: id, name, full name, gender (M, F or empty), country, playing role, batting style, bowling style, image url, first and last
    year played (from the matches, every format and competition), matches, runs, wickets, the formats played (TEST, ODI, T20I, T20, HUNDRED), the leagues played in (tournament keys of kind league). Matches are those the player was in the playing XI of (`match_people`, as the player page's `pm` file; since 2026-10-25, before that those the player batted or bowled in). A field
    the dataset does not have is null. See web/src/data/playerList.ts."""
    con = duckdb.connect()
    p = lambda name: q(out / f"{name}.parquet")
    rows = con.execute(f"""
      with pm as (
        select u.player_id as pid, m.match_id, m.start_date,
               case when m."type" = 'Fran(Hundred)' then 'HUNDRED' when m."type" = 'Intl' then (case m.format when 'TEST' then 'TEST' when 'ODI' then 'ODI' else 'T20I' end) else 'T20' end as fmt,
               case when m.tournament_kind = 'league' then m.tournament_key end as league
        from (select match_id, person_id as player_id from {p('match_people')} where role = 'player') u join {p('matches')} m on m.match_id = u.match_id),
      agg as (select pid, min(year(start_date))::int as first_year, max(year(start_date))::int as last_year, count(distinct match_id)::int as matches,
                     list_sort(list_distinct(list(fmt))) as fmts, list_sort(list_distinct(list(league) filter (where league is not null))) as leagues from pm group by 1),
      sm as (select player_id, sum(runs)::int as runs, sum(wickets)::int as wickets from {p('player_summary')} group by 1)
      select p.player_id, p.name, p."full name", case p.gender when 'male' then 'M' when 'female' then 'F' else null end, p.country, p."playing role", p."batting style", p."bowling style", p."image url",
             a.first_year, a.last_year, coalesce(a.matches, 0), coalesce(sm.runs, 0), coalesce(sm.wickets, 0), coalesce(a.fmts, []), coalesce(a.leagues, [])
      from {p('players')} p left join agg a on a.pid = p.player_id left join sm on sm.player_id = p.player_id
      order by coalesce(a.matches, 0) desc, p.name""").fetchall()
    (out / "plist.json").write_text(json.dumps([list(r) for r in rows], separators=(",", ":"), ensure_ascii=False))
    return len(rows)


def build(out: Path) -> dict:
    t0 = time.time()
    con = duckdb.connect()
    con.execute("PRAGMA threads=8")
    p = lambda name: q(out / f"{name}.parquet")
    # Every match a player was in, with whether the award went to them. Cricsheet records the award by name, so it is matched on the name of a player who was in the match.
    con.execute(f"""create table player_matches as
      select distinct mp.person_id as player_id, m.match_id, m.start_date, m.season, m.format, m."type" as "type", m.tournament_key, mp.team,
             case when m.team_1 = mp.team then m.team_2 else m.team_1 end as opponent,
             case when m.winner is null then 'other' when m.winner = mp.team then 'won' else 'lost' end as result,
             coalesce(m.player_of_match = pl.name or m.player_of_match_2 = pl.name, false) as potm
      from {p('match_people')} mp
      join {p('matches')} m on m.match_id = mp.match_id
      join {p('players')} pl on pl.player_id = mp.person_id
      where mp.role = 'player'""")
    counts = {}
    sources = {k: (p(v[0]) if v[0] != "player_matches" else "player_matches") for k, v in KINDS.items()}
    sources["pm"] = "player_matches"
    spec = dict(KINDS)
    spec["pm"] = ("player_matches", "player_id", "start_date, match_id")
    for kind, (_, key, order) in spec.items():
        counts[kind] = split(con, out, kind, sources[kind], key, order)
    rows = write_search(out)
    write_list(out)
    size = {k: sum(f.stat().st_size for f in (out / "p" / k).glob("*.parquet")) for k in spec}
    return {"players_with_files": counts, "bytes": size, "search_players": len(rows), "seconds": round(time.time() - t0, 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--search-only", action="store_true", help="write only search.json")
    a = ap.parse_args()
    if a.search_only:
        print(len(write_search(Path(a.out))), "players in search.json,", write_list(Path(a.out)), "in plist.json")
    else:
        print(json.dumps(build(Path(a.out)), indent=1))
