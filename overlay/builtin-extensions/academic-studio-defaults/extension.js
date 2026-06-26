// Academic Studio Defaults — minimal built-in extension.
// Besides the declarative configurationDefaults (see package.json), it registers
// one command: academicStudio.openHelp, which opens the bundled help.md as a
// rendered Markdown preview. Wired into the Help menu by the overlay patch
// patches/common/51-help-menu-readme.patch.
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
}

function deactivate() {}

module.exports = { activate, deactivate };
