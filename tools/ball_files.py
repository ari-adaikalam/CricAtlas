"""The ball files for Ball by ball in Match details.

Called by tools/match_files.py. One file for each innings of each match, `m/balls/<match id>_<innings>.json`, so opening Ball by ball loads the one innings on screen (a Test innings is over a thousand balls).
Each file is columns, not rows: one array per field, one entry per delivery in the order bowled. Names and labels repeat on every ball, so they sit in lookup lists and a ball holds small numbers.
The running score and wickets, the over totals and the bowler of an over are worked out in the browser from these arrays, so the same arithmetic is not stored twice.

Fields (one entry for each delivery):
  d    delivery number in the innings          ov   over, counted from 0                 sb   the scorecard ball (5.3), as the data has it
  lg   1 for a legal delivery                  st   index of the batter on strike        bo   index of the bowler
  rb   runs off the bat                        wd nb by lb pe   wides, no balls, byes, leg byes, penalty runs
  w    the wickets that fell on the ball, counted from the wickets table (a ball can have two, and a side that retires out together has ten on one ball). Retirements are not wickets and are listed apart
  sh ln le   index of the shot, line and length labels, -1 when the source has none (labels are the source's own, as given)
  ct   shot control: 1 in control, 0 not in control, -1 when there is none
  ps   the source's projected final score after the ball, -1 when it has none
  wx wy   where the source placed the ball on the ground (the 363 by 363 frame of the wagon wheel), -1 when it did not. Distance, angle, zone and the ring are worked out from these in the browser
  wp   the batting side's win probability after the ball, 0 to 100, -1 when there is none
  ev   sparse: {delivery index: [tag index, ...]} for dropped catches, run out and stumping chances and reviews
Lookup lists: pl (batter and bowler names with ids), ph (the batting hand of each name in pl: R, L, or empty), shots, lines, lens, tags.
"""
import json
from pathlib import Path

CHANCES = {"dropped catch": "Dropped catch", "run out chance": "Run out chance", "stumping chance": "Stumping chance"}


def _ix(look: dict, v):
    if v not in look:
        look[v] = len(look)
    return look[v]


def write_ball_files(con, exp: Path, out: Path, mids: list[int]) -> int:
    """Writes the files for the given matches (all of them when `mids` is empty). Returns how many files were written."""
    flt = f"where b.match_id in ({','.join(map(str, mids))})" if mids else ""
    rows = con.sql(f"""
      select b.match_id, b.innings, b.delivery_number, b."over"::int, b.scorecard_ball, b.is_legal_delivery::int,
             coalesce(b.striker_id, b.striker) st_k, b.striker, b.striker_id, coalesce(b.bowler_id, b.bowler) bo_k, b.bowler, b.bowler_id,
             b.runs_off_bat::int, coalesce(b.wides, 0)::int, coalesce(b.noballs, 0)::int, coalesce(b.byes, 0)::int, coalesce(b.legbyes, 0)::int, coalesce(b.penalty, 0)::int,
             coalesce(wk.c, 0)::int w,
             b.shot_played, b.ball_line, b.ball_length, b.shot_control, b.win_probability, b.ball_events, b.wagon_x, b.wagon_y, b."batting style_striker", b.predicted_score
      from balls b
      left join (select match_id, innings, delivery_number, count(*) c from wickets where wicket_type not in ('retired hurt', 'retired not out') group by 1, 2, 3) wk
        on wk.match_id = b.match_id and wk.innings = b.innings and wk.delivery_number = b.delivery_number
      {flt}
      order by b.match_id, b.innings, b.delivery_number
    """).fetchall()
    reviews = {}
    for (mid, inn, dn, team, decision, umpires_call) in con.sql(f"""
      select match_id, innings, delivery_number, review_by, decision, umpires_call from read_parquet('{exp / 'reviews.parquet'}')
      {flt.replace('b.match_id', 'match_id')}
    """).fetchall():
        tag = f"Review by {team}, {'struck down' if decision == 'struck down' else decision}{' (umpires call)' if umpires_call else ''}"
        reviews.setdefault((mid, inn, dn), []).append(tag)

    (out / "m" / "balls").mkdir(parents=True, exist_ok=True)
    written = 0
    cur = None
    cols: dict = {}
    pl: dict = {}
    hands: dict = {}
    looks: dict = {}

    def flush() -> None:
        nonlocal written
        if cur is None:
            return
        pl_list = [list(k) for k in pl]
        payload = dict(v=1, **cols, pl=pl_list, ph=[hands.get(k, '') for k in pl], shots=list(looks["sh"]), lines=list(looks["ln"]), lens=list(looks["le"]), tags=list(looks["tag"]))
        (out / "m" / "balls" / f"{cur[0]}_{cur[1]}.json").write_text(json.dumps(payload, separators=(",", ":")))
        written += 1

    def start() -> None:
        nonlocal cols, pl, looks, hands
        hands = {}
        cols = {k: [] for k in ("d", "ov", "sb", "lg", "st", "bo", "rb", "wd", "nb", "by", "lb", "pe", "w", "sh", "ln", "le", "ct", "wp", "wx", "wy", "ps")}
        cols["ev"] = {}
        pl = {}
        looks = {k: {} for k in ("sh", "ln", "le", "tag")}

    for (mid, inn, dn, ov, sb, lg, _stk, st_name, st_id, _bok, bo_name, bo_id, rb, wd, nb, by, lb, pe, w, shot, line, length, ctl, wp, events, wag_x, wag_y, bat_style, proj) in rows:
        if cur != (mid, inn):
            flush()
            cur = (mid, inn)
            start()
        for k, v in (("d", dn), ("ov", ov), ("sb", None if sb is None else round(float(sb), 1)), ("lg", lg), ("rb", rb), ("wd", wd), ("nb", nb), ("by", by), ("lb", lb), ("pe", pe), ("w", w)):
            cols[k].append(v)
        cols["st"].append(-1 if st_name is None else _ix(pl, (st_name, st_id)))
        if st_name is not None and bat_style:
            hands.setdefault((st_name, st_id), "L" if str(bat_style).lower().startswith("left") else "R")
        cols["bo"].append(-1 if bo_name is None else _ix(pl, (bo_name, bo_id)))
        cols["sh"].append(-1 if shot is None else _ix(looks["sh"], shot))
        cols["ln"].append(-1 if line is None else _ix(looks["ln"], line))
        cols["le"].append(-1 if length is None else _ix(looks["le"], length))
        cols["ct"].append(-1 if ctl is None else (1 if ctl == "in control" else 0))
        cols["wp"].append(-1 if wp is None else int(round(float(wp))))
        cols["ps"].append(-1 if proj is None else int(round(float(proj))))
        cols["wx"].append(-1 if wag_x is None else int(wag_x))
        cols["wy"].append(-1 if wag_y is None else int(wag_y))
        tags = [CHANCES[e.strip()] for e in (events or "").split(";") if e.strip() in CHANCES] + reviews.get((mid, inn, dn), [])
        if tags:
            cols["ev"][len(cols["d"]) - 1] = [_ix(looks["tag"], t) for t in tags]
    flush()
    return written
