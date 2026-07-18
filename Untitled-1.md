1. Generate/activate the token (in your Certum account, now)
  - Click to generate the SimplySign token. Certum shows a QR code and a Token ID (a number).
  - On your phone, install the SimplySign mobile app (App Store / Google Play). Open it → add a token → scan that QR code. It registers the token and starts showing rotating 6-digit codes. Note the Token ID.
2. Install SimplySign Desktop on the Windows machine
  - Download SimplySign Desktop from Certum and install it (it adds a tray app and a virtual smart-card/CSP so Windows sees the cloud cert as if a card were plugged in). Do this on both the x64 box and the Surface Pro.
3. Log in to mount the certificate
  - Open SimplySign Desktop → log in with your Token ID + the current 6-digit code from the phone app. Once connected, the certificate is live in the Windows certificate store. Keep this session logged in while you sign (it lasts a couple of hours; re-enter a code if it times out).
4. Get the certificate thumbprint (PowerShell)
Get-ChildItem Cert:\CurrentUser\My | Format-List Subject, Thumbprint
4. Copy the 40-character Thumbprint (remove any spaces).
5. Update and build-with-signing (Git Bash, per machine)
The Windows installers currently on the release are stale (missing all the recent changes), so I'd do a fresh signed build rather than just re-signing old ones:
git pull
# x64 box:
AS_WIN_CERT_SHA1="PASTE_THUMBPRINT" SKIP_ASSETS=no scripts/build-windows-x64.sh
# Surface Pro:
AS_WIN_CERT_SHA1="PASTE_THUMBPRINT" SKIP_ASSETS=no scripts/build-windows-arm64.sh
5. Setting AS_WIN_CERT_SHA1 makes the build sign the app and installers as part of the build. (If you'd rather not rebuild, SIGN_ONLY=yes with the same variable signs the existing build output in place — but fresh is better here.)
6. Publish
scripts/make-release.sh
6. This uploads the signed installers, clobbering the unsigned ones on the v0.1 release.

A few things to expect:
- Signing goes through Certum's cloud, so the machine needs internet, and SimplySign Desktop must be logged in. You may get an approval prompt on your phone the first time signtool uses the cert — approve it.
- You only enter the code once per session; all the files in a build sign under that one session.
- After it's up, verify with: right-click the installer → Properties → Digital Signatures should show your name, and Windows SmartScreen's "unknown publisher" warning will fade as downloads accumulate.

Once you've done the x64 machine, tell me if signtool isn't found or the cert doesn't show in the store and I'll help debug. Want me to add a short "Windows signing with Certum SimplySign" section to docs/SIGNING.md capturing these exact steps for next time?
