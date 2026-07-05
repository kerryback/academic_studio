---
name: academic-studio-release
description: >-
  Cut a signed Academic Studio release using the GitHub Actions build pipeline.
  Use whenever the user wants to build, sign, and publish a new version of
  Academic Studio (e.g. "cut the 0.5 release", "release Academic Studio", "build
  and publish a new version", "ship the installers", "make a staging release").
  Builds all three installers (macOS arm64, Windows x64, Windows arm64) unsigned
  on GitHub's runners, then signs each on the right machine: macOS is signed +
  notarized on this Mac; the two Windows installers are signed with signtool on
  a Windows machine. Default flow publishes to a staging prerelease first
  (testable on every OS, invisible to the public download links), then promotes
  the tested files to the public release with one command.
---

# Cutting an Academic Studio release

The heavy builds run for free on GitHub's runners (public repo). Only the fast
signing steps happen on your machines. `make-release.sh` refuses unsigned
artifacts for public releases (signature gate; staging skips it by default).

Default pipeline: bump version → CI builds 3 unsigned installers → download each
to the right machine → sign there → `make-release.sh --staging` uploads to a
prerelease → test the staging downloads on real machines →
`make-release.sh --promote` publishes those exact files publicly.

A staging prerelease never touches what users see: the site's
`releases/latest/download/...` links and the in-app Check for Updates both
ignore prereleases. Its only public trace is a "Pre-release" entry on the
GitHub Releases page.

Repo: `kerryback/academic_studio`. Version lives in
`overlay/product.overrides.json` (`academicStudioVersion`); tags are
`staging-v<version>` (prerelease) and `v<version>` (public).

NOTE — packages don't need any of this: Claude skills / pip bundles / MCP
connectors ship from the online catalog (`site/packages.json` +
`scripts/make-package.sh` + git push). Only changes to the app itself need a
release.

## Prerequisites

- `gh` authenticated on each machine used (`gh auth status`).
- Both machines on a current `git pull` — the release scripts evolve, and the
  Windows machine especially needs the same `make-release.sh`/`sign-windows-
  installers.sh` as the Mac.
- macOS (this Mac): the creds `make-mac-release.sh` expects —
  - `AS_MAC_SIGN_IDENTITY` — Developer ID Application cert hash (defaulted in the script).
  - `AS_NOTARY` — a notarytool keychain profile backed by an **App Store Connect
    API key** (durable; an app-specific password kept getting revoked and hanging
    the notarize step). The key file lives at the repo root:
    `AuthKey_Q9PUJZWRZ6.p8` — gitignored, never commit; the `.p8` is the only
    secret. Key ID `Q9PUJZWRZ6`, Issuer `dca426cf-788e-4206-8eb1-f4e1c75e350d`.
    Verify with `xcrun notarytool history --keychain-profile AS_NOTARY`. If it
    ever breaks, re-store (no rebuild needed afterward):
    ```
    xcrun notarytool store-credentials AS_NOTARY \
      --key AuthKey_Q9PUJZWRZ6.p8 --key-id Q9PUJZWRZ6 \
      --issuer dca426cf-788e-4206-8eb1-f4e1c75e350d
    ```
    A replacement key comes from App Store Connect → Users and Access →
    Integrations → App Store Connect API (Team Keys); the `.p8` downloads once.
- Windows machine: the Windows 10/11 SDK (`signtool`) and your code-signing cert,
  referenced by `AS_WIN_CERT_SHA1` (thumbprint in the store, EV token) or
  `AS_WIN_CERT_FILE`/`AS_WIN_CERT_PASSWORD` (`.pfx`). See `docs/SIGNING.md`.

## Step 1 — bump the version (this Mac)

Edit `academicStudioVersion` in `overlay/product.overrides.json` to the new
number, then commit and push:

```
git add overlay/product.overrides.json && git commit -m "version: <X.Y>"
git push origin main
```

## Pre-flight checks (run before building)

Help-menu allowlist: the Help menu is filtered by a keep-*only* allowlist
(`academicStudioMenuKeepOnly.MenubarHelpMenu` in `overlay/product.overrides.json`,
enforced by patch 20). Any item registered in the Help menu but missing from that
list is silently dropped — this is how "Tour of Academic Studio" went missing.
Before building, confirm every registered Help item is in the allowlist:

```
python3 - <<'PY'
import json, re
reg  = set(re.findall(r"id:\s*'(academicStudio\.\w+)'",
                      open('overlay/patches/common/51-help-menu-readme.patch').read()))
keep = set(json.load(open('overlay/product.overrides.json'))
           ['academicStudioMenuKeepOnly']['MenubarHelpMenu'])
missing = reg - keep
print('registered:', sorted(reg))
print('MISSING from allowlist:', sorted(missing) or 'none — OK')
import sys; sys.exit(1 if missing else 0)
PY
```

If it prints anything under MISSING, add those ids to the `MenubarHelpMenu` list
and re-commit before building.

## Step 2 — build all three on GitHub (from anywhere)

```
gh workflow run build.yml
```

This runs three jobs and uploads three artifacts (nothing is published):
`macos-arm64-unsigned-app`, `windows-x64-unsigned`, `windows-arm64-unsigned`.
The build uses the pinned VSCodium ref and the pinned, sha256-verified
extension manifests (see `scripts/versions.sh` and
`scripts/fetch-extensions.sh --pinned`), so a green run is reproducible.

Knowing when it finishes — pick one:
- `gh run watch` — attach to the running build; returns when the run completes
  (`--exit-status` to fail the shell if the run failed).
- `gh run list --workflow build.yml` — one-shot status without blocking.
- Periodic check for silent per-job failures:
  `gh api repos/kerryback/academic_studio/actions/runs/<RID>/jobs --jq '.jobs[] | .name + ": " + .status + "/" + (.conclusion // "-")'`

Timing observed in practice (2026-07): macOS ~35 min, Windows x64 ~55 min,
Windows arm64 ~75 min — budget about 1–1.5 hours for the whole run. Jobs can be
used as they finish (macOS completes first).

## Step 3 — macOS: sign, notarize, publish to staging (this Mac)

```
RID=$(gh run list --workflow build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download "$RID" -n macos-arm64-unsigned-app -D /tmp/asrel

# Restore the .app where the signing step expects it (ditto keeps the bundle intact):
rm -rf "build-engine/VSCode-darwin-arm64/Academic Studio.app"
mkdir -p build-engine/VSCode-darwin-arm64
ditto -x -k /tmp/asrel/AcademicStudio-macos-arm64-unsigned-app.zip build-engine/VSCode-darwin-arm64/

# Sanity: confirm it's the new version
jq -r .academicStudioVersion "build-engine/VSCode-darwin-arm64/Academic Studio.app/Contents/Resources/app/product.json"

# Sign + notarize + staple + package the dmg, then upload to the staging prerelease:
scripts/make-mac-release.sh --staging
```

`make-mac-release.sh` signs the restored `.app`, notarizes, packages the signed
`.dmg`, and passes `--staging` through to `make-release.sh`, which uploads to
the `staging-v<version>` prerelease and prints direct download URLs. Notarize
alone typically takes ~5–15 min. Don't worry about older dmgs sitting in
`build-engine/assets/` — stale versions and stale version-less aliases are
filtered automatically.

## Step 4 — Windows x64 + arm64: sign and publish to staging (Windows machine)

On the Windows machine, from Git Bash in the repo (after `git pull` and with the
SimplySign session logged in if using the Certum token):

```
git pull
RID=$(gh run list --workflow build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
mkdir -p build-engine/assets
gh run download "$RID" -n windows-x64-unsigned   -D build-engine/assets
gh run download "$RID" -n windows-arm64-unsigned -D build-engine/assets

# Sign both installers (signtool handles either target arch from one machine):
AS_WIN_CERT_SHA1="<thumbprint>" scripts/sign-windows-installers.sh

# Upload to the same staging prerelease:
scripts/make-release.sh --staging
```

Browser alternative for the artifact download (needs a signed-in GitHub
session — artifacts are never anonymous): the run page
`https://github.com/kerryback/academic_studio/actions/runs/<RID>` lists the
artifacts at the bottom; extract the zips into `build-engine/assets/`.

`sign-windows-installers.sh` signs every `*Setup.exe` in `build-engine/assets/`
and hard-fails if signtool's verify does (so a bad signature can't slip
through).

## Step 5 — test the staging build on real machines

Download from the URLs `--staging` printed (anonymous, works on any machine):

```
https://github.com/kerryback/academic_studio/releases/download/staging-v<X.Y>/Academic-Studio-<X.Y>-macos-arm64.dmg
https://github.com/kerryback/academic_studio/releases/download/staging-v<X.Y>/Academic-Studio-<X.Y>-windows-x64-Setup.exe
https://github.com/kerryback/academic_studio/releases/download/staging-v<X.Y>/Academic-Studio-<X.Y>-windows-arm64-Setup.exe
```

Install and check at least: app launches clean (no Gatekeeper/SmartScreen
block), Run Setup opens and the "Additional packages" section loads from the
live catalog, the startup new-package prompt behaves, and on Windows the
install button runs the PowerShell flow in a terminal.

## Step 6 — promote to public (once, from any machine)

```
scripts/make-release.sh --promote
```

This downloads the staging assets and uploads those exact files (byte-for-byte
what you tested) to the public `v<version>` release, with the version-less
aliases the site links to. The public download links flip to the new version
the moment the release exists. Then optionally clean up:

```
gh release delete staging-v<X.Y> --repo kerryback/academic_studio --yes
```

## Verify

```
gh release view v<X.Y> --json assets --jq '.assets[].name'
```

Expect the versioned dmg + two Setup.exe, plus the three version-less aliases
(`Academic-Studio-macos-arm64.dmg`, `-windows-x64-Setup.exe`,
`-windows-arm64-Setup.exe`). Load https://academic-studio.com/#downloads — every
platform should be a live link.

## Direct publish (skip staging)

For a hotfix you've already validated, `scripts/make-mac-release.sh` and
`scripts/make-release.sh` without flags publish straight to `v<version>` —
same steps as above minus `--staging`/`--promote`. The signature gate is strict
here: unsigned or unverifiable files abort the upload (`ALLOW_UNSIGNED=1`
overrides deliberately). Avoid pre-creating an empty public `v<X.Y>` release to
get "New Version Being Built" on the site — it makes the empty release "latest"
and takes every platform's download dark while you build; with the staging flow
the public links simply stay on the old version until promote.

## Notes and caveats

- Windows signing architecture: signtool on a Windows ARM machine signs both the
  x64 and arm64 installers fine (Authenticode is architecture-agnostic). The only
  ARM snag is your cert's driver — an EV USB token's middleware must run on ARM
  Windows (often via x64 emulation); a `.pfx` file has no such issue.
- This signs the installers, not the app binaries inside them (CI builds them
  unsigned). Installers write to Program Files without Mark-of-the-Web, so
  SmartScreen keys on the installer signature — adequate for the download/run
  experience. Full inner-binary signing needs the build tree + `SIGN_ONLY` on
  Windows (heavier); add later if required.
- `SIGN_ONLY` requires that platform's full build tree on the machine (macOS
  needs `build-engine/vscode/build/node_modules/@electron/osx-sign` from a past
  local build) — a clean machine can't SIGN_ONLY a CI artifact.
- CI artifacts are retained ~90 days; re-run `build.yml` if they've expired.
- `make-release.sh` is idempotent and clobbers same-named assets, so you can
  publish macOS and Windows from different machines into the same release
  (staging or public), in any order.
- Bumping the pinned VSCodium ref (`scripts/versions.sh` + the env block in
  `build.yml`, kept in sync by hand) is a deliberate act: new ref = new VS Code
  version + new patch context. Test a local build first.
