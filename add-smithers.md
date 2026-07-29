# Plan: Add Smithers (daily briefing + chat) to Academic Studio

## Goal

Bring the two parts of Smithers that Kerry actually uses — the morning daily
briefing and the email/calendar chat — into Academic Studio as a pinned
left-toolbar (Activity Bar) feature. Make it trivial for other users to adopt by
riding on MCP connectors instead of Smithers' own Google OAuth.

## Why this is worth doing

The current Smithers onboarding is the painful part: each user needs a Google
Cloud project, an OAuth consent app, `credentials.json`, and per-account token
pickles (Phase 3 of `smithers-gmail/SKILL.md`). The MCP-connector approach
deletes all of that. Per-user setup collapses to "connect Gmail + Calendar once
in your Claude connector settings" — and nothing changes about how Kerry
already works.

## Key facts established (July 2026)

- Academic Studio is VSCodium and already ships custom builtin extensions
  (`overlay/builtin-extensions/academic-studio-defaults`,
  `.../academic-studio-setup`) alongside the official
  `anthropic.claude-code.vsix`. A pinned Activity Bar icon is the same pattern.
- The Gmail and Calendar connectors are Google-hosted remote MCP servers,
  already connected in Claude Code (verified via `claude mcp list`):
  - `claude.ai Gmail` — `https://gmailmcp.googleapis.com/mcp/v1` — Connected
  - `claude.ai Google Calendar` — `https://calendarmcp.googleapis.com/mcp/v1` — Connected
- The "claude.ai" prefix is only the connector-registration label. These
  authenticate against the Anthropic account login (`/login`), not the claude.ai
  website. They surface in any Claude Code session logged into that account,
  including inside Academic Studio. No browser or web app involved.

## Security surface

- The Gmail connector has no `send_mail` tool at all. Its most write-capable
  tool is `create_draft`, which stages a draft but does not send.
- Read tools: `search_threads`, `get_message`, `get_thread`, `list_drafts`,
  `list_labels`.
- Mutating tools: `create_draft`, `create_label`, `label_message` /
  `label_thread`, `unlabel_message` / `unlabel_thread`,
  `apply_sensitive_*_label`.
- Calendar read tools: `list_events`, `get_event`, `search_events`,
  `list_calendars`, `suggest_time`.

Two lockdown mechanisms, meant to be used together:

1. Whitelist (feature-scoped, the real guarantee). When the briefing/chat drives
   a Claude session, pass `--allowedTools` listing only the tools the feature
   needs. This is default-deny, so a write tool added to the connector later
   cannot leak in, and it also excludes web tools automatically (see below).
   The list includes `create_draft` because staging reply drafts is wanted.
   Example:
   `--allowedTools "mcp__claude_ai_Gmail__search_threads,mcp__claude_ai_Gmail__get_message,mcp__claude_ai_Gmail__get_thread,mcp__claude_ai_Gmail__list_drafts,mcp__claude_ai_Gmail__create_draft,mcp__claude_ai_Google_Calendar__list_events,mcp__claude_ai_Google_Calendar__get_event,mcp__claude_ai_Google_Calendar__search_events"`

2. Deny rule in `settings.json` (app-wide, belt-and-suspenders). Bundle a
   `permissions.deny` list in `academic-studio-defaults` for anything that should
   be blocked everywhere, not just the panel. Note the scope caveat below —
   Gmail write tools other than `create_draft` are reasonable to deny app-wide;
   web tools are not.

### Blocking web tools (matching Smithers)

Smithers deliberately had no `web_fetch` / `web_search`. Reproduce that for the
briefing/chat, but scope it to the feature, not the whole app:

- `WebFetch`, `WebSearch`, and the Playwright browser tools (`mcp__playwright__*`)
  are simply absent from the whitelist above, so the briefing session cannot
  reach the web. This is the correct scope.
- Do not deny the web tools in the app-wide `settings.json` defaults: Academic
  Studio is a general-purpose IDE where web access is wanted for ordinary
  research. Smithers had no web tools because it was a single-purpose app; here
  the briefing is one feature inside a broader tool, so the block belongs at the
  feature session, not globally.

### Draft staging (decided)

`create_draft` is included in the whitelist so the assistant can stage reply
drafts for review. There is no send tool, so nothing leaves the mailbox without
the user sending it from Gmail themselves.

## Architecture decision

Drive an interactive, logged-in Claude session — do not build a detached
headless agent that holds its own credentials. The managed connectors are
interactively authenticated and can be absent in headless / SDK / cron runs, so
the feature must inherit the connectors from a live Claude session (e.g. via
`claude -p` or the existing Claude Code integration). Going the local
self-hosted MCP-server route would work headless but would reintroduce the
per-user Google OAuth setup this plan exists to eliminate.

## Dedicated, per-session lockdown

The tool spawns a new Claude session used only for email/calendar search, chat,
and drafting. All restrictions are scoped to that session's process — they do
not affect the user's main Academic Studio Claude session or global settings,
which keep full tools including web.

Verified against the installed CLI (`claude --help`), the relevant flags exist:
`--allowedTools`, `--disallowedTools`, `--mcp-config`, `--strict-mcp-config`,
`--settings`, `--permission-mode`.

Lock the spawned session down with:

- `--allowedTools` (primary, default-deny): list only the Gmail/Calendar read
  tools plus `create_draft`. As a whitelist it automatically excludes
  `WebFetch`, `WebSearch`, and the Playwright tools — they do not exist in the
  session. This alone gives the session no web access.
- `--disallowedTools "WebFetch WebSearch"` (optional belt-and-suspenders):
  explicit web deny even though the whitelist already covers it.
- `--strict-mcp-config` + `--mcp-config` (optional, verify): would load only the
  Gmail + Calendar MCP servers so Playwright is never connected. Caveat: the
  Gmail/Calendar connectors are account-managed remote connectors and may be
  dropped by `--strict-mcp-config` if they can't be re-declared in a config
  file. Since `--allowedTools` already blocks Playwright, this is a nice-to-have,
  not required — test before relying on it.

Result: one dedicated, web-blocked, email/calendar/draft-only session spawned
per use, with zero effect on the rest of Academic Studio.

### Visual distinction of the session

The Smithers session should look obviously different so it is not confused with
normal coding sessions. Two session-scoped mechanisms, best used together:

- `statusLine` via `--settings` (automatic, primary). Pass a settings JSON to
  just this `claude` invocation to render an always-on colored, labeled status
  bar. ANSI colors are supported; no user action needed. This is the reliable
  marker. Example:

  ```json
  {
    "statusLine": {
      "type": "command",
      "command": "printf '\\033[35m📧 SMITHERS — email/calendar/draft only (no web)\\033[0m'"
    }
  }
  ```

- `/color <name>` (prompt-bar color, secondary). Real per-session command; colors
  the input box and does not persist globally. Colors: red, blue, green, yellow,
  purple, orange, pink, cyan; `/color default` resets. It is a typed command, so
  for an auto-spawned session the launcher must inject `/color purple` as the
  session's first input. Do NOT rely on instructing the model to "run /color"
  via the system prompt — the model executing a slash command itself is not
  guaranteed. Injecting it as actual session input is the deterministic path;
  feasibility depends on how the panel drives the session (verify).

Recommendation: always ship the `statusLine` label (guaranteed), and add the
`/color` injection if/when the launcher supports sending a first input line.

## Implementation plan

Split into two steps with very different cost and portability. Build step 1
first; it proves the connector plumbing before any extension work.

### Step 1 — The brains: `/briefing` skill (do first)

- Author a skill / slash command that:
  - Reads Gmail via `search_threads` / `get_message` / `get_thread` and Calendar
    via `list_events` / `get_event`.
  - Produces the morning overview: today's meetings with talking points, emails
    needing replies, anything time-sensitive.
  - Runs read-only using the whitelist above.
- "Chat" is just Claude Code scoped to the Gmail + Calendar read tools — no
  separate app needed.
- Portable, token-free, works today for any user who has connected the two
  connectors.
- Deliverable: verify against Kerry's live connectors and confirm the output
  matches what Smithers produced.

### Step 2 — The chrome: pinned left-toolbar panel (do later)

- New builtin extension (same pattern as `academic-studio-defaults`) contributing
  an Activity Bar view container + webview.
- Webview shows the daily briefing on open and offers the chat box.
- It drives the interactive Claude session (so it inherits the connectors and
  never touches OAuth) rather than reimplementing an agent with the Agent SDK.
- Run the session read-plus-draft but web-blocked via the `--allowedTools`
  whitelist above.
- Optionally ship a `permissions.deny` rule in `academic-studio-defaults` for
  Gmail write tools other than `create_draft`, so ad-hoc chats can't silently
  gain them. Do not deny web tools globally (see security section).
- This is polish on top of a working step 1.

## Risks / things to verify

- Connector availability in whatever channel the panel uses to invoke Claude
  (interactive vs. `-p`); confirm the read tools are present and callable there.
- Behavior when a user has not connected the connectors — detect and show a
  friendly "connect Gmail + Calendar in your Claude connector settings" prompt.
- Multi-account: Smithers supported a personal + work Gmail. Confirm how the
  connector exposes multiple Google accounts, if at all.

## Not doing

- No Google Cloud project / `credentials.json` / token pickles.
- No detached headless agent holding credentials.
- No dependency on the claude.ai website.
