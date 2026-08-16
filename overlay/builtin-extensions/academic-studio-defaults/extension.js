// Academic Studio Defaults — minimal built-in extension.
// 1. Declarative configurationDefaults (see package.json).
// 2. academicStudio.openHelp — opens the bundled help.md as a rendered Markdown
//    preview (wired into the Help menu by patches/common/51-help-menu-readme).
// 3. Opens Claude Code in the editor area on startup — but only if a Claude tab
//    isn't already there. VS Code restores the previous session's tabs, so
//    opening unconditionally stacked a duplicate Claude tab on every restart.
const vscode = require('vscode');
const os = require('os');
const path = require('path');
const fs = require('fs');

function activate(context) {
	setupSkillAppsInApp(context);
	seedRemoteSshValidation();
	seedRemoteSshExtensions(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.openHelp', async () => {
			const uri = vscode.Uri.file(path.join(context.extensionPath, 'help.md'));
			// Open the rendered preview directly (no raw Markdown editor).
			await vscode.commands.executeCommand('markdown.showPreview', uri);
		})
	);

	// Help → Tour of Academic Studio (and Welcome page). Opens the bundled,
	// self-contained reveal.js slide deck in an in-app webview. The HTML embeds
	// all its images, fonts, and scripts, so no network or resource roots are
	// needed; enableScripts lets reveal.js run.
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.openTour', async () => {
			const panel = vscode.window.createWebviewPanel(
				'academicStudioTour', 'Tour of Academic Studio',
				vscode.ViewColumn.Active,
				{ enableScripts: true, retainContextWhenHidden: true }
			);
			try {
				panel.webview.html = fs.readFileSync(
					path.join(context.extensionPath, 'tour.html'), 'utf8');
			} catch (e) {
				panel.webview.html = '<body style="font-family:sans-serif;padding:2em">'
					+ 'Could not open the tour. You can view it online at '
					+ '<a href="https://academic-studio.com/tour.html">academic-studio.com/tour.html</a>.</body>';
			}
		})
	);

	// Help → About Academic Studio. We use our own command id (rather than
	// wiring the built-in workbench.action.showAboutDialog directly into the
	// Help menu) because the native menu injects a "Check for Updates…" item
	// next to any showAboutDialog entry — which would duplicate the one below.
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.about', async () => {
			await vscode.commands.executeCommand('workbench.action.showAboutDialog');
		})
	);

	// Help → Check for Updates… compares the installed version against the latest
	// GitHub release and offers a direct download of the right installer.
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.checkForUpdates',
			() => checkForUpdates(context))
	);

	// The Claude menu's nine commands are NOT registered here. They live in core
	// (patch 55, contrib/academicStudio/browser/claudeMenu.contribution.ts) because
	// an extension cannot serve them in a Remote-SSH window: see the extensionKind
	// note in package.json. Core also reaches the REMOTE ~/.claude, which is the
	// one Claude Code reads when the window is remote.

	// File → New File entries for file types that don't add their own. Each opens
	// a new untitled document in the right language (save it with the extension).
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.newLatexFile', async () => {
			const doc = await vscode.workspace.openTextDocument({ language: 'latex' });
			await vscode.window.showTextDocument(doc);
		}),
		vscode.commands.registerCommand('academicStudio.newMarkdownFile', async () => {
			const doc = await vscode.workspace.openTextDocument({ language: 'markdown' });
			await vscode.window.showTextDocument(doc);
		})
	);

	openClaudeOnStartup(context);
}

// True if a Claude Code tab is recognizably open. Best-effort only: newer
// Claude Code versions title the tab with the conversation name (not "Claude
// Code"), so a restored Claude tab is NOT reliably detectable — which is why
// startup auto-open must not depend on this returning true (see below).
// ---- Remote SSH ---------------------------------------------------------------
// open-remote-ssh installs VSCodium's remote extension host (we publish none of
// our own), and its commit can never match ours -- BUILD_SOURCEVERSION is a sha1
// of a time-based release version -- so the remote server has to have its commit
// rewritten to match the client. That is remote.SSH.serverValidation:force.
//
// The URL and the server binary name both come from product.json, which the
// extension reads off disk. This one has no product.json equivalent: it exists
// only as a setting, and product.json's configurationDefaults does NOT reach it
// (1.2 shipped it that way and the extension never saw it). So write it as a
// real user setting instead.
//
// Only when there is no global value at all. Once written, the value is defined,
// so anyone who later sets it back to 'strict' or 'skip' keeps their choice --
// this never fights the user, and never runs again on their machine.
async function seedRemoteSshValidation() {
	try {
		const config = vscode.workspace.getConfiguration('remote.SSH');
		if (config.inspect('serverValidation')?.globalValue === undefined) {
			await config.update('serverValidation', 'force', vscode.ConfigurationTarget.Global);
		}
	} catch (e) {
		// A failure here costs remote SSH, not the whole editor — stay quiet.
	}
}

// Our bundled extensions are built INTO the desktop app. The remote extension
// host is stock VSCodium, so none of them exist there -- and an extension with a
// `main` is deduced as extensionKind ['workspace'], which in a remote window can
// only run on the remote. Result before this: no Claude Code, no Quarto, no
// LaTeX Workshop, no Python over Remote-SSH.
//
// open-remote-ssh's remote.SSH.defaultExtensions turns each id into
// `--install-extension <id>` when it sets the server up, resolved from our
// gallery (Open VSX). So name the bundled set there and every host gets them.
// Ids come from product.json rather than a second hardcoded list, so this cannot
// drift from what the app actually ships.
//
// Client-only extensions are excluded: open-remote-ssh IS the client, and the
// js-debug trio backs a debugger Academic Studio hides anyway.
const REMOTE_EXTENSION_DENYLIST = new Set([
	'jeanp413.open-remote-ssh',
	'ms-vscode.js-debug',
	'ms-vscode.js-debug-companion',
	'ms-vscode.vscode-js-profile-table',
]);

// The app's product.json, two levels up from this built-in extension's folder.
function readProductJson(context) {
	try {
		return JSON.parse(fs.readFileSync(
			path.join(context.extensionPath, '..', '..', 'product.json'), 'utf8'));
	} catch (e) { return null; }
}

// Seeded only when there is no global value at all, exactly like
// serverValidation above: once written it is the user's setting, and adding or
// removing bundled extensions in a later release will not overwrite their list.
async function seedRemoteSshExtensions(context) {
	try {
		const config = vscode.workspace.getConfiguration('remote.SSH');
		if (config.inspect('defaultExtensions')?.globalValue !== undefined) { return; }
		const product = readProductJson(context);
		const ids = ((product && product.builtInExtensions) || [])
			.map(e => e && e.name)
			.filter(id => id && !REMOTE_EXTENSION_DENYLIST.has(String(id).toLowerCase()));
		if (!ids.length) { return; }
		await config.update('defaultExtensions', ids, vscode.ConfigurationTarget.Global);
	} catch (e) {
		// Same bargain as above — a failure costs remote extensions, not the editor.
	}
}

function claudeTabIsOpen() {
	try {
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const viewType = tab.input && tab.input.viewType;
				if ((viewType && /claude/i.test(viewType)) || /claude/i.test(tab.label || '')) {
					return true;
				}
			}
		}
	} catch (e) { /* tabGroups API unavailable — fall through and just try to open */ }
	return false;
}

// True if the window restored any real editor tab (anything besides the
// Welcome page). A restored session is left exactly as the user last had it —
// including a Claude tab we may not be able to recognize by name.
function restoredTabsExist() {
	try {
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				if (!/^(welcome|walkthrough)/i.test(tab.label || '')) { return true; }
			}
		}
	} catch (e) { /* tabGroups API unavailable — treat as restored, do nothing */ return true; }
	return false;
}

function openClaudeOnStartup(context) {
	// Auto-open Claude only in a FRESH window (no restored editor tabs beyond
	// the Welcome page). We used to open whenever no Claude tab was detected,
	// but Claude Code now titles its tab with the conversation name, so a
	// restored Claude tab looks like any other tab and the detection opened a
	// duplicate on every restart. A restored session — with or without Claude —
	// is the user's own state and is never touched; Claude is always one click
	// away via Claude → New Chat.
	if (claudeTabIsOpen()) { return; }
	let settled = false;
	let listener = null;
	try {
		listener = vscode.window.tabGroups.onDidChangeTabs(() => {
			if (!settled && (claudeTabIsOpen() || restoredTabsExist())) {
				settled = true;
				if (listener) { listener.dispose(); }
			}
		});
		if (context) { context.subscriptions.push(listener); }
	} catch (e) { /* tabGroups events unavailable — the deadline check still runs */ }
	const MAX_WAIT = 3000;
	setTimeout(() => {
		if (settled) { return; }
		settled = true;
		if (listener) { listener.dispose(); }
		if (claudeTabIsOpen() || restoredTabsExist()) { return; }
		// Genuinely fresh window — open Claude. Retry a few times in case the
		// Claude Code extension hasn't registered its command yet.
		let tries = 0;
		const tick = () => {
			if (claudeTabIsOpen() || restoredTabsExist()) { return; }
			vscode.commands.executeCommand('claude-vscode.primaryEditor.open').then(
				() => { /* opened */ },
				() => { if (++tries < 6) { setTimeout(tick, 700); } }
			);
		};
		tick();
	}, MAX_WAIT);
}

// ---- Check for Updates -----------------------------------------------------
const LATEST_API = 'https://api.github.com/repos/kerryback/academic_studio/releases/latest';
// Open the downloads page rather than a direct installer URL: it always resolves
// to something useful (it shows "New Version Being Built" for a platform whose
// installer isn't published yet, instead of a 404), and lets the user pick the
// right build for their machine.
const DOWNLOADS_PAGE = 'https://academic-studio.com/#downloads';

// Installed product version (academicStudioVersion lives in product.json).
function currentVersion(context) {
	const pj = readProductJson(context);
	return (pj && pj.academicStudioVersion) || null;
}

// Numeric dotted-version compare: returns >0 if a is newer than b.
function cmpVersions(a, b) {
	const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
	const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] || 0) - (pb[i] || 0);
		if (d) return d;
	}
	return 0;
}

async function checkForUpdates(context) {
	const open = (u) => vscode.env.openExternal(vscode.Uri.parse(u));

	let latest = null;
	try {
		const res = await fetch(LATEST_API, {
			headers: { 'User-Agent': 'Academic-Studio', 'Accept': 'application/vnd.github+json' },
		});
		if (res && res.ok) {
			const data = await res.json();
			latest = (data.tag_name || '').replace(/^v/i, '') || null;
		}
	} catch (e) { /* offline or blocked — fall through */ }

	if (!latest) {
		vscode.window.showWarningMessage(
			'Could not check for updates. Please check your connection and try again.');
		return;
	}

	const current = currentVersion(context);
	if (current && cmpVersions(latest, current) <= 0) {
		vscode.window.showInformationMessage(
			`You're up to date — you have Academic Studio ${current}, which is the latest version. Nothing to install.`);
		return;
	}

	const have = current ? `you have ${current}` : 'a newer version is available';
	// The message text isn't clickable — only the button is. Label it clearly so
	// it's obvious where to click.
	// "Install" is deliberately generic: on Windows you run the Setup.exe, on macOS
	// you drag the app onto Applications (a .dmg is not a run-it installer). Quit
	// first so the update replaces the running copy rather than reopening it.
	const macHint = process.platform === 'darwin'
		? ' On the Mac: quit Academic Studio, then drag the new app onto your Applications folder.'
		: '';
	const pick = await vscode.window.showInformationMessage(
		`Academic Studio ${latest} is available (${have}). Open the downloads page to `
		+ `download and install it.` + macHint,
		'Open Downloads Page');
	if (pick === 'Open Downloads Page') open(DOWNLOADS_PAGE);
}

// --- Skill apps: open them inside Academic Studio ---------------------------
// Several skills (voiceover, smithers, litdb, participation) launch a local web
// app. Outside Studio their launchers open the system browser; inside Studio we
// open them in an in-editor Simple Browser tab instead. Coordination is two
// small files per channel directory:
//   inapp     a capability marker we write on activation, containing our process
//             id. A launcher only skips the external browser when this exists, so
//             an un-updated launcher, or a Studio without this code, still works.
//   app-url   the launcher writes the app URL here each launch; we watch it and
//             open that URL in Simple Browser.
// ~/.academic-studio is the generic channel every new skill app should use.
// ~/.voiceover is kept because shipped copies of the voiceover launcher still
// look there.
//
// Local-only by nature: this extension runs in the local extension host, so the
// channel directories are on THIS machine. In a Remote-SSH window the skill app
// launches on the host and writes its app-url there, where nothing is watching —
// the handoff to Simple Browser does not happen and the launcher falls back to
// its own browser. Fixing that means a port-forwarded watcher, not a marker file.
function skillAppChannels() {
	const generic = process.env.ACADEMIC_STUDIO_HOME
		|| path.join(os.homedir(), '.academic-studio');
	const voiceover = process.env.VOICEOVER_HOME || path.join(os.homedir(), '.voiceover');
	return [generic, voiceover];
}

function setupSkillAppsInApp(context) {
	let lastUrl = '';
	let lastAt = 0;
	for (const home of skillAppChannels()) {
		const marker = path.join(home, 'inapp');
		const urlFile = path.join(home, 'app-url');
		try { fs.mkdirSync(home, { recursive: true }); } catch (e) { continue; }
		try { fs.writeFileSync(marker, String(process.pid)); } catch (e) { continue; }
		context.subscriptions.push({ dispose() { try { fs.unlinkSync(marker); } catch (e) { /* ignore */ } } });

		const openFromFile = () => {
			let url = '';
			try { url = fs.readFileSync(urlFile, 'utf8').trim(); } catch (e) { return; }
			if (!url) { return; }
			const now = Date.now();
			// De-dupe across channels too: a launcher that publishes the same URL to
			// both must not open two tabs.
			if (url === lastUrl && now - lastAt < 3000) { return; }
			lastUrl = url; lastAt = now;
			vscode.commands.executeCommand('simpleBrowser.show', url).then(undefined,
				() => { vscode.env.openExternal(vscode.Uri.parse(url)); });
		};
		// The files live outside the workspace, so poll rather than use a workspace
		// watcher. Only reacts to CHANGES, so a stale URL from a past session is
		// ignored.
		fs.watchFile(urlFile, { interval: 1000 }, () => openFromFile());
		context.subscriptions.push({ dispose() { try { fs.unwatchFile(urlFile); } catch (e) { /* ignore */ } } });
	}
}

function deactivate() {}

module.exports = { activate, deactivate };
