// Academic Studio Setup — first-run audience picker, extension enablement, and
// optional installation of supporting programs (Python, Quarto, R, TinyTeX,
// decktape, GitHub CLI).
//
// - Audience radio seeds an editable extension checklist; "Apply" enables the
//   chosen extensions + disables the rest (academicStudio.setExtensionsEnablement,
//   patch 52) and reloads.
// - "Supporting programs" lists external tools with detected status; "Install
//   selected programs" runs each tool's official installer in a visible terminal
//   (continue-on-error) and reports what succeeded / failed with manual links.
//
// Re-openable any time via the "Academic Studio Setup…" command.
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SETUP_DONE_KEY = 'academicStudio.setupCompleted';
const SELECTION_KEY = 'academicStudio.selection';

// ---- bundled extensions catalog (enable/disable) ---------------------------
//   group: common -> everyone, faculty -> Faculty, student -> Students & Pros.
//   excludes: id that cannot be active at the same time.
const CATALOG = [
	{ id: 'quarto.quarto', label: 'Quarto', group: 'common' },
	{ id: 'cweijan.vscode-office', label: 'Office document viewer', group: 'common' },
	{ id: 'ms-python.python', label: 'Python', group: 'common' },
	{ id: 'detachhead.basedpyright', label: 'Python type checking (basedpyright)', group: 'common' },
	{ id: 'mechatroner.rainbow-csv', label: 'Rainbow CSV', group: 'common' },
	{ id: 'ms-toolsai.jupyter', label: 'Jupyter', group: 'common' },
	{ id: 'streetsidesoftware.code-spell-checker', label: 'Spell Checker', group: 'common' },
	{ id: 'anthropic.claude-code', label: 'Claude Code', group: 'common' },
	{ id: 'james-yu.latex-workshop', label: 'LaTeX Workshop (PDF via LaTeX)', group: 'faculty', excludes: 'tomoki1207.pdf' },
	{ id: 'tomoki1207.pdf', label: 'PDF viewer', group: 'student', excludes: 'james-yu.latex-workshop' },
	{ id: 'reditorsupport.r', label: 'R language support', group: 'faculty' },
	{ id: 'reditorsupport.r-syntax', label: 'R syntax', group: 'faculty' },
	{ id: 'jeanp413.open-remote-ssh', label: 'Open Remote - SSH', group: 'faculty' },
];

function presetFor(audience) {
	return CATALOG.filter(c =>
		c.group === 'common' ||
		(audience === 'faculty' ? c.group === 'faculty' : c.group === 'student')
	).map(c => c.id);
}

// ---- supporting programs catalog (detect + install) ------------------------
//   detect: shell command; exit 0 => present (stdout/stderr => version)
//   installMac: array of bash lines run inside a `( set -e … )` subshell
//   group: common -> everyone, faculty -> Faculty, optin -> off by default
//   prereq: another program id that must be present-or-selected first
const PROGRAMS = [
	{
		id: 'python', label: 'Python + scientific libraries + Office-related libraries', group: 'common',
		detect: 'python3 --version',
		manualUrl: 'https://www.python.org/downloads/macos/',
		manualSteps: 'Download the macOS 64-bit universal2 installer and run it, then reopen the app.',
		installMac: [
			'V=$(for v in $(curl -fsSL https://www.python.org/ftp/python/ | grep -oE "3\\.[0-9]+\\.[0-9]+/" | tr -d / | sort -V -r | head -10); do curl -fsS -o /dev/null -I "https://www.python.org/ftp/python/$v/python-$v-macos11.pkg" 2>/dev/null && { echo "$v"; break; }; done)',
			'[ -n "$V" ] || { echo "Could not find a Python installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "https://www.python.org/ftp/python/$V/python-$V-macos11.pkg" -o "$TMP/python.pkg"',
			'sudo installer -pkg "$TMP/python.pkg" -target /',
			'python3 -m pip install --upgrade pip',
			'python3 -m pip install numpy pandas matplotlib scipy jupyter scikit-learn seaborn statsmodels sympy openpyxl python-pptx python-docx plotly',
		],
	},
	{
		id: 'node', label: 'Node.js (used by Claude for Word & PowerPoint creation)', group: 'common',
		detect: 'node --version',
		manualUrl: 'https://nodejs.org/',
		manualSteps: 'Download the macOS Installer (.pkg) from nodejs.org and run it.',
		installMac: [
			'VER=$(curl -fsSL https://nodejs.org/dist/index.json | tr \'}\' \'\\n\' | grep \'"lts":"\' | head -1 | grep -oE \'v[0-9][0-9.]+\' | head -1)',
			'[ -n "$VER" ] || { echo "Could not find the latest Node LTS version."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "https://nodejs.org/dist/$VER/node-$VER.pkg" -o "$TMP/node.pkg"',
			'sudo installer -pkg "$TMP/node.pkg" -target /',
		],
	},
	{
		id: 'quarto', label: 'Quarto', group: 'common',
		detect: 'quarto --version',
		manualUrl: 'https://quarto.org/docs/get-started/',
		manualSteps: 'Download the macOS .pkg from quarto.org and run it.',
		installMac: [
			'URL=$(curl -fsSL https://api.github.com/repos/quarto-dev/quarto-cli/releases/latest | grep -oE "https://[^\\"]+macos\\.pkg" | head -1)',
			'[ -n "$URL" ] || { echo "Could not find the latest Quarto installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "$URL" -o "$TMP/quarto.pkg"',
			'sudo installer -pkg "$TMP/quarto.pkg" -target /',
		],
	},
	{
		id: 'git', label: 'Git (version control; installs the Apple Command Line Tools)', group: 'faculty',
		detect: 'xcode-select -p >/dev/null 2>&1 && echo installed',
		manualUrl: 'https://git-scm.com/download/mac',
		manualSteps: 'Run "xcode-select --install" in Terminal and complete the macOS dialog.',
		installMac: [
			'xcode-select --install 2>/dev/null || true',
			'echo "If a macOS dialog appeared, click Install and wait for it to finish (this can take several minutes)…"',
			'for i in $(seq 1 180); do xcode-select -p >/dev/null 2>&1 && break; sleep 10; done',
			'xcode-select -p >/dev/null 2>&1 || { echo "Command Line Tools not detected — finish the install, then re-run."; exit 1; }',
		],
	},
	{
		id: 'gh', label: 'GitHub CLI (gh)', group: 'faculty',
		detect: 'gh --version',
		manualUrl: 'https://cli.github.com/',
		manualSteps: 'Download the macOS .pkg from cli.github.com and run it.',
		installMac: [
			'URL=$(curl -fsSL https://api.github.com/repos/cli/cli/releases/latest | grep -oE "https://[^\\"]+_macOS_universal\\.pkg" | head -1)',
			'[ -n "$URL" ] || { echo "Could not find the latest gh installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "$URL" -o "$TMP/gh.pkg"',
			'sudo installer -pkg "$TMP/gh.pkg" -target /',
		],
	},
	{
		id: 'r', label: 'R', group: 'faculty',
		detect: 'R --version',
		manualUrl: 'https://cran.r-project.org/',
		manualSteps: 'Download the macOS .pkg from CRAN and run it.',
		installMac: [
			'REL=$(curl -fsSL https://cran.r-project.org/bin/macosx/big-sur-arm64/base/ | grep -oE "R-[0-9.]+-arm64\\.pkg" | sort -V | tail -1)',
			'[ -n "$REL" ] || { echo "Could not find the latest R installer URL."; exit 1; }',
			'TMP=$(mktemp -d); curl -fsSL "https://cran.r-project.org/bin/macosx/big-sur-arm64/base/$REL" -o "$TMP/R.pkg"',
			'sudo installer -pkg "$TMP/R.pkg" -target /',
			'Rscript -e \'install.packages("languageserver", repos="https://cloud.r-project.org")\' || true',
		],
	},
	{
		id: 'tinytex', label: 'TinyTeX (LaTeX)', group: 'faculty',
		detect: 'tlmgr --version',
		manualUrl: 'https://yihui.org/tinytex/',
		manualSteps: 'Run: curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh | sh',
		installMac: [
			'curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh | sh',
		],
	},
	{
		id: 'decktape', label: 'decktape (HTML slides → PDF/PPTX)', group: 'optin', prereq: 'node',
		detect: 'decktape version',
		manualUrl: 'https://github.com/astefanutti/decktape',
		manualSteps: 'With Node.js installed, run: npm install -g decktape',
		installMac: [
			'npm install -g decktape || sudo npm install -g decktape',
		],
	},
	{
		id: 'libreoffice', label: 'LibreOffice (PDF export & thumbnails for the Word/PowerPoint skills)', group: 'optin',
		detect: '[ -d /Applications/LibreOffice.app ] && echo installed',
		manualUrl: 'https://www.libreoffice.org/download/download/',
		manualSteps: 'Download LibreOffice for macOS from libreoffice.org and drag it to Applications.',
		installMac: [
			'VER=$(curl -fsSL https://download.documentfoundation.org/libreoffice/stable/ | grep -oE "[0-9]+\\.[0-9]+\\.[0-9]+/" | tr -d / | sort -V | tail -1)',
			'[ -n "$VER" ] || { echo "Could not find the latest LibreOffice version."; exit 1; }',
			'case "$(uname -m)" in arm64) A=aarch64;; *) A=x86-64;; esac',
			'TMP=$(mktemp -d); curl -fsSL "https://download.documentfoundation.org/libreoffice/stable/$VER/mac/$A/LibreOffice_${VER}_MacOS_$A.dmg" -o "$TMP/lo.dmg"',
			'MNT=$(hdiutil attach "$TMP/lo.dmg" -nobrowse | grep -oE "/Volumes/.*" | tail -1)',
			'[ -d "$MNT/LibreOffice.app" ] || { echo "LibreOffice.app not found in image"; hdiutil detach "$MNT" 2>/dev/null; exit 1; }',
			'sudo cp -R "$MNT/LibreOffice.app" /Applications/',
			'hdiutil detach "$MNT"',
			'rm -rf "$TMP"',
		],
	},
];

// Claude Code document skills installed silently on first run into the shared
// ~/.claude/skills/ (these are NOT active in the local CLI otherwise). macOS/
// Linux only for now (bash + curl + tar).
const CLAUDE_SKILLS = ['xlsx', 'docx', 'pptx', 'pdf', 'skill-creator'];

function claudeSkillsDir() { return path.join(os.homedir(), '.claude', 'skills'); }
function allClaudeSkillsPresent() {
	return CLAUDE_SKILLS.every(s => {
		try { return fs.existsSync(path.join(claudeSkillsDir(), s, 'SKILL.md')); } catch (_) { return false; }
	});
}

function autoInstallClaudeSkills() {
	if (process.platform === 'win32') { return; }
	if (allClaudeSkillsPresent()) { return; }
	const script = [
		'set -e',
		'mkdir -p "$HOME/.claude/skills"',
		'TMP=$(mktemp -d)',
		'curl -fsSL -L https://github.com/anthropics/skills/archive/refs/heads/main.tar.gz | tar xz -C "$TMP"',
		'for s in ' + CLAUDE_SKILLS.join(' ') + '; do rm -rf "$HOME/.claude/skills/$s"; cp -R "$TMP/skills-main/skills/$s" "$HOME/.claude/skills/$s"; done',
		'rm -rf "$TMP"',
	].join('\n');
	vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Academic Studio: installing Claude Code document skills…' },
		() => new Promise((resolve) => {
			cp.execFile('/bin/bash', ['-lc', script], { timeout: 180000 }, (err) => {
				if (err && !allClaudeSkillsPresent()) {
					vscode.window.showWarningMessage('Could not install Claude Code document skills automatically; reload the window to retry.');
				}
				resolve();
			});
		})
	);
}
// Extra detections that aren't installable items themselves (none currently —
// node is now a full program above, used as decktape's prerequisite).
const PREREQ_DETECT = {};

function programPresetFor(audience) {
	// common for everyone, + faculty group for Faculty. optin is off by default.
	return PROGRAMS.filter(p =>
		p.group === 'common' || (audience === 'faculty' && p.group === 'faculty')
	).map(p => p.id);
}

// ---- detection -------------------------------------------------------------
function loginShellExec(command) {
	// Run through a login shell so the user's full PATH (Homebrew, /usr/local,
	// pyenv, etc.) is visible — GUI apps otherwise get a minimal PATH.
	const shell = process.env.SHELL || '/bin/zsh';
	return new Promise((resolve) => {
		cp.execFile(shell, ['-lc', command], { timeout: 8000 }, (err, stdout, stderr) => {
			const out = ((stdout || '') + (stderr || '')).trim();
			resolve({ ok: !err, out });
		});
	});
}

async function detectPrograms() {
	const result = {};
	for (const p of PROGRAMS) {
		const r = await loginShellExec(p.detect);
		result[p.id] = { found: r.ok, version: r.ok ? firstLine(r.out) : '' };
	}
	for (const id of Object.keys(PREREQ_DETECT)) {
		const r = await loginShellExec(PREREQ_DETECT[id]);
		result[id] = { found: r.ok, version: r.ok ? firstLine(r.out) : '' };
	}
	return result;
}

function firstLine(s) { return (s || '').split('\n')[0].trim(); }

// ---- install flow ----------------------------------------------------------
function buildInstallScript(orderedIds, resultsPath) {
	const lines = [
		'#!/bin/bash',
		'set +e',
		'export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"',
		'R=' + shq(resultsPath),
		': > "$R"',
		'echo "Academic Studio — installing selected programs."',
		'echo "You may be prompted for your Mac password (needed by system installers)."',
		'echo',
		'sudo -v',
		'',
	];
	for (const id of orderedIds) {
		const p = PROGRAMS.find(x => x.id === id);
		if (!p) { continue; }
		lines.push('echo "=== Installing ' + p.label + ' ==="');
		lines.push('( set -e');
		for (const l of p.installMac) { lines.push('  ' + l); }
		lines.push(')');
		lines.push('if [ $? -eq 0 ]; then echo "RESULT ' + id + ' ok" >> "$R"; else echo "RESULT ' + id + ' fail" >> "$R"; fi');
		lines.push('echo');
	}
	lines.push('echo "DONE" >> "$R"');
	lines.push('echo "All done — you can close this terminal."');
	return lines.join('\n') + '\n';
}

function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

// Resolve prereqs + ordering. Returns { ordered, skipped:[{id,reason}] }.
function planInstall(selectedIds, detected) {
	const ORDER = ['python', 'node', 'quarto', 'r', 'git', 'gh', 'tinytex', 'decktape', 'libreoffice'];
	const selected = new Set(selectedIds);
	const skipped = [];
	const ordered = [];
	for (const id of ORDER) {
		if (!selected.has(id)) { continue; }
		const p = PROGRAMS.find(x => x.id === id);
		if (p && p.prereq) {
			const have = (detected[p.prereq] && detected[p.prereq].found) || selected.has(p.prereq);
			if (!have) {
				skipped.push({ id, reason: 'needs ' + p.prereq + ' first' });
				continue;
			}
		}
		ordered.push(id);
	}
	return { ordered, skipped };
}

async function runInstall(context, panel, selectedIds, detected) {
	const plan = planInstall(selectedIds, detected);
	if (!plan.ordered.length) {
		postReport(panel, [], plan.skipped, detected);
		return;
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'as-install-'));
	const scriptPath = path.join(dir, 'install.sh');
	const resultsPath = path.join(dir, 'results.txt');
	fs.writeFileSync(scriptPath, buildInstallScript(plan.ordered, resultsPath), { mode: 0o755 });

	const term = vscode.window.createTerminal('Academic Studio — Install');
	term.show(true);
	term.sendText('bash ' + shq(scriptPath));

	// Poll the results file until DONE (or timeout ~45 min for big downloads).
	const deadline = Date.now() + 45 * 60 * 1000;
	const tick = async () => {
		let text = '';
		try { text = fs.readFileSync(resultsPath, 'utf8'); } catch (_) { /* not yet */ }
		if (text.indexOf('DONE') !== -1 || Date.now() > deadline) {
			const results = parseResults(text, plan.ordered);
			const redetect = await detectPrograms();
			postReport(panel, results, plan.skipped, redetect, Date.now() > deadline && text.indexOf('DONE') === -1);
			return;
		}
		setTimeout(tick, 1500);
	};
	setTimeout(tick, 1500);
}

function parseResults(text, orderedIds) {
	const status = {};
	(text || '').split('\n').forEach(line => {
		const m = line.match(/^RESULT (\S+) (ok|fail)$/);
		if (m) { status[m[1]] = m[2]; }
	});
	return orderedIds.map(id => ({ id, status: status[id] || 'fail' }));
}

function postReport(panel, results, skipped, detected, timedOut) {
	const rows = [];
	for (const r of results) {
		const p = PROGRAMS.find(x => x.id === r.id);
		rows.push({ id: r.id, label: p ? p.label : r.id, status: r.status,
			manualUrl: p && p.manualUrl, manualSteps: p && p.manualSteps });
	}
	for (const s of skipped) {
		const p = PROGRAMS.find(x => x.id === s.id);
		rows.push({ id: s.id, label: p ? p.label : s.id, status: 'skipped', reason: s.reason,
			manualUrl: p && p.manualUrl, manualSteps: p && p.manualSteps });
	}
	panel.webview.postMessage({ type: 'installReport', rows, detected, timedOut: !!timedOut });
}

// ---- panel -----------------------------------------------------------------
function activate(context) {
	const open = () => openSetupPanel(context);
	context.subscriptions.push(vscode.commands.registerCommand('academicStudio.openSetup', open));
	autoInstallClaudeSkills();
	if (!context.globalState.get(SETUP_DONE_KEY)) { open(); }
}

function openSetupPanel(context) {
	const panel = vscode.window.createWebviewPanel(
		'academicStudioSetup', 'Academic Studio Setup', vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true }
	);

	const stored = context.globalState.get(SELECTION_KEY) || {};
	const audience = stored.audience || 'student';
	// Currently-enabled extensions: vscode.extensions.all excludes disabled ones.
	const enabledExt = {};
	vscode.extensions.all.forEach(e => { enabledExt[(e.id || '').toLowerCase()] = true; });
	panel.webview.html = renderHtml(audience, enabledExt);

	let lastDetected = {};
	// run program detection and push statuses to the webview
	detectPrograms().then(d => { lastDetected = d; panel.webview.postMessage({ type: 'programStatus', detected: d }); });

	panel.webview.onDidReceiveMessage(async (msg) => {
		if (!msg) { return; }

		if (msg.type === 'installPrograms') {
			const ids = Array.isArray(msg.ids) ? msg.ids : [];
			if (!ids.length) { return; }
			await runInstall(context, panel, ids, lastDetected);
			return;
		}

		if (msg.type === 'apply') {
			const selectedIds = Array.isArray(msg.selected) ? msg.selected : [];
			const allIds = CATALOG.map(c => c.id);
			const toEnable = selectedIds;
			const toDisable = allIds.filter(id => selectedIds.indexOf(id) === -1);
			try {
				if (toEnable.length) { await vscode.commands.executeCommand('academicStudio.setExtensionsEnablement', toEnable, true); }
				if (toDisable.length) { await vscode.commands.executeCommand('academicStudio.setExtensionsEnablement', toDisable, false); }
			} catch (err) {
				vscode.window.showErrorMessage('Academic Studio setup could not change extensions: ' + (err && err.message ? err.message : String(err)));
				return;
			}
			await context.globalState.update(SETUP_DONE_KEY, true);
			await context.globalState.update(SELECTION_KEY, { audience: msg.audience, selected: selectedIds });
			panel.dispose();
			// Enable/disable only takes effect after a reload — do it automatically.
			await vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	}, undefined, context.subscriptions);
}

function renderHtml(audience, enabledExt) {
	const data = JSON.stringify({ catalog: CATALOG.map(c => ({ id: c.id, label: c.label, group: c.group, excludes: c.excludes || '' })), programs: PROGRAMS.map(p => ({ id: p.id, label: p.label, group: p.group, prereq: p.prereq || '', manualUrl: p.manualUrl })), audience, enabledExt });
	const extRows = CATALOG.map(c =>
		`<label class="row"><input type="checkbox" class="ext" value="${c.id}" data-excludes="${c.excludes || ''}"> <span>${c.label}</span> <em class="status" data-for="${c.id}"></em></label>`
	).join('\n');
	const progRows = PROGRAMS.map(p =>
		`<label class="row" data-id="${p.id}"><input type="checkbox" class="prog" value="${p.id}"> <span>${p.label}</span> <em class="status" data-for="${p.id}">checking…</em></label>`
	).join('\n');

	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px 32px; max-width: 760px; }
	h1 { font-size: 1.4em; margin: 0 0 4px; }
	p.sub { color: var(--vscode-descriptionForeground); margin-top: 0; }
	fieldset { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin: 20px 0; padding: 14px 18px; }
	legend { padding: 0 6px; font-weight: 600; }
	.aud { display: inline-flex; gap: 20px; } .aud label { cursor: pointer; }
	.amlabel { font-weight: 600; margin: 2px 0 8px; }
	.row { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
	.row code { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: auto; }
	.row .status { margin-left: auto; font-style: normal; font-size: 0.85em; color: var(--vscode-descriptionForeground); }
	.status.found { color: var(--vscode-testing-iconPassed, #3fb950); }
	.status.missing { color: var(--vscode-descriptionForeground); }
	button { font-family: inherit; font-size: 1em; padding: 7px 18px; border: none; border-radius: 4px;
		color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; margin-right: 10px; }
	button:hover { background: var(--vscode-button-hoverBackground); }
	button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
	.note { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
	.banner { margin: 14px 0; padding: 10px 14px; border-radius: 6px;
		border: 1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-panel-border));
		background: var(--vscode-inputValidation-warningBackground, transparent); }
	.banner.ok { border-color: var(--vscode-panel-border); background: transparent; color: var(--vscode-descriptionForeground); }
	.banner a { color: var(--vscode-textLink-foreground); font-weight: 600; }
	.signin { margin: 6px 0 18px; padding: 11px 14px; border-radius: 6px;
		border: 1px solid var(--vscode-inputValidation-infoBorder, var(--vscode-focusBorder));
		background: var(--vscode-inputValidation-infoBackground, transparent); }
	.signin code { background: var(--vscode-textCodeBlock-background); padding: 1px 5px; border-radius: 3px; }
	#report { margin-top: 14px; } #report .r { padding: 3px 0; } #report a { color: var(--vscode-textLink-foreground); }
</style></head><body>
	<h1>Welcome to Academic Studio</h1>
	<div class="signin">If you are a first-time user and not already logged in to Anthropic, sign in now — type <code>/login</code> in the prompt window to initiate the sign-in process.</div>
	<div id="topbanner" class="banner" style="display:none"></div>

	<fieldset>
		<p class="sub">Pick the profile that fits you. It just sets sensible defaults — you can change any item below, and you can remove or add extensions later. Leave checked any extensions that you want enabled. Unchecking will cause currently enabled extensions to be disabled.</p>
		<div class="amlabel">I am…</div>
		<div class="aud">
			<label><input type="radio" name="aud" value="student"> Students &amp; Professionals</label>
			<label><input type="radio" name="aud" value="faculty"> Faculty</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Extensions</legend>
		${extRows}
		<p class="note">LaTeX Workshop and the PDF viewer can't both be active (they both handle PDFs) — choosing one clears the other.</p>
		<button id="apply">Apply</button>
		<span class="note">Applying reloads the window to enable/disable extensions.</span>
	</fieldset>

	<fieldset id="programs">
		<legend>Supporting programs</legend>
		<p class="note">Programs your computer needs for some features. Only missing ones are checked. Installing runs the official installer in a terminal — you may be asked for your Mac password.</p>
		${progRows}
		<p><button id="install">Install selected programs</button></p>
		<div id="report"></div>
	</fieldset>

<script>
	const vscode = acquireVsCodeApi();
	const DATA = ${data};
	const extBoxes = Array.from(document.querySelectorAll('input.ext'));
	const progBoxes = Array.from(document.querySelectorAll('input.prog'));
	const radios = Array.from(document.querySelectorAll('input[name=aud]'));
	let detected = {};

	function extPreset(aud) { return DATA.catalog.filter(c => c.group === 'common' || c.group === aud).map(c => c.id); }
	function progPreset(aud) { return DATA.programs.filter(p => p.group === 'common' || (aud === 'faculty' && p.group === 'faculty')).map(p => p.id); }
	function setExt(ids) { extBoxes.forEach(b => { b.checked = ids.indexOf(b.value) !== -1; }); }
	function setProg(aud) {
		const pre = progPreset(aud);
		progBoxes.forEach(b => { const d = detected[b.value]; const missing = !(d && d.found); b.checked = pre.indexOf(b.value) !== -1 && missing; });
	}
	// Default extension selection = recommended-for-audience PLUS anything already
	// enabled (so Apply never disables what you have), with exclusions resolved in
	// favor of the recommended item.
	function defaultExtSel(aud) {
		const sel = new Set(extPreset(aud));
		DATA.catalog.forEach(c => {
			if (DATA.enabledExt[c.id] && !sel.has(c.id)) {
				const conflict = (c.excludes && sel.has(c.excludes)) || DATA.catalog.some(o => o.excludes === c.id && sel.has(o.id));
				if (!conflict) { sel.add(c.id); }
			}
		});
		return Array.from(sel);
	}
	function renderExtStatus() {
		DATA.catalog.forEach(c => {
			const el = document.querySelector('.status[data-for="' + c.id + '"]');
			if (!el) { return; }
			if (DATA.enabledExt[c.id]) { el.textContent = '✓ enabled'; el.className = 'status found'; }
			else { el.textContent = 'disabled'; el.className = 'status missing'; }
		});
	}

	radios.forEach(r => r.addEventListener('change', () => { setExt(defaultExtSel(r.value)); setProg(r.value); updateBanner(); }));
	extBoxes.forEach(b => b.addEventListener('change', () => {
		if (b.checked && b.dataset.excludes) { const o = extBoxes.find(x => x.value === b.dataset.excludes); if (o) o.checked = false; }
	}));

	radios.forEach(r => { r.checked = r.value === DATA.audience; });
	setExt(defaultExtSel(DATA.audience));
	renderExtStatus();

	function renderStatus() {
		DATA.programs.forEach(p => {
			const el = document.querySelector('.status[data-for="' + p.id + '"]');
			const d = detected[p.id];
			if (!el) return;
			if (d && d.found) { el.textContent = '✓ ' + (d.version || 'found'); el.className = 'status found'; }
			else { el.textContent = 'not found'; el.className = 'status missing'; }
		});
	}

	function updateBanner() {
		const banner = document.getElementById('topbanner');
		if (!Object.keys(detected).length) { banner.style.display = 'none'; return; }
		const aud = (radios.find(r => r.checked) || {}).value || 'student';
		const missing = progPreset(aud).filter(id => !(detected[id] && detected[id].found));
		banner.style.display = 'block';
		if (missing.length) {
			const labels = missing.map(id => (DATA.programs.find(p => p.id === id) || {}).label || id);
			banner.className = 'banner';
			banner.innerHTML = '⚠ ' + missing.length + ' supporting program' + (missing.length > 1 ? 's' : '') +
				' not installed yet (' + labels.join(', ') + '). <a href="#" id="jumpInstall">Set them up below ↓</a>';
			const j = document.getElementById('jumpInstall');
			if (j) { j.addEventListener('click', e => { e.preventDefault(); document.getElementById('programs').scrollIntoView({ behavior: 'smooth' }); }); }
		} else {
			banner.className = 'banner ok';
			banner.innerHTML = '✓ All recommended supporting programs are installed.';
		}
	}

	window.addEventListener('message', e => {
		const m = e.data;
		if (m.type === 'programStatus') { detected = m.detected || {}; renderStatus(); setProg((radios.find(r => r.checked) || {}).value || 'student'); updateBanner(); }
		if (m.type === 'installReport') {
			detected = m.detected || detected; renderStatus(); updateBanner();
			const rep = document.getElementById('report');
			let html = '<p class="note">' + (m.timedOut ? 'Install timed out or the terminal was closed. Re-run if needed.' : 'Install finished.') + ' A new terminal/window may be needed before some tools are callable.</p>';
			m.rows.forEach(r => {
				const icon = r.status === 'ok' ? '✓' : (r.status === 'skipped' ? '•' : '✗');
				let line = '<div class="r">' + icon + ' ' + r.label + (r.status === 'ok' ? ' — installed' : (r.status === 'skipped' ? ' — skipped (' + (r.reason || '') + ')' : ' — failed'));
				if (r.status !== 'ok' && r.manualUrl) { line += ' · <a href="' + r.manualUrl + '">install manually</a>'; }
				line += '</div>';
				html += line;
			});
			rep.innerHTML = html;
		}
	});

	document.getElementById('apply').addEventListener('click', () => {
		const aud = (radios.find(r => r.checked) || {}).value || 'faculty';
		vscode.postMessage({ type: 'apply', audience: aud, selected: extBoxes.filter(b => b.checked).map(b => b.value) });
	});
	document.getElementById('install').addEventListener('click', () => {
		const ids = progBoxes.filter(b => b.checked).map(b => b.value);
		document.getElementById('report').innerHTML = '<p class="note">Starting install in the terminal…</p>';
		vscode.postMessage({ type: 'installPrograms', ids: ids });
	});
</script>
</body></html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
