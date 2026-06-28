// Academic Studio Defaults — minimal built-in extension.
// 1. Declarative configurationDefaults (see package.json).
// 2. academicStudio.openHelp — opens the bundled help.md as a rendered Markdown
//    preview (wired into the Help menu by patches/common/51-help-menu-readme).
// 3. Opens Claude Code in the editor area on startup — but only if a Claude tab
//    isn't already there. VS Code restores the previous session's tabs, so
//    opening unconditionally stacked a duplicate Claude tab on every restart.
const vscode = require('vscode');
const path = require('path');

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.openHelp', async () => {
			const uri = vscode.Uri.file(path.join(context.extensionPath, 'help.md'));
			// Open the rendered preview directly (no raw Markdown editor).
			await vscode.commands.executeCommand('markdown.showPreview', uri);
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

	// Help → Check for Updates… opens the GitHub Releases page in the browser.
	// (The in-app auto-updater isn't wired to an Academic Studio feed yet, so we
	// point users at the releases page to grab a newer installer.)
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.checkForUpdates', async () => {
			await vscode.env.openExternal(
				vscode.Uri.parse('https://github.com/kerryback/academic_studio/releases'));
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

function deactivate() {}

module.exports = { activate, deactivate };
