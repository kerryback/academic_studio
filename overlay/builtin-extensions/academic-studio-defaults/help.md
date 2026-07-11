# Academic Studio — Help

Academic Studio is a bundle of Claude Code, a file browser, a file viewer and
editor, and a simplified install method for the extensions and supporting
software most useful to business professionals, students, faculty, and
researchers. Claude Code launches on startup.

On first startup, if your computer is not already logged in to Anthropic, enter
/login in the Claude prompt window to begin. Open this guide any time from
Help → Academic Studio Help.

The short version of everything below: you can do all of it yourself, but the
fastest path is usually to ask Claude. Tell it what you want — "run this Python
script," "make a slide deck from these notes," "compile this LaTeX to PDF" — and
it writes the files and runs the commands for you, in the folder you have open.

## What you can do

### Working with Claude and your files

Open a folder (File → Open Folder…) and your files appear in the Explorer on the
left. Claude Code, in the panel that opens on startup, can read and write the
files in that folder, so you can describe a task and let it create or edit the
right files. Your changes save automatically a moment after you stop typing, and
your conversation history stays with the project.

Because Claude can read your actual files, it also works like a smart search
over your own documents. Ask in plain language — "find the file that says
something about the 2023 budget assumptions" or "which of these papers discusses
survivorship bias?" — and it finds the right one even when you don't remember
the filename or the exact words. It searches the folder you have open, and it
can look elsewhere on your computer when you ask. That is one of the real
advantages of an assistant that works with your files, not just a chat window.

The Claude menu in the menu bar collects everything about how Claude works
for you. Permissions… controls how much Claude may do without asking — from
always asking, to auto-approving file edits, to plan-first (nothing changes
until you approve the plan), to never asking; the choice takes effect when a
new chat is opened. Installed Skills… shows the step-by-step skills Claude
knows — local ones that work only in the current folder and global ones that
work everywhere (open one to read or edit it, or delete it with the trash
icon). New Skill… creates one from a template, and Get More Skills opens
Anthropic's public skills collection. Memory Files (CLAUDE.md)… creates or opens the
instruction files Claude reads at the start of every conversation, and MCP
Connectors… lists the extra tool connections Claude can use.

### Office documents

Claude can create and edit real Excel, Word, PowerPoint, and PDF files using the
Anthropic document skills that are bundled with Academic Studio — ask for "a
budget spreadsheet" or "a 10-slide deck" and you get an actual file you can open
and share. It uses Python and Node.js, which are installed in "Run Setup."
Double-click an Office file in the file browser to open it in the editor for
previewing.

### The terminal

A terminal is a place to type commands — run a script, install a package, check
a result. Open one with Terminal → New Terminal. You can type commands yourself,
but Claude can also run them for you and read the output, which is usually
easier.

### Python

Write a Python script in a `.py` file (File → New File → Python File) and run it
with the Run button at the top right, or type `python3 yourfile.py` in the
terminal. The scientific stack is installed: pandas and NumPy for data,
matplotlib, seaborn, and plotly for charts, and scikit-learn, statsmodels, and
SciPy for modeling and statistics. Ask Claude to write, run, or debug a script,
or to analyze a spreadsheet or CSV for you.

### Jupyter notebooks

A notebook (`.ipynb`) mixes code, written notes, and results — charts and tables
appear right under the code that produces them. Open or create one
(File → New File → Jupyter Notebook) and run cells one at a time with the play
button. Notebooks are good for exploring data and for teaching, where you want to
show each step. Claude can build and edit notebooks.

### R

If you're an R user, you can write an `.R` script (File → New File → R Document)
and run it with `Rscript yourfile.R` in the terminal, or send lines to an
interactive R session. Install packages from inside R with `install.packages("name")`.
 R's code suggestions need one package — run `install.packages("languageserver")`
once. Claude can write and run R for you too.

### LaTeX

For papers, math, and precise typesetting, create a `.tex` file
(File → New File → LaTeX File) and write your document. The LaTeX Workshop
extension compiles it to a PDF automatically as you work (using the bundled
TinyTeX), and the PDF opens in a viewer beside your text. You can also build on
demand with the play (build) icon at the top right of the editor. Once a `.tex`
file is open, a TeX icon appears in the activity bar on the far left — its panel
has buttons to build, view, and clean, plus an outline of your document. If the
PDF isn't showing, save once to build it, or choose "View LaTeX PDF" from that
panel.

The PDF rebuilds automatically whenever the file changes — and since files
auto-save about a second after you stop typing, it recompiles as you work. To
change this behavior, ask Claude to edit the relevant settings file.

By default LaTeX Workshop builds with `latexmk`, which works out what your
document needs and runs the corresponding tools (e.g., bibtex). If you need a
different build recipe, ask Claude, or pick a recipe from the TeX panel.
Everything is configurable in Settings (see below), or Claude can edit the
configuration files for you.

TinyTeX is a minimal version of TeXLive.  You will need to install packages.  The 
current behavior is a bit irritating.  It errors out at the first uninstalled package
you attempt to use.  When you install that and build again, it errors out at the next
uninstalled package.  To avoid this, ask Claude to install the packages a file uses 
before you attempt the first build.

Some recommendations from [paulwintz.com/latex-in-vscode](https://paulwintz.com/latex-in-vscode/) have
been built in: auxiliary files are suppressed in the file browser view, and
double-clicking in a PDF moves your cursor to the corresponding line in the .tex
file as in Overleaf. Overleaf users are recommended to use [Overleaf Git integration](https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization/git-integration)
to push local changes to Overleaf and to pull coauthors' changes to the local
version.

### Markdown

Markdown is a simple way to write formatted text — headings, lists, links — in a
plain `.md` file (File → New File → Markdown File). You can toggle between plain
text editing and WYSIWYG using the pencil icon in the toolbar. Markdown is good
for notes, READMEs, and drafts, and it is a format that AI frequently uses.

### Quarto

Quarto was created by the R Studio team as a language-agnostic extension of R
Markdown. It combines prose with live code, so the numbers, tables, and figures
in a document come from code that runs when you render it. Quarto natively
supports R, Python, Julia, and JavaScript. Render to HTML, PDF, or Word. Create
a new Quarto file with File → New File. Use the preview icon in the toolbar to
render and preview in the file editor. In addition to combining prose with code,
Quarto is also an excellent tool for creating slide decks, websites, and online
books.

### Slides and presentations

Create a Quarto document with `format: revealjs` to make slides as HTML — Claude
is good at these, and the plain text stays easy to edit afterward. To hand
someone a PDF of the slides, use decktape, which converts the HTML slides to a
PDF (ask Claude to run it). For PowerPoint, render the same Quarto file with
`format: pptx`, or ask Claude to build a `.pptx` directly. Claude can create
custom styling of slides using HTML and SCSS. Claude can also use Python and
JavaScript to create PowerPoint decks, but Claude has more difficulty
positioning elements correctly with that approach.

### Git

Git keeps a history of your work — snapshots you can look back at or undo. It is
available here, and set up by default for the Faculty profile. The easy way to
use it is to ask Claude: "commit my changes." That saves a snapshot of where
things stand, with a short note about what changed. Claude can also search your
history — "when did I change the methodology section?" or "find the commit where
I added the tax calculation" — and pull back to an earlier version or extract
elements from earlier versions. As mentioned above, Claude can push your local
changes up to Overleaf and pull your coauthors' changes back down, through
[Overleaf Git integration](https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization/git-integration).

### GitHub

GitHub is an online home for Git projects. Pushing your work to GitHub keeps an
off-machine backup and lets you share it or hand it to others — just ask Claude
to "push this to GitHub." Claude can even create the GitHub repository for you
using the GitHub CLI (`gh`), which you can install from Help → Run Setup…; all
you need is a free GitHub account. GitHub also offers GitHub Pages, a convenient
way to serve websites and online books straight from a repository.

### Command Palette and Settings

The Command Palette is a searchable box for everything the editor can do. Open
it with F1 (or, as an alternate, Cmd+Shift+P on a Mac, Ctrl+Shift+P on Windows)
and start typing. Most of what you type finds a command — "build LaTeX," "new
terminal," "toggle word wrap" — and runs it, without hunting through menus; it
also shows the keyboard shortcut for anything that has one.

It is also how you reach Settings, where the configuration options for the
editor and its extensions live. Type "settings" and choose "Preferences: Open
Settings," then search by plain phrase ("word wrap") or by exact key
(`latex-workshop.latex.autoBuild.run`) and change the value. For options not
shown in the form, "Preferences: Open User Settings (JSON)" opens the raw file.
Either way, you can also just ask Claude to find or change a setting for you.

### Extensions

Extensions are add-ons that give the editor new abilities — language support,
file viewers, and tools. Academic Studio comes with a curated set already
installed for academic work (Quarto, LaTeX, Python, R, Jupyter, an Office
viewer, a PDF viewer, Claude Code, and more). The simple way to manage them is
Help → Run Setup…, where you turn the curated extensions on or off to match your
profile. To go beyond the set, browse and install more from the Extensions view
in the activity bar (drawn from the open Open VSX registry), or just ask Claude
to install what you need.

## Compared to Claude Desktop

Academic Studio runs Claude Code like the Code mode of Claude Desktop. The
principal benefits for business professionals and students of Academic Studio
relative to Claude Desktop Code are the integrated file browser and file
viewer/editor and the one-stop install of Python and Node.js.

For faculty and researchers, the one-click run/build for LaTeX, Quarto, Python,
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
- One-stop installation for important tools — Office Viewer, PDF, Quarto,
  Python, Jupyter, R, LaTeX — so there's no hunting for extensions.
- Help → Run Setup… installs the supporting programs (Python, Quarto, R,
  TinyTeX, Node.js) for you.
- No telemetry and no Copilot; extensions come from the open
  [Open VSX](https://open-vsx.org) registry.
