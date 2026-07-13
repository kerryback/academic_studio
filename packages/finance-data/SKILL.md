---
name: finance-data
description: >-
  Fetch free financial, market, and economic data during a conversation and save
  it as CSV for analysis — stock/ETF/index prices and OHLCV, company fundamentals
  and SEC filings, macroeconomic and interest-rate time series, and asset-pricing
  factor returns. Use this whenever the user wants to get, download, pull, load,
  or grab market/finance/economic data (e.g. "get Apple's daily prices since
  2015", "download the Fama-French factors", "pull CPI and unemployment from
  FRED", "grab Tesla's 10-K revenue", "I need the daily Treasury yield curve"),
  even when they don't name a source — and especially when the data is a step
  toward analysis they want done. Routes the request to the right free source
  (Yahoo Finance, Stooq, SEC EDGAR, FRED, Ken French Data Library, FinnHub,
  Financial Modeling Prep, US Treasury), confirms the choice with the user, runs
  Python to fetch it, and saves a CSV.
---

# Finance Data

Help the user obtain free finance and economic data with Python, save it as a
CSV, and keep going with whatever analysis they actually wanted. Getting the data
is usually a means to an end — treat it as one step in a larger conversation, not
the finish line.

## The loop

1. Interpret the request — what *kind* of data is this? Map it to a category in
   the routing table below.
2. Pick candidate source(s) from that category.
3. Confirm with the user which source to try — unless there's only one sensible
   choice, or the user already named a source, in which case just proceed. Keep
   this light: "I can pull this from Yahoo Finance (quick, no key) or Stooq —
   want me to use Yahoo?" Don't interrogate.
4. Check whether the chosen source needs an API key (see "API keys"). If it does
   and the key isn't set, tell the user how to get one and where to put it before
   running code.
5. Read the matching `references/<source>.md` file and run Python to fetch the
   data. Load it into a pandas DataFrame and save a CSV (see "Output
   conventions"). Prefer running the fetch in the user's Python so the DataFrame
   stays live for the analysis that follows.
6. Report what you saved — the path, the shape (rows × columns), the columns, and
   the date range — then continue with the user's analysis.

If a fetch fails (a bad ticker, a rate limit, a source that's temporarily down),
say so plainly and offer the fallback listed for that category rather than
silently retrying forever.

## Routing table

| The user wants… | Try first | Fallback / also | Key? |
|---|---|---|---|
| Stock / ETF / index prices, OHLCV, dividends, splits | Yahoo Finance (`yfinance`) | Stooq | No |
| Company fundamentals (income statement, balance sheet, cash flow) | Yahoo Finance (`yfinance`) | FinnHub, SEC EDGAR (XBRL) | No / FinnHub key |
| SEC filings, exact reported figures, XBRL facts, filing text | SEC EDGAR | — | No (User-Agent required) |
| Macroeconomic / financial time series (CPI, GDP, unemployment, rates, money supply, spreads) | FRED (`pandas-datareader`) | — | No |
| Interest rates / the Treasury yield curve | US Treasury (daily par yields) | FRED (`DGS10`, `DGS2`, …) | No |
| Asset-pricing factor returns & sorted portfolios (Fama-French, momentum, industry) | Ken French Data Library | — | No |
| Real-time-ish quotes, company news, analyst recommendations, earnings | FinnHub | Yahoo Finance | FinnHub free key |
| Crypto / FX | Yahoo Finance (`BTC-USD`, `EURUSD=X`) | Stooq, FRED (FX) | No |

Notes on picking:

- Yahoo is the fastest keyless path for prices and is usually the right default.
  It's an unofficial API, so it occasionally breaks or rate-limits — Stooq is the
  keyless backup for prices.
- For *exact as-reported* financial-statement numbers (auditable, tied to a
  filing), prefer SEC EDGAR's XBRL data over Yahoo/FinnHub, which are convenient
  but less authoritative and sometimes restated.
- The Treasury yield curve is available both directly from Treasury and as
  individual constant-maturity series on FRED; use FRED when the user also wants
  other FRED series in the same pull.

## Source reference files

Each source has a short reference file with a tested Python recipe. Read the one
you need when you get there — don't preload them all.

- `references/yahoo.md` — Yahoo Finance via `yfinance`: prices, OHLCV, dividends,
  fundamentals, crypto/FX.
- `references/stooq.md` — Stooq via `pandas-datareader`: keyless price fallback,
  symbol suffixes.
- `references/fred.md` — FRED via `pandas-datareader`: keyless series fetch,
  common series codes, finding codes on the FRED website.
- `references/ken_french.md` — Ken French Data Library via `pandas-datareader`:
  factors and sorted portfolios, listing available datasets, the percent-units
  gotcha.
- `references/edgar.md` — SEC EDGAR: ticker→CIK lookup, XBRL company facts,
  filing lists, full-text search, the mandatory User-Agent header.
- `references/finnhub.md` — FinnHub via the `finnhub-python` client: quotes,
  profile, basic financials, news; what the free tier does and doesn't include.
- `references/treasury.md` — US Treasury daily par yield curve, keyless CSV feed.

## MCP connectors (FinnHub and Financial Modeling Prep)

The Finance Data package also installs two MCP connectors whose tools may be
available in the session: `finnhub` (real-time US quotes, company profile,
earnings, news, analyst consensus) and `fmp` (Financial Modeling Prep — quotes,
financial statements, analyst data, insider trades, economic series). Use them
for quick lookups the user just wants to *know* — "what's Apple trading at?",
"any news on Tesla today?" — where writing Python and saving a CSV would be
overkill. For data the user wants saved, charted, or analyzed, prefer the
Python recipes in this skill so the result lands in a DataFrame and a CSV.

Both connectors read their API keys from the environment: `FINNHUB_API_KEY`
(the same key as the Python FinnHub path) and `FMP_API_KEY`. If a connector's
tools fail with an authentication error, walk the user through getting the key
(see "API keys") and note that the app must be restarted after adding a key to
the shell profile.

## API keys

Two sources use free API keys: FinnHub and Financial Modeling Prep (FRED is
keyless via `pandas-datareader` — never look for or prompt for a FRED key).
When a request routes to a keyed source and the key isn't already set, walk
the user through getting it rather than silently routing around it.

- FinnHub — register for a free key at https://finnhub.io/register and store it as
  `FINNHUB_API_KEY` (the recipe also accepts the common misspelling
  `FINHUB_API_KEY`).
- Financial Modeling Prep — register for a free key at
  https://site.financialmodelingprep.com/register and store it as
  `FMP_API_KEY`. Used only by the `fmp` MCP connector; the free tier is
  rate-limited (roughly 250 requests/day), so it suits lookups, not bulk pulls.

How to prompt:

1. Check `os.environ` first — the key may already be set (`FINNHUB_API_KEY` or
   `FINHUB_API_KEY`).
2. If it's missing, give the user the signup link above and ask them to paste the
   key back, or to set the environment variable themselves.
3. Prefer an environment variable over hard-coding the key in a script, so it
   isn't committed or shared. On macOS/Linux they can add
   `export FINNHUB_API_KEY=...` to their shell profile (`~/.zshrc`), or set it
   for one session. In a Jupyter/analysis context, reading from `os.environ` and
   prompting once with `getpass.getpass()` is a reasonable middle ground.
4. If the user would rather not get a key at all, offer the keyless alternative
   from the routing table (e.g. Yahoo instead of FinnHub for a quote).

## Output conventions

- Save CSVs into a `data/` folder in the workspace (create it if needed) — but if
  the user names a location, use theirs. The exact filename and format are
  secondary to the analysis — pick something descriptive, like
  `data/aapl_prices.csv` or `data/ff_factors_monthly.csv`.
- Keep the date index in the CSV (`df.to_csv(path)` with a DatetimeIndex is
  fine). Parse dates back with `pd.read_csv(path, index_col=0, parse_dates=True)`.
- After saving, print a one-line confirmation with shape, columns, and date
  range so the user can sanity-check coverage before you build on it.
- Don't overwrite an existing file the user may care about without noting it.

## Dependencies

Assume these libraries are already installed — they ship with this skill as the
Academic Studio "Finance Data" package, so don't probe for them or run
`pip install` up front; just import and use them:

- `pandas`
- `yfinance`
- `pandas-datareader`
- `finnhub-python` (imported as `finnhub`)
- `requests`

Only if an import genuinely fails at runtime, tell the user to install the
Finance Data package from Help → Run Setup (or, as a fallback,
`pip install yfinance pandas-datareader finnhub-python requests`) — then
retry. Don't check preemptively.
