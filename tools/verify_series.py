"""Counts the rows of the Series page from matches.parquet, to compare with the page (web/scripts/perf/series-root.cjs).

Usage, from the dataset repo root:   .venv/bin/python cricatlas/tools/verify_series.py [--out cricatlas/data/export]

A row is one event name (tournament name, else event), season, format section (Test, ODI, T20I, T20, The Hundred) and gender. Matches with no event name are left out.
"""
import argparse
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]


def main(out: Path) -> int:
    con = duckdb.connect()
    src = f"'{out / 'matches.parquet'}'"
    sections = """case when format = 'TEST' then 'Test' when format in ('ODI', 'ODM') then 'ODI' when type = 'Fran(Hundred)' then 'Hundred'
                       when type = 'Intl' then 'T20I' else 'T20' end"""
    rows = con.execute(f"""select sec, count(*) from (select distinct coalesce(tournament_name, event) as name, coalesce(season, '') as season, {sections} as sec, gender from {src}
                           where coalesce(tournament_name, event) is not null) group by 1 order by 1""").fetchall()
    for sec, n in rows:
        print(f"{sec:8s} {n}")
    total = sum(n for _, n in rows)
    print("total", total)
    return total


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "data" / "export"))
    main(Path(ap.parse_args().out))
