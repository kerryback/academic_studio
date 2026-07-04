# FRED (Federal Reserve Economic Data)

Macroeconomic and financial time series from the St. Louis Fed: CPI, GDP,
unemployment, interest rates, money supply, spreads, exchange rates, and tens of
thousands more. Each series has a code (e.g. `CPIAUCSL`, `GDP`, `UNRATE`,
`DGS10`, `FEDFUNDS`).

Prefer the official FRED API via the `fredapi` package. It needs a free key, so
if one isn't set, prompt the user to get it — this takes a minute and unlocks
search and metadata that the keyless path can't do. See the "API keys" section of
`SKILL.md`. Only fall back to the keyless `pandas-datareader` path (bottom of this
file) if the user would rather not get a key.

## Primary path — `fredapi` (needs `FRED_API_KEY`)

```python
import os
import pandas as pd
from fredapi import Fred

os.makedirs("data", exist_ok=True)
fred = Fred(api_key=os.environ["FRED_API_KEY"])

codes = ["CPIAUCSL", "UNRATE"]
df = pd.DataFrame({c: fred.get_series(c, observation_start="2000-01-01") for c in codes})
df.index.name = "DATE"
df.to_csv("data/fred_series.csv")
print(df.shape, list(df.columns), df.index.min().date(), "->", df.index.max().date())
print("missing per column:\n", df.isna().sum())   # surface unreleased months / data gaps
```

## Finding the right series

If the user names a concept rather than a code, either use the common one (CPI →
`CPIAUCSL`, real GDP → `GDPC1`, unemployment rate → `UNRATE`, fed funds →
`FEDFUNDS`, 10-yr Treasury → `DGS10`) or search — the API makes this easy:

```python
res = fred.search("unemployment rate")          # DataFrame indexed by series id
print(res[["title", "frequency", "units"]].head())
```

Confirm the series with the user when there's ambiguity — e.g. seasonally
adjusted CPI-U (`CPIAUCSL`) vs not-seasonally-adjusted (`CPIAUCNS`) vs core
(`CPILFESL`).

## Keyless fallback — `pandas-datareader`

Only if the user declines to get a key. No key needed for known series codes, but
no search or metadata.

```python
import pandas_datareader.data as web
df = web.DataReader(["CPIAUCSL", "UNRATE"], "fred", start="2000-01-01")
df.to_csv("data/fred_series.csv")
```

## Gotchas

- Series have different frequencies (daily, monthly, quarterly). Merging series of
  different frequencies produces NaNs — resample or align deliberately.
- Watch for trailing/interior NaNs: the most recent month is often not released
  yet, and real gaps happen (e.g. the 2025 shutdown delayed CPI and jobs data).
  Report them so the user isn't surprised when plotting.
- Some series are levels, some are rates, some are indexes; check units before
  computing returns or growth. A frequent trap: `CPIAUCSL` is a price *index*, not
  inflation — if the user wants inflation, transform it, e.g. year-over-year
  `df["CPIAUCSL"].pct_change(12) * 100`. Deliver what they asked for (a rate),
  not the raw level.
