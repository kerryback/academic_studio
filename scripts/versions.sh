# Single source of truth for pinned toolchain versions, sourced by the build
# scripts. Keep the env block at the top of .github/workflows/build.yml in sync
# when bumping either value.
#
# NODE_VERSION   Node used to compile the app (native modules are ABI-sensitive).
# VSCODIUM_REF   VSCodium commit the build engine is pinned to. Bump deliberately:
#                a new ref drags in a new VS Code version and new patch context —
#                test a full local build before committing a bump.
AS_NODE_VERSION="22.22.1"
AS_VSCODIUM_REF="eb5d6e23a9abe76460a22e41cccacf7a7d5fea96"
