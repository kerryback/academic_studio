# Stooq (via `pandas-datareader`)

Keyless. The backup for prices when Yahoo is rate-limiting or down. Good global
coverage (US, European, and other exchanges), daily EOD OHLCV.

```python
import os
import pandas_datareader.data as web

os.makedirs("data", exist_ok=True)

df = web.DataReader("AAPL.US", "stooq", start="2015-01-01")
df = df.sort_index()             # Stooq returns newest-first; sort ascending
df.to_csv("data/aapl_stooq.csv")
print(df.shape, list(df.columns), df.index.min().date(), "->", df.index.max().date())
```

## Symbols

- US stocks/ETFs take a `.US` suffix: `AAPL.US`, `SPY.US`.
- Indexes use a caret: `^SPX` (S&P 500), `^NDQ` (Nasdaq), `^DJI`.
- FX pairs: `EURUSD`, `GBPUSD`. Commodities: `GC.F` (gold futures), `CL.F` (WTI).
- If a symbol returns empty, try it without/with the exchange suffix, or look it
  up on stooq.com to confirm the exact ticker.

## Gotchas

- Always `sort_index()` — the default order is descending by date, which trips up
  downstream time-series code.
- Columns are `Open, High, Low, Close, Volume` (already split-adjusted); there's
  no separate adjusted-close column.
