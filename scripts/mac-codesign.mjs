// Code-sign a macOS .app with @electron/osx-sign's Node API.
//
// The vendored electron-osx-sign 2.x *CLI* doesn't accept --identity (it only
// parses a few boolean flags), so we call the sign() API directly. Defaults
// apply hardened runtime + the standard Electron entitlements and type
// 'distribution', and it signs inside-out (nested frameworks/helpers/.node/
// embedded binaries, then the outer bundle).
//
// Usage: node mac-codesign.mjs <path-to-osx-sign/dist/sign.js> <app.app> <identity>
//   <identity> is a "Developer ID Application: …" name or a cert SHA-1 hash.

const [, , signJsPath, app, identity] = process.argv;

if (!signJsPath || !app || !identity) {
  console.error('usage: mac-codesign.mjs <sign.js> <app.app> <identity>');
  process.exit(2);
}

const { sign } = await import(signJsPath);

try {
  await sign({ app, identity, platform: 'darwin' });
  console.log(`[sign] signed ${app}`);
} catch (err) {
  console.error('[sign] failed:', err && err.message ? err.message : err);
  process.exit(1);
}
