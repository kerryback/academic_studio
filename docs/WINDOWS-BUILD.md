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

Two architectures are supported: `x64` (64-bit Intel/AMD — the standard Windows
build, sometimes written "x86-64") and `arm64` (Windows on ARM). Note: modern
VS Code no longer builds true 32-bit (`ia32`) Windows, so there is no x86-32 target.

Easiest — double-click the launcher for your architecture (it finds Git Bash):
```
scripts\build-windows-x64.cmd          REM 64-bit Intel/AMD, student edition
scripts\build-windows-arm64.cmd        REM Windows on ARM, student edition
scripts\build-windows-x64.cmd faculty  REM faculty edition
```

Or from Git Bash, in the repo root:
```bash
./scripts/build-windows-x64.sh student      # x64 student
./scripts/build-windows-arm64.sh student    # arm64 student
./scripts/build-windows-x64.sh faculty      # x64 faculty

# the wrappers call build-windows.sh; you can also drive it directly:
ARCH=x64   ./scripts/build-windows.sh student
ARCH=arm64 ./scripts/build-windows.sh faculty
SKIP_SOURCE=yes ./scripts/build-windows-x64.sh student   # faster re-build
SKIP_ASSETS=yes ./scripts/build-windows-x64.sh student   # app only, no installer
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
