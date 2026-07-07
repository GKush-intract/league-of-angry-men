#!/usr/bin/env python3
"""Scrape the 2026 FIFA World Cup knockout-stage article and write two things to data.json:

  koResults  — Phase-2 scoring inputs:
                 r16 = teams that won their R32 tie (reached R16)
                 qf  = teams that won their R16 tie (reached QF)
                 q4/q5 = most goals scored/conceded across R32+R16 (only once all 24 played)
  koMatches  — per-match fixtures for the Matches→Knockout view: home/away codes, IST
                 kickoff date+time, and score/winner when played.

Advancement is derived from match results + the known `bracketR32` (no fragile bracket
parsing). Partial results score partially. Idempotent + safe to run on a schedule.

Usage:  python3 scripts/fetch-knockout-results.py
Deps:   lxml
"""
import json, re, os, sys, datetime, urllib.request, importlib.util
from lxml import html as LH

KO_URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage"
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

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

def to_ist(date_iso, time_str):
    """(local match date + 'h:mm a.m./p.m. UTC±N') -> (IST date 'YYYY-MM-DD', IST 'h:mm AM/PM').
    Falls back to (date_iso, '') if the time can't be parsed."""
    if not date_iso:
        return (None, '')
    s = (time_str or '').replace('−', '-').replace('−', '-')
    m = re.search(r'(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?.*?UTC\s*([+-]\d{1,2})', s, re.I)
    if not m:
        return (date_iso, '')
    hh, mm, ap, off = int(m.group(1)), int(m.group(2)), m.group(3).lower(), int(m.group(4))
    if ap == 'p' and hh != 12: hh += 12
    if ap == 'a' and hh == 12: hh = 0
    try:
        y, mo, d = map(int, date_iso.split('-'))
        dt = datetime.datetime(y, mo, d, hh, mm,
                               tzinfo=datetime.timezone(datetime.timedelta(hours=off))).astimezone(IST)
        return (dt.strftime('%Y-%m-%d'), dt.strftime('%I:%M %p').lstrip('0'))
    except Exception:
        return (date_iso, '')

def parse_matches(html):
    """All knockout matches with both teams known: {h, a, date, time, done, hs, as, w}."""
    doc = LH.document_fromstring(html)
    out = []
    for b in doc.xpath('//*[contains(@class,"footballbox")]'):
        def cell(c):
            e = b.xpath(f'.//*[contains(@class,"{c}")]')
            return re.sub(r'\s+', ' ', e[0].text_content()).strip() if e else ''
        h, a = code(cell('fhome')), code(cell('faway'))
        if not h or not a:
            continue
        iso = re.search(r'(\d{4}-\d{2}-\d{2})', cell('fdate'))
        date, time = to_ist(iso.group(1) if iso else None, cell('ftime'))
        rec = {'h': h, 'a': a, 'date': date, 'time': time}
        m = re.match(r'\s*(\d+)\s*[–-]\s*(\d+)', cell('fscore'))
        if m:
            hs, as_ = int(m.group(1)), int(m.group(2))
            rec.update(hs=hs, **{'as': as_}, done=True)
            if hs != as_:
                rec['w'] = h if hs > as_ else a
            else:  # drawn after extra time -> penalty shootout. The shootout score
                # ("3–4") lives in the LAST fgoals cell, after the "Penalties" header
                # (separated by newlines, so a whole-box regex misses it).
                pm = None
                for gc in b.xpath('.//*[contains(@class,"fgoals")]'):
                    txt = re.sub(r'\s+', ' ', gc.text_content())
                    cand = re.search(r'(?<![:\'])\b(\d+)\s*[–-]\s*(\d+)\b', txt)
                    if cand:
                        pm = cand  # later cells win -> penalty cell over goalscorers
                rec['w'] = (h if int(pm.group(1)) > int(pm.group(2)) else a) if pm else None
                if pm:
                    rec['pens'] = [int(pm.group(1)), int(pm.group(2))]
        else:
            rec['done'] = False
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
    matches = parse_matches(html)
    by_pair = {frozenset((m['h'], m['a'])): m for m in matches}

    def match(x, y):
        return by_pair.get(frozenset((x, y)))
    def winner(x, y):
        m = match(x, y)
        return m['w'] if (m and m.get('done')) else None

    # R32 winners (reached R16), in bracket order.
    r16 = [w for x, y in bracket if (w := winner(x, y))]
    # R16 winners (reached QF): region j is winner(tie 2j) vs winner(tie 2j+1).
    qf, r16_pairs = [], []
    for j in range(8):
        wa, wb = winner(*bracket[2 * j]), winner(*bracket[2 * j + 1])
        if wa and wb:
            r16_pairs.append((wa, wb))
            if (w := winner(wa, wb)):
                qf.append(w)
    ko = {'r16': r16, 'qf': qf}

    # Q4/Q5 ("most goals scored/conceded across R32+R16") — only once all 24 are complete.
    r16_matches = [match(wa, wb) for wa, wb in r16_pairs]
    if len(r16) == 16 and len(r16_pairs) == 8 and all(r16_matches) and len(qf) == 8:
        scored, conceded = {}, {}
        for m in [match(x, y) for x, y in bracket] + r16_matches:
            scored[m['h']] = scored.get(m['h'], 0) + m['hs']
            conceded[m['h']] = conceded.get(m['h'], 0) + m['as']
            scored[m['a']] = scored.get(m['a'], 0) + m['as']
            conceded[m['a']] = conceded.get(m['a'], 0) + m['hs']
        # Every team tied on the top count is a correct answer (per the stated rule),
        # so emit lists of all leaders, not an arbitrary single team.
        ko['q4'] = sorted(t for t, g in scored.items() if g == max(scored.values()))
        ko['q5'] = sorted(t for t, g in conceded.items() if g == max(conceded.values()))

    data['koResults'] = ko
    data['koMatches'] = matches
    json.dump(data, open('data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open('data.json', 'a').write('\n')
    played = sum(1 for m in matches if m.get('done'))
    print(f"koMatches: {len(matches)} ({played} played) | koResults: {len(r16)} R32 winners, "
          f"{len(qf)} R16 winners, q4={ko.get('q4')}, q5={ko.get('q5')}")
    print(f"  R32 winners (reached R16): {r16}")

if __name__ == '__main__':
    main()
