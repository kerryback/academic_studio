# Code signing

Both build scripts ship UNSIGNED by default — they work, but show OS warnings on
first launch (macOS Gatekeeper; Windows SmartScreen). Signing is opt-in: set the
environment variables below and the same build commands produce signed (and, on
macOS, notarized) artifacts. One certificate per platform covers every
architecture and every release — you do not need a separate cert per arch.

## Signing an already-built release (no rebuild)

Signing applies to finished binaries, so you do not have to recompile a build you
already made unsigned. Once your cert is set up, run the same build script with
`SIGN_ONLY=yes` and the cert variables — it skips fetch/compile and only signs
the existing app and (re)packages the signed installers. This takes minutes, not
a full build, and must run on the machine that holds that platform's build output.

```
# macOS (signs the existing .app, repackages + notarizes the .dmg):
AS_MAC_SIGN_IDENTITY="Developer ID Application: … (TEAMID)" AS_NOTARY_PROFILE="AS_NOTARY" \
SIGN_ONLY=yes scripts/build-macos.sh

# Windows (signs the existing app exe, repackages + signs the installers):
AS_WIN_CERT_SHA1="<thumbprint>" SIGN_ONLY=yes scripts/build-windows-x64.sh   # or -arm64
```

Then re-run `scripts/make-release.sh` to replace the unsigned files in the release.
(`make-release.sh` verifies signatures before uploading and refuses unsigned
artifacts unless you set `ALLOW_UNSIGNED=1`.)

Prerequisite: `SIGN_ONLY=yes` needs that platform's FULL BUILD TREE on the
machine, not just the artifact. On macOS it uses
`build-engine/vscode/build/node_modules/@electron/osx-sign` from a prior local
build; on Windows it repackages from `build-engine/VSCode-win32-<arch>/`. A
clean machine cannot `SIGN_ONLY` a CI artifact — that's what
`scripts/sign-windows-installers.sh` is for on Windows (signs the downloaded
installers only; the binaries inside remain unsigned, which SmartScreen
accepts because it keys on the installer's signature).

The rest of this document is the one-time cert setup for each platform.

## macOS

Prerequisites:
- Apple Developer Program membership ($99/yr).
- A "Developer ID Application" certificate installed in your login keychain
  (Xcode → Settings → Accounts → Manage Certificates, or developer.apple.com).
- One-time notary credential. Easiest is a keychain profile:

  ```
  xcrun notarytool store-credentials AS_NOTARY \
    --apple-id "you@example.com" --team-id "TEAMID" \
    --password "app-specific-password"
  ```

Environment variables:
- `AS_MAC_SIGN_IDENTITY` — e.g. `Developer ID Application: Kerry Back (TEAMID)`.
- Notary credentials, ONE of:
  - `AS_NOTARY_PROFILE` — the profile name above (e.g. `AS_NOTARY`), or
  - `AS_APPLE_ID` + `AS_APPLE_TEAM_ID` + `AS_APPLE_PWD` (app-specific password).

Build:
```
AS_MAC_SIGN_IDENTITY="Developer ID Application: Kerry Back (TEAMID)" \
AS_NOTARY_PROFILE="AS_NOTARY" \
SKIP_ASSETS=no scripts/build-macos.sh
```

The script signs the `.app` (hardened runtime, via the vendored
`@electron/osx-sign`, which also signs the bundled `claude` binary), notarizes
and staples it, then signs + notarizes + staples the `.dmg`. If the identity is
set but notary credentials are not, it signs but skips notarization.

Verify:
```
codesign --verify --deep --strict --verbose=2 "build-engine/VSCode-darwin-arm64/Academic Studio.app"
spctl -a -t open --context context:primary-signature -vv "build-engine/assets/Academic-Studio-0.1-macos-arm64.dmg"
xcrun stapler validate "build-engine/assets/Academic-Studio-0.1-macos-arm64.dmg"
```

## Windows

Get a code-signing certificate (any one removes the "unknown publisher" prompt;
EV builds SmartScreen reputation instantly, OV over time):
- OV from a CA (~$200–400/yr), EV (~$300–600/yr, USB token),
- or cheaper routes: Certum Open Source (~$60–120/yr), Azure Trusted Signing
  (~$10/mo, eligibility required), SignPath (free for OSS).

You also need `signtool.exe` (Windows 10/11 SDK). The script auto-finds it under
`C:\Program Files (x86)\Windows Kits\10\bin\...\x64\`.

Environment variables, ONE credential source:
- `AS_WIN_CERT_FILE` (path to `.pfx`) [+ `AS_WIN_CERT_PASSWORD`], or
- `AS_WIN_CERT_SHA1` (cert thumbprint in the Windows store — typical for EV tokens).
- `AS_WIN_TIMESTAMP_URL` — optional; defaults to `http://timestamp.digicert.com`.

Build (from Git Bash):
```
AS_WIN_CERT_FILE="/c/certs/as.pfx" AS_WIN_CERT_PASSWORD="…" \
SKIP_ASSETS=no scripts/build-windows-x64.sh      # or -arm64
```

The script signs the app's main `.exe` before packaging (so the installed app is
signed) and signs the produced `Setup.exe` / `UserSetup.exe` / `.msi` afterward.
The `.zip` isn't signed (its contents already are).

Verify:
```
signtool verify /pa /v "build-engine/assets/Academic-Studio-0.1-windows-x64-Setup.exe"
```
