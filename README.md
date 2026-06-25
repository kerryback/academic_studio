# Academic Studio

A beginner-friendly fork of VS Code for academic workflows — Quarto, LaTeX,
Python/R, Claude Code, and Office document viewing — with the clutter removed.
Built on the open-source [VSCodium](https://github.com/VSCodium/vscodium)
toolchain (so it ships without GitHub Copilot, without telemetry, and uses the
[Open VSX](https://open-vsx.org) extension registry instead of Microsoft's).

## Architecture

Two layers, kept separate so upstream updates stay clean:

Ships in two editions — Student and Faculty — that differ only in their bundled
extensions and how much UI is trimmed. Both build from the same engine + overlay.

```
academic_code/
├── build-engine/        VSCodium clone (git remote: upstream). Kept pristine.
├── overlay/             ALL Academic Studio customizations live here.
│   ├── editions/
│   │   ├── student/     product.overrides.json (name/IDs/trim lists) + extensions.json
│   │   └── faculty/     product.overrides.json + extensions.json
│   ├── builtin-extensions/academic-studio-defaults/   beginner default settings
│   ├── patches/
│   │   ├── common/      applied to both editions (menu removals, UI-trim filter)
│   │   └── student/     student-only patches
│   └── icons/           academic-studio.icns / .ico (from AcademicStudio.png)
└── scripts/
    ├── setup-toolchain.sh        one-time: nvm + Node 22.22.1, rustup
    ├── make-icon.py/make-icons.sh regenerate the app icon
    ├── fetch-extensions.sh <edition> <target>   pull bundled exts from Open VSX
    ├── apply-overlay.sh <edition>               inject overlay → engine (idempotent)
    ├── build-macos.sh [edition]                 build the macOS .app + .dmg
    └── build-windows.sh [edition]               build on Windows (see docs/)
```

`apply-overlay.sh` injects our files into the engine at build time; the engine
itself is never hand-edited, so `git -C build-engine pull upstream master`
brings in new VSCodium/VS Code releases without merge conflicts.

Build a given edition: `scripts/build-macos.sh student` (or `faculty`).

### Editions

| | Student | Faculty |
|---|---|---|
| Extensions | Quarto, Office, Python, basedpyright, Rainbow CSV, Jupyter, Spell Checker, PDF, Claude | + LaTeX Workshop, R (+syntax), Open Remote SSH |
| Activity bar | Explorer, Search, Extensions, Claude only | full |
| Menus | Selection/Go/Run removed; View/Terminal/Help trimmed | Selection/Go/Run removed; Help trimmed |

UI trimming is data-driven: each edition's `product.overrides.json` carries
`academicStudioHideViewContainers`, `academicStudioMenuHide`, and
`academicStudioMenuKeepOnly`, read by a small filter in
`patches/common/20-trim-menus-and-activitybar.patch`.

## Build (macOS)

```bash
scripts/setup-toolchain.sh     # once
scripts/build-macos.sh         # produces build-engine/VSCode-darwin-arm64/
```

Re-build faster after the first run by reusing fetched source:
`SKIP_SOURCE=yes scripts/build-macos.sh`. Add `SKIP_ASSETS=no` to also package
a `.dmg`/`.zip`.

## Base versions

- VS Code: `1.121.0` (pinned in `build-engine/upstream/stable.json`)
- Node: `22.22.1` · Rust: stable

## Status

- [x] Phase 1 — branded vanilla build on macOS
- [x] Phase 2 — branding assets (mortarboard icon, bundle IDs, Open VSX)
- [x] Phase 3 — bundle 12 default extensions (Quarto, LaTeX Workshop, Claude Code, Office Viewer, Python, Open Remote SSH, R + r-syntax, basedpyright, Rainbow CSV, Jupyter, Code Spell Checker)
- [x] Phase 4 — beginner defaults (academic-studio-defaults built-in) + no Copilot + extension auto-updates
- [x] Phase 5 — menu trimming (Selection/Go/Run removed; File/Edit/View/Terminal/Help kept)
- [ ] Phase 6 — Windows build (`scripts/build-windows.sh`, see `docs/WINDOWS-BUILD.md`) — run on a Windows machine
- [ ] Phase 7 — code signing + notarization (Apple Developer ID; Windows cert)
- [ ] Phase 8 — releases + download page

## Extras

- `scripts/make-icon.py` / `make-icons.sh` — regenerate the placeholder icon (`.icns` + `.ico`). Replace `overlay/icons/academic-studio.png` with real art to rebrand.
- `scripts/fetch-extensions.sh <target>` — download bundled extensions from Open VSX and emit the per-target `builtInExtensions` manifest.
- R IntelliSense needs the R `languageserver` package: install R, then `install.packages("languageserver")`.
