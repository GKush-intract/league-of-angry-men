#!/usr/bin/env python3
"""Scrape played knockout match results from the 2026 FIFA World Cup knockout-stage
article and derive Phase-2 scoring inputs into data.json `koResults`:

  r16 = teams that won their Round-of-32 tie (advanced to the Round of 16)
  qf  = teams that won their Round-of-16 tie (advanced to the Quarterfinals)
  q4  = team with the most goals SCORED across R32+R16   (only set once all 24 played)
  q5  = team with the most goals CONCEDED across R32+R16 (only set once all 24 played)

Advancement is derived from match results + the known `bracketR32` draw (no fragile
bracket-column parsing): for each R32 tie we look up the match between its two teams and
take the winner; R16 matchups follow from the R32 winners by region; and so on. Partial
results score partially. Idempotent + safe to run on a schedule.

Usage:  python3 scripts/fetch-knockout-results.py
Deps:   lxml
"""
import json, re, os, sys, urllib.request, importlib.util
from lxml import html as LH

KO_URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage"

# Reuse the team-name -> code ALIAS from the sibling fetch-official.py.
_spec = importlib.util.spec_from_file_location(
    "fetch_official", os.path.join(os.path.dirname(__file__), "fetch-official.py"))
_fo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_fo)
ALIAS = _fo.ALIAS

def code(name):
    n = name.replace("&#39;", "'").replace("&amp;", "&")
    n = re.sub(r"\s+(men's\s+)?national\s+(football|soccer)\s+team$", "", n, flags=re.I)
    return ALIAS.get(n.strip().lower())

def parse_matches(html):
    """Return played knockout matches as {h, a, hs, as, w} (w = winner code, incl. penalties)."""
    doc = LH.document_fromstring(html)
    out = []
    for b in doc.xpath('//*[contains(@class,"footballbox")]'):
        def cell(c):
            e = b.xpath(f'.//*[contains(@class,"{c}")]')
            return re.sub(r'\s+', ' ', e[0].text_content()).strip() if e else ''
        h, a = code(cell('fhome')), code(cell('faway'))
        if not h or not a:
            continue
        m = re.match(r'\s*(\d+)\s*[–-]\s*(\d+)', cell('fscore'))
        if not m:
            continue  # not played yet
        hs, as_ = int(m.group(1)), int(m.group(2))
        rec = {'h': h, 'a': a, 'hs': hs, 'as': as_}
        if hs != as_:
            rec['w'] = h if hs > as_ else a
        else:
            # Draw after normal/extra time -> penalty shootout. Wikipedia shows the
            # shootout score in parentheses, e.g. "1–1 (a.e.t.)" + "(4–3)".
            pm = re.search(r'\(\s*(\d+)\s*[–-]\s*(\d+)\s*\)', b.text_content())
            rec['w'] = (h if int(pm.group(1)) > int(pm.group(2)) else a) if pm else None
        out.append(rec)
    return out

def main():
    data = json.load(open('data.json', encoding='utf-8'))
    bracket = data.get('bracketR32')
    if not bracket or len(bracket) != 16:
        print("no resolved bracketR32 yet — skipping knockout results (run fetch-knockout.py first)")
        return  # exit 0: don't fail the scheduled action before the draw is final

    req = urllib.request.Request(KO_URL, headers={'User-Agent': 'angry-men-predictor/1.0'})
    html = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    by_pair = {frozenset((m['h'], m['a'])): m for m in parse_matches(html)}

    def match(x, y):
        return by_pair.get(frozenset((x, y)))
    def winner(x, y):
        m = match(x, y)
        return m['w'] if m else None

    # R32 winners (advanced to R16), in bracket order.
    r16 = [w for a, b in bracket if (w := winner(a, b))]

    # R16 winners (advanced to QF): region j is winner(tie 2j) vs winner(tie 2j+1).
    qf, r16_played = [], []
    for j in range(8):
        wa, wb = winner(*bracket[2 * j]), winner(*bracket[2 * j + 1])
        if wa and wb:
            r16_played.append((wa, wb))
            if (w := winner(wa, wb)):
                qf.append(w)

    ko = {'r16': r16, 'qf': qf}

    # Q4/Q5 ("most goals scored / conceded across R32 + R16") — only meaningful once all
    # 16 R32 and 8 R16 matches are complete, so don't award them prematurely.
    r16_matches = [match(wa, wb) for wa, wb in r16_played]
    if len(r16) == 16 and len(r16_played) == 8 and all(r16_matches) and len(qf) == 8:
        r32_matches = [match(a, b) for a, b in bracket]
        scored, conceded = {}, {}
        for m in r32_matches + r16_matches:
            scored[m['h']] = scored.get(m['h'], 0) + m['hs']
            conceded[m['h']] = conceded.get(m['h'], 0) + m['as']
            scored[m['a']] = scored.get(m['a'], 0) + m['as']
            conceded[m['a']] = conceded.get(m['a'], 0) + m['hs']
        ko['q4'] = max(scored, key=scored.get)
        ko['q5'] = max(conceded, key=conceded.get)

    data['koResults'] = ko
    json.dump(data, open('data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open('data.json', 'a').write('\n')
    print(f"koResults: {len(r16)} R32 winners, {len(qf)} R16 winners, q4={ko.get('q4')}, q5={ko.get('q5')}")
    print(f"  R32 winners (reached R16): {r16}")

if __name__ == '__main__':
    main()
