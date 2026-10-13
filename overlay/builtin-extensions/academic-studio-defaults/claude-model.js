// Claude → Model… — run Claude Code on Anthropic's models (the default) or on a
// model served by Ollama, either on this computer or in Ollama Cloud.
//
// Ollama speaks the Anthropic Messages API (v0.14+), so Claude Code itself is
// unchanged: only its environment moves. The switch is written to the `env`
// block of ~/.claude/settings.json, which both the panel and a terminal `claude`
// read, plus claudeCode.disableLoginPrompt so the panel stops asking for an
// Anthropic sign-in it no longer needs. Only the keys in ENV_KEYS are touched,
// and whatever they held before is kept in globalState and put back when the
// user returns to Anthropic.
//
// Why this is an extension and not core (where the rest of the Claude menu
// lives, patch 55): the workbench CSP allows connect-src https: only, so core
// cannot reach http://127.0.0.1:11434. The cost is that this runs in the LOCAL
// extension host, so it refuses in a Remote-SSH window, where Claude Code runs
// on the host and reads the host's ~/.claude.
//
// Local models get a derived copy, academic-studio/<name>, with num_ctx raised
// to CONTEXT_LENGTH. Ollama's default context is 4k below 24 GB of VRAM, and
// Claude Code's system prompt alone is larger than that; a too-small window
// truncates it silently and the agent looks broken. The copy shares the
// original's weights, so creating it is instant and costs no disk.
const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// 127.0.0.1, not localhost: Ollama listens on IPv4 only, and localhost can
// resolve to ::1 first.
const OLLAMA_URL = 'http://127.0.0.1:11434';
const CONTEXT_LENGTH = 65536;
const DERIVED_PREFIX = 'academic-studio/';
const ENV_KEYS = [
	'ANTHROPIC_BASE_URL',
	'ANTHROPIC_AUTH_TOKEN',
	'ANTHROPIC_API_KEY',
	'ANTHROPIC_MODEL',
	'ANTHROPIC_DEFAULT_OPUS_MODEL',
	'ANTHROPIC_DEFAULT_SONNET_MODEL',
	'ANTHROPIC_DEFAULT_HAIKU_MODEL',
	'CLAUDE_CODE_SUBAGENT_MODEL',
];
const BACKUP_KEY = 'academicStudio.claudeModel.previousEnv';
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download';
const CLOUD_MODELS_URL = 'https://ollama.com/search?c=cloud';

// Offered under "Download a model…". All support tool calls, which Claude Code
// needs. minGB is the RAM below which a local model is too big to recommend.
// Ollama retires cloud models and moves them in and out of its free plan, so
// the cloud entry needs checking now and then: gpt-oss:120b-cloud worked on a
// free account in October 2026 (kimi-k2.7-code and glm-5.3-flash did not).
const SUGGESTED = [
	{ name: 'qwen3.5:4b', size: '3.3 GB', minGB: 8, detail: 'Small and quick. For computers with 8–16 GB of memory.' },
	{ name: 'qwen3.5:9b', size: '6.6 GB', minGB: 16, detail: 'A good balance. For computers with 16–48 GB of memory.' },
	{ name: 'qwen3.5:35b-a3b', size: '22 GB', minGB: 48, detail: 'The most capable local choice. Needs 48 GB of memory or more.' },
	{ name: 'gpt-oss:120b-cloud', size: 'cloud', cloud: true, detail: 'Runs in Ollama Cloud, so it is fast on any computer. Needs a free ollama.com account.' },
];

// ---- Ollama HTTP API -----------------------------------------------------------

async function ollama(route, body, timeoutMs) {
	const ctl = new AbortController();
	const t = setTimeout(() => ctl.abort(), timeoutMs || 5000);
	try {
		const res = await fetch(OLLAMA_URL + route, body === undefined
			? { signal: ctl.signal }
			: { method: 'POST', body: JSON.stringify(body), signal: ctl.signal, headers: { 'Content-Type': 'application/json' } });
		const text = await res.text();
		let data = null;
		try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
		if (!res.ok) {
			throw new Error((data && data.error) || ('Ollama returned ' + res.status));
		}
		return data;
	} finally {
		clearTimeout(t);
	}
}

async function ollamaRunning() {
	try { await ollama('/api/version'); return true; } catch (e) { return false; }
}

function isCloud(model) {
	return !!model.remote_host || /[:-]cloud$/.test(model.name);
}

// Models Claude Code can drive: chat models with tool calling. Embedding models
// and our own academic-studio/* copies are left out.
async function listModels() {
	const tags = await ollama('/api/tags');
	const models = ((tags && tags.models) || []).filter(m => !m.name.startsWith(DERIVED_PREFIX));
	const shown = await Promise.all(models.map(m =>
		ollama('/api/show', { model: m.name }, 10000).catch(() => null)));
	return models
		.map((m, i) => ({ name: m.name, size: m.size, cloud: isCloud(m), capabilities: (shown[i] && shown[i].capabilities) || [] }))
		.filter(m => m.capabilities.includes('tools'));
}

// ---- starting Ollama -------------------------------------------------------------

function ollamaAppPath() {
	if (process.platform === 'darwin') {
		return fs.existsSync('/Applications/Ollama.app') ? '/Applications/Ollama.app' : null;
	}
	if (process.platform === 'win32') {
		const exe = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe');
		return fs.existsSync(exe) ? exe : null;
	}
	return null;
}

// Make sure the Ollama server is up, starting the app if it is installed but not
// running. Returns false (after telling the user what to do) if it can't be.
async function ensureOllama() {
	if (await ollamaRunning()) { return true; }
	const app = ollamaAppPath();
	if (!app) {
		const pick = await vscode.window.showInformationMessage(
			'Ollama is not installed. Ollama runs AI models on your own computer, or in Ollama Cloud. '
			+ 'Install it from Run Setup (Help → Run Setup…, under Supporting programs), then choose Claude → Model… again.',
			{ modal: true }, 'Open Run Setup', 'Download Ollama');
		if (pick === 'Open Run Setup') { vscode.commands.executeCommand('academicStudio.openSetup'); }
		if (pick === 'Download Ollama') { vscode.env.openExternal(vscode.Uri.parse(OLLAMA_DOWNLOAD_URL)); }
		return false;
	}
	try {
		if (process.platform === 'darwin') {
			cp.spawn('open', ['-a', app], { detached: true, stdio: 'ignore' }).unref();
		} else {
			cp.spawn(app, [], { detached: true, stdio: 'ignore' }).unref();
		}
	} catch (e) { /* fall through to the wait, which reports the failure */ }
	const up = await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: 'Starting Ollama…' },
		async () => {
			for (let i = 0; i < 30; i++) {
				if (await ollamaRunning()) { return true; }
				await new Promise(r => setTimeout(r, 1000));
			}
			return false;
		});
	if (!up) {
		vscode.window.showErrorMessage('Ollama did not start. Open the Ollama app yourself, then choose Claude → Model… again.');
	}
	return up;
}

// ---- downloading a model -----------------------------------------------------------

// The Mac app only links `ollama` into /usr/local/bin if the user accepts its
// first-launch prompt, so call the binary inside the app directly.
function signInToOllama() {
	const macCli = '/Applications/Ollama.app/Contents/Resources/ollama';
	const cli = process.platform === 'darwin' && fs.existsSync(macCli) ? "'" + macCli + "'" : 'ollama';
	const term = vscode.window.createTerminal('Ollama sign-in');
	term.show();
	term.sendText(cli + ' signin');
}

// Pull with a progress notification. Returns true when the model is ready.
async function pullModel(name) {
	const ctl = new AbortController();
	try {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Downloading ' + name, cancellable: true },
			async (progress, token) => {
				token.onCancellationRequested(() => ctl.abort());
				const res = await fetch(OLLAMA_URL + '/api/pull', {
					method: 'POST', body: JSON.stringify({ model: name, stream: true }), signal: ctl.signal,
					headers: { 'Content-Type': 'application/json' },
				});
				if (!res.ok || !res.body) {
					let msg = 'Ollama returned ' + res.status;
					try { msg = JSON.parse(await res.text()).error || msg; } catch (e) { /* keep status */ }
					throw new Error(msg);
				}
				// Newline-delimited JSON: {status, digest?, total?, completed?} per line,
				// or {error} if the pull fails part-way.
				const decoder = new TextDecoder();
				let buf = '';
				let reported = 0;
				for await (const chunk of res.body) {
					buf += decoder.decode(chunk, { stream: true });
					let nl;
					while ((nl = buf.indexOf('\n')) >= 0) {
						const line = buf.slice(0, nl).trim();
						buf = buf.slice(nl + 1);
						if (!line) { continue; }
						const msg = JSON.parse(line);
						if (msg.error) { throw new Error(msg.error); }
						if (msg.total && msg.completed !== undefined) {
							const pct = Math.floor(100 * msg.completed / msg.total);
							progress.report({ message: pct + '%', increment: Math.max(0, pct - reported) });
							reported = pct;
						} else if (msg.status) {
							progress.report({ message: msg.status });
						}
					}
				}
			});
		return true;
	} catch (e) {
		if (ctl.signal.aborted) { return false; }
		const msg = (e && e.message) || String(e);
		if (/unauthori[sz]ed|sign ?in|401/i.test(msg)) {
			const pick = await vscode.window.showErrorMessage(
				'Ollama Cloud models need an ollama.com account. Sign in, then download the model again.',
				'Sign In to Ollama');
			if (pick) { signInToOllama(); }
		} else {
			vscode.window.showErrorMessage('Could not download ' + name + ': ' + msg);
		}
		return false;
	}
}

// Returns the name of a model ready to use, or undefined if the user backed out.
async function chooseDownload() {
	const memGB = os.totalmem() / 2 ** 30;
	// The largest suggestion that fits is the recommendation.
	const fits = SUGGESTED.filter(s => !s.cloud && memGB >= s.minGB - 1);
	const best = fits.length ? fits[fits.length - 1].name : SUGGESTED[0].name;
	const items = SUGGESTED.map(s => ({
		label: s.name,
		description: s.size + (s.name === best ? ' · recommended for this computer' : ''),
		detail: s.detail,
		model: s.name,
	}));
	items.push(
		{ label: '', kind: vscode.QuickPickItemKind.Separator },
		{ label: 'Another model…', detail: 'Type the name of any Ollama model that supports tools. For an Ollama Cloud model, add :cloud (for example kimi-k2.7-code:cloud).', other: true },
		{ label: 'Browse Ollama Cloud models', detail: 'ollama.com — cloud models run on Ollama\'s servers. Some are included in the free plan; others need paid usage.', browse: true });
	const picked = await vscode.window.showQuickPick(items, {
		title: 'Download a Model',
		placeHolder: 'This computer has ' + Math.round(memGB) + ' GB of memory. Larger models are more capable but slower.',
	});
	if (!picked) { return undefined; }
	if (picked.browse) {
		vscode.env.openExternal(vscode.Uri.parse(CLOUD_MODELS_URL));
		return undefined;
	}
	let name = picked.model;
	if (picked.other) {
		name = (await vscode.window.showInputBox({
			title: 'Download a Model',
			prompt: 'Model name as shown on ollama.com',
			placeHolder: 'kimi-k2.7-code:cloud',
		}) || '').trim();
		if (!name) { return undefined; }
	}
	return (await pullModel(name)) ? name : undefined;
}

// ---- ~/.claude/settings.json ---------------------------------------------------------

function settingsPath() { return path.join(os.homedir(), '.claude', 'settings.json'); }

// undefined if the file is missing; throws if it exists but is not valid JSON,
// so a hand-edited file is never overwritten.
function readSettings() {
	let text;
	try { text = fs.readFileSync(settingsPath(), 'utf8'); } catch (e) { return undefined; }
	if (!text.trim()) { return undefined; }
	return JSON.parse(text);
}

function writeSettings(settings) {
	fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
	fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
}

function isOurs(env) {
	return !!env && env.ANTHROPIC_BASE_URL === OLLAMA_URL;
}

function displayName(model) {
	return model && model.startsWith(DERIVED_PREFIX) ? model.slice(DERIVED_PREFIX.length) : model;
}

// The model Claude currently uses: 'anthropic', the Ollama model's name, or
// 'other' when settings.json points Claude at a provider we did not set up.
function currentChoice(settings) {
	const env = (settings && settings.env) || {};
	if (isOurs(env)) { return displayName(env.ANTHROPIC_MODEL); }
	return env.ANTHROPIC_BASE_URL ? 'other' : 'anthropic';
}

async function applyEnv(context, settings, values) {
	const s = settings || {};
	const env = Object.assign({}, s.env);
	// Remember what the user had before the first switch away from Anthropic, so
	// going back restores it rather than deleting it.
	if (values && !isOurs(env)) {
		const before = {};
		for (const k of ENV_KEYS) { if (k in env) { before[k] = env[k]; } }
		await context.globalState.update(BACKUP_KEY, before);
	}
	for (const k of ENV_KEYS) { delete env[k]; }
	if (values) {
		Object.assign(env, values);
	} else {
		Object.assign(env, context.globalState.get(BACKUP_KEY) || {});
		await context.globalState.update(BACKUP_KEY, undefined);
	}
	if (Object.keys(env).length) { s.env = env; } else { delete s.env; }
	writeSettings(s);
	await vscode.workspace.getConfiguration('claudeCode').update(
		'disableLoginPrompt', values ? true : undefined, vscode.ConfigurationTarget.Global);
}

// Ollama Cloud models need the local Ollama to be signed in to ollama.com.
async function signedIn() {
	try { await ollama('/api/me', {}, 10000); return true; } catch (e) { return false; }
}

// Returns false if the switch did not happen.
async function useOllamaModel(context, settings, model) {
	let target = model.name;
	if (model.cloud && !(await signedIn())) {
		const pick = await vscode.window.showErrorMessage(
			'Ollama Cloud models need an ollama.com account, and Ollama is not signed in. Sign in, then choose the model again.',
			'Sign In to Ollama');
		if (pick) { signInToOllama(); }
		return false;
	}
	if (!model.cloud) {
		// Recreated every time: instant, and it follows the original if the user
		// has since pulled a newer version of it.
		target = DERIVED_PREFIX + model.name;
		await ollama('/api/create', { model: target, from: model.name, parameters: { num_ctx: CONTEXT_LENGTH }, stream: false }, 60000);
	}
	await applyEnv(context, settings, {
		ANTHROPIC_BASE_URL: OLLAMA_URL,
		ANTHROPIC_AUTH_TOKEN: 'ollama',
		ANTHROPIC_API_KEY: '',
		ANTHROPIC_MODEL: target,
		// Claude Code also calls models by tier (Haiku for small background tasks,
		// subagents, plan mode); Ollama has none of those names, so map them all.
		ANTHROPIC_DEFAULT_OPUS_MODEL: target,
		ANTHROPIC_DEFAULT_SONNET_MODEL: target,
		ANTHROPIC_DEFAULT_HAIKU_MODEL: target,
		CLAUDE_CODE_SUBAGENT_MODEL: target,
	});
	return true;
}

async function announce(text) {
	const pick = await vscode.window.showInformationMessage(
		text + ' This applies to new chats; a chat that is already open keeps its model.', 'New Chat');
	if (pick) { vscode.commands.executeCommand('academicStudio.claudeNewChat'); }
}

function formatSize(bytes) {
	return bytes ? (bytes / 1e9).toFixed(1) + ' GB' : '';
}

// ---- the command -------------------------------------------------------------------

async function chooseModel(context) {
	if (vscode.env.remoteName) {
		vscode.window.showWarningMessage(
			'Claude → Model… works only in a local window. In a remote window, Claude runs on the remote computer and uses its settings there.');
		return;
	}

	let settings;
	try {
		settings = readSettings();
	} catch (e) {
		const pick = await vscode.window.showErrorMessage(
			'~/.claude/settings.json is not valid JSON, so the model cannot be changed safely. Fix the file, then try again.',
			'Open settings.json');
		if (pick) { vscode.window.showTextDocument(vscode.Uri.file(settingsPath())); }
		return;
	}
	const current = currentChoice(settings);

	const running = await ollamaRunning();
	let models = [];
	if (running) {
		try { models = await listModels(); } catch (e) { /* show the menu without them */ }
	}
	const tag = (on) => on ? 'current' : '';
	const items = [{
		label: 'Claude (Anthropic)',
		description: tag(current === 'anthropic'),
		detail: 'Anthropic\'s models, through your Claude account. The most capable choice.',
		anthropic: true,
	}];
	const local = models.filter(m => !m.cloud);
	const cloud = models.filter(m => m.cloud);
	if (local.length) {
		items.push({ label: 'On this computer (Ollama)', kind: vscode.QuickPickItemKind.Separator });
		for (const m of local) {
			items.push({ label: m.name, description: [formatSize(m.size), tag(current === m.name)].filter(Boolean).join(' · '), model: m });
		}
	}
	if (cloud.length) {
		items.push({ label: 'Ollama Cloud', kind: vscode.QuickPickItemKind.Separator });
		for (const m of cloud) {
			items.push({ label: m.name, description: tag(current === m.name), model: m });
		}
	}
	items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
	items.push(running
		? { label: 'Download a model…', detail: 'Get a model that runs on this computer, or one from Ollama Cloud.', download: true }
		: { label: 'Use Ollama…', detail: 'Free models that run on this computer, or in Ollama Cloud. Slower and less capable than Claude.', download: true });

	const picked = await vscode.window.showQuickPick(items, {
		title: 'Claude Model',
		placeHolder: current === 'other'
			? 'Claude is set up for another provider in ~/.claude/settings.json. Choosing here replaces that.'
			: 'Which model should Claude use?',
	});
	if (!picked) { return; }

	try {
		if (picked.anthropic) {
			if (current === 'anthropic') { return; }
			if (current === 'other') {
				vscode.window.showInformationMessage('Claude is set up for another provider in ~/.claude/settings.json, which was not made here. Edit that file to change it.');
				return;
			}
			await applyEnv(context, settings, null);
			await announce('Claude now uses Anthropic\'s models. If it asks you to sign in, type /login in the chat.');
			return;
		}

		let model = picked.model;
		if (picked.download && !running) {
			// Start (or install) Ollama, then show the list again with its models.
			if (await ensureOllama()) { await chooseModel(context); }
			return;
		}
		if (picked.download) {
			const name = await chooseDownload();
			if (!name) { return; }
			model = (await listModels()).find(m => m.name === name || m.name === name + ':latest');
			if (!model) {
				vscode.window.showErrorMessage(name + ' was downloaded, but it does not support tools, so Claude cannot use it. Choose another model.');
				return;
			}
		}
		if (model.name === current) { return; }
		if (!(await useOllamaModel(context, settings, model))) { return; }
		await announce('Claude now uses ' + model.name + (model.cloud ? ' in Ollama Cloud.' : ' on this computer.'));
	} catch (e) {
		vscode.window.showErrorMessage('Could not change the model: ' + ((e && e.message) || e));
	}
}

function register(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('academicStudio.claudeModel', () => chooseModel(context)));
}

module.exports = { register };
