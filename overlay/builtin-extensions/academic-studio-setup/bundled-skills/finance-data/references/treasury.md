# US Treasury — daily par yield curve

Keyless. The official daily Treasury Par Yield Curve Rates (the 1-mo … 30-yr
constant-maturity yields), straight from home.treasury.gov as CSV, one calendar
year per request.

```python
import os
import pandas as pd

os.makedirs("data", exist_ok=True)

year = 2024
url = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    f"daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve"
    f"&field_tdr_date_value={year}&page&_format=csv"
)
df = pd.read_csv(url, parse_dates=["Date"]).set_index("Date").sort_index()
df.to_csv(f"data/treasury_yield_curve_{year}.csv")
print(df.shape, list(df.columns), df.index.min().date(), "->", df.index.max().date())
```

Columns are the maturities: `1 Mo, 2 Mo, 3 Mo, 4 Mo, 6 Mo, 1 Yr, 2 Yr, 3 Yr,
5 Yr, 7 Yr, 10 Yr, 20 Yr, 30 Yr` (yields in percent). Some short maturities are
NaN before they were introduced. A full year is ~250 rows (business days only) —
that's complete, not missing data.

Multiple years — fetch and concatenate:

```python
frames = []
for year in range(2020, 2025):
    url = (
        "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
        f"daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve"
        f"&field_tdr_date_value={year}&page&_format=csv"
    )
    frames.append(pd.read_csv(url, parse_dates=["Date"]))
df = pd.concat(frames).set_index("Date").sort_index()
```

## Alternative — FRED

The same maturities exist on FRED as constant-maturity series (`DGS1MO`,
`DGS3MO`, `DGS1`, `DGS2`, `DGS5`, `DGS10`, `DGS30`). Use FRED
(`references/fred.md`) when the user also wants other FRED series in one pull, or
wants a single long continuous history rather than per-year files.
