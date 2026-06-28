# Build-Engine Local Patches

The `build-engine/` directory is a clone of [VSCodium/vscodium](https://github.com/VSCodium/vscodium) and is gitignored. The patches below fix npm issues when building on Windows (especially ARM64).

## Automatic application

The build script (`scripts/build-windows.sh`) automatically applies `build-engine-npm-platform-fixes.patch` via `git apply` before each build. If the patch is already applied or doesn't apply cleanly, it is silently skipped.

To re-apply manually after a fresh `build-engine/` clone:

```bash
cd build-engine
git apply ../build-engine-npm-platform-fixes.patch
```

## What the patch fixes

### 1. tsgo missing platform binary (`prepare_vscode.sh`)

`npm ci` skips `@typescript/native-preview-win32-{arch}` when the host CPU doesn't match the target (e.g. x64 build on ARM64 hardware), or even on native ARM64 Windows. The `tsgo` compiler then exits with code 1 during `vscode-min-prepack`. The patch detects the missing package after `npm ci` and installs it with `--no-save`.

### 2. Wrong-platform native prebuilts (`prepare_vscode.sh` + `build.sh`)

On ARM64 Windows, `npm ci` installs `@parcel/watcher-linux-arm64-*` prebuilts (matching the host CPU but wrong OS). Extensions like Jupyter also ship cross-platform `zeromq` prebuilts. These Linux/macOS `.node` binaries cause `rcedit.exe` to fail during packaging. The patch removes non-Windows prebuilts in two places:
- After `npm ci` in `prepare_vscode.sh` (node_modules cleanup)
- Before `vscode-win32-*-min-packing` in `build.sh` (.build/ cleanup)

## Build prerequisites (ARM64 Windows)

Install via Visual Studio Installer → Individual Components:

- MSVC v143 - VS 2022 C++ ARM64/ARM64EC build tools (Latest)
- MSVC v143 - VS 2022 C++ ARM64/ARM64EC Spectre-mitigated libs (Latest)
- MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest) — needed for x64 cross-builds
