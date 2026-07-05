# FRED (Federal Reserve Economic Data)

Macroeconomic and financial time series from the St. Louis Fed: CPI, GDP,
unemployment, interest rates, money supply, spreads, exchange rates, and tens of
thousands more. Each series has a code (e.g. `CPIAUCSL`, `GDP`, `UNRATE`,
`DGS10`, `FEDFUNDS`).

Fetch FRED through `pandas-datareader` — keyless, no signup, no API key. Do not
prompt the user for a FRED key.

## Fetching series — `pandas-datareader`

```python
import os
import pandas_datareader.data as web

os.makedirs("data", exist_ok=True)
df = web.DataReader(["CPIAUCSL", "UNRATE"], "fred", start="2000-01-01")
df.index.name = "DATE"
df.to_csv("data/fred_series.csv")
print(df.shape, list(df.columns), df.index.min().date(), "->", df.index.max().date())
print("missing per column:\n", df.isna().sum())   # surface unreleased months / data gaps
```

`start` defaults to only ~5 years back — pass an explicit `start` (and `end` if
needed) so you don't silently truncate history the user expects.

## Finding the right series

`pandas-datareader` fetches by series code; it has no search. When the user
names a concept rather than a code:

- Use the common code when it's unambiguous: CPI → `CPIAUCSL`, real GDP →
  `GDPC1`, nominal GDP → `GDP`, unemployment rate → `UNRATE`, fed funds →
  `FEDFUNDS`, 10-yr Treasury → `DGS10`, 2-yr → `DGS2`, 3-mo T-bill → `TB3MS`,
  PCE inflation index → `PCEPI`, core CPI → `CPILFESL`, M2 → `M2SL`,
  recession indicator → `USREC`, EUR/USD → `DEXUSEU`.
- Otherwise, look the code up on the FRED website — series pages are
  `https://fred.stlouisfed.org/series/<CODE>` and search is
  `https://fred.stlouisfed.org/searchresults/?st=<terms>`. Ask the user to
  confirm when there's real ambiguity — e.g. seasonally adjusted CPI-U
  (`CPIAUCSL`) vs not-seasonally-adjusted (`CPIAUCNS`) vs core (`CPILFESL`).

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
