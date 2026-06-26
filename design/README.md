# Handoff: World Cup 2026 Predictor — "The League of Angry Men"

## Overview
A mobile-first, information-only web app for a 20-player FIFA World Cup 2026 prediction league. **No login, no auth, no user accounts.** It is a read-only public scoreboard that the organizer keeps updated by editing data — with **one exception**: the Phase 2 bracket **Build** screen submits each player's picks to a Google Sheet (via Apps Script). Everything else is display.

The league runs in **3 prediction phases**, max **200 points**:
- **Phase 1 (71 pts)** — before the group stage: pick which teams reach the Round of 32, group-bonus, and bonus Q1–Q3.
- **Phase 2 (72 pts)** — Round of 32 + Round of 16 bracket picks, plus bonus Q4–Q5. **← currently the live/active phase; this is where most recent work went.**
- **Phase 3 (57 pts)** — QF → Final picks + bonus Q6. (Not built yet — locked placeholders only.)

The design ships in the state: **group stage live, Phase 2 picks open.**

## About the Design Files
The file in this bundle (`Angry Men Predictor.dc.html`) is a **design reference created in HTML** — a working, interactive prototype showing the intended look, layout, states, and behavior. It is **not production code to copy verbatim**. It uses a streaming-component prototype format (`<x-dc>` wrapper, a `class Component extends DCLogic` with a `renderVals()` method, `{{ }}` template holes, `<sc-for>`/`<sc-if>` control flow). **Ignore those framework conventions** and re-implement in the target stack.

The logic you DO need is all in that `renderVals()` method and the data block above it — read it as the source of truth for the scoring math, bracket derivation, and state shapes described below.

## Recommended Stack
If there's no existing codebase, this is an ideal small **React (Vite) + TypeScript** SPA: single page, client-side state, no server. The only backend touch is the Phase 2 submit → **Google Apps Script Web App → Google Sheet** (already designed for; see "Phase 2 submission" below). Data lives in a typed `data.ts` the organizer edits (or later a Sheet/CMS).

## Fidelity
**High-fidelity.** Recreate pixel-accurately. All exact hex values, font sizes, and radii are in Design Tokens. Build the **states**, not just the happy path — the bracket screens are mostly interaction (see "Phase 2 lifecycle states").

## Core Architecture Principle
**Derive, don't store** wherever the source allows:
- **Group tables** (P/W/D/L/GF/GA/GD/Pts, sort order, qualifier highlights) are **computed from raw match results.** The organizer only edits scores.
- **The 32 qualified teams, the R32 pairings, and the 8 R16 "regions"** are **derived** from the computed group standings (so they shift until groups finish — show them as provisional).
- **Per-team popularity** ("13 of 20 backed Brazil") and **supporter lists** are **aggregated** from each player's stored Phase 2 bracket.

What IS stored: player **points** per phase (organizer tallies manually: Phase 1 `q`+`g`+`b`, Phase 2 `p2`), Phase 1 bonus answers, and — in production — each player's actual Phase 2 bracket picks (the prototype generates these deterministically as placeholders; see note).

---

## Navigation
Fixed **bottom tab bar, 6 tabs**. Container is a centered column, `max-width: 680px`, horizontal padding `14px`, bottom padding `104px` (clears the nav). Sticky header on top of every tab. Dark "mowed-pitch" striped background throughout.

Tabs (icon / label / id): 🏆 **Table** (`standings`) · 🗺️ **Bracket** (`bracket`) · ✏️ **Build** (`build`) · 👤 **Squad** (`players`) · 📅 **Matches** (`matches`) · 📖 **Rules** (`rules`).
Active tab: top border `2px solid #b6ff3a`, color `#b6ff3a`; inactive color `#5f7567`, icon `grayscale(.5) opacity(.75)`. Switching tabs closes any open overlay.

### Global Header (sticky, all tabs)
Full-bleed, padding `11px 16px`, bg `linear-gradient(180deg,#081310,rgba(8,19,16,.94))` + `blur(8px)`, bottom border `1px solid #1c3a28`.
- 38×38 rounded-10 emblem, `radial-gradient(circle at 35% 30%,#1f7a45,#0c2d1a)`, border `#2c5a38`, centered ⚽.
- Title "THE LEAGUE OF ANGRY MEN" (Barlow Condensed 800, 16px) over "FIFA WORLD CUP 2026 · PREDICTOR" (10px, `#7fd0a0`, letter-spacing .12em).
- Right pill "PHASE 2 · PICKS OPEN" — bg `rgba(255,206,58,.12)`, border `#5a4a1c`, a 7px `#ffce3a` dot that **pulses** (opacity 1→.3→1, 1.1s infinite), label gold.

---

## Tab 1 — Table (Standings) — DEFAULT
1. **Stat row** — 3 tiles: "PRIZE POOL" `₹20,000` (gold), "ANGRY MEN" `20`, "MAX PTS" `200`.
2. **Phase segmented control** — `PHASE 1 | PHASE 2 | TOTAL` (state `standMode`, default `p1`). Active segment bg `#1a7a43`, text `#eafff0`; inactive text `#7fd0a0`. Switching re-ranks and re-tags the whole table by that metric.
3. **Leader hero card** (toggleable) — gradient card, big 🏆 bleed, label "👑 {PHASE 1|PHASE 2|OVERALL} LEADER", leader name (Barlow Condensed 800, 34px) + total (JetBrains Mono 800, 40px, `#b6ff3a`).
4. **Standing rows** (button each; sorted by the selected metric desc, tiebreak total desc then `q` desc; opens player overlay):
   - **Rank chip** 30×30, colored by rank: #1 `#ffce3a`/`#1a1400`, #2 `#cfd8d4`/`#10201a`, #3 `#d98b46`/`#160d04`, else `#15301f`/`#7fd0a0`.
   - Name (Barlow Condensed 700, 17px) + nickname (11px ellipsis). **Trash-talk tag** below (10px), colored by rank band.
   - **Progress bar** (toggleable): width = `min(100, round(value/maxForMode*100))%`, `linear-gradient(90deg,#1a7a43,#b6ff3a)`. `maxForMode`: p1=71, p2=72, total=200.
   - Right: metric value (JetBrains Mono 800, 22px, `#b6ff3a`) over **movement** `▲N`/`▼N`/`–` (`#b6ff3a`/`#ff5a5a`/`#5f7567`).
5. Footnote changes per mode.

**Trash-talk tags** (by rank, n = player count; when trash-talk OFF all become "PHASE" in `#7fd0a0`): 1 → "👑 TOP OF THE TABLE" `#ffce3a`; 2–3 → "BREATHING DOWN NECKS" `#b6ff3a`; 4–8 → "IN THE MIX" `#7fd0a0`; 9–13 → "BANG AVERAGE" `#9fb3a6`; 14..n−1 → "RELEGATION ZONE" `#ff7a6a`; n → "🥄 WOODEN SPOON" `#ff5a5a`.

## Tab 2 — Bracket ("The People's Bracket")  ★ Phase 2
The aggregate view of everyone's Phase 2 picks. Sticky control bar: **zoom** −/+ (state `zoom`, clamp 0.6–1.4 step 0.2, applied as CSS `zoom` on the tree) + a legend (MOST BACKED `#b6ff3a` / UNDERDOG `#27412f`). Horizontally + vertically scrollable.

Tree = **8 region cards** (one per R16 region). Each region card contains:
- **Two R32 match cards** (left, stacked) — each shows its two teams with the **support count** per team; the more-backed side tinted `rgba(182,255,58,.08)` with `#b6ff3a` count. Tapping a match card opens the **supporter overlay** (R32).
- **Bracket connector** (the L-shaped lines: small horizontal stubs + a vertical span + a horizontal feed — drawn with absolutely-positioned 1px divs in `#2c5a38`).
- **R16 "BACKED TO REACH QF" node** (right) — a **podium**: all **4 possible teams** ranked by how many players advanced them to the QF, sizes **diminishing** down the list. Per rank index k (0–3): font `[16,14,12.5,11.5]px`, flag `[18,15,13,12]px`, bar height `[9,7,5.5,4.5]px`, opacity `1 - k*0.15`, bar fill color k0 `linear-gradient(90deg,#1a7a43,#b6ff3a)` / k1 `#3f9c5e` / k2–3 `#27412f`, count color k0 `#b6ff3a` else `#7f9f86`. Bar width = `count / maxCount * 100%`. Tapping opens the supporter overlay (R16).

### Supporter overlay (bottom sheet, `top:18%`)
- **R32 tie**: kicker "ROUND OF 32 · TIE n", title "{A} vs {B}". Two sides, each: flag + name + `count/20`, a 6px share bar, then **supporter name chips**; "nobody backed this one 💀" if zero.
- **R16 region**: title "Backed to reach the Quarterfinals" — lists all 4 possible teams sorted desc by support, each with chips.

## Tab 3 — Build (Bracket Builder)  ★ Phase 2 · the only input screen
Classic bracket-tree builder. The user picks **16 R32 winners (2 pts)** and **8 R16 winners (4 pts)** = **24 picks**, plus Q4 & Q5, then submits.

Top to bottom:
1. **Preview-state switcher** (dashed card, "PREVIEW STATE") — `Empty · In progress · Complete · Locked`. This is a **demo/dev affordance** that seeds the bracket to each state so every lifecycle state is reviewable; the active state is auto-derived from pick count + lock flag. **Keep this in the build so QA can see all states; you may hide it behind a debug flag in prod.**
2. **Status banner** — reflects derived state: `empty` ○ `#7fd0a0` "Bracket open"; `partial` ◐ `#ffce3a` "In progress"; `complete` ● `#b6ff3a` "Ready to submit"; `locked` 🔒 `#ff7a6a` "Picks locked — deadline passed" (banner bg/border shift accordingly). Right side shows `{pickCount}/24`.
3. **Name select** — "WHO ARE YOU?" dropdown of the 20 players (no login; identity is self-selected). Disabled when locked.
4. **The bracket** — 8 region cards, same region/connector structure as Tab 2 but **interactive**:
   - Each R32 match is two **team buttons**. Tap one to pick the winner → it highlights (`rgba(182,255,58,.16)` + `inset 3px 0 0 #b6ff3a` + ✓), the other **dims to opacity .4**.
   - The **R16 node** auto-populates with the two picked R32 winners; until both are picked it shows "Pick both R32 winners first ↑". Tap to choose who advances to QF.
   - Changing an R32 pick that invalidates an existing R16 pick clears that R16 pick.
   - Region status label: "TAP A TEAM" → "IN PROGRESS" → "PICK R16" → "✓ DONE".
5. **Bonus questions** — Q4 "Most goals scored (R32+R16)" and Q5 "Most goals conceded (R32+R16)", each a team `<select>` over all 32 qualified teams.
6. **Submit** — enabled only when name + all 24 picks + Q4 + Q5 are set (and not locked). Disabled style `#15301f`/`#5f7567`; enabled `linear-gradient(90deg,#1a7a43,#7ed957)`. Hint text explains what's missing.
7. **Confirmation panel** (after submit) — success card with the exact JSON payload in a `<pre>`, a "Copy JSON" button, and "Edit again".

### Phase 2 submission (the one backend integration)
On submit, build a payload and POST it to a Google Apps Script Web App:
```js
const payload = {
  player, nick, phase: 2, submittedAt: ISO8601,
  r32: [{ tie: 1..16, matchup: "BRA v KOR", pick: "BRA"|null }, ...],   // 16
  r16: [{ region: 1..8, pick: "BRA"|null }, ...],                        // 8
  q4, q5
};
fetch(SHEET_ENDPOINT, { method:'POST', mode:'no-cors',
  headers:{ 'Content-Type':'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
```
`SHEET_ENDPOINT` is a single configurable constant. **`mode:'no-cors'` + `text/plain` is intentional** — it avoids a CORS preflight that Apps Script Web Apps don't answer; the response is opaque, so treat the POST as fire-and-forget and optimistically show success. When `SHEET_ENDPOINT` is empty, the app runs in **preview mode**: it skips the POST and just shows the JSON for the user to copy / send the organizer. The Apps Script side is a simple `doPost(e){ JSON.parse(e.postData.contents) → append row }` — not included here; implement on the Sheet.

## Tab 4 — Squad (Players)
2-column grid of player cards (rank chip, total, name, nickname, "PICKED TO LIFT IT" = their Q1 winner). Tapping opens the **player overlay**.

### Player overlay (bottom sheet, `top:7%`)
- Identity row: rank chip + name + nickname + **total** points.
- **3 phase tiles**: PHASE 1 (`p1`), PHASE 2 (`p2`, gold-bordered), PHASE 3 (🔒).
- **PHASE 1 · R32 QUALIFIER PICKS** — per group A–L, the teams they backed to reach R32, color-coded vs the live qualifiers (on-track `#b6ff3a` / trailing `#ff7a6a` / pending `#5f7567`).
- **PHASE 2 · THEIR BRACKET** — a compact **2-column mini-bracket grid** (8 region cells). Each cell: the two R32 picks (left, stacked; the one they advanced is highlighted `#b6ff3a`) → mini connector → the team they sent to the QF (right, lime chip).
- **PHASE 1 BONUS** — Q1 World Cup winner, Q2 Golden Boot, Q3 Golden Glove.
- **PHASE 2 BONUS** — Q4 Most goals (R32+R16), Q5 Most conceded (R32+R16).

## Tab 5 — Matches
Three sub-tabs (segmented control; state `matchSub`, default `fixtures`): **FIXTURES · TABLES · KNOCKOUT**.
- **Fixtures** — all group matches by matchday, with LIVE (pulsing minute) / FT / Upcoming states.
- **Tables** — the 12 computed group tables (green = top 2, gold position-color = 3rd).
- **Knockout** — the **actual tournament bracket** R32 → R16 → QF → SF → Final:
  - **Bracket** (horizontally scrollable, `min-width:780px`): 5 round columns. Each column header = round label (`#b6ff3a`) + date range. Matches use `justify-content: space-around` so later rounds align to the midpoints of their feeders. Each match card = two team rows + a kickoff date/time footer. Teams are **provisional** (derived R32 from current standings); later rounds are `TBD` (`⚪`, gray `#5f7567`).
  - **Knockout schedule** list below, grouped by round with date · time per match.
  - Editable date/time arrays in the data block (`koDate`, `koTime`).

## Tab 6 — Rules & Scoring
Prize-pool card (₹20,000, entry ₹1,000 × 20, UPI handle `pynkmenlyndem@okaxis` / name "Pynkmenlang") + the three phase scoring cards (Phase 2 is accented/highlighted as the open phase). Full scoring table:

| Phase | Item | Per | Subtotal |
|---|---|---|---|
| **P1 (71)** | Correct team into R32 (position irrelevant) | 1 | 32 |
| | All qualifiers from a group right (2/2 or 3/3) | 2 | 24 |
| | Q1 World Cup winner / Q2 Golden Boot / Q3 Golden Glove | 5 | 5 each |
| **P2 (72)** | Correct R32 bracket pick | 2 | 32 |
| | Correct R16 bracket pick | 4 | 32 |
| | Q4 Most goals (R32+R16) * / Q5 Most conceded (R32+R16) * | 4 | 4 each |
| **P3 (57)** | Correct QF pick | 6 | 24 |
| | Correct SF pick | 8 | 16 |
| | Correct Final / champion | 10 | 10 |
| | Q6 Games past 90 mins (QF, SF, 3rd, Final) | 7 | 7 |

\* All teams tied on the most/fewest count are scored correct.

---

## Phase 2 lifecycle states (build these explicitly)
The Build screen is interaction-driven, so implement and test each state:
1. **Empty** — no picks; status "Bracket open"; R16 nodes show "Pick both R32 winners first".
2. **Partial (in progress)** — some R32 picked, losers dimmed, some R16 nodes still waiting; `{k}/24`.
3. **Complete** — all 24 + Q4/Q5 + name set; submit enabled; "Ready to submit".
4. **Locked (deadline passed)** — all team buttons & selects read-only (no handlers fire), deadline banner, submit replaced by "🔒 LOCKED". Driven by a `locked` flag (in prod, derive from a deadline timestamp vs now).

The aggregate views (Bracket tab, Squad mini-bracket, popularity) also have an implicit **pre-results** state (picks in, but no knockout games played yet) vs **scored** later — keep copy/labels honest about "provisional".

## State Management
- `tab` (default `standings`), `selected` (player index | null), `openMatch` ({round:'r32'|'r16', id} | null).
- `standMode` ('p1'|'p2'|'total'), `matchSub` ('fixtures'|'groups'|'knockout'), `zoom` (number).
- Build: `picks` ({ r32:{[mid]:code}, r16:{[rid]:code} }), `builderName` (index|null), `q4`, `q5`, `locked`, `submitState` ('idle'|'done'), `lastPayload`, `copied`.
- Display toggles (prototype props; implement as constants/settings): `trashTalk`, `highlightLeader`, `showBars` (all default true).

### Key algorithms (from `renderVals()` — port faithfully)
**Group table:** fixtures order per group of 4 = `[[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]` (match i → number i+1; matchday = `ceil((i+1)/2)`). For each played result add games/goals; W=+3, D=+1; `gd=gf-ga`; sort `pts desc, gd desc, gf desc, name asc`. LIVE counts identically to FT.

**Qualified-32 & bracket:** `seed = [12 group winners, 12 runners-up, 8 best 3rd-placed]` (3rd-placed ranked `pts,gd,gf,name`). R32 match i (0–15) = `(seed[i], seed[31-i])` (classic 1-v-32 seeding). Region j (0–7) feeds from R32 matches `2j` and `2j+1`.

**Placeholder per-player bracket** (replace in prod with real stored picks): deterministic via `h(n)=frac(sin(n)*10000)`; R32 winner = stronger seed if `h(idx*97+mid*131+7) < 0.66` else weaker; R16 winner = stronger feeder if `h(idx*53+reg*17+3) < 0.62` else weaker. Q4/Q5 placeholders derived from seed too. **In production, store and read each player's actual R32/R16 picks (`{r32:{},r16:{}}`) and real Q4/Q5 — see note.**

## Design Tokens
**Color** — bg base `#070f0a`; pitch radial `radial-gradient(120% 80% at 50% -10%,#12442a,#0a1f14 45%,#070f0a)`; stripe overlay `repeating-linear-gradient(180deg,rgba(255,255,255,.016) 0 28px,transparent 28px 56px)`. Surfaces `#0e1d14` / deeper `#0a1813` / region `#0c1710` / locked `#06100a`. Borders `#1c3a28`, accent `#2c5a38`, nav `#20402c`, hairline `#122a1c`. Accent lime `#b6ff3a` (+ deep `#1a7a43`, mid `#3f9c5e`, dim `#27412f`); gold `#ffce3a`; submit gradient `#1a7a43→#7ed957`. Text primary `#eef5ec` / soft `#cfe0d4` / muted `#9fb3a6` / teal `#7fd0a0` / dim `#5f7567`; down `#ff5a5a`, warn `#ff7a6a`. Selection `#b6ff3a`/`#07140a`.

**Type** (Google Fonts): **Barlow Condensed** (500–800) headings/labels; **Barlow** (400–700) body/UI; **JetBrains Mono** (500/700/800) numbers/scores/codes.

**Radii** 7–22px (overlays use `22px 22px 0 0`). **Bars** 4px (standings) / 6px (overlay). **Animations**: only `pulse` (live dot + live minute). Sheets slide up from bottom, scrim `rgba(3,8,5,.82)` + `blur(3px)`.

## Assets
**No image files.** All imagery is CSS gradients + Unicode emoji (team flags, ⚽ 🏆 👑 🥄 🔒 ⚪, nav icons). England uses 🏴 as a safe fallback. Swap nav emoji for an icon set (Lucide) if the codebase has one. `TBD` slots use ⚪.

## Data Model (recommended TS)
```ts
type TeamCode = string;
type Team = { code: TeamCode; name: string; flag: string };
type GroupLetter = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L';
const GROUPS: Record<GroupLetter, Team[]>;                 // 4 teams each, in T1..T4 order
type Result = [number,number] | [number,number,'LIVE',number];
const RESULTS: Record<`${GroupLetter}${1|2|3|4|5|6}`, Result>;  // delete key = upcoming

type Player = {
  name: string; nick: string;
  q: number; g: number; b: number;   // Phase 1: qualifiers / group-bonus / Q1–Q3 bonus
  p2: number;                          // Phase 2 points (placeholder until R16 done)
  mv: number;                          // movement since last update
  q1: TeamCode; q2: string; q3: string;          // Phase 1 bonus answers
  // production additions:
  // q4?: TeamCode; q5?: TeamCode;                 // Phase 2 bonus answers
  // bracket?: { r32: Record<number,TeamCode>; r16: Record<number,TeamCode> };
};
const PLAYERS: Player[];   // 20 entries. p1 = q+g+b; total = q+g+b+p2

const SHEET_ENDPOINT: string;          // Apps Script Web App URL ('' = preview mode)
const koDate: string[]; const koTime: string[];   // R32 kickoff schedule (editable)
```

## ⚠️ Placeholder data to replace
- **Player names, nicknames, all point values (`q/g/b/p2/mv`), and Phase 1 bonus answers** — demo data.
- **Per-player Phase 2 bracket picks AND Q4/Q5** — currently **deterministically generated**, not real. Add real stored picks (`bracket`, `q4`, `q5` on `Player`) and feed the same popularity/aggregation + scoring off them.
- **R32 matchups & knockout dates** — provisional (R32 derived from live standings; dates in `koDate`/`koTime`).

## Files
- `Angry Men Predictor.dc.html` — the full hi-fi interactive prototype (all 6 tabs, both overlays, the bracket builder with all 4 lifecycle states, the people's bracket, the knockout bracket). The editable data block is marked `EDIT YOUR DATA HERE` near the top of its `<script>`; everything above `END OF DATA` is what the organizer changes, everything below is rendering logic to port.
