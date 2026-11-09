"""Build cricatlas/data/tournaments.csv: one row per `event` value in matches.csv.

Usage (from the repo root):
    .venv/bin/python cricatlas/tools/tournament_list.py

Columns: event, tournament_key, display_name, kind, section, gender, matches, first_year, last_year.
kind: tournament (multi-team international), qualifier, small (multi-team, minor), league, bilateral.
Only tournament, qualifier, small and league rows appear in the Competition filter. Bilateral series do not.
Name variants of the same tournament share one tournament_key. The rules below are the whole method, so a new
Cricsheet event name that matches no rule lands in "small" (multi-team) or "bilateral" and can be reviewed.
"""
import re, sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "cricatlas" / "data" / "tournaments.csv"
LEAGUES = {"ipl": "Indian Premier League", "wpl": "Women's Premier League", "bbl": "Big Bash League",
           "wbb": "Women's Big Bash League", "psl": "Pakistan Super League", "cpl": "Caribbean Premier League",
           "sat": "SA20", "ilt": "International League T20", "hnd": "The Hundred", "mlc": "Major League Cricket",
           "lpl": "Lanka Premier League", "bpl": "Bangladesh Premier League"}

# (regex on the event name, key, display name, section). First match wins. Gender is added to the key.
MAJOR = [
    (r"^ICC (Men's )?(T20 World Cup|World Twenty20|Women's World Twenty20|Women's T20 World Cup)$|^World T20$|^Women's World T20$", "t20-world-cup", "T20 World Cup", "World Cups and ICC events"),
    (r"^ICC (Cricket )?World Cup$|^World Cup$|^ICC Women's World Cup$", "odi-world-cup", "Cricket World Cup", "World Cups and ICC events"),
    (r"^ICC Champions Trophy$", "champions-trophy", "Champions Trophy", "World Cups and ICC events"),
    (r"World Cup (League 2|Super League)", "odi-world-cup-league", "Cricket World Cup League", "World Cups and ICC events"),
    (r"^ICC World Test Championship$", "wtc", "World Test Championship", "World Cups and ICC events"),
    (r"^ICC Women's Championship$", "women-championship", "ICC Women's Championship", "World Cups and ICC events"),
    (r"Asia Cup$", "asia-cup", "Asia Cup", "Asia Cup, Games and continental cups"),
    (r"^Commonwealth Games", "commonwealth-games", "Commonwealth Games", "Asia Cup, Games and continental cups"),
    (r"^Asian Games (Men's|Women's) Cricket Competition$", "asian-games", "Asian Games", "Asia Cup, Games and continental cups"),
    (r"^(Women's )?Continental Cup$|^Africa Continental Cup$", "continental-cup", "Continental Cup", "Asia Cup, Games and continental cups"),
    (r"Premier Cup$", "acc-premier-cup", "ACC Premier Cup", "Asia Cup, Games and continental cups"),
    (r"^African Games$|^Women's African Games$", "african-games", "African Games", "Asia Cup, Games and continental cups"),
    (r"^Asia Pacific Cricket Champions Trophy$", "apc-champions-trophy", "Asia Pacific Cricket Champions Trophy", "Asia Cup, Games and continental cups"),
]
# Multi-team events that show only two teams in the data. Checked by name, so they count as small events and not bilateral.
TWO_TEAM_TOURNAMENTS = {
    "United Arab Emirates T20I Tri-Series", "Bangladesh Twenty20 Tri-Series", "Twenty20 Quadrangular (in Namibia)",
    "Marylebone Cricket Club Tri-Nation T20 Series", "Dubai Triangular Series", "NatWest Women's T20 Quadrangular Series",
    "Women's Quadrangular Series", "South American Women's Championships", "T20 Canada",
    "Nigeria Cricket Federation Women's T20I Tournament", "TVS Cup (Bangladesh)", "Asia Cup Rising Stars",
    "Women's Asia Cup Rising Stars", "Asian Cricket Council Women's Emerging Teams Cup", "Asian Cricket Council Premier League",
    "Balkan Cup", "RSA Challenge",
}
QUALIFIER = r"qualif|play-?off|Region Final|Sub Regional|Region Div|Challenger Cup|Division"


def gender_word(g):
    return "Women's " if g == "female" else "Men's "


def named(g, name):
    return name if "Women" in name else gender_word(g) + name


def main():
    m = pd.read_csv(ROOT / "data" / "output" / "matches.csv", low_memory=False,
                    usecols=["match_id", "event", "collection", "gender", "start_date", "team_1", "team_2"])
    m = m[m.event.notna()].copy()
    m["year"] = m.start_date.str[:4].astype(int)
    teams = pd.concat([m[["event", "team_1"]].rename(columns={"team_1": "t"}), m[["event", "team_2"]].rename(columns={"team_2": "t"})]).groupby("event").t.nunique()
    rows = []
    for event, g in m.groupby("event"):
        col = g.collection.iloc[0]
        gender = "female" if (g.gender == "female").mean() > 0.5 else "male"
        base = dict(event=event, gender=gender, matches=len(g), first_year=int(g.year.min()), last_year=int(g.year.max()))
        if col in LEAGUES:
            name = LEAGUES[col]
            rows.append({**base, "tournament_key": col, "display_name": name + (" (women)" if col == "hnd" and gender == "female" else ""), "kind": "league", "section": "Leagues"})
            continue
        if re.search(QUALIFIER, event, re.I):
            fam = "T20 World Cup" if re.search(r"T20|Twenty20", event) else "Cricket World Cup" if re.search(r"World Cup", event, re.I) else "Other"
            if fam == "Other":
                fam = "Asia and regional"
            rows.append({**base, "tournament_key": "qual-" + re.sub(r"\W+", "-", fam.lower()) + "-" + gender,
                         "display_name": named(gender, fam + " qualifiers"), "kind": "qualifier", "section": "Qualifiers"})
            continue
        if event not in TWO_TEAM_TOURNAMENTS and (teams[event] <= 2 or re.search(r" tour of | in | v ", event)):
            rows.append({**base, "tournament_key": "", "display_name": event, "kind": "bilateral", "section": ""})
            continue
        for pat, key, name, section in MAJOR:
            if re.search(pat, event):
                rows.append({**base, "tournament_key": key + "-" + gender, "display_name": named(gender, name), "kind": "tournament", "section": section})
                break
        else:
            rows.append({**base, "tournament_key": re.sub(r"\W+", "-", event.lower()).strip("-"), "display_name": event, "kind": "small", "section": "Tri-series and regional cups"})
    df = pd.DataFrame(rows)
    df.to_csv(OUT, index=False)
    g = df.groupby("kind").agg(events=("event", "size"), matches=("matches", "sum"), tournaments=("tournament_key", "nunique"))
    print(g)
    print(df[df.kind == "tournament"].groupby("display_name").agg(events=("event", "size"), matches=("matches", "sum")).sort_values("matches", ascending=False).to_string())


if __name__ == "__main__":
    sys.exit(main())
