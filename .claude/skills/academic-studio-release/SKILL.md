---
name: academic-studio-release
description: >-
  Cut a signed Academic Studio release using the GitHub Actions build pipeline.
  Use whenever the user wants to build, sign, and publish a new version of
  Academic Studio (e.g. "cut the 0.4 release", "release Academic Studio", "build
  and publish a new version", "ship the installers"). Builds all three installers
  (macOS arm64, Windows x64, Windows arm64) unsigned on GitHub's runners, then
  signs each on the right machine and publishes to the GitHub Release: macOS is
  signed + notarized on this Mac; the two Windows installers are signed with
  signtool on a Windows machine. Covers the version bump, the CI build, artifact
  download, per-machine signing, and publishing so the site download links go
  live one platform at a time.
---

# Cutting an Academic Studio release

The heavy builds run for free on GitHub's runners (public repo). Only the fast
signing steps happen on your machines. Nothing unsigned is ever published.

Pipeline: bump version → CI builds 3 unsigned installers → download each to the
right machine → sign there → `make-release.sh` uploads it → the site's download
links flip live per platform as each is published.

Repo: `kerryback/academic_studio`. Version lives in
`overlay/product.overrides.json` (`academicStudioVersion`); the release tag is
`v<version>`.

## Prerequisites

- `gh` authenticated on each machine used (`gh auth status`).
- macOS (this Mac): the notarization creds `make-mac-release.sh` expects —
  `AS_MAC_SIGN_IDENTITY` (Developer ID hash) and the `AS_NOTARY` keychain profile.
- Windows machine: the Windows 10/11 SDK (`signtool`) and your code-signing cert,
  referenced by `AS_WIN_CERT_SHA1` (thumbprint in the store, EV token) or
  `AS_WIN_CERT_FILE`/`AS_WIN_CERT_PASSWORD` (`.pfx`). See `docs/SIGNING.md`.

## Step 1 — bump the version (this Mac)

Edit `academicStudioVersion` in `overlay/product.overrides.json` to the new
number, then commit and push:

```
git add overlay/product.overrides.json && git commit -m "release: bump to <X.Y>"
git push origin main
```

## Step 2 — put the site into "New Version Being Built" (optional, this Mac)

To show every platform as "New Version Being Built" on the site while you build,
publish an empty release for the new version (it becomes "latest", and the site
downgrades all links until assets are attached):

```
gh release create v<X.Y> --title "Academic Studio <X.Y>" \
  --notes "Installers are being built and will appear here shortly."
```

Skip this if you'd rather keep the previous version downloadable until the new
one is ready. Either way, `make-release.sh` will upload into this same tag later.

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

## Step 3 — build all three on GitHub (from anywhere)

```
gh workflow run build.yml
```

This runs three jobs and uploads three artifacts (nothing is published):
`macos-arm64-unsigned-app`, `windows-x64-unsigned`, `windows-arm64-unsigned`.

Knowing when it finishes — pick one:
- `gh run watch` — attach to the running build; it streams job status and returns
  (with a terminal bell) when the run completes. Add `--exit-status` to fail the
  shell if the run failed. This is the simplest "tell me when it's done."
- `gh run list --workflow build.yml` — one-shot status (queued / in_progress /
  completed) without blocking.
- GitHub emails you on a failed run by default; to also be notified on success,
  turn on GitHub → Settings → Notifications → Actions. The GitHub mobile app
  pushes these too.

A full run is typically ~15–30 min (the Windows jobs dominate). Wait for
`completed`/success before downloading artifacts.

## Step 4 — macOS: sign, notarize, publish (this Mac)

Downloading artifacts is `gh run download`. Find the run id, then pull the macOS
artifact:

```
RID=$(gh run list --workflow build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download "$RID" -n macos-arm64-unsigned-app -D /tmp/asrel

# Restore the .app where the signing step expects it (ditto keeps the bundle intact):
rm -rf build-engine/VSCode-darwin-arm64 && mkdir -p build-engine/VSCode-darwin-arm64
ditto -x -k /tmp/asrel/AcademicStudio-macos-arm64-unsigned-app.zip build-engine/VSCode-darwin-arm64/

# Sign + notarize + staple + package the dmg, then publish it to v<version>:
scripts/make-mac-release.sh
```

`make-mac-release.sh` in its default mode signs the already-built `.app`
(the one you just restored), notarizes, packages the signed `.dmg`, and runs
`make-release.sh` to upload it. The macOS download link goes live.

## Step 5 — Windows x64 + arm64: sign and publish (Windows machine)

On the Windows machine (Git Bash), in a clone of the repo at the same tagged
commit (`git pull`), pull both Windows artifacts into `build-engine/assets/` and
sign them:

```
RID=$(gh run list --workflow build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
mkdir -p build-engine/assets
gh run download "$RID" -n windows-x64-unsigned   -D /tmp/win
gh run download "$RID" -n windows-arm64-unsigned -D /tmp/win
cp /tmp/win/*.exe build-engine/assets/

# Sign both installers (set your cert env vars first — see docs/SIGNING.md):
AS_WIN_CERT_SHA1="<thumbprint>" scripts/sign-windows-installers.sh

# Publish both into the same release:
scripts/make-release.sh
```

`sign-windows-installers.sh` signs every `*Setup.exe` in `build-engine/assets/`
with signtool; `make-release.sh` uploads them (plus the version-less aliases) to
`v<version>`. The two Windows download links go live.

## Step 6 — verify

```
gh release view v<X.Y> --json assets --jq '.assets[].name'
```

Expect the versioned dmg + two Setup.exe, plus the three version-less aliases
(`Academic-Studio-macos-arm64.dmg`, `-windows-x64-Setup.exe`,
`-windows-arm64-Setup.exe`). Load https://academic-studio.com/#downloads — every
platform should now be a live link; any still building shows "New Version Being
Built".

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
- CI artifacts are retained ~90 days; re-run `build.yml` if they've expired.
- `make-release.sh` is idempotent and clobbers same-named assets, so you can
  publish macOS and Windows from different machines into the same release, in any
  order.
