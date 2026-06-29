#!/usr/bin/env python3
"""Fetch the official 2026 FIFA World Cup group standings + third-placed ranking
from Wikipedia and write them into data.json as `tables` and `bestThirds`.

These official tables already encode FIFA's deep tiebreakers (head-to-head, card
conduct, world ranking), which we cannot recompute from scores alone. The browser
uses them directly for group tables, qualifiers, and Phase-1 points.

Only `tables`, `bestThirds`, and `meta.lastUpdated` are written. `results`,
`players`, and `previousRanks` are left untouched (run snapshot-ranks.mjs first
for movement arrows). Exits non-zero on any unmapped team or validation failure.

Usage:  python3 scripts/fetch-official.py
Deps:   pandas, lxml   (pip install pandas lxml)
"""
import json, re, sys, io, urllib.request, datetime

URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup"

ALIAS = {
 'mexico':'MEX','south korea':'KOR','korea republic':'KOR','czech republic':'CZE','czechia':'CZE','south africa':'RSA',
 'switzerland':'SUI','canada':'CAN','qatar':'QAT','bosnia and herzegovina':'BIH','bosnia & herzegovina':'BIH',
 'brazil':'BRA','morocco':'MAR','scotland':'SCO','haiti':'HAI',
 'united states':'USA','turkey':'TUR','türkiye':'TUR','australia':'AUS','paraguay':'PAR',
 'germany':'GER','ecuador':'ECU','ivory coast':'CIV',"côte d'ivoire":'CIV',"cote d'ivoire":'CIV','curaçao':'CUW','curacao':'CUW',
 'netherlands':'NED','japan':'JPN','sweden':'SWE','tunisia':'TUN',
 'belgium':'BEL','iran':'IRN','ir iran':'IRN','egypt':'EGY','new zealand':'NZL',
 'spain':'ESP','uruguay':'URU','saudi arabia':'KSA','cape verde':'CPV','cabo verde':'CPV',
 'france':'FRA','senegal':'SEN','norway':'NOR','iraq':'IRQ',
 'argentina':'ARG','austria':'AUT','algeria':'ALG','jordan':'JOR',
 'portugal':'POR','colombia':'COL','dr congo':'COD','democratic republic of the congo':'COD','congo dr':'COD','uzbekistan':'UZB',
 'england':'ENG','croatia':'CRO','panama':'PAN','ghana':'GHA',
}

def code(name):
    n = re.sub(r'\(.*?\)', '', str(name))   # drop (H) host marker
    n = re.sub(r'\[.*?\]', '', n)           # drop footnotes
    n = n.strip().lower()
    if n not in ALIAS:
        sys.exit(f"UNMAPPED TEAM NAME: {name!r} — add it to ALIAS in fetch-official.py")
    return ALIAS[n]

def code_or_none(name):
    n = re.sub(r'\(.*?\)', '', str(name))
    n = re.sub(r'\[.*?\]', '', n).strip().lower()
    return ALIAS.get(n)

def num(x):
    s = str(x).replace('−', '-').replace('+', '')
    m = re.search(r'-?\d+', s)
    return int(m.group()) if m else 0

def extract_matches(html, groups):
    """Parse the schema.org football boxes into group-stage matches. Keeps only
    matches where both teams map to the same group (skips knockout placeholders)."""
    from lxml import html as LH
    grp_of = {t[0]: L for L in 'ABCDEFGHIJKL' for t in groups[L]}
    doc = LH.document_fromstring(html)
    out = []
    for b in doc.xpath('//*[contains(@class,"footballbox")]'):
        def cell(c):
            e = b.xpath(f'.//*[contains(@class,"{c}")]')
            return re.sub(r'\s+', ' ', e[0].text_content()).strip() if e else ''
        h, a = code_or_none(cell('fhome')), code_or_none(cell('faway'))
        if not h or not a or grp_of.get(h) != grp_of.get(a):
            continue
        iso = re.search(r'\d{4}-\d{2}-\d{2}', b.text_content())
        sc = re.match(r'\s*(\d+)\s*[–-]\s*(\d+)', cell('fscore'))
        rec = {'g': grp_of[h], 'h': h, 'a': a, 'date': iso.group() if iso else None}
        if sc:
            rec['hs'], rec['as'], rec['done'] = int(sc.group(1)), int(sc.group(2)), True
        else:
            rec['done'] = False
        out.append(rec)
    return out

def main():
    import pandas as pd, warnings
    warnings.filterwarnings('ignore')
    req = urllib.request.Request(URL, headers={'User-Agent': 'angry-men-predictor/1.0 (results updater)'})
    html = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    ts = pd.read_html(io.StringIO(html))

    std, thirds = [], None
    for t in ts:
        flat = ' '.join(str(c) for c in t.columns)
        if 'Pld' in flat and 'Pts' in flat:
            if 'Grp' in flat:
                # The third-placed ranking is the Grp table with a Qualification column.
                # (A later "Final result" Grp table also exists once the tournament progresses.)
                if any('qualif' in str(c).lower() for c in t.columns):
                    thirds = t
            elif len(t) == 4:
                std.append(t)
    if len(std) != 12 or thirds is None:
        sys.exit(f"unexpected tables: {len(std)} group tables, thirds={'yes' if thirds is not None else 'no'}")

    data = json.load(open('data.json', encoding='utf-8'))
    groupset = {L: set(x[0] for x in data['groups'][L]) for L in 'ABCDEFGHIJKL'}

    tables = {}
    for t in std:
        tcol = next(c for c in t.columns if 'Team' in str(c))
        rows = []
        for _, r in t.iterrows():
            rows.append({'code': code(r[tcol]), 'p': num(r['Pld']), 'w': num(r['W']), 'd': num(r['D']),
                         'l': num(r['L']), 'gf': num(r['GF']), 'ga': num(r['GA']), 'gd': num(r['GD']), 'pts': num(r['Pts'])})
        codes = {x['code'] for x in rows}
        L = next((g for g in groupset if groupset[g] == codes), None)
        if L is None:
            sys.exit(f"group standings did not match any known group: {codes}")
        tables[L] = rows

    tcol = next(c for c in thirds.columns if 'Team' in str(c))
    # The 8 best third-placed teams qualify. Use the table's RANK (it's the official
    # ranking, sorted Pos 1..12 — top 8 advance) rather than the 'Qualification' text,
    # which Wikipedia re-words/re-cases over the tournament ("Advance to Knockout stage"
    # -> "Advance to knockout stage" -> ...), which previously broke this parse.
    best = [code(r[tcol]) for _, r in thirds.iterrows()][:8]
    if not (1 <= len(best) <= 8):
        sys.exit(f"unexpected bestThirds count: {len(best)} -> {best}")

    matches = extract_matches(html, data['groups'])
    if len(matches) < 60:
        sys.exit(f"too few group matches parsed ({len(matches)}); aborting to avoid wiping fixtures")

    data['tables'] = {L: tables[L] for L in 'ABCDEFGHIJKL'}
    data['bestThirds'] = best
    data['matches'] = matches
    data['meta']['lastUpdated'] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    json.dump(data, open('data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open('data.json', 'a').write('\n')
    played = sum(1 for m in matches if m.get('done'))
    print(f"OK: 12 tables, {len(best)} best-thirds, {len(matches)} matches ({played} played) -> thirds {best}")

if __name__ == '__main__':
    main()
