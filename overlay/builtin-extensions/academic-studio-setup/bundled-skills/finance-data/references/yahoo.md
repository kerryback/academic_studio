# Yahoo Finance (`yfinance`)

Keyless. Best default for stock/ETF/index prices, OHLCV, dividends, splits, and
quick fundamentals. Unofficial API — occasionally rate-limits or breaks; fall
back to Stooq for prices.

## Prices / OHLCV

```python
import os
import pandas as pd
import yfinance as yf

os.makedirs("data", exist_ok=True)

# One ticker. auto_adjust=True gives split/dividend-adjusted OHLC.
df = yf.download("AAPL", start="2015-01-01", end=None, auto_adjust=True)
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)   # single-ticker still comes MultiIndexed
df.to_csv("data/aapl_prices.csv")
print(df.shape, list(df.columns), df.index.min().date(), "->", df.index.max().date())
```

Recent `yfinance` (≈0.2.5x+) returns a `(field, ticker)` MultiIndex on the
columns **even for a single ticker**, so a plain `to_csv` writes tuple headers.
Flatten to the field names before saving:

```python
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)   # -> Open, High, Low, Close, ...
```

Multiple tickers keep the MultiIndex, which is what you want — slice a field:

```python
df = yf.download(["AAPL", "MSFT", "SPY"], start="2015-01-01", auto_adjust=True)
close = df["Close"]              # DataFrame of adjusted closes, one column per ticker
close.to_csv("data/close_prices.csv")
```

If the user specifically wants a raw close plus a separate adjusted series, pass
`auto_adjust=False` and you'll get both `Close` and `Adj Close` columns.

Common symbols: indexes use a caret (`^GSPC` S&P 500, `^IXIC` Nasdaq, `^DJI`),
crypto uses `BTC-USD`/`ETH-USD`, FX uses `EURUSD=X`.

## Dividends, splits, actions

```python
t = yf.Ticker("AAPL")
t.dividends.to_csv("data/aapl_dividends.csv")   # Series indexed by date
t.splits.to_csv("data/aapl_splits.csv")
```

## Fundamentals (convenient, not authoritative)

```python
t = yf.Ticker("MSFT")
t.income_stmt.to_csv("data/msft_income.csv")     # annual; use .quarterly_income_stmt for quarterly
t.balance_sheet.to_csv("data/msft_balance.csv")
t.cashflow.to_csv("data/msft_cashflow.csv")
info = t.info                                    # dict: sector, marketCap, trailingPE, etc.
```

For exact as-reported / auditable figures, prefer SEC EDGAR (`references/edgar.md`).

## Gotchas

- `auto_adjust=True` (now the default in recent versions) adjusts OHLC for
  splits and dividends; set `auto_adjust=False` and use the `Adj Close` column if
  the user wants raw closes plus a separate adjusted series.
- An empty DataFrame usually means a bad symbol or a rate limit — retry once,
  then fall back to Stooq.
- `Ticker.info` can be flaky; wrap in try/except and don't block the whole task
  on it.
