// Academic Studio Setup — first-run audience picker + extension enablement.
//
// On first launch it opens a panel: choose Faculty or Students & Professionals
// (which seeds an editable checklist of bundled extensions), then Apply enables
// the chosen extensions and disables the rest via the academicStudio.
// setExtensionsEnablement command (added by patches/common/52-*).
//
// Re-openable any time via the "Academic Studio Setup…" command.
const vscode = require('vscode');

const SETUP_DONE_KEY = 'academicStudio.setupCompleted';
const SELECTION_KEY = 'academicStudio.selection';

// Catalog of bundled extensions. `id` is the lowercase publisher.name as it
// appears in the installed-extensions list. Keep in sync with
// overlay/extensions.json.
//   group: 'common'  -> on for everyone by default
//          'faculty' -> on for Faculty by default
//          'student' -> on for Students & Professionals by default
//   excludes: id of an extension that cannot be active at the same time.
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
	// Faculty: common + faculty items. Students & Professionals: common + student.
	return CATALOG.filter(c =>
		c.group === 'common' ||
		(audience === 'faculty' ? c.group === 'faculty' : c.group === 'student')
	).map(c => c.id);
}

function activate(context) {
	const open = () => openSetupPanel(context);
	context.subscriptions.push(vscode.commands.registerCommand('academicStudio.openSetup', open));

	if (!context.globalState.get(SETUP_DONE_KEY)) {
		open();
	}
}

function openSetupPanel(context) {
	const panel = vscode.window.createWebviewPanel(
		'academicStudioSetup',
		'Academic Studio Setup',
		vscode.ViewColumn.One,
		{ enableScripts: true, retainContextWhenHidden: true }
	);

	const stored = context.globalState.get(SELECTION_KEY) || {};
	const audience = stored.audience || 'student';
	const selected = stored.selected || presetFor(audience);
	panel.webview.html = renderHtml(audience, selected);

	panel.webview.onDidReceiveMessage(async (msg) => {
		if (!msg || msg.type !== 'apply') { return; }
		const selectedIds = Array.isArray(msg.selected) ? msg.selected : [];
		const allIds = CATALOG.map(c => c.id);
		const toEnable = selectedIds;
		const toDisable = allIds.filter(id => selectedIds.indexOf(id) === -1);

		try {
			if (toEnable.length) {
				await vscode.commands.executeCommand('academicStudio.setExtensionsEnablement', toEnable, true);
			}
			if (toDisable.length) {
				await vscode.commands.executeCommand('academicStudio.setExtensionsEnablement', toDisable, false);
			}
		} catch (err) {
			vscode.window.showErrorMessage('Academic Studio setup could not change extensions: ' + (err && err.message ? err.message : String(err)));
			return;
		}

		await context.globalState.update(SETUP_DONE_KEY, true);
		await context.globalState.update(SELECTION_KEY, { audience: msg.audience, selected: selectedIds });
		panel.dispose();

		// Enabling/disabling extensions only takes effect after a window reload, so
		// reload automatically — otherwise Apply appears to do nothing (a newly
		// enabled extension like the PDF viewer won't activate until reload).
		await vscode.commands.executeCommand('workbench.action.reloadWindow');
	}, undefined, context.subscriptions);
}

function renderHtml(audience, selected) {
	const data = JSON.stringify({ catalog: CATALOG, audience, selected });
	const rows = CATALOG.map(c =>
		`<label class="row"><input type="checkbox" class="ext" value="${c.id}" data-excludes="${c.excludes || ''}"> <span>${c.label}</span> <code>${c.id}</code></label>`
	).join('\n');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 24px 32px; max-width: 720px; }
	h1 { font-size: 1.4em; margin: 0 0 4px; }
	p.sub { color: var(--vscode-descriptionForeground); margin-top: 0; }
	fieldset { border: 1px solid var(--vscode-panel-border); border-radius: 6px; margin: 20px 0; padding: 14px 18px; }
	legend { padding: 0 6px; font-weight: 600; }
	.aud { display: inline-flex; gap: 20px; }
	.aud label { cursor: pointer; }
	.row { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
	.row code { color: var(--vscode-descriptionForeground); font-size: 0.85em; margin-left: auto; }
	button { font-family: inherit; font-size: 1em; padding: 7px 18px; border: none; border-radius: 4px;
		color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
	button:hover { background: var(--vscode-button-hoverBackground); }
	.note { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
</style>
</head>
<body>
	<h1>Welcome to Academic Studio</h1>
	<p class="sub">Pick the profile that fits you. It just sets sensible defaults — you can change any item below, and you can remove or add extensions later.</p>

	<fieldset>
		<legend>I am…</legend>
		<div class="aud">
			<label><input type="radio" name="aud" value="student"> Students &amp; Professionals</label>
			<label><input type="radio" name="aud" value="faculty"> Faculty</label>
		</div>
	</fieldset>

	<fieldset>
		<legend>Active extensions</legend>
		${rows}
		<p class="note">LaTeX Workshop and the PDF viewer can't both be active (they both handle PDFs) — choosing one clears the other.</p>
	</fieldset>

	<button id="apply">Apply</button>

<script>
	const vscode = acquireVsCodeApi();
	const DATA = ${data};
	const boxes = Array.from(document.querySelectorAll('input.ext'));
	const radios = Array.from(document.querySelectorAll('input[name=aud]'));

	function presetFor(aud) {
		return DATA.catalog.filter(c => c.group === 'common' || c.group === aud).map(c => c.id);
	}
	function setSelection(ids) {
		boxes.forEach(b => { b.checked = ids.indexOf(b.value) !== -1; });
	}
	radios.forEach(r => r.addEventListener('change', () => setSelection(presetFor(r.value))));
	boxes.forEach(b => b.addEventListener('change', () => {
		if (b.checked && b.dataset.excludes) {
			const other = boxes.find(x => x.value === b.dataset.excludes);
			if (other) { other.checked = false; }
		}
	}));

	// initial state
	radios.forEach(r => { r.checked = r.value === DATA.audience; });
	setSelection(DATA.selected);

	document.getElementById('apply').addEventListener('click', () => {
		const aud = (radios.find(r => r.checked) || {}).value || 'faculty';
		const selected = boxes.filter(b => b.checked).map(b => b.value);
		vscode.postMessage({ type: 'apply', audience: aud, selected: selected });
	});
</script>
</body>
</html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
