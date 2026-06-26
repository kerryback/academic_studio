#!/usr/bin/env bash
# Gather Windows build diagnostics into diagnose-win.log (send that file to Claude).
# Run from Git Bash, or double-click scripts\diagnose-windows.cmd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
LOG="$ROOT/diagnose-win.log"

{
  echo "=== Academic Studio — Windows build diagnostics ==="
  echo "when: $(date 2>/dev/null)"
  echo "where: $ROOT"
  echo "arch (OS): ${PROCESSOR_ARCHITECTURE:-unknown}"
  echo

  echo "=== toolchain (need: node v22.22.1, python 3.11, jq, git, rustc; for installer: ISCC + 7z) ==="
  printf 'node:   '; node --version 2>&1
  printf 'npm:    '; npm --version 2>&1
  printf 'python: '; { python --version 2>&1 || python3 --version 2>&1; }
  printf 'jq:     '; jq --version 2>&1
  printf 'git:    '; git --version 2>&1
  printf 'rustc:  '; rustc --version 2>&1 || echo 'NOT found'
  printf 'ISCC (Inno Setup): '; { command -v ISCC.exe || command -v iscc || echo 'NOT on PATH'; }
  printf '7z:     '; { command -v 7z.exe || command -v 7z || echo 'NOT on PATH'; }
  echo

  echo "=== how far the build got ==="
  if [ -d build-engine ]; then echo "build-engine: present"; else echo "build-engine: MISSING (clone VSCodium into it first)"; fi
  echo "- vscode source entries : $(ls build-engine/vscode 2>/dev/null | wc -l)"
  echo "- vscode/node_modules   : $(ls build-engine/vscode/node_modules 2>/dev/null | wc -l) packages"
  echo "- dev/build.env         :"; sed 's/^/    /' build-engine/dev/build.env 2>/dev/null || echo "    (none — source/version step did not finish)"
  echo "- vscode/.build         :"; ls build-engine/vscode/.build 2>/dev/null | sed 's/^/    /' | head || echo "    (none — compile did not start)"
  echo "- app folders           :"; ls -d build-engine/VSCode-win32-* 2>/dev/null | sed 's/^/    /' || echo "    (none — app build did not complete)"
  echo "- assets                :"; ls build-engine/assets 2>/dev/null | sed 's/^/    /' || echo "    (none — installer step did not run)"
  echo

  echo "=== pinned VS Code version (overlay) ==="
  cat build-engine/upstream/stable.json 2>/dev/null || echo "(build-engine/upstream/stable.json not found)"
  echo

  echo "=== tail of last captured build log (if you ran with '| tee build-win.log') ==="
  tail -80 build-win.log 2>/dev/null || echo "(no build-win.log — re-run the build with: ./scripts/build-windows-arm64.sh 2>&1 | tee build-win.log)"
} 2>&1 | tee "$LOG"

echo
echo "Diagnostics written to: $LOG"
echo "Send that file (diagnose-win.log) to Claude."
