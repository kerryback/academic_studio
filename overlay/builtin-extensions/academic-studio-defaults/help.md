# Academic Studio — Help

Academic Studio is a bundle of Claude Code, a file browser, a file viewer and
editor, and a simplified install method for extensions and supporting software
that are especially useful for business professionals, students, and teachers.
Claude Code launches on startup. On first startup, if your computer is not
already logged in to Anthropic, you should enter /login in the Claude prompt
window to initiate the login process.

Open this guide any time from **Help → Academic Studio Help**.

## Features

- Claude Code, built in. The Claude Code assistant opens automatically and works
  alongside your files. Ask it to write, analyze data, build slides, or create
  documents.
- Real documents. Claude can create and edit Excel, Word, PowerPoint, PDF,
  LaTeX, and Quarto files using its document skills — ask for "a budget
  spreadsheet" or "a 10-slide deck" and you get an actual file you can open and
  share.
- A workspace, not just a chat. Open a folder and your files and your
  conversation history lives with that project — your work persists.
- Python, Jupyter, R, LaTeX, Quarto. Bundled support for data analysis,
  notebooks, statistics, typesetting, and HTML document creation.
- Slides with Quarto + reveal.js. Write a `.qmd` file with `format: revealjs`;
  Claude is great at these, and the plain text stays easy to edit afterward.
- One-stop setup. **Help → Run Setup…** lets you pick your profile (Faculty or
  Students & Professionals), choose which extensions are active, and install
  supporting programs (Python, Node.js, Quarto, R, TinyTeX) with one click.
- Installation of important Python libraries: the scientific stack plus
  libraries to create Office documents.

### Getting started

1. Open a folder: **File → Open Folder…** — your files appear in the Explorer on
   the left.
2. Talk to Claude in the panel that opens on startup — ask it to create a file,
   write some code, or build a document.
3. Files save automatically a moment after you stop typing.

## Compared to Claude Desktop

Academic Studio runs Claude Code like the Code mode of Claude Desktop. The
principal benefits for business professionals and students of Academic Studio
relative to Claude Desktop Code are the integrated file browser and file
viewer/editor and the one-stop install of Python and Node.js.

For faculty and researchers, the one-click run/build for Latex, Quarto, Python,
R, and Jupyter are the most important benefits.

Unlike Claude Desktop, Academic Studio does not use point-and-click to install
skills, MCP connectors, and plugins. However, there is an easier method — just
ask Claude to install them.

## Compared to VS Code

Under the hood Academic Studio is VS Code (via the open-source VSCodium), so it
will feel familiar if you've used VS Code — but it's simplified for getting work
done:

- Menus and toolbars are trimmed, with beginner-friendly defaults.
- Files auto-save a second after you stop typing (auto-save is off by default in
  standard VS Code).
- Claude Code is built in and opens on startup.
- One-stop installation for important tools — Office Viewer, PDF, Quarto, Python,
  Jupyter, R, LaTeX — so there's no hunting for extensions.
- **Help → Run Setup…** installs the supporting programs (Python, Quarto, R,
  TinyTeX, Node.js) for you.
- No telemetry and no Copilot; extensions come from the open
  [Open VSX](https://open-vsx.org) registry.

## Tips

- Command Palette (every command): press **F1**.
- Re-run setup any time from **Help → Run Setup…** to change your extensions or
  install more programs.
- R IntelliSense needs the R `languageserver` package: install R, then run
  `install.packages("languageserver")` in R.
