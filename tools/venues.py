"""Venue to country, continent and ground, for the Full stats splits (In host country, In continent, Home or away, Ground).

Usage, from the CricAtlas repo root:   ../.venv/bin/python tools/venues.py [--check]

Cricsheet gives a venue name and, for most matches, a city. It gives no country. This file maps each city to a country by hand (CITY), overrides the venues whose city is
ambiguous or missing (VENUE), and writes data/venues.csv: venue, city, country, continent, how, ground. A row is a venue name as the data spells it with the city the data gives for it, because one name can be two grounds (National Stadium in Karachi and in Hamilton). `ground` is the one name every spelling of a ground is shown under. Every venue in matches.parquet must come out with a country, so a refresh that brings a new venue fails
here until a line is added. Every hand mapping is a row of how = 'city' or 'venue' and can be read in the file.

Country names are the names a team goes by where one exists (England, Scotland, Wales, Northern Ireland, Ireland, West Indies islands as their own countries). HOME says which venue countries
count as a team's home (West Indies: its islands, England: England and Wales, Ireland: Ireland and Northern Ireland).
"""
import argparse, csv, sys
from collections import Counter
from pathlib import Path
import duckdb

HERE = Path(__file__).resolve().parents[1]

CITY = {
 # India
 'Ahmedabad':'India','Bangalore':'India','Bengaluru':'India','Chandigarh':'India','Chennai':'India','Cuttack':'India','Delhi':'India','Dharamsala':'India','Dharmasala':'India','Faridabad':'India','Guwahati':'India',
 'Gwalior':'India','Hyderabad':'India','Indore':'India','Jaipur':'India','Jamshedpur':'India','Kanpur':'India','Kochi':'India','Kolkata':'India','Lucknow':'India','Margao':'India','Mohali':'India','Mumbai':'India',
 'Nagpur':'India','Navi Mumbai':'India','New Chandigarh':'India','Pune':'India','Raipur':'India','Rajkot':'India','Ranchi':'India','Surat':'India','Thiruvananthapuram':'India','Vadodara':'India','Visakhapatnam':'India',
 # Pakistan
 'Faisalabad':'Pakistan','Karachi':'Pakistan','Lahore':'Pakistan','Multan':'Pakistan','Peshawar':'Pakistan','Rawalpindi':'Pakistan','Sind':'Pakistan',
 # Bangladesh
 'Bogra':'Bangladesh','Chattogram':'Bangladesh','Chittagong':'Bangladesh',"Cox's Bazar":'Bangladesh','Dhaka':'Bangladesh','Fatullah':'Bangladesh','Khulna':'Bangladesh','Mirpur':'Bangladesh','Rajshahi':'Bangladesh','Sylhet':'Bangladesh',
 # Sri Lanka
 'Colombo':'Sri Lanka','Dambulla':'Sri Lanka','Galle':'Sri Lanka','Hambantota':'Sri Lanka','Kandy':'Sri Lanka','Katunayake':'Sri Lanka','Kurunegala':'Sri Lanka','Pallekele':'Sri Lanka','FTZ Sports Complex':'Sri Lanka',
 # Nepal, Bhutan, Maldives area
 'Kathmandu':'Nepal','Kirtipur':'Nepal','Pokhara':'Nepal','Gelephu':'Bhutan',
 # Australia
 'Adelaide':'Australia','Albury':'Australia','Alice Springs':'Australia','Ballarat':'Australia','Bendigo':'Australia','Bowral':'Australia','Brisbane':'Australia','Burnie':'Australia','Cairns':'Australia',
 'Canberra':'Australia','Carrara':'Australia','Coffs Harbour':'Australia','Darwin':'Australia','Geelong':'Australia','Gold Coast':'Australia','Hobart':'Australia','Latrobe':'Australia','Launceston':'Australia',
 'Mackay':'Australia','Melbourne':'Australia','Moe':'Australia','Nuriootpa':'Australia','Perth':'Australia','Sydney':'Australia','Townsville':'Australia','Victoria':'Australia','Wollongong':'Australia',
 # New Zealand
 'Auckland':'New Zealand','Christchurch':'New Zealand','Dunedin':'New Zealand','Hamilton':'New Zealand','Lincoln':'New Zealand','Mount Maunganui':'New Zealand','Napier':'New Zealand','Nelson':'New Zealand',
 'New Plymouth':'New Zealand','Queenstown':'New Zealand','Wellington':'New Zealand','Whangarei':'New Zealand',
 # England, Wales, Scotland, Ireland
 'Birmingham':'England','Brighton':'England','Bristol':'England','Canterbury':'England','Chelmsford':'England','Chester-le-Street':'England','Derby':'England','Hove':'England','Leeds':'England','Leicester':'England',
 'London':'England','Loughborough':'England','Manchester':'England','Northampton':'England','Nottingham':'England','Scarborough':'England','Southampton':'England','Taunton':'England','Worcester':'England','Wormsley':'England',
 'Cardiff':'Wales','Aberdeen':'Scotland','Arbroath':'Scotland','Ayr':'Scotland','Dundee':'Scotland','Edinburgh':'Scotland','Glasgow':'Scotland','Stirling':'Scotland',
 'Dublin':'Ireland','Belfast':'Northern Ireland','Bready':'Northern Ireland','Derry':'Northern Ireland','Londonderry':'Northern Ireland',
 # South Africa and neighbours
 'Benoni':'South Africa','Bloemfontein':'South Africa','Cape Town':'South Africa','Centurion':'South Africa','Durban':'South Africa','East London':'South Africa','Gqeberha':'South Africa','Johannesburg':'South Africa',
 'Kimberley':'South Africa','Paarl':'South Africa','Pietermaritzburg':'South Africa','Port Elizabeth':'South Africa','Potchefstroom':'South Africa','Pretoria':'South Africa',
 'Bulawayo':'Zimbabwe','Harare':'Zimbabwe','Windhoek':'Namibia','Gaborone':'Botswana','Malkerns':'Eswatini','Blantyre':'Malawi',
 # East and West Africa
 'Nairobi':'Kenya','Kampala':'Uganda','Entebbe':'Uganda','Jinja':'Uganda','Kigali City':'Rwanda','Dar-es-Salaam':'Tanzania','Lagos':'Nigeria','Abuja':'Nigeria','Accra':'Ghana',
 # West Indies, each island on its own
 'Antigua':'Antigua and Barbuda','Coolidge':'Antigua and Barbuda','North Sound':'Antigua and Barbuda',"St John's":'Antigua and Barbuda','Barbados':'Barbados','Bridgetown':'Barbados','Cave Hill':'Barbados',
 'St Clement':'Jersey','St Saviour':'Jersey','Dominica':'Dominica','Roseau':'Dominica','Grenada':'Grenada',"St George's":'Grenada','Guyana':'Guyana','Providence':'Guyana','Jamaica':'Jamaica','Kingston':'Jamaica',
 'Basseterre':'Saint Kitts and Nevis','St Kitts':'Saint Kitts and Nevis','Gros Islet':'Saint Lucia','St Lucia':'Saint Lucia','Kingstown':'Saint Vincent and the Grenadines','St Vincent':'Saint Vincent and the Grenadines',
 'Port of Spain':'Trinidad and Tobago','Tarouba':'Trinidad and Tobago','Trinidad':'Trinidad and Tobago',
 # Americas
 'Dallas':'United States of America','Grand Prairie':'United States of America','Houston':'United States of America','Pearland':'United States of America','Morrisville':'United States of America',
 'Lauderhill':'United States of America','Los Angeles':'United States of America','Pomona':'United States of America','Oakland':'United States of America','New York':'United States of America',
 'Toronto':'Canada','King City':'Canada','Waterloo':'Belgium','George Town':'Cayman Islands','Panama City':'Panama','Bogota':'Colombia','Buenos Aires':'Argentina','Mexico City':'Mexico','Naucalpan':'Mexico',
 'Minas Gerias':'Brazil','Seropedica':'Brazil','Guacima':'Costa Rica',
 # Gulf
 'Abu Dhabi':'United Arab Emirates','Ajman':'United Arab Emirates','Dubai':'United Arab Emirates','Sharjah':'United Arab Emirates','Al Amarat':'Oman','Doha':'Qatar',
 # Asia others
 'Bali':'Indonesia','Bangi':'Malaysia','Johor':'Malaysia','Kuala Lumpur':'Malaysia','Mantin':'Malaysia','Bangkok':'Thailand','Chiang Mai':'Thailand','Singapore':'Singapore','Hong Kong':'Hong Kong',
 'Mong Kok':'Hong Kong','Wong Nai Chung Gap':'Hong Kong','Hangzhou':'China','Incheon':'South Korea','Osaka':'Japan','Nisshin':'Japan','Sano':'Japan','Phnom Penh':'Cambodia',
 # Europe
 'Amstelveen':'Netherlands','Deventer':'Netherlands','Rotterdam':'Netherlands','Schiedam':'Netherlands','The Hague':'Netherlands','Utrecht':'Netherlands','Ghent':'Belgium','Zemst':'Belgium',
 'Albergaria':'Portugal','Almeria':'Spain','Murcia':'Spain','Barcelona':'Spain','Belgrade':'Serbia','Brondby':'Denmark','Copenhagen':'Denmark','Ishoj':'Denmark','Koge':'Denmark','Corfu':'Greece',
 'Dreux':'France','Episkopi':'Cyprus','Gelsenkirchen':'Germany','Karlsruhe':'Germany','Krefeld':'Germany','Gibraltar':'Gibraltar','Graz':'Austria','Latschach':'Austria','Lower Austria':'Austria',
 'Ilfov County':'Romania','Kerava':'Finland','Vantaa':'Finland','Kolsva':'Sweden','Stockholm':'Sweden','Marsa':'Malta','Oslo':'Norway','Prague':'Czech Republic','Rome':'Italy','Spinaceto':'Italy',
 'Sofia':'Bulgaria','Szodliget':'Hungary','Tallinn':'Estonia','Walferdange':'Luxembourg','Zagreb':'Croatia','Castel':'Guernsey','Port  Soif':'Guernsey','St Peter Port':'Guernsey','Brussels':'Belgium',
 # Oceania
 'Apia':'Samoa','Noumea':'New Caledonia','Port Moresby':'Papua New Guinea','Port Vila':'Vanuatu','Suva':'Fiji',
}

# Venues the city cannot settle: no city, a city that two countries share, or a name that the city would put in the wrong place.
VENUE = {
 'Chittagong Divisional Stadium':'Bangladesh','Queenstown Events Centre':'New Zealand','Mombasa Sports Club Ground':'Kenya','Colombo Cricket Club Ground':'Sri Lanka','Guanggong International Cricket Stadium':'China',
 'Moara Vlasiei Cricket Ground':'Romania','St Georges Quilmes':'Argentina','Stellenbosch University 1':'South Africa','Stellenbosch University 2':'South Africa','San Albano':'Italy',
 'Dubai Sports City Cricket Stadium':'United Arab Emirates','Tafawa Balewa Square (TBS) Cricket Oval':'Nigeria','Louth Cricket Club':'Ireland','Adelaide Oval No. 2':'Australia','Sheikhupura Stadium':'Pakistan',
 'Arundel Castle Cricket Club Ground':'England',
 'White Hill Field, Sandys Parish':'Bermuda','National Stadium, Hamilton':'Bermuda','Bermuda National Stadium':'Bermuda','Westpac Park, Hamilton':'New Zealand',
 'Royal Brussels Cricket Club Ground, Waterloo':'Belgium','Providence Stadium':'Guyana','Providence Stadium, Guyana':'Guyana','Coolidge Cricket Ground':'Antigua and Barbuda','Coolidge Cricket Ground, Antigua':'Antigua and Barbuda',
 'Ted Summerton Reserve':'Australia','Ted Summerton Reserve, Moe':'Australia','Simonds Stadium, South Geelong':'Australia','Niaz Stadium, Hyderabad':'Pakistan','Maple Leaf North-West Ground':'Canada',
 'Maple Leaf North-West Ground, King City':'Canada','Maple Leaf North-East Ground, King City':'Canada','Toronto Cricket, Skating and Curling Club':'Canada','Jimmy Powell Oval, Cayman Islands':'Cayman Islands',
 'Bert Sutcliffe Oval':'New Zealand','King George V Sports Ground, Castel':'Guernsey','King George V Sports Ground':'Guernsey','Guernsey Rovers Athletic Club Ground, Port Soif':'Guernsey',
}

CONTINENT = {
 'Asia':['India','Pakistan','Bangladesh','Sri Lanka','Nepal','Bhutan','Afghanistan','United Arab Emirates','Oman','Qatar','Malaysia','Indonesia','Thailand','Singapore','Hong Kong','China','South Korea','Japan','Cambodia','Saudi Arabia','Kuwait','Bahrain','Maldives'],
 'Oceania':['Australia','New Zealand','Samoa','New Caledonia','Papua New Guinea','Vanuatu','Fiji'],
 'Europe':['England','Wales','Scotland','Ireland','Northern Ireland','Netherlands','Belgium','Portugal','Spain','Serbia','Denmark','Greece','France','Cyprus','Germany','Gibraltar','Austria','Romania','Finland','Sweden','Malta','Norway','Czech Republic','Italy','Bulgaria','Hungary','Estonia','Luxembourg','Croatia','Guernsey','Jersey'],
 'Africa':['South Africa','Zimbabwe','Namibia','Botswana','Eswatini','Malawi','Kenya','Uganda','Rwanda','Tanzania','Nigeria','Ghana'],
 'Americas':['Antigua and Barbuda','Barbados','Dominica','Grenada','Guyana','Jamaica','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Trinidad and Tobago','United States of America','Canada','Cayman Islands','Panama','Colombia','Argentina','Mexico','Brazil','Bermuda','Costa Rica'],
}
COUNTRY_CONTINENT = {c: k for k, v in CONTINENT.items() for c in v}

# The venue countries that are a team's home (a team named for a country is at home in that country). The rest follow the team name.
# Where one name is two grounds, the city the data gives decides: National Stadium is in Karachi (66 matches) and in Hamilton, Bermuda (2).
VENUE_CITY = {('National Stadium', 'Hamilton'): 'Bermuda'}

# Names a city goes by in the data, and names that stand for the same place (a stadium named after its island or its suburb). Used to tell whether two spellings are one ground.
PLACE_ALIAS = {
 'bangalore': 'bengaluru', 'chittagong': 'chattogram', 'port elizabeth': 'gqeberha', 'navi mumbai': 'mumbai', 'dharmasala': 'dharamsala', 'bridgetown': 'barbados', 'providence': 'guyana',
 'north sound': 'antigua', 'kingston': 'jamaica', 'tarouba': 'trinidad', 'port of spain': 'trinidad', 'gros islet': 'st lucia', 'basseterre': 'st kitts', 'mong kok': 'hong kong',
 'chandigarh': 'mohali', 'uppal': 'hyderabad', 'mirpur': 'dhaka', 'pallekele': 'kandy', 'st georges': 'grenada',
}
# Grounds renamed by their owners or sponsors: the old name is shown under the new one (Ari approved each, 2026-10-19). Keyed by country and the ground name before the merge.
RENAMED = {
 ('India', 'Feroz Shah Kotla'): 'Arun Jaitley Stadium', ('India', 'Sardar Patel Stadium'): 'Narendra Modi Stadium', ('India', 'Sardar Patel (Gujarat) Stadium'): 'Narendra Modi Stadium',
 ('New Zealand', 'Westpac Stadium'): 'Sky Stadium', ('New Zealand', 'Jade Stadium'): 'AMI Stadium', ('South Africa', 'Boland Bank Park'): 'Boland Park',
 ('India', 'Subrata Roy Sahara Stadium'): 'Maharashtra Cricket Association Stadium', ('India', 'Punjab Cricket Association Stadium'): 'Punjab Cricket Association IS Bindra Stadium',
 ('Saint Lucia', 'Beausejour Stadium'): 'Daren Sammy National Cricket Stadium', ('Saint Lucia', 'Darren Sammy National Cricket Stadium'): 'Daren Sammy National Cricket Stadium',
 ('England', 'County Ground, Taunton'): 'The Cooper Associates County Ground', ('Australia', 'Aurora Stadium'): 'University of Tasmania Stadium',
 ('United Arab Emirates', 'Sharjah Cricket Association Stadium'): 'Sharjah Cricket Stadium', ('Malaysia', 'Kinrara Academy Oval'): 'Bayuemas Oval', ('Malaysia', 'UKM-YSD Cricket Oval'): 'YSD-UKM Cricket Oval',
 ('Bangladesh', 'Chittagong Divisional Stadium'): 'Zahur Ahmed Chowdhury Stadium', ('Bangladesh', 'Sylhet Stadium'): 'Sylhet International Cricket Stadium', ('South Africa', 'Goodyear Park'): 'Mangaung Oval',
 ('Rwanda', 'Gahanga International Cricket Stadium Rwanda'): 'Gahanga International Cricket Stadium', ('United Arab Emirates', 'Dubai Sports City Cricket Stadium'): 'Dubai International Cricket Stadium',
 ('South Africa', 'New Wanderers Stadium'): 'The Wanderers Stadium', ('South Africa', 'Wanderers'): 'The Wanderers Stadium', ('United Arab Emirates', 'Zayed Cricket Stadium'): 'Sheikh Zayed Stadium',
 ('India', 'Niranjan Shah Stadium'): 'Saurashtra Cricket Association Stadium',
}
PLACE_SHOWN = {'bengaluru': 'Bengaluru', 'chattogram': 'Chattogram', 'gqeberha': 'Gqeberha', 'mumbai': 'Mumbai', 'mohali': 'Mohali', 'dhaka': 'Dhaka'}


def norm(text: str) -> str:
    text = text.lower().replace('.', ' ').replace("'", '').replace('\u2019', '').replace('&', 'and')
    return ' '.join(text.split())


def place(text: str) -> str:
    n = norm(text)
    return PLACE_ALIAS.get(n, n)


def grounds(rows):
    """rows: (venue, city, country, n). Returns {(venue, city): ground name}.

    Two spellings are one ground when they have the same country, the same name before the first comma (punctuation and case ignored) and the same place. The place is the last part of
    the name that is a known city, else the city the data gives. A name used by several grounds (County Ground, National Stadium) is shown with its place."""
    known = {norm(c) for c in CITY} | set(PLACE_ALIAS)
    cluster: dict[tuple, list] = {}
    for venue, city, country, n in rows:
        parts = [p.strip() for p in venue.split(',')]
        base = norm(parts[0])
        # "Academy Ground" is a second ground at the same stadium, not another spelling of the stadium.
        if any(norm(p) == 'academy ground' for p in parts[1:]):
            base += ' academy ground'
        explicit = [norm(p) for p in parts[1:] if norm(p) in known]
        key = (country, base, place(explicit[-1]) if explicit else place(city or ''))
        cluster.setdefault(key, []).append((venue, city, parts[0].strip() + (', Academy Ground' if 'academy ground' in base[-15:] else ''), n))
    # A spelling with no place at all (a name ending in a bare comma, no city in the data) joins the one other place its name has in that country.
    for (country, base, where) in [k for k in cluster if not k[2]]:
        others = [k for k in cluster if k[0] == country and k[1] == base and k[2]]
        if len(others) == 1:
            cluster[others[0]].extend(cluster.pop((country, base, where)))
    many: dict[str, int] = {}
    for country, base, _ in cluster:
        many[base] = many.get(base, 0) + 1
    out = {}
    for (country, base, where), members in cluster.items():
        spelled = Counter()
        cities = Counter()
        for venue, city, first, n in members:
            spelled[first.replace('.', '. ').replace('.  ', '. ').replace('. ', ' ').strip()] += n
            cities[place(city or '')] += n
        name = spelled.most_common(1)[0][0]
        if many[base] > 1:
            shown = where or cities.most_common(1)[0][0]
            name = f"{name}, {PLACE_SHOWN.get(shown, shown.title())}"
        name = RENAMED.get((country, name), name)
        for venue, city, _, _ in members:
            out[(venue, city)] = name
    return out


HOME = {
 'West Indies': {'Antigua and Barbuda','Barbados','Dominica','Grenada','Guyana','Jamaica','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Trinidad and Tobago'},
 'England': {'England', 'Wales'}, 'Ireland': {'Ireland', 'Northern Ireland'}, 'Scotland': {'Scotland'},
}


def build(export: Path):
    con = duckdb.connect()
    m = f"read_parquet('{export / 'matches.parquet'}')"
    # The export keeps the name the data spells in venue_raw once the ground names are applied.
    col = 'venue_raw' if 'venue_raw' in [r[0] for r in con.execute(f"describe select * from {m}").fetchall()] else 'venue'
    rows = con.execute(f"select {col}, coalesce(nullif(trim(city), ''), '') city, count(*) from {m} where {col} is not null group by 1, 2").fetchall()
    out, problems, counted = [], [], []
    # A match with no city takes the country of the same venue name in the matches that have one.
    seen: dict[str, Counter] = {}
    for venue, city, n in rows:
        if city in CITY and (venue, city) not in VENUE_CITY:
            seen.setdefault(venue, Counter())[CITY[city]] += n
    for venue, city, n in sorted(rows):
        if (venue, city) in VENUE_CITY:
            country, how = VENUE_CITY[(venue, city)], 'venue and city'
        elif venue in VENUE:
            country, how = VENUE[venue], 'venue'
        elif city in CITY:
            country, how = CITY[city], 'city'
        elif venue in seen:
            country, how = seen[venue].most_common(1)[0][0], 'city of the same venue'
        else:
            problems.append((venue, city, 'no city is mapped'))
            continue
        if country not in COUNTRY_CONTINENT:
            problems.append((venue, city, f'no continent for {country}'))
            continue
        out.append([venue, city, country, COUNTRY_CONTINENT[country], how])
        counted.append((venue, city, country, n))
    names = grounds(counted)
    for row in out:
        row.append(names[(row[0], row[1])])
    return out, problems


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--export', default=str(HERE / 'data' / 'export'))
    ap.add_argument('--out', default=str(HERE / 'data' / 'venues.csv'))
    a = ap.parse_args()
    out, problems = build(Path(a.export))
    for p in problems:
        print('PROBLEM', p)
    with open(a.out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['venue', 'city', 'country', 'continent', 'how', 'ground']); w.writerows(out)
    print(f'{len(out)} venues written to {a.out}, {len(problems)} problems')
    sys.exit(1 if problems else 0)
