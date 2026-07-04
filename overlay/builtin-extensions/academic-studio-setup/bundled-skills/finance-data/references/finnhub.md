# FinnHub (via `finnhub-python`)

Needs a free key from https://finnhub.io/register, stored as `FINNHUB_API_KEY`.
Good for current quotes, company profile, basic financial metrics, company news,
analyst recommendations, and earnings. Free tier is rate-limited (~60
calls/minute) and US-focused.

```python
import os
import finnhub

# Canonical env var is FINNHUB_API_KEY, but FINHUB_API_KEY (one N) is a common
# misspelling — accept either so an existing key just works.
api_key = os.environ.get("FINNHUB_API_KEY") or os.environ.get("FINHUB_API_KEY")
client = finnhub.Client(api_key=api_key)
```

## Quote

```python
q = client.quote("AAPL")     # dict: c=current, d=change, dp=% change, h/l/o, pc=prev close
```

## Company profile & basic financials

```python
profile = client.company_profile2(symbol="AAPL")          # name, exchange, ipo, marketCap, finnhubIndustry
metrics = client.company_basic_financials("AAPL", "all")   # metric dict: P/E, margins, 52w hi/lo, etc.
```

## Company news

```python
news = client.company_news("AAPL", _from="2025-06-01", to="2026-07-01")   # list of dicts
import pandas as pd
pd.DataFrame(news).to_csv("data/aapl_news.csv", index=False)
```

Free-tier news only reaches back roughly one year and returns a capped batch, so
a `_from` more than ~12 months ago silently comes back empty — use a recent
window and don't mistake an empty list for a broken call.

## Recommendations & earnings

```python
recs = client.recommendation_trends("AAPL")     # buy/hold/sell counts over time
earn = client.company_earnings("AAPL", limit=8) # actual vs estimate EPS
```

## Gotchas

- Verified working on the free tier: `quote`, `company_profile2`,
  `company_basic_financials`, `recommendation_trends`, and recent `company_news`.
- Historical OHLC candles (`stock_candles`) moved to FinnHub's **paid** tier — for
  historical price series use Yahoo or Stooq instead, not FinnHub.
- Endpoints return dicts/lists; wrap in `pd.DataFrame(...)` to save as CSV.
- Respect the rate limit; if you get a 429, slow down or batch fewer symbols.
- If the key isn't set, offer the keyless alternative (Yahoo for a quote/profile).
