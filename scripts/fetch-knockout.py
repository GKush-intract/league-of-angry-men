#!/usr/bin/env python3
"""Scrape the 2026 FIFA World Cup knockout BRACKET from Wikipedia and write the real
Round-of-32 draw into data.json as `bracketR32` (16 [aCode,bCode] pairs in bracket
order). Reuses the team-name -> code ALIAS from fetch-official.py.

The bracket on the Wikipedia article has concrete teams for decided slots and
placeholders ("Runner-up Group K", "3rd Group A/I/J", "Winner Group L") for slots that
depend on the still-incomplete group stage / best-thirds allocation. We only WRITE
`bracketR32` once all 32 slots resolve to real teams; otherwise we report the remaining
placeholders and exit 0 without touching data.json (safe to run on a schedule).

Usage:  python3 scripts/fetch-knockout.py
"""
import json, re, sys, os, urllib.request, importlib.util

URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup"

# Reuse ALIAS (name -> 3-letter code) from the sibling fetch-official.py (hyphenated
# filename, so load it via importlib rather than a normal import).
_spec = importlib.util.spec_from_file_location(
    "fetch_official", os.path.join(os.path.dirname(__file__), "fetch-official.py"))
_fo = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_fo)
ALIAS = _fo.ALIAS

def norm(name):
    n = name.replace("&#39;", "'").replace("&amp;", "&")
    n = re.sub(r"\s+(men's\s+)?national\s+(football|soccer)\s+team$", "", n, flags=re.I)
    return n.strip().lower()

def parse_bracket(html):
    start = html.find('id="Bracket"')
    if start < 0:
        start = html.find('>Bracket<')
    if start < 0:
        sys.exit("could not locate the Bracket section")
    seg = html[start:start + 80000]
    cells = re.findall(r'<td rowspan="2" style="[^"]*padding:0 \.6ex[^"]*">(.*?)</td>', seg, re.S)
    out = []  # list of (code_or_None, raw_label)
    for c in cells:
        if 'Winner Match' in c or 'Loser Match' in c:
            continue  # later-round / third-place slots, not R32 participants
        m = re.search(r'/wiki/[^"]+" title="([^"]+)"', c)
        if m:
            code = ALIAS.get(norm(m.group(1)))
            out.append((code, m.group(1)))
        else:
            label = re.sub(r'<[^>]+>', '', c)
            label = re.sub(r'&#160;|&nbsp;', ' ', label).strip()
            if label:
                out.append((None, label))  # placeholder (group not yet decided)
    return out[:32]

def main():
    # Once the bracket is set, NEVER re-scrape it: after knockout matches play, advancing
    # teams fill the R16+ cells on the source bracket and would be misread as R32
    # participants, shifting/corrupting the draw. The R32 draw is final, so refuse to
    # overwrite an already-resolved 16-tie bracketR32.
    existing = json.load(open('data.json', encoding='utf-8')).get('bracketR32')
    if isinstance(existing, list) and len(existing) == 16:
        print("bracketR32 already set (16 ties) — skipping; the R32 draw is final.")
        return

    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    parts = parse_bracket(html)
    if len(parts) != 32:
        sys.exit(f"expected 32 R32 participants, parsed {len(parts)} — bracket markup changed")

    ties = [(parts[i], parts[i + 1]) for i in range(0, 32, 2)]
    print("Parsed R32 bracket (in bracket order):")
    for i, (a, b) in enumerate(ties, 1):
        print(f"  Tie {i:2}: {(a[0] or a[1]):<22} vs {(b[0] or b[1])}")

    unresolved = [p[1] for p in parts if p[0] is None]
    unmapped = [p[1] for p in parts if p[0] is None and not re.search(r'Group|Winner|Runner|3rd|TBD', p[1], re.I)]
    if unmapped:
        sys.exit(f"UNMAPPED real team(s) (add to ALIAS in fetch-official.py): {unmapped}")
    if unresolved:
        print(f"\n{len(unresolved)} slot(s) still undecided (group stage / best-thirds not final):")
        for u in unresolved:
            print(f"  - {u}")
        print("Not writing bracketR32 yet. Re-run once the group stage completes.")
        return

    bracket = [[a[0], b[0]] for a, b in ties]
    data = json.load(open('data.json', encoding='utf-8'))
    data['bracketR32'] = bracket
    json.dump(data, open('data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open('data.json', 'a').write('\n')
    print(f"\nWrote bracketR32 ({len(bracket)} ties) to data.json.")

if __name__ == '__main__':
    main()
