<p align="center">
  <img src="overlay/icons/academic-studio.png" width="100" alt="Academic Studio">
</p>


# Academic Studio

New to VS Code and Academic Studio? [Take the Tour &rarr;](https://academic-studio.com/tour.html)

---

[Jump to Downloads &darr;](#downloads)

Academic Studio is designed for business professionals, students, faculty, and researchers. It bundles Claude Code with other useful tools.  It is an easy-to-use and easy-to-install version of **Claude Code in VS Code**, which is a powerful framework for building things with AI.  A paid Anthropic account (Pro, Max, or API) is required to use Claude Code.  Enter `/login` in the prompt window on first use to connect to your Anthropic account.

## Features

- Claude Code, built in. The Claude Code assistant opens automatically and works alongside your files. Ask it to write, analyze data, build slides, or create documents.
- Real documents. Claude can create and edit Excel, Word, PowerPoint, PDF, LaTeX, and Quarto files using its document skills.
- A workspace, not just a chat. Open a folder and your files and your conversation history live with that project — your work persists.
- Use — or have Claude use — Python, Jupyter, R, LaTeX, and Quarto for data analysis, statistics, typesetting, and document creation.
- Easy setup. Help → Run Setup… lets you pick your profile (Faculty or Students & Professionals), and install supporting programs (Python, Node.js, Quarto, R, TinyTeX) and extensions with one click.
- Key Python libraries — the scientific stack and libraries to create Office documents — are installed with Python.
- Shares skills, connectors, and CLAUDE.md files with Claude Code CLI and the Code mode of Claude Desktop; conversation history is shared with the CLI.
- Help → Academic Studio Help provides instructions for getting started with LaTeX, Quarto, etc.

## Compared to Claude Desktop

Academic Studio runs Claude Code like the Code mode of Claude Desktop, which is the same as Claude Code CLI. The principal benefits of Academic Studio relative to Claude Desktop Code for business professionals and students are the integrated file browser and file viewer/editor and the easy installation of Python and Node.js.

For faculty and researchers, the one-click run/build for LaTeX, Quarto, Python, R, and Jupyter are the most important benefits.

## Compared to VS Code

Under the hood Academic Studio is VS Code (via the open-source VSCodium), so it will feel familiar if you've used VS Code — but it's simplified for getting work done:

- Menus and toolbars are trimmed, with beginner-friendly defaults.
- Claude Code is built-in and opens on startup.
- Easy installation of important tools — Office Viewer, PDF, Quarto, Python, Jupyter, R, LaTeX, Node.js.

## Packages

Packages are optional add-ons for specific kinds of work. Each one bundles everything a task needs — Python libraries plus a skill that teaches Claude how to use them — so a single install makes Claude genuinely good at something new. Packages are delivered online: when a new package (or an update to one you have) becomes available, Academic Studio offers it the next time you start the app, with no need to download a new version of Academic Studio itself.

### Finance Data

The Finance Data package lets you ask Claude for financial, market, and economic data in plain English — "get Apple's daily prices since 2015," "download the Fama-French factors," "pull CPI and unemployment from FRED" — and get a clean CSV file ready for analysis. It routes each request to the right free source:

- Yahoo Finance and Stooq — stock, ETF, and index prices
- SEC EDGAR — company fundamentals from 10-K/10-Q filings
- FRED — macroeconomic and interest-rate series
- Ken French Data Library — asset-pricing factor returns
- FinnHub — company news and estimates
- US Treasury — the daily yield curve

Installing the package sets up the Python libraries these sources need and the skill that teaches Claude which source to use and how. A couple of sources (FRED, FinnHub) work best with free API keys — Claude will walk you through getting them the first time they're needed.

### Installing packages

There are two ways, both built in:

- When you start the app, Academic Studio checks for packages you don't have yet and shows a notification — click Install and it's done.
- Any time, open Help → Run Setup… and scroll to Additional packages. Missing packages are pre-checked; click "Install selected programs & packages".

Packages that use Python (like Finance Data) need Python installed first — Run Setup handles that too. Installed skills live in your shared Claude configuration, so they also work from Claude Code CLI and the Code mode of Claude Desktop.

## Downloads {#downloads}



Download Academic Studio from the **[Downloads page &rarr;](https://academic-studio.com/#downloads)**:

- macOS (Apple Silicon) — M1 or later; does not run on older Macs with Intel chips
- Windows — for most Windows computers (x64)
- Windows ARM — Microsoft Surface Pro and other Windows ARM computers

All releases are also available on the [GitHub Releases page](https://github.com/kerryback/academic_studio/releases).

------------------------------------------------------------------------

<p align="center">
  <img src="site/affiliation.png" width="400" alt="Academic Studio">
</p>
