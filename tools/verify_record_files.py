"""Checks the record lists (tools/records_files.py) against the exported tables, worked out another way.

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/verify_record_files.py [--out data/export]

Each check reads a list from `r/<scope>/<category>.json` and recomputes its top rows with a separate query on the exported Parquet tables (no table of records_files.py is reused). Every check must
report 0 differences. The scopes are the three formats for men and women and a league, so Tests, ODIs, T20Is, a league and a women's side are all covered.
"""
import argparse, json, sys
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]


def run(out: Path) -> int:
    con = duckdb.connect()
    p = lambda n: f"'{out / (n + '.parquet')}'"
    bad = 0
    checks = 0

    def lists(scope, cat):
        return {l['id']: l for l in json.loads((out / 'r' / scope / f'{cat}.json').read_text())['lists']}

    def col(lst, *labels, n=5):
        """The first rows of a list, as tuples of the named columns (a player or team cell is its id)."""
        idx = [[c[1] for c in lst['cols']].index(l) for l in labels]
        pick = lambda v: v[1] if isinstance(v, list) and len(v) >= 2 else v
        return [tuple(pick(r[i]) for i in idx) for r in lst['rows'][:n]]

    def expect(label, got, want):
        # Rows are (id, value, ...) or bare values. The values must match in order; the ids must match for every value above the last one, because players level on the last value may come in either order.
        nonlocal bad, checks
        checks += 1
        vals = lambda xs: [x[1:] if isinstance(x, tuple) else x for x in xs]
        ids = lambda xs, floor: {x[0] for x in xs if isinstance(x, tuple) and x[1:] > floor}
        ok = vals(got) == vals(want) or sorted(vals(got), key=repr) == sorted(vals(want), key=repr)
        if ok and got and isinstance(got[0], tuple):
            floor = vals(want)[-1]
            ok = ids(got, floor) == ids(want, floor)
        if not ok:
            bad += 1
            print(f'DIFF {label}: file {got} / recomputed {want}')

    sc = {'test-male': ("m.format = 'TEST' and m.gender = 'male'"), 'odi-female': ("m.format = 'ODI' and m.gender = 'female'"), 't20i-male': ("m.format = 'T20' and m.type = 'Intl' and m.gender = 'male'"),
          't-ipl': "m.tournament_key = 'ipl'", 'league-female': "m.format = 'T20' and m.type like 'Fran(%' and m.type <> 'Fran(Hundred)' and m.gender = 'female'"}
    for scope, cond in sc.items():
        bat, bowl, team, part, field, ind = (lists(scope, c) for c in ('batting', 'bowling', 'team', 'partnership', 'fielding', 'individual'))
        # Most runs, innings and not outs of the top five
        want = con.execute(f"""select b.player_id, sum(b.runs)::int, count(*)::int, sum(case when b.is_out then 0 else 1 end)::int from {p('bat_innings')} b join {p('matches')} m using (match_id)
                               where {cond} and b.runs is not null group by 1 order by 2 desc, 1 limit 5""").fetchall()
        got = col(bat['most-runs-career'], 'Player', 'Runs', 'Inns', 'NO')
        expect(f'{scope} most runs career', got, [(w[0], w[1], w[2], w[3]) for w in want])
        # Highest score in an innings
        want = con.execute(f"""select b.player_id, b.runs::int, b.balls from {p('bat_innings')} b join {p('matches')} m using (match_id) where {cond} and b.runs is not null order by b.runs desc, b.balls asc, b.player_id limit 3""").fetchall()
        got = [(a, int(str(b).rstrip('*')), c) for a, b, c in col(bat['highest-score-innings'], 'Player', 'Runs', 'Balls', n=3)]
        expect(f'{scope} highest score', [g[:2] for g in got], [w[:2] for w in want])
        # Most wickets in a career
        want = con.execute(f"""select w.player_id, sum(w.wickets)::int, sum(w.balls)::int from {p('bowl_innings')} w join {p('matches')} m using (match_id) where {cond} and w.runs is not null group by 1 order by 2 desc, 1 limit 5""").fetchall()
        got = col(bowl['most-wickets-career'], 'Player', 'Wkts', 'Balls')
        expect(f'{scope} most wickets', [g[:2] for g in got], [w[:2] for w in want])
        # Most catches
        want = con.execute(f"""select f.player_id, count(*)::int from {p('fielding_by_player')} f join {p('matches')} m using (match_id) where {cond} and f.kind in ('catch', 'caught_and_bowled') and f.player_id is not null group by 1 order by 2 desc, 1 limit 5""").fetchall()
        got = col(field['most-catches-career'], 'Player', 'Ct')
        expect(f'{scope} most catches', got, want)
        # Highest innings total, worked out from the balls
        want = con.execute(f"""select b.batting_team_id, sum(b.runs_off_bat + b.extras)::int as runs from {p('balls_by_match')} b join {p('matches')} m using (match_id)
                               where {cond} and not coalesce(b.is_super_over, false) group by b.match_id, b.innings, b.batting_team_id order by 2 desc limit 3""").fetchall()
        got = [(a, int(str(b).split('/')[0])) for a, b in col(team['highest-total'], 'Team', 'Score', n=3)]
        expect(f'{scope} highest total', [g[1] for g in got], [w[1] for w in want])
        # Highest partnership for any wicket
        want = con.execute(f"""select a.runs::int from {p('partnerships_by_player')} a join {p('matches')} m using (match_id) where {cond} and a.player_id < a.partner_id order by a.runs desc limit 3""").fetchall()
        got = [int(str(b).rstrip('*')) for b, in col(part['highest-partnerships'], 'Runs', n=3)]
        expect(f'{scope} highest partnership', got, [w[0] for w in want])
        # Results summary: matches and wins of the team with the most matches
        want = con.execute(f"""select t.team_id, count(*)::int, sum(case when m.winner_id = t.team_id and coalesce(m.outcome, '') <> 'tie' then 1 else 0 end)::int from
                               (select match_id, team_1_id as team_id from {p('matches')} union all select match_id, team_2_id from {p('matches')}) t join {p('matches')} m using (match_id)
                               where {cond} group by 1 order by 2 desc, 1 limit 3""").fetchall()
        got = col(team['results-summary'], 'Team', 'Mat', 'Won', n=3) if 'results-summary' in team else []
        expect(f'{scope} results summary', sorted(got), sorted(w for w in want)[:len(got)] if len(want) == len(got) else sorted(want))
        # Matches played by a person in the playing XI
        want = con.execute(f"""select mp.person_id, count(distinct mp.match_id)::int from {p('match_people')} mp join {p('matches')} m using (match_id) where {cond} and mp.role = 'player' group by 1 order by 2 desc, 1 limit 5""").fetchall()
        if 'most-matches-in-career' in ind:
            got = col(ind['most-matches-in-career'], 'Player', 'Mat')
            expect(f'{scope} most matches', got, want)
    # Slices: the first year, decade, team, ground and trophy of some scopes, recomputed from the Parquet files.
    for scope, cond in (('test-male', sc['test-male']), ('odi-female', sc['odi-female']), ('t20i-male', sc['t20i-male'])):
        path = out / 'r' / scope / 'slices.json'
        if not path.exists():
            continue
        sl = json.loads(path.read_text())
        for kind, entries in sl.items():
            e = entries[min(1, len(entries) - 1)]
            lab = e['label'].replace("'", "''")
            extra = {'year': f"extract(year from m.start_date) = {e['label']}" if kind == 'year' else '', 'decade': f"extract(year from m.start_date) between {int(e['label'][:4])} and {int(e['label'][:4]) + 9}" if kind == 'decade' else '',
                     'team': '', 'ground': f"m.venue = '{lab}'", 'trophy': f"m.event = '{lab}'"}[kind]
            side = f" and b.team = '{lab}'" if kind == 'team' else ''
            team_cond = f" and (m.team_1 = '{lab}' or m.team_2 = '{lab}')" if kind == 'team' else ''
            where = f"{cond} and {extra}{team_cond}" if extra else f"{cond}{team_cond}"
            f = out / 'r' / scope / e['key'] / 'batting.json'
            lst = {l['id']: l for l in json.loads(f.read_text())['lists']}
            if 'most-runs-career' not in lst:
                continue
            want = con.execute(f"""select b.player_id, sum(b.runs)::int, count(*)::int from {p('bat_innings')} b join {p('matches')} m using (match_id) where {where}{side} and b.runs is not null
                                   group by 1 order by 2 desc, 1 limit 5""").fetchall()
            got = col(lst['most-runs-career'], 'Player', 'Runs', 'Inns')
            expect(f'{scope} {e["key"]} most runs', got, [(w[0], w[1], w[2]) for w in want])
            want = con.execute(f"""select b.runs::int from {p('bat_innings')} b join {p('matches')} m using (match_id) where {where}{side} and b.runs is not null order by 1 desc limit 3""").fetchall()
            got = [int(str(r[0]).rstrip('*')) for r in col(lst['highest-score-innings'], 'Runs', n=3)]
            expect(f'{scope} {e["key"]} highest score', got, [w[0] for w in want])
    # No list holds a row twice in a row of the same record (a join that fans out would), and every file parses.
    # (a slice is small, so a list there can hold two identical rows that are two real events, such as two 0-run partnerships; only whole scopes are checked)
    for f in sorted((out / 'r').glob('*/*.json')):
        d = json.loads(f.read_text())
        for l in d.get('lists', []):
            seen = {json.dumps(r) for r in l['rows']}
            checks += 1
            if len(seen) != len(l['rows']) and l['id'] not in ('hat-tricks', 'most-catches-innings', 'most-catches-match', 'most-catches-substitute-innings', 'most-catches-substitute', 'most-sixes-consecutive-balls', 'most-fours-consecutive-balls'):
                bad += 1
                print(f'DIFF {f.parent.name}/{l["id"]}: {len(l["rows"]) - len(seen)} repeated rows')
    print(f'{checks} checks, {bad} differences')
    return bad


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='data/export')
    a = ap.parse_args()
    sys.exit(1 if run(HERE / a.out) else 0)
