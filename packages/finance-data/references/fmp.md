# Financial Modeling Prep (via `requests`)

Needs a free key from https://site.financialmodelingprep.com/register, stored as
`FMP_API_KEY`. An official, documented REST API — more stable than Yahoo's
unofficial one. Free tier: ~250 requests/day, mostly US-listed symbols,
financial statements capped at ~5 years. Spend the daily budget on data that is
*only* here (analyst targets/estimates, upgrades/downgrades, market movers,
calendars, TTM valuation metrics) — never on price history, which Yahoo and
Stooq give freely.

```python
import os
import requests
import pandas as pd

BASE = "https://financialmodelingprep.com/stable"
key = os.environ.get("FMP_API_KEY")

def fmp(endpoint, **params):
    params["apikey"] = key
    r = requests.get(f"{BASE}/{endpoint}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()
```

Most endpoints return a list of dicts — `pd.DataFrame(fmp(...))` is usually all
it takes.

## Analyst data (the main reason to come here)

```python
targets = pd.DataFrame(fmp("price-target-summary", symbol="AAPL"))   # consensus price targets
grades  = pd.DataFrame(fmp("grades", symbol="AAPL"))                 # upgrade/downgrade history
est     = pd.DataFrame(fmp("analyst-estimates", symbol="AAPL", period="annual"))  # fwd estimates
```

## Market movers & sector performance (point-in-time snapshots)

```python
gainers = pd.DataFrame(fmp("biggest-gainers"))
losers  = pd.DataFrame(fmp("biggest-losers"))
actives = pd.DataFrame(fmp("most-actives"))
sectors = pd.DataFrame(fmp("sector-performance-snapshot"))
```

## Calendars (upcoming releases — FRED only has history)

```python
econ = pd.DataFrame(fmp("economic-calendar", **{"from": "2026-07-01", "to": "2026-07-31"}))
earn = pd.DataFrame(fmp("earnings-calendar", **{"from": "2026-07-01", "to": "2026-07-31"}))
```

(`from` is a Python keyword — pass it via `**{...}` as above.)

## Quotes, profile, statements, valuation metrics

Useful mainly as the keyed fallback when Yahoo misbehaves, plus the
precomputed TTM metrics that Yahoo doesn't offer:

```python
quote   = fmp("quote", symbol="AAPL")                                  # list with one dict
profile = fmp("profile", symbol="AAPL")
inc     = pd.DataFrame(fmp("income-statement", symbol="AAPL", period="annual", limit=5))
ratios  = pd.DataFrame(fmp("ratios-ttm", symbol="AAPL"))               # TTM ratios
km      = pd.DataFrame(fmp("key-metrics-ttm", symbol="AAPL"))          # TTM key metrics
mcap    = pd.DataFrame(fmp("historical-market-capitalization", symbol="AAPL"))
```

Also available: `balance-sheet-statement`, `cash-flow-statement`,
`search-symbol?query=...`, `sp500-constituent`, `economic-indicators`.

## Gotchas

- HTTP 401 → key missing/wrong (see SKILL.md "API keys"). HTTP 402/403 with a
  "premium endpoint" message → that endpoint isn't in the free tier; say so and
  fall back per the routing table (Yahoo/EDGAR for fundamentals, FinnHub for
  recommendation counts) instead of retrying.
- HTTP 429 → the 250/day budget is spent; fall back to a keyless source.
- Endpoint *paths* above are verified against the live API; free-tier
  entitlement varies by endpoint and FMP adjusts it over time, so treat a
  premium error as routing information, not a bug.
- The old `/api/v3/` endpoints are deprecated — use only the `/stable/` base
  above. Statement history beyond ~5 years needs SEC EDGAR, not FMP.
