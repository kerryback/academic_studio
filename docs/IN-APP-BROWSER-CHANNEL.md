# In-app browser channel (skill apps → Simple Browser tab)

Several Claude Code skills launch a small local web app and open it. Outside
Academic Studio they open the system browser; inside Studio they should open in an
in-editor Simple Browser tab instead.

## How it works today

`overlay/builtin-extensions/academic-studio-defaults/extension.js` →
`setupVoiceoverInApp()` coordinates through two files in `~/.voiceover`:

| file      | written by | meaning |
| --------- | ---------- | ------- |
| `inapp`   | the extension, on activation | capability marker holding the extension host's pid. A launcher only skips the external browser when this exists *and* the pid is alive, so an old launcher or a plain VS Code still works. |
| `app-url` | the launcher, each launch     | the URL to open. The extension polls it with `fs.watchFile` and runs `simpleBrowser.show`, falling back to `openExternal`. |

## Current consumers

- voiceover — `plugins/voiceover/skills/voiceover/scripts/skill_launch.py`
  (`_open_in_editor()`), the original.
- litdb note form — `plugins/litdb/src/litdb/inapp.py`. It tries
  `~/.academic-studio` first, then falls back to `~/.voiceover`, so it works with
  shipped builds without a Studio rebuild.
- coauthor roster picker — `plugins/coauthor/src/coauthor/inapp.py`, a deliberate
  copy of litdb's (the plugins ship separately, so there is no shared import). Only
  the suppression env var differs: `COAUTHOR_NO_BROWSER` vs `LITDB_NO_BROWSER`.

## The thing to fix on the next Studio build

The channel is generic but the directory name is not: litdb (and anything else
added later) has to publish into a voiceover-named folder. Generalize
`setupVoiceoverInApp` into e.g. `setupInAppBrowser` that writes its marker to and
watches **both** `~/.academic-studio` and `~/.voiceover`, keeping the latter only
for compatibility with launchers that don't know the new path yet. litdb already
prefers `~/.academic-studio`, so it picks up the new channel with no change; the
voiceover launcher keeps using `~/.voiceover` until it is updated too.

Overrides for testing: `ACADEMIC_STUDIO_HOME`, `VOICEOVER_HOME`, plus each plugin's
own `*_NO_BROWSER=1` to suppress the external browser entirely.
