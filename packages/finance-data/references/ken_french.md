# Ken French Data Library (via `pandas-datareader`)

Keyless. Fama-French factors, momentum, sorted portfolios (size/value/etc.), and
industry portfolios — the standard inputs for asset-pricing work. Served as
zipped CSVs from Dartmouth; `pandas-datareader` wraps them.

## List available datasets first

The dataset names are exact and non-obvious, so list them when the user's request
is fuzzy:

```python
from pandas_datareader.famafrench import get_available_datasets
names = get_available_datasets()
print(len(names))
print([n for n in names if "Factors" in n][:20])
```

Common names: `F-F_Research_Data_Factors` (monthly + annual, the 3 factors +
RF), `F-F_Research_Data_Factors_daily`, `F-F_Research_Data_5_Factors_2x3`,
`F-F_Momentum_Factor`, `6_Portfolios_2x3`, `10_Industry_Portfolios`.

## Fetch

`DataReader` returns a **dict**, not a DataFrame: integer keys for each table
(e.g. `0` = monthly, `1` = annual) plus a `'DESCR'` description string.

```python
import os
import pandas_datareader.data as web

os.makedirs("data", exist_ok=True)

# Omit `start` (or pass a very early date like "1900-01-01") for the full
# available history — the monthly 3-factor series begins 1926-07.
ds = web.DataReader("F-F_Research_Data_Factors", "famafrench", start="1990-01-01")
print(ds["DESCR"])               # explains what each table is
monthly = ds[0]                  # DataFrame indexed by period (Mkt-RF, SMB, HML, RF)
# Note: RF (the risk-free rate) ships in the same table, so "the 3 factors" comes
# back as 4 columns — Mkt-RF, SMB, HML, RF. Keep RF; it's needed for regressions.

monthly = monthly / 100.0        # <-- values are in PERCENT; convert to decimals
monthly.to_csv("data/ff_factors_monthly.csv")
print(monthly.shape, list(monthly.columns), monthly.index.min(), "->", monthly.index.max())
```

## Gotchas

- Values are in **percent** (e.g. `1.23` means 1.23%). Divide by 100 before
  compounding with price returns. Always read `ds['DESCR']` to confirm units and
  which table index you want.
- The index is a monthly/annual `PeriodIndex`, not daily dates. Convert with
  `.index.to_timestamp()` if you need to align with daily price data.
- Start/end filter by the data's own period; passing a `start` earlier than the
  dataset simply returns everything available.
