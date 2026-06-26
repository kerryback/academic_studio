# Academic Studio — Help

Welcome. Academic Studio is a streamlined version of VS Code set up for academic
work: writing, data analysis, and document/slide preparation, with an AI
assistant built in. This guide covers the essentials. Open it any time from
**Help → Academic Studio Help**.

## The basics

- Open a folder to work in: **File → Open Folder…**. Your files appear in the
  Explorer on the left.
- Create a file: **File → New File…**, then save it with a name and extension
  (e.g. `notes.qmd`, `analysis.py`).
- Files save automatically a moment after you stop typing.
- Open the AI assistant from the Claude icon in the left bar.

## Python and Jupyter

Academic Studio bundles the Python and Jupyter extensions. To run Python you
also need Python itself installed on your computer (see *Installing supporting
tools* below).

- Run a script: open a `.py` file and click the ▷ Run button.
- Notebooks: open or create a `.ipynb` file to write code and prose in cells.

## Making slides with Quarto + reveal.js

Academic Studio bundles [Quarto](https://quarto.org). A nice way to build slides
here is to write a Quarto document (`.qmd`) that renders to **reveal.js** HTML
slides. Two reasons this works well:

- The AI assistant is much better at producing clean reveal.js slides than at
  producing PowerPoint, so you get better first drafts.
- Quarto's plain-text format keeps the slide text easy for you to read and edit
  afterward — no fighting with a slide editor.

Minimal example — put this at the top of a `.qmd` file:

```yaml
---
title: "My Talk"
format: revealjs
---
```

Then write each slide under a `##` heading and render with the Quarto preview.

> Exporting slides to PDF or PowerPoint (via decktape) will be available once the
> supporting-tools installer lands; this section will be updated then.

## Office documents and PDFs

Word, Excel, and PowerPoint files open in a viewer, and PDFs render inline —
just click the file in the Explorer.

## Installing supporting tools

Some features need companion programs installed on your computer (Python, Quarto,
R, a LaTeX distribution). If something isn't working, install the tool directly:

- Python — https://www.python.org/downloads/
- Quarto — https://quarto.org/docs/get-started/
- R — https://cran.r-project.org/
- TinyTeX (LaTeX) — https://yihui.org/tinytex/

(An installer that sets these up for you is planned.)

## Tips

- Command Palette (all commands): press **F1**.
- R IntelliSense needs the R `languageserver` package: install R, then run
  `install.packages("languageserver")` in R.
