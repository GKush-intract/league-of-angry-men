# Phase 2 bracket sync — Google Apps Script setup

This document explains how to wire the league's knockout-bracket submissions into
`data.json`. The flow is:

```
Player submits bracket on the site
        │  (POST JSON to the web-app /exec URL)
        ▼
Apps Script doPost()  ──►  appends one flattened row to a Google Sheet
        │
        │  (sheet is "Published to web" as CSV)
        ▼
GitHub Action runs scripts/fetch-picks.mjs
        │  (fetches the published CSV via the PICKS_CSV_URL secret)
        ▼
data.json players get their bracket / q4 / q5 merged in, committed by the workflow
```

The site **falls back to a local preview mode** when `SHEET_ENDPOINT` is empty in
`config.js`, so you can develop and test the bracket builder without any of this
infrastructure in place. Set `SHEET_ENDPOINT` only once the web app below is deployed.

---

## 1. Create the Google Sheet

1. Go to <https://sheets.google.com> and create a new blank spreadsheet.
2. Name it something memorable, e.g. **FIFA WC 2026 — Phase 2 Picks**.
3. Leave the first sheet empty — the script writes the header row automatically on
   the first submission.

## 2. Add the Apps Script `doPost`

1. In the sheet, open **Extensions ▸ Apps Script**.
2. Delete any boilerplate in `Code.gs` and paste the following:

```js
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);                  // serialize concurrent submissions
  try {
    var d = JSON.parse(e.postData.contents);
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sh.getLastRow() === 0) {
      var head = ['submittedAt','player','nick'];
      for (var i=1;i<=16;i++) head.push('r32_'+i);
      for (var j=1;j<=8;j++) head.push('r16_'+j);
      head.push('q4','q5'); sh.appendRow(head);
    }
    // Always stamp a timestamp server-side: the client sends one, but fall back
    // so the column is never blank/garbage (the merge uses it for latest-wins).
    var row = [d.submittedAt || new Date().toISOString(), d.player, d.nick||''];
    for (var i=0;i<16;i++) row.push((d.r32[i] && d.r32[i].pick) || '');
    for (var j=0;j<8;j++) row.push((d.r16[j] && d.r16[j].pick) || '');
    row.push(d.q4||'', d.q5||''); sh.appendRow(row);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}
```

> The `LockService.getScriptLock()` wrapper serializes the `appendRow` calls so
> two simultaneous submissions can't race and corrupt/overwrite each other's row.
> The `submittedAt || new Date().toISOString()` fallback guarantees the timestamp
> column is always populated and monotonic, which the merge relies on for its
> latest-wins-per-player logic.

3. Save the project (the disk icon, or **Ctrl/Cmd + S**).

## 3. Deploy as a Web app

1. Click **Deploy ▸ New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - **Description:** anything, e.g. `picks endpoint`.
   - **Execute as:** **Me** (your Google account).
   - **Who has access:** **Anyone**.
4. Click **Deploy**. Authorize the script when prompted (the first time Google will
   warn that the app is unverified — this is your own script, so proceed).
5. Copy the **Web app URL** — it ends in `/exec`.
6. Paste that URL into `config.js` as the value of `SHEET_ENDPOINT`:

```js
// config.js
window.CONFIG = {
  SHEET_ENDPOINT: 'https://script.google.com/macros/s/AKfy.../exec',
  // ...
};
```

> Whenever you change the script code, you must create a **new deployment** (or
> "Manage deployments ▸ edit ▸ new version") for the changes to take effect.

## 4. Publish the sheet as CSV

The server-side merge reads the sheet over its public CSV feed (it does **not** use
the Apps Script `/exec` URL).

1. Back in the spreadsheet, open **File ▸ Share ▸ Publish to web**.
2. In the dialog:
   - **Link** tab.
   - First dropdown: select the **specific sheet/tab** that holds the rows (not
     "Entire Document").
   - Second dropdown: select **Comma-separated values (.csv)**.
3. Click **Publish** and confirm.
4. Copy the generated URL. It looks like:

```
https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv
```

## 5. Add the CSV URL as a GitHub Actions secret

1. In the GitHub repo, go to **Settings ▸ Secrets and variables ▸ Actions**.
2. Click **New repository secret**.
3. **Name:** `PICKS_CSV_URL`
4. **Value:** the published-CSV URL from step 4.
5. Save.

The `Update standings` workflow (`.github/workflows/update-standings.yml`) runs
`node scripts/fetch-picks.mjs` with that secret. The script fetches the CSV, merges
each row into the matching player in `data.json`, and the workflow's existing
validate / test / commit steps publish the result. If the secret is missing or
empty, the script prints `no PICKS_CSV_URL, skipping` and exits 0 (no-op), so the
workflow keeps working before the sheet exists.

---

## Column layout

Each submission becomes one row. Columns:

| Column        | Meaning                                                            |
|---------------|-------------------------------------------------------------------|
| `submittedAt` | ISO timestamp of the submission. The merge keeps the **latest** row per player. |
| `player`      | The player's canonical `name` (must match a `name` in `data.json`). |
| `nick`        | Optional display nickname (not merged into `data.json`).          |
| `r32_1` … `r32_16` | Round-of-32 picks, keyed by **tie number** = `matchId + 1`. So `r32_1` is the winner the player picked for tie/match `0`. |
| `r16_1` … `r16_8`  | Round-of-16 picks, keyed by **region number** = `regionId + 1`. So `r16_1` is the player's pick advancing out of region `0`. |
| `q4`          | Bonus question 4 answer (a team code).                            |
| `q5`          | Bonus question 5 answer (a team code).                            |

On merge, `scripts/fetch-picks.mjs`:

- Skips any `player` value that does not match a `name` in `data.json`.
- Skips any team code that is not a valid group-stage code (i.e. not present in
  `data.groups`), so stale/garbage cells are ignored.
- Stores picks back as zero-based keys: `r32_1` → `bracket.r32["0"]`,
  `r16_1` → `bracket.r16["0"]`, etc.
- Keeps only the most recent row per player (by `submittedAt`).
