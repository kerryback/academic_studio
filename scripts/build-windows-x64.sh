#!/usr/bin/env bash
# Build Academic Studio for 64-bit Intel/AMD Windows (win32-x64).
# Run from Git Bash. Usage: scripts/build-windows-x64.sh [student|faculty]
exec env ARCH=x64 "$(dirname "${BASH_SOURCE[0]}")/build-windows.sh" "${1:-student}"
