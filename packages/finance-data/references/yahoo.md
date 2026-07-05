# Yahoo Finance (`yfinance`)

Keyless. Best default for stock/ETF/index prices, OHLCV, dividends, splits, and
quick fundamentals. Unofficial API — occasionally rate-limits or breaks; fall
back to Stooq for prices.

## Prices / OHLCV

### Adjustments — ask before fetching

This is the easiest thing to get wrong, and yfinance's labels invite the mistake.
Yahoo prices are **always adjusted for splits**. The real choice is whether to
**also adjust for dividends**. yfinance's current default (`auto_adjust=True`)
returns prices adjusted for *both* splits and dividends but labels the column
`Close` (not `Adj Close`) — so a column named "Close" can easily be mistaken for
an unadjusted price when it is actually the dividend-adjusted one.

So, before fetching prices, ask the user this (verbatim is fine):

> Prices will be adjusted for splits. Do you also want prices adjusted for
> dividends? Percent changes of dividend-adjusted prices equal total returns
> including dividends.

Then pick the call to match their answer:

```python
import os
import pandas as pd
import yfinance as yf
os.makedirs("data", exist_ok=True)

# YES, adjust for dividends (total-return prices): auto_adjust=True.
# The 'Close' column is split + dividend adjusted; its % changes are total returns.
df = yf.download("AAPL", start="2015-01-01", auto_adjust=True)

# NO, splits only (not dividend adjusted): auto_adjust=False.
# Use the 'Close' column (split-adjusted). The same frame also has 'Adj Close',
# which IS the split + dividend adjusted series — so don't confuse the two.
df = yf.download("AAPL", start="2015-01-01", auto_adjust=False)
```

Tell the user which they got, and if you save a CSV, note in your reply whether
the prices are dividend-adjusted (total return) or split-only.

### Saving and multiple tickers

Recent `yfinance` (≈0.2.5x+) returns a `(field, ticker)` MultiIndex on the
columns **even for a single ticker**, so a plain `to_csv` writes tuple headers.
Flatten to the field names before saving:

```python
if isinstance(df.columns, pd.MultiIndex):
    df.columns = df.columns.get_level_values(0)   # -> Open, High, Low, Close, ...
df.to_csv("data/aapl_prices.csv")
print(df.shape, list(df.columns), df.index.min().date(), "->", df.index.max().date())
```

Multiple tickers keep the MultiIndex, which is what you want — slice a field:

```python
df = yf.download(["AAPL", "MSFT", "SPY"], start="2015-01-01", auto_adjust=True)
close = df["Close"]              # one column per ticker (adjusted per the choice above)
close.to_csv("data/close_prices.csv")
```

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

- Adjustments: see "Adjustments — ask before fetching" above. Short version:
  `auto_adjust=True` (the recent default) gives split + dividend adjusted prices
  in a column named `Close`; `auto_adjust=False` gives split-only `Close` plus a
  separate split + dividend `Adj Close`. Always confirm dividend adjustment first.
- An empty DataFrame usually means a bad symbol or a rate limit — retry once,
  then fall back to Stooq.
- `Ticker.info` can be flaky; wrap in try/except and don't block the whole task
  on it.
