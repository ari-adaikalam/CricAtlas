"""Build cricatlas/data/team_colours.csv from the team names in the dataset.

Usage (from the repo root):
    .venv/bin/python cricatlas/tools/team_colours.py

Every team name in matches.csv gets one row. A team with an entry in KNOWN gets the colours written there
(status "verified" for the web-checked VERIFIED table, "unverified": from public branding, values only, to be checked against the public logo by hand).
Any other team gets generated colours (status "generated") so that nothing is ever without a colour.
A hand-checked team keeps its status when the file is rebuilt: set status to "verified" in the CSV and the
script will not overwrite that row.
"""
import colorsys, csv, hashlib, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATCHES = ROOT / "data" / "output" / "matches.csv"
OUT = ROOT / "cricatlas" / "data" / "team_colours.csv"

# primary, secondary, accent (hex). Colour values only, never the logo image.
KNOWN = {
 # International (national team kit and flag colours)
 "India": ("#1E5BC6", "#FF8A1F", "#1FA35A"), "England": ("#1B3A8A", "#C8102E", "#E5E7EB"),
 "Australia": ("#F2C200", "#00693E", "#0B3D2E"), "Sri Lanka": ("#1F3C88", "#F5B800", "#8D153A"),
 "Pakistan": ("#0A7D3E", "#E8F0EA", "#0F4D2B"), "New Zealand": ("#111111", "#C8CCD2", "#FFFFFF"),
 "South Africa": ("#00793D", "#FFB81C", "#DE3831"), "West Indies": ("#7B1E3A", "#F2C200", "#1B1B1B"),
 "Bangladesh": ("#006A4E", "#F42A41", "#FFD34E"), "Zimbabwe": ("#C8102E", "#FFD200", "#006B3F"),
 "Ireland": ("#169B62", "#FF883E", "#FFFFFF"), "United Arab Emirates": ("#00732F", "#CE1126", "#1B1B1B"),
 "Netherlands": ("#F36C21", "#1F3A93", "#FFFFFF"), "Scotland": ("#0A3A82", "#8DB4E8", "#FFFFFF"),
 "Nepal": ("#DC143C", "#003893", "#FFFFFF"), "Oman": ("#C8102E", "#1E8449", "#FFFFFF"),
 "Namibia": ("#003580", "#D21034", "#009543"), "Kenya": ("#BB0000", "#006600", "#111111"),
 "Canada": ("#D52B1E", "#8E1B14", "#FFFFFF"), "Hong Kong": ("#DE2910", "#FFFFFF", "#9E1B0A"),
 "United States of America": ("#1B2A5C", "#B31942", "#FFFFFF"), "Malaysia": ("#FFC72C", "#CC0001", "#010066"),
 "Papua New Guinea": ("#111111", "#CE1126", "#FCD116"), "Uganda": ("#FCDC04", "#D90000", "#111111"),
 "Singapore": ("#ED2939", "#FFFFFF", "#9E1B25"), "Jersey": ("#DF1B27", "#FFFFFF", "#F2C200"),
 "Denmark": ("#C8102E", "#FFFFFF", "#8F0C20"), "Germany": ("#111111", "#DD0000", "#FFCE00"),
 "Italy": ("#009246", "#CE2B37", "#FFFFFF"), "Japan": ("#BC002D", "#FFFFFF", "#7A0019"),
 "Thailand": ("#A51931", "#2D2A4A", "#F4F5F8"), "Nigeria": ("#008751", "#FFFFFF", "#005C37"),
 "Tanzania": ("#1EB53A", "#00A3DD", "#FCD116"), "Botswana": ("#75AADB", "#111111", "#FFFFFF"),
 "Bermuda": ("#C8102E", "#00205B", "#FFFFFF"), "Qatar": ("#8A1538", "#FFFFFF", "#5C0E26"),
 "Kuwait": ("#007A3D", "#CE1126", "#111111"), "Bahrain": ("#CE1126", "#FFFFFF", "#8F0C1B"),
 "Saudi Arabia": ("#006C35", "#FFFFFF", "#004D25"), "Spain": ("#AA151B", "#F1BF00", "#7A0F13"),
 "France": ("#0055A4", "#EF4135", "#FFFFFF"), "Sweden": ("#006AA7", "#FECC00", "#004E7C"),
 "Norway": ("#BA0C2F", "#00205B", "#FFFFFF"), "Austria": ("#ED2939", "#FFFFFF", "#9E1B25"),
 "Malta": ("#CF142B", "#FFFFFF", "#8F0E1E"), "Romania": ("#002B7F", "#FCD116", "#CE1126"),
 "Bulgaria": ("#00966E", "#D62612", "#FFFFFF"), "Hungary": ("#CE2939", "#477050", "#FFFFFF"),
 "Rwanda": ("#00A1DE", "#FAD201", "#20603D"), "Ghana": ("#006B3F", "#FCD116", "#CE1126"),
 "Sierra Leone": ("#1EB53A", "#0072C6", "#FFFFFF"), "Malawi": ("#CE1126", "#111111", "#339E35"),
 "Indonesia": ("#CE1126", "#FFFFFF", "#8F0C1B"), "Cayman Islands": ("#012169", "#C8102E", "#FFFFFF"),
 "Guernsey": ("#C8102E", "#F2C200", "#FFFFFF"), "Gibraltar": ("#DA000C", "#FFFFFF", "#8F0008"),
 "Belgium": ("#111111", "#FDDA24", "#EF3340"), "Portugal": ("#006600", "#FF0000", "#FFE000"),
 "Finland": ("#003580", "#FFFFFF", "#002458"), "Luxembourg": ("#EF3340", "#00A3E0", "#FFFFFF"),
 "Bhutan": ("#FFD520", "#FF4E12", "#111111"),
 # Franchises
 "Mumbai Indians": ("#1C5AA8", "#D4A82F", "#FFFFFF"), "Chennai Super Kings": ("#F9CD05", "#0081C8", "#F26522"),
 "Kolkata Knight Riders": ("#3A225D", "#D4A82F", "#FFFFFF"), "Rajasthan Royals": ("#EA1A85", "#254AA5", "#FFFFFF"),
 "Royal Challengers Bangalore": ("#D1202F", "#1B1B1F", "#D8A93A"), "Royal Challengers Bengaluru": ("#D1202F", "#1B1B1F", "#D8A93A"),
 "Sunrisers Hyderabad": ("#F26522", "#1B1B1B", "#FFFFFF"), "Punjab Kings": ("#ED1B24", "#A7A9AC", "#FFFFFF"),
 "Kings XI Punjab": ("#ED1B24", "#A7A9AC", "#FFFFFF"), "Delhi Capitals": ("#17479E", "#EF1B23", "#FFFFFF"),
 "Delhi Daredevils": ("#C8102E", "#17479E", "#FFFFFF"), "Gujarat Titans": ("#1C2C5B", "#B8975A", "#FFFFFF"),
 "Lucknow Super Giants": ("#00AEEF", "#FF7F00", "#FFFFFF"), "Deccan Chargers": ("#1F4E9E", "#D4A82F", "#FFFFFF"),
 "Perth Scorchers": ("#F26522", "#111111", "#FFFFFF"), "Sydney Sixers": ("#E6007E", "#FFFFFF", "#8F0050"),
 "Melbourne Stars": ("#00A651", "#FFC20E", "#111111"), "Adelaide Strikers": ("#005DAA", "#ED1C24", "#FFFFFF"),
 "Brisbane Heat": ("#F26522", "#00A5A5", "#111111"), "Hobart Hurricanes": ("#5B2C83", "#C9A0DC", "#FFFFFF"),
 "Sydney Thunder": ("#D7DF23", "#111111", "#FFFFFF"), "Melbourne Renegades": ("#E4002B", "#111111", "#FFFFFF"),
 "Peshawar Zalmi": ("#FFD100", "#111111", "#FFFFFF"), "Islamabad United": ("#E4002B", "#111111", "#FFFFFF"),
 "Lahore Qalandars": ("#00A651", "#FFFFFF", "#0B3D2E"), "Karachi Kings": ("#00AEEF", "#1B2A5C", "#FFFFFF"),
 "Quetta Gladiators": ("#6B2C91", "#FFD100", "#FFFFFF"), "Multan Sultans": ("#00A650", "#FFD100", "#111111"),
 "Sunrisers Eastern Cape": ("#F26522", "#1B1B1B", "#FFFFFF"), "Paarl Royals": ("#EA1A85", "#254AA5", "#FFFFFF"),
 "Joburg Super Kings": ("#F9CD05", "#0081C8", "#F26522"), "MI Cape Town": ("#1C5AA8", "#D4A82F", "#FFFFFF"),
 "Pretoria Capitals": ("#17479E", "#EF1B23", "#FFFFFF"), "Durban's Super Giants": ("#00AEEF", "#FF7F00", "#FFFFFF"),
 "MI Emirates": ("#1C5AA8", "#D4A82F", "#FFFFFF"), "MI New York": ("#1C5AA8", "#D4A82F", "#FFFFFF"), "MI London": ("#1C5AA8", "#D4A82F", "#FFFFFF"),
 "Texas Super Kings": ("#F9CD05", "#0081C8", "#F26522"), "Los Angeles Knight Riders": ("#3A225D", "#D4A82F", "#FFFFFF"),
 "Abu Dhabi Knight Riders": ("#3A225D", "#D4A82F", "#FFFFFF"), "Trinbago Knight Riders": ("#3A225D", "#D4A82F", "#FFFFFF"),
 "Washington Freedom": ("#C8102E", "#1B2A5C", "#FFFFFF"), "San Francisco Unicorns": ("#6B2C91", "#F2C200", "#FFFFFF"),
 "Seattle Orcas": ("#00A5A5", "#111111", "#FFFFFF"), "Guyana Amazon Warriors": ("#00A651", "#FFD100", "#111111"),
 "Jamaica Tallawahs": ("#F2C200", "#111111", "#00A651"), "Barbados Royals": ("#EA1A85", "#254AA5", "#FFFFFF"),
 "Desert Vipers": ("#F26522", "#1B1B1B", "#FFFFFF"), "Dubai Capitals": ("#17479E", "#EF1B23", "#FFFFFF"),
 "Gulf Giants": ("#00AEEF", "#FF7F00", "#FFFFFF"), "Sharjah Warriorz": ("#0A7D3E", "#F2C200", "#111111"),
 "Oval Invincibles": ("#1F7A4F", "#F2C200", "#FFFFFF"), "Southern Brave": ("#1B7F8C", "#F2C200", "#FFFFFF"),
 "Trent Rockets": ("#E85D2A", "#1B2A5C", "#FFFFFF"), "Birmingham Phoenix": ("#F26522", "#6B2C91", "#FFFFFF"),
 "London Spirit": ("#1B2A5C", "#C8102E", "#FFFFFF"), "Welsh Fire": ("#B71C1C", "#111111", "#FFFFFF"),
 "Manchester Originals": ("#C2185B", "#111111", "#FFFFFF"), "Northern Superchargers": ("#1E6FD0", "#F2C200", "#FFFFFF"),
 "Gujarat Giants": ("#E85D2A", "#FFD100", "#111111"), "UP Warriorz": ("#6B2C91", "#F2C200", "#FFFFFF"),
 "St Kitts and Nevis Patriots": ("#C8102E", "#111111", "#FFD100"), "Rangpur Riders": ("#D62828", "#1B1B1B", "#FFFFFF"),
 "Comilla Victorians": ("#0A7D3E", "#F2C200", "#FFFFFF"), "Barbados Tridents": ("#00205B", "#F2C200", "#FFFFFF"),
 "St Lucia Kings": ("#F2C200", "#1B2A5C", "#FFFFFF"), "St Lucia Zouks": ("#F2C200", "#1B2A5C", "#FFFFFF"),
 "Khulna Tigers": ("#F2C200", "#111111", "#FFFFFF"), "Dhaka Dynamites": ("#C8102E", "#111111", "#FFFFFF"),
 "Fortune Barishal": ("#C8102E", "#F2C200", "#FFFFFF"), "Chattogram Challengers": ("#1B2A5C", "#C8102E", "#FFFFFF"),
 "Jaffna Kings": ("#F2C200", "#1B2A5C", "#FFFFFF"), "Colombo Strikers": ("#6B2C91", "#F2C200", "#FFFFFF"),
 "Kandy Falcons": ("#1B2A5C", "#C8102E", "#FFFFFF"), "Galle Titans": ("#00AEEF", "#1B2A5C", "#FFFFFF"),
 "Dambulla Aura": ("#0A7D3E", "#F2C200", "#FFFFFF"),
}

# Checked on the web on 2026-10-17: colour names confirmed on Wikipedia and/or teamcolorcodes.com, hex from the
# source where it gave one. A hex marked (est) is my pick for a colour the source named but gave no value for.
TCC = "teamcolorcodes.com and Wikipedia, 2026-10-17"
WIKI = "Wikipedia infobox colour names, 2026-10-17 (hex estimated)"
VERIFIED = {
 "Chennai Super Kings": ("#FFF100", "#2B5DA8", "#E9530D", TCC),
 "Royal Challengers Bangalore": ("#CC1213", "#2B2A29", "#D8A93A", TCC + ", gold hex (est)"),
 "Royal Challengers Bengaluru": ("#CC1213", "#2B2A29", "#D8A93A", TCC + ", gold hex (est)"),
 "Mumbai Indians": ("#004B8D", "#FFD141", "#E1261C", TCC),
 "Gujarat Titans": ("#1B2133", "#DBBE6E", "#FFFFFF", TCC),
 "Delhi Capitals": ("#2561AE", "#D71921", "#FAAD1B", TCC),
 "Sunrisers Hyderabad": ("#EE7429", "#221F21", "#FCCB11", TCC),
 "Kolkata Knight Riders": ("#3A225D", "#F7D54E", "#FFFFFF", TCC),
 "Punjab Kings": ("#DD1F2D", "#F2D1A0", "#4960B6", TCC),
 "Kings XI Punjab": ("#DD1F2D", "#F2D1A0", "#4960B6", TCC),
 "Lucknow Super Giants": ("#0057E2", "#F28B00", "#FECC00", TCC),
 "Rajasthan Royals": ("#EA1A85", "#074EA2", "#C3A11F", TCC + ", pink from Wikipedia"),
 "Sydney Sixers": ("#EC2A90", "#111111", "#FFFFFF", TCC),
 "Sydney Thunder": ("#97D700", "#111111", "#FFF668", TCC),
 "Perth Scorchers": ("#CC5A1E", "#FFE900", "#403529", TCC),
 "Brisbane Heat": ("#27A6B0", "#111111", "#FFFFFF", TCC),
 "Hobart Hurricanes": ("#5B2C83", "#C9A0DC", "#FFFFFF", WIKI + ", purple"),
 "Quetta Gladiators": ("#6B2C91", "#D4A82F", "#FFFFFF", WIKI + ", purple and gold"),
 "Peshawar Zalmi": ("#FFD100", "#111111", "#0D2D4E", WIKI + ", yellow, black and blue"),
 "Karachi Kings": ("#1B4F9C", "#D4A82F", "#FFFFFF", WIKI + ", blue and gold"),
 "Islamabad United": ("#E4002B", "#F26522", "#D4A82F", WIKI + ", red and orange"),
 "Trinbago Knight Riders": ("#C8102E", "#111111", "#D4A82F", WIKI + ", red black purple gold"),
 "Jamaica Tallawahs": ("#0A7D3E", "#F2C200", "#111111", WIKI + ", green black gold"),
 "St Lucia Kings": ("#F2C200", "#1B2A5C", "#111111", WIKI + ", blue yellow black white"),
 "Saint Lucia Kings": ("#F2C200", "#1B2A5C", "#111111", WIKI + ", blue yellow black white"),
 "Sunrisers Eastern Cape": ("#EE7429", "#221F21", "#FFFFFF", WIKI + ", orange"),
 "Pretoria Capitals": ("#2561AE", "#D71921", "#FFFFFF", WIKI + ", blue and red"),
 "MI Cape Town": ("#004B8D", "#FFD141", "#FFFFFF", WIKI + ", blue and gold"),
 "MI Emirates": ("#004B8D", "#FFD141", "#FFFFFF", WIKI + ", blue and gold"),
 "Desert Vipers": ("#C8102E", "#111111", "#FFFFFF", WIKI + ", red and black"),
 "London Spirit": ("#1B2A5C", "#111111", "#FFFFFF", WIKI + ", dark blue and black"),
 "Washington Freedom": ("#C8102E", "#1B2A5C", "#FFFFFF", WIKI + ", red white blue"),
 "Los Angeles Knight Riders": ("#3A225D", "#F7D54E", "#FFFFFF", WIKI + ", purple and gold"),
}

# Colours read from jersey photos (image search, 2026-10-17) in data/jersey_picks.csv. Wins over VERIFIED and KNOWN.
def jersey_picks():
    f = ROOT / "cricatlas" / "data" / "jersey_picks.csv"
    if not f.exists():
        return {}
    with f.open() as fh:
        return {r["team"]: (r["c1"], r["c2"], r["c3"], "jersey photos and Google Images: " + r["note"]) for r in csv.DictReader(fh)}


ALIASES = {"Rising Pune Supergiants": "Rising Pune Supergiant", "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
           "Kings XI Punjab": "Punjab Kings", "Sharjah Warriors": "Sharjah Warriorz", "MI London": "MI London",
           "Sunrisers Leeds": "Sunrisers Leeds", "Jamaica Kingsmen": "Jamaica Tallawahs"}


def generated(name):
    h = hashlib.sha256(name.encode()).digest()
    hue = h[0] / 255
    r, g, b = colorsys.hls_to_rgb(hue, 0.45, 0.62)
    r2, g2, b2 = colorsys.hls_to_rgb((hue + 0.5) % 1, 0.5, 0.55)
    hx = lambda c: "#%02X%02X%02X" % tuple(round(x * 255) for x in c)
    return hx((r, g, b)), hx((r2, g2, b2)), "#FFFFFF"


def short(name):
    parts = [p for p in name.replace("&", " ").replace("'", "").split() if p]
    if len(parts) >= 3:
        return "".join(p[0] for p in parts[:3]).upper()
    if len(parts) == 2:
        return (parts[0][:2] + parts[1][0]).upper()
    return name[:3].upper()


def main():
    import pandas as pd
    m = pd.read_csv(MATCHES, usecols=["team_1", "team_2", "type", "gender"], low_memory=False)
    t = pd.concat([m[["team_1", "type", "gender"]].rename(columns={"team_1": "t"}), m[["team_2", "type", "gender"]].rename(columns={"team_2": "t"})])
    kinds = t.groupby("t").type.agg(lambda s: "national" if (s == "Intl").any() else "franchise")
    counts = t.groupby("t").size()
    old = {}
    if OUT.exists():
        with OUT.open() as f:
            old = {r["team"]: r for r in csv.DictReader(f)}
    JERSEY = jersey_picks()
    rows = []
    for name in sorted(kinds.index):
        if name in old and old[name]["status"] == "verified":
            rows.append(old[name]); continue
        key = ALIASES.get(name, name)
        if key in JERSEY:
            c1, c2, c3, source = JERSEY[key]
            status = "unverified" if ("unclear" in source or "flag" in source or "low confidence" in source) else "verified"
        elif key in VERIFIED:
            c1, c2, c3, source = VERIFIED[key]; status = "verified"
        elif key in KNOWN:
            c1, c2, c3 = KNOWN[key]; status = "unverified"; source = "public branding, colour values only"
        else:
            c1, c2, c3 = generated(name); status = "generated"; source = "generated from the name, replace with the public colours"
        rows.append({"team": name, "short": short(name), "kind": kinds[name], "matches": int(counts[name]), "c1": c1, "c2": c2, "c3": c3, "status": status, "source": source})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["team", "short", "kind", "matches", "c1", "c2", "c3", "status", "source"])
        w.writeheader(); w.writerows(rows)
    by = {}
    for r in rows:
        by[r["status"]] = by.get(r["status"], 0) + 1
    print(len(rows), "teams", by, "->", OUT)


if __name__ == "__main__":
    sys.exit(main())
