// Code-sign a macOS .app with @electron/osx-sign's Node API.
//
// The vendored electron-osx-sign 2.x *CLI* doesn't accept --identity (it only
// parses a few boolean flags), so we call the sign() API directly. Defaults
// apply hardened runtime + the standard Electron entitlements and type
// 'distribution', and it signs inside-out (nested frameworks/helpers/.node/
// embedded binaries, then the outer bundle).
//
// Usage: node mac-codesign.mjs <path-to-osx-sign/dist/sign.js> <app.app> <identity> <entitlements.plist>
//   <identity> is a "Developer ID Application: …" name or a cert SHA-1 hash.
//   <entitlements.plist> is applied to every signed file with hardened runtime.

const [, , signJsPath, app, identity, entitlements] = process.argv;

if (!signJsPath || !app || !identity || !entitlements) {
  console.error('usage: mac-codesign.mjs <sign.js> <app.app> <identity> <entitlements.plist>');
  process.exit(2);
}

const { pathToFileURL } = await import('node:url');
const { resolve } = await import('node:path');
const { sign } = await import(pathToFileURL(resolve(signJsPath)).href);

try {
  // Apply OUR entitlements (with hardened runtime) to every file, and disable
  // auto-derivation so it doesn't replace them with Info.plist-guessed ones that
  // omit the cs.* memory/library keys the extension host needs.
  await sign({
    app,
    identity,
    platform: 'darwin',
    preAutoEntitlements: false,
    optionsForFile: () => ({ entitlements, hardenedRuntime: true }),
  });
  console.log(`[sign] signed ${app}`);
} catch (err) {
  console.error('[sign] failed:', err && err.message ? err.message : err);
  process.exit(1);
}
