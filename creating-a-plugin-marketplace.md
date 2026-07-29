# Creating a plugin marketplace for Academic Studio

This guide is for turning data scripts (WRDS, etc.) into Claude Code **plugins**,
published from **your own marketplace**, so they can be listed in the Academic
Studio catalog. It's written to be read by both a person and a coding agent
(Claude Code) — the agent can create the files and run the commands directly.

There is a complete working example to copy from: **`kerryback/skills`** on GitHub
— specifically `plugins/finance-data`. It's a data-fetching plugin with the exact
shape a WRDS plugin should have (its own Python environment + CSV output). When in
doubt, mirror it.

---

## The big picture

- A **marketplace** is just a Git repo with a `.claude-plugin/marketplace.json`
  file at its root that lists one or more plugins.
- A **plugin** is a subfolder of that repo containing a `.claude-plugin/plugin.json`
  and a `skills/` folder (a data plugin is a *skill* — instructions plus recipes
  Claude runs).
- You own and maintain your marketplace. Academic Studio does **not** need write
  access to it. To publish your plugins in Academic Studio, you send Kerry a few
  facts (see the last section) and he adds a catalog entry that points at your
  marketplace. Academic Studio then installs your plugins with the `claude` CLI:
  `claude plugin marketplace add <your repo>` → `claude plugin install <plugin>@<your marketplace>`.

So your whole job is: make a Git repo, put plugins in it, test them, push. That's it.

---

## Prerequisites

- The `claude` CLI (Claude Code) installed and logged in. Check: `claude --version`
  (need ≥ 2.1). The plugin/marketplace subcommands used below require a recent build.
- `git` and a GitHub account.
- Python 3.9+ for any plugin that runs Python (WRDS does).

---

## Step 1 — Create the marketplace repo

```bash
mkdir my-skills && cd my-skills
git init
mkdir -p .claude-plugin plugins
```

Create `.claude-plugin/marketplace.json`:

```json
{
  "name": "colleague-skills",
  "owner": { "name": "Your Name" },
  "description": "Research data plugins (WRDS, ...).",
  "plugins": [
    {
      "name": "wrds-data",
      "source": "./plugins/wrds-data",
      "description": "Query WRDS (CRSP, Compustat, ...) and save results as CSV."
    }
  ]
}
```

- `name` is the **marketplace id** — it's what appears after the `@` when installing
  (`wrds-data@colleague-skills`). Lowercase, dashes; pick it once and keep it stable.
- Each entry's `source` is the path to that plugin's folder in this repo.
- Add one entry per plugin. Start with one; you can add more later.

---

## Step 2 — Scaffold the first plugin

```bash
mkdir -p plugins/wrds-data/.claude-plugin
mkdir -p plugins/wrds-data/skills/wrds-data/references
```

Create `plugins/wrds-data/.claude-plugin/plugin.json`:

```json
{
  "name": "wrds-data",
  "description": "Query WRDS (CRSP, Compustat, IBES, ...) and save results as CSV for analysis.",
  "version": "0.1.0",
  "author": { "name": "Your Name" }
}
```

- `version` is **semver** (`MAJOR.MINOR.PATCH`). Bump it every release — Academic
  Studio uses it to show an "update available" prompt.
- A skill-only plugin needs no extra fields; Claude Code auto-discovers `skills/`.
  (Only add `"commands"`, `"agents"`, `"hooks"` fields if you actually build those —
  a data plugin usually doesn't.)

---

## Step 3 — Decide how the plugin's code runs (this is the important one)

There are two patterns. Choose by **dependencies**:

- **No third-party Python packages** (standard library only) → run the code in
  place, no environment needed.
- **Needs third-party packages** → the plugin installs its own **dedicated
  virtual environment** and runs everything through it. **WRDS is this case** (it
  needs the `wrds` package, `pandas`, etc.).

> Why this matters, and why you must NOT `pip install` into "the user's Python":
> research machines have several Pythons (system, Homebrew, conda, pyenv, a
> notebook kernel...). `pip` and `python` routinely disagree about what's
> installed. If your plugin installs into whichever Python happens to be first on
> PATH, it will "work on my machine" and mysteriously fail on others. A dedicated
> venv that the plugin *owns* removes all of that ambiguity. This is a settled
> convention — `finance-data` does exactly this.

So a WRDS plugin owns a venv at **`~/.wrds-data/venv`**, installs `wrds` + `pandas`
into it, and runs every query through `~/.wrds-data/venv/bin/python`. It never
touches the system Python.

Because that venv is isolated from wherever the user does their analysis, the
plugin **saves its results to a file** (CSV) that the user's own environment reads
back. The CSV is the hand-off. Use CSV, not parquet — pandas reads CSV anywhere
with no extra dependency.

---

## Step 4 — The venv bootstrap (`setup.py`)

Put a `setup.py` inside the skill folder (`plugins/wrds-data/skills/wrds-data/setup.py`).
Copy `finance-data`'s and change the library list. Here's the skeleton — the only
thing to edit per plugin is `LIBS`/`IMPORTS`/the home name:

```python
#!/usr/bin/env python3
"""wrds-data runtime setup — build/repair its dedicated venv (~/.wrds-data/venv)."""
from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path

LIBS = ["wrds", "pandas"]                 # what the recipes import (edit per plugin)
IMPORTS = ["wrds", "pandas"]              # module names to verify (wrds imports as `wrds`)
HOME_ENV = "WRDS_DATA_HOME"               # env override for the home dir
DEFAULT_HOME = Path.home() / ".wrds-data" # ~/.wrds-data
MIN_PY = (3, 9)

def home() -> Path:
    return Path(os.environ.get(HOME_ENV, DEFAULT_HOME)).expanduser()
def venv_dir() -> Path: return home() / "venv"
def venv_python(v: Path | None = None) -> Path:
    v = v or venv_dir()
    return v / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
def _run(c): return subprocess.run(c, capture_output=True, text=True)
def _imports_ok(py): return _run([str(py), "-c", "import " + ", ".join(IMPORTS)]).returncode == 0

def ready() -> bool:
    py = venv_python(); return py.exists() and _imports_ok(py)

def do_install() -> int:
    if sys.version_info[:2] < MIN_PY:
        print(f"ERROR: Python {MIN_PY[0]}.{MIN_PY[1]}+ required.", file=sys.stderr); return 2
    home().mkdir(parents=True, exist_ok=True)
    have_uv = bool(shutil.which("uv")); py = venv_python()
    if not py.exists():
        r = _run(["uv", "venv", str(venv_dir())]) if have_uv else _run([sys.executable, "-m", "venv", str(venv_dir())])
        if r.returncode: print("ERROR: venv:\n" + r.stderr, file=sys.stderr); return 1
    if have_uv:
        r = _run(["uv", "pip", "install", "--python", str(py), "--upgrade", *LIBS])
    else:
        _run([str(py), "-m", "pip", "install", "--upgrade", "pip"])
        r = _run([str(py), "-m", "pip", "install", "--upgrade", *LIBS])
    if r.returncode: print("ERROR: install:\n" + r.stderr, file=sys.stderr); return 1
    if not _imports_ok(py): print("ERROR: imports failed after install.", file=sys.stderr); return 1
    print(f"Done. runtime: {py}"); return 0

def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true"); ap.add_argument("--yes", action="store_true")
    ap.add_argument("--runtime-path", action="store_true"); a = ap.parse_args(argv)
    if a.runtime_path:
        print(str(venv_python())) if ready() else sys.exit(1); return 0
    if a.check:
        print("READY" if ready() else "NOT READY — run: python3 setup.py --yes"); return 0
    if a.yes: return do_install()
    print(f"Plan: create {venv_dir()} and install {', '.join(LIBS)}. Run with --yes."); return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- Uses `uv` if the user has it (fast), otherwise the standard-library `venv` + `pip`
  — so it works with nothing but Python. It never installs system software.
- `--check` / `--yes` / `--runtime-path` are the modes the skill calls.

---

## Step 5 — Write the skill (`SKILL.md`)

`plugins/wrds-data/skills/wrds-data/SKILL.md`. The front-matter `description` is
what makes Claude *reach for* the skill, so make it rich with trigger phrases.
Structure it like `finance-data`'s SKILL.md:

```markdown
---
name: wrds-data
description: >-
  Pull data from WRDS — CRSP stock prices and returns, Compustat fundamentals,
  IBES estimates, ... — and save it as CSV for analysis. Use whenever the user
  wants CRSP/Compustat/WRDS data (e.g. "get monthly CRSP returns for 2010-2020",
  "pull Compustat annual fundamentals", "download IBES estimates for AAPL").
---

# WRDS Data

## Runtime — a dedicated environment (set up once)
This skill does NOT use the system Python. It runs through a private venv at
`~/.wrds-data/venv`. Before the first query in a session, ensure it exists:
1. `python3 <skill-dir>/setup.py --check` — if READY, done.
2. Otherwise `python3 <skill-dir>/setup.py --yes` — creates the venv and installs
   `wrds` + `pandas` (uv if present, else venv+pip). Idempotent.
Then run EVERY query with that interpreter, never bare `python`/`python3`:
`~/.wrds-data/venv/bin/python <script>` (Windows: `~/.wrds-data/venv/Scripts/python.exe`).

## WRDS credentials (first use)
WRDS needs a username/password (a WRDS account, wrds-www.wharton.upenn.edu). The
first `wrds.Connection()` prompts for them and offers to save a `~/.pgpass` entry
so future connections are passwordless. Walk the user through this; never hardcode
credentials in a script.

## The loop
1. Interpret the request; map it to a WRDS library/table (CRSP, Compustat, IBES, ...).
2. Read the matching `references/<name>.md` recipe.
3. Run the query with the venv Python. Load into a pandas DataFrame.
4. Save a CSV into the project `data/` folder (see below).
5. Report path, shape, columns, date range; continue with the user's analysis.

## Output conventions
The venv is isolated from where the user analyzes, so the CSV on disk is the
hand-off. Save `df.to_csv("data/<descriptive>.csv")` (keep the date index). The
user's own environment reads it with `pd.read_csv(path, index_col=0, parse_dates=True)`
— no extra libraries. Print a one-line confirmation (shape, columns, range).

## Dependencies
All libraries live in the venv (see Runtime). Never `pip install` into the system
Python and never probe it with imports. If a query fails on a missing library,
re-run `python3 <skill-dir>/setup.py --yes` to repair.
```

Put one tested recipe per source in `references/<name>.md` (e.g. `crsp.md`,
`compustat.md`) — a short, working Python snippet Claude reads when it needs it.
Keep the recipes pure code; the SKILL.md tells Claude to run them via the venv.

---

## Step 6 — Test locally before pushing

You can add a **local path** as a marketplace, so you can test without publishing:

```bash
# from anywhere:
claude plugin validate ./my-skills                 # checks marketplace.json + plugin manifests
claude plugin marketplace add ./my-skills          # register your local repo as a marketplace
claude plugin install wrds-data@colleague-skills --scope user
claude plugin list                                 # confirm it's installed + enabled
```

Then open a Claude Code session in a scratch folder and ask for some data — verify
the skill triggers, the venv builds, credentials flow, and a CSV lands. To iterate:

```bash
claude plugin uninstall wrds-data@colleague-skills
claude plugin marketplace update colleague-skills  # after you edit files
# reinstall and retest
```

---

## Step 7 — Publish

```bash
git add -A && git commit -m "wrds-data plugin v0.1.0"
# create the repo on GitHub (e.g. gh repo create <you>/my-skills --public --source . --push)
git push -u origin main
```

Confirm it installs from GitHub (not just the local path):

```bash
claude plugin marketplace remove colleague-skills   # drop the local one
claude plugin marketplace add <you>/my-skills       # add the GitHub one (owner/repo)
claude plugin install wrds-data@colleague-skills --scope user
```

**Releasing updates:** edit the files, bump `version` in the plugin's `plugin.json`,
commit, push. That's the whole release. (No tags required; Academic Studio tracks
the version you advertise — see below.)

---

## Step 8 — Hand it to Academic Studio

You don't touch Academic Studio's repo. Send Kerry these facts for each plugin and
he adds a catalog entry that points at your marketplace:

- **Marketplace repo**: `<you>/my-skills` (the GitHub `owner/repo`)
- **Marketplace name**: the `name` from your `marketplace.json` (e.g. `colleague-skills`)
- **Plugin name**: e.g. `wrds-data`
- **Current version**: e.g. `0.1.0` (matches `plugin.json`; Academic Studio shows an
  "update available" prompt when you bump it, so tell Kerry when you release)
- **One-line label** for the Run Setup list
- **Category**: which group it belongs in (e.g. "Teaching & Research")
- **Prereqs**: e.g. Python (needed to build the venv) — and note WRDS needs an
  account + credentials
- **Your GitHub page** to link to (for attribution)

When you release a new version, just tell Kerry the new number so he bumps what
Academic Studio advertises.

---

## Notes for the agent building this

- Mirror `github.com/kerryback/skills`, `plugins/finance-data`, closely — same
  layout, same `setup.py` shape, same SKILL.md sections. It is the reference
  implementation for a data plugin with dependencies.
- The single most important rule: **a plugin with third-party dependencies owns a
  venv at `~/.<plugin>/venv` and runs everything through it; it never installs into
  or imports from the system Python.** Data crosses to the user's analysis
  environment as a **CSV file**, not a live object.
- Keep `marketplace.json` `name`, plugin `name`, and the skill folder name aligned
  and stable — renaming them later breaks installs and detection.
- `plugin.json` `version` is semver and must be bumped on every release.
- Validate before pushing: `claude plugin validate <path>`.
```
