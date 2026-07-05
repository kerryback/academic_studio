// Academic Studio Defaults — minimal built-in extension.
// 1. Declarative configurationDefaults (see package.json).
// 2. academicStudio.openHelp — opens the bundled help.md as a rendered Markdown
//    preview (wired into the Help menu by patches/common/51-help-menu-readme).
// 3. Opens Claude Code in the editor area on startup — but only if a Claude tab
//    isn't already there. VS Code restores the previous session's tabs, so
//    opening unconditionally stacked a duplicate Claude tab on every restart.
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
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

	openClaudeOnStartup();
}

// True if a Claude Code tab is already open in the editor area (e.g. restored
// from the previous session). The primary editor is a webview labelled
// "Claude Code"; match on the tab label or webview viewType.
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

function openClaudeOnStartup() {
	// Give session-restore a chance to reopen an existing Claude tab; only open
	// our own if none shows up, so we never duplicate the restored one.
	let waited = 0;
	// MAX_WAIT must stay comfortably longer than session-restore takes to reopen
	// the Claude tab, or a slow restore lets us open a duplicate. 1.5s is a safe
	// floor on normal hardware; don't drop much below ~1s.
	const STEP = 300, MAX_WAIT = 1500;
	const poll = () => {
		if (claudeTabIsOpen()) { return; }
		waited += STEP;
		if (waited < MAX_WAIT) { setTimeout(poll, STEP); return; }
		// Nothing restored a Claude tab — open one. Retry a few times in case the
		// Claude Code extension hasn't registered its command yet.
		let tries = 0;
		const tick = () => {
			if (claudeTabIsOpen()) { return; }
			vscode.commands.executeCommand('claude-vscode.primaryEditor.open').then(
				() => { /* opened */ },
				() => { if (++tries < 6) { setTimeout(tick, 700); } }
			);
		};
		tick();
	};
	setTimeout(poll, STEP);
}

// ---- Check for Updates -----------------------------------------------------
const LATEST_API = 'https://api.github.com/repos/kerryback/academic_studio/releases/latest';
// Open the downloads page rather than a direct installer URL: it always resolves
// to something useful (it shows "New Version Being Built" for a platform whose
// installer isn't published yet, instead of a 404), and lets the user pick the
// right build for their machine.
const DOWNLOADS_PAGE = 'https://academic-studio.com/#downloads';

// Installed product version (academicStudioVersion lives in the app's
// product.json, two levels up from this built-in extension's folder).
function currentVersion(context) {
	try {
		const pj = JSON.parse(fs.readFileSync(
			path.join(context.extensionPath, '..', '..', 'product.json'), 'utf8'));
		return pj.academicStudioVersion || null;
	} catch (e) { return null; }
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

function deactivate() {}

module.exports = { activate, deactivate };
