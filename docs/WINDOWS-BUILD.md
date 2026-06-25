# Building Academic Studio on Windows

Produces the Windows app and a setup installer (`.exe`). Run on a Windows 10/11
machine (x64). Expect the first build to take 45–90 min and to need some
back-and-forth the first time — this is the platform most likely to surface
toolchain hiccups.

## 1. Prerequisites (install once)

| Tool | Version | Notes |
|------|---------|-------|
| Git for Windows | latest | Provides Git Bash, which you'll run the build from |
| Node.js | 22.22.1 | Match exactly. Install from nodejs.org or via `nvm-windows` |
| Python | 3.11.x | Add to PATH. Needed by node-gyp |
| Visual Studio Build Tools | 2022 | Workload: "Desktop development with C++" (MSVC v143, Windows 11 SDK) |
| jq | latest | `winget install jqlang.jq` |
| Inno Setup | 6.x | For the installer. `winget install JRSoftware.InnoSetup` |
| Rust | stable | For the `code` CLI. `winget install Rustlang.Rustup` |

Verify in Git Bash:
```bash
node --version      # v22.22.1
python --version    # 3.11.x
jq --version
git --version
```

## 2. Get the repo

Clone this repo, then recreate the build engine (it's gitignored):
```bash
git clone <your-academic-studio-repo> academic_code
cd academic_code
git clone --depth 1 https://github.com/VSCodium/vscodium.git build-engine
cd build-engine && git remote rename origin upstream && cd ..
```

## 3. Build

From Git Bash, in the repo root:
```bash
# full build incl. installer (x64):
"C:/Program Files/Git/bin/bash.exe" ./scripts/build-windows.sh

# faster re-build reusing fetched source:
SKIP_SOURCE=yes ./scripts/build-windows.sh

# app only, skip the installer:
SKIP_ASSETS=yes ./scripts/build-windows.sh

# ARM64 target:
ARCH=arm64 ./scripts/build-windows.sh
```

## 4. Outputs

- `build-engine/VSCode-win32-x64/` — the runnable app folder (`Academic Studio.exe`)
- `build-engine/assets/` — the setup installer (`AcademicStudioSetup-x64-<ver>.exe`)
  and a `.zip` archive

## 5. What the script does

Same overlay pipeline as macOS: fetches the win32-targeted extensions from Open
VSX, applies branding + the Windows icon, unions the bundled extensions onto the
base, stages the local defaults extension, then drives VSCodium's `build.sh`
(which invokes Inno Setup for the installer). The bundled Claude Code extension
is the win32 build of the CLI, fetched automatically for the chosen arch.

## Troubleshooting

- node-gyp / MSVC errors → confirm the "Desktop development with C++" workload
  and that you're in a fresh Git Bash after installing it.
- `jq: command not found` → install jq and reopen Git Bash.
- Inno Setup not found → the installer step needs `ISCC.exe` on PATH (Inno Setup
  install dir), or run with `SKIP_ASSETS=yes` to get just the app folder first.
- Capture full output: `./scripts/build-windows.sh 2>&1 | tee build-win.log`
  and share `build-win.log` so we can iterate.
