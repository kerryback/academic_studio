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

## The standard flow: CI build + local signing (recommended)

`.github/workflows/build.yml` (manual trigger: Actions tab, or
`gh workflow run build.yml`) builds all three installers UNSIGNED on GitHub's
hosted runners and uploads them as workflow ARTIFACTS — it does not publish a
release. You then sign each artifact on the right machine and publish:

1. Bump `academicStudioVersion` in `overlay/product.overrides.json`, commit,
   push, and run the workflow.
2. macOS: download the `macos-arm64-unsigned-app` artifact onto the Mac,
   unzip into `build-engine/VSCode-darwin-arm64/`, then
   `SIGN_ONLY=yes scripts/build-macos.sh` (signs + notarizes + repackages the
   dmg) and `scripts/make-release.sh`.
3. Windows: download the two `windows-*-unsigned` artifacts into
   `build-engine/assets/` on the Windows machine, then
   `scripts/sign-windows-installers.sh` and `scripts/make-release.sh`.

The `academic-studio-release` skill walks through these steps end to end.
`make-release.sh` verifies signatures before uploading and refuses unsigned
artifacts (override with `ALLOW_UNSIGNED=1`).

## Staging: test on every OS before going public

To try the installers on different machines WITHOUT touching the public
downloads, publish to a staging prerelease first:

```
scripts/make-release.sh --staging     # per machine, same as a normal publish
```

This creates the prerelease `staging-v<version>` and prints direct download
URLs for the test machines. A prerelease never changes what
`releases/latest/download/...` serves (the site's permanent links), and the
in-app Check for Updates ignores prereleases too — so users see nothing new.
It does appear on the GitHub Releases page badged "Pre-release"; that's the
only public trace. Staging skips the signature gate by default
(`ALLOW_UNSIGNED=0` to enforce it).

When every platform checks out, publish the exact files you tested:

```
scripts/make-release.sh --promote     # once, from any machine
```

`--promote` downloads the staging assets and uploads them to the public
`v<version>` release (no rebuild, no re-sign), then suggests deleting the
staging prerelease.

Signing entirely in CI would need repo secrets and a CI-friendly certificate
(Apple notarization, Azure Trusted Signing, or SignPath). Certum's token/cloud
signing isn't CI-friendly, so the Windows signing pass stays manual.

Note: packages (Claude skills, Python library bundles, MCP connectors) do NOT
require an app release at all — they ship from the online catalog. See
`scripts/make-package.sh`: edit `packages/<id>/`, bump the version in
`site/packages.json`, run the script, push.

The manual, per-machine full-build steps below remain valid as a fallback.

## One-time setup per machine

- Clone the repo, then create the gitignored build engine at the PINNED
  VSCodium commit (see `AS_VSCODIUM_REF` in `scripts/versions.sh` — keep local
  machines and CI on the same ref):
  ```
  mkdir build-engine && cd build-engine
  git init
  git remote add upstream https://github.com/VSCodium/vscodium.git
  git fetch --depth 1 upstream <AS_VSCODIUM_REF from scripts/versions.sh>
  git checkout FETCH_HEAD
  cd ..
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

## Website download links (permanent)

`make-release.sh` also uploads version-less copies of the three primary
installers, so a website can link to URLs that never change across releases:
GitHub's `releases/latest/download/<name>` always serves the newest release's
asset of that name. (The versioned copies are uploaded too, for archival.)

Use these three links on the site:

- Mac — "Apple Silicon only; does not run on older Macs with Intel chips":
  `https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-macos-arm64.dmg`
- Windows — "for most Windows computers":
  `https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-windows-x64-Setup.exe`
- Windows on ARM — "for Microsoft Surface Pro laptops and other Windows ARM computers":
  `https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-windows-arm64-Setup.exe`

These resolve only once a non-draft release containing those names exists, so
re-run `make-release.sh` on each platform (it adds the aliases) after the first
build. Host only the landing page on GitHub Pages; let these links point at the
release assets rather than committing the large files to the Pages repo.

## Signing

Builds are unsigned by default — they run, but show first-launch warnings
(macOS Gatekeeper, Windows SmartScreen). To produce signed/notarized installers,
set the cert environment variables before the build command; everything else is
identical. See `docs/SIGNING.md` for the full setup (Apple Developer ID +
notarization on macOS; a Certum/Authenticode certificate on Windows).

When you later sign, you do not have to rebuild: run the same build script with
`SIGN_ONLY=yes` plus the cert variables to sign the already-built artifacts (see
docs/SIGNING.md), then re-run `make-release.sh` — it clobbers the unsigned assets
in place.

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
