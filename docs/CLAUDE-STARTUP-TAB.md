# Claude Code startup tab

Academic Studio opens Claude Code in the editor area on startup, Claude-Desktop
style. This note explains how that works and the bug it had to work around.

The code lives in `overlay/builtin-extensions/academic-studio-defaults/extension.js`
(`openClaudeOnStartup` and `claudeTabIsOpen`).

## The problem

The bundled Claude Code extension does not open a tab by itself. Our defaults
extension opens one on startup by running the `claude-vscode.primaryEditor.open`
command.

The first version did this unconditionally on every startup. But VS Code also
restores the previous session's editor tabs when it relaunches — including the
Claude Code tab. So each restart produced two Claude tabs: the restored one plus
the one we opened. Over several restarts they piled up.

## The fix

Open Claude on startup only if a Claude tab isn't already present. Concretely:

1. On startup, poll for an existing Claude tab instead of opening immediately.
2. If session-restore brings a Claude tab back, detect it and stop — do nothing.
3. If, after a short window, no Claude tab has appeared (a genuinely fresh state,
   or the user had closed it), open one ourselves — with a few retries in case
   the Claude Code extension hasn't registered its command yet.

This keeps the "Claude opens on startup" behavior while never duplicating a tab
that session-restore already reopened.

### Detecting an existing Claude tab

The primary editor is a webview whose tab is labelled "Claude Code". We scan all
editor tab groups (`vscode.window.tabGroups.all`) and treat a tab as Claude if
its label or its webview `viewType` matches `/claude/i`. (Tabs in the editor area
only — the activity-bar / secondary-sidebar Claude views are not editor tabs and
are intentionally not counted.)

### The timing window

The poll waits up to `MAX_WAIT` (currently 1.5s, stepping every 300ms) for a
restored tab to show up before deciding nothing will, and opening its own.

This window is a race guard, and the trade-off runs in one direction:

- Too short: on a slow restart, our timeout can fire before session-restore has
  reopened the Claude tab — and the duplicate comes back.
- Longer than needed: on a fresh start (nothing to restore) the user waits the
  full window before Claude appears, since the poll only returns early when it
  actually finds a tab.

So `MAX_WAIT` must stay comfortably longer than session-restore takes to reopen
the tab. 1.5s is a safe floor on normal hardware; don't drop much below ~1s.

## If you want to change the behavior

- Disable startup open entirely: remove the `openClaudeOnStartup()` call in
  `activate()`. Users can still open Claude from the activity bar.
- Adjust the responsiveness: tune `MAX_WAIT` / `STEP` in `openClaudeOnStartup`,
  keeping the floor above in mind.
