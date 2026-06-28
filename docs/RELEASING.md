# Releasing Academic Studio

How to build the installers for every platform and publish them to a single
GitHub Release. Each platform is built on its own machine, then uploaded into the
same release.

- Mac builds run on macOS (`scripts/build-macos.sh`).
- Windows builds run on Windows, in Git Bash (`scripts/build-windows-x64.sh` /
  `-arm64.sh`).
- All uploads go through `scripts/make-release.sh`, which is idempotent: it
  creates the release the first time and uploads (clobbering same-named files)
  every time after, so you can publish from several machines into one release.

The version comes from `academicStudioVersion` in
`overlay/product.overrides.json`. The release tag is `v<version>` (e.g. `v0.1`).
To cut a new version, bump that field, rebuild, and re-run `make-release.sh`.

## One-time setup per machine

- Clone the repo, then create the gitignored build engine:
  ```
  git clone --depth 1 https://github.com/VSCodium/vscodium.git build-engine
  cd build-engine && git remote rename origin upstream && cd ..
  ```
- Install GitHub CLI and sign in: `gh auth login` (choose the web-browser option).
- macOS prerequisites: Node 22.22.1 (nvm), jq. See `scripts/build-macos.sh`.
- Windows prerequisites: Node 22.22.1, Python, jq, Visual Studio Build Tools with
  the C++ workload, Inno Setup, 7-Zip, plus `git config --global core.longpaths true`.
  See `docs/WINDOWS-BUILD.md`. For ARM64 Windows, also install the
  "MSVC v143 C++ ARM64 build tools" component.

Always `git pull` before a release build so you have the latest scripts and
fixes.

## macOS

On an Apple-Silicon Mac:
```
SKIP_ASSETS=no scripts/build-macos.sh
scripts/make-release.sh
```
Produces and uploads `Academic-Studio-<version>-macos-arm64.dmg`.

(An Intel `macos-x64` dmg would be a separate cross-build; not set up yet.)

## Windows x64

From Git Bash on an x64 PC:
```
SKIP_ASSETS=no scripts/build-windows-x64.sh
scripts/make-release.sh
```
Produces and uploads, for x64:
- `Academic-Studio-<version>-windows-x64-Setup.exe` — per-machine installer (admin).
- `Academic-Studio-<version>-windows-x64-UserSetup.exe` — per-user, no admin.
- `Academic-Studio-<version>-windows-x64.zip` — portable.
- `Academic-Studio-<version>-windows-x64.msi` — for managed deployment.

## Windows on ARM (e.g. Surface Pro)

From Git Bash on an ARM64 PC:
```
SKIP_ASSETS=no scripts/build-windows-arm64.sh
scripts/make-release.sh
```
Produces and uploads the `windows-arm64` `Setup.exe`, `UserSetup.exe`, and `.zip`.

Note: x64 Windows builds also run on ARM via emulation, so `windows-arm64` is a
nice-to-have, not a requirement.

## Asset names

Names carry the OS and our product version so an architecture is never
ambiguous (`arm64` spans Apple Silicon and Windows-on-ARM):
- `Academic-Studio-0.1-macos-arm64.dmg`
- `Academic-Studio-0.1-windows-x64-Setup.exe`
- `Academic-Studio-0.1-windows-arm64-Setup.exe`

For non-technical users, the friendliest single Windows download is the
`UserSetup.exe` (no admin prompt). You can leave all variants up, or ask to trim
the list.

## Signing

Builds are unsigned by default — they run, but show first-launch warnings
(macOS Gatekeeper, Windows SmartScreen). To produce signed/notarized installers,
set the cert environment variables before the build command; everything else is
identical. See `docs/SIGNING.md` for the full setup (Apple Developer ID +
notarization on macOS; a Certum/Authenticode certificate on Windows).

When you later sign, just rebuild with the cert variables set and re-run
`make-release.sh` — it clobbers the unsigned assets in place.

## Verify the release

```
gh release view v0.1 --repo kerryback/academic_studio --json assets \
  --jq '.assets[].name'
```
or open it in a browser:
```
gh release view v0.1 --repo kerryback/academic_studio --web
```

After all platforms upload, `v0.1` should contain the macOS dmg plus the Windows
x64 and arm64 installers. Point your homepage's download buttons straight at
these release asset URLs.
