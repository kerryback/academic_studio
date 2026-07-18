# Sign the builds and publish a release

A practical runbook for taking the UNSIGNED installers that `.github/workflows/build.yml`
produces, signing them, and publishing them to a single GitHub Release.

This is the condensed "do it now" version. The authoritative references are
[`docs/RELEASING.md`](docs/RELEASING.md) (the full release flow and asset names)
and [`docs/SIGNING.md`](docs/SIGNING.md) (one-time certificate setup for each
platform). The `academic-studio-release` skill walks the same steps interactively.

Everything here is the same regardless of app version. The release tag is
`v<academicStudioVersion>` (from `overlay/product.overrides.json`) — currently
**v0.6**. The unsigned artifacts to sign come from the most recent
`Build (unsigned)` run (e.g. run `29605246213`, all three targets green).

---

## The shape of it

- CI builds all three targets UNSIGNED and uploads them as workflow **artifacts**
  (it does not publish a release): `macos-arm64-unsigned-app`,
  `windows-x64-unsigned`, `windows-arm64-unsigned`.
- You sign each one **on that platform's machine** (signing needs the platform's
  own tools), then run `scripts/make-release.sh` there to upload into the shared
  release. The script is idempotent, so Mac and Windows publish into the same
  `v<version>` release from different machines.
- macOS and Windows signing are independent — do them in either order.

One certificate per platform covers every architecture and every release.

---

## Prerequisites (one-time)

- `gh` installed and signed in on each machine: `gh auth login` (web option).
- A signing certificate per platform — see `docs/SIGNING.md` for how to obtain
  and install each:
  - macOS: an Apple "Developer ID Application" cert in the login keychain, plus a
    notary credential (a keychain profile is easiest:
    `xcrun notarytool store-credentials AS_NOTARY --apple-id … --team-id … --password …`).
  - Windows: an Authenticode cert (Certum Open Source, Azure Trusted Signing,
    SignPath for OSS, or a commercial OV/EV cert), plus `signtool.exe` (Windows
    10/11 SDK).
- The gitignored `build-engine/` tree present on each machine at the pinned
  VSCodium ref (see `docs/RELEASING.md` → "One-time setup per machine"). macOS
  `SIGN_ONLY` needs `build-engine/vscode/build/node_modules/@electron/osx-sign`
  from a prior local build; Windows installer signing only needs
  `build-engine/assets/`.

`git pull` before releasing so scripts and the pinned ref are current.

---

## 0. Version and CI build

Only if you're cutting a new version. To re-publish the current v0.6 from an
existing green run, skip to step 1.

```
# bump academicStudioVersion in overlay/product.overrides.json, then:
git add overlay/product.overrides.json && git commit -m "version: 0.7" && git push
gh workflow run build.yml --repo kerryback/academic_studio --ref main
gh run watch "$(gh run list --repo kerryback/academic_studio --workflow build.yml -L1 --json databaseId -q '.[0].databaseId')" --repo kerryback/academic_studio
```

---

## 1. macOS — sign, notarize, publish (run on the Apple-Silicon Mac)

Download the unsigned app artifact and unzip it so the bundle lands in
`build-engine/VSCode-darwin-arm64/`:

```
cd ~/repos/academic_code
gh run download 29605246213 --repo kerryback/academic_studio -n macos-arm64-unsigned-app -D /tmp/as-mac
mkdir -p build-engine/VSCode-darwin-arm64
# Extract with ditto, NOT unzip — the artifact was made with ditto and a plain
# unzip breaks the bundle's symlinks/xattrs (signing then fails).
ditto -x -k /tmp/as-mac/AcademicStudio-macos-arm64-unsigned-app.zip build-engine/VSCode-darwin-arm64/
# result: build-engine/VSCode-darwin-arm64/Academic Studio.app
```

Sign + notarize + repackage the dmg (no recompile — `SIGN_ONLY=yes`), then upload:

```
AS_MAC_SIGN_IDENTITY="Developer ID Application: Kerry Back (TEAMID)" \
AS_NOTARY_PROFILE="AS_NOTARY" \
SIGN_ONLY=yes scripts/build-macos.sh

scripts/make-release.sh          # add --staging first to test (see step 3)
```

Verify:

```
codesign --verify --deep --strict --verbose=2 "build-engine/VSCode-darwin-arm64/Academic Studio.app"
xcrun stapler validate build-engine/assets/Academic-Studio-*-macos-arm64.dmg
```

Produces and uploads `Academic-Studio-<version>-macos-arm64.dmg`.

---

## 2. Windows x64 + arm64 — sign the installers, publish (run on a Windows PC, Git Bash)

`sign-windows-installers.sh` signs the downloaded installers (the meaningful
signature for the download/run experience — SmartScreen keys on the installer).
Signing the inner binaries too would require the full build tree + `SIGN_ONLY`;
that is optional and covered in `docs/SIGNING.md`.

Download both Windows artifacts into `build-engine/assets/`:

```
cd ~/repos/academic_code       # (the clone on the Windows machine)
gh run download 29605246213 --repo kerryback/academic_studio -n windows-x64-unsigned   -D build-engine/assets
gh run download 29605246213 --repo kerryback/academic_studio -n windows-arm64-unsigned -D build-engine/assets
```

Set ONE credential source, sign, and upload:

```
# EV token / cert already in the Windows store:
export AS_WIN_CERT_SHA1="<cert-thumbprint>"
# --- or a .pfx file: ---
# export AS_WIN_CERT_FILE="/c/certs/as.pfx" AS_WIN_CERT_PASSWORD="…"

scripts/sign-windows-installers.sh    # signs every *Setup.exe / *.msi in build-engine/assets/
scripts/make-release.sh               # add --staging first to test (see step 3)
```

Verify:

```
signtool verify /pa /v build-engine/assets/Academic-Studio-*-windows-x64-Setup.exe
```

Produces and uploads, for each arch: `…-Setup.exe` (admin), `…-UserSetup.exe`
(per-user, no admin — the friendliest download), `…-.zip` (portable), and for
x64 `…-.msi`.

---

## 3. Test before going public (optional but recommended)

Publish to a staging prerelease first, from each machine, so nothing users see
changes while you test the actual installers on each OS:

```
scripts/make-release.sh --staging     # per machine → prerelease staging-v<version>
```

A prerelease never changes what `releases/latest/download/...` serves and is
ignored by in-app Check for Updates. When every platform checks out, promote the
exact files you tested (no rebuild, no re-sign):

```
scripts/make-release.sh --promote     # once, from any machine → public v<version>
```

`make-release.sh` verifies signatures before uploading a public release and
refuses unsigned assets unless you set `ALLOW_UNSIGNED=1`. Staging skips that gate
by default.

---

## 4. Verify the release and wire up downloads

```
gh release view v0.6 --repo kerryback/academic_studio --json assets --jq '.assets[].name'
# or open it:
gh release view v0.6 --repo kerryback/academic_studio --web
```

It should contain the macOS dmg plus the Windows x64 and arm64 installers.
`make-release.sh` also uploads version-less aliases, so these permanent links
always serve the newest release (use them on the homepage):

- Mac (Apple Silicon only):
  `https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-macos-arm64.dmg`
- Windows (most PCs):
  `https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-windows-x64-Setup.exe`
- Windows on ARM (Surface Pro etc.):
  `https://github.com/kerryback/academic_studio/releases/latest/download/Academic-Studio-windows-arm64-Setup.exe`

---

## Notes

- Skills, Python bundles, and MCP connectors do NOT need an app release — they
  ship from the online catalog (`scripts/make-package.sh` + `site/packages.json`,
  deployed by the `pages.yml` workflow). The voiceover skill, for example, is
  already live independent of any app build.
- No re-sign needed to add a platform: sign + `make-release.sh` on that machine;
  it uploads into the existing release.
- Fully signing Windows entirely in CI would need repo secrets and a CI-friendly
  cert (Azure Trusted Signing / SignPath). Certum's token/cloud signing isn't
  CI-friendly, so the Windows signing pass stays manual — hence this runbook.
