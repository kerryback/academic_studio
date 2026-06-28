# Build-Engine Local Patches

The `build-engine/` directory is a clone of [VSCodium/vscodium](https://github.com/VSCodium/vscodium) and is gitignored. The following manual patches must be re-applied after a fresh clone.

## 1. tsgo missing platform binary (`prepare_vscode.sh`)

**Problem:** `npm ci` skips the `@typescript/native-preview-win32-{arch}` optional dependency when the host CPU doesn't match the target arch (e.g. building x64 on ARM64 hardware), or even on native ARM64 Windows. The `tsgo` compiler then exits with code 1 during the `vscode-min-prepack` gulp task.

**Fix:** After the `npm ci` retry loop (around line 228) and before `mv .npmrc.bak .npmrc`, add:

```bash
# Workaround: npm ci skips platform-specific optional deps for tsgo when the
# host CPU doesn't match the target arch (e.g. building x64 on arm64 hardware).
if [ "${OS_NAME}" = "windows" ]; then
  _tsgo_pkg="@typescript/native-preview-win32-${VSCODE_ARCH}"
  if [ -d "node_modules/@typescript/native-preview" ] && [ ! -d "node_modules/@typescript/native-preview-win32-${VSCODE_ARCH}" ]; then
    echo "[fix] ${_tsgo_pkg} missing after npm ci — installing manually..."
    tsgo_ver="$(node -e "console.log(require('./node_modules/@typescript/native-preview/package.json').optionalDependencies['${_tsgo_pkg}'])")"
    npm install "${_tsgo_pkg}@${tsgo_ver}" --no-save
  fi
```

## 2. Wrong-platform @parcel/watcher prebuilts (`prepare_vscode.sh` + `build.sh`)

**Problem:** On ARM64 Windows, `npm ci` installs `@parcel/watcher-linux-arm64-*` prebuilts (matching the host CPU but wrong OS). These Linux `.node` binaries end up in the packaged output, causing `rcedit.exe` to fail during `vscode-win32-{arch}-min-packing`.

**Fix (a) — `prepare_vscode.sh`:** Inside the same `if [ "${OS_NAME}" = "windows" ]` block added above, append before the closing `fi`:

```bash
  # Workaround: npm ci on ARM64 Windows also installs linux-arm64 @parcel/watcher
  # prebuilts (matching the host's arm64 CPU but wrong OS). Remove any non-win32
  # prebuilts so rcedit doesn't choke on .node files it can't load.
  for _pw in node_modules/@parcel/watcher-linux-* node_modules/@parcel/watcher-darwin-*; do
    [ -d "$_pw" ] && { echo "[fix] removing wrong-platform prebuilt: $_pw"; rm -rf "$_pw"; }
  done
fi
```

**Fix (b) — `build.sh`:** Right before the `npm run gulp "vscode-win32-${VSCODE_ARCH}-min-packing"` line (around line 44), add:

```bash
      # remove wrong-platform @parcel/watcher prebuilts that break rcedit
      for _pw in .build/node_modules/@parcel/watcher-linux-* .build/node_modules/@parcel/watcher-darwin-*; do
        [ -d "$_pw" ] && rm -rf "$_pw"
      done
```

## Additional build prerequisites (ARM64 Windows)

Install these via Visual Studio Installer (Individual Components tab):

- MSVC v143 - VS 2022 C++ ARM64/ARM64EC build tools (Latest)
- MSVC v143 - VS 2022 C++ ARM64/ARM64EC Spectre-mitigated libs (Latest)
- MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest) — needed for x64 cross-builds
