// Academic Studio Defaults — minimal built-in extension.
// 1. Declarative configurationDefaults (see package.json).
// 2. academicStudio.openHelp — opens the bundled help.md as a rendered Markdown
//    preview (wired into the Help menu by patches/common/51-help-menu-readme).
// (We no longer open Claude Code on startup — the bundled Claude Code extension
//  now opens itself automatically, so doing it here just added a duplicate tab
//  on each restart.)
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
}

function deactivate() {}

module.exports = { activate, deactivate };
