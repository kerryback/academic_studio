# Academic Studio

A beginner-friendly fork of VS Code for academic workflows — Quarto, LaTeX,
Python/R, Claude Code, and Office document viewing — with the clutter removed.
Built on the open-source [VSCodium](https://github.com/VSCodium/vscodium)
toolchain (so it ships without GitHub Copilot, without telemetry, and uses the
[Open VSX](https://open-vsx.org) extension registry instead of Microsoft's).

## Architecture

Two layers, kept separate so upstream updates stay clean:

```
academic_code/
├── build-engine/        VSCodium clone (git remote: upstream). Kept pristine.
├── overlay/             ALL Academic Studio customizations live here.
│   ├── product.overrides.json   branding (name, IDs) merged into product.json
│   ├── patches/                 *.patch source edits (menus, Copilot) → patches/user/
│   ├── settings/                baked-in default settings (Phase 4)
│   └── icons/                   app icons (Phase 2)
└── scripts/
    ├── setup-toolchain.sh   one-time: nvm + Node 22.22.1, rustup
    ├── apply-overlay.sh     inject overlay/ into build-engine/ (idempotent)
    └── build-macos.sh       build the macOS .app
```

`apply-overlay.sh` injects our files into the engine at build time; the engine
itself is never hand-edited, so `git -C build-engine pull upstream master`
brings in new VSCodium/VS Code releases without merge conflicts.

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
- [ ] Phase 2 — branding assets (icon, IDs)
- [ ] Phase 3 — bundle default extensions (Quarto, LaTeX Workshop, Claude Code, Office Viewer, Python, Open Remote SSH, R)
- [ ] Phase 4 — beginner defaults + remove Copilot
- [ ] Phase 5 — menu trimming (remove Selection/Go/Run)
- [ ] Phase 6 — Windows build
- [ ] Phase 7 — code signing + notarization
- [ ] Phase 8 — releases + download page
