<p align="center">
  <img src="overlay/icons/academic-studio.png" width="160" alt="Academic Studio">
</p>

# Academic Studio

Academic Studio is a bundle of Claude Code, a file browser, a file viewer and
editor, and a simplified install method for supporting software. It is designed
for business professionals, students, faculty, and researchers. A paid Anthropic
account (Pro, Max, or API) is required to use Claude Code. Enter `/login` in the
prompt window on first use to connect to your Anthropic account.

## Download

- [macOS (Apple Silicon)](https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-macos-arm64.dmg) — M1 or later; does not run on older Macs with Intel chips
- [Windows](https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-windows-x64-Setup.exe) — for most Windows computers
- [Windows ARM](https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-windows-arm64-Setup.exe) — Microsoft Surface Pro laptops and other Windows ARM computers

All releases are on the [GitHub Releases page](https://github.com/kerryback/academic_studio/releases).
The macOS build is signed and notarized, so it opens with a normal double-click.
The Windows builds aren't code-signed yet, so on first launch Windows may show a
SmartScreen prompt — click "More info" then "Run anyway".

## Features

- Claude Code, built in. The Claude Code assistant opens automatically and works alongside your files. Ask it to write, analyze data, build slides, or create documents.
- Real documents. Claude can create and edit Excel, Word, PowerPoint, PDF, LaTeX, and Quarto files using its document skills.
- A workspace, not just a chat. Open a folder and your files and your conversation history live with that project — your work persists.
- Use — or have Claude use — Python, Jupyter, R, LaTeX, and Quarto for data analysis, statistics, typesetting, and HTML document creation.
- Easy setup. Help → Run Setup… lets you pick your profile (Faculty or Students & Professionals), and install supporting programs (Python, Node.js, Quarto, R, TinyTeX) and extensions with one click.
- Key Python libraries — the scientific stack and libraries to create Office documents — are installed with Python.
- Shares skills, connectors, and CLAUDE.md files with Claude Code CLI and the Code mode of Claude Desktop; conversation history is shared with the CLI.

## Compared to Claude Desktop

Academic Studio runs Claude Code like the Code mode of Claude Desktop. The
principal benefits of Academic Studio relative to Claude Desktop Code for
business professionals and students are the integrated file browser and file
viewer/editor and the easy installation of Python and Node.js.

For faculty and researchers, the one-click run/build for LaTeX, Quarto, Python,
R, and Jupyter are the most important benefits.

## Compared to VS Code

Under the hood Academic Studio is VS Code (via the open-source
[VSCodium](https://github.com/VSCodium/vscodium)), so it will feel familiar if
you've used VS Code — but it's simplified for getting work done:

- Menus and toolbars are trimmed, with beginner-friendly defaults.
- Claude Code is built-in and opens on startup.
- Easy installation of important tools — Office Viewer, PDF, Quarto, Python, Jupyter, R, LaTeX, Node.js.
- No GitHub Copilot, no telemetry; extensions come from the open [Open VSX](https://open-vsx.org) registry.

## Building from source

Academic Studio is built from two layers kept separate so upstream updates stay
clean: a pristine [VSCodium](https://github.com/VSCodium/vscodium) clone
(`build-engine/`, gitignored) and an `overlay/` holding every customization
(branding, bundled extensions, beginner defaults, menu trims, icons). At build
time `scripts/apply-overlay.sh` injects the overlay into the engine, so the
engine is never hand-edited and `git -C build-engine pull upstream master` brings
in new VS Code releases without conflicts.

```bash
# macOS (Apple Silicon)
scripts/setup-toolchain.sh                 # once: nvm + Node 22.22.1, rustup
scripts/build-macos.sh                     # -> build-engine/VSCode-darwin-arm64/
SKIP_SOURCE=yes SKIP_ASSETS=no scripts/build-macos.sh   # faster re-build + .dmg

# Windows (run from Git Bash on the target machine)
scripts/build-windows-x64.sh               # or build-windows-arm64.sh
```

More detail:

- [`docs/WINDOWS-BUILD.md`](docs/WINDOWS-BUILD.md) — Windows prerequisites and build steps
- [`docs/RELEASING.md`](docs/RELEASING.md) — building and publishing installers for every platform
- [`docs/SIGNING.md`](docs/SIGNING.md) — optional code signing (macOS notarization, Windows Authenticode)
- [`docs/CLAUDE-STARTUP-TAB.md`](docs/CLAUDE-STARTUP-TAB.md) — how Claude Code opens on startup

Base versions: VS Code `1.121.0` (pinned in `build-engine/upstream/stable.json`),
Node `22.22.1`.

## License

MIT, following [VSCodium](https://github.com/VSCodium/vscodium) and
[VS Code](https://github.com/microsoft/vscode). Bundled extensions and Claude
Code are under their own licenses.
