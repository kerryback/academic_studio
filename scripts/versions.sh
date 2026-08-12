# Single source of truth for pinned toolchain versions, sourced by the build
# scripts. Keep the env block at the top of .github/workflows/build.yml in sync
# when bumping either value.
#
# NODE_VERSION   Node used to compile the app (native modules are ABI-sensitive).
# VSCODIUM_REF   VSCodium commit the build engine is pinned to. Bump deliberately:
#                a new ref drags in a new VS Code version and new patch context —
#                test a full local build before committing a bump.
# VSCODIUM_REH   VSCodium release whose remote extension host is installed on
#                remote hosts by open-remote-ssh. We do not publish a REH of our
#                own, so remote connections run VSCodium's. Bump this WITH
#                VSCODIUM_REF: it must be the release for the same VS Code minor
#                that ref builds, or remotes get a server that mismatches the
#                client. apply-overlay.sh injects it into product.json and fails
#                the build if the release does not exist, so a forgotten bump
#                surfaces there rather than in a user's failed connection.
#                Find the value at https://github.com/VSCodium/vscodium/releases
#                (e.g. VS Code 1.121 -> 1.121.03429).
AS_NODE_VERSION="22.22.1"
AS_VSCODIUM_REF="eb5d6e23a9abe76460a22e41cccacf7a7d5fea96"
AS_VSCODIUM_REH="1.121.03429"
