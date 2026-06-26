#!/usr/bin/env bash
# Build Academic Studio for ARM64 Windows (win32-arm64).
# Run from Git Bash. Usage: scripts/build-windows-arm64.sh
exec env ARCH=arm64 "$(dirname "${BASH_SOURCE[0]}")/build-windows.sh"
