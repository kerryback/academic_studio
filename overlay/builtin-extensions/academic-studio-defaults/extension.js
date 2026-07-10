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

	// Claude menu (top-level, added by patch 54). Commands surface Claude Code
	// workflows — permissions, skills, memory files, MCP connectors, plugins —
	// so students can see and manage them without knowing CLI conventions.
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.claudePermissions',
			() => pickClaudePermissions()),
		vscode.commands.registerCommand('academicStudio.claudeInstalledSkills',
			() => pickInstalledSkills()),
		vscode.commands.registerCommand('academicStudio.claudeNewSkill',
			() => createNewSkill()),
		vscode.commands.registerCommand('academicStudio.claudeGetSkills',
			() => vscode.env.openExternal(vscode.Uri.parse('https://github.com/anthropics/skills'))),
		vscode.commands.registerCommand('academicStudio.claudeMemoryFiles',
			() => pickMemoryFiles()),
		vscode.commands.registerCommand('academicStudio.claudeMcpConnectors',
			() => pickMcpConnectors()),
		vscode.commands.registerCommand('academicStudio.claudePlugins',
			() => vscode.env.openExternal(vscode.Uri.parse('https://code.claude.com/docs/en/discover-plugins')))
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

	openClaudeOnStartup(context);
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

function openClaudeOnStartup(context) {
	// Give session-restore a chance to reopen an existing Claude tab; only open
	// our own if none shows up, so we never duplicate the restored one. A fixed
	// short delay loses this race on slow machines / big sessions, so watch tab
	// events and use a generous fallback deadline instead.
	if (claudeTabIsOpen()) { return; }
	let settled = false;
	let listener = null;
	try {
		listener = vscode.window.tabGroups.onDidChangeTabs(() => {
			if (!settled && claudeTabIsOpen()) {
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
		if (claudeTabIsOpen()) { return; }
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
	}, MAX_WAIT);
}

// ---- Claude Permissions ------------------------------------------------------
// The Claude Code extension exposes claudeCode.initialPermissionMode with these
// four values (its full allowed set). "bypassPermissions" is additionally gated
// behind claudeCode.allowDangerouslySkipPermissions, which we set/clear here so
// the picked mode actually works.
const CLAUDE_PERMISSION_MODES = [
	{
		mode: 'default', label: 'Ask before changes',
		detail: 'Claude asks your permission before editing files or running commands.',
	},
	{
		mode: 'acceptEdits', label: 'Allow file edits',
		detail: 'Claude edits files without asking, but still asks before running commands.',
	},
	{
		mode: 'plan', label: 'Plan first',
		detail: 'Claude only reads and proposes a plan; nothing changes until you approve it.',
	},
	{
		mode: 'bypassPermissions', label: 'Allow everything',
		detail: 'Claude edits files and runs commands without ever asking. Use with care.',
	},
];

async function pickClaudePermissions() {
	const config = vscode.workspace.getConfiguration('claudeCode');
	const current = config.get('initialPermissionMode') || 'default';
	const pick = await vscode.window.showQuickPick(
		CLAUDE_PERMISSION_MODES.map(m => ({
			label: m.label,
			description: m.mode === current ? 'current setting' : undefined,
			detail: m.detail,
			mode: m.mode,
		})),
		{
			title: 'Claude Permissions',
			placeHolder: 'How much can Claude do without asking you first?',
		}
	);
	if (!pick || pick.mode === current) { return; }

	if (pick.mode === 'bypassPermissions') {
		const confirmed = await vscode.window.showWarningMessage(
			'With "Allow everything", Claude will edit files and run commands without '
			+ 'ever asking you. A mistaken command could delete or overwrite your work. '
			+ 'Are you sure?',
			{ modal: true }, 'Allow Everything');
		if (confirmed !== 'Allow Everything') { return; }
		await config.update('allowDangerouslySkipPermissions', true, vscode.ConfigurationTarget.Global);
	} else {
		// Close the dangerous gate again when moving off "Allow everything".
		await config.update('allowDangerouslySkipPermissions', undefined, vscode.ConfigurationTarget.Global);
	}
	await config.update('initialPermissionMode', pick.mode, vscode.ConfigurationTarget.Global);
	vscode.window.showInformationMessage(
		`Claude permissions set to "${pick.label}". This applies to new Claude conversations; `
		+ 'a conversation that is already open keeps its current setting.');
}

// ---- Claude skills -----------------------------------------------------------
// Skills are folders under ~/.claude/skills/, each with a SKILL.md whose
// frontmatter carries a name and a description. Same location the setup
// extension installs package skills into.
function claudeSkillsHome() { return path.join(os.homedir(), '.claude', 'skills'); }

function listInstalledSkills() {
	const dir = claudeSkillsHome();
	let names = [];
	try {
		names = fs.readdirSync(dir).filter(n => {
			try { return fs.statSync(path.join(dir, n)).isDirectory() && fs.existsSync(path.join(dir, n, 'SKILL.md')); }
			catch (e) { return false; }
		});
	} catch (e) { /* no skills dir yet */ }
	return names.sort().map(name => {
		let desc = '';
		try {
			const text = fs.readFileSync(path.join(dir, name, 'SKILL.md'), 'utf8');
			const m = text.match(/^description:\s*["']?(.+?)["']?\s*$/m);
			if (m) { desc = m[1]; }
		} catch (e) { /* unreadable SKILL.md — list it anyway */ }
		return {
			label: name,
			detail: desc.length > 140 ? desc.slice(0, 140) + '…' : desc,
			buttons: [{ iconPath: new vscode.ThemeIcon('trash'), tooltip: 'Delete this skill' }],
			skillName: name,
		};
	});
}

async function pickInstalledSkills() {
	const items = listInstalledSkills();
	if (!items.length) {
		const pick = await vscode.window.showInformationMessage(
			'No Claude skills are installed yet. Skills are step-by-step instructions '
			+ 'Claude can follow for specialized tasks.',
			'Create New Skill…', 'Get Skills from Anthropic');
		if (pick === 'Create New Skill…') { createNewSkill(); }
		if (pick === 'Get Skills from Anthropic') {
			vscode.env.openExternal(vscode.Uri.parse('https://github.com/anthropics/skills'));
		}
		return;
	}
	const qp = vscode.window.createQuickPick();
	qp.title = 'Installed Claude Skills';
	qp.placeholder = 'Select a skill to open its instructions — or click the trash icon to delete it';
	qp.ignoreFocusOut = true; // survive the focus shift to the delete-confirmation dialog
	qp.items = items;
	qp.onDidAccept(async () => {
		const sel = qp.selectedItems[0];
		if (!sel) { return; }
		qp.hide();
		const doc = await vscode.workspace.openTextDocument(
			path.join(claudeSkillsHome(), sel.skillName, 'SKILL.md'));
		await vscode.window.showTextDocument(doc);
	});
	qp.onDidTriggerItemButton(async (e) => {
		const name = e.item.skillName;
		const ok = await vscode.window.showWarningMessage(
			`Delete the skill "${name}"? Its whole folder is removed and Claude will no longer know it.`,
			{ modal: true }, 'Delete Skill');
		if (ok !== 'Delete Skill') { return; }
		const dir = claudeSkillsHome();
		const target = path.join(dir, name);
		// Only ever delete a direct child of the skills folder.
		if (path.dirname(target) !== dir) { return; }
		try { fs.rmSync(target, { recursive: true, force: true }); }
		catch (err) {
			vscode.window.showErrorMessage(`Could not delete "${name}": ${err && err.message ? err.message : err}`);
			return;
		}
		const rest = listInstalledSkills();
		if (rest.length) { qp.items = rest; } else { qp.hide(); }
		vscode.window.showInformationMessage(`Deleted skill "${name}".`);
	});
	qp.onDidHide(() => qp.dispose());
	qp.show();
}

async function createNewSkill() {
	const name = await vscode.window.showInputBox({
		title: 'New Claude Skill',
		prompt: 'Name the new skill (lowercase letters, numbers, and hyphens)',
		placeHolder: 'e.g. lit-review-summaries',
		validateInput: (v) => {
			if (!v || !/^[a-z0-9][a-z0-9-]*$/.test(v)) {
				return 'Use lowercase letters, numbers, and hyphens.';
			}
			if (fs.existsSync(path.join(claudeSkillsHome(), v))) {
				return 'A skill with this name already exists.';
			}
			return null;
		},
	});
	if (!name) { return; }
	const dir = path.join(claudeSkillsHome(), name);
	fs.mkdirSync(dir, { recursive: true });
	const skillFile = path.join(dir, 'SKILL.md');
	fs.writeFileSync(skillFile, [
		'---',
		`name: ${name}`,
		'description: One sentence saying what this skill does and when Claude should use it.',
		'---',
		'',
		`# ${name}`,
		'',
		'Write the step-by-step instructions Claude should follow when using this skill.',
		'',
		'1. First step…',
		'2. Second step…',
		'',
		'Tips: the description above is how Claude decides when to use the skill, so',
		'make it specific. After saving, start a new Claude conversation to try it out.',
		'You can also ask Claude to improve this skill for you.',
		'',
	].join('\n'));
	const doc = await vscode.workspace.openTextDocument(skillFile);
	await vscode.window.showTextDocument(doc);
}

// ---- Claude memory files (CLAUDE.md / AGENTS.md) -----------------------------
// Claude Code reads CLAUDE.md (project and ~/.claude). It does NOT read
// AGENTS.md directly — the documented pattern is a CLAUDE.md line "@AGENTS.md"
// that imports it, which we wire up automatically when creating AGENTS.md.
async function pickMemoryFiles() {
	const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	const items = [];
	if (ws) {
		items.push({
			label: 'CLAUDE.md — this folder',
			detail: `Project instructions Claude reads whenever it works in "${ws.name}".`,
			kind: 'project',
		});
	}
	items.push({
		label: 'CLAUDE.md — global',
		detail: 'Personal instructions Claude reads in every project (~/.claude/CLAUDE.md).',
		kind: 'global',
	});
	if (ws) {
		items.push({
			label: 'AGENTS.md — this folder',
			detail: 'Cross-tool instructions. CLAUDE.md gets an "@AGENTS.md" line so Claude reads it too.',
			kind: 'agents',
		});
	}
	const pick = await vscode.window.showQuickPick(items, {
		title: 'Claude Memory Files',
		placeHolder: 'Instruction files Claude reads at the start of every conversation — pick one to create or edit',
	});
	if (!pick) { return; }

	let file;
	if (pick.kind === 'global') {
		file = path.join(os.homedir(), '.claude', 'CLAUDE.md');
		ensureFile(file, [
			'# My Instructions for Claude (all projects)',
			'',
			'Claude reads this file at the start of every conversation, in every folder.',
			'Write personal preferences here — for example:',
			'',
			'- Explain what you are doing in plain language.',
			'- I use Python; prefer pandas for data work.',
			'',
		].join('\n'));
	} else if (pick.kind === 'project') {
		file = path.join(ws.uri.fsPath, 'CLAUDE.md');
		ensureFile(file, [
			'# Instructions for Claude (this folder)',
			'',
			'Claude reads this file at the start of every conversation in this folder.',
			'Write facts and rules about this project — for example:',
			'',
			'- The data files live in data/ and results go in output/.',
			'- Always show plots with labeled axes.',
			'',
		].join('\n'));
	} else {
		file = path.join(ws.uri.fsPath, 'AGENTS.md');
		ensureFile(file, [
			'# Instructions for AI agents',
			'',
			'Instructions any AI coding tool should follow when working in this folder.',
			'',
		].join('\n'));
		// Claude only reads AGENTS.md through a CLAUDE.md import — make sure it exists.
		const claudeMd = path.join(ws.uri.fsPath, 'CLAUDE.md');
		try {
			const cur = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, 'utf8') : '';
			if (!/^@AGENTS\.md\s*$/m.test(cur)) {
				fs.writeFileSync(claudeMd, '@AGENTS.md\n' + (cur ? '\n' + cur : ''));
			}
		} catch (e) { /* leave AGENTS.md usable even if CLAUDE.md is unwritable */ }
	}
	const doc = await vscode.workspace.openTextDocument(file);
	await vscode.window.showTextDocument(doc);
}

function ensureFile(file, template) {
	if (!fs.existsSync(file)) {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.writeFileSync(file, template);
	}
}

// ---- Claude MCP connectors ----------------------------------------------------
// User-scope servers live in ~/.claude.json (mcpServers); a project can add its
// own in <folder>/.mcp.json. Read-only list; picking an entry opens the file it
// came from. Guided installs stay in Run Setup's package catalog.
async function pickMcpConnectors() {
	const userCfg = path.join(os.homedir(), '.claude.json');
	const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
	const items = [];
	const describe = (cfg) =>
		cfg && cfg.command ? [cfg.command].concat(cfg.args || []).join(' ') : (cfg && (cfg.url || cfg.type)) || '';
	const addFrom = (file, scopeLabel) => {
		try {
			const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
			for (const [name, server] of Object.entries(cfg.mcpServers || {})) {
				items.push({ label: name, description: scopeLabel, detail: describe(server), file });
			}
		} catch (e) { /* missing or unparsable config — skip */ }
	};
	addFrom(userCfg, 'all projects');
	if (ws) { addFrom(path.join(ws.uri.fsPath, '.mcp.json'), 'this folder'); }

	const tail = [
		{ label: '', kind: vscode.QuickPickItemKind.Separator },
		{ label: '$(gear) Open the connector configuration file', detail: '~/.claude.json — user-level MCP servers live under "mcpServers"', file: userCfg, isConfig: true },
		{ label: '$(book) Learn about MCP connectors', detail: 'code.claude.com/docs/en/mcp', isDocs: true },
	];
	const pick = await vscode.window.showQuickPick(items.concat(tail), {
		title: 'Claude MCP Connectors',
		placeHolder: items.length
			? 'Connectors give Claude extra tools (databases, web services, …) — select one to open its configuration'
			: 'No MCP connectors configured yet — packages in Run Setup can add them, or edit the configuration file',
	});
	if (!pick) { return; }
	if (pick.isDocs) {
		vscode.env.openExternal(vscode.Uri.parse('https://code.claude.com/docs/en/mcp'));
		return;
	}
	if (pick.file) {
		if (pick.isConfig) { ensureFile(pick.file, '{\n  "mcpServers": {}\n}\n'); }
		const doc = await vscode.workspace.openTextDocument(pick.file);
		await vscode.window.showTextDocument(doc);
	}
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
