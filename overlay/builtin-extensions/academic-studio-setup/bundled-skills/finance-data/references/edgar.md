# SEC EDGAR

Keyless, but every request **must** send a `User-Agent` header identifying you
(SEC policy) — e.g. `"Your Name your.email@example.com"`. Requests without it get
403'd. Be polite: keep under ~10 requests/second.

Use EDGAR for authoritative, as-reported figures tied to actual filings (10-K,
10-Q, 8-K), XBRL financial facts, and filing text/full-text search.

```python
import os, json, requests
import pandas as pd

os.makedirs("data", exist_ok=True)
HEADERS = {"User-Agent": "Academic Studio user@example.com"}   # put a real contact here
```

## Step 1 — ticker → CIK

EDGAR keys everything on a zero-padded 10-digit CIK.

```python
r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=HEADERS)
tickers = {row["ticker"]: row["cik_str"] for row in r.json().values()}
cik = str(tickers["AAPL"]).zfill(10)     # e.g. "0000320193"
```

## Step 2a — XBRL company facts (all reported concepts)

```python
url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
facts = requests.get(url, headers=HEADERS).json()
# Pull one concept to a tidy DataFrame:
rev = facts["facts"]["us-gaap"]["Revenues"]["units"]["USD"]
df = pd.DataFrame(rev)                    # columns: end, val, form, fy, fp, filed, ...
df.to_csv("data/aapl_revenues.csv", index=False)
```

Concept names are XBRL/us-gaap tags (`Revenues`, `NetIncomeLoss`, `Assets`,
`StockholdersEquity`, `RevenueFromContractWithCustomerExcludingAssessedTax`).
Not every company uses the same tag — inspect `facts["facts"]["us-gaap"].keys()`
if a tag is missing.

### Reducing raw facts to one clean value per period

This is the part that actually takes work. A concept's `units` list is *not* a
tidy annual series — it mixes quarterly and annual periods, original and amended
filings, and back-reported prior years, so the same fiscal year can appear
several times. Reduce it deliberately. For an **annual** flow concept (income,
revenue, cash flow — anything measured *over* a period, which has both `start`
and `end`):

```python
import pandas as pd
rows = pd.DataFrame(rev)                       # the units["USD"] list from above
rows["start"] = pd.to_datetime(rows["start"])
rows["end"]   = pd.to_datetime(rows["end"])
rows["filed"] = pd.to_datetime(rows["filed"])

# Keep full-year periods reported on a 10-K (and 10-K/A amendments).
annual = rows[(rows["end"] - rows["start"]).dt.days >= 350]
annual = annual[annual["form"].str.startswith("10-K")]

# Derive the fiscal year from the period END date — the `fy` field is unreliable
# and sometimes carries the wrong year. Then, where a year was restated across
# filings, keep the originally-filed (earliest `filed`) value.
annual["fy_end_year"] = annual["end"].dt.year
annual = annual.sort_values("filed").drop_duplicates("fy_end_year", keep="first")
annual = annual.sort_values("fy_end_year")[["fy_end_year", "end", "val", "form", "filed"]]
```

For a **balance-sheet** (instant) concept like `Assets` or `StockholdersEquity`
there is no `start` — each fact is a point-in-time value dated by `end`; filter to
`form` 10-K and dedupe on `end` keeping the earliest `filed` instead of the
350-day duration test.

Keep `keep="first"` if the user wants figures *as originally reported*; switch to
`keep="last"` if they want the latest restated view. Ask which they want if it
matters.

## Step 2b — a single concept directly

```python
url = f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik}/us-gaap/NetIncomeLoss.json"
data = requests.get(url, headers=HEADERS).json()
df = pd.DataFrame(data["units"]["USD"])
```

## Step 2c — list of filings

```python
url = f"https://data.sec.gov/submissions/CIK{cik}.json"
sub = requests.get(url, headers=HEADERS).json()
recent = pd.DataFrame(sub["filings"]["recent"])   # form, filingDate, accessionNumber, primaryDocument
tens = recent[recent["form"] == "10-K"]
```

Build a filing's document URL from its accession number:
`https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession_no_dashes}/{primaryDocument}`.

## Step 2d — full-text search

```python
url = "https://efts.sec.gov/LATEST/search-index?q=%22climate%20risk%22&forms=10-K"
hits = requests.get(url, headers=HEADERS).json()
```

## Gotchas

- The `User-Agent` header is mandatory — a missing/blank one returns 403.
- Reported values distinguish duration vs instant concepts and can include
  multiple frames (fy/fp, amended filings). Filter to the `form` and period you
  want; watch for restatements sharing the same `end` date.
