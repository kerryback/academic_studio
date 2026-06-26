// Academic Studio Defaults — minimal built-in extension.
// 1. Declarative configurationDefaults (see package.json).
// 2. academicStudio.openHelp — opens the bundled help.md as a rendered Markdown
//    preview (wired into the Help menu by patches/common/51-help-menu-readme).
// 3. On startup, opens the Claude Code chat in the side bar (Claude-Desktop-like
//    launch). Because opening a folder reloads the window, this also covers
//    "open Claude when a folder is opened".
const vscode = require('vscode');
const path = require('path');

// To restrict Claude to only open once a folder is present, set this true.
const CLAUDE_ONLY_WITH_FOLDER = false;

function activate(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.openHelp', async () => {
			const uri = vscode.Uri.file(path.join(context.extensionPath, 'help.md'));
			// Open the rendered preview directly (no raw Markdown editor).
			await vscode.commands.executeCommand('markdown.showPreview', uri);
		})
	);

	openClaudeOnStartup();
}

function openClaudeOnStartup() {
	if (CLAUDE_ONLY_WITH_FOLDER && !(vscode.workspace.workspaceFolders || []).length) {
		return;
	}
	// The Claude Code extension activates onStartupFinished too; retry a few
	// times so we don't lose the race before its command is registered.
	let tries = 0;
	const tick = () => {
		vscode.commands.executeCommand('claude-vscode.sidebar.open').then(
			() => { /* opened */ },
			() => { if (++tries < 6) { setTimeout(tick, 700); } }
		);
	};
	setTimeout(tick, 800);
}

function deactivate() {}

module.exports = { activate, deactivate };
