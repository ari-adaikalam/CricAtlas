"""Point files: one small binary file for each batter (p/pts) and for each bowler (p/ptb), holding every ball they faced that the source placed on the ground, for the tiles that draw individual balls (wagon wheel, scoring zones).

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/point_files.py [--out data/export] [--only <player id> ...]

The browser reads a file whole and filters it in JavaScript with no query engine. The filter rules live in web/src/domain/pointFilter.ts and are checked against
the SQL of the same tiles on real players (web/src/domain/__tests__/pointFilter.test.ts), so a change to a filter has to change both.

A bowler's file has one row for every legal delivery they bowled (untracked ones too, for the count of balls bowled) and for each wicket credited to them on a delivery that was not legal (a
stumping off a wide), which has flag bit 1 set and counts as a wicket and nothing else, with the batter in the place of the bowler: the `bowler` and `name`
columns are the batter's id and name, `hand` is the batter's hand (1 right, 2 left, 0 unknown), flag bit 0 is a wicket credited to the bowler, the opponent is the batting team, and the result is
relative to the bowling team. A batter's file has hand 0.

File p/pts/<id>.bin (p/ptb/<id>.bin for a bowler):  uint32 header length, the header as JSON, then the columns, each padded to a multiple of 4 bytes. The header says how many rows there are, where each column starts and its type,
and holds the lookup lists the small codes point into (tournament, season, bowler as [id, first style], name, opponent, shot, bowler style). Rows are in the order of the shots tile: start date, match, innings, delivery.

Rows: every ball the batter faced that has a position, a length, a line or a control reading, or dismissed the batter (wides included, so a stumping off a wide is kept), and each dismissal of
the batter at the non-striker's end. Columns:
  x, y (int16)       the position in the 363 by 363 data frame, never (0, 0)
  runs (uint8)       runs off the bat
  flags (uint8)      bit 0: the ball dismissed this batter (retirements are not dismissals), bit 1: a wide, bit 2: the batter was dismissed at the non-striker's end on a ball faced by
                     another batter (a row for the dismissal map only), bit 3: the ball has a position on the ground (the wagon wheel and the zones read only these), bit 4: the dismissal was a catch (caught or caught and bowled), which the wheel draws in the air
  length, line, control (uint8)   0 none; length 1 to 6 (full toss, yorker, full, good length, short of a good length, short), line 1 to 5 (wide down leg, down leg, on the stumps, outside offstump,
                     wide outside offstump), control 1 in control, 2 not in control
  match (int32), date (int32, yyyymmdd), opponent (uint16, index into the list of bowling teams)
  over (uint16), ball (uint8), innings (uint8), wickets (uint8, wickets of the team already down)
  phase (uint8)      0 none (Tests, Super Overs), 1 powerplay, 2 middle, 3 death, 4 rest of innings (The Hundred)
  result (uint8)     0 other, 1 won, 2 lost, 3 draw, for the batter's team
  superOver (uint8)  1 for a Super Over ball
  format (uint8)     0 Test, 1 ODI, 2 T20, 3 other;   international (uint8)  1 for an international match
  tournament, season, bowler (the bowler's id), name (the name on the row), shot, style (uint16 or uint8)   indexes into the lookup lists, 65535 or 255 for none
"""
import argparse, json, struct, sys, time
from pathlib import Path
import duckdb
import numpy as np

HERE = Path(__file__).resolve().parents[1]
NONE16, NONE8 = 65535, 255

LENGTHS = ["full toss", "yorker", "full", "good length", "short of a good length", "short"]
LINES = ["wide down leg", "down leg", "on the stumps", "outside offstump", "wide outside offstump"]

COLUMNS = [  # name, numpy dtype
    ("hand", "u1"), ("length", "u1"), ("line", "u1"), ("control", "u1"), ("match", "<i4"), ("date", "<i4"), ("opponent", "<u2"),
    ("x", "<i2"), ("y", "<i2"), ("runs", "u1"), ("flags", "u1"), ("over", "<u2"), ("ball", "u1"), ("innings", "u1"), ("wickets", "u1"),
    ("phase", "u1"), ("result", "u1"), ("superOver", "u1"), ("format", "u1"), ("international", "u1"),
    ("tournament", "<u2"), ("season", "<u2"), ("bowler", "<u2"), ("name", "<u2"), ("shot", "u1"), ("style", "u1"),
]

SQL = """
with b as (
  select striker_id as pid, wagon_x, wagon_y, runs_off_bat, wides, "over", ball_in_over, innings, team_wickets_fallen, phase, match_outcome, match_winner_id, batting_team_id, is_super_over,
         format, "type", tournament_key, season, bowler_id, bowler, "bowling style_bowler" as bowler_style_full, shot_played, ball_length, ball_line, shot_control, match_id, start_date,
         delivery_number, bowling_team,
         coalesce(player_dismissed = striker and wicket_type not in ('retired hurt', 'retired not out'), false) as out_here,
         coalesce(player_dismissed = striker and wicket_type in ('caught', 'caught and bowled'), false) as caught_here, 0 as nonstriker
  from '{src}' where striker_id is not null
), n as (
  select batter_id as pid, wagon_x, wagon_y, runs_off_bat, wides, "over", ball_in_over, innings, team_wickets_fallen, phase, match_outcome, match_winner_id, batting_team_id, is_super_over,
         format, "type", tournament_key, season, bowler_id, bowler, "bowling style_bowler" as bowler_style_full, shot_played, ball_length, ball_line, shot_control, match_id, start_date,
         delivery_number, bowling_team, false as out_here, false as caught_here, 1 as nonstriker
  from '{dis}' where not coalesce(on_strike, false) and batter_id is not null  -- on_strike is empty on a few rows (no striker id on the ball): the dismissal still counts
), u as (
  select * from b where (wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0)) or ball_length is not null or ball_line is not null or shot_control is not null or out_here
  union all select * from n
)
select pid, 0 as hand, case when nonstriker = 1 then 0 else coalesce(wagon_x, 0) end::int as x, case when nonstriker = 1 then 0 else coalesce(wagon_y, 0) end::int as y,
  case when nonstriker = 1 then 0 else least(greatest(coalesce(runs_off_bat, 0), 0), 255) end::int as runs,
  (case when out_here then 1 else 0 end + case when coalesce(wides, 0) > 0 then 2 else 0 end + case when nonstriker = 1 then 4 else 0 end
   + case when nonstriker = 0 and wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0) then 8 else 0 end
   + case when caught_here then 16 else 0 end)::int as flags,
  "over"::int as "over", least(coalesce(ball_in_over, 0), 255)::int as ball, innings::int as innings, least(coalesce(team_wickets_fallen, 0), 255)::int as wickets,
  case phase when 'powerplay' then 1 when 'middle' then 2 when 'death' then 3 when 'rest' then 4 else 0 end as phase,
  case when match_outcome = 'draw' then 3 when match_winner_id is null then 0 when match_winner_id = batting_team_id then 1 else 2 end as result,
  case when coalesce(is_super_over, false) then 1 else 0 end as superover,
  case format when 'TEST' then 0 when 'ODI' then 1 when 'T20' then 2 else 3 end as format,
  case when "type" = 'Intl' then 1 else 0 end as international,
  case ball_length when 'full toss' then 1 when 'yorker' then 2 when 'full' then 3 when 'good length' then 4 when 'short of a good length' then 5 when 'short' then 6 else 0 end as length,
  case ball_line when 'wide down leg' then 1 when 'down leg' then 2 when 'on the stumps' then 3 when 'outside offstump' then 4 when 'wide outside offstump' then 5 else 0 end as line,
  case shot_control when 'in control' then 1 when 'not in control' then 2 else 0 end as control,
  match_id::int as match, (year(start_date) * 10000 + month(start_date) * 100 + day(start_date))::int as date,
  tournament_key, season, bowler_id, bowler, bowler_style_full, shot_played, bowling_team
from u
order by pid, start_date, match_id, innings, delivery_number, nonstriker"""


BOWL_SQL = """
select bowler_id as pid, case "batting style_striker" when 'right-hand bat' then 1 when 'left-hand bat' then 2 else 0 end as hand,
  coalesce(wagon_x, 0)::int as x, coalesce(wagon_y, 0)::int as y, least(greatest(coalesce(runs_off_bat, 0), 0), 255)::int as runs,
  (case when coalesce(wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket'), false) then 1 else 0 end
   + case when not is_legal_delivery then 2 else 0 end
   + case when wagon_x is not null and wagon_y is not null and not (wagon_x = 0 and wagon_y = 0) then 8 else 0 end
   + case when coalesce(wicket_type in ('caught', 'caught and bowled'), false) then 16 else 0 end)::int as flags,
  "over"::int as "over", least(coalesce(ball_in_over, 0), 255)::int as ball, innings::int as innings, least(coalesce(team_wickets_fallen, 0), 255)::int as wickets,
  case phase when 'powerplay' then 1 when 'middle' then 2 when 'death' then 3 when 'rest' then 4 else 0 end as phase,
  case when match_outcome = 'draw' then 3 when match_winner_id is null then 0 when match_winner_id = bowling_team_id then 1 else 2 end as result,
  case when coalesce(is_super_over, false) then 1 else 0 end as superover,
  case format when 'TEST' then 0 when 'ODI' then 1 when 'T20' then 2 else 3 end as format,
  case when "type" = 'Intl' then 1 else 0 end as international,
  case ball_length when 'full toss' then 1 when 'yorker' then 2 when 'full' then 3 when 'good length' then 4 when 'short of a good length' then 5 when 'short' then 6 else 0 end as length,
  case ball_line when 'wide down leg' then 1 when 'down leg' then 2 when 'on the stumps' then 3 when 'outside offstump' then 4 when 'wide outside offstump' then 5 else 0 end as line,
  case shot_control when 'in control' then 1 when 'not in control' then 2 else 0 end as control,
  match_id::int as match, (year(start_date) * 10000 + month(start_date) * 100 + day(start_date))::int as date,
  tournament_key, season, striker_id as bowler_id, striker as bowler, null::varchar as bowler_style_full, shot_played, batting_team as bowling_team
from '{src}'
where bowler_id is not null and (is_legal_delivery or coalesce(wicket_type in ('bowled', 'caught', 'lbw', 'stumped', 'caught and bowled', 'hit wicket'), false))
order by pid, start_date, match_id, innings, delivery_number
"""


def lookup(values: np.ndarray, none: int):
    """Codes into a list of the distinct non-null values (in order of first use), and the list."""
    items: dict = {}
    codes = np.empty(len(values), dtype=np.int64)
    for i, v in enumerate(values):
        if v is None:
            codes[i] = none
        else:
            codes[i] = items.setdefault(v, len(items))
    return codes, list(items.keys())


def encode(rows: dict, lo: int, hi: int) -> bytes:
    n = hi - lo
    sl = lambda k: rows[k][lo:hi]
    tcodes, tournaments = lookup(sl("tournament_key"), NONE16)
    scodes, seasons = lookup(sl("season"), NONE16)
    ids = sl("bowler_id"); names = sl("bowler"); styles_full = sl("bowler_style_full")
    first = np.array([None if s is None else s.split(",")[0] for s in styles_full], dtype=object)
    stcodes, styles = lookup(first, NONE8)
    bowlers: dict = {}
    bcodes = np.empty(n, dtype=np.int64)
    for i in range(n):
        if ids[i] is None:
            bcodes[i] = NONE16
        else:
            key = ids[i]
            if key not in bowlers:
                bowlers[key] = (len(bowlers), names[i], first[i])
            bcodes[i] = bowlers[key][0]
    shcodes, shots = lookup(sl("shot_played"), NONE8)
    opcodes, opponents = lookup(sl("bowling_team"), NONE16)
    # The name is kept for each row: one bowler id can carry slightly different names on different rows (Cricsheet adds a number to tell two players of one name apart).
    ncodes, names_list = lookup(names, NONE16)
    data = {"hand": sl("hand"), "length": sl("length"), "line": sl("line"), "control": sl("control"), "match": sl("match"), "date": sl("date"), "opponent": opcodes,
            "x": sl("x"), "y": sl("y"), "runs": sl("runs"), "flags": sl("flags"), "over": sl("over"), "ball": sl("ball"), "innings": sl("innings"), "wickets": sl("wickets"),
            "phase": sl("phase"), "result": sl("result"), "superOver": sl("superover"), "format": sl("format"), "international": sl("international"),
            "tournament": tcodes, "season": scodes, "bowler": bcodes, "name": ncodes, "shot": shcodes, "style": stcodes}
    if len(styles) >= NONE8 or len(shots) >= NONE8 or len(bowlers) >= NONE16 or len(tournaments) >= NONE16 or len(seasons) >= NONE16:
        raise ValueError("a lookup list is too long for its code")
    blobs, header_cols, offset = [], [], 0
    parts = []
    for name, dtype in COLUMNS:
        a = np.asarray(data[name]).astype(dtype)
        raw = a.tobytes()
        pad = (-len(raw)) % 4
        header_cols.append([name, dtype.lstrip("<"), offset, len(raw)])
        parts.append(raw + b"\0" * pad)
        offset += len(raw) + pad
    header = {"n": n, "columns": header_cols, "tournaments": tournaments, "seasons": seasons,
              "bowlers": [[k, v[2]] for k, v in sorted(bowlers.items(), key=lambda kv: kv[1][0])], "names": names_list, "opponents": opponents, "shots": shots, "styles": styles}
    hb = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    hb += b" " * ((-(4 + len(hb))) % 4)
    return struct.pack("<I", len(hb)) + hb + b"".join(parts)


def write_files(con, sql: str, folder: Path, only=None) -> tuple:
    res = con.execute(sql)
    cols = [d[0] for d in res.description]
    table = res.fetchnumpy()
    rows = {c: table[c] for c in cols}
    # numpy gives masked arrays for columns with nulls: turn them into object arrays with None. (filled(None) would give '?' for text, so the mask is used directly.)
    for c in ("tournament_key", "season", "bowler_id", "bowler", "bowler_style_full", "shot_played", "bowling_team"):
        v = rows[c]
        mask = np.ma.getmaskarray(v)
        data = np.ma.getdata(v)
        arr = np.empty(len(data), dtype=object)
        for i in range(len(data)):
            arr[i] = None if mask[i] or data[i] is None else data[i]
        rows[c] = arr
    for c in cols:
        if np.ma.isMaskedArray(rows[c]):
            rows[c] = rows[c].filled(0)
    pid = rows["pid"]
    folder.mkdir(parents=True, exist_ok=True)
    bounds = np.flatnonzero(np.concatenate(([True], pid[1:] != pid[:-1], [True])))
    written = size = 0
    for lo, hi in zip(bounds[:-1], bounds[1:]):
        player = str(pid[lo])
        if only and player not in only:
            continue
        blob = encode(rows, int(lo), int(hi))
        (folder / f"{player}.bin").write_bytes(blob)
        written += 1; size += len(blob)
    return written, size, int(len(pid))


def build(out: Path, only=None) -> dict:
    t0 = time.time()
    con = duckdb.connect()
    con.execute("PRAGMA threads=8")
    src = (out / "balls_by_batter.parquet").as_posix()
    dis = (out / "dismissals_by_batter.parquet").as_posix()
    bowl = (out / "balls_by_bowler.parquet").as_posix()
    files, size, rows = write_files(con, SQL.format(src=src, dis=dis), out / "p" / "pts", only)
    bfiles, bsize, brows = write_files(con, BOWL_SQL.format(src=bowl), out / "p" / "ptb", only)
    return {"batters": {"files": files, "bytes": size, "rows": rows}, "bowlers": {"files": bfiles, "bytes": bsize, "rows": brows}, "seconds": round(time.time() - t0, 1)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    print(json.dumps(build(Path(a.out), set(a.only) if a.only else None), indent=1))
